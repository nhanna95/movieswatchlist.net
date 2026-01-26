import React, { useEffect, useState } from 'react';
import './DirectorsModal.css';
import { getDirectorMovies, addFavoriteDirector, removeFavoriteDirector } from '../services/api';

// Helper function to check if a value is valid and should be displayed
const hasValidValue = (value) => {
  if (value === null || value === undefined) return false;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '0') return false;
  }
  return true;
};

const DirectorsModal = ({
  directorName,
  onClose,
  onDirectorMovieClick,
  onAddDirectorMovie,
  isFavorite: initialIsFavorite = false,
  onToggleFavorite,
}) => {
  const [directorMovies, setDirectorMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  useEffect(() => {
    if (!directorName) return;

    const fetchDirectorMovies = async () => {
      setLoading(true);
      try {
        const data = await getDirectorMovies(directorName);
        setDirectorMovies(data.movies || []);
      } catch (error) {
        console.error('Error fetching director movies:', error);
        setDirectorMovies([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDirectorMovies();
  }, [directorName]);

  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    // Add event listener when modal is open (use capture phase to catch it first)
    document.addEventListener('keydown', handleKeyDown, true);

    // Cleanup: remove event listener when modal closes
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  const handleToggleFavorite = async () => {
    if (togglingFavorite) return;

    setTogglingFavorite(true);
    try {
      if (isFavorite) {
        await removeFavoriteDirector(directorName);
        setIsFavorite(false);
      } else {
        await addFavoriteDirector(directorName);
        setIsFavorite(true);
      }
      if (onToggleFavorite) {
        onToggleFavorite(directorName, !isFavorite);
      }
    } catch (error) {
      console.error('Error toggling favorite director:', error);
    } finally {
      setTogglingFavorite(false);
    }
  };

  if (!directorName) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title-row">
              <h2 className="modal-title">{directorName}</h2>
              <button
                className={`modal-favorite-toggle ${isFavorite ? 'is-favorite' : ''}`}
                onClick={handleToggleFavorite}
                disabled={togglingFavorite}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={isFavorite ? 'true' : 'false'}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <h3 className="modal-section-title">Films by {directorName}</h3>
            {loading ? (
              <div className="modal-loading">Loading films...</div>
            ) : directorMovies.length > 0 ? (
              <div className="modal-collection">
                <div className="modal-collection-movies">
                  {directorMovies.map((movie, index) => {
                    const isInDb = movie.in_db !== false; // Default to true for backward compatibility
                    const key = movie.id || `tmdb-${movie.tmdb_id || index}`;

                    if (isInDb && movie.id) {
                      // Movie is in database - make it clickable
                      return (
                        <button
                          key={key}
                          className="modal-collection-movie-link"
                          onClick={() => onDirectorMovieClick && onDirectorMovieClick(movie)}
                        >
                          {movie.title}
                          {hasValidValue(movie.year) && ` (${movie.year})`}
                        </button>
                      );
                    } else {
                      // Movie is not in database - make it clickable to open add movie modal
                      return (
                        <button
                          key={key}
                          className="modal-collection-movie-link"
                          onClick={() => onAddDirectorMovie && onAddDirectorMovie(movie)}
                          style={{
                            opacity: 0.7,
                            fontStyle: 'italic',
                          }}
                          title="Click to add this movie to your watchlist"
                        >
                          {movie.title}
                          {hasValidValue(movie.year) && ` (${movie.year})`}
                        </button>
                      );
                    }
                  })}
                </div>
              </div>
            ) : (
              <div className="modal-empty">No films found for this director.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirectorsModal;
