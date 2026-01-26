import React, { useState, useRef, useEffect } from 'react';
import './FilterBar.css';
import FilterTag from './FilterTag';
import SortDropdown from './SortDropdown';
import FilterDropdown from './FilterDropdown';
import FilterMenu from './FilterMenu';
import ColumnCustomizer from './ColumnCustomizer';
import { filterTypes } from './filterTypes';
import { calculateFixedDropdownPosition } from '../utils/dropdownPosition';

const FilterBar = ({
  sorts,
  filters,
  onSortsChange,
  onFiltersChange,
  stats,
  search,
  onSearchChange,
  defaultSorts,
  onSetDefaultSorts,
  showFavoritesFirst,
  onShowFavoritesFirstChange,
  defaultShowFavoritesFirst,
  onSetDefaultShowFavoritesFirst,
  viewMode,
  columnCustomizerOpen,
  onColumnCustomizerOpen,
  columnsExpanded,
  onColumnsChange,
  previousFilters,
  onRevertFilters,
  onResetFilters,
  onSavePreviousFilters,
  showConfirm,
  filteredCount,
}) => {
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [sortDropdownAlignRight, setSortDropdownAlignRight] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterMenuAlignRight, setFilterMenuAlignRight] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState(null);
  const [activeDropdownPosition, setActiveDropdownPosition] = useState(null);
  const [activeDropdownAlignRight, setActiveDropdownAlignRight] = useState(false);
  const [pendingFilterId, setPendingFilterId] = useState(null);
  const [presetsDropdownOpen, setPresetsDropdownOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [presets, setPresets] = useState(() => {
    const saved = localStorage.getItem('filterPresets');
    return saved ? JSON.parse(saved) : [];
  });
  const sortButtonRef = useRef(null);
  const filterMenuButtonRef = useRef(null);
  const filterMenuDropdownRef = useRef(null);
  const columnsButtonRef = useRef(null);
  const presetsButtonRef = useRef(null);
  const filterTagRefs = useRef({});
  const tagsContainerRef = useRef(null);
  const [endOfRowFilterIds, setEndOfRowFilterIds] = useState(new Set());

  // Detect which filter tags are at the end of rows
  useEffect(() => {
    const detectEndOfRowTags = () => {
      if (!tagsContainerRef.current || filters.length === 0) {
        setEndOfRowFilterIds(new Set());
        return;
      }

      // Get the parent container (filter-bar-content) to check against
      const container = tagsContainerRef.current.parentElement;
      if (!container) {
        setEndOfRowFilterIds(new Set());
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const endOfRowIds = new Set();
      const rowThreshold = 5; // pixels tolerance for same row detection

      // Group tags by their row (top position)
      const tagsByRow = [];
      filters.forEach((filter) => {
        const tagElement = filterTagRefs.current[filter.id];
        if (!tagElement) return;

        const tagRect = tagElement.getBoundingClientRect();
        const tagTop = tagRect.top;

        // Find which row this tag belongs to
        let rowIndex = tagsByRow.findIndex(
          (row) => Math.abs(row.top - tagTop) < rowThreshold
        );

        if (rowIndex === -1) {
          // New row
          rowIndex = tagsByRow.length;
          tagsByRow.push({
            top: tagTop,
            tags: [],
          });
        }

        tagsByRow[rowIndex].tags.push({
          id: filter.id,
          element: tagElement,
          rect: tagRect,
        });
      });

      // For each row, find the rightmost tag(s) - these are at the end of the row
      tagsByRow.forEach((row, rowIndex) => {
        if (row.tags.length === 0) return;

        // Sort tags by right position (rightmost first)
        const sortedTags = [...row.tags].sort((a, b) => b.rect.right - a.rect.right);
        const rightmostRight = sortedTags[0].rect.right;
        const containerRight = containerRect.right;
        const margin = 20; // Account for gap and some padding
        const xButtonWidth = 24; // approximate width of X button with margin (20px + 4px margin)

        // Find all tags that are at or near the right edge
        row.tags.forEach((tag) => {
          // Check if this tag is the rightmost in its row
          const isRightmost = Math.abs(tag.rect.right - rightmostRight) < 2;
          const isNearRightEdge = tag.rect.right >= containerRight - margin;

          if (isRightmost || isNearRightEdge) {
            // Check if adding the X button width would cause it to wrap
            // We add a small buffer to account for rounding and flexbox calculations
            const wouldWrap = tag.rect.right + xButtonWidth > containerRight - 5;

            // Mark as end-of-row if:
            // 1. It's the rightmost tag in the row, OR
            // 2. Adding the X button would cause it to wrap
            if (wouldWrap || isRightmost) {
              endOfRowIds.add(tag.id);
            }
          }
        });
      });

      setEndOfRowFilterIds(endOfRowIds);
    };

    // Initial detection with a small delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      detectEndOfRowTags();
    }, 0);

    // Re-detect on window resize
    const handleResize = () => {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        setTimeout(detectEndOfRowTags, 0);
      });
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver to detect layout changes
    let resizeObserver;
    if (tagsContainerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          setTimeout(detectEndOfRowTags, 0);
        });
      });
      resizeObserver.observe(tagsContainerRef.current);
      // Also observe the parent container
      if (tagsContainerRef.current.parentElement) {
        resizeObserver.observe(tagsContainerRef.current.parentElement);
      }
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [filters]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortButtonRef.current && !sortButtonRef.current.contains(event.target)) {
        setSortDropdownOpen(false);
      }
      if (filterMenuOpen) {
        const clickedInsideButton = filterMenuButtonRef.current?.contains(event.target);
        const clickedInsideDropdown = filterMenuDropdownRef.current?.contains(event.target);
        if (!clickedInsideButton && !clickedInsideDropdown) {
          setFilterMenuOpen(false);
        }
      }
      if (columnsButtonRef.current && !columnsButtonRef.current.contains(event.target)) {
        if (onColumnCustomizerOpen && columnCustomizerOpen) {
          onColumnCustomizerOpen();
        }
      }
      if (presetsButtonRef.current && !presetsButtonRef.current.contains(event.target)) {
        setPresetsDropdownOpen(false);
      }
      // Check if click is outside any filter tag
      const clickedInsideFilterTag = Object.values(filterTagRefs.current).some(
        (ref) => ref && ref.contains(event.target)
      );
      if (!clickedInsideFilterTag) {
        setActiveFilterId(null);
        setActiveDropdownPosition(null);
        setActiveDropdownAlignRight(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [columnCustomizerOpen, onColumnCustomizerOpen]);

  // Handle Escape key to close dropdowns
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (presetsDropdownOpen) {
          setPresetsDropdownOpen(false);
          setShowSavePresetInput(false);
          event.preventDefault();
        } else if (sortDropdownOpen) {
          setSortDropdownOpen(false);
          event.preventDefault();
        } else if (filterMenuOpen) {
          setFilterMenuOpen(false);
          event.preventDefault();
        } else if (activeFilterId) {
          setActiveFilterId(null);
          setActiveDropdownPosition(null);
          setActiveDropdownAlignRight(false);
          event.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [presetsDropdownOpen, sortDropdownOpen, filterMenuOpen, activeFilterId]);

  // Open dropdown for newly added filter
  useEffect(() => {
    if (pendingFilterId) {
      const filterElement = filterTagRefs.current[pendingFilterId];
      if (filterElement) {
        const rect = filterElement.getBoundingClientRect();
        const position = calculateFixedDropdownPosition(rect, 280);
        setActiveFilterId(pendingFilterId);
        setActiveDropdownPosition({
          top: position.top,
          bottom: position.bottom,
          left: position.left,
          right: position.right,
        });
        setActiveDropdownAlignRight(position.alignRight);
        setPendingFilterId(null);
      } else {
        // Retry after a short delay if element not found yet
        const timeoutId = setTimeout(() => {
          const filterElement = filterTagRefs.current[pendingFilterId];
          if (filterElement) {
            const rect = filterElement.getBoundingClientRect();
            const position = calculateFixedDropdownPosition(rect, 280);
            setActiveFilterId(pendingFilterId);
            setActiveDropdownPosition({
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              right: position.right,
            });
            setActiveDropdownAlignRight(position.alignRight);
            setPendingFilterId(null);
          }
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [filters, pendingFilterId]);

  const handleSortClick = () => {
    // Toggle dropdown - changes will be saved when closing via SortDropdown's saveAndClose
    const isOpening = !sortDropdownOpen;
    setSortDropdownOpen(isOpening);
    
    if (isOpening && sortButtonRef.current) {
      const rect = sortButtonRef.current.getBoundingClientRect();
      const position = calculateFixedDropdownPosition(rect, 320);
      setSortDropdownAlignRight(position.alignRight);
    }
    
    setFilterMenuOpen(false);
    setActiveFilterId(null);
  };

  const handleAddFilterClick = () => {
    const isOpening = !filterMenuOpen;
    setFilterMenuOpen(isOpening);
    
    if (isOpening && filterMenuButtonRef.current) {
      const rect = filterMenuButtonRef.current.getBoundingClientRect();
      const position = calculateFixedDropdownPosition(rect, 320);
      setFilterMenuAlignRight(position.alignRight);
    }
    
    setSortDropdownOpen(false);
    setActiveFilterId(null);
  };

  const handleColumnsClick = () => {
    if (onColumnCustomizerOpen) {
      onColumnCustomizerOpen();
    }
    setSortDropdownOpen(false);
    setFilterMenuOpen(false);
    setActiveFilterId(null);
  };

  const handleFilterTagClick = (filterId, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = calculateFixedDropdownPosition(rect, 280);
    setActiveFilterId(filterId);
    setActiveDropdownPosition({
      top: position.top,
      bottom: position.bottom,
      left: position.left,
      right: position.right,
    });
    setActiveDropdownAlignRight(position.alignRight);
    setSortDropdownOpen(false);
    setFilterMenuOpen(false);
  };

  const handleFilterRemove = (filterId) => {
    onFiltersChange(filters.filter((f) => f.id !== filterId));
  };

  const handleFilterUpdate = (filterId, config) => {
    onFiltersChange(filters.map((f) => (f.id === filterId ? { ...f, config } : f)));
    setActiveFilterId(null);
    setActiveDropdownPosition(null);
  };

  const handleAddFilter = (filterType) => {
    const newFilter = {
      id: `${filterType.field}-${Date.now()}`,
      type: filterType.field,
      config: { ...filterType.defaultConfig },
    };
    const updatedFilters = [...filters, newFilter];
    onFiltersChange(updatedFilters);
    setFilterMenuOpen(false);

    // Set pending filter ID to trigger dropdown opening in useEffect
    setPendingFilterId(newFilter.id);
  };

  const handleCreateOrGroup = (filterOrGroup) => {
    // If it's already an OR group, add it directly
    if (filterOrGroup.type === 'or_group') {
      const updatedFilters = [...filters, filterOrGroup];
      onFiltersChange(updatedFilters);
      setFilterMenuOpen(false);
      return;
    }

    // Otherwise, treat it as a regular filter
    handleAddFilter(filterOrGroup);
  };

  const handleSortsUpdate = (newSorts) => {
    // Only update if sorts actually changed
    if (JSON.stringify(newSorts) !== JSON.stringify(sorts)) {
      onSortsChange(newSorts);
    }
    setSortDropdownOpen(false);
  };

  const handleReset = () => {
    // Reset to default state (default sorts)
    onSortsChange(defaultSorts || []);
    onFiltersChange([]);
    if (onSearchChange) {
      onSearchChange('');
    }
    // Reset show favorites first to default value
    if (onShowFavoritesFirstChange) {
      onShowFavoritesFirstChange(defaultShowFavoritesFirst ?? true);
    }
    // Clear previous filters to disable revert button
    if (onResetFilters) {
      onResetFilters();
    }
    setSortDropdownOpen(false);
    setFilterMenuOpen(false);
    setActiveFilterId(null);
  };

  // Get active filter types to exclude from menu
  const activeFilterTypes = new Set(filters.map((f) => f.type));

  // Get filter type for a filter
  const getFilterType = (filterTypeKey) => {
    return filterTypes[filterTypeKey];
  };

  // Filter presets functions
  const savePreset = () => {
    if (!presetName.trim()) return;

    const preset = {
      id: editingPresetId || `preset-${Date.now()}`,
      name: presetName.trim(),
      filters: JSON.parse(JSON.stringify(filters)),
      sorts: JSON.parse(JSON.stringify(sorts)),
      search: search || '',
      showFavoritesFirst: showFavoritesFirst,
      createdAt: editingPresetId
        ? presets.find((p) => p.id === editingPresetId)?.createdAt
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let updatedPresets;
    if (editingPresetId) {
      updatedPresets = presets.map((p) => (p.id === editingPresetId ? preset : p));
    } else {
      updatedPresets = [...presets, preset];
    }

    setPresets(updatedPresets);
    localStorage.setItem('filterPresets', JSON.stringify(updatedPresets));
    setPresetName('');
    setShowSavePresetInput(false);
    setEditingPresetId(null);
    setPresetsDropdownOpen(false);
  };

  const loadPreset = (preset) => {
    // Save current filters before loading preset to enable revert
    if (onSavePreviousFilters) {
      onSavePreviousFilters(filters ? [...filters] : []);
    }
    onFiltersChange(preset.filters || []);
    onSortsChange(preset.sorts || []);
    if (onSearchChange) {
      onSearchChange(preset.search || '');
    }
    if (onShowFavoritesFirstChange) {
      onShowFavoritesFirstChange(
        preset.showFavoritesFirst !== undefined ? preset.showFavoritesFirst : true
      );
    }
    setPresetsDropdownOpen(false);
  };

  const deletePreset = (presetId) => {
    const updatedPresets = presets.filter((p) => p.id !== presetId);
    setPresets(updatedPresets);
    localStorage.setItem('filterPresets', JSON.stringify(updatedPresets));
  };

  const startEditPreset = (preset) => {
    setPresetName(preset.name);
    setEditingPresetId(preset.id);
    setShowSavePresetInput(true);
  };

  const cancelSavePreset = () => {
    setPresetName('');
    setShowSavePresetInput(false);
    setEditingPresetId(null);
  };

  // Check if filter has active values
  const hasActiveValues = (filter) => {
    const filterType = getFilterType(filter.type);
    if (!filterType) return false;

    // OR groups are always considered active if they have filters
    if (filter.type === 'or_group') {
      return filter.config.filters && filter.config.filters.length > 0;
    }

    const config = filter.config || filterType.defaultConfig;

    if (filterType.type === 'text') {
      return config.value && config.value.trim() !== '';
    }
    if (filterType.type === 'boolean') {
      // For collection and favorites filters, value can be null (all), true, or false
      // Only consider it active if it's not null
      if (filterType.field === 'collection' || filterType.field === 'favorites_only') {
        return config.value !== null && config.value !== undefined;
      }
      // For seen_before and other boolean filters, both true and false are active states
      // Only null/undefined means inactive (showing all)
      return config.value !== null && config.value !== undefined;
    }
    if (filterType.type === 'numeric_range') {
      if (config.operator === 'between') {
        return (
          (config.min !== null && config.min !== undefined) ||
          (config.max !== null && config.max !== undefined)
        );
      }
      return config.value !== null && config.value !== undefined;
    }
    if (filterType.type === 'multiselect') {
      return config.values && config.values.length > 0;
    }
    if (filterType.type === 'streaming_service') {
      return config.values && config.values.length > 0;
    }
    if (filterType.type === 'availability') {
      return config.values && config.values.length > 0;
    }
    return false;
  };

  const activeFilter = filters.find((f) => f.id === activeFilterId);
  const activeFilterType = activeFilter ? getFilterType(activeFilter.type) : null;

  return (
    <div className="filter-bar">
      <div className="filter-bar-content">
        {/* Sort Button */}
        <div className="filter-bar-sort" ref={sortButtonRef}>
          <button
            className="filter-bar-button filter-bar-sort-button"
            onClick={handleSortClick}
            type="button"
          >
            <svg
              className="filter-bar-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6L8 2L12 6M4 10L8 14L12 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Sort</span>
          </button>
          {sortDropdownOpen && (
            <div className={`filter-bar-dropdown-container ${sortDropdownAlignRight ? 'align-right' : ''}`}>
              <SortDropdown
                sorts={sorts || []}
                onUpdate={handleSortsUpdate}
                onClose={() => {
                  setSortDropdownOpen(false);
                  setSortDropdownAlignRight(false);
                }}
                defaultSorts={defaultSorts}
                onSetDefaultSorts={onSetDefaultSorts}
                showFavoritesFirst={showFavoritesFirst}
                onShowFavoritesFirstChange={onShowFavoritesFirstChange}
                defaultShowFavoritesFirst={defaultShowFavoritesFirst}
                onSetDefaultShowFavoritesFirst={onSetDefaultShowFavoritesFirst}
                alignRight={sortDropdownAlignRight}
              />
            </div>
          )}
        </div>

        {/* Filter Tags */}
        <div className="filter-bar-tags-container" ref={tagsContainerRef}>
          {filters.map((filter) => {
            const filterType = getFilterType(filter.type);
            if (!filterType) return null;

            return (
              <div
                key={filter.id}
                className="filter-bar-tag-wrapper"
                ref={(el) => (filterTagRefs.current[filter.id] = el)}
              >
                <FilterTag
                  filter={filter}
                  filterType={filterType}
                  onClick={(e) => handleFilterTagClick(filter.id, e)}
                  onRemove={() => handleFilterRemove(filter.id)}
                  isActive={activeFilterId === filter.id}
                  hasActiveValues={hasActiveValues(filter)}
                  hasMultipleFilters={filters.length > 1}
                  isEndOfRow={endOfRowFilterIds.has(filter.id)}
                />
                {activeFilterId === filter.id && activeDropdownPosition && (
                  <div
                    className={`filter-bar-dropdown-container ${activeDropdownAlignRight ? 'align-right' : ''}`}
                    style={{
                      position: 'fixed',
                      top: activeDropdownPosition.top,
                      bottom: activeDropdownPosition.bottom,
                      left: activeDropdownPosition.left,
                      right: activeDropdownPosition.right,
                    }}
                  >
                    <FilterDropdown
                      filter={filter}
                      filterType={activeFilterType}
                      onUpdate={(config) => handleFilterUpdate(filter.id, config)}
                      onRemoveFilter={handleFilterRemove}
                      onClose={() => {
                        setActiveFilterId(null);
                        setActiveDropdownPosition(null);
                        setActiveDropdownAlignRight(false);
                      }}
                      allFilters={filters}
                      alignRight={activeDropdownAlignRight}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Revert Filters Button */}
        {previousFilters !== null && previousFilters !== undefined && onRevertFilters && (
          <button
            className="filter-bar-button filter-bar-revert-button"
            onClick={onRevertFilters}
            type="button"
            title="Revert to previous filters"
          >
            <svg
              className="filter-bar-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1.5 8C1.5 4.41 4.41 1.5 8 1.5C10.49 1.5 12.65 2.93 13.71 5M14.5 8C14.5 11.59 11.59 14.5 8 14.5C5.51 14.5 3.35 13.07 2.29 11M2.29 11L1 13.5L3.5 14.79M13.71 5L15 2.5L12.5 1.21"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Revert Filters</span>
          </button>
        )}

        {/* Add Filter Button */}
        <div className="filter-bar-add-filter" ref={filterMenuButtonRef}>
          <button className="filter-bar-add-button" onClick={handleAddFilterClick} type="button">
            + Filter
          </button>
          {filterMenuOpen && (
            <div
              ref={filterMenuDropdownRef}
              className={`filter-bar-dropdown-container ${filterMenuAlignRight ? 'align-right' : ''}`}
            >
              <FilterMenu
                availableFilters={Object.values(filterTypes).filter(
                  (ft) =>
                    ft.field !== 'favorited_directors_only' && // Hide separate filter, now integrated into director filter
                    !activeFilterTypes.has(ft.field) &&
                    ft.field !== 'search' &&
                    ft.field !== 'or_group'
                )}
                onSelectFilter={handleAddFilter}
                onCreateOrGroup={handleCreateOrGroup}
                onClose={() => {
                  setFilterMenuOpen(false);
                  setFilterMenuAlignRight(false);
                }}
                existingFilters={filters}
                alignRight={filterMenuAlignRight}
              />
            </div>
          )}
        </div>

        {/* Right side actions: Reset Button and Columns Button */}
        <div className="filter-bar-right-actions">
          {/* Filtered Count - only show if different from total */}
          {filteredCount !== undefined &&
            filteredCount !== null &&
            stats &&
            stats.total_movies !== undefined &&
            filteredCount !== stats.total_movies && (
              <div className="filter-bar-count">
                <span className="filter-bar-count-text">
                  {filteredCount} {filteredCount === 1 ? 'movie' : 'movies'}
                </span>
              </div>
            )}

          {/* Reset Button - appears just to the left of columns button when active */}
          {((defaultSorts && JSON.stringify(sorts) !== JSON.stringify(defaultSorts)) ||
            (!defaultSorts && sorts.length > 0) ||
            filters.length > 0 ||
            (search && search.trim() !== '')) && (
            <button className="filter-bar-reset" onClick={handleReset} type="button">
              Reset All Filters
            </button>
          )}

          {/* Filter Presets */}
          <div className="filter-bar-presets" ref={presetsButtonRef}>
            <button
              className="filter-bar-button filter-bar-presets-button"
              onClick={() => {
                setPresetsDropdownOpen(!presetsDropdownOpen);
                setSortDropdownOpen(false);
                setFilterMenuOpen(false);
                setActiveFilterId(null);
              }}
              type="button"
              title="Filter Presets"
            >
              <svg
                className="filter-bar-icon"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 2L2 6V14L8 10L14 14V6L8 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Filter Presets</span>
            </button>
            {presetsDropdownOpen && (
              <div className="filter-bar-dropdown-container filter-bar-presets-dropdown">
                <div className="filter-presets-header">
                  <h3>Filter Presets</h3>
                  <button
                    className="filter-presets-close"
                    onClick={() => setPresetsDropdownOpen(false)}
                    type="button"
                  >
                    ×
                  </button>
                </div>

                {showSavePresetInput ? (
                  <div className="filter-presets-save">
                    <input
                      type="text"
                      placeholder="Preset name"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          savePreset();
                        } else if (e.key === 'Escape') {
                          cancelSavePreset();
                        }
                      }}
                      autoFocus
                      className="filter-presets-input"
                    />
                    <div className="filter-presets-save-actions">
                      <button
                        className="filter-presets-save-btn"
                        onClick={savePreset}
                        disabled={!presetName.trim()}
                        type="button"
                      >
                        {editingPresetId ? 'Update' : 'Save'}
                      </button>
                      <button
                        className="filter-presets-cancel-btn"
                        onClick={cancelSavePreset}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="filter-presets-new"
                    onClick={() => {
                      setShowSavePresetInput(true);
                      setPresetName('');
                      setEditingPresetId(null);
                    }}
                    type="button"
                  >
                    + Save Current Filters
                  </button>
                )}

                {presets.length > 0 && (
                  <div className="filter-presets-list">
                    {presets.map((preset) => (
                      <div key={preset.id} className="filter-preset-item">
                        <button
                          className="filter-preset-load"
                          onClick={() => loadPreset(preset)}
                          type="button"
                        >
                          {preset.name}
                        </button>
                        <div className="filter-preset-actions">
                          <button
                            className="filter-preset-action"
                            onClick={() => startEditPreset(preset)}
                            title="Rename"
                            type="button"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M11.3333 2.00001C11.5084 1.8249 11.7163 1.68601 11.9447 1.5913C12.1731 1.49659 12.4173 1.44824 12.6667 1.44824C12.916 1.44824 13.1602 1.49659 13.3886 1.5913C13.617 1.68601 13.8249 1.8249 14 2.00001C14.1751 2.17512 14.314 2.38307 14.4087 2.61143C14.5034 2.83979 14.5518 3.08401 14.5518 3.33334C14.5518 3.58268 14.5034 3.8269 14.4087 4.05526C14.314 4.28362 14.1751 4.49157 14 4.66668L5.00001 13.6667L1.33334 14.6667L2.33334 11L11.3333 2.00001Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            className="filter-preset-action"
                            onClick={async () => {
                              if (showConfirm) {
                                const confirmed = await showConfirm(
                                  `Delete preset "${preset.name}"?`,
                                  'Delete Preset'
                                );
                                if (confirmed) {
                                  deletePreset(preset.id);
                                }
                              } else {
                                // Fallback for when showConfirm is not provided
                                if (window.confirm(`Delete preset "${preset.name}"?`)) {
                                  deletePreset(preset.id);
                                }
                              }
                            }}
                            title="Delete"
                            type="button"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M2 4H14M12.6667 4V13.3333C12.6667 13.687 12.5262 14.0261 12.2761 14.2761C12.0261 14.5262 11.687 14.6667 11.3333 14.6667H4.66667C4.31305 14.6667 3.97391 14.5262 3.72386 14.2761C3.47381 14.0261 3.33333 13.687 3.33333 13.3333V4M5.33333 4V2.66667C5.33333 2.31305 5.47381 1.97391 5.72386 1.72386C5.97391 1.47381 6.31305 1.33333 6.66667 1.33333H9.33333C9.68696 1.33333 10.0261 1.47381 10.2761 1.72386C10.5262 1.97391 10.6667 2.31305 10.6667 2.66667V4M6.66667 7.33333V11.3333M9.33333 7.33333V11.3333"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {presets.length === 0 && !showSavePresetInput && (
                  <div className="filter-presets-empty">
                    No presets saved. Save your current filters to create one.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column Customizer Button - only show in list views, positioned on the right */}
          {viewMode === 'expanded' && (
            <div className="filter-bar-columns-wrapper" ref={columnsButtonRef}>
              <button
                className="filter-bar-button filter-bar-columns-button"
                onClick={handleColumnsClick}
                type="button"
                title="Customize Columns"
              >
                <svg
                  className="filter-bar-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Table/columns icon */}
                  <rect
                    x="1"
                    y="2"
                    width="14"
                    height="12"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <line x1="5" y1="2" x2="5" y2="14" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="13" y1="2" x2="13" y2="14" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span>Columns</span>
              </button>
              {columnCustomizerOpen && (
                <div className="filter-bar-dropdown-container filter-bar-columns-dropdown">
                  <ColumnCustomizer
                    viewMode={viewMode}
                    columns={columnsExpanded}
                    onColumnsChange={onColumnsChange}
                    onClose={handleColumnsClick}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilterBar;
