import requests
import logging
from typing import Dict, Optional, List
from config import TMDB_API_KEY, TMDB_BASE_URL

logger = logging.getLogger(__name__)

class TMDbClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = TMDB_BASE_URL
        self.session = requests.Session()
    
    def search_movie(self, title: str, year: Optional[int] = None) -> Optional[Dict]:
        """
        Search for a movie by title and year.
        Returns the best matching movie result that matches the year, or None.
        Verifies that the release year matches the requested year to prevent incorrect matches.
        """
        if not self.api_key:
            logger.warning("TMDb API key not configured")
            return None
        
        try:
            params = {
                'api_key': self.api_key,
                'query': title,
                'language': 'en-US'
            }
            
            if year:
                params['year'] = year
            
            response = self.session.get(
                f"{self.base_url}/search/movie",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get('results', [])
            
            if not results:
                logger.debug(f"No results found for '{title}' ({year})")
                return None
            
            # If year is specified, verify that the result matches the year and score by title similarity
            if year:
                # Normalize title for comparison (lowercase, strip)
                normalized_title = title.lower().strip()
                best_match = None
                best_score = -1
                
                for movie in results:
                    release_date = movie.get('release_date', '')
                    if not release_date:
                        continue
                    
                    try:
                        # Extract year from release date (format: YYYY-MM-DD)
                        movie_year = int(release_date[:4])
                        
                        # Check year match - be strict unless title matches exactly
                        movie_title_lower = movie.get('title', '').lower().strip()
                        title_exact_match = movie_title_lower == normalized_title
                        
                        # For exact title matches, allow ±1 year tolerance (for international releases)
                        # For non-exact matches, require exact year match to prevent false matches
                        if title_exact_match:
                            if abs(movie_year - year) > 1:
                                logger.debug(f"Skipping {movie.get('title')} ({movie_year}) - year mismatch (exact title)")
                                continue
                        else:
                            # Non-exact title match - require exact year
                            if movie_year != year:
                                logger.debug(f"Skipping {movie.get('title')} ({movie_year}) - year mismatch (non-exact title)")
                                continue
                    except (ValueError, IndexError):
                        # If we can't parse the date, skip this result
                        logger.debug(f"Skipping {movie.get('title')} - invalid release date")
                        continue
                    
                    # Score the match based on title similarity
                    movie_title = movie.get('title', '').lower().strip()
                    score = 0
                    
                    # Exact match gets highest score
                    if movie_title == normalized_title:
                        score = 100
                    # Check if title starts with the search term (common for movies with subtitles)
                    elif movie_title.startswith(normalized_title):
                        score = 80
                    # Check if search term is in the title
                    elif normalized_title in movie_title:
                        score = 60
                    # Check if title is in the search term (for partial matches)
                    elif movie_title in normalized_title:
                        score = 40
                    # Check original title as well
                    else:
                        original_title = movie.get('original_title', '').lower().strip()
                        if original_title == normalized_title:
                            score = 90
                        elif normalized_title in original_title or original_title in normalized_title:
                            score = 50
                    
                    # Bonus for exact year match (prefer exact year over ±1 year)
                    if movie_year == year:
                        score += 20  # Significant bonus for exact year match
                    else:
                        score += 10  # Smaller bonus for ±1 year match
                    
                    # When titles are identical, use popularity and vote count as tiebreakers
                    # This helps distinguish between multiple films with the same title/year
                    if movie_title == normalized_title:
                        # Popularity is a key indicator - more popular films are more likely correct
                        popularity = movie.get('popularity', 0)
                        # Normalize popularity (typically 0-100, but can be higher)
                        popularity_bonus = min(popularity / 10, 30)  # Cap at 30 points
                        score += popularity_bonus
                        
                        # Vote count indicates recognition - more votes = more likely correct
                        vote_count = movie.get('vote_count', 0)
                        vote_bonus = min(vote_count / 100, 20)  # Cap at 20 points
                        score += vote_bonus
                        
                        # Vote average can also help (higher rated films are more likely correct)
                        vote_average = movie.get('vote_average', 0)
                        vote_avg_bonus = 0
                        if vote_average > 0:
                            vote_avg_bonus = min(vote_average * 2, 15)  # Cap at 15 points
                            score += vote_avg_bonus
                        
                        logger.debug(
                            f"  Popularity: {popularity:.2f}, Votes: {vote_count}, "
                            f"Avg: {vote_average:.2f} - bonuses: {popularity_bonus:.1f}+{vote_bonus:.1f}+{vote_avg_bonus:.1f}"
                        )
                    
                    # Prefer results with higher popularity/relevance (TMDB already orders by relevance)
                    # Add a small bonus based on position (first results are more relevant)
                    position_bonus = max(0, 10 - results.index(movie))
                    score += position_bonus
                    
                    if score > best_score:
                        best_score = score
                        best_match = movie
                        logger.debug(f"New best match: {movie.get('title')} ({movie_year}) - score: {score}")
                
                if best_match:
                    logger.debug(f"Selected best match: {best_match.get('title')} (score: {best_score})")
                    return best_match
                
                # If no match found, log a warning
                logger.warning(f"No results found for '{title}' matching year {year}")
                logger.debug(f"Available results: {[(r.get('title'), r.get('release_date', '')[:4]) for r in results[:5]]}")
                return None
            else:
                # No year specified, return the first result
                movie = results[0]
                logger.debug(f"Found movie: {movie.get('title')} ({movie.get('release_date', '')[:4]})")
                return movie
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Error searching TMDb for '{title}': {str(e)}")
            return None
    
    def get_movie_details(self, tmdb_id: int) -> Optional[Dict]:
        """
        Get detailed information about a movie by TMDb ID.
        Fetches all available information including credits, videos, images, recommendations, etc.
        """
        if not self.api_key:
            logger.warning("TMDb API key not configured")
            return None
        
        try:
            params = {
                'api_key': self.api_key,
                'language': 'en-US',
                'append_to_response': 'credits,videos,images,recommendations,similar,release_dates,watch/providers,awards'
            }
            
            response = self.session.get(
                f"{self.base_url}/movie/{tmdb_id}",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            
            return response.json()
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching movie details for TMDb ID {tmdb_id}: {str(e)}")
            return None
    
    def get_collection_details(self, collection_id: int) -> Optional[Dict]:
        """
        Get collection details including all movies in the collection from TMDb.
        Returns collection information with all movies in the collection.
        """
        if not self.api_key:
            logger.warning("TMDb API key not configured")
            return None
        
        try:
            params = {
                'api_key': self.api_key,
                'language': 'en-US'
            }
            
            response = self.session.get(
                f"{self.base_url}/collection/{collection_id}",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            
            return response.json()
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching collection details for collection ID {collection_id}: {str(e)}")
            return None
    
    def enrich_movie_data(self, title: str, year: Optional[int] = None) -> Optional[Dict]:
        """
        Enrich movie data by searching and fetching details from TMDb.
        Returns a dictionary with: director, country, runtime, genres, tmdb_id, and full tmdb_data
        Verifies year match after fetching details to ensure accuracy.
        """
        # First, search for the movie
        search_result = self.search_movie(title, year)
        
        if not search_result:
            return None
        
        tmdb_id = search_result.get('id')
        if not tmdb_id:
            return None
        
        # Get detailed information with all available data
        details = self.get_movie_details(tmdb_id)
        if not details:
            return None
        
        # Double-check year match with detailed data (more reliable than search result)
        if year:
            release_date = details.get('release_date', '')
            if release_date:
                try:
                    movie_year = int(release_date[:4])
                    # Allow ±1 year tolerance for movies with different release dates in different countries
                    if abs(movie_year - year) > 1:
                        logger.warning(
                            f"Year mismatch for '{title}': requested {year}, "
                            f"found {movie_year} (TMDB ID: {tmdb_id}). Skipping."
                        )
                        return None
                except (ValueError, IndexError):
                    # If we can't parse the date, log a warning but continue
                    logger.warning(f"Could not parse release date for '{title}' (TMDB ID: {tmdb_id})")
        
        # Extract director from credits
        director = None
        credits = details.get('credits', {})
        crew = credits.get('crew', [])
        for person in crew:
            if person.get('job') == 'Director':
                director = person.get('name')
                break
        
        # Extract country (production countries)
        countries = details.get('production_countries', [])
        country = countries[0].get('name') if countries else None
        
        # Extract runtime
        runtime = details.get('runtime')
        
        # Extract genres
        genres = [genre.get('name') for genre in details.get('genres', [])]
        
        return {
            'director': director,
            'country': country,
            'runtime': runtime,
            'genres': genres,
            'tmdb_id': tmdb_id,
            'tmdb_data': details  # Full TMDB data for caching
        }

def extract_enriched_data_from_tmdb(tmdb_data: Dict) -> Dict:
    """
    Extract enriched movie data from full TMDB response.
    Returns dictionary with: director, country, runtime, genres, tmdb_id, tmdb_data
    This is used when we already have cached TMDB data and don't need to make API calls.
    """
    # Extract director from credits
    director = None
    credits = tmdb_data.get('credits', {})
    crew = credits.get('crew', [])
    for person in crew:
        if person.get('job') == 'Director':
            director = person.get('name')
            break
    
    # Extract country (production countries)
    countries = tmdb_data.get('production_countries', [])
    country = countries[0].get('name') if countries else None
    
    # Extract runtime
    runtime = tmdb_data.get('runtime')
    
    # Extract genres
    genres = [genre.get('name') for genre in tmdb_data.get('genres', [])]
    
    # Extract tmdb_id
    tmdb_id = tmdb_data.get('id')
    
    return {
        'director': director,
        'country': country,
        'runtime': runtime,
        'genres': genres,
        'tmdb_id': tmdb_id,
        'tmdb_data': tmdb_data
    }

# Global client instance
tmdb_client = TMDbClient(TMDB_API_KEY) if TMDB_API_KEY else None
