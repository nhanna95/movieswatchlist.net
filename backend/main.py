from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import router
import logging
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React dev server
        "http://127.0.0.1:3000",  # Alternative localhost
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
