import React, { useState, useEffect, useRef } from 'react';
import './OrGroupCreator.css';
import { filterTypes } from './filterTypes';

const OrGroupCreator = ({
  availableFilters,
  onCreate,
  onClose,
  existingFilters = [],
  initialFilters = [],
}) => {
  // Initialize with existing filters if provided (for editing OR groups)
  const [selectedFilters, setSelectedFilters] = useState(() => {
    if (initialFilters && initialFilters.length > 0) {
      return initialFilters.map((f, index) => ({
        id: f.id || `${f.type || f.field}-${Date.now()}-${index}`,
        type: f.type || f.field,
        field: f.field || f.type, // Include both for consistency
        config: f.config || { value: true },
      }));
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const creatorRef = useRef(null);

  // Get filters that can be used in OR groups (only list filters for now, but can be extended)
  const orGroupableFilters = availableFilters.filter((filter) => {
    // For now, only allow list filters (those starting with 'is_') in OR groups
    // This can be extended to support other filter types
    return filter.field && filter.field.startsWith('is_');
  });

  const filteredFilters = orGroupableFilters.filter((filter) =>
    filter.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Exclude filters that are already in other OR groups (but not the current one being edited)
  // We want to allow selecting filters that are already in the current group (they'll be shown as selected)
  const activeFilterFields = new Set(
    existingFilters
      .filter((f) => f.type !== 'or_group') // Don't exclude other OR groups
      .map((f) => f.type)
  );

  const availableForSelection = filteredFilters.filter(
    (filter) => !activeFilterFields.has(filter.field)
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (creatorRef.current && !creatorRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle Escape key to close creator
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

  const handleToggleFilter = (filter) => {
    setSelectedFilters((prev) => {
      // Check if filter is already selected (by field or type)
      const isSelected = prev.some((f) => (f.field || f.type) === filter.field);
      if (isSelected) {
        return prev.filter((f) => (f.field || f.type) !== filter.field);
      } else {
        // Create a filter config with default value (true for list filters)
        return [
          ...prev,
          {
            id: `${filter.field}-${Date.now()}`,
            type: filter.field,
            field: filter.field, // Include both for consistency
            config: { ...filter.defaultConfig, value: true },
          },
        ];
      }
    });
  };

  const handleCreate = () => {
    if (selectedFilters.length === 0) {
      return;
    }

    // If we have initialFilters, we're editing an existing group
    // In that case, just return the selected filters (which includes existing + new)
    if (initialFilters && initialFilters.length > 0) {
      onCreate(selectedFilters);
      onClose();
      return;
    }

    // If only one filter selected, just add it as a regular filter
    if (selectedFilters.length === 1) {
      onCreate(selectedFilters[0]);
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

    onCreate(orGroup);
    onClose();
  };

  const handleRemoveFilter = (filterField) => {
    setSelectedFilters((prev) => prev.filter((f) => (f.field || f.type) !== filterField));
  };

  return (
    <div className="or-group-creator" ref={creatorRef}>
      <div className="or-group-creator-header">
        <h3>{initialFilters && initialFilters.length > 0 ? 'Edit OR Group' : 'Create OR Group'}</h3>
        <button
          className="or-group-creator-close"
          onClick={onClose}
          type="button"
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="or-group-creator-content">
        <div className="or-group-creator-search">
          <input
            type="text"
            placeholder="Search filters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="or-group-creator-input"
            autoFocus
          />
        </div>

        <div className="or-group-creator-selected">
          <div className="or-group-creator-selected-label">Selected Filters:</div>
          {selectedFilters.length === 0 ? (
            <div className="or-group-creator-empty">No filters selected</div>
          ) : (
            <div className="or-group-creator-selected-list">
              {selectedFilters.map((filter) => {
                const filterType = filterTypes[filter.type || filter.field];
                const filterKey = filter.field || filter.type;
                return (
                  <div key={filterKey} className="or-group-creator-selected-item">
                    <span>{filterType?.label || filter.type || filter.field}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFilter(filterKey)}
                      className="or-group-creator-remove"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="or-group-creator-preview">
          {selectedFilters.length > 0 && (
            <div className="or-group-creator-preview-text">
              Preview:{' '}
              {selectedFilters.map((f) => filterTypes[f.type]?.label || f.type).join(' OR ')}
            </div>
          )}
        </div>

        <div className="or-group-creator-available">
          <div className="or-group-creator-available-label">Available Filters:</div>
          <div className="or-group-creator-list">
            {availableForSelection.length === 0 ? (
              <div className="or-group-creator-empty">No filters available</div>
            ) : (
              availableForSelection.map((filter) => {
                // Check if filter is selected (by field or type)
                const isSelected = selectedFilters.some(
                  (f) => (f.field || f.type) === filter.field
                );
                return (
                  <button
                    key={filter.field}
                    className={`or-group-creator-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleFilter(filter)}
                    type="button"
                  >
                    <span className="or-group-creator-checkbox">{isSelected ? '✓' : ''}</span>
                    <span className="or-group-creator-label">{filter.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="or-group-creator-actions">
        <button className="or-group-creator-cancel" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="or-group-creator-create"
          onClick={handleCreate}
          type="button"
          disabled={selectedFilters.length === 0}
        >
          {selectedFilters.length === 1 ? 'Add Filter' : 'Create OR Group'}
        </button>
      </div>
    </div>
  );
};

export default OrGroupCreator;
