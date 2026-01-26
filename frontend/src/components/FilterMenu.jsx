import React, { useState, useRef, useEffect } from 'react';
import './FilterMenu.css';
import { filterTypes } from './filterTypes';
import { calculateFixedDropdownPosition } from '../utils/dropdownPosition';

const FilterMenu = ({
  availableFilters,
  onSelectFilter,
  onClose,
  onCreateOrGroup,
  existingFilters = [],
  alignRight = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showOrGroupBuilder, setShowOrGroupBuilder] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const [submenuPositions, setSubmenuPositions] = useState({});
  const [submenuDirections, setSubmenuDirections] = useState({});
  const menuRef = useRef(null);
  const submenuHeaderRefs = useRef({});

  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;
      const isInsideMenu = menuRef.current && menuRef.current.contains(target);
      const isInsideSubmenu = target.closest('.filter-menu-submenu-items');

      if (!isInsideMenu && !isInsideSubmenu) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle Escape key to close menu
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Calculate submenu direction for arrow display
  const calculateSubmenuDirection = (submenuKey) => {
    const headerRef = submenuHeaderRefs.current[submenuKey];
    if (headerRef) {
      const rect = headerRef.getBoundingClientRect();
      const submenuWidth = 280;
      const spacing = 4;
      const viewportWidth = window.innerWidth;
      const wouldOverflowRight = rect.right + spacing + submenuWidth > viewportWidth;
      const wouldOverflowLeft = rect.left - spacing - submenuWidth < 0;
      return wouldOverflowRight && !wouldOverflowLeft;
    }
    return false; // Default to right
  };

  // Update all submenu directions
  const updateAllSubmenuDirections = () => {
    const directions = {};
    ['cast-and-crew', 'popularity-ratings-lists', 'miscellaneous'].forEach((key) => {
      directions[key] = calculateSubmenuDirection(key);
    });
    setSubmenuDirections(directions);
  };

  // Calculate submenu positions when they open
  const updateSubmenuPosition = (submenuKey) => {
    const headerRef = submenuHeaderRefs.current[submenuKey];
    if (headerRef) {
      const rect = headerRef.getBoundingClientRect();
      // Submenu width is typically 240-280px, use 280px for calculation
      const submenuWidth = 280;
      const spacing = 4;

      // Calculate if submenu should open to the left or right
      const viewportWidth = window.innerWidth;
      const wouldOverflowRight = rect.right + spacing + submenuWidth > viewportWidth;
      const wouldOverflowLeft = rect.left - spacing - submenuWidth < 0;

      // Open to the left if it would overflow on the right and there's space on the left
      const openToLeft = wouldOverflowRight && !wouldOverflowLeft;

      let left, right;
      if (openToLeft) {
        // Align submenu's right edge to trigger's left edge
        right = viewportWidth - rect.left + spacing;
        left = null;
      } else {
        // Default: align submenu's left edge to trigger's right edge
        left = rect.right + spacing;
        right = null;
      }

      setSubmenuPositions({
        [submenuKey]: {
          top: rect.top,
          left,
          right,
          openToLeft,
        },
      });
    }
  };

  // Update submenu directions when menu opens or on scroll/resize
  useEffect(() => {
    // Calculate directions when component mounts or when refs are available
    // Use requestAnimationFrame to ensure DOM is ready
    const updateDirections = () => {
      if (submenuHeaderRefs.current['cast-and-crew'] || submenuHeaderRefs.current['popularity-ratings-lists'] || submenuHeaderRefs.current['miscellaneous']) {
        updateAllSubmenuDirections();
      }
    };

    // Try immediately and also after a short delay to catch refs that aren't ready yet
    updateDirections();
    const timer1 = setTimeout(updateDirections, 0);
    const timer2 = setTimeout(updateDirections, 50);

    const handleScroll = () => {
      updateAllSubmenuDirections();
      if (openSubmenu) {
        updateSubmenuPosition(openSubmenu);
      }
    };

    const handleResize = () => {
      updateAllSubmenuDirections();
      if (openSubmenu) {
        updateSubmenuPosition(openSubmenu);
      }
    };

    // Listen to scroll events on window and all scrollable containers
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [openSubmenu]);

  // Handle opening a submenu (closes others)
  const handleOpenSubmenu = (submenuKey) => {
    setOpenSubmenu(submenuKey);
    updateSubmenuPosition(submenuKey);
  };

  // Organize filters into categories
  // Permanent filters in main dropdown: favorites_only, runtime, genre, director, original_language, country, availability, streaming_service, seen_before
  const permanentFilterFields = [
    'favorites_only',
    'runtime',
    'genre',
    'director',
    'original_language',
    'country',
    'availability',
    'streaming_service',
    'seen_before',
  ];
  const castAndCrewFields = ['actor', 'writer', 'producer', 'production_company'];
  const popularityRatingsListsFields = [];
  const miscellaneousFields = ['year', 'date_added', 'collection'];

  // Separate filters into categories
  const permanentFilters = availableFilters
    .filter((filter) => permanentFilterFields.includes(filter.field))
    .sort((a, b) => {
      const indexA = permanentFilterFields.indexOf(a.field);
      const indexB = permanentFilterFields.indexOf(b.field);
      return indexA - indexB;
    });

  const castAndCrewFilters = availableFilters.filter((filter) =>
    castAndCrewFields.includes(filter.field)
  );

  const popularityRatingsListsFilters = availableFilters.filter(
    (filter) =>
      popularityRatingsListsFields.includes(filter.field) ||
      (filter.field && filter.field.startsWith('is_'))
  );

  const miscellaneousFilters = availableFilters
    .filter((filter) => miscellaneousFields.includes(filter.field))
    .sort((a, b) => {
      const indexA = miscellaneousFields.indexOf(a.field);
      const indexB = miscellaneousFields.indexOf(b.field);
      return indexA - indexB;
    });

  const filteredFilters = availableFilters.filter((filter) =>
    filter.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to filter categories by search query
  const filterCategory = (filters) => {
    if (!searchQuery) return filters;
    return filters.filter((filter) =>
      filter.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // When searching, flatten all filters into a single list
  const hasSearchQuery = searchQuery.trim().length > 0;

  // Close submenus when searching
  useEffect(() => {
    if (hasSearchQuery) {
      setOpenSubmenu(null);
      setSubmenuPositions({});
    }
  }, [hasSearchQuery]);

  const getFilterIcon = (filterType, field) => {
    // Special cases for specific fields
    if (field === 'search' || field === 'title') {
      // "Aa" icon for text/search
      return <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Aa</span>;
    }

    if (
      field === 'runtime' ||
      field === 'year'
    ) {
      // "#" icon for numeric fields
      return <span style={{ fontSize: '14px', fontWeight: 'bold' }}>#</span>;
    }

    switch (filterType) {
      case 'text':
        return <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Aa</span>;
      case 'numeric_range':
        return <span style={{ fontSize: '14px', fontWeight: 'bold' }}>#</span>;
      case 'multiselect':
        // Circular icon with triangle (dropdown)
        return (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M6 6L8 8L10 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="currentColor"
            />
          </svg>
        );
      case 'boolean':
        // Checkbox icon
        return (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="2"
              y="2"
              width="12"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M5 8L7 10L11 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'streaming_service':
        // Use same icon as multiselect
        return (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M6 6L8 8L10 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="currentColor"
            />
          </svg>
        );
      case 'availability':
        // Play/streaming icon
        return (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 4L12 8L6 12V4Z"
              fill="currentColor"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  // Get list filters for OR groups
  const listFilters = Object.values(filterTypes).filter(
    (ft) => ft.field && ft.field.startsWith('is_')
  );

  // Get active filter fields to exclude
  const activeFilterFields = new Set(
    existingFilters.filter((f) => f.type !== 'or_group').map((f) => f.type)
  );

  const availableListFilters = listFilters.filter(
    (filter) => !activeFilterFields.has(filter.field)
  );

  const handleToggleFilter = (filter) => {
    setSelectedFilters((prev) => {
      const isSelected = prev.some((f) => f.field === filter.field);
      if (isSelected) {
        return prev.filter((f) => f.field !== filter.field);
      } else {
        return [
          ...prev,
          {
            id: `${filter.field}-${Date.now()}`,
            type: filter.field,
            field: filter.field,
            config: { ...filter.defaultConfig, value: true },
          },
        ];
      }
    });
  };

  const handleCreateOrGroup = () => {
    if (selectedFilters.length === 0) {
      return;
    }

    if (selectedFilters.length === 1) {
      // Single filter - add as regular filter
      if (onCreateOrGroup) {
        onCreateOrGroup(selectedFilters[0]);
      } else {
        onSelectFilter(selectedFilters[0]);
      }
      onClose();
      return;
    }

    // Create OR group
    const orGroup = {
      id: `or-group-${Date.now()}`,
      type: 'or_group',
      config: {
        filters: selectedFilters,
      },
    };

    if (onCreateOrGroup) {
      onCreateOrGroup(orGroup);
    } else {
      onSelectFilter(orGroup);
    }
    onClose();
  };

  if (showOrGroupBuilder) {
    const filteredListFilters = availableListFilters.filter((filter) =>
      filter.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className={`filter-menu ${alignRight ? 'align-right' : ''}`} ref={menuRef}>
        <div className="filter-menu-header">
          <button
            className="filter-menu-back"
            onClick={() => {
              setShowOrGroupBuilder(false);
              setSelectedFilters([]);
              setSearchQuery('');
            }}
            type="button"
          >
            ← Back
          </button>
          <h3 className="filter-menu-title">Create OR Group</h3>
        </div>
        <div className="filter-menu-search">
          <input
            type="text"
            placeholder="Search filters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="filter-menu-input"
            autoFocus
          />
        </div>
        {selectedFilters.length > 0 && (
          <div className="filter-menu-selected">
            <div className="filter-menu-selected-label">
              Selected:{' '}
              {selectedFilters.map((f) => filterTypes[f.type]?.label || f.type).join(' OR ')}
            </div>
          </div>
        )}
        <div className="filter-menu-list">
          {filteredListFilters.length === 0 ? (
            <div className="filter-menu-empty">No filters available</div>
          ) : (
            filteredListFilters.map((filter) => {
              const isSelected = selectedFilters.some((f) => f.field === filter.field);
              return (
                <button
                  key={filter.field}
                  className={`filter-menu-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleFilter(filter)}
                  type="button"
                >
                  <span className="filter-menu-checkbox">{isSelected ? '✓' : ''}</span>
                  <span className="filter-menu-icon">
                    {getFilterIcon(filter.type, filter.field)}
                  </span>
                  <span className="filter-menu-label">{filter.label}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="filter-menu-actions">
          <button
            className="filter-menu-create"
            onClick={handleCreateOrGroup}
            type="button"
            disabled={selectedFilters.length === 0}
          >
            {selectedFilters.length === 1 ? 'Add Filter' : 'Create OR Group'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`filter-menu ${alignRight ? 'align-right' : ''}`} ref={menuRef}>
      <div className="filter-menu-search">
        <input
          type="text"
          placeholder="Filter by..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="filter-menu-input"
          autoFocus
        />
      </div>
      <div className="filter-menu-list">
        {hasSearchQuery ? (
          /* Search Results - Flat List */
          filteredFilters.length === 0 ? (
            <div className="filter-menu-empty">No filters available</div>
          ) : (
            filteredFilters.map((filter) => (
              <button
                key={filter.field}
                className="filter-menu-item"
                onClick={() => {
                  onSelectFilter(filter);
                  onClose();
                }}
                type="button"
              >
                <span className="filter-menu-icon">{getFilterIcon(filter.type, filter.field)}</span>
                <span className="filter-menu-label">{filter.label}</span>
              </button>
            ))
          )
        ) : (
          <>
            {/* Create OR Group Button */}
            <button
              className="filter-menu-item"
              onClick={() => setShowOrGroupBuilder(true)}
              type="button"
            >
              <span className="filter-menu-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 2L10 6L14 7L10 8L8 12L6 8L2 7L6 6L8 2Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="filter-menu-label">Create OR Group</span>
            </button>
            <div className="filter-menu-separator"></div>
            {/* Permanent Filters */}
            {filterCategory(permanentFilters).length > 0 && (
              <div className="filter-menu-category">
                {filterCategory(permanentFilters).map((filter) => (
                  <button
                    key={filter.field}
                    className="filter-menu-item"
                    onClick={() => {
                      onSelectFilter(filter);
                      onClose();
                    }}
                    type="button"
                  >
                    <span className="filter-menu-icon">
                      {getFilterIcon(filter.type, filter.field)}
                    </span>
                    <span className="filter-menu-label">{filter.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Cast and Crew Submenu */}
            {filterCategory(castAndCrewFilters).length > 0 && (
              <div
                className={`filter-menu-submenu ${openSubmenu === 'cast-and-crew' ? 'open' : ''}`}
                onMouseEnter={() => handleOpenSubmenu('cast-and-crew')}
              >
                <button
                  ref={(el) => {
                    submenuHeaderRefs.current['cast-and-crew'] = el;
                  }}
                  className="filter-menu-submenu-header"
                  onClick={() => handleOpenSubmenu('cast-and-crew')}
                  type="button"
                >
                  <span className="filter-menu-submenu-title">Cast and Crew</span>
                  <span className="filter-menu-submenu-arrow">
                    {(submenuPositions['cast-and-crew']?.openToLeft ?? submenuDirections['cast-and-crew'] ?? false) ? '◀' : '▶'}
                  </span>
                </button>
                {openSubmenu === 'cast-and-crew' && submenuPositions['cast-and-crew'] && (
                  <div
                    className={`filter-menu-submenu-items ${submenuPositions['cast-and-crew']?.openToLeft ? 'align-left' : ''}`}
                    style={{
                      position: 'fixed',
                      top: submenuPositions['cast-and-crew']?.top || 0,
                      left: submenuPositions['cast-and-crew']?.left || null,
                      right: submenuPositions['cast-and-crew']?.right || null,
                      zIndex: 1001,
                    }}
                    onMouseEnter={() => setOpenSubmenu('cast-and-crew')}
                  >
                    {filterCategory(castAndCrewFilters).map((filter) => (
                      <button
                        key={filter.field}
                        className="filter-menu-item filter-menu-submenu-item"
                        onClick={() => {
                          onSelectFilter(filter);
                          onClose();
                        }}
                        type="button"
                      >
                        <span className="filter-menu-icon">
                          {getFilterIcon(filter.type, filter.field)}
                        </span>
                        <span className="filter-menu-label">{filter.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Popularity, Ratings, and Lists Submenu */}
            {filterCategory(popularityRatingsListsFilters).length > 0 && (
              <div
                className={`filter-menu-submenu ${openSubmenu === 'popularity-ratings-lists' ? 'open' : ''}`}
                onMouseEnter={() => handleOpenSubmenu('popularity-ratings-lists')}
              >
                <button
                  ref={(el) => {
                    submenuHeaderRefs.current['popularity-ratings-lists'] = el;
                  }}
                  className="filter-menu-submenu-header"
                  onClick={() => handleOpenSubmenu('popularity-ratings-lists')}
                  type="button"
                >
                  <span className="filter-menu-submenu-title">Popularity, Ratings, and Lists</span>
                  <span className="filter-menu-submenu-arrow">
                    {(submenuPositions['popularity-ratings-lists']?.openToLeft ?? submenuDirections['popularity-ratings-lists'] ?? false) ? '◀' : '▶'}
                  </span>
                </button>
                {openSubmenu === 'popularity-ratings-lists' &&
                  submenuPositions['popularity-ratings-lists'] && (
                    <div
                      className={`filter-menu-submenu-items ${submenuPositions['popularity-ratings-lists']?.openToLeft ? 'align-left' : ''}`}
                      style={{
                        position: 'fixed',
                        top: submenuPositions['popularity-ratings-lists']?.top || 0,
                        left: submenuPositions['popularity-ratings-lists']?.left || null,
                        right: submenuPositions['popularity-ratings-lists']?.right || null,
                        zIndex: 1001,
                      }}
                      onMouseEnter={() => setOpenSubmenu('popularity-ratings-lists')}
                    >
                      {filterCategory(popularityRatingsListsFilters).map((filter) => (
                        <button
                          key={filter.field}
                          className="filter-menu-item filter-menu-submenu-item"
                          onClick={() => {
                            onSelectFilter(filter);
                            onClose();
                          }}
                          type="button"
                        >
                          <span className="filter-menu-icon">
                            {getFilterIcon(filter.type, filter.field)}
                          </span>
                          <span className="filter-menu-label">{filter.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {/* Miscellaneous Submenu */}
            {filterCategory(miscellaneousFilters).length > 0 && (
              <div
                className={`filter-menu-submenu ${openSubmenu === 'miscellaneous' ? 'open' : ''}`}
                onMouseEnter={() => handleOpenSubmenu('miscellaneous')}
              >
                <button
                  ref={(el) => {
                    submenuHeaderRefs.current['miscellaneous'] = el;
                  }}
                  className="filter-menu-submenu-header"
                  onClick={() => handleOpenSubmenu('miscellaneous')}
                  type="button"
                >
                  <span className="filter-menu-submenu-title">Miscellaneous</span>
                  <span className="filter-menu-submenu-arrow">
                    {(submenuPositions['miscellaneous']?.openToLeft ?? submenuDirections['miscellaneous'] ?? false) ? '◀' : '▶'}
                  </span>
                </button>
                {openSubmenu === 'miscellaneous' && submenuPositions['miscellaneous'] && (
                  <div
                    className={`filter-menu-submenu-items ${submenuPositions['miscellaneous']?.openToLeft ? 'align-left' : ''}`}
                    style={{
                      position: 'fixed',
                      top: submenuPositions['miscellaneous']?.top || 0,
                      left: submenuPositions['miscellaneous']?.left || null,
                      right: submenuPositions['miscellaneous']?.right || null,
                      zIndex: 1001,
                    }}
                    onMouseEnter={() => setOpenSubmenu('miscellaneous')}
                  >
                    {filterCategory(miscellaneousFilters).map((filter) => (
                      <button
                        key={filter.field}
                        className="filter-menu-item filter-menu-submenu-item"
                        onClick={() => {
                          onSelectFilter(filter);
                          onClose();
                        }}
                        type="button"
                      >
                        <span className="filter-menu-icon">
                          {getFilterIcon(filter.type, filter.field)}
                        </span>
                        <span className="filter-menu-label">{filter.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {filterCategory(permanentFilters).length === 0 &&
              filterCategory(castAndCrewFilters).length === 0 &&
              filterCategory(popularityRatingsListsFilters).length === 0 &&
              filterCategory(miscellaneousFilters).length === 0 && (
                <div className="filter-menu-empty">No filters available</div>
              )}
          </>
        )}
      </div>
    </div>
  );
};

export default FilterMenu;
