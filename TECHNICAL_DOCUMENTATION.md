# Movies Watchlist - Technical Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Database Schema](#database-schema)
6. [API Documentation](#api-documentation)
7. [Feature Implementation](#feature-implementation)
8. [Data Flow](#data-flow)
9. [External Integrations](#external-integrations)
10. [Deployment](#deployment)
11. [Development Guide](#development-guide)

---

## Project Overview

Movies Watchlist is a full-stack web application for managing movie collections with advanced filtering, statistics, and integration with The Movie Database (TMDb) API. The application allows users to import movies from Letterboxd CSV exports, manually add movies, and organize their collection with rich metadata.

### Technology Stack

**Backend:**
- Python 3.8+
- FastAPI (Web framework)
- SQLAlchemy (ORM)
- SQLite (Database, configurable to PostgreSQL)
- Pandas (CSV processing)
- Uvicorn (ASGI server)
- Requests (HTTP client for TMDb API)

**Frontend:**
- React 18.2.0
- Axios (HTTP client)
- React Scripts (Build tooling)
- Prettier (Code formatting)

**External Services:**
- The Movie Database (TMDb) API v3

---

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    User[User Browser] -->|HTTP/HTTPS| Frontend[React Frontend<br/>Port 3000]
    Frontend -->|REST API| Backend[FastAPI Backend<br/>Port 8000]
    Backend -->|SQL Queries| Database[(SQLite Database)]
    Backend -->|API Calls| TMDB[TMDb API<br/>api.themoviedb.org]
    Frontend -->|File Upload| Backend
    Backend -->|CSV Processing| CSVParser[CSV Parser Module]
    Backend -->|List Matching| ListProcessor[List Processor Module]
```

### Component Architecture

```mermaid
graph LR
    subgraph Frontend
        A[App.jsx] --> B[Components]
        A --> C[Hooks]
        A --> D[Services]
        B --> E[MovieList]
        B --> F[FilterBar]
        B --> G[Modals]
        C --> H[useMovies]
        C --> I[useFilters]
        C --> J[useSettings]
        D --> K[api.js]
    end
    
    subgraph Backend
        L[main.py] --> M[routes.py]
        M --> N[Models]
        M --> O[Database]
        M --> P[CSV Parser]
        M --> Q[TMDb Client]
        M --> R[List Processor]
        M --> S[Profile Export]
    end
```

---

## Backend Architecture

### Application Structure

```
backend/
├── main.py              # FastAPI app initialization, CORS, lifespan
├── routes.py            # All API route handlers (3500+ lines)
├── models.py            # SQLAlchemy ORM models
├── database.py          # Database connection, migrations
├── config.py            # Environment configuration
├── tmdb_client.py       # TMDb API client wrapper
├── csv_parser.py        # CSV parsing logic
├── list_processor.py    # Tracked lists matching
├── profile_export.py    # Profile export/import
├── utils.py             # Utility functions
└── requirements.txt     # Python dependencies
```

### FastAPI Application Setup

**File: `main.py`**

The application uses FastAPI with:
- **Lifespan Management**: Database initialization on startup
- **CORS Middleware**: Configured for React dev server (localhost:3000)
- **Logging**: Debug-level logging configured
- **Port Management**: Automatically kills processes on port 8000 before starting

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # Initialize database and run migrations
    yield
```

### Database Layer

**File: `database.py`**

**Connection Management:**
- SQLAlchemy engine with SQLite (configurable via `DATABASE_URL`)
- Session factory for database sessions
- Dependency injection pattern via `get_db()` generator

**Migration System:**
- Dynamic schema migration on startup
- Adds missing columns without requiring explicit migrations
- Supports tracked lists as dynamic columns
- Handles SQLite boolean storage (0/1 integers)

**Key Functions:**
- `init_db()`: Initializes database and runs migrations
- `migrate_db()`: Adds missing columns dynamically
- `get_tracked_list_names()`: Scans `tracked-lists/` directory for CSV files
- `filename_to_column_name()`: Converts CSV filenames to column names (e.g., `imdb-t250.csv` → `is_imdb_t250`)

### Data Models

**File: `models.py`**

#### Movie Model

```python
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
    tmdb_data = Column(JSON)  # Full TMDb movie data cache
    is_favorite = Column(Boolean, default=False, index=True)
    seen_before = Column(Boolean, default=False, index=True)
    notes = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    # Dynamic columns for tracked lists (e.g., is_imdb_t250, is_letterboxd_t250)
```

**Key Features:**
- `letterboxd_uri` is unique and indexed for fast lookups
- `tmdb_data` stores full TMDb response as JSON for caching
- Dynamic tracked list columns added via migrations
- Timestamps for creation and updates

#### FavoriteDirector Model

```python
class FavoriteDirector(Base):
    __tablename__ = "favorite_directors"
    
    id = Column(Integer, primary_key=True, index=True)
    director_name = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

#### SeenCountry Model

```python
class SeenCountry(Base):
    __tablename__ = "seen_countries"
    
    id = Column(Integer, primary_key=True, index=True)
    country_name = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

### API Routes

**File: `routes.py`** (3500+ lines)

The routes file contains all API endpoints organized by functionality:

#### 1. CSV Upload & Processing

**POST `/api/upload`**
- Streams CSV processing with Server-Sent Events (SSE)
- Yields progress updates during processing
- Handles both file uploads and local file paths
- Processes movies with TMDb enrichment
- Matches movies to tracked lists

**POST `/api/preview-csv`**
- Parses CSV and returns preview
- Identifies movies to add vs. remove
- Returns structured data for frontend selection

**POST `/api/process-csv-with-selections`**
- Processes CSV with user selections
- Supports marking movies as favorites/seen-before during import
- Streams progress updates

**Implementation Details:**
- Uses `parse_watchlist_csv()` from `csv_parser.py`
- Enriches each movie via `tmdb_client.enrich_movie_data()`
- Matches to tracked lists via `check_movie_in_tracked_lists()`
- Handles duplicates by `letterboxd_uri` and `title+year`

#### 2. Movie Retrieval

**GET `/api/movies`**
- Complex filtering system with 20+ filter types
- Supports AND/OR logic via `or_group_list_filters`
- Pagination via `skip` and `limit`
- Multiple sorting options
- Search functionality

**Filter Types:**
- Year range (`year_min`, `year_max`)
- Directors (multiselect, exclude option)
- Countries (multiselect, exclude option, seen countries exclusion)
- Genres (multiselect, exclude option)
- Runtime range (`runtime_min`, `runtime_max`)
- Languages (original and spoken)
- Ratings (vote average, popularity)
- Production companies
- Cast/crew (actors, writers, producers)
- Collections
- Date added range
- Favorites and seen-before
- Streaming availability (by country, service, type)
- Tracked lists (dynamic columns)

**Sorting:**
- Multiple column sorting via `sort_by` and `sort_order` arrays
- Default: year (desc), title (asc)
- Supports: title, year, runtime, vote_average, popularity, date_added

**Query Building:**
- Uses SQLAlchemy query builder
- Dynamic WHERE clause construction
- JSON field queries for genres, cast, etc.
- Streaming availability filtering via JSON path queries

**GET `/api/movies/{movie_id}`**
- Returns full movie details
- Includes all metadata and cached TMDb data

**GET `/api/movies/stats`**
- Calculates comprehensive statistics:
  - Total movies, favorites, seen-before
  - Year distribution
  - Genre distribution
  - Country distribution
  - Director distribution
  - Runtime statistics (min, max, avg, median)
  - Rating statistics (vote average, popularity)

#### 3. Movie Management

**POST `/api/movies`**
- Adds new movie manually
- Requires TMDb ID or title+year
- Enriches with TMDb data
- Handles duplicates

**PATCH `/api/movies/{movie_id}/favorite`**
- Toggles favorite status

**PATCH `/api/movies/{movie_id}/seen-before`**
- Toggles seen-before status

**PATCH `/api/movies/{movie_id}/notes`**
- Updates user notes

**DELETE `/api/movies/{movie_id}`**
- Deletes movie from database

#### 4. Directors & Countries Management

**GET/POST/DELETE `/api/directors/favorites`**
- Manages favorite directors list

**GET/POST/DELETE `/api/countries/seen`**
- Manages seen countries list

#### 5. Streaming Services

**GET `/api/movies/{movie_id}/streaming`**
- Returns streaming availability for a movie
- Filters by country code
- Returns providers by type (flatrate, free, rent, buy)

**GET `/api/streaming-services`**
- Returns list of all available streaming services
- Includes provider IDs and names

#### 6. Tracked Lists

**POST `/api/movies/process-tracked-lists`**
- Processes all CSV files in `tracked-lists/` directory
- Matches movies by URI or title+year
- Updates dynamic columns (e.g., `is_imdb_t250`)
- Streams progress updates

**Matching Algorithm:**
1. Normalize URIs (extract path from full URLs)
2. Try exact URI match first
3. Fallback to normalized title+year match
4. Update movie's tracked list columns

#### 7. Profile Export/Import

**POST `/api/export-profile`**
- Exports entire profile to ZIP file
- Includes movies, favorite directors, seen countries, preferences
- Option to include/exclude TMDb data
- Returns ZIP file download

**POST `/api/import-profile`**
- Imports profile from ZIP file
- Clears existing database
- Streams import progress
- Handles errors gracefully (continues on failure)

### TMDb Client

**File: `tmdb_client.py`**

**TMDbClient Class:**

```python
class TMDbClient:
    def search_movie(title, year=None) -> Dict
    def get_movie_details(tmdb_id) -> Dict
    def get_collection_details(collection_id) -> Dict
    def enrich_movie_data(title, year=None) -> Dict
```

**Key Features:**
- **Smart Matching**: Year verification with ±1 year tolerance
- **Title Scoring**: Exact match > starts with > contains > similarity
- **Popularity Bonus**: Uses TMDb popularity and vote count for tiebreaking
- **Full Data Caching**: Stores complete TMDb response in `tmdb_data` JSON field
- **Error Handling**: Graceful fallbacks on API failures

**Data Enrichment:**
- Extracts director from credits
- Extracts country from production_countries
- Extracts runtime, genres, TMDb ID
- Caches full response for later use

### CSV Parser

**File: `csv_parser.py`**

**Functions:**
- `parse_watchlist_csv()`: Parses Letterboxd watchlist CSV
- `parse_tracked_list_csv()`: Parses tracked list CSV (different format)

**Features:**
- **Encoding Detection**: Tries multiple encodings (UTF-8, UTF-8-sig, Latin-1, ISO-8859-1)
- **Flexible Column Mapping**: Handles various column name variations
- **Date Parsing**: Supports multiple date formats
- **Validation**: Validates years, required fields
- **Error Reporting**: Detailed error messages with suggestions

**CSV Format Support:**
- Letterboxd watchlist: `Date, Name, Year, Letterboxd URI`
- Tracked lists: `Position, Name, Year, URL, Description` (with header rows)

### List Processor

**File: `list_processor.py`**

**Functions:**
- `load_tracked_lists()`: Loads all CSV files from `tracked-lists/` directory
- `check_movie_in_tracked_lists()`: Checks if movie is in any tracked list
- `process_all_tracked_lists()`: Processes all lists with progress updates
- `normalize_title()`: Normalizes titles for matching (removes articles, special chars)
- `normalize_uri()`: Normalizes URIs for comparison

**Matching Algorithm:**
1. **URI Matching**: Normalize and compare URIs (primary method)
2. **Title+Year Matching**: Normalize titles and match by year (fallback)
3. **Normalization**: Removes "The", "A", "An" prefixes, special characters

### Profile Export/Import

**File: `profile_export.py`**

**Functions:**
- `export_profile_to_json()`: Builds JSON structure from database
- `create_profile_zip()`: Creates ZIP file with profile JSON
- `extract_profile_zip()`: Extracts and parses ZIP file
- `import_profile_from_json()`: Imports movies from JSON
- `import_profile_from_json_stream()`: Streams import with progress

**Export Format:**
```json
{
  "version": "1.0",
  "export_date": "2026-01-25T12:00:00Z",
  "metadata": {
    "total_movies": 1000,
    "favorite_movies_count": 50,
    "includes_tmdb_data": true
  },
  "movies": [...],
  "favorite_directors": [...],
  "seen_countries": [...],
  "preferences": {...}
}
```

---

## Frontend Architecture

### Application Structure

```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── App.jsx              # Main application component
│   ├── index.js            # React entry point
│   ├── index.css           # Global styles
│   ├── components/         # React components
│   │   ├── MovieList.jsx
│   │   ├── FilterBar.jsx
│   │   ├── FilterMenu.jsx
│   │   ├── MovieModal.jsx
│   │   ├── AddMovieModal.jsx
│   │   ├── UploadCSV.jsx
│   │   ├── StatisticsDashboard.jsx
│   │   ├── SettingsModal.jsx
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   │   ├── useMovies.js
│   │   ├── useFilters.js
│   │   ├── useSettings.js
│   │   ├── useSorting.js
│   │   └── useKeyboardShortcuts.js
│   ├── services/           # API service layer
│   │   └── api.js
│   └── utils/              # Utility functions
│       ├── formatting.js
│       ├── countryDetection.js
│       └── dropdownPosition.js
└── package.json
```

### Main Application Component

**File: `App.jsx`**

**State Management:**
- Uses React hooks for state management
- Custom hooks for complex state logic
- LocalStorage for persistence (filters, settings, search)

**Key Features:**
- Country auto-detection for streaming services
- Keyboard shortcuts handling
- Toast notifications system
- Dialog/Modal management
- Settings persistence

### Custom Hooks

#### useMovies Hook

**File: `hooks/useMovies.js`**

**Responsibilities:**
- Movie data fetching and caching
- Pagination management (infinite scroll)
- Filter/sort parameter building
- Movie selection and modal management
- Statistics loading
- Favorite/delete operations

**State:**
```javascript
{
  movies: Movie[],
  loading: boolean,
  loadingMore: boolean,
  stats: Stats | null,
  selectedMovie: Movie | null,
  collectionMovies: Movie[],
  similarMovies: Movie[],
  pagination: { skip, limit, total, hasMore }
}
```

**Key Functions:**
- `loadMovies(reset)`: Fetches movies with current filters/sorts
- `loadMoreMovies()`: Loads next page for infinite scroll
- `buildApiParams(skip)`: Builds API parameters from filters/sorts
- `handleMovieClick(movie)`: Opens movie modal and loads details
- `handleToggleFavorite(movie)`: Toggles favorite status
- `handleDeleteMovie(movieId)`: Deletes movie

#### useFilters Hook

**File: `hooks/useFilters.js`**

**Responsibilities:**
- Filter state management
- LocalStorage persistence
- Filter application and clearing
- Tracked list filtering
- Search query management

**State:**
```javascript
{
  filters: Filter[],
  search: string,
  defaultFilters: Filter[],
  previousFilters: Filter[] | null
}
```

**Key Functions:**
- `handleFiltersChange(newFilters)`: Updates filters
- `handleFilterByTrackedList(columnName)`: Applies tracked list filter
- `handleRevertFilters()`: Reverts to previous filters
- `clearFilters()`: Clears all filters
- `resetToDefaultFilters()`: Resets to default filters

**Filter Structure:**
```javascript
{
  id: string,
  type: string,  // e.g., 'year', 'director', 'genre'
  config: {
    value: any,
    exclude?: boolean,
    // ... type-specific config
  }
}
```

#### useSettings Hook

**File: `hooks/useSettings.js`**

**Responsibilities:**
- Settings state management
- LocalStorage persistence
- Column customization
- User preferences

**Settings Include:**
- Column visibility
- Column order
- Page size
- Show favorites first
- Preferred streaming services
- Country code

### API Service Layer

**File: `services/api.js`**

**Axios Configuration:**
- Base URL: `http://localhost:8000` (configurable via env)
- Custom params serializer for FastAPI array parameters
- Handles blob responses for file downloads
- Error handling and network error detection

**Key Functions:**
- `getMovies(params)`: Fetches movies with filters/sorts
- `getStats()`: Fetches statistics
- `getMovie(movieId)`: Fetches single movie
- `setMovieFavorite(movieId, isFavorite)`: Updates favorite status
- `deleteMovie(movieId)`: Deletes movie
- `addMovie(movieData)`: Adds new movie
- `searchTmdbMovie(title, year)`: Searches TMDb
- `previewCSV(file)`: Previews CSV before import
- `processCSVWithSelections(file, selections)`: Processes CSV
- `exportProfile()`: Exports profile as ZIP
- `importProfile(file)`: Imports profile from ZIP

**Params Serialization:**
- Uses `qs` library with `arrayFormat: 'repeat'`
- Converts arrays to `?key=val1&key=val2` format
- Handles boolean values correctly
- Filters out null/undefined/empty values

### Components

#### MovieList Component

**File: `components/MovieList.jsx`**

**Features:**
- Displays movies in table format
- Sortable columns
- Infinite scroll pagination
- Column customization (visibility, order)
- Movie click to open modal
- Favorite toggle
- Loading states

**Column Types:**
- Title, Year, Director, Country, Runtime
- Genres, Rating, Popularity
- Favorite, Seen Before
- Tracked list indicators
- Streaming availability

#### FilterBar Component

**File: `components/FilterBar.jsx`**

**Features:**
- Displays active filters as tags
- Filter removal
- OR group creation
- Search bar
- Clear all filters
- Filter menu integration

#### FilterMenu Component

**File: `components/FilterMenu.jsx`**

**Features:**
- Filter type selection
- Filter configuration UI
- Exclude options
- Range inputs (year, runtime, ratings)
- Multiselect dropdowns
- OR group management

**Filter Types:**
- Year range
- Directors (multiselect)
- Countries (multiselect)
- Genres (multiselect)
- Runtime range
- Languages
- Ratings
- Production companies
- Cast/crew
- Collections
- Date added
- Favorites/seen-before
- Streaming availability
- Tracked lists

#### MovieModal Component

**File: `components/MovieModal.jsx`**

**Features:**
- Full movie details display
- Favorite/seen-before toggles
- Notes editing
- Collection navigation
- Similar movies
- Streaming availability
- Director movies link
- Delete movie

#### UploadCSV Component

**File: `components/UploadCSV.jsx`**

**Features:**
- File selection and upload
- CSV preview with add/remove lists
- Selection checkboxes
- Favorites/seen-before marking during import
- Progress tracking (SSE)
- Error handling

**Workflow:**
1. User selects CSV file
2. Frontend calls `previewCSV()` API
3. Displays movies to add/remove
4. User selects movies and options
5. Frontend calls `processCSVWithSelections()` API
6. Displays progress via SSE stream
7. Shows completion message

#### StatisticsDashboard Component

**File: `components/StatisticsDashboard.jsx`**

**Features:**
- Total movie count
- Year distribution chart
- Genre distribution
- Country distribution
- Director distribution
- Runtime statistics
- Rating statistics
- Filtered statistics support

---

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    MOVIES ||--o{ FAVORITE_DIRECTORS : "has"
    MOVIES ||--o{ SEEN_COUNTRIES : "has"
    
    MOVIES {
        int id PK
        string title
        int year
        string letterboxd_uri UK
        string director
        string country
        int runtime
        json genres
        int tmdb_id
        json tmdb_data
        boolean is_favorite
        boolean seen_before
        string notes
        datetime created_at
        datetime updated_at
        boolean is_imdb_t250
        boolean is_letterboxd_t250
        ... other tracked list columns
    }
    
    FAVORITE_DIRECTORS {
        int id PK
        string director_name UK
        datetime created_at
    }
    
    SEEN_COUNTRIES {
        int id PK
        string country_name UK
        datetime created_at
    }
```

### Indexes

**Movies Table:**
- `id` (PRIMARY KEY)
- `title` (INDEX)
- `year` (INDEX)
- `letterboxd_uri` (UNIQUE INDEX)
- `director` (INDEX)
- `country` (INDEX)
- `tmdb_id` (INDEX)
- `is_favorite` (INDEX)
- `seen_before` (INDEX)
- Tracked list columns (INDEX, if applicable)

**FavoriteDirectors Table:**
- `id` (PRIMARY KEY)
- `director_name` (UNIQUE INDEX)

**SeenCountries Table:**
- `id` (PRIMARY KEY)
- `country_name` (UNIQUE INDEX)

### JSON Fields

**genres**: Array of genre strings
```json
["Action", "Drama", "Thriller"]
```

**tmdb_data**: Full TMDb API response
```json
{
  "id": 550,
  "title": "Fight Club",
  "overview": "...",
  "release_date": "1999-10-15",
  "genres": [...],
  "credits": {
    "cast": [...],
    "crew": [...]
  },
  "watch/providers": {
    "results": {
      "US": {
        "flatrate": [...],
        "rent": [...],
        "buy": [...]
      }
    }
  },
  ...
}
```

---

## API Documentation

### Base URL

- Development: `http://localhost:8000`
- Production: Configured via environment

### Authentication

Currently none (single-user application). Can be extended with JWT or session-based auth.

### Response Format

**Success Response:**
```json
{
  "movies": [...],
  "total": 1000,
  "skip": 0,
  "limit": 50
}
```

**Error Response:**
```json
{
  "detail": "Error message"
}
```

### Endpoints Summary

#### CSV Operations
- `POST /api/upload` - Upload and process CSV
- `POST /api/preview-csv` - Preview CSV before import
- `POST /api/process-csv-with-selections` - Process CSV with selections

#### Movie Operations
- `GET /api/movies` - List movies (with filters/sorts)
- `GET /api/movies/{id}` - Get movie details
- `POST /api/movies` - Add new movie
- `PATCH /api/movies/{id}/favorite` - Toggle favorite
- `PATCH /api/movies/{id}/seen-before` - Toggle seen-before
- `PATCH /api/movies/{id}/notes` - Update notes
- `DELETE /api/movies/{id}` - Delete movie

#### Statistics & Lists
- `GET /api/movies/stats` - Get statistics
- `GET /api/movies/directors` - List all directors
- `GET /api/movies/countries` - List all countries
- `GET /api/movies/genres` - List all genres
- `GET /api/movies/original-languages` - List languages
- `GET /api/movies/production-companies` - List companies
- `GET /api/movies/actors` - List all actors
- `GET /api/movies/writers` - List all writers
- `GET /api/movies/producers` - List all producers

#### TMDb Integration
- `GET /api/movies/search-tmdb` - Search TMDb
- `GET /api/movies/tmdb/{tmdb_id}/details` - Get TMDb details
- `GET /api/movies/{id}/collection` - Get collection movies
- `GET /api/movies/{id}/similar` - Get similar movies
- `GET /api/movies/{id}/streaming` - Get streaming info

#### Directors & Countries
- `GET /api/directors/favorites` - List favorite directors
- `POST /api/directors/favorites` - Add favorite director
- `DELETE /api/directors/favorites/{name}` - Remove favorite director
- `GET /api/countries/seen` - List seen countries
- `POST /api/countries/seen` - Add seen country
- `DELETE /api/countries/seen/{name}` - Remove seen country

#### Streaming
- `GET /api/streaming-services` - List streaming services

#### Tracked Lists
- `POST /api/movies/process-tracked-lists` - Process tracked lists

#### Profile
- `POST /api/export-profile` - Export profile (ZIP)
- `POST /api/import-profile` - Import profile (ZIP)

#### Cache
- `POST /api/movies/recache` - Recache movies
- `POST /api/movies/clear-cache` - Clear cache

### Query Parameters

**GET /api/movies** supports extensive query parameters:

**Pagination:**
- `skip`: Number of records to skip (default: 0)
- `limit`: Number of records to return (default: 50)

**Filtering:**
- `year_min`, `year_max`: Year range
- `director`: Array of director names
- `director_exclude`: Boolean
- `country`: Array of country names
- `country_exclude`: Boolean
- `exclude_seen_countries`: Boolean
- `genre`: Array of genre names
- `genre_exclude`: Boolean
- `runtime_min`, `runtime_max`: Runtime range (minutes)
- `original_language`: Array of language codes
- `spoken_language`: Array of language codes
- `vote_average_min`, `vote_average_max`: Rating range
- `popularity_min`, `popularity_max`: Popularity range
- `production_company`: Array of company names
- `production_company_exclude`: Boolean
- `actor`: Array of actor names
- `actor_exclude`: Boolean
- `writer`: Array of writer names
- `writer_exclude`: Boolean
- `producer`: Array of producer names
- `producer_exclude`: Boolean
- `collection`: Boolean (true for movies in collections)
- `date_added_min`, `date_added_max`: ISO date strings
- `favorites_only`: Boolean
- `seen_before`: Boolean
- `favorited_directors_only`: Boolean
- `search`: String (title search)
- `availability_type`: Array of types (for_free, for_rent, to_buy, unavailable)
- `watch_region`: ISO country code
- `preferred_services`: Array of provider IDs
- `availability_exclude`: Boolean
- `or_group_list_filters`: JSON string (for OR logic)

**Sorting:**
- `sort_by`: Array of field names
- `sort_order`: Array of orders ('asc' or 'desc')
- `show_favorites_first`: Boolean

**Example:**
```
GET /api/movies?year_min=2020&year_max=2024&director=Christopher Nolan&genre=Action&sort_by=year&sort_order=desc&skip=0&limit=50
```

---

## Feature Implementation

### CSV Import Feature

**Workflow:**

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant CSV Parser
    participant TMDb API
    participant Database
    
    User->>Frontend: Upload CSV file
    Frontend->>Backend: POST /api/preview-csv
    Backend->>CSV Parser: parse_watchlist_csv()
    CSV Parser-->>Backend: movies_data[]
    Backend-->>Frontend: preview (movies_to_add, movies_to_remove)
    Frontend->>User: Display preview with selections
    User->>Frontend: Select movies and options
    Frontend->>Backend: POST /api/process-csv-with-selections
    Backend->>CSV Parser: parse_watchlist_csv()
    Backend->>Database: Check for duplicates
    loop For each movie
        Backend->>TMDb API: enrich_movie_data()
        TMDb API-->>Backend: enriched_data
        Backend->>Database: Save movie
        Backend->>List Processor: check_movie_in_tracked_lists()
        Backend-->>Frontend: Progress update (SSE)
    end
    Backend-->>Frontend: Completion
```

**Implementation Details:**
1. **CSV Parsing**: Handles multiple encodings, flexible column mapping
2. **Duplicate Detection**: Checks by `letterboxd_uri` and `title+year`
3. **TMDb Enrichment**: Fetches full movie data, caches in `tmdb_data`
4. **Tracked List Matching**: Matches by URI or normalized title+year
5. **Progress Streaming**: Uses Server-Sent Events for real-time updates

### Advanced Filtering System

**Filter Architecture:**

```mermaid
graph TB
    A[FilterBar Component] --> B[FilterMenu Component]
    B --> C[Filter Type Handlers]
    C --> D[FilterDropdown]
    C --> E[Range Inputs]
    C --> F[Multiselect]
    A --> G[Filter Tags]
    G --> H[Remove Filter]
    A --> I[OR Group Creator]
    I --> J[OR Group Filters]
    A --> K[Search Bar]
    K --> L[Title Search]
    A --> M[Clear Filters]
    M --> N[Reset State]
```

**Filter Processing:**
1. Frontend builds filter configuration objects
2. `useFilters` hook manages filter state
3. `useMovies.buildApiParams()` converts filters to API parameters
4. Backend receives parameters and builds SQL query
5. Results returned and displayed

**OR Groups:**
- Allows complex filter logic: (Filter1 OR Filter2) AND Filter3
- Implemented via `or_group_list_filters` JSON parameter
- Only supported for tracked list filters currently
- Can be extended to other filter types

### Streaming Availability Feature

**Implementation:**

1. **Data Source**: TMDb `watch/providers` endpoint
2. **Caching**: Stored in `tmdb_data` JSON field
3. **Filtering**: JSON path queries in SQL
4. **Country Detection**: Auto-detected via frontend API
5. **Service Matching**: Filters by provider IDs

**Data Structure:**
```json
{
  "watch/providers": {
    "results": {
      "US": {
        "flatrate": [{"provider_id": 8, "provider_name": "Netflix"}],
        "rent": [{"provider_id": 2, "provider_name": "Apple TV"}],
        "buy": [{"provider_id": 2, "provider_name": "Apple TV"}]
      }
    }
  }
}
```

### Tracked Lists Feature

**Implementation:**

1. **CSV Files**: Stored in `tracked-lists/` directory
2. **Column Generation**: Filenames converted to column names
   - `imdb-t250.csv` → `is_imdb_t250`
   - `letterboxd-t250.csv` → `is_letterboxd_t250`
3. **Dynamic Columns**: Added via migrations
4. **Matching**: URI-first, then title+year
5. **Processing**: Batch processing with progress updates

**Matching Algorithm:**
```python
def check_movie_in_tracked_lists(movie, tracked_lists):
    for list_name, list_data in tracked_lists.items():
        for list_movie in list_data['movies']:
            # Try URI match first
            if normalize_uri(movie.uri) == normalize_uri(list_movie.uri):
                setattr(movie, column_name, True)
                break
            # Fallback to title+year
            if (normalize_title(movie.title) == normalize_title(list_movie.title) 
                and movie.year == list_movie.year):
                setattr(movie, column_name, True)
                break
```

### Statistics Feature

**Implementation:**

1. **Data Aggregation**: SQL queries with GROUP BY
2. **Year Distribution**: Count by year, sorted
3. **Genre Distribution**: JSON array extraction, count
4. **Country Distribution**: Count by country
5. **Director Distribution**: Count by director
6. **Runtime Stats**: MIN, MAX, AVG, MEDIAN
7. **Rating Stats**: MIN, MAX, AVG for vote_average and popularity

**Query Example:**
```sql
SELECT 
    year,
    COUNT(*) as count
FROM movies
WHERE year IS NOT NULL
GROUP BY year
ORDER BY year DESC
```

### Profile Export/Import Feature

**Export Process:**
1. Query all movies, favorite directors, seen countries
2. Build JSON structure
3. Create ZIP file
4. Return as download

**Import Process:**
1. Extract ZIP file
2. Parse JSON
3. Clear existing database
4. Import movies (with progress streaming)
5. Import favorite directors
6. Import seen countries
7. Reprocess movies missing TMDb data (if minimal export)

**Error Handling:**
- Continues on individual movie failures
- Logs errors for review
- Returns summary with success/failure counts

---

## Data Flow

### Movie Import Flow

```mermaid
flowchart TD
    A[CSV File] --> B[CSV Parser]
    B --> C{Parse Success?}
    C -->|No| D[Error Message]
    C -->|Yes| E[For Each Movie]
    E --> F{Duplicate Check}
    F -->|Exists| G[Skip or Update]
    F -->|New| H[TMDb Search]
    H --> I{TMDb Found?}
    I -->|No| J[Save with Basic Data]
    I -->|Yes| K[Fetch Full Details]
    K --> L[Extract Metadata]
    L --> M[Save to Database]
    M --> N[Check Tracked Lists]
    N --> O[Update List Columns]
    O --> P{More Movies?}
    P -->|Yes| E
    P -->|No| Q[Complete]
```

### Filter Flow

```mermaid
flowchart TD
    A[User Applies Filter] --> B[FilterBar Component]
    B --> C[useFilters Hook]
    C --> D[Update Filter State]
    D --> E[Save to LocalStorage]
    E --> F[useMovies Hook]
    F --> G[buildApiParams]
    G --> H[Convert to API Params]
    H --> I[GET /api/movies]
    I --> J[Backend Query Builder]
    J --> K[SQL Query]
    K --> L[Database]
    L --> M[Results]
    M --> N[Frontend]
    N --> O[Update MovieList]
```

### TMDb Enrichment Flow

```mermaid
sequenceDiagram
    participant App
    participant Backend
    participant TMDb Client
    participant TMDb API
    participant Database
    
    App->>Backend: Add/Import Movie
    Backend->>TMDb Client: search_movie(title, year)
    TMDb Client->>TMDb API: GET /search/movie
    TMDb API-->>TMDb Client: Search Results
    TMDb Client->>TMDb Client: Match by Year & Title
    TMDb Client-->>Backend: Best Match
    Backend->>TMDb Client: get_movie_details(tmdb_id)
    TMDb Client->>TMDb API: GET /movie/{id}
    TMDb API-->>TMDb Client: Full Movie Data
    TMDb Client->>TMDb Client: Extract Metadata
    TMDb Client-->>Backend: Enriched Data
    Backend->>Database: Save Movie + Cache TMDb Data
    Database-->>Backend: Success
    Backend-->>App: Movie Created
```

---

## External Integrations

### TMDb API Integration

**Base URL**: `https://api.themoviedb.org/3`

**Endpoints Used:**
- `GET /search/movie` - Search movies by title/year
- `GET /movie/{id}` - Get movie details (with append_to_response)
- `GET /collection/{id}` - Get collection details

**Authentication:**
- API key required (stored in `.env` as `TMDB_API_KEY`)
- Passed as query parameter: `?api_key=...`

**Rate Limiting:**
- TMDb allows 40 requests per 10 seconds
- Application doesn't implement rate limiting (could be added)

**Data Caching:**
- Full TMDb response cached in `tmdb_data` JSON field
- Reduces API calls on subsequent requests
- Can be refreshed via recache endpoint

**Error Handling:**
- Graceful fallbacks on API failures
- Logs errors but continues processing
- Movies saved with basic data if TMDb fails

---

## Deployment

### Development Setup

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Create .env file with TMDB_API_KEY
python main.py
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

### Production Build

**Frontend:**
```bash
cd frontend
npm run build
# Output in frontend/build/
```

**Backend:**
- Run with production ASGI server (Gunicorn + Uvicorn workers)
- Configure reverse proxy (nginx/Apache)
- Set up environment variables
- Configure database (PostgreSQL recommended for production)

### Environment Variables

**Backend (.env):**
```env
TMDB_API_KEY=your_api_key_here
DATABASE_URL=sqlite:///./watchlist.db  # or postgresql://...
```

**Frontend (.env):**
```env
REACT_APP_API_URL=http://localhost:8000  # or production URL
```

### Production Configuration

**Recommended Setup:**
- **Web Server**: nginx or Apache
- **Application Server**: Gunicorn with Uvicorn workers
- **Database**: PostgreSQL (for production)
- **Static Files**: Serve from `frontend/build/`
- **API Proxy**: Proxy `/api/*` to backend

**nginx Configuration Example:**
```nginx
server {
    listen 80;
    server_name movieswatchlist.com;
    
    # Serve static files
    location / {
        root /path/to/frontend/build;
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy API requests
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Database Migration

**For Production:**
1. Use PostgreSQL instead of SQLite
2. Set `DATABASE_URL=postgresql://user:pass@host/dbname`
3. Run migrations on first startup
4. Backup database regularly

---

## Development Guide

### Code Structure

**Backend:**
- Follow PEP 8 style guidelines
- Use type hints where possible
- Document functions with docstrings
- Handle errors gracefully with logging

**Frontend:**
- Use Prettier for formatting (`npm run format`)
- Follow React best practices
- Use custom hooks for complex logic
- Keep components focused and reusable

### Adding New Filter Types

1. **Backend (`routes.py`):**
   - Add filter parameter handling in `GET /api/movies`
   - Add SQL query logic
   - Test with various values

2. **Frontend (`components/filterTypes.js`):**
   - Define filter type configuration
   - Add `getApiParams()` function
   - Add UI component in `FilterMenu.jsx`

3. **Frontend (`components/FilterMenu.jsx`):**
   - Add filter type to menu
   - Create configuration UI
   - Handle filter application

### Adding New Tracked Lists

1. Add CSV file to `tracked-lists/` directory
2. Filename format: `list-name.csv` (hyphens converted to underscores)
3. Column name generated: `is_list_name`
4. Run `POST /api/movies/process-tracked-lists` to process
5. Column automatically added via migration

### Testing

See `TESTING_PROTOCOL.md` for comprehensive testing guidelines.

**Key Areas:**
- API endpoint testing
- Frontend component testing
- Integration testing
- End-to-end workflow testing
- Performance testing
- Security testing

### Debugging

**Backend:**
- Enable debug logging: `logging.basicConfig(level=logging.DEBUG)`
- Check FastAPI docs: `http://localhost:8000/docs`
- Use database browser for SQLite

**Frontend:**
- React DevTools for component inspection
- Browser DevTools for network/console
- Check LocalStorage for state persistence

### Performance Optimization

**Backend:**
- Add database indexes for frequently queried fields
- Implement query result caching (Redis)
- Batch TMDb API calls
- Use connection pooling for database

**Frontend:**
- Implement virtual scrolling for large lists
- Lazy load components
- Memoize expensive computations
- Optimize re-renders with React.memo

---

## Conclusion

This documentation provides a comprehensive overview of the Movies Watchlist application architecture, implementation details, and development guidelines. The application demonstrates a modern full-stack architecture with:

- **Robust Backend**: FastAPI with SQLAlchemy, dynamic migrations, comprehensive filtering
- **Modern Frontend**: React with custom hooks, advanced filtering UI, responsive design
- **External Integration**: TMDb API for rich movie metadata
- **Data Management**: CSV import, profile export/import, tracked lists
- **User Experience**: Keyboard shortcuts, statistics, streaming availability

For questions or contributions, refer to the main README.md and TESTING_PROTOCOL.md files.

---

**Document Version**: 1.0  
**Last Updated**: January 25, 2026  
**Maintained By**: Development Team
