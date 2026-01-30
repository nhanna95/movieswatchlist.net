from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from config import DATABASE_URL
from utils import get_project_root
import logging
from pathlib import Path
import re
from typing import Generator, Optional, Dict, Any
from contextlib import contextmanager
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# In-memory store for guest session metadata (for cleanup). Lost on restart.
_guest_sessions: Dict[str, Dict[str, Any]] = {}

# Configure connect_args based on database type
# SQLite requires check_same_thread=False, PostgreSQL doesn't need it
connect_args = {}
is_postgresql = DATABASE_URL.startswith("postgresql")
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base for per-user tables (movies, favorite_directors, seen_countries)
Base = declarative_base()

# Separate base for shared tables (users) - stored in public schema
UserBase = declarative_base()


def get_db():
    """Get a database session for the public schema (users table)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_schema_name(user_id: int) -> str:
    """Generate a schema name from user ID."""
    return f"user_{user_id}"


def get_guest_schema_name(session_id: str) -> str:
    """Generate a schema/prefix name for a guest session. Safe for PostgreSQL and SQLite."""
    # Replace hyphens so UUIDs are valid identifiers (e.g. guest_a1b2c3d4_e5f6_...)
    sanitized = session_id.replace("-", "_")
    return f"guest_{sanitized}"


def create_user_schema(user_id: int) -> str:
    """
    Create a new PostgreSQL schema for a user and create all necessary tables.
    Returns the schema name.
    """
    schema_name = get_user_schema_name(user_id)
    
    with engine.connect() as conn:
        if is_postgresql:
            # Create schema for PostgreSQL
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
            conn.commit()
            logger.info(f"Created schema: {schema_name}")
            
            # Create tables in the new schema
            # We need to create tables with the schema prefix
            create_user_tables_in_schema(schema_name)
        else:
            # For SQLite, we'll use table prefixes instead of schemas
            # SQLite doesn't support schemas, so we create tables with user prefix
            logger.info(f"SQLite mode: Creating tables with prefix for user {user_id}")
            create_user_tables_sqlite(user_id)
    
    return schema_name


def create_user_tables_in_schema(schema_name: str):
    """Create user-specific tables in the given PostgreSQL schema."""
    with engine.connect() as conn:
        # Movies table
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS "{schema_name}".movies (
                id SERIAL PRIMARY KEY,
                title VARCHAR,
                year INTEGER,
                letterboxd_uri VARCHAR UNIQUE,
                director VARCHAR,
                country VARCHAR,
                runtime INTEGER,
                genres JSON,
                tmdb_id INTEGER,
                tmdb_data JSON,
                is_favorite BOOLEAN DEFAULT FALSE,
                seen_before BOOLEAN DEFAULT FALSE,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE
            )
        '''))
        
        # Create indexes for movies table
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_title ON "{schema_name}".movies (title)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_year ON "{schema_name}".movies (year)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_letterboxd_uri ON "{schema_name}".movies (letterboxd_uri)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_director ON "{schema_name}".movies (director)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_country ON "{schema_name}".movies (country)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_tmdb_id ON "{schema_name}".movies (tmdb_id)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_is_favorite ON "{schema_name}".movies (is_favorite)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_movies_seen_before ON "{schema_name}".movies (seen_before)'))
        
        # Favorite directors table
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS "{schema_name}".favorite_directors (
                id SERIAL PRIMARY KEY,
                director_name VARCHAR UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_favorite_directors_name ON "{schema_name}".favorite_directors (director_name)'))
        
        # Seen countries table
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS "{schema_name}".seen_countries (
                id SERIAL PRIMARY KEY,
                country_name VARCHAR UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{schema_name}_seen_countries_name ON "{schema_name}".seen_countries (country_name)'))
        
        # User preferences (single row per user, JSON blob)
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS "{schema_name}".user_preferences (
                id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                data JSONB,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        
        # Add tracked list columns if needed
        tracked_list_columns = get_tracked_list_names()
        for column_name in tracked_list_columns:
            try:
                conn.execute(text(f'ALTER TABLE "{schema_name}".movies ADD COLUMN IF NOT EXISTS {column_name} BOOLEAN DEFAULT FALSE'))
            except Exception as e:
                logger.debug(f"Column {column_name} may already exist: {e}")
        
        conn.commit()
        logger.info(f"Created tables in schema: {schema_name}")


def create_user_tables_sqlite(user_id: int):
    """Create user-specific tables for SQLite using table prefixes."""
    prefix = f"user_{user_id}_"
    
    with engine.connect() as conn:
        # Movies table
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                year INTEGER,
                letterboxd_uri TEXT UNIQUE,
                director TEXT,
                country TEXT,
                runtime INTEGER,
                genres TEXT,
                tmdb_id INTEGER,
                tmdb_data TEXT,
                is_favorite INTEGER DEFAULT 0,
                seen_before INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        '''))
        
        # Favorite directors table
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}favorite_directors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                director_name TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        
        # Seen countries table
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}seen_countries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                country_name TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        
        # User preferences (single row per user, JSON blob)
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}user_preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        
        conn.commit()
        logger.info(f"Created SQLite tables with prefix: {prefix}")


def create_guest_tables_sqlite(session_id: str):
    """Create guest-specific tables for SQLite using table prefix guest_<session_id>_."""
    schema_name = get_guest_schema_name(session_id)
    prefix = f"{schema_name}_"

    with engine.connect() as conn:
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                year INTEGER,
                letterboxd_uri TEXT UNIQUE,
                director TEXT,
                country TEXT,
                runtime INTEGER,
                genres TEXT,
                tmdb_id INTEGER,
                tmdb_data TEXT,
                is_favorite INTEGER DEFAULT 0,
                seen_before INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        '''))
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}favorite_directors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                director_name TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}seen_countries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                country_name TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.execute(text(f'''
            CREATE TABLE IF NOT EXISTS {prefix}user_preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.commit()
        logger.info(f"Created SQLite guest tables with prefix: {prefix}")


def create_guest_schema(session_id: str) -> str:
    """
    Create a new schema (PostgreSQL) or prefixed tables (SQLite) for a guest session.
    Returns the schema name.
    """
    schema_name = get_guest_schema_name(session_id)

    with engine.connect() as conn:
        if is_postgresql:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
            conn.commit()
            logger.info(f"Created guest schema: {schema_name}")
            create_user_tables_in_schema(schema_name)
        else:
            logger.info(f"SQLite mode: Creating guest tables with prefix for session {session_id}")
            create_guest_tables_sqlite(session_id)

    return schema_name


class UserScopedSession:
    """A session wrapper that automatically scopes queries to a user's schema."""
    
    def __init__(self, session: Session, schema_name: str, user_id: int):
        self._session = session
        self.schema_name = schema_name
        self.user_id = user_id
        self._setup_schema()
    
    def _setup_schema(self):
        """Set up the search path for PostgreSQL or prepare for SQLite prefix mode."""
        if is_postgresql:
            # Set the search path to the user's schema
            self._session.execute(text(f'SET search_path TO "{self.schema_name}", public'))
        # For SQLite, we'll handle table prefixes in the models/queries
    
    def __getattr__(self, name):
        """Delegate all other attributes to the underlying session."""
        return getattr(self._session, name)
    
    def close(self):
        """Close the session."""
        self._session.close()


