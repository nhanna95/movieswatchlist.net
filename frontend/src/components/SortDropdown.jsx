import React, { useState, useEffect, useRef } from 'react';
import './SortDropdown.css';
import { sortFields } from './filterTypes';

const SortDropdown = ({
  sorts,
  onUpdate,
  onClose,
  defaultSorts,
  onSetDefaultSorts,
  showFavoritesFirst,
  onShowFavoritesFirstChange,
  defaultShowFavoritesFirst,
  onSetDefaultShowFavoritesFirst,
  alignRight = false,
}) => {
  const [localSorts, setLocalSorts] = useState(sorts || []);
  const dropdownRef = useRef(null);
  const initialSortsRef = useRef(JSON.stringify(sorts || []));
  const localSortsRef = useRef(localSorts);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Remove duplicate sort fields, keeping only the first occurrence of each field
  // Also ensure genres and production_company can only be at position 0 (first)
  const removeDuplicateFields = (sorts) => {
    const seenFields = new Set();
    return sorts.filter((sort, index) => {
      // Remove genres/production_company if they're not at position 0
      if ((sort.field === 'genres' || sort.field === 'production_company') && index !== 0) {
        return false;
      }
      if (seenFields.has(sort.field)) {
        return false; // Skip duplicates
      }
      seenFields.add(sort.field);
      return true; // Keep first occurrence
    });
  };

  // Initialize localSorts when component mounts or when sorts prop changes (dropdown opens)
  useEffect(() => {
    // Filter out is_favorite from sorts (favorites are always fixed at top)
    const cleanedSorts = (sorts || []).filter((s) => s.field !== 'is_favorite');
    const currentSortsStr = JSON.stringify(cleanedSorts);
    // Only sync if the incoming sorts are different from what we have
    // This happens when dropdown opens with new sorts
    if (currentSortsStr !== JSON.stringify(localSorts)) {
      setLocalSorts(cleanedSorts);
      initialSortsRef.current = currentSortsStr;
    }
  }, [sorts]);

  // Save changes when component unmounts (dropdown closes)
  useEffect(() => {
    return () => {
      // Remove duplicate fields before saving
      const deduplicatedSorts = removeDuplicateFields(localSortsRef.current);
      const currentSortsStr = JSON.stringify(deduplicatedSorts);
      // Only update if sorts actually changed from initial
      if (currentSortsStr !== initialSortsRef.current) {
        onUpdate(deduplicatedSorts);
      }
    };
  }, [onUpdate]);

  // Save changes before closing
  const saveAndClose = () => {
    // Remove duplicate fields before saving
    const deduplicatedSorts = removeDuplicateFields(localSortsRef.current);
    const currentSortsStr = JSON.stringify(deduplicatedSorts);
    // Only update if sorts actually changed
    if (currentSortsStr !== initialSortsRef.current) {
      onUpdate(deduplicatedSorts);
      initialSortsRef.current = currentSortsStr;
    }
    onClose();
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        saveAndClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, localSorts, onUpdate]);

  // Handle Escape key to close dropdown
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
  }, [onClose, localSorts, onUpdate]);

  // Check if a sort field is boolean
  const isBooleanSortField = (field) => {
    return field === 'is_favorite' || field === 'in_collection' || field.startsWith('is_');
  };

  // Get default sort order for a given field
  const getDefaultSortOrder = (field) => {
    // Boolean fields default to descending (true at top)
    if (isBooleanSortField(field)) {
      return 'desc';
    }
    // Fields that default to descending
    const descendingFields = ['year'];
    return descendingFields.includes(field) ? 'desc' : 'asc';
  };

  // Update ref whenever localSorts changes
  useEffect(() => {
    localSortsRef.current = localSorts;
  }, [localSorts]);

  const handleAddSort = () => {
    // Find the first unused sort field (exclude genres/production_company if not adding at position 0)
    const usedFields = new Set(localSorts.map((s) => s.field));
    const availableFields = Object.keys(sortFields).filter((field) => {
      // If genres/production_company is already used or if we have sorts already (not adding at position 0), exclude them
      if (
        (field === 'genres' || field === 'production_company') &&
        (usedFields.has(field) || localSorts.length > 0)
      ) {
        return false;
      }
      return true;
    });
    const firstUnusedField =
      availableFields.find((field) => !usedFields.has(field)) || availableFields[0];

    const defaultOrder = getDefaultSortOrder(firstUnusedField);
    const newSorts = [...localSorts, { field: firstUnusedField, order: defaultOrder }];
    setLocalSorts(newSorts);
    localSortsRef.current = newSorts;
  };

  const handleRemoveSort = (index) => {
    const newSorts = localSorts.filter((_, i) => i !== index);
    // Ensure is_favorite is never in the sorts
    const cleanedSorts = newSorts.filter((s) => s.field !== 'is_favorite');
    setLocalSorts(cleanedSorts);
    localSortsRef.current = cleanedSorts;
  };

  const handleFieldChange = (index, field) => {
    let newSorts = [...localSorts];
    const defaultOrder = getDefaultSortOrder(field);

    // If setting a field at index > 0 to genres or production_company, don't allow it (they can only be first)
    if (index > 0 && (field === 'genres' || field === 'production_company')) {
      return; // Don't allow genres/production_company at non-first position
    }

    // If setting a field at index 0 (first position) to something other than genres/production_company,
    // remove genres/production_company from the sorts (they can only be first)
    if (index === 0 && field !== 'genres' && field !== 'production_company') {
      newSorts = newSorts.filter(
        (_, i) =>
          i === 0 ||
          (i > 0 && newSorts[i].field !== 'genres' && newSorts[i].field !== 'production_company')
      );
    }

    newSorts[index] = { ...newSorts[index], field, order: defaultOrder };
    setLocalSorts(newSorts);
    localSortsRef.current = newSorts;
  };

  const handleOrderChange = (index, order) => {
    const newSorts = [...localSorts];
    newSorts[index] = { ...newSorts[index], order };
    setLocalSorts(newSorts);
    localSortsRef.current = newSorts;
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    let newSorts = [...localSorts];
    const movingItem = newSorts[index];

    // If moving to position 0 (first) and it's not genres/production_company, remove any existing genres/production_company sort
    const firstField = newSorts[0].field;
    if (
      (firstField === 'genres' || firstField === 'production_company') &&
      movingItem.field !== 'genres' &&
      movingItem.field !== 'production_company' &&
      index === 1
    ) {
      // If genres/production_company is first and we're moving a non-expansion item to first, remove it
      newSorts = newSorts.filter((_, i) => i !== 0);
      newSorts.splice(0, 0, movingItem);
    } else {
      // Normal swap
      [newSorts[index - 1], newSorts[index]] = [newSorts[index], newSorts[index - 1]];
    }

    setLocalSorts(newSorts);
    localSortsRef.current = newSorts;
  };

  const handleMoveDown = (index) => {
    if (index === localSorts.length - 1) return;
    const newSorts = [...localSorts];
    [newSorts[index], newSorts[index + 1]] = [newSorts[index + 1], newSorts[index]];
    setLocalSorts(newSorts);
    localSortsRef.current = newSorts;
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      let newSorts = [...localSorts];
      const draggedItem = newSorts[draggedIndex];

      // If dragging genres or production_company to non-first position, don't allow it
      if (
        dragOverIndex > 0 &&
        (draggedItem.field === 'genres' || draggedItem.field === 'production_company')
      ) {
        // Don't allow dragging genres/production_company to non-first position - just reset
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }

      // Remove the dragged item from its current position
      newSorts.splice(draggedIndex, 1);

      // If dragging to position 0 (first) and it's not genres/production_company, remove any existing expansion sorts
      if (
        dragOverIndex === 0 &&
        draggedItem.field !== 'genres' &&
        draggedItem.field !== 'production_company'
      ) {
        // Remove genres/production_company if they exist at position 0
        if (
          newSorts.length > 0 &&
          (newSorts[0].field === 'genres' || newSorts[0].field === 'production_company')
        ) {
          newSorts = newSorts.filter((_, i) => i !== 0);
        }
        newSorts.splice(0, 0, draggedItem);
      } else {
        // Normal insertion
        newSorts.splice(dragOverIndex, 0, draggedItem);
      }

      setLocalSorts(newSorts);
      localSortsRef.current = newSorts;
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
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleApply = () => {
    saveAndClose();
  };

  const handleClearAll = () => {
    // Filter out is_favorite from default sorts if present
    const cleanedDefaults = (defaultSorts || []).filter((s) => s.field !== 'is_favorite');
    const newSorts =
      cleanedDefaults.length > 0 ? cleanedDefaults : [{ field: 'title', order: 'asc' }];
    setLocalSorts(newSorts);
    localSortsRef.current = newSorts;
    onUpdate(newSorts);
  };

  const handleSetAsDefault = () => {
    const deduplicatedSorts = removeDuplicateFields(localSortsRef.current);
    if (onSetDefaultSorts) {
      onSetDefaultSorts(deduplicatedSorts);
      // Also update current sorts to match
      onUpdate(deduplicatedSorts);
      initialSortsRef.current = JSON.stringify(deduplicatedSorts);
    }
  };

  // Check if current sorts differ from default
  const isDifferentFromDefault = () => {
    return defaultSorts
      ? JSON.stringify(removeDuplicateFields(localSorts)) !== JSON.stringify(defaultSorts)
      : localSorts.length > 0;
  };

  return (
    <div className={`sort-dropdown ${alignRight ? 'align-right' : ''}`} ref={dropdownRef}>
      <div className="sort-dropdown-title">
        <span>Sort</span>
        {localSorts.length > 0 && (
          <button
            className="sort-dropdown-clear"
            onClick={handleClearAll}
            type="button"
            title="Delete all sorts"
          >
            Delete sort
          </button>
        )}
      </div>
      <div className="sort-dropdown-content">
        {localSorts.length === 0 ? (
          <div className="sort-dropdown-empty">No sorts applied</div>
        ) : (
          localSorts.map((sort, index) => (
            <div
              key={index}
              className={`sort-dropdown-item ${draggedIndex === index ? 'sort-dropdown-item-dragging' : ''} ${dragOverIndex === index && draggedIndex !== index ? 'sort-dropdown-item-drag-over' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
            >
              <div className="sort-dropdown-drag-handle" onMouseDown={(e) => e.stopPropagation()}>
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
              <div className="sort-dropdown-controls">
                <button
                  className="sort-dropdown-move"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  type="button"
                  aria-label="Move up"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M6 2L3 6L9 6L6 2Z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  className="sort-dropdown-move"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === localSorts.length - 1}
                  type="button"
                  aria-label="Move down"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M6 10L3 6L9 6L6 10Z" fill="currentColor" />
                  </svg>
                </button>
              </div>
              <select
                value={sort.field}
                onChange={(e) => handleFieldChange(index, e.target.value)}
                className="sort-dropdown-field"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {Object.entries(sortFields).map(([value, label]) => {
                  // Only show genres/production_company option at index 0 (first position)
                  if ((value === 'genres' || value === 'production_company') && index !== 0) {
                    return null;
                  }
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {!isBooleanSortField(sort.field) && (
                <select
                  value={sort.order}
                  onChange={(e) => handleOrderChange(index, e.target.value)}
                  className="sort-dropdown-order"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              )}
              <button
                className="sort-dropdown-remove"
                onClick={() => handleRemoveSort(index)}
                type="button"
                aria-label="Remove sort"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
      <div className="sort-dropdown-actions">
        <button className="sort-dropdown-add" onClick={handleAddSort} type="button">
          + Add sort
        </button>
        {isDifferentFromDefault() && onSetDefaultSorts && (
          <button className="sort-dropdown-set-default" onClick={handleSetAsDefault} type="button">
            Set as Default
          </button>
        )}
      </div>
    </div>
  );
};

export default SortDropdown;
