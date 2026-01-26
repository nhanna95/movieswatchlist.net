import React, { useEffect, useState, useRef } from 'react';
import './MovieModal.css';
import { trackedListNames } from './filterTypes';
import { setMovieNotes, getStreamingInfo, setMovieSeenBefore } from '../services/api';
import { getCountryName, getCommonCountries } from '../utils/countryDetection';
import { normalizeCountryName } from '../utils/formatting';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

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

// Helper function to extract trailer from videos array
const getTrailerFromVideos = (videos) => {
  if (!videos || !Array.isArray(videos) || videos.length === 0) {
    return null;
  }

  // First, try to find a YouTube Trailer
  const trailer = videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer');

  if (trailer) {
    return trailer;
  }

  // Fallback to YouTube Teaser if no Trailer found
  const teaser = videos.find((v) => v.site === 'YouTube' && v.type === 'Teaser');

  return teaser || null;
};

const MovieModal = ({
  movie,
  onClose,
  collectionMovies = [],
  similarMovies = [],
  onCollectionMovieClick,
  onAddCollectionMovie,
  onToggleFavorite,
  onDelete,
  onNotesSaved,
  countryCode: initialCountryCode = 'US',
  onCountryChange,
  preferredServices = [],
  movies = [],
  onMovieChange,
  onFilterByTrackedList,
  previousMovie,
  onGoBack,
  onDirectorClick,
}) => {
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [streamingInfo, setStreamingInfo] = useState(null);
  const [streamingLoading, setStreamingLoading] = useState(false);
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [showTrailerEmbed, setShowTrailerEmbed] = useState(false);
  const modalContentRef = useRef(null);

  // Initialize notes from movie prop
  useEffect(() => {
    if (movie) {
      setNotes(movie.notes || '');
    }
  }, [movie]);

  // Scroll modal content to top when movie changes (e.g., when clicking a similar movie)
  useEffect(() => {
    if (movie && modalContentRef.current) {
      modalContentRef.current.scrollTop = 0;
    }
    // Reset trailer embed state when movie changes
    setShowTrailerEmbed(false);
  }, [movie]);

  // Update country code when prop changes
  useEffect(() => {
    setCountryCode(initialCountryCode);
  }, [initialCountryCode]);

  // Fetch streaming info when movie or country code changes
  useEffect(() => {
    const fetchStreamingData = async () => {
      if (!movie?.id || !countryCode) {
        setStreamingInfo(null);
        return;
      }

      setStreamingLoading(true);
      try {
        const data = await getStreamingInfo(movie.id, countryCode);
        setStreamingInfo(data);
      } catch (error) {
        console.error('Error fetching streaming info:', error);
        setStreamingInfo(null);
      } finally {
        setStreamingLoading(false);
      }
    };

    fetchStreamingData();
  }, [movie?.id, countryCode]);

  // Handle country code change
  const handleCountryChange = (newCountryCode) => {
    setCountryCode(newCountryCode);
    if (onCountryChange) {
      onCountryChange(newCountryCode);
    }
  };

  // Handle Escape key to close modal and arrow keys to navigate
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't handle navigation if user is typing in an input or textarea
      const target = event.target;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (event.key === 'Escape') {
        onClose();
      } else if (!isInput && event.key === 'ArrowLeft' && movies.length > 0 && onMovieChange) {
        // Navigate to previous movie
        const currentIndex = movies.findIndex((m) => m.id === movie?.id);
        if (currentIndex > 0) {
          event.preventDefault();
          onMovieChange(movies[currentIndex - 1]);
        }
      } else if (!isInput && event.key === 'ArrowRight' && movies.length > 0 && onMovieChange) {
        // Navigate to next movie
        const currentIndex = movies.findIndex((m) => m.id === movie?.id);
        if (currentIndex >= 0 && currentIndex < movies.length - 1) {
          event.preventDefault();
          onMovieChange(movies[currentIndex + 1]);
        }
      }
    };

    // Add event listener when modal is open
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup: remove event listener when modal closes
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, movies, movie, onMovieChange]);

  const handleNotesChange = (e) => {
    const newNotes = e.target.value;
    if (newNotes.length <= 5000) {
      setNotes(newNotes);
      setNotesSaved(false);
    }
  };

  const handleNotesSave = async () => {
    if (!movie || !movie.id) return;

    setNotesSaving(true);
    try {
      await setMovieNotes(movie.id, notes);
      setNotesSaved(true);
      // Update movie object with new notes
      if (movie) {
        movie.notes = notes;
      }
      if (onNotesSaved) {
        onNotesSaved('Notes saved successfully');
      }
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (error) {
      console.error('Error saving notes:', error);
      if (onNotesSaved) {
        onNotesSaved(
          'Error saving notes: ' + (error.response?.data?.detail || error.message),
          'error'
        );
      }
    } finally {
      setNotesSaving(false);
    }
  };

  const handleToggleSeenBefore = async () => {
    if (!movie || !movie.id) return;

    const newSeenBefore = !movie.seen_before;
    try {
      await setMovieSeenBefore(movie.id, newSeenBefore);
      // Update movie object with new seen_before status
      if (movie) {
        movie.seen_before = newSeenBefore;
      }
      if (onNotesSaved) {
        onNotesSaved(newSeenBefore ? 'Marked as seen' : 'Marked as not seen');
      }
    } catch (error) {
      console.error('Error updating seen_before:', error);
      if (onNotesSaved) {
        onNotesSaved(
          'Error updating seen status: ' + (error.response?.data?.detail || error.message),
          'error'
        );
      }
    }
  };

  // Find current movie index and determine if we can navigate
  const currentIndex = movie ? movies.findIndex((m) => m.id === movie.id) : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < movies.length - 1;

  const handlePreviousMovie = () => {
    if (hasPrevious && onMovieChange) {
      onMovieChange(movies[currentIndex - 1]);
    }
  };

  const handleNextMovie = () => {
    if (hasNext && onMovieChange) {
      onMovieChange(movies[currentIndex + 1]);
    }
  };

  if (!movie) return null;

  const tmdbData = movie.tmdb_data || {};
  const posterPath = tmdbData.poster_path;
  const backdropPath = tmdbData.backdrop_path;
  const overview = tmdbData.overview;
  const tagline = tmdbData.tagline;
  const voteCount = tmdbData.vote_count;
  const releaseDate = tmdbData.release_date;
  const originalLanguage = tmdbData.original_language;
  const belongsToCollection = tmdbData.belongs_to_collection;
  const productionCompanies = tmdbData.production_companies || [];
  const productionCountries = tmdbData.production_countries || [];
  const spokenLanguages = tmdbData.spoken_languages || [];
  const credits = tmdbData.credits || {};
  const cast = credits.cast || [];
  const crew = credits.crew || [];
  // Extract awards data - check multiple possible locations in TMDB response
  const awardsData = tmdbData.awards || tmdbData.award || null;
  const videos = tmdbData.videos?.results || [];
  const trailer = getTrailerFromVideos(videos);

  // Map ISO 639-1 language codes to full names
  const languageNames = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    hi: 'Hindi',
    ar: 'Arabic',
    fa: 'Persian',
    tr: 'Turkish',
    pl: 'Polish',
    nl: 'Dutch',
    sv: 'Swedish',
    da: 'Danish',
    no: 'Norwegian',
    fi: 'Finnish',
    cs: 'Czech',
    hu: 'Hungarian',
    ro: 'Romanian',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    ms: 'Malay',
    tl: 'Tagalog',
    he: 'Hebrew',
    uk: 'Ukrainian',
    el: 'Greek',
    bg: 'Bulgarian',
    hr: 'Croatian',
    sr: 'Serbian',
    sk: 'Slovak',
    sl: 'Slovenian',
    et: 'Estonian',
    lv: 'Latvian',
    lt: 'Lithuanian',
    is: 'Icelandic',
    ga: 'Irish',
    mt: 'Maltese',
    cy: 'Welsh',
    bn: 'Bengali',
    hy: 'Armenian',
    ln: 'Lingala',
    wo: 'Wolof',
    cn: 'Chinese (Variant)',
    xx: 'Unknown/No Language',
  };

  const originalLanguageName = hasValidValue(originalLanguage)
    ? languageNames[originalLanguage.toLowerCase()] ||
      languageNames[originalLanguage] ||
      originalLanguage.toUpperCase()
    : null;

  // Get top cast (first 10), filtering out any with invalid names
  const topCast = cast.filter((actor) => actor && hasValidValue(actor.name)).slice(0, 10);

  // Get crew members (writers, producers, etc.)
  const writers = crew.filter((person) => person.job === 'Writer' || person.job === 'Screenplay');
  const producers = crew.filter(
    (person) => person.job === 'Producer' || person.job === 'Executive Producer'
  );

  // Process awards data for display
  const processAwardsData = () => {
    if (!awardsData) return null;

    // Handle different possible structures
    let awardsList = [];

    // Structure 1: awards.results array
    if (awardsData.results && Array.isArray(awardsData.results)) {
      awardsList = awardsData.results;
    }
    // Structure 2: awards is directly an array
    else if (Array.isArray(awardsData)) {
      awardsList = awardsData;
    }
    // Structure 3: awards has a nested structure
    else if (awardsData.awards && Array.isArray(awardsData.awards)) {
      awardsList = awardsData.awards;
    }
    // Structure 4: single award object
    else if (typeof awardsData === 'object' && awardsData.award) {
      awardsList = [awardsData];
    }

    // Filter out invalid entries and return
    return awardsList.filter((award) => {
      return (
        award &&
        (hasValidValue(award.award) || hasValidValue(award.category) || hasValidValue(award.title))
      );
    });
  };

  const processedAwards = processAwardsData();

  // Get list memberships (all fields starting with 'is_' that are true)
  // Exclude 'is_favorite' since that's handled separately
  // Apply conditional logic:
  // - Don't show "3.8+ Stars" if movie has "4 Stars"
  // - Don't show "4 Stars" if movie is in "Letterboxd's Top 250"
  const listMemberships = [];
  const has4Stars = movie.is_4_stars;
  const hasLetterboxdT250 = movie.is_letterboxd_t250;

  Object.keys(movie).forEach((key) => {
    // Check if it's a tracked list field (starts with 'is_' but not 'is_favorite')
    // and has a truthy value (handles both boolean true and number 1)
    if (key.startsWith('is_') && key !== 'is_favorite' && movie[key]) {
      // Skip "3.8+ Stars" if movie has "4 Stars"
      if (key === 'is_38_stars' && has4Stars) {
        return;
      }
      // Skip "4 Stars" if movie is in "Letterboxd's Top 250"
      if (key === 'is_4_stars' && hasLetterboxdT250) {
        return;
      }

      // Try to find human-readable name
      // Convert column name back to filename: is_imdb_t250 -> imdb-t250
      const filename = key.replace(/^is_/, '').replace(/_/g, '-');
      const displayName = trackedListNames[filename] || filename;
      listMemberships.push({ columnName: key, displayName });
    }
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      {hasPrevious && (
        <button
          className="modal-nav-arrow modal-nav-arrow-left"
          onClick={(e) => {
            e.stopPropagation();
            handlePreviousMovie();
          }}
          aria-label="Previous movie"
          title="Previous movie (←)"
        >
          <svg
            className="modal-nav-arrow-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          className="modal-nav-arrow modal-nav-arrow-right"
          onClick={(e) => {
            e.stopPropagation();
            handleNextMovie();
          }}
          aria-label="Next movie"
          title="Next movie (→)"
        >
          <svg
            className="modal-nav-arrow-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      <div className="modal-content" ref={modalContentRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        {previousMovie && onGoBack && (
          <button
            className="modal-back-button"
            onClick={(e) => {
              e.stopPropagation();
              onGoBack();
            }}
            aria-label="Go back to previous movie"
            title="Go back to previous movie"
          >
            <svg
              className="modal-back-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        <div className="modal-header">
          {posterPath && (
            <div className="modal-poster-container">
              <img
                src={`${TMDB_IMAGE_BASE_URL}${posterPath}`}
                alt={`${movie.title} poster`}
                className="modal-poster"
              />
            </div>
          )}
          {streamingInfo &&
            (() => {
              // Get all providers from different categories
              const allProviders = [
                ...(streamingInfo.free || []).map((p) => ({ ...p, category: 'free' })),
                ...(streamingInfo.flatrate || []).map((p) => ({ ...p, category: 'flatrate' })),
                ...(streamingInfo.ads || []).map((p) => ({ ...p, category: 'ads' })),
                ...(streamingInfo.rent || []).map((p) => ({ ...p, category: 'rent' })),
                ...(streamingInfo.buy || []).map((p) => ({ ...p, category: 'buy' })),
              ];

              // Check if user has favorited services with the movie available for streaming (flatrate)
              // This needs to be checked on the original data, not after filtering
              const favoritedStreamingProviderIds = new Set();
              (streamingInfo.flatrate || []).forEach((provider) => {
                if (preferredServices.includes(provider.provider_id)) {
                  favoritedStreamingProviderIds.add(provider.provider_id);
                }
              });
              const hasFavoritedStreaming = favoritedStreamingProviderIds.size > 0;

              // Filter to only show:
              // 1. Services that are favorited AND available for streaming (flatrate) or free
              // 2. Services that are free (free or ads if no free without ads) - ONLY if no favorited streaming services
              const hasFreeWithoutAds = (streamingInfo.free || []).length > 0;
              const freeCategories = hasFreeWithoutAds ? ['free'] : ['free', 'ads'];
              const streamingCategories = [
                'free',
                'flatrate',
                ...(hasFreeWithoutAds ? [] : ['ads']),
              ];

              const filteredProviders = allProviders.filter((provider) => {
                const isFavorited = preferredServices.includes(provider.provider_id);
                const isFree = freeCategories.includes(provider.category);
                const isFavoritedAndStreaming =
                  isFavorited && streamingCategories.includes(provider.category);
                // If user has favorited streaming services, don't show free services
                if (hasFavoritedStreaming && isFree && !isFavorited) {
                  return false;
                }
                return isFavoritedAndStreaming || (isFree && !hasFavoritedStreaming);
              });

              // Deduplicate by provider_id, prioritizing free/streaming over rent/buy
              // Only keep providers that are actually free or favorited+streaming
              const providerMap = new Map();
              filteredProviders.forEach((provider) => {
                const existing = providerMap.get(provider.provider_id);
                if (!existing) {
                  providerMap.set(provider.provider_id, provider);
                } else {
                  // Prefer free/streaming categories over rent/buy
                  const priorityOrder = ['free', 'flatrate', 'ads', 'rent', 'buy'];
                  const existingPriority = priorityOrder.indexOf(existing.category);
                  const newPriority = priorityOrder.indexOf(provider.category);
                  if (newPriority < existingPriority) {
                    providerMap.set(provider.provider_id, provider);
                  }
                }
              });

              // Final filter: ensure all services are either free or favorited+streaming
              // If user has favorited streaming services, don't show free services (unless they're also favorited)
              const filteredServices = Array.from(providerMap.values()).filter((provider) => {
                const isFavorited = preferredServices.includes(provider.provider_id);
                const isFree = freeCategories.includes(provider.category);
                const isStreaming = provider.category === 'flatrate';
                const isFavoritedAndStreaming = isFavorited && isStreaming;

                // If user has favorited streaming services, exclude free services (unless also favorited)
                if (hasFavoritedStreaming) {
                  // Only show favorited services that are streaming or free
                  if (isFavorited && (isStreaming || isFree)) {
                    return true;
                  }
                  // Don't show non-favorited free services
                  return false;
                }

                // If no favorited streaming services, show free services
                return isFree;
              });

              if (filteredServices.length > 0) {
                return (
                  <div className="modal-poster-free-services">
                    {filteredServices
                      .slice(0, 6)
                      .map(
                        (provider, index) =>
                          provider.logo_path && (
                            <img
                              key={index}
                              src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                              alt={provider.provider_name}
                              className="modal-poster-free-service-icon"
                              title={provider.provider_name}
                            />
                          )
                      )}
                    {filteredServices.length > 6 && (
                      <div className="modal-poster-free-service-more">
                        +{filteredServices.length - 6}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          <div className="modal-header-text">
            <div className="modal-title-row">
              <h2 className="modal-title">
                {movie.title}
                {hasValidValue(movie.year) && <span className="modal-year"> ({movie.year})</span>}
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className={`modal-favorite-toggle ${movie.is_favorite ? 'is-favorite' : ''}`}
                  onClick={() => onToggleFavorite && onToggleFavorite(movie)}
                  aria-label={movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={movie.is_favorite ? 'true' : 'false'}
                  title={movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {movie.is_favorite ? '★' : '☆'}
                </button>
                <button
                  className={`modal-seen-before-toggle ${movie.seen_before ? 'seen-before' : ''}`}
                  onClick={handleToggleSeenBefore}
                  aria-label={movie.seen_before ? 'Mark as not seen' : 'Mark as seen'}
                  aria-pressed={movie.seen_before ? 'true' : 'false'}
                  title={movie.seen_before ? 'Mark as not seen' : 'Mark as seen'}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={movie.seen_before ? '#76EE5C' : '#A7B1BA'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path
                      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                      fill={movie.seen_before ? '#76EE5C' : 'none'}
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3.5"
                      fill="none"
                      stroke={movie.seen_before ? '#3F424A' : '#A7B1BA'}
                    />
                  </svg>
                </button>
              </div>
            </div>
            {hasValidValue(tagline) && <p className="modal-tagline">{tagline}</p>}
            {movie.letterboxd_uri && (
              <a
                href={movie.letterboxd_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="modal-poster-link"
              >
                View on Letterboxd →
              </a>
            )}

            {listMemberships.length > 0 && (
              <div className="modal-lists-header">
                <div className="modal-lists">
                  {listMemberships.map((listMembership, index) => (
                    <span
                      key={index}
                      className="modal-list-badge"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onFilterByTrackedList) {
                          onFilterByTrackedList(listMembership.columnName);
                          onClose();
                        }
                      }}
                      style={{ cursor: onFilterByTrackedList ? 'pointer' : 'default' }}
                      title={
                        onFilterByTrackedList
                          ? `Filter to movies in ${listMembership.displayName}`
                          : undefined
                      }
                    >
                      {listMembership.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-body">
          {hasValidValue(overview) && (
            <div className="modal-section">
              <h3 className="modal-section-title">Overview</h3>
              <p className="modal-overview">{overview}</p>
            </div>
          )}

          {trailer && (
            <div className="modal-section">
              <h3 className="modal-section-title">Trailer</h3>
              {!showTrailerEmbed ? (
                <div className="modal-trailer-buttons">
                  <button
                    className="modal-trailer-play-button"
                    onClick={() => setShowTrailerEmbed(true)}
                  >
                    ▶ Play Trailer
                  </button>
                  <a
                    href={`https://www.youtube.com/watch?v=${trailer.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-trailer-youtube-link"
                  >
                    Watch on YouTube
                  </a>
                </div>
              ) : (
                <div className="modal-trailer-embed-container">
                  <button
                    className="modal-trailer-close-button"
                    onClick={() => setShowTrailerEmbed(false)}
                  >
                    Close Trailer
                  </button>
                  <div className="modal-trailer-embed">
                    <iframe
                      src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                      title={trailer.name || 'Movie Trailer'}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="modal-info-grid">
            {hasValidValue(movie.director) && (
              <div className="modal-info-item">
                <span className="modal-info-label">Director:</span>
                {onDirectorClick ? (
                  <button
                    className="modal-info-value modal-info-link"
                    onClick={() => onDirectorClick(movie.director)}
                    title={`View all films by ${movie.director}`}
                  >
                    {movie.director}
                  </button>
                ) : (
                  <span className="modal-info-value">{movie.director}</span>
                )}
              </div>
            )}

            {movie.genres &&
              Array.isArray(movie.genres) &&
              (() => {
                const validGenres = movie.genres.filter((g) => hasValidValue(g));
                const genresText = validGenres.join(', ');
                return validGenres.length > 0 && hasValidValue(genresText) ? (
                  <div className="modal-info-item">
                    <span className="modal-info-label">Genres:</span>
                    <span className="modal-info-value">{genresText}</span>
                  </div>
                ) : null;
              })()}

            {hasValidValue(movie.runtime) &&
              typeof movie.runtime === 'number' &&
              movie.runtime > 0 && (
                <div className="modal-info-item">
                  <span className="modal-info-label">Runtime:</span>
                  <span className="modal-info-value">{movie.runtime} minutes</span>
                </div>
              )}

            {hasValidValue(originalLanguageName) && (
              <div className="modal-info-item">
                <span className="modal-info-label">Original Language:</span>
                <span className="modal-info-value">{originalLanguageName}</span>
              </div>
            )}

            {Array.isArray(spokenLanguages) &&
              spokenLanguages.length > 0 &&
              (() => {
                const validLanguages = spokenLanguages
                  .filter((l) => l && (hasValidValue(l.name) || hasValidValue(l.iso_639_1)))
                  .map((l) => {
                    const langCode = l.iso_639_1;
                    const langName =
                      languageNames[langCode?.toLowerCase()] ||
                      languageNames[langCode] ||
                      l.name ||
                      (langCode ? langCode.toUpperCase() : 'Unknown');
                    return hasValidValue(langName) ? langName : null;
                  })
                  .filter((l) => l !== null && hasValidValue(l));
                const languagesText = validLanguages.join(', ');
                return validLanguages.length > 0 && hasValidValue(languagesText) ? (
                  <div className="modal-info-item">
                    <span className="modal-info-label">
                      Spoken Language{validLanguages.length > 1 ? 's' : ''}:
                    </span>
                    <span className="modal-info-value">{languagesText}</span>
                  </div>
                ) : null;
              })()}

            {Array.isArray(productionCountries) &&
              productionCountries.length > 0 &&
              (() => {
                const validCountries = productionCountries
                  .filter((c) => c && hasValidValue(c.name))
                  .map((c) => normalizeCountryName(c.name))
                  .filter((name) => hasValidValue(name));
                const countriesText = validCountries.join(', ');
                return validCountries.length > 0 && hasValidValue(countriesText) ? (
                  <div className="modal-info-item">
                    <span className="modal-info-label">Countries:</span>
                    <span className="modal-info-value">{countriesText}</span>
                  </div>
                ) : null;
              })()}

            {hasValidValue(releaseDate) && (
              <div className="modal-info-item">
                <span className="modal-info-label">Release Date:</span>
                <span className="modal-info-value">
                  {new Date(releaseDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}

            <div className="modal-info-item">
              <span className="modal-info-label">Date Added:</span>
              <span className="modal-info-value">
                {movie.date_added
                  ? new Date(movie.date_added).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Not available'}
              </span>
            </div>

            {Array.isArray(writers) &&
              writers.length > 0 &&
              (() => {
                const validWriters = writers
                  .filter((w) => w && hasValidValue(w.name))
                  .map((w) => w.name)
                  .filter((name) => hasValidValue(name));
                const writersText = validWriters.join(', ');
                return validWriters.length > 0 && hasValidValue(writersText) ? (
                  <div className="modal-info-item">
                    <span className="modal-info-label">
                      Writer{validWriters.length > 1 ? 's' : ''}:
                    </span>
                    <span className="modal-info-value">{writersText}</span>
                  </div>
                ) : null;
              })()}

            {Array.isArray(productionCompanies) &&
              productionCompanies.length > 0 &&
              (() => {
                const validCompanies = productionCompanies
                  .filter((c) => c && hasValidValue(c.name))
                  .map((c) => c.name)
                  .filter((name) => hasValidValue(name));
                const companiesText = validCompanies.join(', ');
                return validCompanies.length > 0 && hasValidValue(companiesText) ? (
                  <div className="modal-info-item">
                    <span className="modal-info-label">Production:</span>
                    <span className="modal-info-value">{companiesText}</span>
                  </div>
                ) : null;
              })()}

            {Array.isArray(producers) &&
              producers.length > 0 &&
              (() => {
                const validProducers = producers
                  .filter((p) => p && hasValidValue(p.name))
                  .map((p) => p.name)
                  .filter((name) => hasValidValue(name));
                const producersText = validProducers.join(', ');
                return validProducers.length > 0 && hasValidValue(producersText) ? (
                  <div className="modal-info-item">
                    <span className="modal-info-label">
                      Producer{validProducers.length > 1 ? 's' : ''}:
                    </span>
                    <span className="modal-info-value">{producersText}</span>
                  </div>
                ) : null;
              })()}

            {hasValidValue(movie.tmdb_id) && (
              <div className="modal-info-item">
                <span className="modal-info-label">TMDB ID:</span>
                <span className="modal-info-value">{movie.tmdb_id}</span>
              </div>
            )}
          </div>

          {topCast.length > 0 && (
            <div className="modal-section">
              <h3 className="modal-section-title">Cast</h3>
              <div className="modal-cast">
                {topCast.map((actor, index) => (
                  <div key={index} className="modal-cast-member">
                    {actor.name}{' '}
                    {actor.character && (
                      <span className="modal-cast-character">as {actor.character}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {processedAwards &&
            processedAwards.length > 0 &&
            (() => {
              // Group awards by ceremony/award name
              const awardsByCeremony = {};
              processedAwards.forEach((award) => {
                const ceremonyName = award.award || award.ceremony || award.title || 'Awards';
                if (!awardsByCeremony[ceremonyName]) {
                  awardsByCeremony[ceremonyName] = [];
                }
                awardsByCeremony[ceremonyName].push(award);
              });

              return (
                <div className="modal-section">
                  <h3 className="modal-section-title">Awards & Nominations</h3>
                  <div className="modal-awards">
                    {Object.entries(awardsByCeremony).map(([ceremonyName, awards]) => (
                      <div key={ceremonyName} className="modal-award-ceremony">
                        <h4 className="modal-award-ceremony-name">{ceremonyName}</h4>
                        <div className="modal-award-list">
                          {awards.map((award, index) => {
                            const category = award.category || award.type || '';
                            const year = award.year;
                            const won = award.won === true || award.winner === true;
                            const nominees = award.nominees || award.nominee || [];
                            const winner = award.winner || award.won_name || '';

                            return (
                              <div key={index} className="modal-award-item">
                                {won && (
                                  <span
                                    className="modal-award-status modal-award-won"
                                    title="Winner"
                                  >
                                    ★
                                  </span>
                                )}
                                {!won && category && (
                                  <span
                                    className="modal-award-status modal-award-nominated"
                                    title="Nominated"
                                  >
                                    •
                                  </span>
                                )}
                                <div className="modal-award-details">
                                  {category && (
                                    <span className="modal-award-category">{category}</span>
                                  )}
                                  {year && <span className="modal-award-year">({year})</span>}
                                  {won && winner && (
                                    <span className="modal-award-winner"> - Winner</span>
                                  )}
                                  {!won && nominees.length > 0 && (
                                    <span className="modal-award-nominees"> - Nominated</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {belongsToCollection && collectionMovies.length > 0 && (
            <div className="modal-section">
              <h3 className="modal-section-title">Collection: {belongsToCollection.name}</h3>
              <div className="modal-collection">
                <p className="modal-collection-description">Films in this collection:</p>
                <div className="modal-collection-movies">
                  {collectionMovies.map((collectionMovie, index) => {
                    const isInDb = collectionMovie.in_db !== false; // Default to true for backward compatibility
                    const key = collectionMovie.id || `tmdb-${collectionMovie.tmdb_id || index}`;

                    if (isInDb && collectionMovie.id) {
                      // Movie is in database - make it clickable
                      return (
                        <button
                          key={key}
                          className="modal-collection-movie-link"
                          onClick={() =>
                            onCollectionMovieClick && onCollectionMovieClick(collectionMovie)
                          }
                        >
                          {collectionMovie.title}
                          {hasValidValue(collectionMovie.year) && ` (${collectionMovie.year})`}
                        </button>
                      );
                    } else {
                      // Movie is not in database - make it clickable to open add movie modal
                      return (
                        <button
                          key={key}
                          className="modal-collection-movie-link"
                          onClick={() =>
                            onAddCollectionMovie && onAddCollectionMovie(collectionMovie)
                          }
                          style={{
                            opacity: 0.7,
                            fontStyle: 'italic',
                          }}
                          title="Click to add this movie to your watchlist"
                        >
                          {collectionMovie.title}
                          {hasValidValue(collectionMovie.year) && ` (${collectionMovie.year})`}
                        </button>
                      );
                    }
                  })}
                </div>
              </div>
            </div>
          )}

          {similarMovies && similarMovies.length > 0 && (
            <div className="modal-section">
              <h3 className="modal-section-title">Similar Movies</h3>
              <div className="modal-similar-movies">
                <p className="modal-similar-description">
                  Movies similar to this one in your watchlist:
                </p>
                <div className="modal-similar-movies-grid">
                  {similarMovies.map((similarMovie) => (
                    <button
                      key={similarMovie.id}
                      className="modal-similar-movie-card"
                      onClick={() => onCollectionMovieClick && onCollectionMovieClick(similarMovie)}
                    >
                      {similarMovie.poster_url && (
                        <img
                          src={similarMovie.poster_url}
                          alt={`${similarMovie.title} poster`}
                          className="modal-similar-poster"
                        />
                      )}
                      <div className="modal-similar-movie-info">
                        <div className="modal-similar-movie-title">{similarMovie.title}</div>
                        {hasValidValue(similarMovie.year) && (
                          <div className="modal-similar-movie-year">{similarMovie.year}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="modal-section">
            <h3 className="modal-section-title">Notes</h3>
            <div className="modal-notes-container">
              <textarea
                className="modal-notes-textarea"
                value={notes}
                onChange={handleNotesChange}
                placeholder="Add your notes about this movie..."
                rows={6}
                maxLength={5000}
              />
              <div className="modal-notes-footer">
                <span className="modal-notes-counter">{notes.length} / 5000 characters</span>
                <button
                  className="modal-notes-save"
                  onClick={handleNotesSave}
                  disabled={notesSaving}
                >
                  {notesSaving ? 'Saving...' : notesSaved ? 'Saved!' : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-header">
              <h3 className="modal-section-title">Where to Watch</h3>
              <div className="modal-section-header-actions">
                <select
                  className="modal-country-selector"
                  value={countryCode}
                  onChange={(e) => handleCountryChange(e.target.value)}
                >
                  {getCommonCountries().map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {streamingLoading ? (
              <div className="modal-streaming-loading">Loading streaming information...</div>
            ) : streamingInfo ? (
              <div className="modal-streaming-content">
                {(() => {
                  // Helper function to filter out Amazon Channel, Apple TV Channel, and Roku Premium Channel
                  const filterChannels = (providers) => {
                    if (!providers || !Array.isArray(providers)) return [];
                    return providers.filter((provider) => {
                      if (!provider || !provider.provider_name) return true;
                      const nameLower = provider.provider_name.toLowerCase();
                      // Filter Amazon Channel (including typos like "Amzon Channel")
                      if (
                        (nameLower.includes('amazon channel') ||
                          nameLower.includes('amzon channel')) &&
                        nameLower !== 'amazon prime video'
                      ) {
                        return false;
                      }
                      // Filter Apple TV Channel
                      if (nameLower.includes('apple tv channel')) {
                        return false;
                      }
                      // Filter Roku Premium Channel
                      if (nameLower.includes('roku premium channel')) {
                        return false;
                      }
                      return true;
                    });
                  };

                  // Filter out channels from all provider arrays
                  const flatrateProviders = filterChannels(streamingInfo.flatrate);
                  const freeProviders = filterChannels(streamingInfo.free);
                  const rentProviders = filterChannels(streamingInfo.rent);
                  const buyProviders = filterChannels(streamingInfo.buy);
                  const adsProviders = filterChannels(streamingInfo.ads);

                  // Combine Rent and Buy sections when services appear in both
                  // Match services by provider_id
                  const rentProviderIds = new Set(rentProviders.map((p) => p.provider_id));
                  const buyProviderIds = new Set(buyProviders.map((p) => p.provider_id));

                  // Find services that appear in both rent and buy
                  const rentAndBuyIds = new Set(
                    [...rentProviderIds].filter((id) => buyProviderIds.has(id))
                  );

                  // Separate services into: rent-only, buy-only, and rent-or-buy
                  const rentOnlyProviders = rentProviders.filter(
                    (p) => !rentAndBuyIds.has(p.provider_id)
                  );
                  const buyOnlyProviders = buyProviders.filter(
                    (p) => !rentAndBuyIds.has(p.provider_id)
                  );
                  const rentOrBuyProviders = rentProviders.filter((p) =>
                    rentAndBuyIds.has(p.provider_id)
                  );

                  // Check if we have any providers to show (using filtered arrays)
                  const hasAnyProviders =
                    flatrateProviders.length > 0 ||
                    freeProviders.length > 0 ||
                    rentOnlyProviders.length > 0 ||
                    buyOnlyProviders.length > 0 ||
                    rentOrBuyProviders.length > 0 ||
                    adsProviders.length > 0;

                  return (
                    <>
                      {flatrateProviders.length > 0 && (
                        <div className="modal-streaming-type">
                          <h4 className="modal-streaming-type-title">Stream</h4>
                          <div className="modal-streaming-providers">
                            {flatrateProviders.map((provider, index) => (
                              <div key={index} className="modal-streaming-provider">
                                {provider.logo_path && (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    className="modal-streaming-provider-logo"
                                  />
                                )}
                                <span className="modal-streaming-provider-name">
                                  {provider.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {freeProviders.length > 0 && (
                        <div className="modal-streaming-type">
                          <h4 className="modal-streaming-type-title">Free</h4>
                          <div className="modal-streaming-providers">
                            {freeProviders.map((provider, index) => (
                              <div key={index} className="modal-streaming-provider">
                                {provider.logo_path && (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    className="modal-streaming-provider-logo"
                                  />
                                )}
                                <span className="modal-streaming-provider-name">
                                  {provider.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {rentOrBuyProviders.length > 0 && (
                        <div className="modal-streaming-type">
                          <h4 className="modal-streaming-type-title">Rent or Buy</h4>
                          <div className="modal-streaming-providers">
                            {rentOrBuyProviders.map((provider, index) => (
                              <div key={index} className="modal-streaming-provider">
                                {provider.logo_path && (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    className="modal-streaming-provider-logo"
                                  />
                                )}
                                <span className="modal-streaming-provider-name">
                                  {provider.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {rentOnlyProviders.length > 0 && (
                        <div className="modal-streaming-type">
                          <h4 className="modal-streaming-type-title">Rent</h4>
                          <div className="modal-streaming-providers">
                            {rentOnlyProviders.map((provider, index) => (
                              <div key={index} className="modal-streaming-provider">
                                {provider.logo_path && (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    className="modal-streaming-provider-logo"
                                  />
                                )}
                                <span className="modal-streaming-provider-name">
                                  {provider.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {buyOnlyProviders.length > 0 && (
                        <div className="modal-streaming-type">
                          <h4 className="modal-streaming-type-title">Buy</h4>
                          <div className="modal-streaming-providers">
                            {buyOnlyProviders.map((provider, index) => (
                              <div key={index} className="modal-streaming-provider">
                                {provider.logo_path && (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    className="modal-streaming-provider-logo"
                                  />
                                )}
                                <span className="modal-streaming-provider-name">
                                  {provider.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {adsProviders.length > 0 && (
                        <div className="modal-streaming-type">
                          <h4 className="modal-streaming-type-title">With Ads</h4>
                          <div className="modal-streaming-providers">
                            {adsProviders.map((provider, index) => (
                              <div key={index} className="modal-streaming-provider">
                                {provider.logo_path && (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    className="modal-streaming-provider-logo"
                                  />
                                )}
                                <span className="modal-streaming-provider-name">
                                  {provider.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!hasAnyProviders && (
                        <div className="modal-streaming-unavailable">
                          Not available for streaming in {getCountryName(countryCode)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="modal-streaming-unavailable">Streaming information not available</div>
            )}
          </div>

          {onDelete && (
            <div className="modal-delete-section">
              <button
                className="modal-delete-button"
                onClick={() => onDelete && onDelete(movie)}
                aria-label="Delete movie"
                title="Delete movie"
              >
                Remove Movie
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MovieModal;