def get_user_db_session(user_id: int, schema_name: str) -> Generator[UserScopedSession, None, None]:
    """
    Get a database session scoped to a specific user's schema.
    This is used by the dependency injection system.
    """
    session = SessionLocal()
    try:
        user_session = UserScopedSession(session, schema_name, user_id)
        yield user_session
    finally:
        session.close()


@contextmanager
def get_user_db_context(user_id: int, schema_name: str):
    """
    Context manager to get a database session scoped to a specific user's schema.
    """
    session = SessionLocal()
    try:
        user_session = UserScopedSession(session, schema_name, user_id)
        yield user_session
    finally:
        session.close()


def get_guest_db_session(session_id: str) -> Generator[UserScopedSession, None, None]:
    """
    Get a database session scoped to a guest session's schema/prefix.
    Uses sentinel user_id=-1 for guest so routes can branch on user_id for raw SQL (e.g. SQLite prefix).
    """
    schema_name = get_guest_schema_name(session_id)
    session = SessionLocal()
    try:
        guest_session = UserScopedSession(session, schema_name, -1)
        yield guest_session
    finally:
        session.close()


def register_guest_session(session_id: str, expires_at: datetime) -> None:
    """Register a guest session for later cleanup. In-memory only."""
    schema_name = get_guest_schema_name(session_id)
    _guest_sessions[session_id] = {
        "schema_name": schema_name,
        "created_at": datetime.utcnow(),
        "expires_at": expires_at,
    }
    logger.debug(f"Registered guest session {session_id}, expires at {expires_at}")


def get_registered_guest_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Return guest session metadata if registered and not expired."""
    meta = _guest_sessions.get(session_id)
    if not meta:
        return None
    if datetime.utcnow() > meta["expires_at"]:
        _guest_sessions.pop(session_id, None)
        return None
    return meta


def _drop_guest_schema(session_id: str) -> None:
    """Drop a single guest schema (PostgreSQL) or guest tables (SQLite)."""
    schema_name = get_guest_schema_name(session_id)
    with engine.connect() as conn:
        if is_postgresql:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            conn.commit()
            logger.info(f"Dropped guest schema: {schema_name}")
        else:
            prefix = f"{schema_name}_"
            for table_suffix in ("movies", "favorite_directors", "seen_countries", "user_preferences"):
                conn.execute(text(f"DROP TABLE IF EXISTS {prefix}{table_suffix}"))
            conn.commit()
            logger.info(f"Dropped SQLite guest tables with prefix: {prefix}")


def drop_guest_session(session_id: str) -> None:
    """Drop a single guest session's schema/tables and remove from registry (e.g. on explicit logout)."""
    try:
        _drop_guest_schema(session_id)
    except Exception as e:
        logger.warning(f"Failed to drop guest schema {session_id}: {e}")
    _guest_sessions.pop(session_id, None)


