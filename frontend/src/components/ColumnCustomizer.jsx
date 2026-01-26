import React, { useState, useEffect, useRef } from 'react';
import './ColumnCustomizer.css';
import { trackedListNames } from './filterTypes';

// Helper function to convert filename to column name (matches backend logic)
const filenameToColumnName = (filename) => {
  return 'is_' + filename.replace(/[-\s]+/g, '_').toLowerCase();
};

// Generate list attribute column definitions
const generateListAttributeColumns = () => {
  const listColumns = {};
  for (const [filename, displayName] of Object.entries(trackedListNames)) {
    const columnName = filenameToColumnName(filename);
    listColumns[columnName] = { label: displayName, id: columnName };
  }
  return listColumns;
};

// Define all available columns
const COLUMN_DEFINITIONS = {
  favorite: { label: 'Favorites', headerLabel: '★', id: 'favorite' },
  poster: { label: 'Poster', id: 'poster', viewModes: ['expanded'] },
  title: { label: 'Title', id: 'title', alwaysVisible: true },
  director: { label: 'Director', id: 'director' },
  genres: { label: 'Genres', id: 'genres' },
  runtime: { label: 'Runtime', id: 'runtime' },
  language: { label: 'Language', id: 'language' },
  country: { label: 'Country', id: 'country' },
  production_company: { label: 'Production Company', id: 'production_company' },
  in_collection: { label: 'In a Collection', id: 'in_collection' },
  date_added: { label: 'Date Added', id: 'date_added' },
  ...generateListAttributeColumns(), // Add list attribute columns dynamically
};

// Get default column order for a view mode
const getDefaultColumns = (viewMode) => {
  if (viewMode === 'expanded') {
    return ['favorite', 'poster', 'title', 'director', 'genres', 'runtime', 'language'];
  }
  // Fallback default (legacy support for 'list' view mode)
  return ['favorite', 'title', 'director', 'genres', 'runtime', 'language'];
};

