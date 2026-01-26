import React, { useState, useRef } from 'react';
import './MovieList.css';
import { COLUMN_DEFINITIONS, enforceFixedColumnOrder } from './ColumnCustomizer';
import { filterTypes } from './filterTypes';
import { normalizeCountryName, getLanguageName } from '../utils/formatting';

// Helper function to check if a value is valid and should be displayed
const hasValidValue = (value) => {
  if (value === null || value === undefined) return false;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '0') return false;
  }
  if (typeof value === 'number' && value <= 0) return false;
  return true;
};

// Helper function to render cell content based on column type
const renderCellContent = (movie, columnId, allColumns = []) => {
  switch (columnId) {
    case 'favorite':
      return null; // Special case, handled separately
    case 'poster':
      return null; // Special case, handled separately
    case 'title':
      // Only show year in title if year column is not visible
      const hasYearColumn = allColumns.includes('year');
      return (
        <>
          {movie.title}
          {!hasYearColumn && movie.year && (
            <span className="movie-table-year"> ({movie.year})</span>
          )}
        </>
      );
    case 'year':
      return movie.year || '-';
    case 'director':
      return movie.director || '-';
    case 'genres':
      return movie.genres && movie.genres.length > 0 ? movie.genres.join(', ') : '-';
    case 'runtime':
      return movie.runtime ? `${movie.runtime} min` : '-';
    case 'language':
      return movie.original_language ? getLanguageName(movie.original_language) : '-';
    case 'country':
      return movie.country ? normalizeCountryName(movie.country) : '-';
    case 'production_company':
      return (movie.production_company && String(movie.production_company).trim()) || '-';
    case 'in_collection':
      return (
        <input
          type="checkbox"
          checked={movie.in_collection || false}
          disabled
          readOnly
          onClick={(e) => e.stopPropagation()}
          aria-label={movie.in_collection ? 'In a collection' : 'Not in a collection'}
        />
      );
    case 'date_added':
      if (movie.date_added) {
        try {
          const date = new Date(movie.date_added);
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        } catch (e) {
          return movie.date_added;
        }
      }
      return '-';
    default:
      // Handle list attributes (columns starting with 'is_' except 'is_favorite')
      if (columnId.startsWith('is_') && columnId !== 'is_favorite') {
        const isChecked = movie[columnId] || false;
        const columnDef = COLUMN_DEFINITIONS[columnId];
        const label = columnDef ? columnDef.label : columnId;
        return (
          <input
            type="checkbox"
            checked={isChecked}
            disabled
            readOnly
            onClick={(e) => e.stopPropagation()}
            aria-label={isChecked ? `In ${label}` : `Not in ${label}`}
          />
        );
      }
      return '-';
  }
};

// Check if a column ID represents a boolean column
const isBooleanColumn = (columnId) => {
  return columnId === 'favorite' || columnId === 'in_collection' || columnId.startsWith('is_');
};

// Check if a sort field (backend field name) is boolean
const isBooleanSortField = (field) => {
  return field === 'is_favorite' || field === 'in_collection' || field.startsWith('is_');
};

// Get default sort order for a given field
const getDefaultSortOrder = (field) => {
  // Boolean fields default to descending (true at top)
  if (field === 'is_favorite' || field === 'in_collection' || field.startsWith('is_')) {
    return 'desc';
  }
  // Fields that default to descending
  const descendingFields = ['year', 'date_added'];
  return descendingFields.includes(field) ? 'desc' : 'asc';
};

// Map column IDs to sort field names (all sortable columns except poster and favorites)
const getSortFieldForColumn = (columnId) => {
  // Skip poster column and favorites column - they're not sortable
  if (columnId === 'poster' || columnId === 'favorite') return null;

  const columnToSortField = {
    // String/text columns
    title: 'title',
    director: 'director',
    country: 'country',
    language: 'original_language',
    production_company: 'production_company',
    // Numeric columns
    year: 'year',
    runtime: 'runtime',
    // Date columns
    date_added: 'date_added',
    // JSON array columns
    genres: 'genres',
    // Boolean columns (favorites is handled separately, not sortable)
    in_collection: 'in_collection',
  };

  // If column is already a tracked list column (starts with 'is_'), return as-is
  // But skip is_favorite since favorites are handled separately
  if (columnId.startsWith('is_') && columnId !== 'is_favorite') {
    return columnId;
  }

  return columnToSortField[columnId] || null;
};