def cleanup_expired_guest_schemas() -> int:
    """
    Remove guest schemas/tables whose session has expired (older than 24h).
    Returns the number of schemas cleaned up.
    """
    now = datetime.utcnow()
    expired = [sid for sid, meta in _guest_sessions.items() if meta["expires_at"] < now]
    for session_id in expired:
        try:
            _drop_guest_schema(session_id)
        except Exception as e:
            logger.warning(f"Failed to drop guest schema {session_id}: {e}")
        _guest_sessions.pop(session_id, None)
    if expired:
        logger.info(f"Cleaned up {len(expired)} expired guest schema(s)")
    return len(expired)


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


def migrate_user_schema(schema_name: str):
    """
    Migrate a user's schema to add new columns and tables if they don't exist.
    Guest schemas are created with full structure; skip migration for them.
    """
    if schema_name.startswith("guest_"):
        return
    with engine.connect() as conn:
        if is_postgresql:
            # Check if movies table exists in the schema
            result = conn.execute(text(f'''
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = :schema_name 
                    AND table_name = 'movies'
                )
            '''), {"schema_name": schema_name})
            
            if result.scalar():
                # Add tracked list columns
                tracked_list_columns = get_tracked_list_names()
                for column_name in tracked_list_columns:
                    try:
                        conn.execute(text(f'ALTER TABLE "{schema_name}".movies ADD COLUMN IF NOT EXISTS {column_name} BOOLEAN DEFAULT FALSE'))
                    except Exception as e:
                        logger.debug(f"Column {column_name} may already exist: {e}")
                # Add user_preferences table if missing (existing users)
                pref_result = conn.execute(text(f'''
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = :schema_name
                        AND table_name = 'user_preferences'
                    )
                '''), {"schema_name": schema_name})
                if not pref_result.scalar():
                    conn.execute(text(f'''
                        CREATE TABLE "{schema_name}".user_preferences (
                            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                            data JSONB,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    '''))
                conn.commit()
        else:
            # SQLite: schema_name is "user_{id}", create user_preferences table if missing
            try:
                user_id_str = schema_name.replace("user_", "")
                user_id = int(user_id_str)
            except (ValueError, AttributeError):
                logger.warning(f"Could not parse user_id from schema_name: {schema_name}")
                return
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            pref_table = f"user_{user_id}_user_preferences"
            if pref_table not in tables:
                conn.execute(text(f'''
                    CREATE TABLE IF NOT EXISTS {pref_table} (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        data TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                '''))
                conn.commit()
                logger.info(f"Created {pref_table} for SQLite")


def migrate_db():
    """
    Migrate database schema for the public tables (users).
    Note: Per-user tables are created when users register.
    """
    inspector = inspect(engine)
    
    # Create users table in public schema if it doesn't exist
    # This is handled by UserBase.metadata.create_all()
    
    # Legacy migration for existing single-user data
    # Check if movies table exists in public schema (old schema)
    if 'movies' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('movies')]
        
        # Add tmdb_data column if it doesn't exist
        if 'tmdb_data' not in columns:
            logger.info("Adding tmdb_data column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN tmdb_data TEXT"))
                conn.commit()
            logger.info("Successfully added tmdb_data column")

        # Add is_favorite column if it doesn't exist
        if 'is_favorite' not in columns:
            logger.info("Adding is_favorite column to movies table")
            with engine.connect() as conn:
                column_type = "BOOLEAN DEFAULT FALSE" if is_postgresql else "INTEGER DEFAULT 0"
                conn.execute(text(f"ALTER TABLE movies ADD COLUMN is_favorite {column_type}"))
                conn.commit()
            logger.info("Successfully added is_favorite column")
        
        # Add seen_before column if it doesn't exist
        if 'seen_before' not in columns:
            logger.info("Adding seen_before column to movies table")
            with engine.connect() as conn:
                column_type = "BOOLEAN DEFAULT FALSE" if is_postgresql else "INTEGER DEFAULT 0"
                conn.execute(text(f"ALTER TABLE movies ADD COLUMN seen_before {column_type}"))
                conn.commit()
            logger.info("Successfully added seen_before column")
        
        # Add notes column if it doesn't exist
        if 'notes' not in columns:
            logger.info("Adding notes column to movies table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE movies ADD COLUMN notes TEXT"))
                conn.commit()
            logger.info("Successfully added notes column")
        
        # Add columns for tracked lists
        tracked_list_columns = get_tracked_list_names()
        for column_name in tracked_list_columns:
            if column_name not in columns:
                logger.info(f"Adding {column_name} column to movies table")
                with engine.connect() as conn:
                    column_type = "BOOLEAN DEFAULT FALSE" if is_postgresql else "INTEGER DEFAULT 0"
                    conn.execute(text(f"ALTER TABLE movies ADD COLUMN {column_name} {column_type}"))
                    conn.commit()
                logger.info(f"Successfully added {column_name} column")


def init_db():
    """
    Initialize database and run migrations.
    Creates the users table in the public schema.
    """
    migrate_db()
    # Create shared tables (users) in public schema
    UserBase.metadata.create_all(bind=engine)
    # Create legacy tables for backward compatibility
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized with users table")
