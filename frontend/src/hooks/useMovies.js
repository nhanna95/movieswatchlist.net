import { useState, useCallback, useRef } from 'react';
import {
  getMovies,
  getStats,
  getMovie,
  getCollectionMovies,
  getSimilarMovies,
  setMovieFavorite,
  deleteMovie,
} from '../services/api';
import { filterTypes } from '../components/filterTypes';

/**
 * Custom hook for managing movie data fetching and state.
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.sorts - Current sort configuration
 * @param {Array} options.filters - Current filter configuration
 * @param {string} options.search - Current search query
 * @param {boolean} options.showFavoritesFirst - Whether to show favorites first
 * @param {string} options.countryCode - Country code for streaming services
 * @param {Array} options.preferredServices - Preferred streaming service IDs
 * @param {Function} options.addToast - Function to show toast notifications
 * @returns {Object} Movie state and handlers
 */
export const useMovies = ({
  sorts,
  filters,
  search,
  showFavoritesFirst,
  countryCode,
  preferredServices,
  addToast,
}) => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [previousMovie, setPreviousMovie] = useState(null);
  const [collectionMovies, setCollectionMovies] = useState([]);
  const [similarMovies, setSimilarMovies] = useState([]);

  // Pagination state
  const paginationRef = useRef({
    skip: 0,
    limit: 50,
    total: 0,
    hasMore: true,
  });

  // Build API params from current filters, sorts, and search
  const buildApiParams = useCallback(
    (skip = 0) => {
      const andFilters = {};
      const orGroups = [];

      // Process filters
      filters.forEach((filter) => {
        const filterType = filterTypes[filter.type];
        if (!filterType) return;

        if (filter.type === 'or_group') {
          // Handle OR groups
          const orGroupFilters = filter.config.filters || [];
          const listFilters = [];
          orGroupFilters.forEach((f) => {
            const ft = filterTypes[f.type];
            if (ft && ft.getApiParams) {
              const params = ft.getApiParams(f.config);
              Object.keys(params).forEach((key) => {
                if (key.startsWith('is_')) {
                  listFilters.push(key);
                }
              });
            }
          });
          if (listFilters.length > 0) {
            orGroups.push(listFilters);
          }
        } else {
          // Handle regular filters
          let apiParams;
          if (filter.type === 'availability') {
            // Check if there's a streaming_service filter
            const streamingServiceFilter = filters.find((f) => f.type === 'streaming_service');
            const servicesToUse = streamingServiceFilter
              ? filterTypes['streaming_service'].getApiParams(streamingServiceFilter.config, countryCode).preferred_services
              : preferredServices;
            apiParams = filterType.getApiParams(filter.config, countryCode, servicesToUse || []);
            // If availability filter is set, it takes precedence over streaming_service's automatic for_free
          } else if (filter.type === 'streaming_service') {
            // Check if there's an availability filter - if so, don't set availability_type here
            // (let availability filter handle it)
            const availabilityFilter = filters.find((f) => f.type === 'availability');
            if (availabilityFilter) {
              // If availability filter exists, only set preferred_services and watch_region
              // Don't set availability_type (let availability filter handle it)
              const params = filterType.getApiParams(filter.config, countryCode);
              apiParams = {
                preferred_services: params.preferred_services,
                watch_region: params.watch_region,
                // Don't include availability_type - let availability filter handle it
              };
            } else {
              // No availability filter, so streaming_service sets for_free automatically
              apiParams = filterType.getApiParams(filter.config, countryCode);
            }
          } else {
            apiParams = filterType.getApiParams(filter.config);
          }

          Object.entries(apiParams).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              if (Array.isArray(value)) {
                andFilters[key] = andFilters[key] ? [...andFilters[key], ...value] : value;
              } else {
                andFilters[key] = value;
              }
            }
          });
        }
      });

      return {
        skip,
        limit: paginationRef.current.limit,
        search: search || null,
        show_favorites_first: showFavoritesFirst,
        sort_by: sorts.length > 0 ? sorts.map((s) => s.field) : ['year', 'title'],
        sort_order: sorts.length > 0 ? sorts.map((s) => s.order) : ['desc', 'asc'],
        ...andFilters,
        ...(orGroups.length > 0 ? { or_group_list_filters: JSON.stringify(orGroups) } : {}),
      };
    },
    [filters, sorts, search, showFavoritesFirst, countryCode, preferredServices]
  );

  // Load movies from API
  const loadMovies = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
        paginationRef.current.skip = 0;
        paginationRef.current.hasMore = true;
      } else {
        if (!paginationRef.current.hasMore || loadingMore) return;
        setLoadingMore(true);
      }

      try {
        const params = buildApiParams(reset ? 0 : paginationRef.current.skip);
        const response = await getMovies(params);

        if (reset) {
          setMovies(response.movies || []);
        } else {
          setMovies((prev) => [...prev, ...(response.movies || [])]);
        }

        // Update pagination
        const newSkip = reset
          ? response.movies.length
          : paginationRef.current.skip + response.movies.length;
        paginationRef.current = {
          ...paginationRef.current,
          skip: newSkip,
          total: response.total || 0,
          hasMore: newSkip < (response.total || 0),
        };
      } catch (error) {
        console.error('Error loading movies:', error);
        if (addToast) {
          addToast('Failed to load movies', 'error');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildApiParams, loadingMore, addToast]
  );

  // Load more movies (infinite scroll)
  const loadMoreMovies = useCallback(() => {
    if (!loadingMore && !loading && paginationRef.current.hasMore) {
      loadMovies(false);
    }
  }, [loadMovies, loadingMore, loading]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const statsData = await getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  // Handle movie click
  const handleMovieClick = useCallback(
    async (movie, fromCollection = false) => {
      if (fromCollection && selectedMovie) {
        setPreviousMovie(selectedMovie);
      }

      try {
        // Load full movie details
        const fullMovie = await getMovie(movie.id);
        setSelectedMovie(fullMovie);

        // Load collection and similar movies
        if (fullMovie.tmdb_id) {
          const [collection, similar] = await Promise.all([
            getCollectionMovies(movie.id).catch(() => []),
            getSimilarMovies(movie.id).catch(() => []),
          ]);
          setCollectionMovies(collection);
          setSimilarMovies(similar);
        } else {
          setCollectionMovies([]);
          setSimilarMovies([]);
        }
      } catch (error) {
        console.error('Error loading movie details:', error);
        if (addToast) {
          addToast('Failed to load movie details', 'error');
        }
      }
    },
    [selectedMovie, addToast]
  );

  // Close movie modal
  const handleCloseModal = useCallback(() => {
    setSelectedMovie(null);
    setPreviousMovie(null);
    setCollectionMovies([]);
    setSimilarMovies([]);
  }, []);

  // Go back to previous movie
  const handleGoBack = useCallback(() => {
    if (previousMovie) {
      setSelectedMovie(previousMovie);
      setPreviousMovie(null);
    }
  }, [previousMovie]);

  // Toggle favorite status
  const handleToggleFavorite = useCallback(
    async (movie) => {
      try {
        const newFavoriteStatus = !movie.is_favorite;
        await setMovieFavorite(movie.id, newFavoriteStatus);

        // Update movie in list
        setMovies((prev) =>
          prev.map((m) => (m.id === movie.id ? { ...m, is_favorite: newFavoriteStatus } : m))
        );

        // Update selected movie if it's the one being toggled
        if (selectedMovie && selectedMovie.id === movie.id) {
          setSelectedMovie((prev) => ({ ...prev, is_favorite: newFavoriteStatus }));
        }

        // Reload stats to update counts
        loadStats();
      } catch (error) {
        console.error('Error toggling favorite:', error);
        if (addToast) {
          addToast('Failed to update favorite status', 'error');
        }
      }
    },
    [selectedMovie, loadStats, addToast]
  );

  // Delete a movie
  const handleDeleteMovie = useCallback(
    async (movieId) => {
      try {
        await deleteMovie(movieId);
        setMovies((prev) => prev.filter((m) => m.id !== movieId));
        if (selectedMovie && selectedMovie.id === movieId) {
          handleCloseModal();
        }
        loadStats();
        if (addToast) {
          addToast('Movie deleted', 'success');
        }
      } catch (error) {
        console.error('Error deleting movie:', error);
        if (addToast) {
          addToast('Failed to delete movie', 'error');
        }
      }
    },
    [selectedMovie, handleCloseModal, loadStats, addToast]
  );

  // Update a movie in the list
  const updateMovieInList = useCallback(
    (updatedMovie) => {
      setMovies((prev) =>
        prev.map((m) => (m.id === updatedMovie.id ? { ...m, ...updatedMovie } : m))
      );
      if (selectedMovie && selectedMovie.id === updatedMovie.id) {
        setSelectedMovie((prev) => ({ ...prev, ...updatedMovie }));
      }
    },
    [selectedMovie]
  );

  return {
    // State
    movies,
    setMovies,
    loading,
    loadingMore,
    stats,
    selectedMovie,
    setSelectedMovie,
    previousMovie,
    collectionMovies,
    similarMovies,
    pagination: paginationRef.current,

    // Actions
    loadMovies,
    loadMoreMovies,
    loadStats,
    handleMovieClick,
    handleCloseModal,
    handleGoBack,
    handleToggleFavorite,
    handleDeleteMovie,
    updateMovieInList,
    buildApiParams,
  };
};

export default useMovies;
