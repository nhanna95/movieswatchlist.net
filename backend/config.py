import os
from dotenv import load_dotenv

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./watchlist.db")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
