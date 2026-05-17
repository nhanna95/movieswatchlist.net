import logging
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, text, bindparam
from csv_parser import parse_tracked_list_csv
from database import filename_to_column_name
from models import Movie
from utils import get_project_root
import re

logger = logging.getLogger(__name__)

BULK_UPDATE_CHUNK_SIZE = 500

# movie_id lookup indexes built from the database
MovieLookup = Tuple[Dict[str, int], Dict[Tuple[str, int], int]]


def normalize_title(title: str) -> str:
    """
    Normalize movie title for matching.
    - Convert to lowercase
    - Remove special characters (keep alphanumeric and spaces)
    - Remove leading articles (The, A, An)
    - Trim whitespace
    """
    if not title:
        return ""

    normalized = title.lower().strip()

    articles = ['the ', 'a ', 'an ']
    for article in articles:
        if normalized.startswith(article):
            normalized = normalized[len(article):].strip()

    normalized = re.sub(r'[^a-z0-9\s]', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    return normalized


def normalize_uri(uri: str) -> str:
    """
    Normalize Letterboxd URI for comparison.
    Handles both full URLs (https://boxd.it/xxx) and just the path.
    """
    if not uri:
        return ""
    uri = uri.strip()
    if uri.startswith('http'):
        if 'boxd.it/' in uri:
            uri = uri.split('boxd.it/')[-1]
        elif 'letterboxd.com/' in uri:
            uri = uri.split('letterboxd.com/')[-1]
    return uri


def build_movie_lookup(db: Session) -> MovieLookup:
    """Load all movies once into O(1) lookup maps."""
    uri_to_id: Dict[str, int] = {}
    title_year_to_id: Dict[Tuple[str, int], int] = {}

    rows = db.query(
        Movie.id, Movie.letterboxd_uri, Movie.title, Movie.year
    ).all()

    for movie_id, letterboxd_uri, title, year in rows:
        if letterboxd_uri:
            norm_uri = normalize_uri(letterboxd_uri)
            if norm_uri and norm_uri not in uri_to_id:
                uri_to_id[norm_uri] = movie_id
        if title and year:
            key = (normalize_title(title), year)
            if key not in title_year_to_id:
                title_year_to_id[key] = movie_id

    logger.debug(
        f"Built movie lookup: {len(uri_to_id)} URIs, {len(title_year_to_id)} title+year keys"
    )
    return uri_to_id, title_year_to_id


def lookup_movie_id(
    movie_data: Dict,
    uri_to_id: Dict[str, int],
    title_year_to_id: Dict[Tuple[str, int], int],
) -> Optional[int]:
    """Resolve a list CSV row to a watchlist movie id using in-memory indexes."""
    uri = movie_data.get('letterboxd_uri')
    if uri:
        norm_uri = normalize_uri(uri)
        if norm_uri in uri_to_id:
            return uri_to_id[norm_uri]

    name = movie_data.get('name')
    year = movie_data.get('year')
    if name and year:
        key = (normalize_title(name), year)
        return title_year_to_id.get(key)

    return None


def build_list_indexes(movies_data: List[Dict]) -> Tuple[Set[str], Set[Tuple[str, int]]]:
    """Pre-index a tracked list for O(1) membership checks per movie."""
    uri_set: Set[str] = set()
    title_year_set: Set[Tuple[str, int]] = set()

    for entry in movies_data:
        uri = entry.get('letterboxd_uri')
        if uri:
            norm_uri = normalize_uri(uri)
            if norm_uri:
                uri_set.add(norm_uri)
        name = entry.get('name')
        year = entry.get('year')
        if name and year:
            title_year_set.add((normalize_title(name), year))

    return uri_set, title_year_set


def bulk_set_column(db: Session, column_name: str, movie_ids: Set[int]) -> None:
    """Set is_* column to 1 for all matched movie ids (chunked IN updates)."""
    if not movie_ids:
        return

    id_list = list(movie_ids)
    stmt = text(
        f"UPDATE movies SET {column_name} = 1 WHERE id IN :ids"
    ).bindparams(bindparam("ids", expanding=True))

    for i in range(0, len(id_list), BULK_UPDATE_CHUNK_SIZE):
        chunk = id_list[i:i + BULK_UPDATE_CHUNK_SIZE]
        db.execute(stmt, {"ids": chunk})


def match_movie_by_uri(db: Session, letterboxd_uri: str, lookup: MovieLookup = None) -> Optional[Movie]:
    """
    Match movie by Letterboxd URI. Uses in-memory lookup when provided.
    """
    if not letterboxd_uri:
        return None

    if lookup is not None:
        uri_to_id, _ = lookup
        norm = normalize_uri(letterboxd_uri)
        movie_id = uri_to_id.get(norm) if norm else None
        if movie_id is not None:
            return db.query(Movie).filter(Movie.id == movie_id).first()
        return None

    movie = db.query(Movie).filter(Movie.letterboxd_uri == letterboxd_uri).first()
    if movie:
        return movie

    normalized_input = normalize_uri(letterboxd_uri)
    if not normalized_input:
        return None

    uri_to_id, _ = build_movie_lookup(db)
    movie_id = uri_to_id.get(normalized_input)
    if movie_id is not None:
        return db.query(Movie).filter(Movie.id == movie_id).first()
    return None


def match_movie_by_title_year(
    db: Session, title: str, year: int, lookup: MovieLookup = None
) -> Optional[Movie]:
    """Match movie by normalized title and year."""
    if not title or not year:
        return None

    if lookup is not None:
        _, title_year_to_id = lookup
        movie_id = title_year_to_id.get((normalize_title(title), year))
        if movie_id is not None:
            return db.query(Movie).filter(Movie.id == movie_id).first()
        return None

    normalized_title = normalize_title(title)

    movies = db.query(Movie).filter(
        func.lower(Movie.title) == title.lower(),
        Movie.year == year
    ).all()

    if len(movies) == 1:
        return movies[0]

    all_movies = db.query(Movie).filter(Movie.year == year).all()
    for movie in all_movies:
        if normalize_title(movie.title) == normalized_title:
            return movie

    return None


def load_tracked_lists(tracked_lists_dir: Path = None) -> Dict[str, Dict]:
    """
    Load all tracked lists into memory with pre-built indexes for matching.

    Returns:
        Dictionary mapping column names to list metadata including uri_set and title_year_set
    """
    if tracked_lists_dir is None:
        project_root = get_project_root()
        tracked_lists_dir = project_root / "tracked-lists"

    if not tracked_lists_dir.exists():
        return {}

    tracked_lists = {}
    for csv_file in tracked_lists_dir.glob("*.csv"):
        try:
            list_name = csv_file.stem
            column_name = filename_to_column_name(csv_file.name)
            movies_data = parse_tracked_list_csv(str(csv_file))
            uri_set, title_year_set = build_list_indexes(movies_data)
            tracked_lists[column_name] = {
                'name': list_name,
                'movies': movies_data,
                'uri_set': uri_set,
                'title_year_set': title_year_set,
            }
            logger.info(f"Loaded tracked list {list_name} with {len(movies_data)} movies")
        except Exception as e:
            logger.warning(f"Error loading tracked list {csv_file.name}: {str(e)}")
            continue

    return tracked_lists


def check_movie_in_tracked_lists(movie: Movie, tracked_lists: Dict[str, Dict]) -> None:
    """
    Check if a movie is in any tracked list and update its list memberships.
    Uses pre-built uri_set / title_year_set indexes (O(number of lists)).
    """
    if not tracked_lists:
        return

    movie_uri = normalize_uri(movie.letterboxd_uri) if movie.letterboxd_uri else None
    movie_title_year = None
    if movie.title and movie.year:
        movie_title_year = (normalize_title(movie.title), movie.year)

    for column_name, list_data in tracked_lists.items():
        try:
            list_name = list_data['name']
            uri_set = list_data.get('uri_set') or set()
            title_year_set = list_data.get('title_year_set') or set()

            is_in_list = False
            if movie_uri and movie_uri in uri_set:
                is_in_list = True
                logger.debug(f"URI match: {movie.title} ({movie.year}) in {list_name}")
            elif movie_title_year and movie_title_year in title_year_set:
                is_in_list = True
                logger.debug(f"Title+Year match: {movie.title} ({movie.year}) in {list_name}")

            if is_in_list:
                try:
                    setattr(movie, column_name, True)
                    logger.debug(f"Movie '{movie.title}' ({movie.year}) matched to list '{list_name}'")
                except AttributeError:
                    logger.warning(
                        f"Column {column_name} not found as attribute, trying direct update for {movie.title}"
                    )
                    try:
                        from database import engine
                        with engine.connect() as conn:
                            conn.execute(
                                text(f"UPDATE movies SET {column_name} = 1 WHERE id = :id"),
                                {"id": movie.id},
                            )
                            conn.commit()
                    except Exception as e2:
                        logger.error(f"Error updating {column_name} for {movie.title}: {str(e2)}")
                except Exception as e:
                    logger.error(f"Error setting {column_name} for {movie.title}: {str(e)}", exc_info=True)

        except Exception as e:
            logger.warning(f"Error checking movie in list {list_data.get('name')}: {str(e)}", exc_info=True)
            continue


def process_tracked_list_data(
    db: Session,
    movies_data: List[Dict],
    list_name: str,
    column_name: str,
    lookup: MovieLookup,
    commit: bool = True,
) -> Dict[str, int]:
    """Match pre-parsed list rows to watchlist movies and bulk-update the list column."""
    uri_to_id, title_year_to_id = lookup

    try:
        total = len(movies_data)
        matched_ids: Set[int] = set()
        unmatched = []

        for movie_data in movies_data:
            movie_id = lookup_movie_id(movie_data, uri_to_id, title_year_to_id)
            if movie_id is not None:
                matched_ids.add(movie_id)
            else:
                unmatched.append({
                    'name': movie_data.get('name', 'Unknown'),
                    'year': movie_data.get('year'),
                    'uri': movie_data.get('letterboxd_uri'),
                })
                logger.debug(
                    f"Could not match movie: {movie_data.get('name', 'Unknown')} "
                    f"({movie_data.get('year', 'N/A')})"
                )

        bulk_set_column(db, column_name, matched_ids)
        matched = len(matched_ids)

        if commit:
            db.commit()

        logger.info(
            f"List '{list_name}': {matched}/{total} movies matched. "
            f"{len(unmatched)} unmatched."
        )

        return {
            'total': total,
            'matched': matched,
            'unmatched': len(unmatched),
            'unmatched_movies': unmatched,
        }

    except Exception as e:
        logger.error(f"Error processing list {list_name}: {str(e)}", exc_info=True)
        if commit:
            db.rollback()
        raise


def process_tracked_list(
    db: Session,
    csv_file_path: Path,
    list_name: str,
    column_name: str,
    lookup: MovieLookup,
    commit: bool = True,
) -> Dict[str, int]:
    """Process a single tracked list CSV file using in-memory lookup and bulk UPDATE."""
    logger.info(f"Processing tracked list: {list_name} from {csv_file_path}")
    movies_data = parse_tracked_list_csv(str(csv_file_path))
    return process_tracked_list_data(
        db, movies_data, list_name, column_name, lookup, commit=commit
    )


def process_all_tracked_lists(db: Session, tracked_lists_dir: Path = None):
    """
    Process all CSV files in the tracked-lists directory.
    Generator that yields progress updates during processing.
    """
    if tracked_lists_dir is None:
        project_root = get_project_root()
        tracked_lists_dir = project_root / "tracked-lists"

    if not tracked_lists_dir.exists():
        logger.warning(f"Tracked lists directory not found: {tracked_lists_dir}")
        yield {'results': {}, 'type': 'complete'}
        return

    logger.info("Resetting all tracked list columns to False")
    csv_files = list(tracked_lists_dir.glob("*.csv"))
    tracked_list_columns = [filename_to_column_name(f.name) for f in csv_files]

    for column_name in tracked_list_columns:
        try:
            db.execute(text(f"UPDATE movies SET {column_name} = 0"))
        except Exception as e:
            logger.warning(f"Could not reset column {column_name}: {e}")

    lookup = build_movie_lookup(db)
    loaded_lists = load_tracked_lists(tracked_lists_dir)

    results = {}
    sorted_csv_files = sorted(csv_files)
    total_lists = len(sorted_csv_files)

    try:
        for i, csv_file in enumerate(sorted_csv_files):
            list_name = csv_file.stem
            column_name = filename_to_column_name(csv_file.name)
            list_data = loaded_lists.get(column_name)
            movies_data = list_data['movies'] if list_data else parse_tracked_list_csv(str(csv_file))

            try:
                logger.info(f"Processing tracked list: {list_name}")
                result = process_tracked_list_data(
                    db, movies_data, list_name, column_name, lookup, commit=False
                )
                results[list_name] = result
                yield {
                    'list_name': list_name,
                    'current': i + 1,
                    'total': total_lists,
                    'matched': result.get('matched', 0),
                    'type': 'progress',
                }
            except Exception as e:
                logger.error(f"Failed to process {list_name}: {str(e)}")
                results[list_name] = {
                    'error': str(e),
                    'total': 0,
                    'matched': 0,
                    'unmatched': 0,
                }
                yield {
                    'list_name': list_name,
                    'current': i + 1,
                    'total': total_lists,
                    'matched': 0,
                    'type': 'progress',
                }

        db.commit()
    except Exception:
        db.rollback()
        raise

    yield {'results': results, 'type': 'complete'}
