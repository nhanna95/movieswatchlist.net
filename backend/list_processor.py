import logging
from pathlib import Path
from typing import Dict, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, text
from csv_parser import parse_tracked_list_csv
from database import filename_to_column_name
from models import Movie
from utils import get_project_root
import re

logger = logging.getLogger(__name__)

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
    
    # Convert to lowercase
    normalized = title.lower().strip()
    
    # Remove leading articles
    articles = ['the ', 'a ', 'an ']
    for article in articles:
        if normalized.startswith(article):
            normalized = normalized[len(article):].strip()
    
    # Remove special characters, keep alphanumeric and spaces
    normalized = re.sub(r'[^a-z0-9\s]', '', normalized)
    
    # Normalize whitespace
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    return normalized

def match_movie_by_uri(db: Session, letterboxd_uri: str) -> Movie:
    """
    Match movie by Letterboxd URI. Tries exact match first, then normalized comparison
    so that list URLs (e.g. https://letterboxd.com/film/foo/) match DB values stored
    as path (film/foo/) or vice versa.
    """
    if not letterboxd_uri:
        return None
    
    movie = db.query(Movie).filter(Movie.letterboxd_uri == letterboxd_uri).first()
    if movie:
        return movie

    normalized_input = normalize_uri(letterboxd_uri)
    if not normalized_input:
        return None
    movie = db.query(Movie).filter(Movie.letterboxd_uri == normalized_input).first()
    if movie:
        return movie

    # Fallback: find movie whose stored URI normalizes to same value (e.g. list has full URL, DB has path)
    candidates = db.query(Movie).filter(Movie.letterboxd_uri.isnot(None)).limit(5000).all()
    for m in candidates:
        if normalize_uri(m.letterboxd_uri) == normalized_input:
            return m
    return None

def match_movie_by_title_year(db: Session, title: str, year: int) -> Movie:
    """
    Match movie by normalized title and year.
    """
    if not title or not year:
        return None
    
    normalized_title = normalize_title(title)
    
    # Try exact match first (case-insensitive)
    movies = db.query(Movie).filter(
        func.lower(Movie.title) == title.lower(),
        Movie.year == year
    ).all()
    
    if len(movies) == 1:
        return movies[0]
    
    # If multiple matches or no exact match, try normalized matching
    all_movies = db.query(Movie).filter(Movie.year == year).all()
    
    for movie in all_movies:
        movie_normalized = normalize_title(movie.title)
        if movie_normalized == normalized_title:
            return movie
    
    return None

