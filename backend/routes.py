from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import Float, String, Integer, cast, func, or_, and_, text, case, not_
from typing import Optional, Dict, List, Union, Any
from database import get_db, get_tracked_list_names, filename_to_column_name
from models import Movie, FavoriteDirector, SeenCountry
from csv_parser import parse_watchlist_csv
from list_processor import process_all_tracked_lists, check_movie_in_tracked_lists, load_tracked_lists
from tmdb_client import tmdb_client, extract_enriched_data_from_tmdb
import logging
import json
import requests
import asyncio
from pathlib import Path
from io import BytesIO
from datetime import datetime
from utils import get_project_root
from profile_export import (
    export_profile_to_json,
    create_profile_zip,
    extract_profile_zip,
    import_profile_from_json,
    import_profile_from_json_stream
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Get the path to watchlist.csv (located in the project root, one level up from backend)
PROJECT_ROOT = get_project_root()
CSV_FILE_PATH = PROJECT_ROOT / "watchlist.csv"

def check_movie_availability(
    movie_tmdb_data: Union[dict, str, None],
    country_code: str,
    preferred_services: List[int],
    availability_types: List[str]
) -> bool:
    """
    Check if a movie matches any of the specified availability types for preferred services.
    
    Args:
        movie_tmdb_data: Movie's tmdb_data (dict, JSON string, or None)
        country_code: ISO 3166-1 country code (e.g., 'US')
        preferred_services: List of preferred streaming service provider IDs
        availability_types: List of availability types to check ('for_free', 'for_rent', 'to_buy', 'unavailable')
    
    Returns:
        True if movie is available in ANY of the specified availability types for ANY preferred service.
    """
    if not movie_tmdb_data or not preferred_services or not availability_types:
        return False
    
    # Parse tmdb_data if it's a string
    tmdb_data = movie_tmdb_data
    if isinstance(tmdb_data, str):
        try:
            tmdb_data = json.loads(tmdb_data)
        except (json.JSONDecodeError, TypeError):
            tmdb_data = {}
    
    if not isinstance(tmdb_data, dict):
        return False
    
    # Extract watch/providers data (same logic as get_movie_streaming)
    watch_providers = tmdb_data.get('watch', {}).get('providers', {})
    if not watch_providers:
        # Try alternative structure
        watch_providers = tmdb_data.get('watch/providers', {})
    
    if not watch_providers:
        # No watch provider data - only matches if 'unavailable' is requested
        return 'unavailable' in availability_types
    
    results = watch_providers.get('results', {})
    country_providers = results.get(country_code.upper(), {})
    
    if not country_providers:
        # No data for this country - only matches if 'unavailable' is requested
        return 'unavailable' in availability_types
    
    # Extract provider IDs by type
    flatrate_providers = [p.get('provider_id') for p in country_providers.get('flatrate', []) if p.get('provider_id')]
    free_providers = [p.get('provider_id') for p in country_providers.get('free', []) if p.get('provider_id')]
    rent_providers = [p.get('provider_id') for p in country_providers.get('rent', []) if p.get('provider_id')]
    buy_providers = [p.get('provider_id') for p in country_providers.get('buy', []) if p.get('provider_id')]
    
    # Check each availability type
    for avail_type in availability_types:
        if avail_type == 'for_free':
            # Check if any preferred service is in flatrate or free
            for provider_id in preferred_services:
                if provider_id in flatrate_providers or provider_id in free_providers:
                    return True
        
        elif avail_type == 'for_rent':
            # Check if any preferred service is in rent
            for provider_id in preferred_services:
                if provider_id in rent_providers:
                    return True
        
        elif avail_type == 'to_buy':
            # Check if any preferred service is in buy
            for provider_id in preferred_services:
                if provider_id in buy_providers:
                    return True
        
        elif avail_type == 'unavailable':
            # Movie is unavailable if NONE of the preferred services are available in any type
            any_service_available = False
            for provider_id in preferred_services:
                if (provider_id in flatrate_providers or 
                    provider_id in free_providers or 
                    provider_id in rent_providers or 
                    provider_id in buy_providers):
                    any_service_available = True
                    break
            
            if not any_service_available:
                return True
    
    return False

async def process_csv_stream(db: Session, csv_file: Optional[Union[Path, BytesIO]] = None):
    """
    Generator function that processes CSV and yields progress updates.
    
    Args:
        db: Database session
        csv_file: Optional CSV file to process. Can be a Path (for local file) or BytesIO (for uploaded file).
                  If None, uses the default CSV_FILE_PATH.
    """
    # Determine which file to use
    if csv_file is None:
        # Use local file path (existing behavior)
        if not CSV_FILE_PATH.exists():
            yield f"data: {json.dumps({'error': f'CSV file not found at {CSV_FILE_PATH}', 'done': True})}\n\n"
            return
        file_source = str(CSV_FILE_PATH)
        logger.info(f"Processing local CSV file: {CSV_FILE_PATH}")
    else:
        # Use provided file (either Path or BytesIO)
        if isinstance(csv_file, BytesIO):
            file_source = csv_file
            logger.info("Processing uploaded CSV file")
        else:
            # It's a Path object
            if not csv_file.exists():
                yield f"data: {json.dumps({'error': f'CSV file not found at {csv_file}', 'done': True})}\n\n"
                return
            file_source = str(csv_file)
            logger.info(f"Processing CSV file: {csv_file}")
    
    try:
        # Ensure database has all tracked list columns
        from database import migrate_db
        migrate_db()
        
        # Load tracked lists once at the start for efficient matching
        project_root = get_project_root()
        tracked_lists_dir = project_root / "tracked-lists"
        tracked_lists = load_tracked_lists(tracked_lists_dir)
        logger.info(f"Loaded {len(tracked_lists)} tracked lists for matching")
        
        # Count total tracked lists for progress calculation
        total_tracked_lists = 0
        if tracked_lists_dir.exists():
            total_tracked_lists = len(list(tracked_lists_dir.glob("*.csv")))
        
        # Track matches for summary
        matches_found = {list_data['name']: 0 for list_data in tracked_lists.values()}
        
        movies_data = parse_watchlist_csv(file_source)
        total_movies = len(movies_data)
        # Total for progress bar is just movies (tracked lists are processed separately after)
        total_work = total_movies
        
        # Send initial progress
        yield f"data: {json.dumps({'current': 0, 'total': total_work, 'processed': 0, 'skipped': 0, 'done': False})}\n\n"
        
        # Process each movie
        processed = 0
        skipped = 0
        
        for index, movie_data in enumerate(movies_data):
            # Check if movie already exists by letterboxd_uri
            existing = db.query(Movie).filter(
                Movie.letterboxd_uri == movie_data['letterboxd_uri']
            ).first()
            
            # Also check for existing movie by title+year to prevent duplicates
            if not existing:
                existing = db.query(Movie).filter(
                    Movie.title == movie_data['name'],
                    Movie.year == movie_data['year']
                ).first()
                if existing:
                    logger.info(f"Movie {movie_data['name']} ({movie_data['year']}) already exists with different URI, skipping duplicate")
            
            if existing:
                logger.info(f"Movie {movie_data['name']} already exists, updating date_added and checking tracked lists")
                
                # Update date_added (created_at) if provided in CSV
                if 'date_added' in movie_data and movie_data['date_added']:
                    try:
                        date_from_csv = movie_data['date_added']
                        # Ensure it's a datetime object
                        if isinstance(date_from_csv, str):
                            date_from_csv = datetime.fromisoformat(date_from_csv.replace('Z', '+00:00'))
                        existing.created_at = date_from_csv
                        logger.info(f"Updated created_at for {movie_data['name']} to {date_from_csv}")
                    except Exception as e:
                        logger.warning(f"Error updating date_added for {movie_data['name']}: {str(e)}")
                
                # Even if movie exists, check if it's in tracked lists (in case lists were updated)
                try:
                    matches_before = {col: getattr(existing, col, False) for col in tracked_lists.keys()}
                    check_movie_in_tracked_lists(existing, tracked_lists)
                    # Count new matches
                    for col, list_data in tracked_lists.items():
                        if getattr(existing, col, False) and not matches_before.get(col, False):
                            matches_found[list_data['name']] = matches_found.get(list_data['name'], 0) + 1
                except Exception as e:
                    logger.warning(f"Error checking tracked lists for existing movie {movie_data['name']}: {str(e)}")
                
                db.flush()  # Flush any changes
                skipped += 1
                current = index + 1
                yield f"data: {json.dumps({'current': current, 'total': total_work, 'processed': processed, 'skipped': skipped, 'done': False})}\n\n"
                continue
            
            # Check cache for TMDB data by title and year
            cached_movie = db.query(Movie).filter(
                Movie.title == movie_data['name'],
                Movie.year == movie_data['year']
            ).first()
            
            enriched_data = None
            
            # If we have cached TMDB data, use it
            if cached_movie and cached_movie.tmdb_data:
                logger.info(f"Using cached TMDB data for {movie_data['name']} ({movie_data['year']})")
                enriched_data = extract_enriched_data_from_tmdb(cached_movie.tmdb_data)
            elif tmdb_client:
                # No cache found, fetch from TMDB API
                logger.info(f"Fetching TMDB data for {movie_data['name']} ({movie_data['year']})")
                enriched_data = tmdb_client.enrich_movie_data(
                    movie_data['name'],
                    movie_data['year']
                )
            
            # Create movie record with date_added if provided
            movie_kwargs = {
                'title': movie_data['name'],
                'year': movie_data['year'],
                'letterboxd_uri': movie_data['letterboxd_uri'],
                'director': enriched_data.get('director') if enriched_data else None,
                'country': enriched_data.get('country') if enriched_data else None,
                'runtime': enriched_data.get('runtime') if enriched_data else None,
                'genres': enriched_data.get('genres') if enriched_data else [],
                'tmdb_id': enriched_data.get('tmdb_id') if enriched_data else None,
                'tmdb_data': enriched_data.get('tmdb_data') if enriched_data else None
            }
            
            # Set created_at if date_added is provided in CSV
            if 'date_added' in movie_data and movie_data['date_added']:
                try:
                    date_from_csv = movie_data['date_added']
                    # Ensure it's a datetime object
                    if isinstance(date_from_csv, str):
                        date_from_csv = datetime.fromisoformat(date_from_csv.replace('Z', '+00:00'))
                    movie_kwargs['created_at'] = date_from_csv
                    logger.info(f"Setting created_at for new movie {movie_data['name']} to {date_from_csv}")
                except Exception as e:
                    logger.warning(f"Error setting date_added for new movie {movie_data['name']}: {str(e)}")
            
            movie = Movie(**movie_kwargs)
            
            db.add(movie)
            db.flush()  # Flush to get the movie ID
            
            # Check if this movie is in any tracked lists
            try:
                matches_before = {col: getattr(movie, col, False) for col in tracked_lists.keys()}
                check_movie_in_tracked_lists(movie, tracked_lists)
                # Count new matches
                for col, list_data in tracked_lists.items():
                    if getattr(movie, col, False) and not matches_before.get(col, False):
                        matches_found[list_data['name']] = matches_found.get(list_data['name'], 0) + 1
            except Exception as e:
                logger.warning(f"Error checking tracked lists for {movie_data['name']}: {str(e)}")
                # Don't fail the entire processing if tracked list check fails
            
            processed += 1
            
            # Send progress update after each movie
            # Progress includes movies processed so far (tracked lists will be added after)
            current = index + 1
            yield f"data: {json.dumps({'current': current, 'total': total_work, 'processed': processed, 'skipped': skipped, 'done': False})}\n\n"
            
            # Small delay to allow UI updates
            await asyncio.sleep(0.01)
        
        # Commit all changes (including updates to existing movies' date_added)
        db.commit()
        logger.info(f"Committed changes: {processed} new movies, {skipped} existing movies (dates updated if provided in CSV)")
        
        # Log summary of matches
        if matches_found:
            match_summary = ", ".join([f"{name}: {count}" for name, count in matches_found.items() if count > 0])
            if match_summary:
                logger.info(f"Tracked list matches: {match_summary}")
            else:
                logger.warning("No movies matched to any tracked lists!")
        
        # Process all tracked lists to ensure all movies (including existing ones) are matched
        # Movies progress is already at 100%, now process tracked lists
        logger.info("Processing all tracked lists to update movie memberships...")
        tracked_lists_results = {}
        try:
            from list_processor import process_all_tracked_lists
            # Iterate over generator to process tracked lists
            # Don't update progress bar during this - movies are already done
            for update in process_all_tracked_lists(db, tracked_lists_dir):
                if update.get('type') == 'complete':
                    tracked_lists_results = update.get('results', {})
                # Small delay to allow processing
                await asyncio.sleep(0.01)
            
            # Log tracked lists processing results
            if tracked_lists_results:
                for list_name, result in tracked_lists_results.items():
                    if 'error' in result:
                        logger.error(f"Error processing {list_name}: {result['error']}")
                    else:
                        logger.info(f"{list_name}: {result.get('matched', 0)}/{result.get('total', 0)} matched")
        except Exception as e:
            logger.warning(f"Error processing tracked lists: {str(e)} - continuing anyway")
            # Don't fail the entire CSV processing if tracked lists processing fails
        
        # Send final result - all work is complete
        yield f"data: {json.dumps({'current': total_work, 'total': total_work, 'processed': processed, 'skipped': skipped, 'done': True, 'message': 'CSV processed successfully'})}\n\n"
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing CSV: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'error': f'Error processing CSV: {str(e)}', 'done': True})}\n\n"


