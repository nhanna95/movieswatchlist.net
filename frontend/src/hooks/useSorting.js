import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Helper function to remove is_favorite from sorts array.
 * Favorites are always fixed at top via showFavoritesFirst.
 */
const removeFavoritesFromSorts = (sortsArray) => {
  if (!sortsArray || !Array.isArray(sortsArray)) {
    return [
      { field: 'year', order: 'desc' },
      { field: 'title', order: 'asc' },
    ];
  }
  return sortsArray.filter((s) => s.field !== 'is_favorite');
};

/**
 * Custom hook for managing sort state with localStorage persistence.
 *
 * @returns {Object} Sort state and handlers
 */
export const useSorting = () => {
  // Load default sorts from localStorage
  const [defaultSorts, setDefaultSorts] = useState(() => {
    const saved = localStorage.getItem('defaultSorts');
    if (saved) {
      try {
        const loadedSorts = JSON.parse(saved);
        return removeFavoritesFromSorts(loadedSorts);
      } catch (e) {
        console.error('Error parsing defaultSorts from localStorage:', e);
      }
    }
    return [
      { field: 'year', order: 'desc' },
      { field: 'title', order: 'asc' },
    ];
  });

  // Load current sorts from localStorage, fallback to defaultSorts
  const [sorts, setSorts] = useState(() => {
    const savedCurrent = localStorage.getItem('currentSorts');
    if (savedCurrent) {
      try {
        const loadedSorts = JSON.parse(savedCurrent);
        return removeFavoritesFromSorts(loadedSorts);
      } catch (e) {
        console.error('Error parsing currentSorts from localStorage:', e);
      }
    }
    const savedDefault = localStorage.getItem('defaultSorts');
    if (savedDefault) {
      try {
        const loadedSorts = JSON.parse(savedDefault);
        return removeFavoritesFromSorts(loadedSorts);
      } catch (e) {
        return removeFavoritesFromSorts(null);
      }
    }
    return removeFavoritesFromSorts(null);
  });

  // Show favorites first (always enabled)
  const [showFavoritesFirst, setShowFavoritesFirst] = useState(() => {
    const saved = localStorage.getItem('showFavoritesFirst');
    if (saved !== null) {
      return saved === 'true';
    }
    return true;
  });

  const [defaultShowFavoritesFirst, setDefaultShowFavoritesFirst] = useState(() => {
    const saved = localStorage.getItem('defaultShowFavoritesFirst');
    if (saved !== null) {
      return saved === 'true';
    }
    return true;
  });

  // Ref for immediate access to sorts (useful for async operations)
  const sortsRef = useRef(sorts);
  useEffect(() => {
    sortsRef.current = sorts;
  }, [sorts]);

  // Save defaultSorts to localStorage when they change
  useEffect(() => {
    const cleanedSorts = defaultSorts.filter((s) => s.field !== 'is_favorite');
    localStorage.setItem('defaultSorts', JSON.stringify(cleanedSorts));
  }, [defaultSorts]);

  // Save current sorts to localStorage when they change
  useEffect(() => {
    const cleanedSorts = sorts.filter((s) => s.field !== 'is_favorite');
    localStorage.setItem('currentSorts', JSON.stringify(cleanedSorts));
  }, [sorts]);

  // Always ensure showFavoritesFirst is true
  useEffect(() => {
    if (!showFavoritesFirst) {
      setShowFavoritesFirst(true);
    }
  }, [showFavoritesFirst]);

  // Save showFavoritesFirst to localStorage
  useEffect(() => {
    localStorage.setItem('showFavoritesFirst', showFavoritesFirst.toString());
  }, [showFavoritesFirst]);

  // Save defaultShowFavoritesFirst to localStorage
  useEffect(() => {
    localStorage.setItem('defaultShowFavoritesFirst', defaultShowFavoritesFirst.toString());
  }, [defaultShowFavoritesFirst]);

  // Handler for changing sorts
  const handleSortsChange = useCallback((newSorts) => {
    const cleanedSorts = newSorts.filter((s) => s.field !== 'is_favorite');
    setSorts(cleanedSorts);
    sortsRef.current = cleanedSorts;
  }, []);

  // Handler for setting default sorts
  const handleSetDefaultSorts = useCallback((newDefaultSorts) => {
    const cleanedSorts = (newDefaultSorts || []).filter((s) => s.field !== 'is_favorite');
    setDefaultSorts(cleanedSorts);
    setSorts(cleanedSorts);
    sortsRef.current = cleanedSorts;
  }, []);

  // Reset sorts to default
  const resetToDefaultSorts = useCallback(() => {
    setSorts([...defaultSorts]);
    sortsRef.current = [...defaultSorts];
  }, [defaultSorts]);

  return {
    sorts,
    setSorts: handleSortsChange,
    sortsRef,
    defaultSorts,
    setDefaultSorts: handleSetDefaultSorts,
    showFavoritesFirst,
    setShowFavoritesFirst,
    defaultShowFavoritesFirst,
    setDefaultShowFavoritesFirst,
    resetToDefaultSorts,
  };
};

export default useSorting;
