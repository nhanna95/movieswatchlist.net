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
        filename = csv_file.stem
        column_name = 'is_' + re.sub(r'[-\s]+', '_', filename).lower()
        list_names.append(column_name)

    return sorted(list_names)

def filename_to_column_name(filename):
    """
    Convert CSV filename to database column name.
    Example: 'imdb-t250.csv' -> 'is_imdb_t250'
    """
    name = Path(filename).stem
    column_name = 'is_' + re.sub(r'[-\s]+', '_', name).lower()
    return column_name

def migrate_db():
    """
    Migrate database schema to add new columns if they don't exist.
    """
    inspector = inspect(engine)

    if 'movies' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('movies')]

        if 'tmdb_data' not in columns:
            logger.info("Adding tmdb_data column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN tmdb_data TEXT"))
                conn.commit()

        if 'is_favorite' not in columns:
            logger.info("Adding is_favorite column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN is_favorite INTEGER DEFAULT 0"))
                conn.commit()

        if 'seen_before' not in columns:
            logger.info("Adding seen_before column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN seen_before INTEGER DEFAULT 0"))
                conn.commit()

        if 'notes' not in columns:
            logger.info("Adding notes column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN notes TEXT"))
                conn.commit()

        tracked_list_columns = get_tracked_list_names()
        for column_name in tracked_list_columns:
            if column_name not in columns:
                logger.info(f"Adding {column_name} column to movies table")
                with engine.connect() as conn:
                    conn.execute(text(f"ALTER TABLE movies ADD COLUMN {column_name} INTEGER DEFAULT 0"))
                    conn.commit()
    else:
        logger.info("Movies table does not exist, will be created by init_db()")

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

def init_db():
    """
    Initialize database and run migrations.
    """
    migrate_db()
    Base.metadata.create_all(bind=engine)
