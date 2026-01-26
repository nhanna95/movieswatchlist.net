import { useEffect, useCallback } from 'react';

/**
 * Custom hook for handling keyboard shortcuts in the movie list.
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.movies - List of movies for navigation
 * @param {number} options.selectedMovieIndex - Currently selected movie index
 * @param {Function} options.setSelectedMovieIndex - Function to update selected index
 * @param {Object} options.selectedMovie - Currently open movie in modal
 * @param {Object} options.modals - Object containing modal states (importExport, shortcuts, statistics, settings, addMovie)
 * @param {Object} options.modalSetters - Object containing modal setter functions
 * @param {Function} options.onMovieClick - Handler for opening a movie
 * @param {Function} options.onToggleFavorite - Handler for toggling favorite
 * @param {Function} options.onCloseModal - Handler for closing movie modal
 * @param {React.RefObject} options.searchInputRef - Ref to the search input
 */
export const useKeyboardShortcuts = ({
  movies,
  selectedMovieIndex,
  setSelectedMovieIndex,
  selectedMovie,
  modals,
  modalSetters,
  onMovieClick,
  onToggleFavorite,
  onCloseModal,
  searchInputRef,
}) => {
  const handleKeyDown = useCallback(
    (event) => {
      const isInput = event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA';
      const isContentEditable = event.target.contentEditable === 'true';

      const { importExportOpen, shortcutsOpen, statisticsOpen, settingsOpen, addMovieOpen } =
        modals;

      const {
        setShortcutsOpen,
        setSettingsOpen,
        setAddMovieOpen,
        setImportExportOpen,
        setStatisticsOpen,
      } = modalSetters;

      // Handle Escape to close modals in priority order
      if (
        event.key === 'Escape' &&
        (selectedMovie ||
          importExportOpen ||
          shortcutsOpen ||
          statisticsOpen ||
          settingsOpen ||
          addMovieOpen)
      ) {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (addMovieOpen) {
          setAddMovieOpen(false);
        } else if (selectedMovie) {
          onCloseModal();
        } else if (importExportOpen) {
          setImportExportOpen(false);
        } else if (statisticsOpen) {
          setStatisticsOpen(false);
        }
        event.preventDefault();
        return;
      }

      // Allow ? to open shortcuts help from anywhere
      if (
        event.key === '?' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !isInput &&
        !isContentEditable
      ) {
        setShortcutsOpen(true);
        event.preventDefault();
        return;
      }

      // Don't handle shortcuts when in input, modal open, etc.
      if (
        isInput ||
        isContentEditable ||
        selectedMovie ||
        importExportOpen ||
        shortcutsOpen ||
        statisticsOpen ||
        settingsOpen ||
        addMovieOpen
      ) {
        return;
      }

      // Handle shortcuts
      switch (event.key) {
        case '/':
          event.preventDefault();
          if (searchInputRef?.current) {
            searchInputRef.current.focus();
          }
          break;
        case 'Escape':
          event.preventDefault();
          setSelectedMovieIndex(-1);
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedMovieIndex >= 0 && selectedMovieIndex < movies.length) {
            const movie = movies[selectedMovieIndex];
            onMovieClick(movie);
          }
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          if (selectedMovieIndex >= 0 && selectedMovieIndex < movies.length) {
            const movie = movies[selectedMovieIndex];
            onToggleFavorite(movie);
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (selectedMovieIndex > 0) {
            setSelectedMovieIndex(selectedMovieIndex - 1);
            const prevElement = document.querySelector(
              `[data-movie-index="${selectedMovieIndex - 1}"]`
            );
            if (prevElement) {
              prevElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (selectedMovieIndex < movies.length - 1) {
            setSelectedMovieIndex(selectedMovieIndex + 1);
            const nextElement = document.querySelector(
              `[data-movie-index="${selectedMovieIndex + 1}"]`
            );
            if (nextElement) {
              nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
          break;
        default:
          break;
      }

      // Handle Ctrl/Cmd combinations
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'f':
            event.preventDefault();
            if (searchInputRef?.current) {
              searchInputRef.current.focus();
            }
            break;
          case 's':
            event.preventDefault();
            // Prevent default browser save
            break;
          default:
            break;
        }
      }
    },
    [
      movies,
      selectedMovieIndex,
      setSelectedMovieIndex,
      selectedMovie,
      modals,
      modalSetters,
      onMovieClick,
      onToggleFavorite,
      onCloseModal,
      searchInputRef,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Reset selected movie index when movies change
  useEffect(() => {
    setSelectedMovieIndex(-1);
  }, [movies, setSelectedMovieIndex]);
};

export default useKeyboardShortcuts;
