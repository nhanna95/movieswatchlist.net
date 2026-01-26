from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL
from utils import get_project_root
import logging
from pathlib import Path
import re

logger = logging.getLogger(__name__)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_tracked_list_names():
    """
    Scan tracked-lists directory and return list of tracked list names.
    Returns list of column names (e.g., ['is_imdb_t250', 'is_letterboxd_t250'])
    """
    project_root = get_project_root()
    tracked_lists_dir = project_root / "tracked-lists"
    
    if not tracked_lists_dir.exists():
        logger.warning(f"Tracked lists directory not found: {tracked_lists_dir}")
        return []
    
    list_names = []
    for csv_file in tracked_lists_dir.glob("*.csv"):
        # Extract list name from filename (remove .csv extension)
        filename = csv_file.stem
        # Convert to snake_case and add 'is_' prefix
        # Replace hyphens and spaces with underscores
        column_name = 'is_' + re.sub(r'[-\s]+', '_', filename).lower()
        list_names.append(column_name)
    
    return sorted(list_names)

def filename_to_column_name(filename):
    """
    Convert CSV filename to database column name.
    Example: 'imdb-t250.csv' -> 'is_imdb_t250'
    """
    # Remove .csv extension
    name = Path(filename).stem
    # Convert to snake_case and add 'is_' prefix
    column_name = 'is_' + re.sub(r'[-\s]+', '_', name).lower()
    return column_name

def migrate_db():
    """
    Migrate database schema to add new columns if they don't exist.
    """
    inspector = inspect(engine)
    
    # Check if movies table exists
    if 'movies' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('movies')]
        
        # Add tmdb_data column if it doesn't exist
        if 'tmdb_data' not in columns:
            logger.info("Adding tmdb_data column to movies table")
            with engine.connect() as conn:
                # SQLite doesn't support adding JSON columns directly, so we use TEXT
                # SQLAlchemy will handle JSON serialization/deserialization
                conn.execute(text("ALTER TABLE movies ADD COLUMN tmdb_data TEXT"))
                conn.commit()
            logger.info("Successfully added tmdb_data column")
        else:
            logger.debug("tmdb_data column already exists")

        # Add is_favorite column if it doesn't exist
        if 'is_favorite' not in columns:
            logger.info("Adding is_favorite column to movies table")
            with engine.connect() as conn:
                # SQLite doesn't support boolean, store as integer 0/1
                conn.execute(text("ALTER TABLE movies ADD COLUMN is_favorite INTEGER DEFAULT 0"))
                conn.commit()
            logger.info("Successfully added is_favorite column")
        else:
            logger.debug("is_favorite column already exists")
        
        # Add seen_before column if it doesn't exist
        if 'seen_before' not in columns:
            logger.info("Adding seen_before column to movies table")
            with engine.connect() as conn:
                # SQLite doesn't support boolean, store as integer 0/1
                conn.execute(text("ALTER TABLE movies ADD COLUMN seen_before INTEGER DEFAULT 0"))
                conn.commit()
            logger.info("Successfully added seen_before column")
        else:
            logger.debug("seen_before column already exists")
        
        # Add notes column if it doesn't exist
        if 'notes' not in columns:
            logger.info("Adding notes column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN notes TEXT"))
                conn.commit()
            logger.info("Successfully added notes column")
        else:
            logger.debug("notes column already exists")
        
        # Add columns for tracked lists
        tracked_list_columns = get_tracked_list_names()
        for column_name in tracked_list_columns:
            if column_name not in columns:
                logger.info(f"Adding {column_name} column to movies table")
                with engine.connect() as conn:
                    # SQLite doesn't support boolean, store as integer 0/1
                    conn.execute(text(f"ALTER TABLE movies ADD COLUMN {column_name} INTEGER DEFAULT 0"))
                    conn.commit()
                logger.info(f"Successfully added {column_name} column")
            else:
                logger.debug(f"{column_name} column already exists")
    else:
        logger.info("Movies table does not exist, will be created by init_db()")
    
    # Check if favorite_directors table exists
    if 'favorite_directors' not in inspector.get_table_names():
        logger.info("Creating favorite_directors table")
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE favorite_directors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    director_name TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_favorite_directors_director_name ON favorite_directors(director_name)"))
            conn.commit()
        logger.info("Successfully created favorite_directors table")
    else:
        logger.debug("favorite_directors table already exists")
    
    # Check if seen_countries table exists
    if 'seen_countries' not in inspector.get_table_names():
        logger.info("Creating seen_countries table")
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE seen_countries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    country_name TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_seen_countries_country_name ON seen_countries(country_name)"))
            conn.commit()
        logger.info("Successfully created seen_countries table")
    else:
        logger.debug("seen_countries table already exists")

def init_db():
    """
    Initialize database and run migrations.
    """
    migrate_db()
    Base.metadata.create_all(bind=engine)
