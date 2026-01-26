import React, { useState, useEffect, useRef } from 'react';
import './FilterDropdown.css';
import AutocompleteMultiselect from './AutocompleteMultiselect';
import { filterTypes, getLanguageName } from './filterTypes';
import {
  getDirectors,
  getCountries,
  getGenres,
  getOriginalLanguages,
  getProductionCompanies,
  getActors,
  getWriters,
  getProducers,
  getSeenCountries,
  getAvailableStreamingServices,
} from '../services/api';

const FilterDropdown = ({
  filter,
  filterType,
  onUpdate,
  onClose,
  onRemoveFilter,
  allFilters = [],
  alignRight = false,
}) => {
  // Migration: Convert old exclude boolean to new operator field
  const migrateConfig = (config) => {
    if (!config) return config;

    // Migrate old availability filter format (availabilityTypes + services) to new format (values only)
    if (filterType.type === 'availability' && config.availabilityTypes && !config.values) {
      return {
        values: config.availabilityTypes,
        operator: config.operator || 'is',
      };
    }

    // For multiselect filters, migrate exclude to operator
    if ((filterType.type === 'multiselect' || filterType.type === 'streaming_service') && 'exclude' in config && !('operator' in config)) {
      const { exclude, ...restConfig } = config;
      return {
        ...restConfig,
        operator: exclude ? 'is_not' : 'is',
      };
    }

    return config;
  };

  const initialConfig = migrateConfig(filter.config || filterType.defaultConfig);
  const [config, setConfig] = useState(initialConfig);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [operatorDropdownOpen, setOperatorDropdownOpen] = useState(false);
  const [booleanDropdownOpen, setBooleanDropdownOpen] = useState(false);
  const [booleanHighlightedIndex, setBooleanHighlightedIndex] = useState(-1);
  const [streamingServices, setStreamingServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const dropdownRef = useRef(null);
  const operatorDropdownRef = useRef(null);
  const booleanDropdownRef = useRef(null);
  const booleanMenuRef = useRef(null);

  useEffect(() => {
    const loadOptions = async () => {
      if (filterType.type === 'streaming_service') {
        setLoading(true);
        setLoadingServices(true);
        try {
          // Load streaming services
          const servicesData = await getAvailableStreamingServices();
          // API returns { services: [...] } format
          const servicesArray = servicesData?.services || (Array.isArray(servicesData) ? servicesData : []);
          // Services already have id, name, logo_path format from backend
          setStreamingServices(servicesArray);
          setOptions(servicesArray);
        } catch (error) {
          console.error('Error loading streaming services:', error);
        } finally {
          setLoading(false);
          setLoadingServices(false);
        }
      } else if (filterType.type === 'multiselect' || filterType.type === 'availability') {
        setLoading(true);
        try {
          let data = [];
          switch (filterType.field) {
            case 'director':
              const directorsData = await getDirectors();
              // Add "All Favorited Directors" as the first option
              const ALL_FAVORITED_DIRECTORS_OPTION = '__ALL_FAVORITED_DIRECTORS__';
              data = [ALL_FAVORITED_DIRECTORS_OPTION, ...directorsData];
              break;
            case 'country':
              const countriesData = await getCountries();
              const seenCountriesData = await getSeenCountries();
              const seenCountryNames = seenCountriesData?.countries || [];
              // Add "Unseen Countries" as the first option if there are seen countries
              const UNSEEN_COUNTRIES_OPTION = '__UNSEEN_COUNTRIES__';
              if (seenCountryNames.length > 0) {
                data = [UNSEEN_COUNTRIES_OPTION, ...countriesData];
              } else {
                data = countriesData;
              }
              break;
            case 'genre':
              data = await getGenres();
              break;
            case 'original_language':
              data = await getOriginalLanguages();
              break;
            case 'production_company':
              data = await getProductionCompanies();
              break;
            case 'actor':
              data = await getActors();
              break;
            case 'writer':
              data = await getWriters();
              break;
            case 'producer':
              data = await getProducers();
              break;
            case 'availability':
              // Hardcoded availability options
              data = [
                { value: 'for_free', label: 'For Free (including streaming)' },
                { value: 'for_rent', label: 'For Rent' },
                { value: 'to_buy', label: 'To Buy' },
                { value: 'unavailable', label: 'Unavailable' },
              ];
              break;
            default:
              break;
          }
          setOptions(data || []);
        } catch (error) {
          console.error('Error loading options:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    loadOptions();
  }, [filterType]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;

      // Don't close if clicking inside autocomplete dropdown (rendered via portal)
      const isInsideAutocompleteDropdown = target.closest('.autocomplete-dropdown');
      const isAutocompleteOption = target.closest('.autocomplete-option');

      if (isInsideAutocompleteDropdown || isAutocompleteOption) {
        return;
      }

      // Close operator dropdown if clicking outside it (but still inside main dropdown)
      if (operatorDropdownRef.current && !operatorDropdownRef.current.contains(target)) {
        setOperatorDropdownOpen(false);
      }
      // Close boolean dropdown if clicking outside it (but still inside main dropdown)
      if (booleanDropdownRef.current && !booleanDropdownRef.current.contains(target)) {
        setBooleanDropdownOpen(false);
      }
      // Close main dropdown if clicking outside it
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle Escape key to close dropdown
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (operatorDropdownOpen) {
          setOperatorDropdownOpen(false);
        } else if (booleanDropdownOpen) {
          setBooleanDropdownOpen(false);
        } else {
          onClose();
        }
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, operatorDropdownOpen, booleanDropdownOpen]);

  // Scroll highlighted option into view for boolean dropdown
  useEffect(() => {
    if (booleanHighlightedIndex >= 0 && booleanMenuRef.current && booleanDropdownOpen) {
      const highlightedElement = booleanMenuRef.current.children[booleanHighlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [booleanHighlightedIndex, booleanDropdownOpen]);

  const handleUpdate = () => {
    onUpdate(config);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUpdate();
    }
  };

  const handleNumericChange = (field, value) => {
    const numValue = value === '' ? null : parseInt(value);
    setConfig({ ...config, [field]: numValue });
  };

  const handleOperatorChange = (operator) => {
    if (filterType.type === 'numeric_range') {
      setConfig({ ...config, operator, value: null, min: null, max: null });
    } else if (filterType.type === 'multiselect') {
      setConfig({ ...config, operator });
    }
    setOperatorDropdownOpen(false);
  };

  const getOperatorDisplay = () => {
    if (filterType.type === 'multiselect') {
      const operator = config.operator || 'is';
      return operator === 'is_not' ? 'is not' : 'is';
    } else if (filterType.type === 'numeric_range') {
      const operator = config.operator || '<=';
      switch (operator) {
        case '=':
          return '=';
        case '<=':
          return '≤';
        case '>=':
          return '≥';
        case 'between':
          return 'is between';
        default:
          return '≤';
      }
    }
    return null;
  };

  const renderOperatorDropdown = () => {
    if (filterType.type !== 'multiselect' && filterType.type !== 'numeric_range') {
      return null;
    }

    let options = [];
    if (filterType.type === 'multiselect') {
      options = [
        { value: 'is', label: 'is' },
        { value: 'is_not', label: 'is not' },
      ];
    } else if (filterType.type === 'numeric_range') {
      options = [
        { value: '=', label: '=' },
        { value: '<=', label: '≤' },
        { value: '>=', label: '≥' },
        { value: 'between', label: 'is between' },
      ];
    }

    const currentOperator =
      filterType.type === 'multiselect' ? config.operator || 'is' : config.operator || '<=';

    return (
      <div className="filter-dropdown-operator-wrapper" ref={operatorDropdownRef}>
        <button
          type="button"
          className="filter-dropdown-operator-button"
          onClick={() => setOperatorDropdownOpen(!operatorDropdownOpen)}
        >
          <span>{getOperatorDisplay()}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {operatorDropdownOpen && (
          <div className="filter-dropdown-operator-menu">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`filter-dropdown-operator-option ${currentOperator === option.value ? 'active' : ''}`}
                onClick={() => handleOperatorChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBooleanDropdown = (options, currentValue, onChange) => {
    // Find the current option value based on the actual value
    const getCurrentOptionValue = () => {
      if (currentValue === null || currentValue === undefined) {
        return 'all';
      }
      // Find which option matches the current boolean value
      const matchingOption = options.find((opt) => {
        if (opt.value === 'all') return false;
        // For 'in' or 'favorites', value should be true
        if ((opt.value === 'in' || opt.value === 'favorites') && currentValue === true) {
          return true;
        }
        // For 'not' or 'nonfavorites', value should be false
        if ((opt.value === 'not' || opt.value === 'nonfavorites') && currentValue === false) {
          return true;
        }
        return false;
      });
      return matchingOption ? matchingOption.value : 'all';
    };

    const getCurrentDisplayValue = () => {
      const currentOptionValue = getCurrentOptionValue();
      const currentOption = options.find((opt) => opt.value === currentOptionValue);
      return currentOption ? currentOption.label : options[0]?.label || 'All Movies';
    };

    const handleBooleanOptionClick = (optionValue) => {
      let newValue;
      if (optionValue === 'all') {
        newValue = null;
      } else if (optionValue === 'in' || optionValue === 'favorites') {
        newValue = true;
      } else {
        newValue = false;
      }
      onChange(newValue);
      setBooleanDropdownOpen(false);
      setBooleanHighlightedIndex(-1);
    };

    const handleBooleanKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!booleanDropdownOpen) {
          setBooleanDropdownOpen(true);
          setBooleanHighlightedIndex(0);
        } else {
          setBooleanHighlightedIndex((prev) =>
            prev < options.length - 1 ? prev + 1 : prev
          );
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (booleanDropdownOpen) {
          setBooleanHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setBooleanDropdownOpen(false);
        setBooleanHighlightedIndex(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (booleanDropdownOpen && booleanHighlightedIndex >= 0) {
          handleBooleanOptionClick(options[booleanHighlightedIndex].value);
        } else if (!booleanDropdownOpen) {
          setBooleanDropdownOpen(true);
          setBooleanHighlightedIndex(0);
        }
      }
    };

    const currentOptionValue = getCurrentOptionValue();

    return (
      <div className="filter-dropdown-boolean-wrapper" ref={booleanDropdownRef}>
        <button
          type="button"
          className="filter-dropdown-boolean-button"
          onClick={() => {
            setBooleanDropdownOpen(!booleanDropdownOpen);
            if (!booleanDropdownOpen) {
              setBooleanHighlightedIndex(-1);
            }
          }}
          onKeyDown={handleBooleanKeyDown}
          autoFocus
        >
          <span>{getCurrentDisplayValue()}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {booleanDropdownOpen && (
          <div className="filter-dropdown-boolean-menu" ref={booleanMenuRef}>
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={`filter-dropdown-boolean-option ${
                  currentOptionValue === option.value ? 'active' : ''
                } ${index === booleanHighlightedIndex ? 'highlighted' : ''}`}
                onClick={() => handleBooleanOptionClick(option.value)}
                onMouseEnter={() => setBooleanHighlightedIndex(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (filterType.type === 'text') {
      return (
        <div className="filter-dropdown-content">
          <input
            type="text"
            value={config.value || ''}
            onChange={(e) => setConfig({ ...config, value: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Search movies..."
            className="filter-dropdown-input"
            autoFocus
          />
        </div>
      );
    }

    if (filterType.type === 'select') {
      // Single-select dropdown for filters like availability
      const options = [
        { value: 'for_free', label: 'For Free (including streaming)' },
        { value: 'for_rent', label: 'For Rent' },
        { value: 'to_buy', label: 'To Buy' },
        { value: 'unavailable', label: 'Unavailable' },
      ];

      return (
        <div className="filter-dropdown-content">
          <select
            value={config.value || ''}
            onChange={(e) => setConfig({ ...config, value: e.target.value || null })}
            className="filter-dropdown-select"
            autoFocus
          >
            <option value="">All Movies</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (filterType.type === 'boolean') {
      // Special handling for collection and favorites filters (needs 3 states: null, true, false)
      if (filterType.field === 'collection') {
        const options = [
          { value: 'all', label: 'All Movies' },
          { value: 'in', label: 'In Collection' },
          { value: 'not', label: 'Not in Collection' },
        ];
        return (
          <div className="filter-dropdown-content">
            {renderBooleanDropdown(
              options,
              config.value,
              (newValue) => setConfig({ ...config, value: newValue })
            )}
          </div>
        );
      }
      if (filterType.field === 'favorites_only') {
        const options = [
          { value: 'all', label: 'All Movies' },
          { value: 'favorites', label: 'Favorites' },
          { value: 'nonfavorites', label: 'Non-favorites' },
        ];
        return (
          <div className="filter-dropdown-content">
            {renderBooleanDropdown(
              options,
              config.value,
              (newValue) => setConfig({ ...config, value: newValue })
            )}
          </div>
        );
      }
      // Default boolean filter (select dropdown) - for tracked lists and other boolean filters
      // Use 3-state logic: null (all), true (in list), false (not in list)
      const options = [
        { value: 'all', label: 'All Movies' },
        { value: 'in', label: `In ${filterType.label}` },
        { value: 'not', label: `Not in ${filterType.label}` },
      ];
      return (
        <div className="filter-dropdown-content">
          {renderBooleanDropdown(
            options,
            config.value,
            (newValue) => setConfig({ ...config, value: newValue })
          )}
        </div>
      );
    }

    if (filterType.type === 'numeric_range') {
      const isBetween = config.operator === 'between';
      return (
        <div className="filter-dropdown-content">
          {isBetween ? (
            <div className="filter-dropdown-range">
              <input
                type="number"
                value={config.min !== null && config.min !== undefined ? config.min : ''}
                onChange={(e) => handleNumericChange('min', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Min"
                className="filter-dropdown-input"
                autoFocus
              />
              <span>to</span>
              <input
                type="number"
                value={config.max !== null && config.max !== undefined ? config.max : ''}
                onChange={(e) => handleNumericChange('max', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Max"
                className="filter-dropdown-input"
              />
            </div>
          ) : (
            <div className="filter-dropdown-single">
              <input
                type="number"
                value={config.value !== null && config.value !== undefined ? config.value : ''}
                onChange={(e) => handleNumericChange('value', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Value"
                className="filter-dropdown-input"
                autoFocus
                step="1"
              />
            </div>
          )}
        </div>
      );
    }

    if (filterType.type === 'streaming_service') {
      // Custom UI for streaming service filter
      return (
        <div className="filter-dropdown-content">
          <div className="filter-dropdown-multiselect">
            <AutocompleteMultiselect
              options={options}
              selected={config.values || []}
              onChange={(selected) => {
                setConfig({ ...config, values: selected });
              }}
              placeholder="Select streaming services..."
              getDisplayValue={(option) => {
                if (typeof option === 'object' && option !== null) {
                  return option.name || option.provider_name || option.id || option;
                }
                return option;
              }}
              getOptionValue={(option) => {
                if (typeof option === 'object' && option !== null) {
                  return option.id || option.provider_id || option;
                }
                return option;
              }}
              isLoading={loading}
              onEnterKey={handleUpdate}
            />
          </div>
        </div>
      );
    }

    if (filterType.type === 'multiselect' || filterType.type === 'availability') {
      let getDisplayValue = filterType.field === 'original_language' ? getLanguageName : undefined;

      // Handle special "All Favorited Directors" option for director field
      if (filterType.field === 'director') {
        getDisplayValue = (option) => {
          if (option === '__ALL_FAVORITED_DIRECTORS__') {
            return 'All Favorited Directors';
          }
          return option;
        };
      }

      // Handle special "Unseen Countries" option for country field
      if (filterType.field === 'country') {
        const originalGetDisplayValue = getDisplayValue;
        getDisplayValue = (option) => {
          if (option === '__UNSEEN_COUNTRIES__') {
            return 'Unseen Countries';
          }
          if (originalGetDisplayValue) {
            return originalGetDisplayValue(option);
          }
          return option;
        };
      }

      return (
        <div className="filter-dropdown-content">
          <div className="filter-dropdown-multiselect">
            <AutocompleteMultiselect
              options={options}
              selected={config.values || []}
              onChange={(selected) => {
                setConfig({ ...config, values: selected });
              }}
              placeholder={
                filterType.field === 'availability'
                  ? 'Select availability types...'
                  : `Type to search ${filterType.label.toLowerCase()}...`
              }
              getDisplayValue={
                filterType.field === 'availability'
                  ? (option) => (typeof option === 'object' ? option.label : option)
                  : getDisplayValue
              }
              getOptionValue={
                filterType.field === 'availability'
                  ? (option) => (typeof option === 'object' ? option.value : option)
                  : undefined
              }
              isLoading={loading}
              onEnterKey={handleUpdate}
            />
          </div>
        </div>
      );
    }

    if (filterType.type === 'or_group') {
      // Get available list filters for OR group
      const availableListFilters = Object.values(filterTypes).filter(
        (ft) => ft.field && ft.field.startsWith('is_')
      );

      // Get currently selected filter fields
      const selectedFilterFields = new Set((config.filters || []).map((f) => f.field || f.type));

      // Filter out already selected filters
      const availableFilters = availableListFilters.filter(
        (ft) => !selectedFilterFields.has(ft.field)
      );

      // Also exclude filters from other OR groups
      const otherOrGroupFilters = new Set();
      allFilters.forEach((f) => {
        if (f.type === 'or_group' && f.id !== filter.id && f.config?.filters) {
          f.config.filters.forEach((gf) => {
            otherOrGroupFilters.add(gf.field || gf.type);
          });
        }
      });

      const trulyAvailableFilters = availableFilters.filter(
        (ft) => !otherOrGroupFilters.has(ft.field)
      );

      return (
        <div className="filter-dropdown-content">
          <div className="filter-dropdown-or-group">
            <div className="filter-dropdown-or-group-info">
              <p>This is an OR group. Filters in this group are combined with OR logic.</p>
            </div>
            <div className="filter-dropdown-or-group-filters">
              {config.filters && config.filters.length > 0 ? (
                config.filters.map((f, index) => {
                  const fType = filterTypes[f.type || f.field];
                  return (
                    <div key={f.id || index} className="filter-dropdown-or-group-item">
                      <span>{fType?.label || f.type || f.field}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newFilters = config.filters.filter((_, i) => i !== index);
                          setConfig({ ...config, filters: newFilters });
                        }}
                        className="filter-dropdown-or-group-remove"
                        aria-label="Remove filter"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="filter-dropdown-empty">No filters in group</div>
              )}
            </div>
            {showAddFilter ? (
              <div className="filter-dropdown-or-group-add-section">
                <div className="filter-dropdown-or-group-available">
                  {trulyAvailableFilters.length === 0 ? (
                    <div className="filter-dropdown-empty">No filters available</div>
                  ) : (
                    trulyAvailableFilters.map((ft) => (
                      <button
                        key={ft.field}
                        type="button"
                        className="filter-dropdown-or-group-filter-option"
                        onClick={() => {
                          const newFilter = {
                            id: `${ft.field}-${Date.now()}`,
                            type: ft.field,
                            field: ft.field,
                            config: { ...ft.defaultConfig, value: true },
                          };
                          const newFilters = [...(config.filters || []), newFilter];
                          setConfig({ ...config, filters: newFilters });
                          setShowAddFilter(false);
                        }}
                      >
                        {ft.label}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddFilter(false)}
                  className="filter-dropdown-or-group-cancel"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddFilter(true)}
                className="filter-dropdown-or-group-add"
              >
                + Add Filter to Group
              </button>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`filter-dropdown ${alignRight ? 'align-right' : ''}`} ref={dropdownRef}>
      <div className="filter-dropdown-title">
        <div className="filter-dropdown-title-left">
          <span>{filterType.label}</span>
          {renderOperatorDropdown()}
        </div>
        <button
          className="filter-dropdown-close"
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
      {renderContent()}
      <div className="filter-dropdown-actions">
        {filterType.type === 'or_group' && config.filters && config.filters.length === 0 && (
          <button
            className="filter-dropdown-remove"
            onClick={() => {
              if (onRemoveFilter) {
                onRemoveFilter(filter.id);
              }
              onClose();
            }}
            type="button"
          >
            Remove Group
          </button>
        )}
        <button className="filter-dropdown-apply" onClick={handleUpdate} type="button">
          Apply
        </button>
      </div>
    </div>
  );
};

export default FilterDropdown;