async def process_csv_with_selections_stream(
    db: Session,
    csv_file: BytesIO,
    selections: Dict[str, Any]
):
    """
    Generator function that processes CSV with user selections.
    Only processes selected movies to add and removes selected movies.
    
    Args:
        db: Database session
        csv_file: CSV file as BytesIO
        selections: Dict with 'movies_to_add' (list) and 'movies_to_remove_ids' (list of IDs)
    """
    try:
        # Extract selections first to check if we need to do expensive operations
        movies_to_add = selections.get('movies_to_add', [])
        movies_to_remove_ids = set(selections.get('movies_to_remove_ids', []))
        
        # Only load tracked lists and migrate DB if we're adding movies
        # (For removals only, we don't need tracked lists)
        tracked_lists = {}
        tracked_lists_dir = None
        total_tracked_lists = 0
        if movies_to_add:
            # Ensure database has all tracked list columns
            from database import migrate_db
            migrate_db()
            
            # Load tracked lists
            project_root = get_project_root()
            tracked_lists_dir = project_root / "tracked-lists"
            tracked_lists = load_tracked_lists(tracked_lists_dir)
            logger.info(f"Loaded {len(tracked_lists)} tracked lists for matching")
            
            # Count total tracked lists for progress calculation
            if tracked_lists_dir.exists():
                total_tracked_lists = len(list(tracked_lists_dir.glob("*.csv")))
        
        # Create a lookup for movies to add (by URI)
        movies_to_add_map = {
            movie['letterboxd_uri']: movie
            for movie in movies_to_add
        }
        
        # Track progress
        total_add = len(movies_to_add)
        total_remove = len(movies_to_remove_ids)
        # Total for progress bar is just movies (tracked lists are processed separately after)
        total = total_add + total_remove
        
        processed_add = 0
        processed_remove = 0
        skipped = 0
        
        # Send initial progress
        yield f"data: {json.dumps({'current': 0, 'total': total, 'processed': 0, 'skipped': 0, 'done': False, 'removed': 0})}\n\n"
        
        # First, handle removals
        if movies_to_remove_ids:
            logger.info(f"Removing {len(movies_to_remove_ids)} movies")
            for movie_id in movies_to_remove_ids:
                try:
                    movie = db.query(Movie).filter(Movie.id == movie_id).first()
                    if movie:
                        db.delete(movie)
                        processed_remove += 1
                        logger.info(f"Deleted movie {movie_id}: {movie.title}")
                    else:
                        logger.warning(f"Movie {movie_id} not found for deletion")
                        skipped += 1
                except Exception as e:
                    logger.error(f"Error deleting movie {movie_id}: {str(e)}")
                    skipped += 1
                
                current = processed_add + processed_remove + skipped
                yield f"data: {json.dumps({'current': current, 'total': total, 'processed': processed_add, 'skipped': skipped, 'removed': processed_remove, 'done': False})}\n\n"
                await asyncio.sleep(0.01)
        
        # Commit removals before processing additions
        db.commit()
        
        # If no movies to add, skip all the addition processing
        if not movies_to_add:
            # No need to process tracked lists when only removing movies
            # The deleted movies will naturally be removed from tracked lists
            logger.info(f"Only removals requested, skipping tracked lists processing")
            
            # Send final result - total here is just removals (no tracked lists)
            final_total = total_remove
            yield f"data: {json.dumps({'current': final_total, 'total': final_total, 'processed': processed_add, 'skipped': skipped, 'removed': processed_remove, 'done': True, 'message': f'Removed {processed_remove} movies'})}\n\n"
            return
        
        # Track matches for summary
        matches_found = {list_data['name']: 0 for list_data in tracked_lists.values()}
        
        # Parse CSV to get all movie data
        csv_file.seek(0)  # Reset file pointer
        all_movies_data = parse_watchlist_csv(csv_file)
        
        # Process only selected movies to add
        for movie_data in all_movies_data:
            uri = movie_data['letterboxd_uri']
            
            # Skip if not in selections
            if uri not in movies_to_add_map:
                continue
            
            selected_movie = movies_to_add_map[uri]
            # Ensure is_favorite is properly read (can be bool or string representation)
            is_favorite_value = selected_movie.get('is_favorite', False)
            is_favorite = bool(is_favorite_value) if is_favorite_value is not None else False
            # Ensure seen_before is properly read (can be bool or string representation)
            seen_before_value = selected_movie.get('seen_before', False)
            seen_before = bool(seen_before_value) if seen_before_value is not None else False
            logger.info(f"Movie {movie_data['name']}: is_favorite={is_favorite} (from selection: {is_favorite_value}), seen_before={seen_before} (from selection: {seen_before_value})")
            
            # Check if movie already exists (shouldn't happen, but be safe)
            existing = db.query(Movie).filter(
                Movie.letterboxd_uri == uri
            ).first()
            
            if existing:
                logger.info(f"Movie {movie_data['name']} already exists, updating date_added")
                
                # Update date_added (created_at) if provided in CSV
                if 'date_added' in movie_data and movie_data['date_added']:
                    try:
                        date_from_csv = movie_data['date_added']
                        # Ensure it's a datetime object
                        if isinstance(date_from_csv, str):
                            date_from_csv = datetime.fromisoformat(date_from_csv.replace('Z', '+00:00'))
                        existing.created_at = date_from_csv
                        logger.info(f"Updated created_at for {movie_data['name']} to {date_from_csv}")
                    except Exception as e:
                        logger.warning(f"Error updating date_added for {movie_data['name']}: {str(e)}")
                
                db.flush()  # Flush any changes
                skipped += 1
                current = processed_add + processed_remove + skipped
                yield f"data: {json.dumps({'current': current, 'total': total, 'processed': processed_add, 'skipped': skipped, 'removed': processed_remove, 'done': False})}\n\n"
                continue
            
            # Check cache for TMDB data
            cached_movie = db.query(Movie).filter(
                Movie.title == movie_data['name'],
                Movie.year == movie_data['year']
            ).first()
            
            enriched_data = None
            
            if cached_movie and cached_movie.tmdb_data:
                logger.info(f"Using cached TMDB data for {movie_data['name']} ({movie_data['year']})")
                enriched_data = extract_enriched_data_from_tmdb(cached_movie.tmdb_data)
            elif tmdb_client:
                logger.info(f"Fetching TMDB data for {movie_data['name']} ({movie_data['year']})")
                enriched_data = tmdb_client.enrich_movie_data(
                    movie_data['name'],
                    movie_data['year']
                )
            
            # Create movie record with favorite status, and date_added if provided
            movie_kwargs = {
                'title': movie_data['name'],
                'year': movie_data['year'],
                'letterboxd_uri': movie_data['letterboxd_uri'],
                'director': enriched_data.get('director') if enriched_data else None,
                'country': enriched_data.get('country') if enriched_data else None,
                'runtime': enriched_data.get('runtime') if enriched_data else None,
                'genres': enriched_data.get('genres') if enriched_data else [],
                'tmdb_id': enriched_data.get('tmdb_id') if enriched_data else None,
                'tmdb_data': enriched_data.get('tmdb_data') if enriched_data else None,
                'is_favorite': is_favorite,  # Apply favorite status from selections
                'seen_before': seen_before  # Apply seen_before status from selections
            }
            
            # Set created_at if date_added is provided in CSV
            if 'date_added' in movie_data and movie_data['date_added']:
                try:
                    date_from_csv = movie_data['date_added']
                    # Ensure it's a datetime object
                    if isinstance(date_from_csv, str):
                        date_from_csv = datetime.fromisoformat(date_from_csv.replace('Z', '+00:00'))
                    movie_kwargs['created_at'] = date_from_csv
                    logger.info(f"Setting created_at for new movie {movie_data['name']} to {date_from_csv}")
                except Exception as e:
                    logger.warning(f"Error setting date_added for new movie {movie_data['name']}: {str(e)}")
            
            movie = Movie(**movie_kwargs)
            
            db.add(movie)
            db.flush()
            
            # Check tracked lists
            try:
                matches_before = {col: getattr(movie, col, False) for col in tracked_lists.keys()}
                check_movie_in_tracked_lists(movie, tracked_lists)
                for col, list_data in tracked_lists.items():
                    if getattr(movie, col, False) and not matches_before.get(col, False):
                        matches_found[list_data['name']] = matches_found.get(list_data['name'], 0) + 1
            except Exception as e:
                logger.warning(f"Error checking tracked lists for {movie_data['name']}: {str(e)}")
            
            processed_add += 1
            # Progress includes movies processed so far (tracked lists will be added after)
            current = processed_add + processed_remove + skipped
            yield f"data: {json.dumps({'current': current, 'total': total, 'processed': processed_add, 'skipped': skipped, 'removed': processed_remove, 'done': False})}\n\n"
            await asyncio.sleep(0.01)
        
        # Commit all changes (including updates to existing movies' date_added)
        db.commit()
        logger.info(f"Committed changes: {processed_add} new movies added, {processed_remove} movies removed, {skipped} existing movies (dates updated if provided in CSV)")
        
        # Log summary
        if matches_found:
            match_summary = ", ".join([f"{name}: {count}" for name, count in matches_found.items() if count > 0])
            if match_summary:
                logger.info(f"Tracked list matches: {match_summary}")
        
        # Process tracked lists (after all movies are done)
        # Movies progress is already at 100%, now process tracked lists
        tracked_lists_results = {}
        try:
            from list_processor import process_all_tracked_lists
            # Iterate over generator to process tracked lists
            # Don't update progress bar during this - movies are already done
            for update in process_all_tracked_lists(db, tracked_lists_dir):
                if update.get('type') == 'complete':
                    tracked_lists_results = update.get('results', {})
                # Small delay to allow processing
                await asyncio.sleep(0.01)
        except Exception as e:
            logger.warning(f"Error processing tracked lists: {str(e)} - continuing anyway")
        
        # Send final result - all work is complete
        yield f"data: {json.dumps({'current': total, 'total': total, 'processed': processed_add, 'skipped': skipped, 'removed': processed_remove, 'done': True, 'message': f'Added {processed_add} movies, removed {processed_remove} movies'})}\n\n"
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing CSV with selections: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'error': f'Error processing CSV: {str(e)}', 'done': True})}\n\n"