// Map filter field names to column IDs
const getColumnIdForFilterField = (filterField) => {
  const filterToColumn = {
    favorites_only: 'favorite',
    genre: 'genres',
    original_language: 'language',
    director: 'director',
    country: 'country',
    production_company: 'production_company',
    runtime: 'runtime',
    year: 'year',
    collection: 'in_collection',
  };

  // If it's already a tracked list column (starts with 'is_'), return as-is
  if (filterField.startsWith('is_')) {
    return filterField;
  }

  return filterToColumn[filterField] || null;
};

// Helper to check if a filter has active values
const hasActiveFilterValues = (filter) => {
  const filterType = filterTypes[filter.type];
  if (!filterType) return false;

  const config = filter.config || filterType.defaultConfig;

  if (filterType.type === 'text') {
    return config.value && config.value.trim() !== '';
  }
  if (filterType.type === 'boolean') {
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
  if (filterType.type === 'or_group') {
    return filter.config.filters && filter.config.filters.length > 0;
  }
  return false;
};

// Find the highest ranking non-boolean column that has an active filter
const getFilterIconColumn = (filters, displayColumns) => {
  const activeFilters = filters.filter(hasActiveFilterValues);

  // Find the first non-boolean column that has a matching active filter
  for (const columnId of displayColumns) {
    if (isBooleanColumn(columnId)) continue; // Skip boolean columns

    // Check if any active filter maps to this column
    for (const filter of activeFilters) {
      const filterType = filterTypes[filter.type];
      if (!filterType) continue;

      const columnIdForFilter = getColumnIdForFilterField(filterType.field);
      if (columnIdForFilter === columnId) {
        return columnId;
      }
    }
  }

  return null;
};

const MovieList = ({
  movies,
  loading,
  loadingMore,
  onMovieClick,
  viewMode = 'tile',
  onToggleFavorite,
  onDeleteMovie,
  columns,
  sorts,
  onSortsChange,
  showFavoritesFirst,
  onShowFavoritesFirstChange,
  filters = [],
  selectedMovieIndex = -1,
  onColumnsChange,
}) => {
  const [draggedColumnIndex, setDraggedColumnIndex] = useState(null);
  const [dragOverColumnIndex, setDragOverColumnIndex] = useState(null);
  const [actualHoveredIndex, setActualHoveredIndex] = useState(null);
  const [showIndicatorOnRight, setShowIndicatorOnRight] = useState(false);
  const dragOccurredRef = useRef(false);

  if (loading) {
    return (
      <div className="movie-list-loading">
        <div className="movie-list-skeleton">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="movie-skeleton-card">
              <div className="movie-skeleton-poster"></div>
              <div className="movie-skeleton-content">
                <div className="movie-skeleton-title"></div>
                <div className="movie-skeleton-line"></div>
                <div className="movie-skeleton-line short"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!movies || movies.length === 0) {
    return (
      <div className="movie-list-empty">
        <p>No movies found. Upload a CSV file to get started.</p>
      </div>
    );
  }

  const isTileView = viewMode === 'tile';
  const isExpandedView = viewMode === 'expanded';

  if (isTileView) {
    return (
      <>
        <div className="movie-list movie-list-tile">
          {movies.map((movie, index) => (
            <div
              key={movie.id}
              data-movie-index={index}
              className={`movie-card movie-card-tile ${selectedMovieIndex === index ? 'movie-selected' : ''}`}
              onClick={() => onMovieClick && onMovieClick(movie)}
            >
              <div className="movie-card-actions">
                <button
                  className={`movie-favorite-toggle movie-favorite-tile ${movie.is_favorite ? 'is-favorite' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onToggleFavorite) onToggleFavorite(movie);
                  }}
                  aria-label={movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={movie.is_favorite ? 'true' : 'false'}
                  title={movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {movie.is_favorite ? '★' : '☆'}
                </button>
              </div>
              {onDeleteMovie && (
                <div className="movie-card-delete">
                  <button
                    className="movie-delete-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (onDeleteMovie) onDeleteMovie(movie);
                    }}
                    aria-label={`Delete ${movie.title}`}
                    title={`Delete ${movie.title}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
              <div className="movie-poster">
                {movie.poster_url ? (
                  <>
                    <img
                      src={movie.poster_url}
                      alt={`${movie.title} poster`}
                      onError={(e) => {
                        // If image fails to load, show placeholder
                        e.target.style.display = 'none';
                        const placeholder = e.target.nextElementSibling;
                        if (placeholder) {
                          placeholder.style.display = 'flex';
                        }
                      }}
                    />
                    <div className="movie-poster-placeholder" style={{ display: 'none' }}>
                      <span>No Poster</span>
                    </div>
                  </>
                ) : (
                  <div className="movie-poster-placeholder">
                    <span>No Poster</span>
                  </div>
                )}
              </div>

              <div className="movie-content">
                <div className="movie-header">
                  <h3 className="movie-title">
                    {movie.title}{' '}
                    {movie.year && movie.year > 0 && (
                      <span className="movie-year">({movie.year})</span>
                    )}
                  </h3>
                </div>

                <div className="movie-details">
                  {hasValidValue(movie.director) && (
                    <div className="movie-detail">
                      <span className="detail-label">Director:</span>
                      <span className="detail-value">{movie.director}</span>
                    </div>
                  )}

                  {movie.genres && Array.isArray(movie.genres) && movie.genres.length > 0 && (
                    <div className="movie-detail">
                      <span className="detail-label">Genres:</span>
                      <span className="detail-value">{movie.genres.join(', ')}</span>
                    </div>
                  )}

                  {hasValidValue(movie.runtime) && (
                    <div className="movie-detail">
                      <span className="detail-label">Runtime:</span>
                      <span className="detail-value">{movie.runtime} min</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {loadingMore && (
          <div className="movie-list-loading-more">
            <p>Loading more movies...</p>
          </div>
        )}
      </>
    );
  }

  // Handle column header click for sorting
  const handleColumnHeaderClick = (columnId, e) => {
    // Don't trigger click if we just finished dragging
    if (dragOccurredRef.current) {
      dragOccurredRef.current = false;
      e?.preventDefault();
      e?.stopPropagation();
      return;
    }
    // Skip poster column
    if (columnId === 'poster') return;

    // Get sort field for this column
    const sortField = getSortFieldForColumn(columnId);
    if (!sortField || !onSortsChange || !sorts) return;

    const currentSorts = [...sorts];
    const isBoolean = isBooleanSortField(sortField);

    // Check if this field is already the first sort
    const firstSortIndex = currentSorts.findIndex((s) => s.field === sortField);

    if (firstSortIndex === 0) {
      if (isBoolean) {
        // Boolean fields: toggle off (remove sort) if already active
        const newSorts = currentSorts.filter((_, index) => index !== 0);
        onSortsChange(newSorts.length > 0 ? newSorts : []);
      } else {
        // Non-boolean fields: flip the order
        const newSorts = [...currentSorts];
        const newOrder = newSorts[0].order === 'asc' ? 'desc' : 'asc';
        newSorts[0] = { ...newSorts[0], order: newOrder };
        onSortsChange(newSorts);
      }
    } else {
      // Field is not first - move it to the top with default order
      const defaultOrder = getDefaultSortOrder(sortField);
      // Remove the field from its current position if it exists
      const filteredSorts = currentSorts.filter((s) => s.field !== sortField);
      // Add it to the top with default order
      const newSorts = [{ field: sortField, order: defaultOrder }, ...filteredSorts];
      onSortsChange(newSorts);
    }
  };

  // Check if a column is in a fixed position (favorite, poster, title)
  const isFixedColumn = (columnId, index, displayColumns) => {
    const fixedOrder = ['favorite', 'poster', 'title'];
    const enabledFixed = [];

    // Build list of enabled fixed columns
    if (displayColumns.includes('favorite')) {
      enabledFixed.push('favorite');
    }
    if (displayColumns.includes('poster') && viewMode === 'expanded') {
      enabledFixed.push('poster');
    }
    if (displayColumns.includes('title')) {
      enabledFixed.push('title');
    }

    // Check if this column is in a fixed position
    const fixedIndex = enabledFixed.indexOf(columnId);
    return fixedIndex !== -1 && index === fixedIndex;
  };

  // Handle drag start
  const handleDragStart = (e, index, columnId, displayColumns) => {
    // Only allow dragging non-fixed columns
    if (isFixedColumn(columnId, index, displayColumns)) {
      e.preventDefault();
      return;
    }
    dragOccurredRef.current = true;
    setDraggedColumnIndex(index);
    setDragOverColumnIndex(null);
    setActualHoveredIndex(null);
    setShowIndicatorOnRight(false);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', ''); // Required for Firefox
  };

  // Handle drag over
  const handleDragOver = (e, index, columnId, displayColumns) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedColumnIndex === null || draggedColumnIndex === index) {
      if (dragOverColumnIndex !== null) {
        setDragOverColumnIndex(null);
        setActualHoveredIndex(null);
        setShowIndicatorOnRight(false);
      }
      return;
    }

    // Don't allow dropping on fixed columns
    if (isFixedColumn(columnId, index, displayColumns)) {
      setDragOverColumnIndex(null);
      setActualHoveredIndex(null);
      setShowIndicatorOnRight(false);
      return;
    }

    // Store the actual hovered index for insertion logic
    setActualHoveredIndex(index);

    // Determine the correct indicator position based on drag direction
    // When dragging from left to right, show indicator on the right side of target (left of next column)
    // When dragging from right to left, show indicator on the left side of target
    let indicatorIndex = index;
    let showRight = false;
    if (draggedColumnIndex < index) {
      // Dragging left to right: indicator should be on the right of the target column
      // Check if there's a next column that's not fixed
      const nextIndex = index + 1;
      if (nextIndex < displayColumns.length) {
        const nextColumnId = displayColumns[nextIndex];
        if (!isFixedColumn(nextColumnId, nextIndex, displayColumns)) {
          indicatorIndex = nextIndex;
        } else {
          // Next column is fixed, show indicator on right side of current column
          showRight = true;
        }
      } else {
        // At the end, show indicator on right side of current column
        showRight = true;
      }
    } else {
      // Dragging right to left: indicator should be on the left of the target column
      indicatorIndex = index;
    }

    setDragOverColumnIndex(indicatorIndex);
    setShowIndicatorOnRight(showRight);
  };

  // Handle drag end
  const handleDragEnd = (displayColumns) => {
    if (
      draggedColumnIndex !== null &&
      actualHoveredIndex !== null &&
      draggedColumnIndex !== actualHoveredIndex
    ) {
      // Determine insertion position based on drag direction
      // When dragging left to right, indicator on right means insert after the target
      // When dragging right to left, indicator on left means insert before the target
      let insertionIndex = actualHoveredIndex;
      if (draggedColumnIndex < actualHoveredIndex) {
        // Dragging left to right: insert after the target column
        insertionIndex = actualHoveredIndex + 1;
      } else {
        // Dragging right to left: insert before the target column
        insertionIndex = actualHoveredIndex;
      }
      
      // Don't allow dropping on fixed columns
      const targetColumnId = displayColumns[actualHoveredIndex];
      if (!isFixedColumn(targetColumnId, actualHoveredIndex, displayColumns)) {
        // Check if source column is fixed
        const sourceColumnId = displayColumns[draggedColumnIndex];
        if (!isFixedColumn(sourceColumnId, draggedColumnIndex, displayColumns)) {
          // Reorder columns
          const newColumns = [...displayColumns];
          const [draggedColumn] = newColumns.splice(draggedColumnIndex, 1);
          
          // Adjust insertion index after removing the dragged column
          let adjustedInsertionIndex = insertionIndex;
          if (draggedColumnIndex < insertionIndex) {
            // We removed a column before the insertion point, so shift left by 1
            adjustedInsertionIndex = insertionIndex - 1;
          }
          // Ensure we don't go out of bounds
          adjustedInsertionIndex = Math.max(0, Math.min(adjustedInsertionIndex, newColumns.length));
          
          newColumns.splice(adjustedInsertionIndex, 0, draggedColumn);

          // Apply fixed order enforcement and notify parent
          const orderedColumns = enforceFixedColumnOrder(newColumns, viewMode);

          if (onColumnsChange) {
            onColumnsChange(orderedColumns);
          }
        }
      }
    }
    setDraggedColumnIndex(null);
    setDragOverColumnIndex(null);
    setActualHoveredIndex(null);
    setShowIndicatorOnRight(false);
  };

  // Handle drop - prevent default behavior
  const handleDrop = (e) => {
    e.preventDefault();
  };

  // List view (table with poster)
  if (isExpandedView) {
    // Use provided columns or default, then enforce fixed order
    const defaultColumns = [
      'favorite',
      'poster',
      'title',
      'director',
      'genres',
      'runtime',
      'language',
    ];
    const displayColumns = enforceFixedColumnOrder(columns || defaultColumns, 'expanded');
    const hasPoster = displayColumns.includes('poster');
    // Use expanded styling if poster is enabled, otherwise use compact styling
    const listClassName = hasPoster ? 'movie-list-expanded' : 'movie-list-table';

    // Find which column should show the filter icon (highest ranking non-boolean column with filter)
    const filterIconColumnId = getFilterIconColumn(filters, displayColumns);

    return (
      <>
        <div className={`movie-list ${listClassName}`}>
          <table className="movie-table">
            <thead>
              <tr>
                {displayColumns.map((columnId, index) => {
                  const columnDef = COLUMN_DEFINITIONS[columnId];
                  if (!columnDef) return null;

                  let className = '';
                  if (columnId === 'favorite') className = 'movie-table-favorite';
                  else if (columnId === 'poster') className = 'movie-table-poster';
                  else if (columnId === 'title') className = 'movie-table-title';

                  // Make headers clickable if they're sortable (have sort field, but not poster)
                  const sortField = getSortFieldForColumn(columnId);
                  const isClickable = columnId !== 'poster' && sortField !== null;
                  const isSorted =
                    sortField && sorts && sorts.length > 0 && sorts[0].field === sortField;
                  const sortOrder = isSorted ? sorts[0].order : null;
                  const isBoolean = isBooleanColumn(columnId);
                  const showFilterIcon = filterIconColumnId === columnId;

                  // Check if column is fixed and draggable
                  const fixed = isFixedColumn(columnId, index, displayColumns);
                  const isDraggable = !fixed && onColumnsChange;

                  if (isClickable) {
                    className = className
                      ? `${className} movie-table-header-clickable`
                      : 'movie-table-header-clickable';
                  }

                  // Add drag-related classes
                  if (draggedColumnIndex === index) {
                    className = className
                      ? `${className} movie-table-header-dragging`
                      : 'movie-table-header-dragging';
                  }
                  if (dragOverColumnIndex === index && draggedColumnIndex !== index) {
                    className = className
                      ? `${className} movie-table-header-drag-over${showIndicatorOnRight ? ' movie-table-header-drag-over-right' : ''}`
                      : `movie-table-header-drag-over${showIndicatorOnRight ? ' movie-table-header-drag-over-right' : ''}`;
                  }
                  if (isDraggable) {
                    className = className
                      ? `${className} movie-table-header-draggable`
                      : 'movie-table-header-draggable';
                  }

                  return (
                    <th
                      key={columnId}
                      className={className}
                      draggable={isDraggable ? true : false}
                      onDragStart={
                        isDraggable
                          ? (e) => handleDragStart(e, index, columnId, displayColumns)
                          : undefined
                      }
                      onDragOver={
                        isDraggable
                          ? (e) => handleDragOver(e, index, columnId, displayColumns)
                          : undefined
                      }
                      onDragLeave={isDraggable ? () => {
                        setDragOverColumnIndex(null);
                        setActualHoveredIndex(null);
                        setShowIndicatorOnRight(false);
                      } : undefined}
                      onDragEnd={isDraggable ? () => handleDragEnd(displayColumns) : undefined}
                      onDrop={isDraggable ? handleDrop : undefined}
                      onClick={
                        isClickable ? (e) => handleColumnHeaderClick(columnId, e) : undefined
                      }
                      style={isDraggable ? {} : isClickable ? { cursor: 'pointer' } : {}}
                      title={
                        isClickable
                          ? `Sort by ${columnDef.label}`
                          : isDraggable
                            ? `Drag to reorder ${columnDef.label}`
                            : ''
                      }
                    >
                      {columnDef.headerLabel || columnDef.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {movies.map((movie, index) => (
                <tr
                  key={movie.id}
                  data-movie-index={index}
                  className={`movie-table-row ${selectedMovieIndex === index ? 'movie-selected' : ''}`}
                  onClick={() => onMovieClick && onMovieClick(movie)}
                >
                  {displayColumns.map((columnId) => {
                    if (columnId === 'favorite') {
                      return (
                        <td key={columnId} className="movie-table-favorite-cell">
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <button
                              className={`movie-favorite-toggle ${movie.is_favorite ? 'is-favorite' : ''}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (onToggleFavorite) onToggleFavorite(movie);
                              }}
                              aria-label={
                                movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'
                              }
                              aria-pressed={movie.is_favorite ? 'true' : 'false'}
                              title={
                                movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'
                              }
                            >
                              {movie.is_favorite ? '★' : '☆'}
                            </button>
                          </div>
                        </td>
                      );
                    }

                    if (columnId === 'poster') {
                      return (
                        <td key={columnId} className="movie-table-poster-cell">
                          <div className="movie-poster-expanded">
                            {movie.poster_url ? (
                              <>
                                <img
                                  src={movie.poster_url}
                                  alt={`${movie.title} poster`}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const placeholder = e.target.nextElementSibling;
                                    if (placeholder) {
                                      placeholder.style.display = 'flex';
                                    }
                                  }}
                                />
                                <div
                                  className="movie-poster-placeholder"
                                  style={{ display: 'none' }}
                                >
                                  <span>No Poster</span>
                                </div>
                              </>
                            ) : (
                              <div className="movie-poster-placeholder">
                                <span>No Poster</span>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    }

                    const className = columnId === 'title' ? 'movie-table-title' : '';
                    const isLastColumn = columnId === displayColumns[displayColumns.length - 1];
                    return (
                      <td
                        key={columnId}
                        className={className}
                        style={{ position: isLastColumn && onDeleteMovie ? 'relative' : undefined }}
                      >
                        {renderCellContent(movie, columnId, displayColumns)}
                        {isLastColumn && onDeleteMovie && (
                          <button
                            className="movie-delete-button movie-delete-button-inline"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (onDeleteMovie) onDeleteMovie(movie);
                            }}
                            aria-label={`Delete ${movie.title}`}
                            title={`Delete ${movie.title}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loadingMore && (
          <div className="movie-list-loading-more">
            <p>Loading more movies...</p>
          </div>
        )}
      </>
    );
  }

  // Fallback list view (table view without poster)
  // This path should not be reached since we only have 'tile' and 'expanded' modes now
  // Use provided columns or default, but exclude 'poster'
  const defaultListColumns = ['favorite', 'title', 'director', 'genres', 'runtime', 'language'];
  const columnsWithoutPoster = columns
    ? columns.filter((col) => col !== 'poster') // Remove poster
    : defaultListColumns;
  // Enforce fixed order (poster will be automatically excluded)
  // Use 'expanded' viewMode since poster filtering is handled above
  const displayColumns = enforceFixedColumnOrder(columnsWithoutPoster, 'expanded');

  // Find which column should show the filter icon (highest ranking non-boolean column with filter)
  const filterIconColumnId = getFilterIconColumn(filters, displayColumns);

  return (
    <>
      <div className="movie-list movie-list-table">
        <table className="movie-table">
          <thead>
            <tr>
              {displayColumns.map((columnId, index) => {
                const columnDef = COLUMN_DEFINITIONS[columnId];
                if (!columnDef) return null;

                let className = '';
                if (columnId === 'favorite') className = 'movie-table-favorite';
                else if (columnId === 'title') className = 'movie-table-title';

                // Make headers clickable if they're sortable (have sort field, but not poster)
                const sortField = getSortFieldForColumn(columnId);
                const isClickable = columnId !== 'poster' && sortField !== null;
                const isSorted =
                  sortField && sorts && sorts.length > 0 && sorts[0].field === sortField;
                const sortOrder = isSorted ? sorts[0].order : null;
                const isBoolean = isBooleanColumn(columnId);
                const showFilterIcon = filterIconColumnId === columnId;

                // Check if column is fixed and draggable
                const fixed = isFixedColumn(columnId, index, displayColumns);
                const isDraggable = !fixed && onColumnsChange;

                if (isClickable) {
                  className = className
                    ? `${className} movie-table-header-clickable`
                    : 'movie-table-header-clickable';
                }

                // Add drag-related classes
                if (draggedColumnIndex === index) {
                  className = className
                    ? `${className} movie-table-header-dragging`
                    : 'movie-table-header-dragging';
                }
                if (dragOverColumnIndex === index && draggedColumnIndex !== index) {
                  className = className
                    ? `${className} movie-table-header-drag-over${showIndicatorOnRight ? ' movie-table-header-drag-over-right' : ''}`
                    : `movie-table-header-drag-over${showIndicatorOnRight ? ' movie-table-header-drag-over-right' : ''}`;
                }
                if (isDraggable) {
                  className = className
                    ? `${className} movie-table-header-draggable`
                    : 'movie-table-header-draggable';
                }

                return (
                  <th
                    key={columnId}
                    className={className}
                    draggable={isDraggable ? true : false}
                    onDragStart={
                      isDraggable
                        ? (e) => handleDragStart(e, index, columnId, displayColumns)
                        : undefined
                    }
                    onDragOver={
                      isDraggable
                        ? (e) => handleDragOver(e, index, columnId, displayColumns)
                        : undefined
                    }
                    onDragLeave={isDraggable ? () => {
                      setDragOverColumnIndex(null);
                      setActualHoveredIndex(null);
                      setShowIndicatorOnRight(false);
                    } : undefined}
                    onDragEnd={isDraggable ? () => handleDragEnd(displayColumns) : undefined}
                    onDrop={isDraggable ? handleDrop : undefined}
                    onClick={isClickable ? (e) => handleColumnHeaderClick(columnId, e) : undefined}
                    style={isDraggable ? {} : isClickable ? { cursor: 'pointer' } : {}}
                    title={
                      isClickable
                        ? `Sort by ${columnDef.label}`
                        : isDraggable
                          ? `Drag to reorder ${columnDef.label}`
                          : ''
                    }
                  >
                    {columnDef.headerLabel || columnDef.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {movies.map((movie, index) => (
              <tr
                key={movie.id}
                data-movie-index={index}
                className={`movie-table-row ${selectedMovieIndex === index ? 'movie-selected' : ''}`}
                onClick={() => onMovieClick && onMovieClick(movie)}
              >
                {displayColumns.map((columnId) => {
                  if (columnId === 'favorite') {
                    return (
                      <td key={columnId} className="movie-table-favorite-cell">
                        <div
                          style={{
                            display: 'flex',
                            gap: '4px',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <button
                            className={`movie-favorite-toggle ${movie.is_favorite ? 'is-favorite' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (onToggleFavorite) onToggleFavorite(movie);
                            }}
                            aria-label={
                              movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'
                            }
                            aria-pressed={movie.is_favorite ? 'true' : 'false'}
                            title={movie.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {movie.is_favorite ? '★' : '☆'}
                          </button>
                        </div>
                      </td>
                    );
                  }

                  const className = columnId === 'title' ? 'movie-table-title' : '';
                  const isLastColumn = columnId === displayColumns[displayColumns.length - 1];
                  return (
                    <td
                      key={columnId}
                      className={className}
                      style={{ position: isLastColumn && onDeleteMovie ? 'relative' : undefined }}
                    >
                      {renderCellContent(movie, columnId, displayColumns)}
                      {isLastColumn && onDeleteMovie && (
                        <button
                          className="movie-delete-button movie-delete-button-inline"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (onDeleteMovie) onDeleteMovie(movie);
                          }}
                          aria-label={`Delete ${movie.title}`}
                          title={`Delete ${movie.title}`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loadingMore && (
        <div className="movie-list-loading-more">
          <p>Loading more movies...</p>
        </div>
      )}
    </>
  );
};

export default MovieList;
