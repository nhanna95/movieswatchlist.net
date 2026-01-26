import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './AddMovieModal.css';
import { addMovie, searchTmdbMovie, getTmdbMovieDetails } from '../services/api';

const AddMovieModal = ({
  onClose,
  onAddSuccess,
  initialTmdbId = null,
  initialTitle = null,
  initialYear = null,
}) => {
  const [title, setTitle] = useState(initialTitle || '');
  const [year, setYear] = useState(initialYear ? initialYear.toString() : '');
  const [letterboxdUri, setLetterboxdUri] = useState('');
  const [notes, setNotes] = useState('');
  const [seenBefore, setSeenBefore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const modalContentRef = useRef(null);

  // Autocomplete states
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const autocompleteInputRef = useRef(null);
  const autocompleteDropdownRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const hasInitializedRef = useRef(false);

  // Fetch movie details if initialTmdbId is provided
  useEffect(() => {
    // Reset initialization flag when modal closes (when initialTmdbId becomes null)
    if (!initialTmdbId) {
      hasInitializedRef.current = false;
      return;
    }

    // Only fetch once per initialTmdbId
    if (initialTmdbId && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setIsFetchingDetails(true);
      setError(null);

      getTmdbMovieDetails(initialTmdbId)
        .then((details) => {
          setMovieDetails(details);
          // Pre-fill title and year if not already set
          const movieTitle = details.title || details.original_title || initialTitle || '';
          const movieYear = details.year || (initialYear ? parseInt(initialYear) : null);

          if (movieTitle) {
            setTitle(movieTitle);
          }
          if (movieYear) {
            setYear(movieYear.toString());
          }
          // Generate letterboxd URI
          if (movieTitle) {
            const generatedUri = generateLetterboxdUri(movieTitle, movieYear);
            setLetterboxdUri(generatedUri);
          }
          setShowConfirmation(true);
        })
        .catch((error) => {
          console.error('Error fetching movie details:', error);
          // If we have initial title/year, still use those
          if (initialTitle) {
            setTitle(initialTitle);
          }
          if (initialYear) {
            setYear(initialYear.toString());
          }
          // Generate letterboxd URI from initial data
          if (initialTitle) {
            const generatedUri = generateLetterboxdUri(
              initialTitle,
              initialYear ? parseInt(initialYear) : null
            );
            setLetterboxdUri(generatedUri);
          }
        })
        .finally(() => {
          setIsFetchingDetails(false);
        });
    }
  }, [initialTmdbId, initialTitle, initialYear]); // Only run when initial props change

  useEffect(() => {
    // Focus the search input when modal opens (only if no initial data)
    if (autocompleteInputRef.current && !initialTmdbId) {
      autocompleteInputRef.current.focus();
    }
  }, [initialTmdbId]); // Run when initialTmdbId changes

  useEffect(() => {
    // Handle Escape key - always close the modal completely
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // Always close the modal completely, regardless of nested views
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  // Debounced autocomplete search
  useEffect(() => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search if query is too short
    if (autocompleteQuery.trim().length < 2) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
      setError(null);
      return;
    }

    // Set up debounced search
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null); // Clear previous errors
      console.log('Starting search for:', autocompleteQuery.trim()); // Debug log

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const data = await searchTmdbMovie(autocompleteQuery.trim(), null);
        // Check if request was aborted
        if (abortControllerRef.current && abortControllerRef.current.signal.aborted) {
          return;
        }
        // Debug: log the response
        console.log('TMDB search response:', data);
        const results = Array.isArray(data.results) ? data.results : [];
        console.log('Parsed results count:', results.length, 'results:', results);
        setAutocompleteResults(results);
        setShowAutocomplete(true);
        setHighlightedIndex(-1);
        setError(null); // Clear any previous errors
      } catch (error) {
        // Don't show error if request was aborted
        if (
          error.name === 'AbortError' ||
          (abortControllerRef.current && abortControllerRef.current.signal.aborted)
        ) {
          return;
        }
        console.error('Error searching TMDB:', error);
        console.error('Error response:', error.response);
        console.error('Error message:', error.message);
        // Show error message but still show dropdown with empty results
        setAutocompleteResults([]);
        setShowAutocomplete(true);
        // Set error state for display - properly extract error message
        let errorMsg = 'Failed to search movies';
        if (error.response?.data?.detail) {
          const detail = error.response.data.detail;
          // Handle FastAPI validation errors (array of error objects)
          if (Array.isArray(detail)) {
            errorMsg = detail
              .map((err) => {
                const field = err.loc && err.loc.length > 1 ? err.loc[err.loc.length - 1] : 'field';
                return `${field}: ${err.msg}`;
              })
              .join(', ');
          } else if (typeof detail === 'string') {
            errorMsg = detail;
          } else {
            errorMsg = JSON.stringify(detail);
          }
        } else if (error.message) {
          errorMsg = error.message;
        } else if (error.response?.data) {
          errorMsg = JSON.stringify(error.response.data);
        }
        setError(`Search error: ${errorMsg}`);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autocompleteQuery]);

  // Update dropdown position when autocomplete is shown
  useEffect(() => {
    if (showAutocomplete && autocompleteInputRef.current) {
      const updatePosition = () => {
        const inputRect = autocompleteInputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: inputRect.bottom + 4,
          left: inputRect.left,
          width: inputRect.width,
        });
      };
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showAutocomplete, autocompleteResults]);

  // Handle clicking outside autocomplete dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        autocompleteDropdownRef.current &&
        !autocompleteDropdownRef.current.contains(event.target) &&
        autocompleteInputRef.current &&
        !autocompleteInputRef.current.contains(event.target)
      ) {
        setShowAutocomplete(false);
      }
    };

    if (showAutocomplete) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAutocomplete]);

  const generateLetterboxdUri = (title, year) => {
    if (!title) return '';

    // Convert to lowercase and trim
    let slug = title.toLowerCase().trim();

    // Remove common punctuation and special characters
    // Replace with spaces: colons, parentheses, brackets, quotes, etc.
    slug = slug
      .replace(/[:\-()[\]'"`]/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, '-') // Replace multiple spaces with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

    // Append year if available
    if (year) {
      slug = `${slug}-${year}`;
    }

    return `letterboxd:film/${slug}`;
  };

  const validateForm = () => {
    const errors = {};
    if (!title.trim()) {
      errors.title = 'Title is required';
    }
    if (!year) {
      errors.year = 'Year is required';
    } else {
      const yearNum = parseInt(year);
      if (isNaN(yearNum) || yearNum < 1888 || yearNum > 2100) {
        errors.year = 'Year must be between 1888 and 2100';
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAutocompleteSelect = async (result) => {
    setSelectedMovie(result);
    setShowAutocomplete(false);
    setIsFetchingDetails(true);
    setError(null);

    try {
      const details = await getTmdbMovieDetails(result.tmdb_id);
      setMovieDetails(details);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error fetching movie details:', error);
      let errorMessage = 'Error fetching movie details';

      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
      // Still allow user to add movie with basic info
      setTitle(result.title || result.original_title || title);
      if (result.year) {
        setYear(result.year.toString());
      }
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleConfirmAdd = () => {
    if (movieDetails) {
      const movieTitle = movieDetails.title || movieDetails.original_title || title;
      const movieYear = movieDetails.year;
      setTitle(movieTitle);
      if (movieYear) {
        setYear(movieYear.toString());
      }
      // Generate and set letterboxd_uri
      const generatedUri = generateLetterboxdUri(movieTitle, movieYear);
      setLetterboxdUri(generatedUri);
    } else if (selectedMovie) {
      const movieTitle = selectedMovie.title || selectedMovie.original_title || title;
      const movieYear = selectedMovie.year;
      setTitle(movieTitle);
      if (movieYear) {
        setYear(movieYear.toString());
      }
      // Generate and set letterboxd_uri
      const generatedUri = generateLetterboxdUri(movieTitle, movieYear);
      setLetterboxdUri(generatedUri);
    }
    setShowConfirmation(false);
    setMovieDetails(null);
    setSelectedMovie(null);
    setAutocompleteQuery('');
    setError(null); // Clear any errors when confirming
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setMovieDetails(null);
    setSelectedMovie(null);
    setAutocompleteQuery('');
    setShowAutocomplete(true);
    setError(null); // Clear any errors when canceling
  };

  const handleAutocompleteKeyDown = (e) => {
    if (!showAutocomplete || autocompleteResults.length === 0) {
      if (e.key === 'Enter' && autocompleteQuery.trim().length >= 2) {
        // Trigger search on Enter if query is long enough
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < autocompleteResults.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        // If no option is highlighted, select the first one; otherwise select the highlighted one
        const indexToSelect = highlightedIndex >= 0 ? highlightedIndex : 0;
        if (indexToSelect < autocompleteResults.length) {
          handleAutocompleteSelect(autocompleteResults[indexToSelect]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        // Close the entire modal when Escape is pressed in autocomplete
        onClose();
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (e, asFavorite = false) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);
    setValidationErrors({});

    try {
      const movieData = {
        title: title.trim(),
        year: parseInt(year),
        letterboxd_uri: letterboxdUri.trim() || undefined,
        notes: notes.trim() || undefined,
        is_favorite: asFavorite,
        seen_before: seenBefore,
      };

      await addMovie(movieData);

      // Success - close modal and refresh
      if (onAddSuccess) {
        onAddSuccess();
      }
      onClose();
    } catch (error) {
      console.error('Error adding movie:', error);
      let errorMessage = 'Error adding movie';

      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        // Handle FastAPI validation errors (array of error objects)
        if (Array.isArray(detail)) {
          errorMessage = detail
            .map((err) => {
              const field = err.loc && err.loc.length > 1 ? err.loc[err.loc.length - 1] : 'field';
              return `${field}: ${err.msg}`;
            })
            .join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);

      // If it's a duplicate error, keep the modal open so user can see the error
      // Don't close the modal automatically
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAsFavorite = async (e) => {
    await handleSubmit(e, true);
  };

  return (
    <div className="add-movie-modal-overlay" onClick={onClose}>
      <div
        className="add-movie-modal-content"
        onClick={(e) => e.stopPropagation()}
        ref={modalContentRef}
      >
        <div className="add-movie-modal-header">
          <h2>Add Movie</h2>
          <button
            className="add-movie-modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-movie-form">
          {/* Autocomplete Search */}
          <div className="add-movie-form-group">
            <label htmlFor="autocomplete-search">Search TMDB Movies</label>
            <div className="autocomplete-container">
              <input
                id="autocomplete-search"
                ref={autocompleteInputRef}
                type="text"
                value={autocompleteQuery}
                onChange={(e) => {
                  setAutocompleteQuery(e.target.value);
                  setShowAutocomplete(true);
                }}
                onFocus={() => {
                  if (autocompleteResults.length > 0) {
                    setShowAutocomplete(true);
                  }
                }}
                onKeyDown={handleAutocompleteKeyDown}
                placeholder="Type to search movies... (e.g., The Matrix)"
                disabled={loading || showConfirmation}
                className="autocomplete-input"
              />
              {isSearching && <div className="autocomplete-loading">Searching...</div>}
              {showAutocomplete &&
                autocompleteResults.length > 0 &&
                createPortal(
                  <div
                    ref={autocompleteDropdownRef}
                    className="autocomplete-dropdown"
                    style={{
                      position: 'fixed',
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      width: `${dropdownPosition.width}px`,
                    }}
                  >
                    {autocompleteResults.map((result, index) => (
                      <div
                        key={result.tmdb_id}
                        className={`autocomplete-result-item ${
                          index === highlightedIndex ? 'highlighted' : ''
                        }`}
                        onClick={() => handleAutocompleteSelect(result)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <span className="autocomplete-result-title">
                          {result.title || result.original_title}
                        </span>
                        {result.year && (
                          <span className="autocomplete-result-year">({result.year})</span>
                        )}
                      </div>
                    ))}
                  </div>,
                  document.body
                )}
              {showAutocomplete &&
                autocompleteQuery.trim().length >= 2 &&
                !isSearching &&
                autocompleteResults.length === 0 &&
                createPortal(
                  <div
                    className="autocomplete-dropdown"
                    style={{
                      position: 'fixed',
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      width: `${dropdownPosition.width}px`,
                    }}
                  >
                    <div className="autocomplete-no-results">
                      {error && (error.includes('Search error') || error.includes('Failed')) ? (
                        <span style={{ color: 'var(--danger, #dc3545)' }}>{error}</span>
                      ) : (
                        'No results found'
                      )}
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>

          {/* Confirmation View */}
          {showConfirmation && movieDetails && (
            <div className="movie-confirmation-view">
              <div className="confirmation-header">
                <h3>Confirm Movie Details</h3>
              </div>
              <div className="confirmation-content">
                {movieDetails.poster_url && (
                  <div className="confirmation-poster">
                    <img
                      src={movieDetails.poster_url}
                      alt={movieDetails.title}
                      className="confirmation-poster-img"
                    />
                  </div>
                )}
                <div className="confirmation-details">
                  <div className="confirmation-title">
                    {movieDetails.title}
                    {movieDetails.year && (
                      <span className="confirmation-year"> ({movieDetails.year})</span>
                    )}
                  </div>
                  {movieDetails.overview && (
                    <div className="confirmation-overview">{movieDetails.overview}</div>
                  )}
                  {movieDetails.genres && movieDetails.genres.length > 0 && (
                    <div className="confirmation-genres">
                      <span className="confirmation-label">Genres: </span>
                      {movieDetails.genres.map((genre, index) => (
                        <span key={index} className="confirmation-genre-tag">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                  {movieDetails.original_language && (
                    <div className="confirmation-language">
                      <span className="confirmation-label">Language: </span>
                      {movieDetails.original_language_name ||
                        movieDetails.original_language.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <div className="confirmation-actions">
                <button
                  type="button"
                  onClick={handleCancelConfirmation}
                  className="confirmation-button cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  className="confirmation-button confirm"
                >
                  Confirm Add
                </button>
              </div>
            </div>
          )}

          {/* Loading state for fetching details */}
          {isFetchingDetails && (
            <div className="fetching-details-indicator">Fetching movie details...</div>
          )}

          {/* Only show form fields after a movie has been selected and confirmation is dismissed */}
          {title && year && !showConfirmation && (
            <>
              <div className="add-movie-form-group">
                <label htmlFor="title">
                  Title <span className="required">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  readOnly
                  placeholder="Search and select a movie above"
                  disabled={loading || showConfirmation || isFetchingDetails}
                  className={validationErrors.title ? 'error' : ''}
                />
                {validationErrors.title && (
                  <span className="error-message">{validationErrors.title}</span>
                )}
              </div>

              <div className="add-movie-form-group">
                <label htmlFor="year">
                  Year <span className="required">*</span>
                </label>
                <input
                  id="year"
                  type="number"
                  value={year}
                  readOnly
                  placeholder="Search and select a movie above"
                  min="1888"
                  max="2100"
                  disabled={loading || showConfirmation || isFetchingDetails}
                  className={validationErrors.year ? 'error' : ''}
                />
                {validationErrors.year && (
                  <span className="error-message">{validationErrors.year}</span>
                )}
              </div>

              <div className="add-movie-form-group">
                <label htmlFor="letterboxd-uri">Letterboxd URI</label>
                <input
                  id="letterboxd-uri"
                  type="text"
                  value={letterboxdUri}
                  readOnly
                  placeholder="Auto-filled when you select a movie"
                  disabled={loading || showConfirmation || isFetchingDetails}
                />
              </div>

              <div className="add-movie-form-group">
                <label htmlFor="notes">Notes (optional)</label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this movie..."
                  rows={3}
                  disabled={loading || showConfirmation || isFetchingDetails}
                />
              </div>

              <div className="add-movie-form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={seenBefore}
                    onChange={(e) => setSeenBefore(e.target.checked)}
                    disabled={loading || showConfirmation || isFetchingDetails}
                  />
                  Seen Before
                </label>
              </div>

              {error && !showConfirmation && <div className="add-movie-error">{error}</div>}

              <div className="add-movie-form-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="add-movie-button cancel"
                  disabled={loading || isFetchingDetails}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="add-movie-button submit"
                  disabled={loading || showConfirmation || isFetchingDetails}
                >
                  {loading ? 'Adding...' : 'Add Movie'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAsFavorite}
                  className="add-movie-button submit favorite"
                  disabled={loading || showConfirmation || isFetchingDetails}
                >
                  {loading ? 'Adding...' : 'Add as Favorited Movie'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default AddMovieModal;