@router.post("/api/upload")
async def process_csv(db: Session = Depends(get_db)):
    """
    Process the local watchlist.csv file with progress streaming.
    """
    return StreamingResponse(
        process_csv_stream(db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.options("/api/preview-csv")
async def preview_csv_options():
    """Handle CORS preflight for preview-csv endpoint"""
    return {"message": "OK"}

@router.post("/api/preview-csv")
async def preview_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Preview CSV import - identifies movies to add and movies to remove.
    Returns preview data without making any changes to the database.
    """
    # Validate file type
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    # Read the uploaded file into BytesIO
    try:
        contents = await file.read()
        csv_file = BytesIO(contents)
    except Exception as e:
        logger.error(f"Error reading uploaded file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    try:
        # Parse CSV
        movies_data = parse_watchlist_csv(csv_file)
        
        # Get all existing movies from database (only URI and basic info)
        existing_movies = db.query(
            Movie.id,
            Movie.title,
            Movie.year,
            Movie.letterboxd_uri
        ).all()
        
        # Create sets for fast lookup
        csv_uris = {movie['letterboxd_uri'] for movie in movies_data}
        existing_uris = {movie.letterboxd_uri for movie in existing_movies if movie.letterboxd_uri}
        
        # Find movies to add (in CSV but not in DB)
        movies_to_add = [
            {
                "name": movie['name'],
                "year": movie['year'],
                "letterboxd_uri": movie['letterboxd_uri'],
                "will_add": True
            }
            for movie in movies_data
            if movie['letterboxd_uri'] not in existing_uris
        ]
        
        # Find movies to remove (in DB but not in CSV)
        movies_to_remove = [
            {
                "id": movie.id,
                "title": movie.title,
                "year": movie.year,
                "letterboxd_uri": movie.letterboxd_uri,
                "action": "keep"  # Default action
            }
            for movie in existing_movies
            if movie.letterboxd_uri and movie.letterboxd_uri not in csv_uris
        ]
        
        return {
            "movies_to_add": movies_to_add,
            "movies_to_remove": movies_to_remove,
            "total_to_add": len(movies_to_add),
            "total_to_remove": len(movies_to_remove)
        }
    
    except ValueError as e:
        # CSV parsing errors
        logger.error(f"Error parsing CSV: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")
    except Exception as e:
        logger.error(f"Error generating preview: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating preview: {str(e)}")


@router.post("/api/process-csv-with-selections")
async def process_csv_with_selections(
    file: UploadFile = File(...),
    selections: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Process CSV with user selections (movies to add, movies to remove).
    Accepts a CSV file and a JSON string with selections from FormData.
    """
    # Validate file type
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    # Parse selections JSON
    try:
        selections_dict = json.loads(selections)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid selections JSON: {str(e)}")
    
    # Validate selections structure
    if not isinstance(selections_dict, dict):
        raise HTTPException(status_code=400, detail="Selections must be a JSON object")
    
    # Read the uploaded file into BytesIO
    try:
        contents = await file.read()
        csv_file = BytesIO(contents)
    except Exception as e:
        logger.error(f"Error reading uploaded file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    return StreamingResponse(
        process_csv_with_selections_stream(db, csv_file=csv_file, selections=selections_dict),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Upload and process a CSV file with progress streaming.
    """
    # Validate file type
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    # Read the uploaded file into BytesIO
    try:
        contents = await file.read()
        csv_file = BytesIO(contents)
    except Exception as e:
        logger.error(f"Error reading uploaded file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    return StreamingResponse(
        process_csv_stream(db, csv_file=csv_file),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/api/movies")
def get_movies(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    director: Optional[List[str]] = Query(None),
    director_exclude: bool = Query(False),
    country: Optional[List[str]] = Query(None),
    country_exclude: bool = Query(False),
    genre: Optional[List[str]] = Query(None),
    genre_exclude: bool = Query(False),
    runtime_min: Optional[int] = Query(None),
    runtime_max: Optional[int] = Query(None),
    original_language: Optional[List[str]] = Query(None),
    original_language_exclude: bool = Query(False),
    production_company: Optional[List[str]] = Query(None),
    production_company_exclude: bool = Query(False),
    spoken_language: Optional[str] = Query(None),
    actor: Optional[List[str]] = Query(None),
    actor_exclude: bool = Query(False),
    writer: Optional[List[str]] = Query(None),
    writer_exclude: bool = Query(False),
    producer: Optional[List[str]] = Query(None),
    producer_exclude: bool = Query(False),
    collection: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    date_added_min: Optional[str] = Query(None, description="Minimum date added (ISO format)"),
    date_added_max: Optional[str] = Query(None, description="Maximum date added (ISO format)"),
    sort_by: Optional[str] = Query(None, regex="^(title|year|runtime|date_added)$"),
    sort_order: Optional[str] = Query(None, regex="^(asc|desc)$"),
    sorts: Optional[str] = Query(None, description="JSON array of sort objects: [{\"field\": \"year\", \"order\": \"desc\"}]"),
    favorites_only: Optional[bool] = Query(None),
    seen_before: Optional[bool] = Query(None),
    show_favorites_first: bool = Query(False),
    favorited_directors_only: Optional[bool] = Query(None, description="Filter movies to only show those from favorited directors"),
    exclude_seen_countries: Optional[bool] = Query(None, description="Filter movies to exclude those from countries in the seen list"),
    list_filters: Optional[str] = Query(None, description="JSON object with list filters: {\"is_imdb_t250\": true, \"is_letterboxd_t250\": false}"),
    streaming_service: Optional[List[int]] = Query(None, description="Filter by streaming service provider IDs (deprecated, use availability_type)"),
    watch_region: Optional[str] = Query(None, description="ISO 3166-1 country code for streaming availability (e.g., US, GB)"),
    streaming_provider_type: Optional[str] = Query(None, description="Filter by provider type: flatrate, rent, buy, free, ads"),
    availability_type: Optional[List[str]] = Query(None, description="Filter by availability type(s): for_free, for_rent, to_buy, unavailable"),
    availability_exclude: bool = Query(False, description="Exclude movies matching availability types instead of including them"),
    preferred_services: Optional[List[int]] = Query(None, description="List of preferred streaming service provider IDs for availability filtering"),
    db: Session = Depends(get_db)
):
    """
    Get movies with optional filtering and sorting.
    """
    query = db.query(Movie)
    
    # Apply filters
    if year_min is not None:
        query = query.filter(Movie.year >= year_min)
    if year_max is not None:
        query = query.filter(Movie.year <= year_max)
    if director:
        # Handle array of directors (OR logic) - use the director column directly
        if isinstance(director, list) and len(director) > 0:
            director_filters = []
            for d in director:
                # Use case-insensitive matching on the director column, ensuring director is not None
                director_filters.append(
                    and_(
                        Movie.director.isnot(None),
                        Movie.director.ilike(f'%{d}%')
                    )
                )
            filter_condition = or_(*director_filters)
            if director_exclude:
                # Exclude movies matching any of the directors
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
        elif isinstance(director, str):
            # Backward compatibility: handle single string
            filter_condition = and_(
                Movie.director.isnot(None),
                Movie.director.ilike(f'%{director}%')
            )
            if director_exclude:
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
    # Handle country filter and exclude_seen_countries together (OR logic when both present)
    country_filters_list = []
    
    if country:
        # Handle array of countries (OR logic) - check both country column and production_countries in tmdb_data
        if isinstance(country, list) and len(country) > 0:
            country_filters = []
            for c in country:
                # Check both the country column (direct match) and tmdb_data.production_countries (JSON)
                country_name = c.strip()
                # Direct column match (case-insensitive)
                column_filter = func.lower(Movie.country) == func.lower(country_name)
                # JSON match in production_countries
                escaped_name = country_name.lower().replace('"', '\\"')
                json_filter = and_(
                    func.lower(func.cast(Movie.tmdb_data, String)).like(f'%"production_countries"%'),
                    func.lower(func.cast(Movie.tmdb_data, String)).like(f'%"name":"%{escaped_name}%"%')
                )
                # Match if either the column matches OR the JSON matches
                country_filters.append(or_(column_filter, json_filter))
            filter_condition = or_(*country_filters)
            if country_exclude:
                # Exclude movies matching any of the countries
                filter_condition = ~filter_condition
            country_filters_list.append(filter_condition)
        elif isinstance(country, str):
            # Backward compatibility: handle single string
            country_name = country.strip()
            # Check both the country column and JSON
            column_filter = func.lower(Movie.country) == func.lower(country_name)
            escaped_name = country_name.lower().replace('"', '\\"')
            json_filter = and_(
                func.lower(func.cast(Movie.tmdb_data, String)).like(f'%"production_countries"%'),
                func.lower(func.cast(Movie.tmdb_data, String)).like(f'%"name":"%{escaped_name}%"%')
            )
            filter_condition = or_(column_filter, json_filter)
            if country_exclude:
                filter_condition = ~filter_condition
            country_filters_list.append(filter_condition)
    
    if exclude_seen_countries:
        # Filter movies to exclude those from countries in the seen list
        seen_countries = db.query(SeenCountry).all()
        if seen_countries:
            seen_country_names = [sc.country_name for sc in seen_countries]
            
            # Country name aliases mapping (for matching different naming conventions)
            country_aliases = {
                'UK': ['United Kingdom', 'UK'],
                'United Kingdom': ['United Kingdom', 'UK'],
                'USA': ['United States of America', 'USA', 'United States'],
                'United States of America': ['United States of America', 'USA', 'United States'],
                'United States': ['United States of America', 'USA', 'United States'],
            }
            
            # Build filters to exclude movies from seen countries
            # Check both the country column and tmdb_data.production_countries
            exclusion_filters = []
            for country_name in seen_country_names:
                # Get all aliases for this country (including the original name)
                aliases = country_aliases.get(country_name, [country_name])
                
                # Create filters for each alias
                alias_filters = []
                for alias in aliases:
                    # Direct column match (case-insensitive)
                    column_filter = func.lower(Movie.country) == func.lower(alias)
                    # JSON match in production_countries
                    escaped_name = alias.lower().replace('"', '\\"')
                    json_filter = and_(
                        func.lower(func.cast(Movie.tmdb_data, String)).like(f'%"production_countries"%'),
                        func.lower(func.cast(Movie.tmdb_data, String)).like(f'%"name":"%{escaped_name}%"%')
                    )
                    # Movie matches if either column OR JSON matches
                    alias_filters.append(or_(column_filter, json_filter))
                
                # Add OR condition for all aliases of this country
                if alias_filters:
                    exclusion_filters.append(or_(*alias_filters))
            
            # Exclude movies that match any of the seen countries (or their aliases)
            # This means: NOT (in seen countries) = in unseen countries
            if exclusion_filters:
                filter_condition = or_(*exclusion_filters)
                country_filters_list.append(~filter_condition)
    
    # Apply country filters with OR logic (unseen countries OR specified countries)
    if country_filters_list:
        combined_filter = or_(*country_filters_list)
        query = query.filter(combined_filter)
    if runtime_min is not None:
        query = query.filter(Movie.runtime >= runtime_min)
    if runtime_max is not None:
        query = query.filter(Movie.runtime <= runtime_max)
    if search:
        # Search requires all words to be present in one of the fields
        # This ensures "12 years a slave" won't match "12 angry men"
        # Split search into words and require all words to match
        search_trimmed = search.strip()
        if not search_trimmed:
            # Empty search, skip filtering
            pass
        else:
            # Split into words (handle multiple spaces)
            search_words = [w for w in search_trimmed.split() if w]
            if not search_words:
                # No valid words, skip filtering
                pass
            else:
                # Escape special characters in each word
                escaped_words = [word.replace('%', '\\%').replace('_', '\\_') for word in search_words]
                
                # Build filters for each field - ALL words must be present in the same field
                field_filters = []
                
                # Title field: all words must be present
                title_conditions = [Movie.title.ilike(f"%{word}%") for word in escaped_words]
                if title_conditions:
                    field_filters.append(and_(*title_conditions))
                
                # Notes field: all words must be present (only if notes is not NULL)
                notes_conditions = [
                    and_(
                        Movie.notes.isnot(None),
                        Movie.notes.ilike(f"%{word}%")
                    ) for word in escaped_words
                ]
                if notes_conditions:
                    field_filters.append(and_(*notes_conditions))
                
                # Director field: all words must be present (only if director is not NULL)
                director_conditions = [
                    and_(
                        Movie.director.isnot(None),
                        Movie.director.ilike(f"%{word}%")
                    ) for word in escaped_words
                ]
                if director_conditions:
                    field_filters.append(and_(*director_conditions))
                
                # Note: Excluding tmdb_data from search to prevent false matches
                # The tmdb_data JSON is too large and contains many words scattered throughout,
                # which causes too many false positives
                
                # Match if any field contains ALL the words (OR between fields, AND within each field)
                if field_filters:
                    query = query.filter(or_(*field_filters))
    if genre:
        # Handle array of genres (OR logic) - check if any genre in the filter matches any genre in the movie
        # Genres are stored as JSON array like ["Action", "Drama"]
        # Use SQLite json_each to properly check if genre exists in the array
        if isinstance(genre, list) and len(genre) > 0:
            genre_conditions = []
            for idx, g in enumerate(genre):
                # Use json_each with parameter substitution - escape single quotes in genre name
                escaped_genre = g.replace("'", "''")
                if genre_exclude:
                    # Use NOT EXISTS to exclude movies with this genre
                    genre_conditions.append(
                        text(f"NOT EXISTS (SELECT 1 FROM json_each(movies.genres) WHERE json_each.value = '{escaped_genre}')")
                    )
                else:
                    genre_conditions.append(
                        text(f"EXISTS (SELECT 1 FROM json_each(movies.genres) WHERE json_each.value = '{escaped_genre}')")
                    )
            # When excluding, we want AND logic (movie must not have ANY of the excluded genres)
            # When including, we want OR logic (movie must have at least one of the genres)
            if genre_exclude:
                filter_condition = and_(*genre_conditions)
            else:
                filter_condition = or_(*genre_conditions)
            query = query.filter(filter_condition)
        elif isinstance(genre, str):
            # Backward compatibility: handle single string
            escaped_genre = genre.replace("'", "''")
            if genre_exclude:
                filter_condition = text(f"NOT EXISTS (SELECT 1 FROM json_each(movies.genres) WHERE json_each.value = '{escaped_genre}')")
            else:
                filter_condition = text(f"EXISTS (SELECT 1 FROM json_each(movies.genres) WHERE json_each.value = '{escaped_genre}')")
            query = query.filter(filter_condition)
    if original_language:
        # Handle array of languages (OR logic)
        if isinstance(original_language, list) and len(original_language) > 0:
            language_filters = [
                func.json_extract(Movie.tmdb_data, '$.original_language') == lang
                for lang in original_language
            ]
            filter_condition = or_(*language_filters)
            if original_language_exclude:
                # Exclude movies matching any of the languages
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
        elif isinstance(original_language, str):
            # Backward compatibility: handle single string
            filter_condition = func.json_extract(Movie.tmdb_data, '$.original_language') == original_language
            if original_language_exclude:
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
    if production_company:
        # Handle array of production companies (OR logic) - check all production companies in tmdb_data
        if isinstance(production_company, list) and len(production_company) > 0:
            company_filters = []
            for company in production_company:
                # Use json_each to check if company name exists in production_companies array
                escaped_name = company.replace("'", "''")
                company_filters.append(
                    text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.production_companies')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}')")
                )
            filter_condition = or_(*company_filters)
            if production_company_exclude:
                # Exclude movies matching any of the production companies
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
        elif isinstance(production_company, str):
            # Backward compatibility: handle single string
            escaped_name = production_company.replace("'", "''")
            filter_condition = text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.production_companies')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}')")
            if production_company_exclude:
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
    if actor:
        # Handle array of actors (OR logic) - search in credits.cast
        if isinstance(actor, list) and len(actor) > 0:
            actor_filters = []
            for a in actor:
                # Use json_each to check if actor name exists in credits.cast array
                escaped_name = a.replace("'", "''")
                actor_filters.append(
                    text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.credits.cast')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}')")
                )
            filter_condition = or_(*actor_filters)
            if actor_exclude:
                # Exclude movies matching any of the actors
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
        elif isinstance(actor, str):
            escaped_name = actor.replace("'", "''")
            filter_condition = text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.credits.cast')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}')")
            if actor_exclude:
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
    if writer:
        # Handle array of writers (OR logic) - search in credits.crew where job is Writer or Screenplay
        if isinstance(writer, list) and len(writer) > 0:
            all_writer_filters = []
            for w in writer:
                # Use json_each to check if writer name exists in credits.crew with job Writer or Screenplay
                escaped_name = w.replace("'", "''")
                all_writer_filters.append(
                    text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.credits.crew')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}' AND (json_extract(json_each.value, '$.job') = 'Writer' OR json_extract(json_each.value, '$.job') = 'Screenplay'))")
                )
            filter_condition = or_(*all_writer_filters)
            if writer_exclude:
                # Exclude movies matching any of the writers
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
        elif isinstance(writer, str):
            escaped_name = writer.replace("'", "''")
            filter_condition = text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.credits.crew')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}' AND (json_extract(json_each.value, '$.job') = 'Writer' OR json_extract(json_each.value, '$.job') = 'Screenplay'))")
            if writer_exclude:
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
    if producer:
        # Handle array of producers (OR logic) - search in credits.crew where job is Producer or Executive Producer
        if isinstance(producer, list) and len(producer) > 0:
            all_producer_filters = []
            for p in producer:
                # Use json_each to check if producer name exists in credits.crew with job Producer or Executive Producer
                escaped_name = p.replace("'", "''")
                all_producer_filters.append(
                    text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.credits.crew')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}' AND (json_extract(json_each.value, '$.job') = 'Producer' OR json_extract(json_each.value, '$.job') = 'Executive Producer'))")
                )
            filter_condition = or_(*all_producer_filters)
            if producer_exclude:
                # Exclude movies matching any of the producers
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
        elif isinstance(producer, str):
            escaped_name = producer.replace("'", "''")
            filter_condition = text(f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '$.credits.crew')) WHERE json_extract(json_each.value, '$.name') = '{escaped_name}' AND (json_extract(json_each.value, '$.job') = 'Producer' OR json_extract(json_each.value, '$.job') = 'Executive Producer'))")
            if producer_exclude:
                filter_condition = ~filter_condition
            query = query.filter(filter_condition)
    if spoken_language:
        # Filter by spoken language ISO code in tmdb_data.spoken_languages
        # Check if any spoken language ISO code matches (searching for the ISO code in the JSON)
        query = query.filter(
            func.cast(Movie.tmdb_data, String).like(f'%"iso_639_1":"{spoken_language}"%')
        )
    if collection is not None:
        # Filter by whether movie belongs to a collection (boolean)
        # collection=True means only show movies in a collection
        # collection=False means only show movies NOT in a collection
        if collection:
            # Movie has a collection if belongs_to_collection exists and is not null
            # Check if the JSON path exists and is not null
            query = query.filter(
                func.json_extract(Movie.tmdb_data, '$.belongs_to_collection').isnot(None)
            )
        else:
            # Movie does not have a collection if belongs_to_collection is null or doesn't exist
            # json_extract returns NULL if the path doesn't exist or is null
            query = query.filter(
                func.json_extract(Movie.tmdb_data, '$.belongs_to_collection').is_(None)
            )
    if favorites_only is not None:
        # Filter by favorites (boolean)
        # favorites_only=True means only show favorite movies
        # favorites_only=False means only show non-favorite movies
        if favorites_only:
            query = query.filter(Movie.is_favorite.is_(True))
        else:
            query = query.filter(Movie.is_favorite.is_(False))
    
    if seen_before is not None:
        # Filter by seen_before (boolean)
        # seen_before=True means only show movies that have been seen
        # seen_before=False means only show movies that haven't been seen
        if seen_before:
            query = query.filter(Movie.seen_before.is_(True))
        else:
            query = query.filter(Movie.seen_before.is_(False))
    
    if favorited_directors_only:
        # Filter movies to only show those from favorited directors
        favorite_directors = db.query(FavoriteDirector).all()
        if favorite_directors:
            favorite_director_names = [fd.director_name for fd in favorite_directors]
            query = query.filter(Movie.director.in_(favorite_director_names))
        else:
            # If no favorite directors, return empty result
            query = query.filter(Movie.id == -1)  # Impossible condition
    
    # Filter by date_added (created_at)
    if date_added_min is not None and isinstance(date_added_min, str):
        try:
            min_date = datetime.fromisoformat(date_added_min.replace('Z', '+00:00'))
            query = query.filter(Movie.created_at >= min_date)
        except (ValueError, AttributeError) as e:
            logger.warning(f"Invalid date_added_min format: {date_added_min}, error: {e}")
    if date_added_max is not None and isinstance(date_added_max, str):
        try:
            max_date = datetime.fromisoformat(date_added_max.replace('Z', '+00:00'))
            query = query.filter(Movie.created_at <= max_date)
        except (ValueError, AttributeError) as e:
            logger.warning(f"Invalid date_added_max format: {date_added_max}, error: {e}")
    
    # Apply list filters (tracked lists)
    if list_filters:
        try:
            filters_dict = json.loads(list_filters)
            if isinstance(filters_dict, dict):
                tracked_list_columns = get_tracked_list_names()
                
                # Handle OR groups
                or_groups = filters_dict.get('or_groups', [])
                and_filters = filters_dict.get('and_filters', {})
                
                # If the dict doesn't have 'or_groups' or 'and_filters' keys, treat it as legacy AND filters
                if not or_groups and not and_filters:
                    and_filters = filters_dict
                
                # Apply AND filters (traditional behavior)
                for column_name, filter_value in and_filters.items():
                    # Only process columns that are actual tracked lists
                    if column_name in tracked_list_columns and filter_value is not None:
                        # filter_value=True means only show movies in this list
                        # filter_value=False means only show movies NOT in this list
                        # Use raw SQL since these columns are dynamically added
                        if filter_value:
                            query = query.filter(text(f"movies.{column_name} = 1"))
                        else:
                            query = query.filter(text(f"movies.{column_name} = 0"))
                
                # Apply OR groups
                if or_groups and isinstance(or_groups, list):
                    or_conditions = []
                    for group in or_groups:
                        if isinstance(group, list):
                            # Simple array format: ["is_imdb_t250", "is_letterboxd_t250"]
                            group_conditions = []
                            for column_name in group:
                                if column_name in tracked_list_columns:
                                    group_conditions.append(text(f"movies.{column_name} = 1"))
                            if group_conditions:
                                or_conditions.append(or_(*group_conditions))
                        elif isinstance(group, dict) and 'filters' in group:
                            # Object format: {"filters": [{"is_imdb_t250": true}, ...]}
                            group_conditions = []
                            for filter_obj in group['filters']:
                                if isinstance(filter_obj, dict):
                                    for column_name, filter_value in filter_obj.items():
                                        if column_name in tracked_list_columns and filter_value is not None:
                                            if filter_value:
                                                group_conditions.append(text(f"movies.{column_name} = 1"))
                                            else:
                                                group_conditions.append(text(f"movies.{column_name} = 0"))
                            if group_conditions:
                                or_conditions.append(or_(*group_conditions))
                    
                    # Apply all OR groups (each group is OR'd internally, groups are AND'd together)
                    if or_conditions:
                        query = query.filter(and_(*or_conditions))
                        
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to parse list_filters parameter: {e}")
    
    # Filter by streaming service availability
    if streaming_service and watch_region and isinstance(watch_region, str):
        # Normalize country code to uppercase
        watch_region_upper = watch_region.upper()
        provider_type = streaming_provider_type or 'flatrate'  # Default to flatrate if not specified
        
        if isinstance(streaming_service, list) and len(streaming_service) > 0:
            streaming_conditions = []
            for provider_id in streaming_service:
                # Check if provider exists in watch/providers.results[watch_region][provider_type]
                # Use JSON path: $.watch.providers.results.WATCH_REGION.PROVIDER_TYPE[*].provider_id
                # Or try alternative path: $.watch/providers.results.WATCH_REGION.PROVIDER_TYPE[*].provider_id
                escaped_region = watch_region_upper.replace("'", "''")
                
                # Try both possible JSON paths for watch/providers
                # Path 1: $.watch.providers.results.US.flatrate[*].provider_id
                path1 = f"$.watch.providers.results.{escaped_region}.{provider_type}"
                # Path 2: $.'watch/providers'.results.US.flatrate[*].provider_id
                path2 = f"$.'watch/providers'.results.{escaped_region}.{provider_type}"
                
                # Use json_each to check if provider_id exists in the array
                # We need to check all provider types if streaming_provider_type is not specified
                if streaming_provider_type:
                    # Check specific provider type
                    condition1 = text(
                        f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path1}')) "
                        f"WHERE json_extract(json_each.value, '$.provider_id') = {provider_id})"
                    )
                    condition2 = text(
                        f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path2}')) "
                        f"WHERE json_extract(json_each.value, '$.provider_id') = {provider_id})"
                    )
                    streaming_conditions.append(or_(condition1, condition2))
                else:
                    # Check all provider types (flatrate, rent, buy, free, ads)
                    all_types = ['flatrate', 'rent', 'buy', 'free', 'ads']
                    type_conditions = []
                    for pt in all_types:
                        path1 = f"$.watch.providers.results.{escaped_region}.{pt}"
                        path2 = f"$.'watch/providers'.results.{escaped_region}.{pt}"
                        condition1 = text(
                            f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path1}')) "
                            f"WHERE json_extract(json_each.value, '$.provider_id') = {provider_id})"
                        )
                        condition2 = text(
                            f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path2}')) "
                            f"WHERE json_extract(json_each.value, '$.provider_id') = {provider_id})"
                        )
                        type_conditions.append(or_(condition1, condition2))
                    streaming_conditions.append(or_(*type_conditions))
            
            if streaming_conditions:
                # Movies matching ANY of the specified providers (OR logic)
                query = query.filter(or_(*streaming_conditions))
        elif isinstance(streaming_service, int):
            # Backward compatibility: handle single provider ID
            escaped_region = watch_region_upper.replace("'", "''")
            provider_type = streaming_provider_type or 'flatrate'
            
            if streaming_provider_type:
                path1 = f"$.watch.providers.results.{escaped_region}.{provider_type}"
                path2 = f"$.'watch/providers'.results.{escaped_region}.{provider_type}"
                condition1 = text(
                    f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path1}')) "
                    f"WHERE json_extract(json_each.value, '$.provider_id') = {streaming_service})"
                )
                condition2 = text(
                    f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path2}')) "
                    f"WHERE json_extract(json_each.value, '$.provider_id') = {streaming_service})"
                )
                query = query.filter(or_(condition1, condition2))
            else:
                # Check all provider types
                all_types = ['flatrate', 'rent', 'buy', 'free', 'ads']
                type_conditions = []
                for pt in all_types:
                    path1 = f"$.watch.providers.results.{escaped_region}.{pt}"
                    path2 = f"$.'watch/providers'.results.{escaped_region}.{pt}"
                    condition1 = text(
                        f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path1}')) "
                        f"WHERE json_extract(json_each.value, '$.provider_id') = {streaming_service})"
                    )
                    condition2 = text(
                        f"EXISTS (SELECT 1 FROM json_each(json_extract(movies.tmdb_data, '{path2}')) "
                        f"WHERE json_extract(json_each.value, '$.provider_id') = {streaming_service})"
                    )
                    type_conditions.append(or_(condition1, condition2))
                query = query.filter(or_(*type_conditions))
    
    # Availability filtering is now done in Python after fetching movies
    # (see Python-based filtering section below)
    
    # Helper function to get sort expression for a field
    def get_sort_expression(field: str):
        """Returns SQLAlchemy sort expression for a given field."""
        if field == "title":
            return Movie.title
        elif field == "year":
            # Sort by release_date from tmdb_data (more precise than year), fallback to year if release_date is missing
            release_date_expr = func.json_extract(Movie.tmdb_data, '$.release_date')
            year_fallback = text("CAST(movies.year AS TEXT) || '-01-01'")
            return func.coalesce(release_date_expr, year_fallback)
        elif field == "runtime":
            return Movie.runtime
        elif field == "director":
            return Movie.director
        elif field == "country":
            return Movie.country
        elif field == "original_language":
            return Movie.original_language
        elif field == "production_company":
            # Extract first production company from tmdb_data JSON array
            # Note: This is only used for non-first sorts. First sort uses expansion logic.
            # SQLite json_extract syntax: $.production_companies[0].name
            first_company = func.json_extract(Movie.tmdb_data, '$.production_companies[0].name')
            return func.coalesce(first_company, '')
        elif field == "genres":
            # Sort genres by first genre alphabetically
            # Extract first genre from JSON array and convert to string for sorting
            first_genre = func.json_extract(Movie.genres, '$[0]')
            return func.coalesce(first_genre, '')
        elif field == "in_collection":
            # Boolean: check if belongs_to_collection exists in tmdb_data
            # Returns 1 if collection exists, 0/null if not
            return case(
                (func.json_extract(Movie.tmdb_data, '$.belongs_to_collection').isnot(None), 1),
                else_=0
            )
        elif field == "is_favorite":
            return Movie.is_favorite
        elif field == "date_added":
            return Movie.created_at
        elif field.startswith("is_"):
            # Handle tracked list columns (dynamically added, stored as INTEGER)
            # Use text() to safely reference the column by name
            # Since these columns are dynamically added, we use text() to avoid AttributeError
            return text(f"movies.{field}")
        else:
            # Default: sort by release_date (fallback to year)
            release_date_expr = func.json_extract(Movie.tmdb_data, '$.release_date')
            year_fallback = text("CAST(movies.year AS TEXT) || '-01-01'")
            return func.coalesce(release_date_expr, year_fallback)
    
    # Parse sorts to determine if we need expansion (genres or production_company)
    first_sort_needs_expansion = False
    first_sort_field = None
    sorts_list = []
    if sorts:
        try:
            sorts_list = json.loads(sorts)
            if isinstance(sorts_list, list) and len(sorts_list) > 0:
                first_sort = sorts_list[0]
                if isinstance(first_sort, dict):
                    first_sort_field = first_sort.get('field')
                    if first_sort_field in ['genres', 'production_company']:
                        first_sort_needs_expansion = True
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to parse sorts parameter: {e}")
    
    # Build order_by list
    order_by_list = []
    
    # Add favorites first if requested
    if show_favorites_first:
        order_by_list.append(Movie.is_favorite.desc())
    
    # Parse sorts parameter if provided (new format)
    if sorts:
        try:
            if isinstance(sorts_list, list):
                for sort_obj in sorts_list:
                    if isinstance(sort_obj, dict) and 'field' in sort_obj and 'order' in sort_obj:
                        field = sort_obj['field']
                        # Skip genres and production_company from SQL order_by if they're the first sort (we'll handle it in Python)
                        if field in ['genres', 'production_company'] and first_sort_needs_expansion and field == first_sort_field:
                            continue
                        order = sort_obj['order']
                        expr = get_sort_expression(field)
                        if order == "asc":
                            order_by_list.append(expr.asc().nullslast())
                        else:
                            order_by_list.append(expr.desc().nullslast())
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to parse sorts parameter: {e}")
            # Fall back to default sorting
    
    # Backward compatibility: use sort_by/sort_order if sorts not provided
    if not sorts and sort_by:
        expr = get_sort_expression(sort_by)
        sort_order_val = sort_order if sort_order else "desc"
        if sort_order_val == "asc":
            order_by_list.append(expr.asc().nullslast())
        else:
            order_by_list.append(expr.desc().nullslast())
        # Add secondary sort by title for backward compatibility
        order_by_list.append(Movie.title.asc().nullslast())
    elif not sorts and not sort_by:
        # Default: sort by release_date (fallback to year)
        expr = get_sort_expression("year")
        order_by_list.append(expr.desc().nullslast())
        order_by_list.append(Movie.title.asc().nullslast())
    
    # Apply all sorts (excluding genres/production_company if they're the first sort)
    if order_by_list:
        query = query.order_by(*order_by_list)
    
    # Fetch all movies after SQL filters (before Python-based availability filtering and expansion)
    all_movies = query.all()
    
    # Apply Python-based availability filtering if needed
    if (availability_type is not None and
        isinstance(availability_type, list) and len(availability_type) > 0 and
        watch_region and 
        preferred_services is not None and 
        len(preferred_services) > 0):
        
        filtered_movies = []
        for movie in all_movies:
            matches_availability = check_movie_availability(
                movie.tmdb_data,
                watch_region,
                preferred_services,
                availability_type
            )
            # If availability_exclude is True, include movies that DON'T match
            # If availability_exclude is False, include movies that DO match
            if availability_exclude:
                if not matches_availability:
                    filtered_movies.append(movie)
            else:
                if matches_availability:
                    filtered_movies.append(movie)
        all_movies = filtered_movies
    
    # Handle expansion: if sorting by genres or production_company first, expand movies
    if first_sort_needs_expansion and first_sort_field:
        # Use the already-fetched (and possibly filtered) movies
        
        # Expand movies by genres or production_company
        expanded_movies = []
        for movie in all_movies:
            if first_sort_field == 'genres':
                movie_genres = movie.genres or []
                if not movie_genres or len(movie_genres) == 0:
                    # Movies with no genres appear once with empty genre
                    expanded_movies.append((movie, None))
                else:
                    # Create one entry per genre
                    for genre in sorted(movie_genres):  # Sort genres alphabetically for consistent ordering
                        expanded_movies.append((movie, genre))
            elif first_sort_field == 'production_company':
                # Extract production companies from tmdb_data
                production_companies = []
                if movie.tmdb_data:
                    tmdb_data = movie.tmdb_data
                    if isinstance(tmdb_data, str):
                        try:
                            tmdb_data = json.loads(tmdb_data)
                        except Exception as e:
                            logger.warning(f"Failed to parse tmdb_data for movie {movie.id}: {e}")
                            tmdb_data = {}
                    if isinstance(tmdb_data, dict):
                        prod_companies = tmdb_data.get('production_companies', [])
                        if prod_companies and isinstance(prod_companies, list):
                            company_names = [company.get('name') for company in prod_companies if isinstance(company, dict) and company.get('name')]
                            production_companies = sorted(company_names)  # Sort alphabetically
                
                if not production_companies or len(production_companies) == 0:
                    # Movies with no production companies appear once with empty company
                    expanded_movies.append((movie, None))
                else:
                    # Create one entry per production company
                    for company in production_companies:
                        expanded_movies.append((movie, company))
            else:
                # Fallback: should not happen, but if it does, add movie without expansion
                logger.warning(f"Unexpected first_sort_field: {first_sort_field}, adding movie without expansion")
                expanded_movies.append((movie, None))
        
        # Sort expanded movies by first sort field, then by other sorts
        first_sort_order = sorts_list[0].get('order', 'asc') if sorts_list else 'asc'
        other_sorts = sorts_list[1:] if len(sorts_list) > 1 else []
        
        def get_sort_key(item):
            movie, first_sort_value = item
            key = []
            
            # First sort by the expansion field (genre or production_company)
            # Use sentinel value for nulls to ensure they sort last
            if first_sort_value:
                sort_value = first_sort_value
            else:
                # Use a large Unicode string that sorts after everything
                sort_value = '\uffff' * 100
            key.append((sort_value, first_sort_order == 'desc'))
            
            # Then by other sorts
            for sort_obj in other_sorts:
                if not isinstance(sort_obj, dict) or 'field' not in sort_obj:
                    continue
                field = sort_obj['field']
                order = sort_obj.get('order', 'asc')
                is_desc = order == 'desc'
                
                if field == 'title':
                    if movie.title:
                        value = movie.title
                    else:
                        # Nulls sort last: use large string
                        value = '\uffff' * 100
                    key.append((value, is_desc))
                elif field == 'year':
                    if movie.year is not None:
                        value = movie.year
                    else:
                        # Nulls sort last: use inf for asc, -inf for desc
                        value = float('inf') if not is_desc else float('-inf')
                    key.append((value, is_desc))
                elif field == 'runtime':
                    if movie.runtime is not None:
                        value = movie.runtime
                    else:
                        # Nulls sort last: use inf for asc, -inf for desc
                        value = float('inf') if not is_desc else float('-inf')
                    key.append((value, is_desc))
                elif field == 'director':
                    if movie.director:
                        value = movie.director
                    else:
                        # Nulls sort last: use large string
                        value = '\uffff' * 100
                    key.append((value, is_desc))
                elif field == 'country':
                    if movie.country:
                        value = movie.country
                    else:
                        # Nulls sort last: use large string
                        value = '\uffff' * 100
                    key.append((value, is_desc))
                elif field == 'original_language':
                    value = ''
                    if movie.tmdb_data:
                        tmdb_data = movie.tmdb_data
                        if isinstance(tmdb_data, str):
                            try:
                                tmdb_data = json.loads(tmdb_data)
                            except:
                                tmdb_data = {}
                        if isinstance(tmdb_data, dict):
                            value = tmdb_data.get('original_language', '') or ''
                    if not value:
                        # Nulls sort last: use large string
                        value = '\uffff' * 100
                    key.append((value, is_desc))
                elif field == 'production_company':
                    # For production_company in secondary sorts, use first company from tmdb_data
                    value = ''
                    if movie.tmdb_data:
                        tmdb_data = movie.tmdb_data
                        if isinstance(tmdb_data, str):
                            try:
                                tmdb_data = json.loads(tmdb_data)
                            except:
                                tmdb_data = {}
                        if isinstance(tmdb_data, dict):
                            prod_companies = tmdb_data.get('production_companies', [])
                            if prod_companies and isinstance(prod_companies, list) and len(prod_companies) > 0:
                                first_company = prod_companies[0].get('name') if isinstance(prod_companies[0], dict) else ''
                                value = first_company or ''
                    if not value:
                        # Nulls sort last: use large string
                        value = '\uffff' * 100
                    key.append((value, is_desc))
                elif field == 'date_added':
                    if movie.created_at:
                        value = movie.created_at
                    else:
                        # Nulls sort last: use future date for asc, past date for desc
                        value = datetime.max if not is_desc else datetime.min
                    key.append((value, is_desc))
                elif field == 'is_favorite':
                    value = bool(movie.is_favorite)
                    key.append((value, order == 'desc'))
                elif field == 'in_collection':
                    if movie.tmdb_data:
                        tmdb_data = movie.tmdb_data
                        if isinstance(tmdb_data, str):
                            try:
                                tmdb_data = json.loads(tmdb_data)
                            except:
                                tmdb_data = {}
                        if isinstance(tmdb_data, dict):
                            belongs_to_collection = tmdb_data.get('belongs_to_collection')
                            value = belongs_to_collection is not None and belongs_to_collection != ''
                        else:
                            value = False
                    else:
                        value = False
                    key.append((value, order == 'desc'))
                # Add is_favorite handling for favorites first
                if show_favorites_first:
                    # Already handled in initial query sorting, but need to maintain order
                    pass
            
            return key
        
        # Sort expanded movies
        expanded_movies.sort(key=lambda x: get_sort_key(x))
        
        # Get total count from expanded list
        total = len(expanded_movies)
        
        # Apply pagination to expanded list
        paginated_expanded = expanded_movies[skip:skip + limit]
        
        # Extract just the movies (drop the expansion metadata)
        movies = [movie for movie, _ in paginated_expanded]
    else:
        # Normal sorting path (no genre expansion)
        # Get total count from filtered list
        total = len(all_movies)
        
        # Apply pagination to filtered list
        movies = all_movies[skip:skip + limit]
    
    # Pre-fetch tracked list memberships for all movies in one query (more efficient)
    tracked_list_columns = get_tracked_list_names()
    tracked_list_data = {}
    if tracked_list_columns and movies:
        movie_ids = [movie.id for movie in movies]
        if movie_ids:
            # Build query to get all tracked list columns for all movies at once
            # IDs are safe since they come from the database
            columns_str = ', '.join(['id'] + tracked_list_columns)
            ids_str = ', '.join([str(mid) for mid in movie_ids])
            query_str = f"SELECT {columns_str} FROM movies WHERE id IN ({ids_str})"
            results = db.execute(text(query_str)).fetchall()
            
            # Build a dictionary mapping movie_id to list memberships
            for result in results:
                movie_id = result[0]
                list_memberships = {}
                for idx, column_name in enumerate(tracked_list_columns):
                    # SQLite stores booleans as integers (0/1)
                    value = result[idx + 1] if result[idx + 1] is not None else 0
                    list_memberships[column_name] = bool(value)
                tracked_list_data[movie_id] = list_memberships
    
    # Convert to dict format
    movies_data = []
    for movie in movies:
        # Extract poster URL, original_language, and other TMDB fields if available
        poster_url = None
        original_language = None
        production_company = None
        in_collection = False
        if movie.tmdb_data:
            # Handle both dict and string (JSON) formats
            # SQLite stores JSON as TEXT, SQLAlchemy should deserialize it automatically
            # but sometimes it might come as a string
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    logger.warning(f"Could not parse tmdb_data for movie {movie.id}: {type(tmdb_data)}")
                    tmdb_data = None
            
            if isinstance(tmdb_data, dict):
                poster_path = tmdb_data.get('poster_path')
                # Check if poster_path exists and is not None/empty
                if poster_path and str(poster_path).strip() and str(poster_path).lower() != 'none':
                    poster_path = str(poster_path).strip()
                    # Ensure poster_path starts with / if it doesn't already
                    if not poster_path.startswith('/'):
                        poster_path = '/' + poster_path
                    poster_url = f"https://image.tmdb.org/t/p/w300{poster_path}"
                else:
                    logger.debug(f"No valid poster_path for movie {movie.id} ({movie.title}): {poster_path}")
                
                # Extract original_language
                original_language = tmdb_data.get('original_language')
                # Handle empty strings as None
                if original_language == '' or original_language is None:
                    original_language = None
                # Log if original_language is missing (for debugging)
                if original_language is None and logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"original_language not found in tmdb_data for movie {movie.id} ({movie.title})")
                
                # Extract production_company (take first company name, or join if multiple)
                production_companies = tmdb_data.get('production_companies', [])
                if production_companies and isinstance(production_companies, list) and len(production_companies) > 0:
                    company_names = [company.get('name') for company in production_companies if isinstance(company, dict) and company.get('name')]
                    if company_names:
                        production_company = company_names[0]  # Use first company, or could join all
                
                # Extract collection status
                belongs_to_collection = tmdb_data.get('belongs_to_collection')
                in_collection = belongs_to_collection is not None and belongs_to_collection != ''
            else:
                logger.debug(f"tmdb_data is not a dict for movie {movie.id}: {type(tmdb_data)}")
        
        # Get tracked list memberships from pre-fetched data
        list_memberships = tracked_list_data.get(movie.id, {})
        if not list_memberships and tracked_list_columns:
            # If not found in pre-fetched data, initialize with all False
            list_memberships = {col: False for col in tracked_list_columns}
        
        # Format created_at as ISO string for frontend
        date_added = None
        if movie.created_at:
            if isinstance(movie.created_at, str):
                date_added = movie.created_at
            else:
                # Convert datetime to ISO format string
                date_added = movie.created_at.isoformat()
        
        movies_data.append({
            "id": movie.id,
            "title": movie.title,
            "year": movie.year,
            "letterboxd_uri": movie.letterboxd_uri,
            "director": movie.director,
            "country": movie.country,
            "runtime": movie.runtime,
            "genres": movie.genres or [],
            "tmdb_id": movie.tmdb_id,
            "poster_url": poster_url,
            "original_language": original_language,
            "is_favorite": bool(movie.is_favorite),
            "seen_before": bool(movie.seen_before) if hasattr(movie, 'seen_before') else False,
            "notes": movie.notes or "",
            "production_company": production_company,
            "in_collection": in_collection,
            "date_added": date_added,
            **list_memberships
        })
    
    return {
        "movies": movies_data,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/api/movies/stats")
def get_stats(db: Session = Depends(get_db)):
    """
    Get statistics about the movie collection.
    """
    total_movies = db.query(Movie).count()
    
    # Year distribution
    years = db.query(Movie.year).all()
    year_list = [y[0] for y in years if y[0] is not None]
    year_min = min(year_list) if year_list else None
    year_max = max(year_list) if year_list else None
    
    # Total runtime
    runtimes = db.query(Movie.runtime).filter(Movie.runtime.isnot(None)).all()
    runtime_list = [r[0] for r in runtimes if r[0] is not None]
    total_runtime = sum(runtime_list) if runtime_list else 0
    
    # Unique directors
    directors = db.query(Movie.director).filter(Movie.director.isnot(None)).distinct().all()
    unique_directors = len([d[0] for d in directors if d[0]])
    
    # Unique countries
    countries = db.query(Movie.country).filter(Movie.country.isnot(None)).distinct().all()
    unique_countries = len([c[0] for c in countries if c[0]])
    
    # Favorite movies count
    favorite_movies_count = db.query(Movie).filter(Movie.is_favorite.is_(True)).count()
    
    # Favorite movies runtime
    favorite_runtimes = db.query(Movie.runtime).filter(
        Movie.is_favorite.is_(True),
        Movie.runtime.isnot(None)
    ).all()
    favorite_runtime_list = [r[0] for r in favorite_runtimes if r[0] is not None]
    favorite_runtime = sum(favorite_runtime_list) if favorite_runtime_list else 0
    
    # Genre distribution
    all_genres = []
    movies_with_genres = db.query(Movie.genres).filter(Movie.genres.isnot(None)).all()
    for genres in movies_with_genres:
        if genres[0]:
            all_genres.extend(genres[0])
    
    genre_counts = {}
    for genre in all_genres:
        genre_counts[genre] = genre_counts.get(genre, 0) + 1
    
    return {
        "total_movies": total_movies,
        "year_range": {
            "min": year_min,
            "max": year_max
        },
        "total_runtime": total_runtime,
        "favorite_runtime": favorite_runtime,
        "unique_directors": unique_directors,
        "unique_countries": unique_countries,
        "favorite_movies": favorite_movies_count,
        "genre_distribution": genre_counts
    }

@router.get("/api/movies/directors")
def get_directors(db: Session = Depends(get_db)):
    """
    Get list of all unique directors.
    """
    directors = db.query(Movie.director).filter(
        Movie.director.isnot(None)
    ).distinct().order_by(Movie.director).all()
    
    return [d[0] for d in directors if d[0]]

@router.get("/api/movies/countries")
def get_countries(db: Session = Depends(get_db)):
    """
    Get list of all unique countries.
    """
    countries = db.query(Movie.country).filter(
        Movie.country.isnot(None)
    ).distinct().order_by(Movie.country).all()
    
    return [c[0] for c in countries if c[0]]

@router.get("/api/movies/genres")
def get_genres(db: Session = Depends(get_db)):
    """
    Get list of all unique genres.
    """
    all_genres = set()
    movies_with_genres = db.query(Movie.genres).filter(Movie.genres.isnot(None)).all()
    for genres in movies_with_genres:
        if genres[0]:
            all_genres.update(genres[0])
    
    return sorted(list(all_genres))

@router.get("/api/movies/original-languages")
def get_original_languages(db: Session = Depends(get_db)):
    """
    Get list of all unique original languages.
    """
    all_languages = set()
    movies = db.query(Movie).filter(Movie.tmdb_data.isnot(None)).all()
    for movie in movies:
        if movie.tmdb_data:
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    continue
            if isinstance(tmdb_data, dict):
                original_language = tmdb_data.get('original_language')
                if original_language:
                    all_languages.add(original_language)
    
    return sorted(list(all_languages))

@router.get("/api/movies/production-companies")
def get_production_companies(db: Session = Depends(get_db)):
    """
    Get list of all unique production companies.
    """
    all_companies = set()
    movies = db.query(Movie).filter(Movie.tmdb_data.isnot(None)).all()
    for movie in movies:
        if movie.tmdb_data:
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    continue
            if isinstance(tmdb_data, dict):
                production_companies = tmdb_data.get('production_companies', [])
                for company in production_companies:
                    if isinstance(company, dict):
                        company_name = company.get('name')
                        if company_name:
                            all_companies.add(company_name)
    
    return sorted(list(all_companies))

@router.get("/api/movies/spoken-languages")
def get_spoken_languages(db: Session = Depends(get_db)):
    """
    Get list of all unique spoken languages (ISO codes).
    """
    all_languages = set()
    movies = db.query(Movie).filter(Movie.tmdb_data.isnot(None)).all()
    for movie in movies:
        if movie.tmdb_data:
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    continue
            if isinstance(tmdb_data, dict):
                spoken_languages = tmdb_data.get('spoken_languages', [])
                for lang in spoken_languages:
                    if isinstance(lang, dict):
                        iso_code = lang.get('iso_639_1')
                        if iso_code:
                            all_languages.add(iso_code)
    
    return sorted(list(all_languages))

@router.get("/api/movies/actors")
def get_actors(db: Session = Depends(get_db)):
    """
    Get list of all unique actors from cast.
    """
    all_actors = set()
    movies = db.query(Movie).filter(Movie.tmdb_data.isnot(None)).all()
    for movie in movies:
        if movie.tmdb_data:
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    continue
            if isinstance(tmdb_data, dict):
                credits = tmdb_data.get('credits', {})
                cast = credits.get('cast', [])
                for actor in cast:
                    if isinstance(actor, dict):
                        actor_name = actor.get('name')
                        if actor_name:
                            all_actors.add(actor_name)
    
    return sorted(list(all_actors))

@router.get("/api/movies/writers")
def get_writers(db: Session = Depends(get_db)):
    """
    Get list of all unique writers from crew.
    """
    all_writers = set()
    movies = db.query(Movie).filter(Movie.tmdb_data.isnot(None)).all()
    for movie in movies:
        if movie.tmdb_data:
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    continue
            if isinstance(tmdb_data, dict):
                credits = tmdb_data.get('credits', {})
                crew = credits.get('crew', [])
                for person in crew:
                    if isinstance(person, dict):
                        job = person.get('job')
                        if job in ('Writer', 'Screenplay'):
                            writer_name = person.get('name')
                            if writer_name:
                                all_writers.add(writer_name)
    
    return sorted(list(all_writers))

@router.get("/api/movies/producers")
def get_producers(db: Session = Depends(get_db)):
    """
    Get list of all unique producers from crew.
    """
    all_producers = set()
    movies = db.query(Movie).filter(Movie.tmdb_data.isnot(None)).all()
    for movie in movies:
        if movie.tmdb_data:
            tmdb_data = movie.tmdb_data
            if isinstance(tmdb_data, str):
                try:
                    tmdb_data = json.loads(tmdb_data)
                except (json.JSONDecodeError, TypeError):
                    continue
            if isinstance(tmdb_data, dict):
                credits = tmdb_data.get('credits', {})
                crew = credits.get('crew', [])
                for person in crew:
                    if isinstance(person, dict):
                        job = person.get('job')
                        if job in ('Producer', 'Executive Producer'):
                            producer_name = person.get('name')
                            if producer_name:
                                all_producers.add(producer_name)
    
    return sorted(list(all_producers))

@router.get("/api/movies/search-tmdb")
def search_tmdb_movie(
    title: str = Query(...),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Search for movies on TMDB by title and optional year.
    Returns search results for user disambiguation.
    """
    if not tmdb_client:
        raise HTTPException(status_code=503, detail="TMDB client not configured")
    
    if not title or not title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    
    # Use the search_movie method which returns a single best match
    # For disambiguation, we'll call the TMDB API directly to get multiple results
    try:
        import requests
        from config import TMDB_API_KEY, TMDB_BASE_URL
        
        params = {
            'api_key': TMDB_API_KEY,
            'query': title.strip(),
            'language': 'en-US'
        }
        
        if year:
            params['year'] = year
        
        response = requests.get(
            f"{TMDB_BASE_URL}/search/movie",
            params=params,
            timeout=10
        )
        response.raise_for_status()
        
        data = response.json()
        results = data.get('results', [])
        
        # Limit to top 10 results and format for frontend
        formatted_results = []
        for result in results[:10]:
            release_date = result.get('release_date', '')
            movie_year = None
            if release_date:
                try:
                    movie_year = int(release_date[:4])
                except (ValueError, IndexError):
                    pass
            
            formatted_results.append({
                'tmdb_id': result.get('id'),
                'title': result.get('title'),
                'original_title': result.get('original_title'),
                'year': movie_year,
                'release_date': release_date,
                'overview': result.get('overview'),
                'poster_path': result.get('poster_path'),
                'vote_count': result.get('vote_count')
            })
        
        return {
            'results': formatted_results,
            'total_results': data.get('total_results', 0)
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"Error searching TMDB for '{title}': {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching TMDB: {str(e)}")

@router.get("/api/movies/export")
def export_movies(
    format: str = Query("csv", regex="^(csv|json|markdown|letterboxd)$"),
    columns: Optional[str] = Query(None, description="Comma-separated list of columns to include"),
    include_notes: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1, le=100000),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    director: Optional[List[str]] = Query(None),
    director_exclude: bool = Query(False),
    country: Optional[List[str]] = Query(None),
    country_exclude: bool = Query(False),
    genre: Optional[List[str]] = Query(None),
    genre_exclude: bool = Query(False),
    runtime_min: Optional[int] = Query(None),
    runtime_max: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    favorites_only: Optional[bool] = Query(None),
    list_filters: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Export movies in various formats (CSV, JSON, Markdown).
    Supports all the same filters as GET /api/movies.
    """
    # Use the same filtering logic as get_movies by calling it
    # We need to get all matching movies, so set a high limit
    export_limit = limit if limit else 100000
    
    # Call get_movies with all the same parameters
    # Note: Must pass None explicitly for parameters not in export endpoint to avoid Query object issues
    movies_result = get_movies(
        skip=0,
        limit=export_limit,
        year_min=year_min,
        year_max=year_max,
        director=director,
        director_exclude=director_exclude,
        country=country,
        country_exclude=country_exclude,
        genre=genre,
        genre_exclude=genre_exclude,
        runtime_min=runtime_min,
        runtime_max=runtime_max,
        search=search,
        favorites_only=favorites_only,
        list_filters=list_filters,
        # Parameters not in export endpoint - pass None explicitly
        original_language=None,
        original_language_exclude=False,
        production_company=None,
        production_company_exclude=False,
        spoken_language=None,
        actor=None,
        actor_exclude=False,
        writer=None,
        writer_exclude=False,
        producer=None,
        producer_exclude=False,
        collection=None,
        date_added_min=None,
        date_added_max=None,
        sort_by=None,
        sort_order=None,
        sorts=None,
        show_favorites_first=False,
        streaming_service=None,
        watch_region=None,  # This was causing the error - must be None, not Query object
        streaming_provider_type=None,
        availability_type=None,
        availability_exclude=False,
        preferred_services=None,
        db=db
    )
    
    movies = movies_result["movies"]
    
    # Parse columns if provided
    selected_columns = None
    if columns:
        selected_columns = [col.strip() for col in columns.split(",")]
    
    # For letterboxd format, use specific columns
    if format == "letterboxd":
        selected_columns = ["title", "year", "director", "letterboxd_uri"]
    # Default columns if not specified
    elif not selected_columns:
        selected_columns = ["title", "year", "director", "runtime", "genres"]
        if include_notes:
            selected_columns.append("notes")
    
    # Export based on format
    if format == "letterboxd":
        import csv
        from io import StringIO
        
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header with Letterboxd format column names
        writer.writerow(["Title", "Year", "Directors", "LetterboxdURI"])
        
        # Write rows
        for movie in movies:
            title = movie.get("title", "")
            year = movie.get("year", "")
            director = movie.get("director", "")
            # Handle director as list or string
            if isinstance(director, list):
                directors = ", ".join(str(d) for d in director if d)
            else:
                directors = str(director) if director else ""
            letterboxd_uri = movie.get("letterboxd_uri", "")
            
            writer.writerow([title, year, directors, letterboxd_uri])
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="letterboxd-export-{datetime.utcnow().strftime("%Y%m%d")}.csv"'}
        )
    
    elif format == "csv":
        import csv
        from io import StringIO
        
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(selected_columns)
        
        # Write rows
        for movie in movies:
            row = []
            for col in selected_columns:
                value = movie.get(col, "")
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                elif value is None:
                    value = ""
                row.append(str(value))
            writer.writerow(row)
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="movies-export-{datetime.utcnow().strftime("%Y%m%d")}.csv"'}
        )
    
    elif format == "json":
        # Filter movies to only include selected columns
        filtered_movies = []
        for movie in movies:
            filtered_movie = {col: movie.get(col) for col in selected_columns}
            filtered_movies.append(filtered_movie)
        
        json_str = json.dumps(filtered_movies, indent=2, ensure_ascii=False)
        return Response(
            content=json_str,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="movies-export-{datetime.utcnow().strftime("%Y%m%d")}.json"'}
        )
    
    elif format == "markdown":
        output_lines = ["# Movies Export\n"]
        output_lines.append(f"Exported: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}\n")
        output_lines.append(f"Total: {len(movies)} movies\n\n")
        output_lines.append("| " + " | ".join(selected_columns) + " |")
        output_lines.append("| " + " | ".join(["---"] * len(selected_columns)) + " |")
        
        for movie in movies:
            row = []
            for col in selected_columns:
                value = movie.get(col, "")
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                elif value is None:
                    value = ""
                # Escape pipe characters in markdown
                value = str(value).replace("|", "\\|")
                row.append(str(value))
            output_lines.append("| " + " | ".join(row) + " |")
        
        return Response(
            content="\n".join(output_lines),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="movies-export-{datetime.utcnow().strftime("%Y%m%d")}.md"'}
        )

@router.get("/api/movies/{movie_id}")
def get_movie(movie_id: int, db: Session = Depends(get_db)):
    """
    Get a single movie by ID with all TMDB data.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    # Get tracked list memberships
    # Since these columns are dynamically added and not in the model,
    # we need to query them directly from the database
    tracked_list_columns = get_tracked_list_names()
    list_memberships = {}
    if tracked_list_columns:
        result = db.execute(
            text(f"SELECT {', '.join([col for col in tracked_list_columns])} FROM movies WHERE id = :movie_id"),
            {"movie_id": movie.id}
        ).fetchone()
        if result:
            for idx, column_name in enumerate(tracked_list_columns):
                # SQLite stores booleans as integers (0/1)
                value = result[idx] if result[idx] is not None else 0
                list_memberships[column_name] = bool(value)
        else:
            # If no result, set all to False
            for column_name in tracked_list_columns:
                list_memberships[column_name] = False
    
    # Format created_at as ISO string for frontend
    date_added = None
    if movie.created_at:
        if isinstance(movie.created_at, str):
            date_added = movie.created_at
        else:
            # Convert datetime to ISO format string
            date_added = movie.created_at.isoformat()
    
    # Build response with all available data
    movie_data = {
        "id": movie.id,
        "title": movie.title,
        "year": movie.year,
        "letterboxd_uri": movie.letterboxd_uri,
        "director": movie.director,
        "country": movie.country,
        "runtime": movie.runtime,
        "genres": movie.genres or [],
        "tmdb_id": movie.tmdb_id,
        "tmdb_data": movie.tmdb_data,
        "is_favorite": bool(movie.is_favorite),
        "seen_before": bool(movie.seen_before) if hasattr(movie, 'seen_before') else False,
        "notes": movie.notes or "",
        "date_added": date_added,
        **list_memberships
    }
    
    return movie_data

@router.post("/api/movies")
def add_movie(
    movie_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Add a new movie to the database.
    Accepts JSON body with: title (required), year (required), and optional fields: letterboxd_uri, notes, is_favorite, seen_before.
    Automatically enriches data from TMDB and checks tracked lists.
    """
    # Extract fields from request body
    title = movie_data.get('title', '').strip() if movie_data.get('title') else ''
    year = movie_data.get('year')
    letterboxd_uri = movie_data.get('letterboxd_uri')
    if letterboxd_uri:
        letterboxd_uri = letterboxd_uri.strip()
        if not letterboxd_uri:
            letterboxd_uri = None
    notes = movie_data.get('notes')
    if notes:
        notes = notes.strip()
        if not notes:
            notes = None
    is_favorite = movie_data.get('is_favorite', False)
    seen_before = movie_data.get('seen_before', False)
    
    # Validate required fields
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not year or not isinstance(year, int) or year < 1888 or year > 2100:
        raise HTTPException(status_code=400, detail="Valid year is required (1888-2100)")
    
    # Check for duplicates by letterboxd_uri (if provided)
    existing = None
    if letterboxd_uri:
        existing = db.query(Movie).filter(
            Movie.letterboxd_uri == letterboxd_uri
        ).first()
    
    # Also check for existing movie by title+year to prevent duplicates
    if not existing:
        existing = db.query(Movie).filter(
            Movie.title == title,
            Movie.year == year
        ).first()
        if existing:
            logger.info(f"Movie {title} ({year}) already exists with different URI, returning existing movie")
    
    if existing:
        # Return existing movie instead of creating duplicate
        raise HTTPException(
            status_code=409,
            detail=f"Movie '{title}' ({year}) already exists",
            headers={"X-Movie-Id": str(existing.id)}
        )
    
    # Load tracked lists for checking membership
    project_root = get_project_root()
    tracked_lists_dir = project_root / "tracked-lists"
    tracked_lists = load_tracked_lists(tracked_lists_dir)
    
    # Check cache for TMDB data by title and year
    cached_movie = db.query(Movie).filter(
        Movie.title == title.strip(),
        Movie.year == year
    ).first()
    
    enriched_data = None
    
    # If we have cached TMDB data, use it
    if cached_movie and cached_movie.tmdb_data:
        logger.info(f"Using cached TMDB data for {title} ({year})")
        enriched_data = extract_enriched_data_from_tmdb(cached_movie.tmdb_data)
    elif tmdb_client:
        # No cache found, fetch from TMDB API
        logger.info(f"Fetching TMDB data for {title} ({year})")
        enriched_data = tmdb_client.enrich_movie_data(title, year)
        if not enriched_data:
            logger.warning(f"Could not find TMDB data for {title} ({year}), creating movie with minimal data")
    
    # Create movie record
    movie_kwargs = {
        'title': title,
        'year': year,
        'letterboxd_uri': letterboxd_uri or f"letterboxd:film/{title.lower().replace(' ', '-')}-{year}",
        'director': enriched_data.get('director') if enriched_data else None,
        'country': enriched_data.get('country') if enriched_data else None,
        'runtime': enriched_data.get('runtime') if enriched_data else None,
        'genres': enriched_data.get('genres') if enriched_data else [],
        'tmdb_id': enriched_data.get('tmdb_id') if enriched_data else None,
        'tmdb_data': enriched_data.get('tmdb_data') if enriched_data else None,
        'notes': notes if notes else None,
        'is_favorite': is_favorite,
        'seen_before': seen_before
    }
    
    movie = Movie(**movie_kwargs)
    db.add(movie)
    db.flush()  # Flush to get the movie ID
    
    # Check if this movie is in any tracked lists
    try:
        check_movie_in_tracked_lists(movie, tracked_lists)
    except Exception as e:
        logger.warning(f"Error checking tracked lists for {title}: {str(e)}")
        # Don't fail the entire operation if tracked list check fails
    
    db.commit()
    db.refresh(movie)
    
    logger.info(f"Successfully added movie: {title} ({year})")
    
    # Get tracked list memberships for response
    tracked_list_columns = get_tracked_list_names()
    list_memberships = {}
    if tracked_list_columns:
        result = db.execute(
            text(f"SELECT {', '.join([col for col in tracked_list_columns])} FROM movies WHERE id = :movie_id"),
            {"movie_id": movie.id}
        ).fetchone()
        if result:
            for idx, column_name in enumerate(tracked_list_columns):
                value = result[idx] if result[idx] is not None else 0
                list_memberships[column_name] = bool(value)
        else:
            for column_name in tracked_list_columns:
                list_memberships[column_name] = False
    
    # Format created_at as ISO string for frontend
    date_added = None
    if movie.created_at:
        if isinstance(movie.created_at, str):
            date_added = movie.created_at
        else:
            date_added = movie.created_at.isoformat()
    
    # Build response with all available data
    movie_data = {
        "id": movie.id,
        "title": movie.title,
        "year": movie.year,
        "letterboxd_uri": movie.letterboxd_uri,
        "director": movie.director,
        "country": movie.country,
        "runtime": movie.runtime,
        "genres": movie.genres or [],
        "tmdb_id": movie.tmdb_id,
        "tmdb_data": movie.tmdb_data,
        "is_favorite": bool(movie.is_favorite),
        "seen_before": bool(movie.seen_before) if hasattr(movie, 'seen_before') else False,
        "notes": movie.notes or "",
        "date_added": date_added,
        **list_memberships
    }
    
    return movie_data

@router.get("/api/movies/tmdb/{tmdb_id}/details")
def get_tmdb_movie_details(
    tmdb_id: int,
    db: Session = Depends(get_db)
):
    """
    Get full movie details from TMDB by TMDB ID.
    Returns poster, overview, genres, language, and other details for confirmation view.
    """
    if not tmdb_client:
        raise HTTPException(status_code=503, detail="TMDB client not configured")
    
    try:
        details = tmdb_client.get_movie_details(tmdb_id)
        
        if not details:
            raise HTTPException(status_code=404, detail=f"Movie with TMDB ID {tmdb_id} not found")
        
        # Extract year from release_date
        release_date = details.get('release_date', '')
        movie_year = None
        if release_date:
            try:
                movie_year = int(release_date[:4])
            except (ValueError, IndexError):
                pass
        
        # Extract genres (convert from objects to names)
        genres = [genre.get('name') for genre in details.get('genres', [])]
        
        # Get original language name if possible
        original_language_code = details.get('original_language', '')
        original_language_name = original_language_code.upper() if original_language_code else None
        
        # Build poster URL if poster_path exists
        poster_url = None
        poster_path = details.get('poster_path')
        if poster_path:
            poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
        
        # Format response
        return {
            'tmdb_id': details.get('id'),
            'title': details.get('title'),
            'original_title': details.get('original_title'),
            'year': movie_year,
            'release_date': release_date,
            'overview': details.get('overview'),
            'poster_path': poster_path,
            'poster_url': poster_url,
            'genres': genres,
            'original_language': original_language_code,
            'original_language_name': original_language_name,
            'vote_count': details.get('vote_count')
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching TMDB movie details for ID {tmdb_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching movie details: {str(e)}")

@router.patch("/api/movies/{movie_id}/favorite")
def set_movie_favorite(
    movie_id: int,
    is_favorite: bool = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """
    Set favorite flag for a movie.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    movie.is_favorite = is_favorite
    db.commit()
    db.refresh(movie)

    return {
        "id": movie.id,
        "is_favorite": bool(movie.is_favorite)
    }

@router.patch("/api/movies/{movie_id}/notes")
def set_movie_notes(
    movie_id: int,
    notes: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """
    Set notes for a movie.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    # Limit notes to 5000 characters
    if notes and len(notes) > 5000:
        notes = notes[:5000]
    
    movie.notes = notes
    db.commit()
    db.refresh(movie)

    return {
        "id": movie.id,
        "notes": movie.notes or ""
    }

@router.patch("/api/movies/{movie_id}/seen-before")
def set_movie_seen_before(
    movie_id: int,
    seen_before: bool = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """
    Set seen_before flag for a movie.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    movie.seen_before = seen_before
    db.commit()
    db.refresh(movie)

    return {
        "id": movie.id,
        "seen_before": bool(movie.seen_before)
    }

@router.delete("/api/movies/{movie_id}")
def delete_movie(
    movie_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a movie from the database.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    try:
        db.delete(movie)
        db.commit()
        logger.info(f"Deleted movie {movie_id}: {movie.title}")
        
        return {
            "id": movie_id,
            "message": "Movie deleted successfully"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting movie {movie_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting movie: {str(e)}")

@router.get("/api/movies/{movie_id}/collection")
def get_collection_movies(movie_id: int, db: Session = Depends(get_db)):
    """
    Get all movies in the same collection as the specified movie.
    Returns all movies from TMDB collection, with flags indicating which ones are in the database.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    # Extract collection ID from tmdb_data
    tmdb_data = movie.tmdb_data or {}
    belongs_to_collection = tmdb_data.get('belongs_to_collection')
    
    if not belongs_to_collection:
        return {
            "collection": None,
            "movies": []
        }
    
    collection_id = belongs_to_collection.get('id')
    collection_name = belongs_to_collection.get('name')
    
    if not collection_id:
        return {
            "collection": None,
            "movies": []
        }
    
    # Fetch all movies in the collection from TMDB
    collection_movies = []
    # Get the current movie's TMDB ID to exclude it from the collection list
    current_movie_tmdb_id = movie.tmdb_id
    
    if tmdb_client:
        collection_details = tmdb_client.get_collection_details(collection_id)
        if collection_details:
            # Get all movies from the collection
            tmdb_movies = collection_details.get('parts', [])
            
            # Get all movies from database that are in this collection
            db_movies_query = db.query(Movie).filter(Movie.id != movie_id).all()
            db_movies_map = {}  # Map tmdb_id to database movie
            
            for m in db_movies_query:
                if m.tmdb_data:
                    m_collection = m.tmdb_data.get('belongs_to_collection')
                    if m_collection and m_collection.get('id') == collection_id:
                        if m.tmdb_id:
                            db_movies_map[m.tmdb_id] = {
                                "id": m.id,
                                "title": m.title,
                                "year": m.year,
                                "tmdb_id": m.tmdb_id
                            }
            
            # Combine TMDB movies with database information
            for tmdb_movie in tmdb_movies:
                tmdb_id = tmdb_movie.get('id')
                
                # Skip the current movie (handle both int and string comparisons)
                if current_movie_tmdb_id is not None and tmdb_id is not None:
                    if int(current_movie_tmdb_id) == int(tmdb_id):
                        continue
                
                tmdb_title = tmdb_movie.get('title', '')
                tmdb_release_date = tmdb_movie.get('release_date', '')
                tmdb_year = None
                
                if tmdb_release_date:
                    try:
                        tmdb_year = int(tmdb_release_date[:4])
                    except (ValueError, IndexError):
                        pass
                
                # Double-check: Skip if this is still the current movie (extra safety)
                if current_movie_tmdb_id is not None and tmdb_id is not None:
                    if int(current_movie_tmdb_id) == int(tmdb_id):
                        continue
                
                # Check if this movie is in the database
                if tmdb_id in db_movies_map:
                    # Movie is in database - include database ID and mark as in_db
                    collection_movies.append({
                        "id": db_movies_map[tmdb_id]["id"],
                        "title": tmdb_title,
                        "year": tmdb_year,
                        "tmdb_id": tmdb_id,
                        "in_db": True
                    })
                else:
                    # Movie is not in database - still include it but mark as not in_db
                    collection_movies.append({
                        "id": None,
                        "title": tmdb_title,
                        "year": tmdb_year,
                        "tmdb_id": tmdb_id,
                        "in_db": False
                    })
            
            # Sort by year
            collection_movies.sort(key=lambda x: x['year'] or 0)
    else:
        # Fallback to old behavior if TMDB client is not available
        # Find all movies with the same collection ID from database only
        all_movies = db.query(Movie).filter(Movie.id != movie_id).all()
        
        for m in all_movies:
            if m.tmdb_data:
                m_collection = m.tmdb_data.get('belongs_to_collection')
                if m_collection and m_collection.get('id') == collection_id:
                    collection_movies.append({
                        "id": m.id,
                        "title": m.title,
                        "year": m.year,
                        "tmdb_id": m.tmdb_id,
                        "in_db": True
                    })
        
        # Sort by year
        collection_movies.sort(key=lambda x: x['year'] or 0)
    
    return {
        "collection": {
            "id": collection_id,
            "name": collection_name
        },
        "movies": collection_movies
    }

@router.get("/api/movies/{movie_id}/similar")
def get_similar_movies(movie_id: int, db: Session = Depends(get_db)):
    """
    Get similar movies for the specified movie.
    Only returns movies that are already in the watchlist database.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    if not movie.tmdb_id or not tmdb_client:
        return {
            "similar_movies": []
        }
    
    try:
        # Fetch similar movies from TMDb
        tmdb_data = movie.tmdb_data or {}
        similar_movies_tmdb = tmdb_data.get('similar', {}).get('results', [])
        
        # If not in cached data, fetch from API
        if not similar_movies_tmdb:
            details = tmdb_client.get_movie_details(movie.tmdb_id)
            if details:
                similar_movies_tmdb = details.get('similar', {}).get('results', [])
        
        if not similar_movies_tmdb:
            return {
                "similar_movies": []
            }
        
        # Get TMDb IDs of similar movies
        similar_tmdb_ids = [m.get('id') for m in similar_movies_tmdb if m.get('id')]
        
        if not similar_tmdb_ids:
            return {
                "similar_movies": []
            }
        
        # Find movies in database that match these TMDb IDs
        similar_movies = db.query(Movie).filter(
            Movie.tmdb_id.in_(similar_tmdb_ids),
            Movie.id != movie_id
        ).limit(10).all()
        
        # Build response with poster URLs
        similar_movies_data = []
        for m in similar_movies:
            poster_url = None
            if m.tmdb_data:
                tmdb_data_movie = m.tmdb_data
                if isinstance(tmdb_data_movie, str):
                    try:
                        tmdb_data_movie = json.loads(tmdb_data_movie)
                    except:
                        tmdb_data_movie = {}
                if isinstance(tmdb_data_movie, dict):
                    poster_path = tmdb_data_movie.get('poster_path')
                    if poster_path:
                        poster_url = f"https://image.tmdb.org/t/p/w300{poster_path}"
            
            similar_movies_data.append({
                "id": m.id,
                "title": m.title,
                "year": m.year,
                "tmdb_id": m.tmdb_id,
                "poster_url": poster_url
            })
        
        return {
            "similar_movies": similar_movies_data
        }
    
    except Exception as e:
        logger.error(f"Error fetching similar movies: {str(e)}", exc_info=True)
        return {
            "similar_movies": []
        }

@router.get("/api/movies/director/{director_name}")
def get_director_movies(director_name: str, db: Session = Depends(get_db)):
    """
    Get all movies by a specific director.
    Returns movies from both the database and TMDB, with flags indicating which ones are in the database.
    """
    director_movies = []
    
    # Get all movies from database with matching director
    db_movies = db.query(Movie).filter(Movie.director == director_name).all()
    db_movies_map = {}  # Map tmdb_id to database movie
    
    for m in db_movies:
        if m.tmdb_id:
            db_movies_map[m.tmdb_id] = {
                "id": m.id,
                "title": m.title,
                "year": m.year,
                "tmdb_id": m.tmdb_id
            }
    
    # Also add movies from database to the result
    for m in db_movies:
        director_movies.append({
            "id": m.id,
            "title": m.title,
            "year": m.year,
            "tmdb_id": m.tmdb_id,
            "in_db": True
        })
    
    # Try to get additional movies from TMDB
    if tmdb_client and tmdb_client.api_key:
        try:
            # Search for the person (director) by name
            search_url = f"{tmdb_client.base_url}/search/person"
            params = {
                'api_key': tmdb_client.api_key,
                'query': director_name,
                'language': 'en-US'
            }
            
            response = requests.get(search_url, params=params, timeout=10)
            response.raise_for_status()
            search_data = response.json()
            
            # Find the best matching person (director)
            results = search_data.get('results', [])
            person_id = None
            
            for person in results:
                # Check if this person is known for directing
                known_for = person.get('known_for_department', '')
                if known_for == 'Directing' or 'Directing' in str(person.get('known_for', [])):
                    person_id = person.get('id')
                    break
            
            # If no directing match, use first result
            if not person_id and results:
                person_id = results[0].get('id')
            
            if person_id:
                # Get person details with movie credits
                person_url = f"{tmdb_client.base_url}/person/{person_id}"
                params = {
                    'api_key': tmdb_client.api_key,
                    'language': 'en-US',
                    'append_to_response': 'movie_credits'
                }
                
                response = requests.get(person_url, params=params, timeout=10)
                response.raise_for_status()
                person_data = response.json()
                
                # Get movies where this person was director
                movie_credits = person_data.get('movie_credits', {})
                crew_movies = movie_credits.get('crew', [])
                
                director_tmdb_movies = []
                for movie in crew_movies:
                    # Filter for movies where job is Director
                    job = movie.get('job', '')
                    if job == 'Director':
                        director_tmdb_movies.append(movie)
                
                # Process TMDB movies
                for tmdb_movie in director_tmdb_movies:
                    tmdb_id = tmdb_movie.get('id')
                    if not tmdb_id:
                        continue
                    
                    # Skip if already in database (we already added it)
                    if tmdb_id in db_movies_map:
                        continue
                    
                    tmdb_title = tmdb_movie.get('title', '')
                    tmdb_release_date = tmdb_movie.get('release_date', '')
                    tmdb_year = None
                    
                    if tmdb_release_date:
                        try:
                            tmdb_year = int(tmdb_release_date[:4])
                        except (ValueError, IndexError):
                            pass
                    
                    # Add movie from TMDB (not in database)
                    director_movies.append({
                        "id": None,
                        "title": tmdb_title,
                        "year": tmdb_year,
                        "tmdb_id": tmdb_id,
                        "in_db": False
                    })
        
        except Exception as e:
            logger.warning(f"Error fetching director movies from TMDB for '{director_name}': {str(e)}")
            # Continue with database movies only
    
    # Sort by year
    director_movies.sort(key=lambda x: x['year'] or 0)
    
    return {
        "director": director_name,
        "movies": director_movies
    }

@router.get("/api/directors/favorites")
def get_favorite_directors(db: Session = Depends(get_db)):
    """
    Get list of all favorited directors.
    """
    favorite_directors = db.query(FavoriteDirector).all()
    return {
        "directors": [fd.director_name for fd in favorite_directors]
    }

@router.post("/api/directors/favorites")
def add_favorite_director(
    director_name: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """
    Add a director to favorites.
    """
    # Check if already favorited
    existing = db.query(FavoriteDirector).filter(
        FavoriteDirector.director_name == director_name
    ).first()
    
    if existing:
        return {
            "director_name": director_name,
            "message": "Director already in favorites"
        }
    
    favorite_director = FavoriteDirector(director_name=director_name)
    db.add(favorite_director)
    db.commit()
    db.refresh(favorite_director)
    
    return {
        "director_name": director_name,
        "message": "Director added to favorites"
    }

@router.delete("/api/directors/favorites/{director_name}")
def remove_favorite_director(
    director_name: str,
    db: Session = Depends(get_db)
):
    """
    Remove a director from favorites.
    """
    favorite_director = db.query(FavoriteDirector).filter(
        FavoriteDirector.director_name == director_name
    ).first()
    
    if not favorite_director:
        raise HTTPException(status_code=404, detail="Director not found in favorites")
    
    db.delete(favorite_director)
    db.commit()
    
    return {
        "director_name": director_name,
        "message": "Director removed from favorites"
    }

@router.get("/api/countries/seen")
def get_seen_countries(db: Session = Depends(get_db)):
    """
    Get list of all seen countries.
    """
    seen_countries = db.query(SeenCountry).all()
    return {
        "countries": [sc.country_name for sc in seen_countries]
    }

@router.post("/api/countries/seen")
def add_seen_country(
    country_name: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """
    Add a country to the seen list.
    """
    # Check if already in seen list
    existing = db.query(SeenCountry).filter(
        SeenCountry.country_name == country_name
    ).first()
    
    if existing:
        return {
            "country_name": country_name,
            "message": "Country already in seen list"
        }
    
    seen_country = SeenCountry(country_name=country_name)
    db.add(seen_country)
    db.commit()
    db.refresh(seen_country)
    
    return {
        "country_name": country_name,
        "message": "Country added to seen list"
    }

@router.delete("/api/countries/seen/{country_name}")
def remove_seen_country(
    country_name: str,
    db: Session = Depends(get_db)
):
    """
    Remove a country from the seen list.
    """
    seen_country = db.query(SeenCountry).filter(
        SeenCountry.country_name == country_name
    ).first()
    
    if not seen_country:
        raise HTTPException(status_code=404, detail="Country not found in seen list")
    
    db.delete(seen_country)
    db.commit()
    
    return {
        "country_name": country_name,
        "message": "Country removed from seen list"
    }

@router.get("/api/movies/{movie_id}/streaming")
def get_movie_streaming(movie_id: int, country_code: str = Query("US", description="ISO 3166-1 country code"), db: Session = Depends(get_db)):
    """
    Get streaming availability for a movie in a specific country.
    Extracts watch providers from cached tmdb_data.
    """
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    tmdb_data = movie.tmdb_data or {}
    if isinstance(tmdb_data, str):
        try:
            tmdb_data = json.loads(tmdb_data)
        except (json.JSONDecodeError, TypeError):
            tmdb_data = {}
    
    # Extract watch/providers data
    watch_providers = tmdb_data.get('watch', {}).get('providers', {})
    if not watch_providers:
        # Try alternative structure
        watch_providers = tmdb_data.get('watch/providers', {})
    
    results = watch_providers.get('results', {})
    country_providers = results.get(country_code.upper(), {})
    
    # Structure the response by provider type
    streaming_info = {
        "flatrate": country_providers.get('flatrate', []),
        "rent": country_providers.get('rent', []),
        "buy": country_providers.get('buy', []),
        "free": country_providers.get('free', []),
        "ads": country_providers.get('ads', [])
    }
    
    return streaming_info

@router.get("/api/streaming-services")
def get_streaming_services():
    """
    Get list of all available streaming services from TMDB.
    This endpoint fetches from TMDB API and can be cached.
    """
    if not tmdb_client:
        raise HTTPException(status_code=500, detail="TMDB client not configured")
    
    try:
        # Fetch available providers from TMDB
        response = tmdb_client.session.get(
            f"{tmdb_client.base_url}/watch/providers/movie",
            params={
                'api_key': tmdb_client.api_key,
                'language': 'en-US'
            },
            timeout=10
        )
        response.raise_for_status()
        
        data = response.json()
        providers = data.get('results', [])
        
        def normalize_service_name(name):
            """Normalize service name for grouping by removing variations."""
            if not name:
                return ""
            # Convert to lowercase and strip whitespace
            normalized = name.lower().strip()
            # Replace common variations
            normalized = normalized.replace('+', ' plus')
            normalized = normalized.replace('&', ' and')
            normalized = normalized.replace(' and ', ' ')
            # Remove extra spaces
            normalized = ' '.join(normalized.split())
            return normalized
        
        # Group providers by normalized name - collect all provider IDs for each service name
        services_dict = {}
        for provider in providers:
            name = provider.get('provider_name')
            if not name:
                continue
            
            # Filter out Amazon Channel, Apple TV Channel, and Roku Premium Channel entries
            name_lower = name.lower()
            # Filter Amazon Channel (including typos like "Amzon Channel")
            if ('amazon channel' in name_lower or 'amzon channel' in name_lower) and name_lower != 'amazon prime video':
                continue
            if 'apple tv channel' in name_lower:
                continue
            if 'roku premium channel' in name_lower:
                continue
            
            # Normalize name for grouping
            normalized_name = normalize_service_name(name)
            if not normalized_name:
                continue
                
            provider_id = provider.get('provider_id')
            logo_path = provider.get('logo_path')
            
            if normalized_name not in services_dict:
                # First occurrence - initialize with this provider
                services_dict[normalized_name] = {
                    "name": name,  # Keep original casing from first occurrence
                    "ids": [provider_id],  # List of all provider IDs for this service
                    "logo_path": logo_path
                }
            else:
                # Add provider ID to existing service
                if provider_id not in services_dict[normalized_name]['ids']:
                    services_dict[normalized_name]['ids'].append(provider_id)
                # Update logo if current has one and previous doesn't
                if logo_path and not services_dict[normalized_name].get('logo_path'):
                    services_dict[normalized_name]['logo_path'] = logo_path
                # Prefer shorter name (usually cleaner, e.g., "Disney+" over "Disney Plus")
                if len(name) < len(services_dict[normalized_name]['name']):
                    services_dict[normalized_name]['name'] = name
        
        # Convert to list format - use first ID as primary, but include all IDs
        services = []
        for name_lower, service_data in services_dict.items():
            services.append({
                "id": service_data['ids'][0],  # Primary ID (first one found)
                "ids": service_data['ids'],  # All IDs for this service
                "name": service_data['name'],
                "logo_path": service_data.get('logo_path')
            })
        
        return {"services": sorted(services, key=lambda x: x['name'])}
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching streaming services: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching streaming services: {str(e)}")

@router.post("/api/movies/recache")
def recache_movies(db: Session = Depends(get_db)):
    """
    Recache all movies by fetching fresh TMDB data for each movie.
    """
    if not tmdb_client:
        raise HTTPException(status_code=500, detail="TMDB client not configured")
    
    try:
        movies = db.query(Movie).all()
        updated = 0
        failed = 0
        
        for movie in movies:
            try:
                # Try to enrich with fresh TMDB data
                enriched_data = tmdb_client.enrich_movie_data(movie.title, movie.year)
                
                if enriched_data:
                    # Update movie with fresh data
                    movie.director = enriched_data.get('director')
                    movie.country = enriched_data.get('country')
                    movie.runtime = enriched_data.get('runtime')
                    movie.genres = enriched_data.get('genres', [])
                    movie.tmdb_id = enriched_data.get('tmdb_id')
                    movie.tmdb_data = enriched_data.get('tmdb_data')
                    updated += 1
                else:
                    logger.warning(f"Could not fetch TMDB data for {movie.title} ({movie.year})")
                    failed += 1
            except Exception as e:
                logger.error(f"Error recaching {movie.title}: {str(e)}")
                failed += 1
        
        db.commit()
        
        return {
            "message": "Recaching completed",
            "total": len(movies),
            "updated": updated,
            "failed": failed
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error in recache operation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error recaching movies: {str(e)}")


@router.post("/api/movies/clear-cache")
def clear_cache(db: Session = Depends(get_db)):
    """
    Clear all movies from the database (clears all movie records and cache).
    This ensures that when processing CSV again, movies will be treated as new and fresh data will be fetched.
    """
    try:
        # Get all movies and delete them individually to ensure proper deletion
        movies = db.query(Movie).all()
        count = len(movies)
        
        for movie in movies:
            db.delete(movie)
        
        db.flush()  # Flush changes before commit
        db.commit()
        
        logger.info(f"Deleted {count} movies from database")
        
        return {
            "message": "All movies deleted successfully",
            "movies_deleted": count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting movies: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting movies: {str(e)}")

@router.post("/api/movies/process-tracked-lists")
def process_tracked_lists(db: Session = Depends(get_db)):
    """
    Process all CSV files in the tracked-lists directory and update movie list memberships.
    """
    try:
        project_root = get_project_root()
        tracked_lists_dir = project_root / "tracked-lists"
        
        # Iterate over generator to get final results
        results = {}
        for update in process_all_tracked_lists(db, tracked_lists_dir):
            if update.get('type') == 'complete':
                results = update.get('results', {})
        
        return {
            "message": "Tracked lists processed successfully",
            "results": results
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing tracked lists: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing tracked lists: {str(e)}")


@router.post("/api/export-profile")
def export_profile(
    include_tmdb_data: bool = Body(True, description="Include full TMDB data in export"),
    preferences: Optional[Dict[str, Any]] = Body(None, description="User preferences to include in export"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """
    Export user profile (all movies, favorites, preferences) to a ZIP file.
    
    Request Body:
        include_tmdb_data: Whether to include full TMDB data cache (default: True)
        preferences: Optional user preferences dict (from localStorage)
    
    Returns:
        ZIP file containing profile.json
    """
    try:
        # Build JSON structure with preferences (or empty dict if not provided)
        json_data = export_profile_to_json(db, include_tmdb_data, preferences or {})
        
        # Create ZIP file
        zip_buffer = create_profile_zip(json_data)
        
        # Generate filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y-%m-%d-%H-%M-%S")
        filename = f"profile-export-{timestamp}.zip"
        
        # Create a temporary file or use BytesIO with custom response
        from tempfile import NamedTemporaryFile
        import os
        
        # Create temporary file
        temp_file = NamedTemporaryFile(delete=False, suffix='.zip')
        try:
            temp_file.write(zip_buffer.read())
            temp_file.close()
            
            # Clean up temp file after response
            background_tasks.add_task(os.unlink, temp_file.name)
            
            # Return file response
            return FileResponse(
                temp_file.name,
                media_type="application/zip",
                filename=filename
            )
        except Exception as e:
            # Clean up on error
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)
            raise
        
    except Exception as e:
        logger.error(f"Error exporting profile: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error exporting profile: {str(e)}")


def process_tmdb_data_stream(db: Session, movies_to_process: List[Movie]):
    """
    Generator function that processes movies to fetch TMDB data and yields progress updates.
    
    Args:
        db: Database session
        movies_to_process: List of Movie objects that need TMDB data
    """
    total = len(movies_to_process)
    
    if total == 0:
        yield f"data: {json.dumps({'current': 0, 'total': 0, 'processed': 0, 'failed': 0, 'done': True})}\n\n"
        return
    
    # Send initial progress
    yield f"data: {json.dumps({'current': 0, 'total': total, 'processed': 0, 'failed': 0, 'done': False})}\n\n"
    
    processed_count = 0
    failed_count = 0
    
    for index, movie in enumerate(movies_to_process):
        try:
            # Fetch TMDB data for the movie
            enriched_data = tmdb_client.enrich_movie_data(movie.title, movie.year)
            
            if enriched_data:
                # Update movie with TMDB data
                # Always update fields that are missing or None, even if we have partial data
                if enriched_data.get('director'):
                    movie.director = enriched_data.get('director')
                if enriched_data.get('country'):
                    movie.country = enriched_data.get('country')
                if enriched_data.get('runtime'):
                    movie.runtime = enriched_data.get('runtime')
                if enriched_data.get('genres'):
                    movie.genres = enriched_data.get('genres', [])
                if enriched_data.get('tmdb_id'):
                    movie.tmdb_id = enriched_data.get('tmdb_id')
                if enriched_data.get('tmdb_data'):
                    movie.tmdb_data = enriched_data.get('tmdb_data')
                processed_count += 1
            else:
                logger.warning(f"Could not fetch TMDB data for {movie.title} ({movie.year})")
                failed_count += 1
        except Exception as e:
            logger.error(f"Error fetching TMDB data for {movie.title}: {str(e)}")
            failed_count += 1
        
        # Yield progress update
        yield f"data: {json.dumps({'current': index + 1, 'total': total, 'processed': processed_count, 'failed': failed_count, 'done': False})}\n\n"
    
    # Commit TMDB data updates
    try:
        db.commit()
        logger.info(f"Processed {processed_count} movies with TMDB data, {failed_count} failed")
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing TMDB data: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'error': f'Error committing TMDB data: {str(e)}', 'done': True})}\n\n"
        return
    
    # Process tracked lists after TMDB processing completes
    # This ensures all movies (with complete TMDB data) are checked against tracked lists
    try:
        project_root = get_project_root()
        tracked_lists_dir = project_root / "tracked-lists"
        if tracked_lists_dir.exists():
            logger.info("Processing tracked lists after TMDB processing...")
            tracked_lists_results = {}
            # Iterate over generator to get final results
            for update in process_all_tracked_lists(db, tracked_lists_dir):
                if update.get('type') == 'complete':
                    tracked_lists_results = update.get('results', {})
            if tracked_lists_results:
                for list_name, result in tracked_lists_results.items():
                    logger.info(f"{list_name}: {result.get('matched', 0)}/{result.get('total', 0)} matched")
            logger.info("Tracked lists processing completed")
        else:
            logger.warning(f"Tracked lists directory not found: {tracked_lists_dir}")
    except Exception as e:
        logger.warning(f"Error processing tracked lists after TMDB processing: {str(e)} - continuing anyway")
        # Don't fail the entire processing if tracked lists processing fails
    
    # Send completion
    yield f"data: {json.dumps({'current': total, 'total': total, 'processed': processed_count, 'failed': failed_count, 'done': True})}\n\n"


@router.post("/api/import-profile")
async def import_profile(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Import user profile from a ZIP file with streaming progress for TMDB data fetching.
    
    This will:
    1. Extract and validate the ZIP file
    2. Clear all existing movies, favorite directors, and seen countries from the database
    3. Import movies (including seen_before, notes), favorite directors, and seen countries from the profile JSON
    4. If TMDB data is missing, stream progress while fetching it
    
    Returns:
        StreamingResponse with progress updates
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail="File must be a ZIP file")
        
        # Read uploaded file
        file_contents = await file.read()
        zip_buffer = BytesIO(file_contents)
        
        # Extract and validate ZIP
        try:
            json_data = extract_profile_zip(zip_buffer)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid profile file: {str(e)}")
        
        # Extract preferences from JSON (will be handled by frontend)
        preferences = json_data.get("preferences", {})
        
        # Stream the import process with progress updates
        async def generate_stream():
            import_result = None
            # Access background_tasks from outer scope for tracked lists processing
            
            try:
                # Stream import progress - convert sync generator to async
                import_gen = import_profile_from_json_stream(db, json_data)
                try:
                    while True:
                        chunk = next(import_gen)
                        
                        # Check if this is the import_complete message before yielding
                        # Chunk format is: "data: {...}\n\n"
                        if 'import_complete' in chunk:
                            try:
                                # Parse the chunk to get import result
                                # Remove 'data: ' prefix and trailing newlines
                                chunk_data = chunk.replace('data: ', '').strip()
                                if chunk_data:
                                    import_result_data = json.loads(chunk_data)
                                    if import_result_data.get('import_complete'):
                                        import_result = {
                                            'movies_imported': import_result_data['movies_imported'],
                                            'movies_failed': import_result_data['movies_failed'],
                                            'errors': import_result_data.get('errors', [])
                                        }
                                        
                                        # Yield import_complete message with preferences instead of the original chunk
                                        yield f"data: {json.dumps({'import_complete': True, 'movies_imported': import_result['movies_imported'], 'movies_failed': import_result['movies_failed'], 'errors': import_result['errors'], 'preferences': preferences, 'done': False})}\n\n"
                                        # Give event loop control before continuing
                                        await asyncio.sleep(0.001)  # Small delay to ensure chunk is sent
                                        continue
                            except Exception as e:
                                logger.warning(f"Error parsing import result: {str(e)}")
                        
                        # Forward all other progress chunks as-is
                        yield chunk
                        
                        # Give the event loop a chance to process and send the chunk immediately
                        # Small delay ensures chunks are sent incrementally rather than batched
                        # Only delay for progress updates, not for completion messages
                        if 'import_phase' in chunk:
                            await asyncio.sleep(0.005)  # 5ms delay for progress updates to prevent batching
                        else:
                            await asyncio.sleep(0)  # Minimal delay for other messages
                except StopIteration:
                    pass  # Generator exhausted
            except Exception as e:
                logger.error(f"Error in import stream: {str(e)}", exc_info=True)
                yield f"data: {json.dumps({'error': f'Error during import: {str(e)}', 'done': True})}\n\n"
                return
            
            # If import didn't complete, we can't continue  
            if not import_result:
                logger.error("Import did not complete successfully")
                return
            
            # Check if any movies need reprocessing (missing TMDB data or other fields)
            # This includes movies with minimal data from export (only title, year, letterboxd_uri, tmdb_id, is_favorite)
            # We need to check for movies that are missing any of: director, country, runtime, genres, or tmdb_data
            # Query all movies and filter in Python to handle JSON fields properly
            all_imported_movies = db.query(Movie).all()
            movies_needing_tmdb = []
            for movie in all_imported_movies:
                # Check if movie is missing any required fields
                needs_processing = (
                    movie.tmdb_data is None or 
                    movie.tmdb_data == {} or
                    movie.director is None or
                    movie.country is None or
                    movie.runtime is None or
                    movie.genres is None or
                    (isinstance(movie.genres, list) and len(movie.genres) == 0)
                )
                if needs_processing:
                    movies_needing_tmdb.append(movie)
            
            # If movies need reprocessing, stream the TMDB processing
            if len(movies_needing_tmdb) > 0 and tmdb_client and import_result["movies_imported"] > 0:
                logger.info(f"Fetching TMDB data for {len(movies_needing_tmdb)} imported movies")
                
                # Send a message indicating TMDB processing is starting
                yield f"data: {json.dumps({'tmdb_processing_starting': True, 'total_movies': len(movies_needing_tmdb)})}\n\n"
                await asyncio.sleep(0.001)
                
                # Stream TMDB processing
                for chunk in process_tmdb_data_stream(db, movies_needing_tmdb):
                    yield chunk
                    await asyncio.sleep(0.001)
            else:
                # No TMDB processing needed - send completion immediately
                # Tracked lists will be processed in the background after completion message is sent
                yield f"data: {json.dumps({'current': import_result['movies_imported'], 'total': import_result['movies_imported'], 'processed': 0, 'failed': 0, 'tmdb_data_fetched': 0, 'done': True})}\n\n"
                
                # Schedule tracked lists processing to run in background after response is sent
                def process_tracked_lists_background():
                    """Background task to process tracked lists after import completes."""
                    try:
                        tracked_lists_dir = PROJECT_ROOT / "tracked-lists"
                        if tracked_lists_dir.exists():
                            logger.info("Processing tracked lists after import (background task)...")
                            tracked_lists_results = {}
                            # Create a new database session for background processing
                            from database import get_db
                            background_db = next(get_db())
                            try:
                                # Iterate over generator to get final results
                                for update in process_all_tracked_lists(background_db, tracked_lists_dir):
                                    if update.get('type') == 'complete':
                                        tracked_lists_results = update.get('results', {})
                                if tracked_lists_results:
                                    for list_name, result in tracked_lists_results.items():
                                        logger.info(f"{list_name}: {result.get('matched', 0)}/{result.get('total', 0)} matched")
                                logger.info("Tracked lists processing completed")
                            finally:
                                background_db.close()
                        else:
                            logger.warning(f"Tracked lists directory not found: {tracked_lists_dir}")
                    except Exception as e:
                        logger.warning(f"Error processing tracked lists after import: {str(e)} - continuing anyway")
                        # Don't fail the entire import if tracked lists processing fails
                
                # Add background task - it will run after the streaming response completes
                background_tasks.add_task(process_tracked_lists_background)
        
        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            },
            background=background_tasks
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing profile: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error importing profile: {str(e)}")