const ColumnCustomizer = ({ viewMode, columns, onColumnsChange, onClose }) => {
  // Use the exported function
  const enforceFixedOrder = (columnArray) => enforceFixedColumnOrder(columnArray, viewMode);

  const [localColumns, setLocalColumns] = useState(() => {
    const initial = columns || getDefaultColumns(viewMode);
    return enforceFixedOrder(initial);
  });

  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const localColumnsRef = useRef(localColumns);
  const initialColumnsRef = useRef(JSON.stringify(localColumns));

  // Update ref whenever localColumns changes
  useEffect(() => {
    localColumnsRef.current = localColumns;
  }, [localColumns]);

  // Update local columns when prop changes
  useEffect(() => {
    if (columns) {
      const orderedColumns = enforceFixedOrder(columns);
      const currentColumnsStr = JSON.stringify(orderedColumns);
      // Only sync if the incoming columns are different from what we have
      if (currentColumnsStr !== JSON.stringify(localColumns)) {
        setLocalColumns(orderedColumns);
        initialColumnsRef.current = currentColumnsStr;
      }
    }
  }, [columns, viewMode]);

  // Save changes when component unmounts (dropdown closes)
  useEffect(() => {
    return () => {
      const orderedColumns = enforceFixedOrder(localColumnsRef.current);
      const currentColumnsStr = JSON.stringify(orderedColumns);
      // Only update if columns actually changed from initial
      if (currentColumnsStr !== initialColumnsRef.current) {
        onColumnsChange(orderedColumns);
      }
    };
  }, [onColumnsChange]);

  // Get available columns for this view mode
  const getAvailableColumns = () => {
    return Object.entries(COLUMN_DEFINITIONS)
      .filter(([key, def]) => {
        // Filter by view mode if specified
        if (def.viewModes && !def.viewModes.includes(viewMode)) {
          return false;
        }
        return true;
      })
      .map(([key, def]) => ({ key, ...def }));
  };

  const availableColumns = getAvailableColumns();

  // Get display columns - always include 'favorite' and 'poster' at the top
  const getDisplayColumns = () => {
    const fixedAtTop = ['favorite', 'poster'];
    const displayOrder = [];

    // Always add favorite and poster at the top, even if disabled
    for (const fixedId of fixedAtTop) {
      // Skip poster if not in expanded view
      if (fixedId === 'poster' && viewMode !== 'expanded') {
        continue;
      }
      displayOrder.push(fixedId);
    }

    // Add other columns from localColumns (excluding favorite/poster which we already added)
    for (const colId of localColumns) {
      if (!fixedAtTop.includes(colId)) {
        displayOrder.push(colId);
      }
    }

    return displayOrder;
  };

  // Toggle column visibility
  const toggleColumn = (columnId) => {
    const columnDef = COLUMN_DEFINITIONS[columnId];
    if (columnDef && columnDef.alwaysVisible) {
      return; // Cannot hide always-visible columns (title)
    }

    setLocalColumns((prev) => {
      let newColumns;
      if (prev.includes(columnId)) {
        // Remove column
        newColumns = prev.filter((id) => id !== columnId);
      } else {
        // Add column - enforce fixed order after adding
        newColumns = [...prev, columnId];
      }
      // Enforce fixed order
      return enforceFixedOrder(newColumns);
    });
  };

  // Check if a column is in a fixed position
  const isFixedPosition = (columnId, index) => {
    // Always include favorite and poster at positions 0 and 1 (even if disabled)
    if (viewMode === 'expanded') {
      // In expanded mode, favorite is at 0, poster at 1
      if (columnId === 'favorite' && index === 0) return true;
      if (columnId === 'poster' && index === 1) return true;
    } else {
      // In other modes, only favorite is at position 0
      if (columnId === 'favorite' && index === 0) return true;
    }

    // Build list of enabled fixed columns for title (which follows favorite/poster)
    const favoritePosterCount = viewMode === 'expanded' ? 2 : 1;
    if (localColumns.includes('title')) {
      const displayColumns = getDisplayColumns();
      const titleIndex = displayColumns.indexOf('title');
      if (columnId === 'title' && titleIndex === favoritePosterCount) {
        return true;
      }
    }

    return false;
  };

  // Move column up
  const moveColumnUp = (index) => {
    if (index === 0) return;
    const displayColumns = getDisplayColumns();
    const columnId = displayColumns[index];

    // Don't allow moving fixed columns out of their position
    if (isFixedPosition(columnId, index)) {
      return;
    }

    // Don't allow moving past fixed columns
    const prevColumnId = displayColumns[index - 1];
    if (isFixedPosition(prevColumnId, index - 1)) {
      return;
    }

    setLocalColumns((prev) => {
      const newColumns = [...prev];
      const fixedAtTop = viewMode === 'expanded' ? ['favorite', 'poster'] : ['favorite'];
      const prevIndex = newColumns.indexOf(prevColumnId);
      const currentIndex = newColumns.indexOf(columnId);

      // Only swap if both are in the enabled columns list
      if (prevIndex !== -1 && currentIndex !== -1) {
        [newColumns[prevIndex], newColumns[currentIndex]] = [
          newColumns[currentIndex],
          newColumns[prevIndex],
        ];
      }
      // Enforce fixed order in case of any issues
      return enforceFixedOrder(newColumns);
    });
  };

  // Move column down
  const moveColumnDown = (index) => {
    const displayColumns = getDisplayColumns();
    if (index === displayColumns.length - 1) return;
    const columnId = displayColumns[index];

    // Don't allow moving fixed columns out of their position
    if (isFixedPosition(columnId, index)) {
      return;
    }

    const nextColumnId = displayColumns[index + 1];
    if (isFixedPosition(nextColumnId, index + 1)) {
      return;
    }

    setLocalColumns((prev) => {
      const newColumns = [...prev];
      const currentIndex = newColumns.indexOf(columnId);
      const nextIndex = newColumns.indexOf(nextColumnId);

      // Only swap if both are in the enabled columns list
      if (currentIndex !== -1 && nextIndex !== -1) {
        [newColumns[currentIndex], newColumns[nextIndex]] = [
          newColumns[nextIndex],
          newColumns[currentIndex],
        ];
      }
      // Enforce fixed order in case of any issues
      return enforceFixedOrder(newColumns);
    });
  };

  // Reset to default
  const handleReset = () => {
    const defaultColumns = getDefaultColumns(viewMode);
    setLocalColumns(defaultColumns);
  };

  // Drag and drop handlers
  const handleDragStart = (index) => {
    const displayColumns = getDisplayColumns();
    const columnId = displayColumns[index];
    // Don't allow dragging fixed columns
    if (isFixedPosition(columnId, index)) {
      return;
    }
    setDraggedIndex(index);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const displayColumns = getDisplayColumns();
      const draggedColumnId = displayColumns[draggedIndex];

      // Don't allow moving fixed columns
      if (isFixedPosition(draggedColumnId, draggedIndex)) {
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }

      // Calculate the actual target index considering fixed columns (favorite/poster are always at 0/1)
      const fixedCount = viewMode === 'expanded' ? 2 : 1; // favorite + poster, or just favorite

      // Don't allow dropping into fixed positions
      if (dragOverIndex < fixedCount) {
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }

      // Reorder the columns - only modify localColumns (enabled columns)
      let newColumns = [...localColumns];
      const draggedItem = draggedColumnId;

      // Remove from current position
      const currentIndex = newColumns.indexOf(draggedItem);
      if (currentIndex !== -1) {
        newColumns.splice(currentIndex, 1);
      }

      // Calculate target position in localColumns (excluding fixed favorite/poster)
      const targetDisplayIndex = dragOverIndex;
      const fixedAtTop = viewMode === 'expanded' ? ['favorite', 'poster'] : ['favorite'];
      const targetLocalIndex = targetDisplayIndex - fixedAtTop.length;

      // Insert at new position
      if (targetLocalIndex < 0) {
        newColumns.unshift(draggedItem);
      } else {
        newColumns.splice(targetLocalIndex, 0, draggedItem);
      }

      // Enforce fixed order
      setLocalColumns(enforceFixedOrder(newColumns));
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) {
      if (dragOverIndex !== null) {
        setDragOverIndex(null);
      }
      return;
    }

    const displayColumns = getDisplayColumns();
    const columnId = displayColumns[index];
    // Don't allow dropping on fixed columns
    if (isFixedPosition(columnId, index)) {
      if (dragOverIndex !== null) {
        setDragOverIndex(null);
      }
      return;
    }

    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // Save changes before closing
  const saveAndClose = () => {
    const orderedColumns = enforceFixedOrder(localColumnsRef.current);
    const currentColumnsStr = JSON.stringify(orderedColumns);
    // Only update if columns actually changed
    if (currentColumnsStr !== initialColumnsRef.current) {
      onColumnsChange(orderedColumns);
      initialColumnsRef.current = currentColumnsStr;
    }
    onClose();
  };

  // Save and close
  const handleSave = () => {
    saveAndClose();
  };

  // Handle Escape key to close customizer
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        saveAndClose();
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, onColumnsChange]);

  return (
    <div className="column-customizer">
      <div className="column-customizer-header">
        <h3>Customize Columns</h3>
        <button className="column-customizer-close" onClick={saveAndClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="column-customizer-content">
        <div className="column-customizer-info">
          <p>
            Toggle columns to show/hide them. Favorites, Poster (if enabled), and Title are always
            first in that order. Drag columns or use arrows to reorder other columns.
          </p>
        </div>
        <div className="column-customizer-list">
          {(() => {
            const displayColumns = getDisplayColumns();
            return displayColumns.map((columnId, index) => {
              const columnDef = COLUMN_DEFINITIONS[columnId];
              if (!columnDef) return null;

              const isAlwaysVisible = columnDef.alwaysVisible || false;
              const isFixed = isFixedPosition(columnId, index);
              // Don't allow moving fixed columns or moving past them
              const canMoveUp =
                index > 0 && !isFixed && !isFixedPosition(displayColumns[index - 1], index - 1);
              const canMoveDown = index < displayColumns.length - 1 && !isFixed;

              return (
                <div
                  key={columnId}
                  className={`column-customizer-item ${isAlwaysVisible ? 'always-visible' : ''} ${isFixed ? 'fixed-position' : ''} ${draggedIndex === index ? 'column-customizer-item-dragging' : ''} ${dragOverIndex === index && draggedIndex !== index ? 'column-customizer-item-drag-over' : ''}`}
                  draggable={!isFixed}
                  onDragStart={() => handleDragStart(index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                >
                  {!isFixed && (
                    <div
                      className="column-customizer-drag-handle"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="3" cy="3" r="1" fill="currentColor" opacity="0.5" />
                        <circle cx="9" cy="3" r="1" fill="currentColor" opacity="0.5" />
                        <circle cx="3" cy="6" r="1" fill="currentColor" opacity="0.5" />
                        <circle cx="9" cy="6" r="1" fill="currentColor" opacity="0.5" />
                        <circle cx="3" cy="9" r="1" fill="currentColor" opacity="0.5" />
                        <circle cx="9" cy="9" r="1" fill="currentColor" opacity="0.5" />
                      </svg>
                    </div>
                  )}
                  <label className="column-customizer-checkbox">
                    <input
                      type="checkbox"
                      checked={localColumns.includes(columnId)}
                      disabled={isAlwaysVisible}
                      onChange={() => toggleColumn(columnId)}
                    />
                    <span className="column-customizer-label">{columnDef.label}</span>
                  </label>
                  <div className="column-customizer-actions">
                    <button
                      className="column-customizer-move-btn"
                      onClick={() => moveColumnUp(index)}
                      disabled={!canMoveUp}
                      aria-label="Move up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="column-customizer-move-btn"
                      onClick={() => moveColumnDown(index)}
                      disabled={!canMoveDown}
                      aria-label="Move down"
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>
        <div className="column-customizer-available">
          <h4>Available Columns</h4>
          <div className="column-customizer-list">
            {(() => {
              const displayColumns = getDisplayColumns();
              return availableColumns
                .filter((col) => !displayColumns.includes(col.id)) // Exclude columns already shown (including favorite/poster)
                .map((columnDef) => (
                  <div key={columnDef.id} className="column-customizer-item">
                    <label className="column-customizer-checkbox">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleColumn(columnDef.id)}
                      />
                      <span className="column-customizer-label">{columnDef.label}</span>
                    </label>
                  </div>
                ));
            })()}
          </div>
        </div>
      </div>
      <div className="column-customizer-footer">
        <button className="column-customizer-reset" onClick={handleReset}>
          Reset to Default
        </button>
        <button className="column-customizer-save" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
};

// Export enforceFixedOrder for use in MovieList
export const enforceFixedColumnOrder = (columnArray, viewMode) => {
  const fixedOrder = ['favorite', 'poster', 'title'];
  const result = [];
  const remaining = [...columnArray];

  // Add fixed columns in order if they exist
  for (const fixedId of fixedOrder) {
    // Skip poster if not in expanded view
    if (fixedId === 'poster' && viewMode !== 'expanded') {
      continue;
    }

    const index = remaining.indexOf(fixedId);
    if (index !== -1) {
      result.push(fixedId);
      remaining.splice(index, 1);
    }
  }

  // Add remaining columns in their original order
  return [...result, ...remaining];
};

export default ColumnCustomizer;
export { COLUMN_DEFINITIONS, getDefaultColumns };
