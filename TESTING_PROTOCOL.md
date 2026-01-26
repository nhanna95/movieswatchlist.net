# Testing Protocol for Movies Watchlist Application

## Overview

This document outlines a comprehensive testing protocol to ensure all features work as intended before shipping. The protocol covers backend API endpoints, frontend UI components, integration testing, end-to-end workflows, performance, security, and data integrity.

**Last Updated:** January 25, 2026  
**Application Version:** 1.0.0

---

## Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Backend API Testing](#backend-api-testing)
3. [Frontend UI Testing](#frontend-ui-testing)
4. [Integration Testing](#integration-testing)
5. [End-to-End Workflow Testing](#end-to-end-workflow-testing)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [Data Integrity Testing](#data-integrity-testing)
9. [Error Handling Testing](#error-handling-testing)
10. [Browser Compatibility Testing](#browser-compatibility-testing)
11. [Pre-Shipment Checklist](#pre-shipment-checklist)

---

## Pre-Testing Setup

### Environment Preparation

1. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   ```

3. **Environment Variables**
   - Ensure `.env` file exists with valid `TMDB_API_KEY`
   - Verify `DATABASE_URL` is set correctly
   - Use a test database for testing (separate from production)

4. **Test Data Preparation**
   - Prepare sample CSV files:
     - Valid CSV with standard format
     - CSV with missing columns
     - CSV with invalid data
     - Large CSV (1000+ movies) for performance testing
     - CSV with duplicate entries
   - Sample tracked lists in `tracked-lists/` directory

5. **Start Services**
   ```bash
   # Terminal 1: Backend
   cd backend
   python main.py
   
   # Terminal 2: Frontend
   cd frontend
   npm start
   ```

---

## Backend API Testing

### 1. CSV Upload & Processing Endpoints

#### 1.1 POST `/api/upload`
- [ ] **Test valid CSV upload**
  - Upload a valid CSV file
  - Verify response status 200
  - Verify movies are processed and stored
  - Check progress updates are received

- [ ] **Test invalid file format**
  - Upload non-CSV file (e.g., .txt, .pdf)
  - Verify appropriate error response (400/422)

- [ ] **Test missing required columns**
  - Upload CSV missing `name`, `year`, or `letterboxd_uri`
  - Verify error handling

- [ ] **Test empty CSV**
  - Upload empty CSV file
  - Verify appropriate error message

- [ ] **Test large CSV file**
  - Upload CSV with 1000+ movies
  - Verify processing completes without timeout
  - Check memory usage remains reasonable

#### 1.2 POST `/api/preview-csv`
- [ ] **Test CSV preview**
  - Upload CSV and verify preview data structure
  - Check `movies_to_add` and `movies_to_remove` arrays
  - Verify counts match actual data

- [ ] **Test preview with existing movies**
  - Upload CSV containing movies already in database
  - Verify duplicates are identified in `movies_to_remove`

#### 1.3 POST `/api/process-csv-with-selections`
- [ ] **Test processing with selections**
  - Select movies to add with favorites/seen-before flags
  - Select movies to remove
  - Verify processing completes successfully
  - Verify selected movies are added/removed correctly

- [ ] **Test with no selections**
  - Submit with no movies selected
  - Verify appropriate error message

#### 1.4 POST `/api/upload-csv`
- [ ] **Test direct CSV upload**
  - Upload CSV without preview
  - Verify all movies are processed
  - Check for duplicate handling

### 2. Movie Retrieval Endpoints

#### 2.1 GET `/api/movies`
- [ ] **Test basic retrieval**
  - Request movies without filters
  - Verify response structure
  - Check pagination (skip/limit)

- [ ] **Test year filtering**
  - Filter by `year_min` and `year_max`
  - Test edge cases (single year, invalid ranges)
  - Verify results match filter criteria

- [ ] **Test director filtering**
  - Filter by single director
  - Filter by multiple directors
  - Test `director_exclude` flag
  - Verify case-insensitive matching

- [ ] **Test country filtering**
  - Filter by single country
  - Filter by multiple countries
  - Test `country_exclude` flag
  - Test country aliases (UK/United Kingdom, USA/United States)

- [ ] **Test genre filtering**
  - Filter by single genre
  - Filter by multiple genres
  - Test `genre_exclude` flag

- [ ] **Test runtime filtering**
  - Filter by `runtime_min` and `runtime_max`
  - Test edge cases (0, negative values, very large values)

- [ ] **Test language filtering**
  - Filter by `original_language`
  - Filter by `spoken_language`
  - Test multiple languages

- [ ] **Test rating filtering**
  - Filter by `vote_average_min` and `vote_average_max`
  - Filter by `popularity_min` and `popularity_max`

- [ ] **Test production company filtering**
  - Filter by single company
  - Filter by multiple companies
  - Test `production_company_exclude` flag

- [ ] **Test cast/crew filtering**
  - Filter by `actor`
  - Filter by `writer`
  - Filter by `producer`
  - Test multiple values and exclude flags

- [ ] **Test collection filtering**
  - Filter by `collection=true`
  - Verify movies in collections are returned

- [ ] **Test search functionality**
  - Search by title (partial match)
  - Search with special characters
  - Search with empty string
  - Verify case-insensitive search

- [ ] **Test date added filtering**
  - Filter by `date_added_min` and `date_added_max`
  - Test ISO date format parsing

- [ ] **Test sorting**
  - Sort by `title` (asc/desc)
  - Sort by `year` (asc/desc)
  - Sort by `runtime` (asc/desc)
  - Sort by `vote_average` (asc/desc)
  - Sort by `popularity` (asc/desc)
  - Sort by `date_added` (asc/desc)
  - Test multiple sorts via `sorts` parameter

- [ ] **Test favorites filtering**
  - Filter by `favorites_only=true`
  - Test `show_favorites_first` flag

- [ ] **Test seen-before filtering**
  - Filter by `seen_before=true/false`

- [ ] **Test favorited directors filter**
  - Filter by `favorited_directors_only=true`
  - Verify only movies from favorited directors are returned

- [ ] **Test seen countries exclusion**
  - Filter with `exclude_seen_countries=true`
  - Verify movies from seen countries are excluded

- [ ] **Test tracked lists filtering**
  - Filter by `list_filters` JSON parameter
  - Test multiple list filters (e.g., `is_imdb_t250`, `is_letterboxd_t250`)

- [ ] **Test streaming availability filtering**
  - Filter by `availability_type` (for_free, for_rent, to_buy, unavailable)
  - Filter by `watch_region`
  - Filter by `preferred_services`
  - Test `availability_exclude` flag

- [ ] **Test combined filters**
  - Apply multiple filters simultaneously
  - Verify all filters are applied correctly
  - Test filter combinations that should return no results

- [ ] **Test pagination**
  - Test `skip` and `limit` parameters
  - Test edge cases (skip > total, limit = 0, negative values)
  - Verify total count is accurate

#### 2.2 GET `/api/movies/{movie_id}`
- [ ] **Test movie retrieval by ID**
  - Retrieve valid movie ID
  - Verify all movie data is returned
  - Test with invalid ID (404 error)

#### 2.3 GET `/api/movies/stats`
- [ ] **Test statistics endpoint**
  - Verify all statistics are calculated correctly:
    - Total movies
    - Year distribution
    - Genre distribution
    - Country distribution
    - Director distribution
    - Runtime statistics
    - Rating statistics
  - Test with empty database
  - Test with filtered data

#### 2.4 GET `/api/movies/directors`
- [ ] **Test directors list**
  - Verify all unique directors are returned
  - Check sorting and formatting

#### 2.5 GET `/api/movies/countries`
- [ ] **Test countries list**
  - Verify all unique countries are returned
  - Check for duplicates and aliases

#### 2.6 GET `/api/movies/genres`
- [ ] **Test genres list**
  - Verify all unique genres are returned

#### 2.7 GET `/api/movies/original-languages`
- [ ] **Test original languages list**
  - Verify all unique languages are returned

#### 2.8 GET `/api/movies/production-companies`
- [ ] **Test production companies list**
  - Verify all unique companies are returned

#### 2.9 GET `/api/movies/spoken-languages`
- [ ] **Test spoken languages list**
  - Verify all unique languages are returned

#### 2.10 GET `/api/movies/actors`
- [ ] **Test actors list**
  - Verify all unique actors are returned

#### 2.11 GET `/api/movies/writers`
- [ ] **Test writers list**
  - Verify all unique writers are returned

#### 2.12 GET `/api/movies/producers`
- [ ] **Test producers list**
  - Verify all unique producers are returned

#### 2.13 GET `/api/movies/search-tmdb`
- [ ] **Test TMDb search**
  - Search for movie by title
  - Verify results match TMDb API
  - Test with no results
  - Test with special characters

#### 2.15 GET `/api/movies/export`
- [ ] **Test movie export**
  - Export movies with filters
  - Verify CSV format is correct
  - Verify all selected movies are included
  - Test with large datasets

### 3. Movie Management Endpoints

#### 3.1 POST `/api/movies`
- [ ] **Test adding new movie**
  - Add movie with required fields
  - Verify movie is created with correct data
  - Test with TMDb ID for enrichment
  - Test duplicate detection

#### 3.2 PATCH `/api/movies/{movie_id}/favorite`
- [ ] **Test favorite toggle**
  - Mark movie as favorite
  - Unmark movie as favorite
  - Verify state persists

#### 3.3 PATCH `/api/movies/{movie_id}/notes`
- [ ] **Test notes update**
  - Add notes to movie
  - Update existing notes
  - Clear notes (empty string)
  - Verify notes are saved correctly

#### 3.4 PATCH `/api/movies/{movie_id}/seen-before`
- [ ] **Test seen-before toggle**
  - Mark movie as seen before
  - Unmark movie as seen before
  - Verify state persists

#### 3.5 DELETE `/api/movies/{movie_id}`
- [ ] **Test movie deletion**
  - Delete existing movie
  - Verify movie is removed from database
  - Test deletion of non-existent movie (404)

### 4. Movie Details Endpoints

#### 4.1 GET `/api/movies/{movie_id}/collection`
- [ ] **Test collection retrieval**
  - Get collection for movie in a collection
  - Verify all movies in collection are returned
  - Test with movie not in collection

#### 4.2 GET `/api/movies/{movie_id}/similar`
- [ ] **Test similar movies**
  - Get similar movies for a movie
  - Verify results are relevant
  - Test with movie that has no similar movies

#### 4.3 GET `/api/movies/tmdb/{tmdb_id}/details`
- [ ] **Test TMDb details**
  - Fetch movie details from TMDb
  - Verify data structure matches TMDb API
  - Test with invalid TMDb ID

#### 4.4 GET `/api/movies/director/{director_name}`
- [ ] **Test director movies**
  - Get all movies by a director
  - Verify all movies are returned
  - Test with director that has no movies

#### 4.5 GET `/api/movies/{movie_id}/streaming`
- [ ] **Test streaming availability**
  - Get streaming info for a movie
  - Test with different country codes
  - Verify provider information is correct
  - Test with movie that has no streaming data

### 5. Directors Management Endpoints

#### 5.1 GET `/api/directors/favorites`
- [ ] **Test favorite directors list**
  - Verify all favorited directors are returned

#### 5.2 POST `/api/directors/favorites`
- [ ] **Test adding favorite director**
  - Add director to favorites
  - Verify director is added
  - Test duplicate handling

#### 5.3 DELETE `/api/directors/favorites/{director_name}`
- [ ] **Test removing favorite director**
  - Remove director from favorites
  - Verify director is removed
  - Test with non-existent director

### 6. Countries Management Endpoints

#### 6.1 GET `/api/countries/seen`
- [ ] **Test seen countries list**
  - Verify all seen countries are returned

#### 6.2 POST `/api/countries/seen`
- [ ] **Test adding seen country**
  - Add country to seen list
  - Verify country is added
  - Test duplicate handling

#### 6.3 DELETE `/api/countries/seen/{country_name}`
- [ ] **Test removing seen country**
  - Remove country from seen list
  - Verify country is removed
  - Test with non-existent country

### 7. Streaming Services Endpoints

#### 7.1 GET `/api/streaming-services`
- [ ] **Test streaming services list**
  - Verify all available services are returned
  - Check service IDs and names are correct

### 8. Cache Management Endpoints

#### 8.1 POST `/api/movies/recache`
- [ ] **Test movie recaching**
  - Recache specific movies
  - Verify TMDb data is refreshed
  - Test with invalid movie IDs

#### 8.2 POST `/api/movies/clear-cache`
- [ ] **Test cache clearing**
  - Clear all cached TMDb data
  - Verify cache is cleared
  - Verify movies can still be retrieved

### 9. Tracked Lists Endpoints

#### 9.1 POST `/api/movies/process-tracked-lists`
- [ ] **Test tracked lists processing**
  - Process all tracked lists
  - Verify movies are matched correctly
  - Check tracked list flags are set

### 10. Profile Export/Import Endpoints

#### 10.1 POST `/api/export-profile`
- [ ] **Test profile export**
  - Export user profile (favorites, seen countries, etc.)
  - Verify ZIP file is created
  - Verify all data is included in export

#### 10.2 POST `/api/import-profile`
- [ ] **Test profile import**
  - Import profile from ZIP file
  - Verify all data is restored
  - Test with invalid/corrupted file
  - Test with missing data

---

## Frontend UI Testing

### 1. Main Application Components

#### 1.1 App.jsx
- [ ] **Test application initialization**
  - Verify app loads without errors
  - Check initial state is correct
  - Verify API connection is established

- [ ] **Test keyboard shortcuts**
  - Test all keyboard shortcuts work:
    - `?` - Show help
    - `f` - Focus search
    - `s` - Show statistics
    - `u` - Upload CSV
    - `a` - Add movie
    - `Esc` - Close modals
  - Verify shortcuts don't conflict with input fields

- [ ] **Test country detection**
  - Verify country is auto-detected
  - Test country selection persistence
  - Verify country is used for streaming filters

#### 1.2 MovieList Component
- [ ] **Test movie list display**
  - Verify movies are displayed correctly
  - Check column visibility settings
  - Test empty state message
  - Test loading state

- [ ] **Test movie interactions**
  - Click movie to open modal
  - Test favorite toggle
  - Test seen-before toggle
  - Test movie deletion

- [ ] **Test sorting**
  - Click column headers to sort
  - Verify sort indicators
  - Test multiple column sorting

- [ ] **Test pagination**
  - Navigate through pages
  - Verify page numbers
  - Test page size changes

#### 1.3 FilterBar Component
- [ ] **Test filter display**
  - Verify all filter types are available
  - Test filter dropdowns open/close
  - Check filter tags display

- [ ] **Test filter application**
  - Apply single filter
  - Apply multiple filters
  - Test filter removal
  - Verify results update correctly

- [ ] **Test filter types**
  - Year range filter
  - Director multiselect
  - Country multiselect
  - Genre multiselect
  - Runtime range filter
  - Title search
  - Language filters
  - Rating filters
  - Production company filters
  - Cast/crew filters
  - Collection filter
  - Date added filter
  - Favorites filter
  - Seen-before filter
  - Streaming availability filter

- [ ] **Test OR groups**
  - Create OR groups for filters
  - Test multiple OR groups
  - Verify OR logic works correctly

- [ ] **Test filter persistence**
  - Refresh page with filters applied
  - Verify filters are restored from URL/state

#### 1.4 UploadCSV Component
- [ ] **Test file selection**
  - Click "Choose File" button
  - Select valid CSV file
  - Verify file name is displayed

- [ ] **Test CSV preview**
  - Upload CSV and verify preview modal opens
  - Check movies to add are listed
  - Check movies to remove are listed
  - Test selection checkboxes

- [ ] **Test CSV processing**
  - Select movies to add/remove
  - Click "Process" button
  - Verify progress updates
  - Check success message
  - Verify movies are added/removed

- [ ] **Test error handling**
  - Upload invalid file format
  - Upload corrupted CSV
  - Test with missing columns
  - Verify error messages are displayed

#### 1.5 MovieModal Component
- [ ] **Test modal display**
  - Open movie modal
  - Verify all movie details are shown
  - Check formatting of data

- [ ] **Test modal interactions**
  - Toggle favorite
  - Toggle seen-before
  - Add/edit notes
  - View collection
  - View similar movies
  - View streaming availability
  - Delete movie
  - Close modal

- [ ] **Test modal navigation**
  - Navigate to collection movies
  - Navigate to similar movies
  - Navigate to director movies
  - Verify back navigation works

#### 1.6 AddMovieModal Component
- [ ] **Test movie search**
  - Search for movie by title
  - Verify search results display
  - Test selecting a movie

- [ ] **Test movie addition**
  - Add movie from search results
  - Verify movie is added to database
  - Check success message

#### 1.7 DirectorsModal Component
- [ ] **Test directors list**
  - Open directors modal
  - Verify all directors are listed
  - Test favorite toggle for directors

#### 1.8 StatisticsDashboard Component
- [ ] **Test statistics display**
  - Open statistics dashboard
  - Verify all statistics are shown:
    - Total movies
    - Year distribution chart
    - Genre distribution
    - Country distribution
    - Director distribution
    - Runtime statistics
    - Rating statistics
  - Test with filtered data

#### 1.9 SettingsModal Component
- [ ] **Test settings display**
  - Open settings modal
  - Verify all settings options

- [ ] **Test column customization**
  - Show/hide columns
  - Reorder columns
  - Verify changes persist
  - Verify changes apply to movie list

- [ ] **Test other settings**
  - Test all setting toggles
  - Verify settings are saved

#### 1.10 ColumnCustomizer Component
- [ ] **Test column visibility**
  - Toggle column visibility
  - Verify columns show/hide correctly

- [ ] **Test column reordering**
  - Drag and drop columns
  - Verify order is saved
  - Verify order applies to list

#### 1.11 FilterMenu Component
- [ ] **Test filter menu**
  - Open filter menu
  - Test all filter types
  - Verify filter application

#### 1.12 FilterDropdown Component
- [ ] **Test dropdown functionality**
  - Open/close dropdown
  - Test search within dropdown
  - Test multi-select
  - Test exclude option

#### 1.13 AutocompleteMultiselect Component
- [ ] **Test autocomplete**
  - Type to search
  - Select multiple items
  - Remove selected items
  - Test with large lists

#### 1.14 ToastContainer Component
- [ ] **Test toast notifications**
  - Verify toasts appear for actions
  - Test success toasts
  - Test error toasts
  - Test toast auto-dismiss
  - Test manual toast dismissal

#### 1.15 DialogContainer Component
- [ ] **Test dialogs**
  - Verify confirmation dialogs appear
  - Test dialog actions (confirm/cancel)
  - Test dialog dismissal

#### 1.16 KeyboardShortcutsHelp Component
- [ ] **Test help modal**
  - Open help modal with `?`
  - Verify all shortcuts are listed
  - Test closing modal

### 2. UI/UX Testing

- [ ] **Test responsive design**
  - Test on mobile devices (320px - 768px)
  - Test on tablets (768px - 1024px)
  - Test on desktop (1024px+)
  - Verify all components are usable on all sizes

- [ ] **Test accessibility**
  - Test keyboard navigation
  - Test screen reader compatibility
  - Verify ARIA labels are present
  - Test focus management

- [ ] **Test visual design**
  - Verify consistent styling
  - Check color contrast
  - Test dark/light mode (if applicable)
  - Verify icons are displayed correctly

- [ ] **Test loading states**
  - Verify loading indicators appear
  - Test skeleton screens
  - Check loading doesn't block UI

- [ ] **Test error states**
  - Verify error messages are clear
  - Test error recovery
  - Check error styling

---

## Integration Testing

### 1. Frontend-Backend Integration

- [ ] **Test API communication**
  - Verify all API calls are made correctly
  - Test request/response handling
  - Check error handling from API

- [ ] **Test data flow**
  - Upload CSV → Process → Display movies
  - Filter movies → Update list
  - Update movie → Refresh display
  - Delete movie → Remove from list

- [ ] **Test real-time updates**
  - Verify progress updates during CSV processing
  - Check streaming responses work correctly

### 2. Database Integration

- [ ] **Test database operations**
  - Create, read, update, delete operations
  - Verify transactions work correctly
  - Test database migrations

- [ ] **Test data consistency**
  - Verify foreign key constraints
  - Test unique constraints
  - Check data integrity

### 3. External API Integration

- [ ] **Test TMDb API integration**
  - Verify API key is valid
  - Test movie search
  - Test movie details retrieval
  - Test streaming availability
  - Test rate limiting handling
  - Test API error handling

---

## End-to-End Workflow Testing

### 1. Complete User Workflows

#### Workflow 1: Initial Setup and CSV Upload
1. [ ] Start application
2. [ ] Upload CSV file
3. [ ] Preview movies to add/remove
4. [ ] Select movies to add (with favorites/seen-before)
5. [ ] Select movies to remove
6. [ ] Process CSV
7. [ ] Verify movies are added/removed
8. [ ] Verify movie data is enriched from TMDb

#### Workflow 2: Filtering and Searching
1. [ ] Load movie list
2. [ ] Apply year filter (e.g., 2020-2024)
3. [ ] Add director filter
4. [ ] Add genre filter
5. [ ] Search by title
6. [ ] Verify filtered results
7. [ ] Clear filters
8. [ ] Verify all movies are shown

#### Workflow 3: Movie Management
1. [ ] Open movie modal
2. [ ] Toggle favorite
3. [ ] Toggle seen-before
4. [ ] Add notes
5. [ ] View collection
7. [ ] View similar movies
8. [ ] Check streaming availability
9. [ ] Close modal
10. [ ] Verify changes are persisted

#### Workflow 4: Adding New Movie
1. [ ] Click "Add Movie" button
2. [ ] Search for movie
3. [ ] Select movie from results
4. [ ] Verify movie is added
5. [ ] Open movie modal
6. [ ] Verify all data is present

#### Workflow 5: Profile Management
1. [ ] Add favorite directors
2. [ ] Add seen countries
3. [ ] Export profile
4. [ ] Clear database
5. [ ] Import profile
6. [ ] Verify all data is restored

#### Workflow 6: Statistics and Analysis
1. [ ] Open statistics dashboard
2. [ ] View all statistics
3. [ ] Apply filters
4. [ ] Verify statistics update
5. [ ] Export statistics (if available)

#### Workflow 7: Column Customization
1. [ ] Open settings
2. [ ] Hide some columns
3. [ ] Reorder columns
4. [ ] Save settings
5. [ ] Refresh page
6. [ ] Verify settings persist

---

## Performance Testing

### 1. Backend Performance

- [ ] **Test API response times**
  - GET `/api/movies` with no filters (< 500ms)
  - GET `/api/movies` with complex filters (< 1s)
  - POST `/api/upload` with 100 movies (< 30s)
  - POST `/api/upload` with 1000 movies (< 5min)

- [ ] **Test database query performance**
  - Verify indexes are used
  - Test query execution time
  - Check for N+1 query problems

- [ ] **Test concurrent requests**
  - Multiple users filtering simultaneously
  - Multiple CSV uploads
  - Verify no race conditions

### 2. Frontend Performance

- [ ] **Test page load time**
  - Initial load (< 3s)
  - Subsequent loads (< 1s)

- [ ] **Test rendering performance**
  - List with 100 movies (< 500ms)
  - List with 1000 movies (virtualization/pagination)
  - Filter updates (< 200ms)

- [ ] **Test memory usage**
  - Monitor memory during long sessions
  - Check for memory leaks
  - Test with large datasets

### 3. CSV Processing Performance

- [ ] **Test processing speed**
  - 100 movies (< 2min)
  - 500 movies (< 10min)
  - 1000 movies (< 20min)

- [ ] **Test progress updates**
  - Verify updates are frequent enough
  - Check progress accuracy

---

## Security Testing

### 1. Input Validation

- [ ] **Test SQL injection prevention**
  - Attempt SQL injection in search/filters
  - Verify queries are parameterized

- [ ] **Test XSS prevention**
  - Attempt XSS in movie titles/notes
  - Verify output is escaped

- [ ] **Test file upload security**
  - Attempt to upload non-CSV files
  - Attempt to upload malicious files
  - Verify file type validation

- [ ] **Test input sanitization**
  - Test special characters in inputs
  - Test very long inputs
  - Test null/undefined handling

### 2. API Security

- [ ] **Test CORS configuration**
  - Verify only allowed origins can access
  - Test preflight requests

- [ ] **Test rate limiting** (if implemented)
  - Verify rate limits are enforced
  - Test rate limit error handling

- [ ] **Test authentication** (if implemented)
  - Verify protected endpoints require auth
  - Test token validation

### 3. Data Security

- [ ] **Test sensitive data exposure**
  - Verify API keys are not exposed
  - Check database credentials are secure
  - Verify environment variables are not logged

---

## Data Integrity Testing

### 1. Data Consistency

- [ ] **Test duplicate prevention**
  - Upload same CSV twice
  - Verify duplicates are not created
  - Check duplicate detection logic

- [ ] **Test data updates**
  - Re-upload CSV with updated data
  - Verify existing movies are updated correctly
  - Check date_added updates

- [ ] **Test tracked lists matching**
  - Process tracked lists
  - Verify movies are matched correctly
  - Check flags are set accurately

### 2. Data Validation

- [ ] **Test required fields**
  - Verify required fields are enforced
  - Test missing data handling

- [ ] **Test data types**
  - Verify correct data types are stored
  - Test type conversion

- [ ] **Test data ranges**
  - Test year validation (reasonable ranges)
  - Test runtime validation
  - Test rating validation

### 3. Data Migration

- [ ] **Test database migrations**
  - Verify migrations run correctly
  - Test rollback (if applicable)
  - Check data is preserved

---

## Error Handling Testing

### 1. Backend Error Handling

- [ ] **Test API error responses**
  - 400 Bad Request (invalid input)
  - 404 Not Found (resource not found)
  - 422 Unprocessable Entity (validation errors)
  - 500 Internal Server Error (server errors)

- [ ] **Test error messages**
  - Verify error messages are clear
  - Check error messages are user-friendly
  - Test error logging

### 2. Frontend Error Handling

- [ ] **Test network errors**
  - Simulate network failure
  - Verify error messages are shown
  - Test retry mechanisms

- [ ] **Test API error handling**
  - Handle 400/404/500 errors
  - Display appropriate error messages
  - Test error recovery

- [ ] **Test validation errors**
  - Form validation
  - Input validation
  - Error message display

### 3. Edge Cases

- [ ] **Test empty states**
  - Empty database
  - Empty search results
  - Empty filter results

- [ ] **Test boundary conditions**
  - Maximum values
  - Minimum values
  - Zero values
  - Negative values (where applicable)

- [ ] **Test special characters**
  - Unicode characters
  - Special symbols
  - Emojis (if applicable)

---

## Browser Compatibility Testing

### 1. Desktop Browsers

- [ ] **Chrome** (latest)
  - All features work
  - No console errors
  - Performance is acceptable

- [ ] **Firefox** (latest)
  - All features work
  - No console errors
  - Performance is acceptable

- [ ] **Safari** (latest)
  - All features work
  - No console errors
  - Performance is acceptable

- [ ] **Edge** (latest)
  - All features work
  - No console errors
  - Performance is acceptable

### 2. Mobile Browsers

- [ ] **Chrome Mobile** (Android)
  - Responsive design works
  - Touch interactions work
  - Performance is acceptable

- [ ] **Safari Mobile** (iOS)
  - Responsive design works
  - Touch interactions work
  - Performance is acceptable

### 3. Browser-Specific Features

- [ ] **Test file upload**
  - Works in all browsers
  - File picker displays correctly

- [ ] **Test drag and drop** (if applicable)
  - Works in supported browsers
  - Graceful degradation

---

## Pre-Shipment Checklist

### Code Quality

- [ ] All tests pass
- [ ] No console errors
- [ ] No linter errors
- [ ] Code is formatted consistently
- [ ] No TODO comments in production code
- [ ] No commented-out code
- [ ] No hardcoded credentials

### Documentation

- [ ] README is up to date
- [ ] API documentation is complete
- [ ] Code comments are adequate
- [ ] Changelog is updated

### Deployment

- [ ] Environment variables are documented
- [ ] Database migrations are tested
- [ ] Build process works
- [ ] Production build is tested
- [ ] Deployment scripts are ready

### Monitoring

- [ ] Error logging is configured
- [ ] Performance monitoring is set up
- [ ] Analytics are configured (if applicable)

### Final Verification

- [ ] All critical features tested
- [ ] All known bugs are fixed
- [ ] Performance is acceptable
- [ ] Security issues are addressed
- [ ] User acceptance testing completed
- [ ] Stakeholder approval received

---

## Testing Tools Recommendations

### Backend Testing
- **pytest** - Python testing framework
- **httpx** - HTTP client for API testing
- **pytest-asyncio** - Async testing support

### Frontend Testing
- **Jest** - JavaScript testing framework
- **React Testing Library** - React component testing
- **Cypress** - End-to-end testing

### Performance Testing
- **Apache Bench (ab)** - Load testing
- **Lighthouse** - Performance auditing
- **Chrome DevTools** - Performance profiling

### Security Testing
- **OWASP ZAP** - Security scanning
- **Bandit** - Python security linter
- **ESLint security plugins** - JavaScript security

---

## Test Data Management

### Test Databases
- Use separate test database for all testing
- Reset database between test runs
- Use fixtures for consistent test data

### Test Files
- Maintain sample CSV files for testing
- Keep test files in version control
- Document test file purposes

### Test Environment
- Mirror production environment as closely as possible
- Use test TMDb API key (if available)
- Monitor test environment resources

---

## Reporting Issues

When issues are found during testing:

1. **Document the issue:**
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots/logs
   - Environment details

2. **Categorize the issue:**
   - Critical - Blocks core functionality
   - High - Major feature broken
   - Medium - Minor feature issue
   - Low - Cosmetic/edge case

3. **Track the issue:**
   - Create issue ticket
   - Assign priority
   - Link to test case

4. **Verify fixes:**
   - Re-test after fix
   - Update test results
   - Close issue when verified

---

## Conclusion

This testing protocol should be executed before every release. All critical and high-priority test cases must pass before shipping. Medium and low-priority issues should be documented and addressed in subsequent releases.

**Remember:** Testing is an ongoing process. Update this protocol as new features are added and new issues are discovered.

---

**Document Version:** 1.0  
**Last Updated:** January 25, 2026  
**Maintained By:** Development Team
