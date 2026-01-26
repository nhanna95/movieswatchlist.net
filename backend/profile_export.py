"""
Profile export and import functionality.

Handles exporting user profiles (movies, preferences) to JSON/ZIP
and importing them back into the database.
"""
import json
import zipfile
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from io import BytesIO
from sqlalchemy.orm import Session
from models import Movie, FavoriteDirector, SeenCountry

logger = logging.getLogger(__name__)

PROFILE_VERSION = "1.0"


def export_profile_to_json(db: Session, include_tmdb_data: bool = True, preferences: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Build JSON structure from database movies and preferences.
    
    Args:
        db: Database session
        include_tmdb_data: Whether to include full TMDB data in export
        preferences: Optional user preferences dict (if None, will be empty)
    
    Returns:
        Dict containing profile data ready for JSON serialization
    """
    # Query all movies
    movies = db.query(Movie).all()
    
    # Build movies array
    movies_data = []
    favorite_count = 0
    
    for movie in movies:
        if movie.is_favorite:
            favorite_count += 1
        
        if include_tmdb_data:
            # Include all fields when TMDB data is included
            movie_dict = {
                "title": movie.title,
                "year": movie.year,
                "letterboxd_uri": movie.letterboxd_uri,
                "director": movie.director,
                "country": movie.country,
                "runtime": movie.runtime,
                "genres": movie.genres if movie.genres else [],
                "tmdb_id": movie.tmdb_id,
                "is_favorite": movie.is_favorite,
                "seen_before": movie.seen_before if movie.seen_before else False,
                "notes": movie.notes if movie.notes else None,
            }
            
            # Include timestamps if available
            if movie.created_at:
                movie_dict["created_at"] = movie.created_at.isoformat()
            if movie.updated_at:
                movie_dict["updated_at"] = movie.updated_at.isoformat()
            
            # Include TMDB data
            if movie.tmdb_data:
                movie_dict["tmdb_data"] = movie.tmdb_data
        else:
            # Only include minimal fields when TMDB data is excluded
            # Everything else will be reprocessed during import
            # But include seen_before, notes as they are user data
            movie_dict = {
                "title": movie.title,
                "year": movie.year,
                "letterboxd_uri": movie.letterboxd_uri,
                "tmdb_id": movie.tmdb_id,
                "is_favorite": movie.is_favorite,
                "seen_before": movie.seen_before if movie.seen_before else False,
                "notes": movie.notes if movie.notes else None,
            }
        
        movies_data.append(movie_dict)
    
    # Query favorite directors and seen countries
    favorite_directors = db.query(FavoriteDirector).all()
    seen_countries = db.query(SeenCountry).all()
    
    # Build preferences dict (default to empty if not provided)
    prefs = preferences or {}
    
    # Build export structure
    profile_data = {
        "version": PROFILE_VERSION,
        "export_date": datetime.utcnow().isoformat() + "Z",
        "metadata": {
            "total_movies": len(movies_data),
            "favorite_movies_count": favorite_count,
            "includes_tmdb_data": include_tmdb_data
        },
        "movies": movies_data,
        "favorite_directors": [fd.director_name for fd in favorite_directors],
        "seen_countries": [sc.country_name for sc in seen_countries],
        "preferences": prefs
    }
    
    return profile_data


def create_profile_zip(json_data: Dict[str, Any]) -> BytesIO:
    """
    Create a ZIP file containing the profile JSON.
    
    Args:
        json_data: Profile data dictionary
    
    Returns:
        BytesIO object containing ZIP file
    """
    zip_buffer = BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add JSON file to ZIP
        json_str = json.dumps(json_data, indent=2, ensure_ascii=False)
        zip_file.writestr("profile.json", json_str.encode('utf-8'))
    
    zip_buffer.seek(0)
    return zip_buffer


def extract_profile_zip(zip_file: BytesIO) -> Dict[str, Any]:
    """
    Extract and parse JSON from ZIP file.
    
    Args:
        zip_file: BytesIO containing ZIP file
    
    Returns:
        Parsed JSON dictionary
    
    Raises:
        ValueError: If ZIP is invalid or JSON is malformed
    """
    try:
        with zipfile.ZipFile(zip_file, 'r') as zip_ref:
            # Check if profile.json exists in ZIP
            if 'profile.json' not in zip_ref.namelist():
                raise ValueError("ZIP file does not contain profile.json")
            
            # Extract and parse JSON
            json_content = zip_ref.read('profile.json')
            json_str = json_content.decode('utf-8')
            profile_data = json.loads(json_str)
            
            return profile_data
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file format")
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in profile file: {str(e)}")


def import_profile_from_json(db: Session, json_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Import movies from JSON data into database.
    
    Clears existing database first, then imports movies from JSON.
    Handles errors leniently - skips invalid entries and continues.
    
    Args:
        db: Database session
        json_data: Profile data dictionary
    
    Returns:
        Dict with import summary: {movies_imported, movies_failed, errors}
    """
    # Validate JSON structure (lenient - check top-level keys)
    if not isinstance(json_data, dict):
        raise ValueError("Profile data must be a JSON object")
    
    required_keys = ["movies"]
    for key in required_keys:
        if key not in json_data:
            raise ValueError(f"Profile data missing required key: {key}")
    
    movies_data = json_data.get("movies", [])
    if not isinstance(movies_data, list):
        raise ValueError("Profile data must contain a 'movies' array")
    
    # Clear existing database
    logger.info("Clearing existing movies from database")
    existing_movies = db.query(Movie).all()
    for movie in existing_movies:
        db.delete(movie)
    db.flush()
    
    # Import movies
    movies_imported = 0
    movies_failed = 0
    errors = []
    
    logger.info(f"Starting import of {len(movies_data)} movies")
    
    for idx, movie_data in enumerate(movies_data):
        try:
            # Validate required fields
            if not isinstance(movie_data, dict):
                errors.append({
                    "index": idx,
                    "movie": "Unknown",
                    "error": "Movie data is not an object"
                })
                movies_failed += 1
                continue
            
            # Check for required fields (letterboxd_uri is critical)
            letterboxd_uri = movie_data.get("letterboxd_uri")
            if not letterboxd_uri:
                title = movie_data.get("title", "Unknown")
                errors.append({
                    "index": idx,
                    "movie": title,
                    "error": "Missing required field: letterboxd_uri"
                })
                movies_failed += 1
                continue
            
            # Create movie object with available data
            # Missing fields will be None/empty and will be filled during reprocessing
            # If this is a minimal export (only title, year, letterboxd_uri, tmdb_id, is_favorite),
            # the missing fields will be None and will be detected and reprocessed during import
            movie = Movie(
                title=movie_data.get("title"),
                year=movie_data.get("year"),
                letterboxd_uri=letterboxd_uri,
                director=movie_data.get("director"),  # May be None if minimal export
                country=movie_data.get("country"),  # May be None if minimal export
                runtime=movie_data.get("runtime"),  # May be None if minimal export
                genres=movie_data.get("genres", []),  # May be empty if minimal export
                tmdb_id=movie_data.get("tmdb_id"),
                tmdb_data=movie_data.get("tmdb_data") if "tmdb_data" in movie_data else None,
                is_favorite=movie_data.get("is_favorite", False),
                seen_before=movie_data.get("seen_before", False),
                notes=movie_data.get("notes")
            )
            
            # Add to database
            db.add(movie)
            movies_imported += 1
            
        except Exception as e:
            title = movie_data.get("title", "Unknown") if isinstance(movie_data, dict) else "Unknown"
            error_msg = str(e)
            errors.append({
                "index": idx,
                "movie": title,
                "error": error_msg
            })
            movies_failed += 1
            logger.warning(f"Failed to import movie {idx} ({title}): {error_msg}")
    
    # Commit all imported movies
    try:
        db.commit()
        logger.info(f"Successfully imported {movies_imported} movies, {movies_failed} failed")
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing imported movies: {str(e)}", exc_info=True)
        raise
    
    return {
        "movies_imported": movies_imported,
        "movies_failed": movies_failed,
        "errors": errors
    }


def import_profile_from_json_stream(db: Session, json_data: Dict[str, Any]):
    """
    Generator function that imports movies from JSON data into database with progress updates.
    
    Clears existing database first, then imports movies from JSON.
    Handles errors leniently - skips invalid entries and continues.
    Yields progress updates during the import process.
    
    Args:
        db: Database session
        json_data: Profile data dictionary
    
    Yields:
        SSE-formatted progress updates as strings
    """
    
    # Validate JSON structure (lenient - check top-level keys)
    if not isinstance(json_data, dict):
        raise ValueError("Profile data must be a JSON object")
    
    required_keys = ["movies"]
    for key in required_keys:
        if key not in json_data:
            raise ValueError(f"Profile data missing required key: {key}")
    
    movies_data = json_data.get("movies", [])
    if not isinstance(movies_data, list):
        raise ValueError("Profile data must contain a 'movies' array")
    
    total_movies = len(movies_data)
    
    # Clear existing database (don't show progress for this phase)
    logger.info("Clearing existing movies, favorite directors, and seen countries from database")
    existing_movies = db.query(Movie).all()
    for movie in existing_movies:
        db.delete(movie)
    
    # Clear favorite directors and seen countries
    existing_directors = db.query(FavoriteDirector).all()
    for director in existing_directors:
        db.delete(director)
    
    existing_countries = db.query(SeenCountry).all()
    for country in existing_countries:
        db.delete(country)
    
    db.flush()
    
    # Import movies
    movies_imported = 0
    movies_failed = 0
    errors = []
    
    logger.info(f"Starting import of {total_movies} movies")
    
    # Send initial progress message to establish connection and prevent timeout
    import json
    yield f"data: {json.dumps({'import_phase': 'starting', 'total': total_movies, 'current': 0})}\n\n"
    
    # Flush every 25 movies to prevent memory issues and ensure progress visibility
    # Smaller interval ensures more frequent database flushes and smoother progress
    FLUSH_INTERVAL = 25
    
    # Send progress updates every 25 movies to keep connection alive (prevents timeout)
    PROGRESS_INTERVAL = 25
    
    for idx, movie_data in enumerate(movies_data):
        try:
            # Validate required fields
            if not isinstance(movie_data, dict):
                errors.append({
                    "index": idx,
                    "movie": "Unknown",
                    "error": "Movie data is not an object"
                })
                movies_failed += 1
            else:
                # Check for required fields (letterboxd_uri is critical)
                letterboxd_uri = movie_data.get("letterboxd_uri")
                if not letterboxd_uri:
                    title = movie_data.get("title", "Unknown")
                    errors.append({
                        "index": idx,
                        "movie": title,
                        "error": "Missing required field: letterboxd_uri"
                    })
                    movies_failed += 1
                else:
                    # Create movie object with available data
                    # Missing fields will be None/empty and will be filled during reprocessing
                    # If this is a minimal export (only title, year, letterboxd_uri, tmdb_id, is_favorite),
                    # the missing fields will be None and will be detected and reprocessed during import
                    movie = Movie(
                        title=movie_data.get("title"),
                        year=movie_data.get("year"),
                        letterboxd_uri=letterboxd_uri,
                        director=movie_data.get("director"),  # May be None if minimal export
                        country=movie_data.get("country"),  # May be None if minimal export
                        runtime=movie_data.get("runtime"),  # May be None if minimal export
                        genres=movie_data.get("genres", []),  # May be empty if minimal export
                        tmdb_id=movie_data.get("tmdb_id"),
                        tmdb_data=movie_data.get("tmdb_data") if "tmdb_data" in movie_data else None,
                        is_favorite=movie_data.get("is_favorite", False),
                        seen_before=movie_data.get("seen_before", False),
                        notes=movie_data.get("notes")
                    )
                    
                    # Add to database
                    db.add(movie)
                    movies_imported += 1
            
        except Exception as e:
            title = movie_data.get("title", "Unknown") if isinstance(movie_data, dict) else "Unknown"
            error_msg = str(e)
            errors.append({
                "index": idx,
                "movie": title,
                "error": error_msg
            })
            movies_failed += 1
            logger.warning(f"Failed to import movie {idx} ({title}): {error_msg}")
        
        # Periodically flush to database to prevent memory buildup
        if (idx + 1) % FLUSH_INTERVAL == 0:
            try:
                db.flush()
                logger.debug(f"Flushed database after {idx + 1} movies")
            except Exception as e:
                logger.warning(f"Error flushing database at {idx + 1}: {str(e)}")
                # Continue anyway - we'll commit at the end
        
        # Send periodic progress updates to keep connection alive
        # This prevents timeouts during large imports (Railway has ~10s timeout)
        if (idx + 1) % PROGRESS_INTERVAL == 0:
            progress_data = {
                "import_phase": "movies",
                "current": idx + 1,
                "total": total_movies,
                "imported": movies_imported,
                "failed": movies_failed
            }
            yield f"data: {json.dumps(progress_data)}\n\n"
    
    # Final flush before commit
    try:
        db.flush()
    except Exception as e:
        logger.warning(f"Error in final flush: {str(e)}")
    
    # Commit all imported movies
    try:
        db.commit()
        logger.info(f"Successfully imported {movies_imported} movies, {movies_failed} failed")
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing imported movies: {str(e)}", exc_info=True)
        raise
    
    # Import favorite directors
    favorite_directors_data = json_data.get("favorite_directors", [])
    directors_imported = 0
    directors_failed = 0
    
    if isinstance(favorite_directors_data, list):
        logger.info(f"Importing {len(favorite_directors_data)} favorite directors")
        for director_name in favorite_directors_data:
            try:
                if director_name and isinstance(director_name, str) and director_name.strip():
                    # Check if already exists (shouldn't happen after clearing, but be safe)
                    existing = db.query(FavoriteDirector).filter(
                        FavoriteDirector.director_name == director_name.strip()
                    ).first()
                    if not existing:
                        favorite_director = FavoriteDirector(director_name=director_name.strip())
                        db.add(favorite_director)
                        directors_imported += 1
            except Exception as e:
                directors_failed += 1
                logger.warning(f"Failed to import favorite director '{director_name}': {str(e)}")
    
    # Import seen countries
    seen_countries_data = json_data.get("seen_countries", [])
    countries_imported = 0
    countries_failed = 0
    
    if isinstance(seen_countries_data, list):
        logger.info(f"Importing {len(seen_countries_data)} seen countries")
        for country_name in seen_countries_data:
            try:
                if country_name and isinstance(country_name, str) and country_name.strip():
                    # Check if already exists (shouldn't happen after clearing, but be safe)
                    existing = db.query(SeenCountry).filter(
                        SeenCountry.country_name == country_name.strip()
                    ).first()
                    if not existing:
                        seen_country = SeenCountry(country_name=country_name.strip())
                        db.add(seen_country)
                        countries_imported += 1
            except Exception as e:
                countries_failed += 1
                logger.warning(f"Failed to import seen country '{country_name}': {str(e)}")
    
    # Commit favorite directors and seen countries
    try:
        db.commit()
        logger.info(f"Successfully imported {directors_imported} favorite directors ({directors_failed} failed), {countries_imported} seen countries ({countries_failed} failed)")
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing favorite directors and seen countries: {str(e)}", exc_info=True)
        raise
    
    # Yield final import result
    yield f"data: {json.dumps({'import_complete': True, 'movies_imported': movies_imported, 'movies_failed': movies_failed, 'errors': errors, 'done': False})}\n\n"
