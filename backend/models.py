from sqlalchemy import Column, Integer, String, JSON, DateTime, Boolean
from sqlalchemy.sql import func
from database import Base

class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    year = Column(Integer, index=True)
    letterboxd_uri = Column(String, unique=True, index=True)
    director = Column(String, index=True)
    country = Column(String, index=True)
    runtime = Column(Integer)  # in minutes
    genres = Column(JSON)  # list of genre strings
    tmdb_id = Column(Integer, index=True)
    tmdb_data = Column(JSON)  # Full TMDB movie data cache
    is_favorite = Column(Boolean, default=False, index=True)
    seen_before = Column(Boolean, default=False, index=True)
    notes = Column(String)  # User notes for the movie
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class FavoriteDirector(Base):
    __tablename__ = "favorite_directors"

    id = Column(Integer, primary_key=True, index=True)
    director_name = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SeenCountry(Base):
    __tablename__ = "seen_countries"

    id = Column(Integer, primary_key=True, index=True)
    country_name = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
