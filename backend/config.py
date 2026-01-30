import os
from dotenv import load_dotenv
import secrets

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./watchlist.db")
TMDB_BASE_URL = "https://api.themoviedb.org/3"

# JWT Configuration
# IMPORTANT: Set JWT_SECRET_KEY in production - generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))
GUEST_EXPIRATION_HOURS = int(os.getenv("GUEST_EXPIRATION_HOURS", "24"))