def load_tracked_lists(tracked_lists_dir: Path = None) -> Dict[str, List[Dict]]:
    """
    Load all tracked lists into memory for efficient matching.
    
    Returns:
        Dictionary mapping column names to lists of movie data from CSV
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
            tracked_lists[column_name] = {
                'name': list_name,
                'movies': movies_data
            }
            logger.info(f"Loaded tracked list {list_name} with {len(movies_data)} movies")
        except Exception as e:
            logger.warning(f"Error loading tracked list {csv_file.name}: {str(e)}")
            continue
    
    return tracked_lists

def normalize_uri(uri: str) -> str:
    """
    Normalize Letterboxd URI for comparison.
    Handles both full URLs (https://boxd.it/xxx) and just the path.
    """
    if not uri:
        return ""
    uri = uri.strip()
    # Extract the path part if it's a full URL
    if uri.startswith('http'):
        # Extract the path from URLs like https://boxd.it/2aHi
        if 'boxd.it/' in uri:
            uri = uri.split('boxd.it/')[-1]
        elif 'letterboxd.com/' in uri:
            uri = uri.split('letterboxd.com/')[-1]
    return uri

def check_movie_in_tracked_lists(movie: Movie, tracked_lists: Dict[str, Dict]) -> None:
    """
    Check if a movie is in any tracked list and update its list memberships.
    This is called for each movie as it's processed.
    
    Args:
        movie: The Movie object to check (will be modified in place)
        tracked_lists: Dictionary of tracked lists loaded by load_tracked_lists()
    """
    if not tracked_lists:
        return
    
    # Normalize the movie's URI once
    movie_uri_normalized = normalize_uri(movie.letterboxd_uri) if movie.letterboxd_uri else None
    
    # Check against each tracked list
    for column_name, list_data in tracked_lists.items():
        try:
            movies_data = list_data['movies']
            list_name = list_data['name']
            
            # Check if this movie is in the list
            is_in_list = False
            for list_movie_data in movies_data:
                # Try matching by URI first (normalized)
                if movie_uri_normalized and list_movie_data.get('letterboxd_uri'):
                    list_uri_normalized = normalize_uri(list_movie_data['letterboxd_uri'])
                    if movie_uri_normalized == list_uri_normalized:
                        is_in_list = True
                        logger.info(f"URI match: {movie.title} ({movie.year}) in {list_name} (URI: {movie_uri_normalized})")
                        break
                
                # Fallback to title + year matching
                if not is_in_list and list_movie_data.get('name') and list_movie_data.get('year'):
                    movie_normalized = normalize_title(movie.title) if movie.title else ""
                    list_normalized = normalize_title(list_movie_data['name']) if list_movie_data.get('name') else ""
                    if (movie.title and movie.year and
                        movie_normalized == list_normalized and
                        movie.year == list_movie_data['year']):
                        is_in_list = True
                        logger.info(f"Title+Year match: {movie.title} ({movie.year}) in {list_name} (normalized: '{movie_normalized}' == '{list_normalized}')")
                        break
            
            # Update the movie's list membership
            if is_in_list:
                try:
                    # Use setattr - SQLAlchemy will handle dynamically added columns
                    setattr(movie, column_name, True)
                    logger.info(f"✓ Movie '{movie.title}' ({movie.year}) matched to list '{list_name}'")
                except AttributeError:
                    # If column doesn't exist, try using raw SQL update
                    logger.warning(f"Column {column_name} not found as attribute, trying direct update for {movie.title}")
                    try:
                        from sqlalchemy import text
                        from database import engine
                        with engine.connect() as conn:
                            conn.execute(text(f"UPDATE movies SET {column_name} = 1 WHERE id = :id"), {"id": movie.id})
                            conn.commit()
                        logger.info(f"✓ Movie '{movie.title}' ({movie.year}) matched to list '{list_name}' (via direct update)")
                    except Exception as e2:
                        logger.error(f"Error updating {column_name} for {movie.title}: {str(e2)}")
                except Exception as e:
                    logger.error(f"Error setting {column_name} for {movie.title}: {str(e)}", exc_info=True)
        
        except Exception as e:
            logger.warning(f"Error checking movie in list {list_name}: {str(e)}", exc_info=True)
            continue

def process_tracked_list(
    db: Session,
    csv_file_path: Path,
    list_name: str,
    column_name: str
) -> Dict[str, int]:
    """
    Process a single tracked list CSV file.
    
    Args:
        db: Database session
        csv_file_path: Path to CSV file
        list_name: Human-readable list name
        column_name: Database column name (e.g., 'is_imdb_t250')
    
    Returns:
        Dictionary with statistics: total, matched, unmatched
    """
    logger.info(f"Processing tracked list: {list_name} from {csv_file_path}")
    
    try:
        # Parse CSV
        movies_data = parse_tracked_list_csv(str(csv_file_path))
        total = len(movies_data)
        matched = 0
        unmatched = []
        
        # Process each movie
        for movie_data in movies_data:
            movie = None
            
            # Try matching by URI first
            if movie_data.get('letterboxd_uri'):
                movie = match_movie_by_uri(db, movie_data['letterboxd_uri'])
            
            # Fallback to title + year matching
            if not movie and movie_data.get('name') and movie_data.get('year'):
                movie = match_movie_by_title_year(
                    db,
                    movie_data['name'],
                    movie_data['year']
                )
            
            if movie:
                # Update the movie's list membership
                # Use direct SQL update since these columns aren't in the model
                try:
                    from sqlalchemy import text
                    db.execute(text(f"UPDATE movies SET {column_name} = 1 WHERE id = :movie_id"), {"movie_id": movie.id})
                    matched += 1
                    logger.debug(f"Matched: {movie_data['name']} ({movie_data.get('year', 'N/A')})")
                except Exception as e:
                    logger.error(f"Error updating {column_name} for movie {movie.id}: {str(e)}")
                    unmatched.append({
                        'name': movie_data.get('name', 'Unknown'),
                        'year': movie_data.get('year'),
                        'uri': movie_data.get('letterboxd_uri'),
                        'error': str(e)
                    })
            else:
                unmatched.append({
                    'name': movie_data.get('name', 'Unknown'),
                    'year': movie_data.get('year'),
                    'uri': movie_data.get('letterboxd_uri')
                })
                logger.warning(
                    f"Could not match movie: {movie_data.get('name', 'Unknown')} "
                    f"({movie_data.get('year', 'N/A')})"
                )
        
        # Commit changes after processing all movies
        db.commit()
        
        logger.info(
            f"List '{list_name}': {matched}/{total} movies matched. "
            f"{len(unmatched)} unmatched."
        )
        
        return {
            'total': total,
            'matched': matched,
            'unmatched': len(unmatched),
            'unmatched_movies': unmatched
        }
    
    except Exception as e:
        logger.error(f"Error processing list {list_name}: {str(e)}", exc_info=True)
        db.rollback()
        raise

def process_all_tracked_lists(db: Session, tracked_lists_dir: Path = None):
    """
    Process all CSV files in the tracked-lists directory.
    Generator that yields progress updates during processing.
    
    Args:
        db: Database session
        tracked_lists_dir: Path to tracked-lists directory (defaults to project root/tracked-lists)
    
    Yields:
        Progress updates: {'list_name': str, 'current': int, 'total': int, 'matched': int, 'type': 'progress'}
        Final results: {'results': Dict[str, Dict], 'type': 'complete'}
    
    Returns:
        Dictionary mapping list names to processing results (for backward compatibility when used as non-generator)
    """
    if tracked_lists_dir is None:
        project_root = get_project_root()
        tracked_lists_dir = project_root / "tracked-lists"
    
    if not tracked_lists_dir.exists():
        logger.warning(f"Tracked lists directory not found: {tracked_lists_dir}")
        yield {'results': {}, 'type': 'complete'}
        return
    
    # First, reset all list columns to False
    logger.info("Resetting all tracked list columns to False")
    tracked_list_columns = []
    csv_files = list(tracked_lists_dir.glob("*.csv"))
    for csv_file in csv_files:
        column_name = filename_to_column_name(csv_file.name)
        tracked_list_columns.append(column_name)
    
    # Reset all columns
    for column_name in tracked_list_columns:
        try:
            db.execute(text(f"UPDATE movies SET {column_name} = 0"))
        except Exception as e:
            logger.warning(f"Could not reset column {column_name}: {e}")
    
    db.commit()
    
    # Process each CSV file
    results = {}
    sorted_csv_files = sorted(csv_files)
    total_lists = len(sorted_csv_files)
    
    for i, csv_file in enumerate(sorted_csv_files):
        list_name = csv_file.stem
        column_name = filename_to_column_name(csv_file.name)
        
        try:
            result = process_tracked_list(db, csv_file, list_name, column_name)
            results[list_name] = result
            # Yield progress update
            yield {
                'list_name': list_name,
                'current': i + 1,
                'total': total_lists,
                'matched': result.get('matched', 0),
                'type': 'progress'
            }
        except Exception as e:
            logger.error(f"Failed to process {list_name}: {str(e)}")
            results[list_name] = {
                'error': str(e),
                'total': 0,
                'matched': 0,
                'unmatched': 0
            }
            # Yield progress update even for errors
            yield {
                'list_name': list_name,
                'current': i + 1,
                'total': total_lists,
                'matched': 0,
                'type': 'progress'
            }
    
    # Yield final results
    yield {'results': results, 'type': 'complete'}
