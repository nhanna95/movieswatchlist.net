from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import router
import logging
import os
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    logger.info("Database initialized")
    yield
    # Shutdown (if needed in the future)

app = FastAPI(
    title="Letterboxd Watchlist API",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
# Get allowed origins from environment variable. In production (e.g. Railway) you MUST set
# CORS_ORIGINS to your frontend URL (e.g. https://movieswatchlist-net.vercel.app) or the
# browser will block API requests with "No 'Access-Control-Allow-Origin' header".
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env:
    # Split comma-separated origins from environment variable
    allowed_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
else:
    # Default to localhost for development only
    allowed_origins = [
        "http://localhost:3000",  # React dev server
        "http://127.0.0.1:3000",  # Alternative localhost
    ]

logger.info(f"CORS allowed origins: {allowed_origins}")

# Add CORS middleware BEFORE including routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routes
app.include_router(router)

@app.get("/")
def root():
    return {"message": "Letterboxd Watchlist API"}

if __name__ == "__main__":
    import uvicorn
    import subprocess
    import sys
    
    # Check if port 8000 is in use and kill existing processes
    try:
        result = subprocess.run(
            ["lsof", "-ti:8000"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            logger.info(f"Killing existing processes on port 8000: {pids}")
            for pid in pids:
                try:
                    subprocess.run(["kill", "-9", pid], check=True)
                except subprocess.CalledProcessError:
                    pass
    except FileNotFoundError:
        # lsof not available, skip port cleanup
        pass
    except Exception as e:
        logger.warning(f"Could not check/kill processes on port 8000: {e}")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
