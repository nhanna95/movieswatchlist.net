# Movies Watchlist

A comprehensive movie watchlist management application that allows you to import, organize, filter, and track your movie collection. Built with a FastAPI backend and React frontend, integrated with The Movie Database (TMDb) API for rich movie metadata and streaming availability information.

## Features

### Movie Management
- **CSV Import**: Import movies from Letterboxd watchlist CSV exports
- **Manual Addition**: Search and add movies directly from TMDb
- **Rich Metadata**: Automatic enrichment with TMDb data including:
  - Cast and crew information
  - Genres, countries, and languages
  - Ratings and popularity scores
  - Runtime and release dates
  - Production companies
  - Movie collections
  - Streaming availability by region

### Advanced Filtering
- **Multiple Filter Types**:
  - Year range
  - Directors (with favorite directors support)
  - Countries (with seen countries exclusion)
  - Genres
  - Runtime range
  - Languages (original and spoken)
  - Ratings (vote average and popularity)
  - Production companies
  - Cast and crew (actors, writers, producers)
  - Collections
  - Date added
  - Favorites and seen-before status
  - Streaming availability
  - Tracked lists (IMDb Top 250, Letterboxd Top 250, etc.)
- **OR Groups**: Create complex filter logic with OR conditions
- **Search**: Quick title search across your collection

### Organization & Tracking
- **Favorites**: Mark movies as favorites
- **Seen Before**: Track which movies you've already watched
- **Notes**: Add personal notes to movies
- **Tracked Lists**: Automatically identify movies from popular lists (IMDb Top 250, Letterboxd Top 250, etc.)
- **Favorite Directors**: Mark directors as favorites and filter by their movies
- **Seen Countries**: Track countries you've watched movies from

### Statistics & Analytics
- **Comprehensive Dashboard**: View statistics including:
  - Total movie count
  - Year distribution
  - Genre distribution
  - Country distribution
  - Director distribution
  - Runtime statistics
  - Rating statistics
- **Filtered Statistics**: View statistics for filtered subsets of your collection

### User Experience
- **Customizable Columns**: Show/hide and reorder columns in the movie list
- **Keyboard Shortcuts**: Quick access to common actions
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Streaming Integration**: Check where movies are available to stream in your region
- **Profile Export/Import**: Backup and restore your entire profile (favorites, seen countries, favorite directors, etc.)

### Multi-User Support
- **User Authentication**: JWT-based authentication with secure login/registration
- **Data Isolation**: Each user has their own isolated database schema
- **Per-User Data**: Movies, favorites, and settings are completely separate per user

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: ORM for database operations
- **SQLite**: Database (configurable via `DATABASE_URL`)
- **TMDb API**: Movie metadata and streaming information
- **Pandas**: CSV processing
- **Uvicorn**: ASGI server

### Frontend
- **React**: UI framework
- **Axios**: HTTP client
- **React Scripts**: Build tooling

## Prerequisites

