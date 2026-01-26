import { useState, useEffect, useCallback, useRef } from 'react';
import { filterTypes } from '../components/filterTypes';

/**
 * Custom hook for managing filter state with localStorage persistence.
 *
 * @returns {Object} Filter state and handlers
 */
export const useFilters = () => {
  // Current filters
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('currentFilters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing currentFilters from localStorage:', e);
      }
    }
    return [];
  });

  // Previous filters for reverting after tracked list filter
  const [previousFilters, setPreviousFilters] = useState(null);

  // Search query
  const [search, setSearch] = useState(() => {
    const saved = localStorage.getItem('currentSearch');
    return saved || '';
  });

  // Default filters
  const [defaultFilters, setDefaultFilters] = useState(() => {
    const saved = localStorage.getItem('defaultFilters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Ref for immediate access to filters (useful for async operations)
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem('currentFilters', JSON.stringify(filters));
  }, [filters]);

  // Save search to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('currentSearch', search);
  }, [search]);

  // Save defaultFilters to localStorage when they change
  useEffect(() => {
    localStorage.setItem('defaultFilters', JSON.stringify(defaultFilters));
  }, [defaultFilters]);

  // Handler for changing filters
  const handleFiltersChange = useCallback((newFilters) => {
    setFilters(newFilters);
    filtersRef.current = newFilters;
  }, []);

  // Handler for applying a tracked list filter
  const handleFilterByTrackedList = useCallback(
    (columnName) => {
      // Save current filters so user can revert
      setPreviousFilters(filters.length > 0 ? JSON.parse(JSON.stringify(filters)) : []);

      // Get the filter type for this tracked list
      const filterType = filterTypes[columnName];
      if (!filterType) {
        console.error(`Filter type not found for column: ${columnName}`);
        return;
      }

      // Create a new filter for this tracked list
      const newFilter = {
        id: `${columnName}-${Date.now()}`,
        type: columnName,
        config: { value: true },
      };

      const newFilters = [newFilter];
      setFilters(newFilters);
      filtersRef.current = newFilters;
    },
    [filters]
  );

  // Handler for reverting filters after tracked list filter
  const handleRevertFilters = useCallback(() => {
    if (previousFilters !== null) {
      setFilters(previousFilters);
      filtersRef.current = previousFilters;
      setPreviousFilters(null);
    }
  }, [previousFilters]);

  // Reset filters to default
  const resetToDefaultFilters = useCallback(() => {
    setFilters([...defaultFilters]);
    filtersRef.current = [...defaultFilters];
    setSearch('');
  }, [defaultFilters]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters([]);
    filtersRef.current = [];
    setSearch('');
    setPreviousFilters(null);
  }, []);

  return {
    filters,
    setFilters: handleFiltersChange,
    filtersRef,
    previousFilters,
    setPreviousFilters,
    search,
    setSearch,
    defaultFilters,
    setDefaultFilters,
    handleFilterByTrackedList,
    handleRevertFilters,
    resetToDefaultFilters,
    clearFilters,
  };
};

export default useFilters;
