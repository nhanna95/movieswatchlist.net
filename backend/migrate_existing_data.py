#!/usr/bin/env python3
"""
Migration script to migrate existing single-user data to a user-specific schema.

This script:
1. Creates a default user account
2. Creates the user's schema
3. Moves existing movies, favorite_directors, and seen_countries to the user's schema
4. Optionally cleans up the old public tables

Usage:
    python migrate_existing_data.py [--username USERNAME] [--password PASSWORD] [--cleanup]

Arguments:
    --username: Username for the default user (default: admin)
    --password: Password for the default user (default: password123)
    --cleanup: If specified, removes the old tables from public schema after migration
"""

import argparse
import logging
import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from database import engine, SessionLocal, is_postgresql, create_user_schema, get_user_schema_name
from auth import hash_password
from models import User

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def check_existing_data():
    """Check if there's existing data to migrate."""
    with engine.connect() as conn:
        # Check if movies table exists and has data
        try:
            result = conn.execute(text("SELECT COUNT(*) FROM movies"))
            movie_count = result.scalar()
            logger.info(f"Found {movie_count} movies in public schema")
            return movie_count > 0
        except Exception as e:
            logger.info(f"No movies table found or error: {e}")
            return False


def create_default_user(username: str, password: str):
    """Create a default user account."""
    db = SessionLocal()
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.username == username).first()
        
        if existing_user:
            logger.info(f"User {username} already exists with ID {existing_user.id}")
            return existing_user
        
        # Create user
        hashed_password = hash_password(password)
        
        # Create user record with temporary schema name
        user = User(
            username=username,
            hashed_password=hashed_password,
            schema_name=f"user_temp"
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Update with real schema name
        real_schema_name = get_user_schema_name(user.id)
        user.schema_name = real_schema_name
        db.commit()
        
        logger.info(f"Created user {username} with ID {user.id} and schema {real_schema_name}")
        return user
        
    finally:
        db.close()


def migrate_data_to_user_schema(user_id: int, schema_name: str, cleanup: bool = False):
    """Migrate existing data from public schema to user's schema."""
    
    # First create the user's schema and tables
    logger.info(f"Creating schema {schema_name} for user {user_id}")
    create_user_schema(user_id)
    
    with engine.connect() as conn:
        if is_postgresql:
            # PostgreSQL: Copy data from public tables to user schema tables
            
            # Migrate movies
            try:
                # Get column names from public.movies (excluding 'id' as it will be auto-generated)
                result = conn.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = 'movies'
                    AND column_name != 'id'
                    ORDER BY ordinal_position
                """))
                columns = [row[0] for row in result.fetchall()]
                
                if columns:
                    columns_str = ', '.join(columns)
                    
                    # Copy movies data
                    result = conn.execute(text(f"""
                        INSERT INTO "{schema_name}".movies ({columns_str})
                        SELECT {columns_str} FROM public.movies
                    """))
                    conn.commit()
                    
                    # Count migrated movies
                    count_result = conn.execute(text(f'SELECT COUNT(*) FROM "{schema_name}".movies'))
                    migrated_count = count_result.scalar()
                    logger.info(f"Migrated {migrated_count} movies to schema {schema_name}")
            except Exception as e:
                logger.warning(f"Error migrating movies: {e}")
            
            # Migrate favorite_directors
            try:
                result = conn.execute(text(f"""
                    INSERT INTO "{schema_name}".favorite_directors (director_name, created_at)
                    SELECT director_name, created_at FROM public.favorite_directors
                """))
                conn.commit()
                
                count_result = conn.execute(text(f'SELECT COUNT(*) FROM "{schema_name}".favorite_directors'))
                migrated_count = count_result.scalar()
                logger.info(f"Migrated {migrated_count} favorite directors to schema {schema_name}")
            except Exception as e:
                logger.warning(f"Error migrating favorite_directors: {e}")
            
            # Migrate seen_countries
            try:
                result = conn.execute(text(f"""
                    INSERT INTO "{schema_name}".seen_countries (country_name, created_at)
                    SELECT country_name, created_at FROM public.seen_countries
                """))
                conn.commit()
                
                count_result = conn.execute(text(f'SELECT COUNT(*) FROM "{schema_name}".seen_countries'))
                migrated_count = count_result.scalar()
                logger.info(f"Migrated {migrated_count} seen countries to schema {schema_name}")
            except Exception as e:
                logger.warning(f"Error migrating seen_countries: {e}")
            
            # Cleanup old tables if requested
            if cleanup:
                logger.info("Cleaning up old tables from public schema...")
                try:
                    conn.execute(text("DROP TABLE IF EXISTS public.movies CASCADE"))
                    conn.execute(text("DROP TABLE IF EXISTS public.favorite_directors CASCADE"))
                    conn.execute(text("DROP TABLE IF EXISTS public.seen_countries CASCADE"))
                    conn.commit()
                    logger.info("Old tables removed from public schema")
                except Exception as e:
                    logger.warning(f"Error cleaning up old tables: {e}")
        
        else:
            # SQLite: Use table prefixes instead of schemas
            prefix = f"user_{user_id}_"
            
            # Migrate movies
            try:
                # Get column names (excluding 'id')
                result = conn.execute(text("PRAGMA table_info(movies)"))
                columns = [row[1] for row in result.fetchall() if row[1] != 'id']
                
                if columns:
                    columns_str = ', '.join(columns)
                    
                    # Copy movies data
                    conn.execute(text(f"""
                        INSERT INTO {prefix}movies ({columns_str})
                        SELECT {columns_str} FROM movies
                    """))
                    conn.commit()
                    
                    count_result = conn.execute(text(f'SELECT COUNT(*) FROM {prefix}movies'))
                    migrated_count = count_result.scalar()
                    logger.info(f"Migrated {migrated_count} movies to {prefix}movies")
            except Exception as e:
                logger.warning(f"Error migrating movies: {e}")
            
            # Migrate favorite_directors
            try:
                conn.execute(text(f"""
                    INSERT INTO {prefix}favorite_directors (director_name, created_at)
                    SELECT director_name, created_at FROM favorite_directors
                """))
                conn.commit()
                
                count_result = conn.execute(text(f'SELECT COUNT(*) FROM {prefix}favorite_directors'))
                migrated_count = count_result.scalar()
                logger.info(f"Migrated {migrated_count} favorite directors to {prefix}favorite_directors")
            except Exception as e:
                logger.warning(f"Error migrating favorite_directors: {e}")
            
            # Migrate seen_countries
            try:
                conn.execute(text(f"""
                    INSERT INTO {prefix}seen_countries (country_name, created_at)
                    SELECT country_name, created_at FROM seen_countries
                """))
                conn.commit()
                
                count_result = conn.execute(text(f'SELECT COUNT(*) FROM {prefix}seen_countries'))
                migrated_count = count_result.scalar()
                logger.info(f"Migrated {migrated_count} seen countries to {prefix}seen_countries")
            except Exception as e:
                logger.warning(f"Error migrating seen_countries: {e}")
            
            # Cleanup old tables if requested
            if cleanup:
                logger.info("Cleaning up old tables...")
                try:
                    conn.execute(text("DROP TABLE IF EXISTS movies"))
                    conn.execute(text("DROP TABLE IF EXISTS favorite_directors"))
                    conn.execute(text("DROP TABLE IF EXISTS seen_countries"))
                    conn.commit()
                    logger.info("Old tables removed")
                except Exception as e:
                    logger.warning(f"Error cleaning up old tables: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='Migrate existing data to a user-specific schema'
    )
    parser.add_argument(
        '--username',
        default='admin',
        help='Username for the default user (default: admin)'
    )
    parser.add_argument(
        '--password',
        default='password123',
        help='Password for the default user (default: password123)'
    )
    parser.add_argument(
        '--cleanup',
        action='store_true',
        help='Remove old tables from public schema after migration'
    )
    
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("Data Migration Script")
    logger.info("=" * 60)
    
    # Check if there's existing data
    has_data = check_existing_data()
    
    if not has_data:
        logger.info("No existing data to migrate. Creating user only.")
    
    # Create default user
    logger.info(f"Creating default user: {args.username}")
    user = create_default_user(args.username, args.password)
    
    if has_data:
        # Migrate data to user's schema
        logger.info("Migrating existing data to user's schema...")
        migrate_data_to_user_schema(user.id, user.schema_name, args.cleanup)
    
    logger.info("=" * 60)
    logger.info("Migration complete!")
    logger.info(f"Default user: {user.username}")
    logger.info(f"User ID: {user.id}")
    logger.info(f"Schema: {user.schema_name}")
    logger.info("=" * 60)
    logger.info("")
    logger.info("IMPORTANT: Save these credentials!")
    logger.info(f"  Username: {args.username}")
    logger.info(f"  Password: {args.password}")
    logger.info("")


if __name__ == "__main__":
    main()