- Python 3.8+
- Node.js 14+ and npm
- TMDb API key ([Get one here](https://www.themoviedb.org/settings/api))

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd movieswatchlist.com
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

### 4. Environment Configuration

Create a `.env` file in the `backend` directory:

```env
TMDB_API_KEY=your_tmdb_api_key_here
DATABASE_URL=sqlite:///./watchlist.db

# JWT Authentication (required for multi-user support)
# Generate a secure key with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=your_secure_secret_key_here
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
```

Replace `your_tmdb_api_key_here` with your actual TMDb API key, and generate a secure `JWT_SECRET_KEY`.

## Running the Application

### Development Mode

1. **Start the Backend** (from `backend` directory):

```bash
python main.py
```

The backend will run on `http://localhost:8000`

2. **Start the Frontend** (from `frontend` directory):

```bash
npm start
```

The frontend will run on `http://localhost:3000` and automatically open in your browser.

### Production Build

1. **Build the Frontend**:

```bash
cd frontend
npm run build
```

2. **Serve the Backend** (configure your web server to serve the frontend build):

The backend API runs on port 8000. Configure your web server (nginx, Apache, etc.) to:
- Serve static files from `frontend/build` for frontend routes
- Proxy API requests to `http://localhost:8000` for `/api/*` routes

## Usage

### Importing Movies from Letterboxd

1. Export your Letterboxd watchlist as CSV
2. Click the "Upload CSV" button (or press `u`)
3. Select your CSV file
4. Review the preview of movies to add/remove
5. Select which movies to add (optionally marking as favorites or seen-before)
6. Select which movies to remove
7. Click "Process" to import

### Adding Movies Manually

1. Click "Add Movie" button (or press `a`)
2. Search for a movie by title
3. Select the correct movie from search results
4. The movie will be added to your collection with full TMDb metadata

### Filtering Movies

1. Use the filter bar at the top to apply filters
2. Click on filter types to open filter menus
3. Select values from dropdowns or enter ranges
4. Use "Exclude" options to filter out specific values
5. Create OR groups for complex filter logic
6. Clear filters to reset

### Managing Movies

- **View Details**: Click on any movie to open the movie modal
- **Toggle Favorite**: Click the star icon or press the favorite button in the modal
- **Mark Seen Before**: Toggle the seen-before status in the movie modal
- **Add Notes**: Click "Edit Notes" in the movie modal
- **Delete Movie**: Use the delete button in the movie modal

### Keyboard Shortcuts

- `?` - Show keyboard shortcuts help
- `f` - Focus search bar
- `s` - Show statistics dashboard
- `u` - Open CSV upload dialog
- `a` - Open add movie dialog
- `Esc` - Close modals/dialogs

### Customizing Columns

1. Open Settings (gear icon)
2. Go to "Column Customization"
3. Toggle column visibility
4. Drag and drop to reorder columns
5. Settings are automatically saved

### Exporting/Importing Profile

1. **Export**: Go to Settings → Export Profile to download a ZIP file with all your data
2. **Import**: Go to Settings → Import Profile to restore from a previously exported ZIP file

## Project Structure

```
movieswatchlist.com/
├── backend/
│   ├── config.py              # Configuration and environment variables
│   ├── database.py            # Database setup and connection
│   ├── models.py              # SQLAlchemy models
│   ├── routes.py              # API route handlers
│   ├── main.py                # FastAPI application entry point
│   ├── csv_parser.py          # CSV parsing logic
│   ├── list_processor.py      # Tracked lists processing
│   ├── tmdb_client.py         # TMDb API client
│   ├── profile_export.py       # Profile export/import functionality
│   ├── utils.py               # Utility functions
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API service functions
│   │   ├── utils/            # Utility functions
│   │   ├── App.jsx           # Main application component
│   │   └── index.js          # Application entry point
│   └── package.json
├── tracked-lists/             # CSV files for tracked lists (IMDb Top 250, etc.)
├── TESTING_PROTOCOL.md        # Comprehensive testing documentation
└── README.md                  # This file
```

## API Documentation

When the backend is running, API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Configuration

### Database

By default, the application uses SQLite. To use a different database, set the `DATABASE_URL` environment variable:

```env
DATABASE_URL=postgresql://user:password@localhost/movieswatchlist
```

### CORS

CORS is configured to allow requests from `http://localhost:3000` and `http://127.0.0.1:3000` in development. For production, update the CORS configuration in `backend/main.py`.

## Development

### Code Formatting

**Frontend:**
```bash
cd frontend
npm run format        # Format code
npm run format:check  # Check formatting
```

**Backend:**
Follow PEP 8 style guidelines. Consider using `black` for formatting.

### Testing

See `TESTING_PROTOCOL.md` for comprehensive testing guidelines.

## Troubleshooting

### Backend won't start
- Check if port 8000 is already in use
- Verify your `.env` file exists and contains `TMDB_API_KEY`
- Ensure all Python dependencies are installed

### Frontend won't start
- Ensure Node.js and npm are installed
- Run `npm install` in the `frontend` directory
- Check for port conflicts (default port is 3000)

### Movies not loading
- Verify the backend is running
- Check browser console for errors
- Verify TMDb API key is valid
- Check network tab for failed API requests

### CSV import fails
- Ensure CSV has required columns: `name`, `year`, `letterboxd_uri`
- Check CSV file format (should be UTF-8 encoded)
- Verify file size isn't too large

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Add your license here]

## Acknowledgments

- [The Movie Database (TMDb)](https://www.themoviedb.org/) for movie metadata
- [Letterboxd](https://letterboxd.com/) for watchlist export format
- FastAPI and React communities for excellent documentation and tools
