import { normalizeCountryName, getLanguageName, languageNames } from '../utils/formatting';

// Re-export for backwards compatibility
export { getLanguageName, languageNames };

// Mapping from CSV filename (without .csv) to human-readable list name
export const trackedListNames = {
  'letterboxd-t250': "Letterboxd's Top 250",
  'imdb-t250': "IMDb's Top 250",
  'ss-t250': "Sight and Sound's Top 250",
  'best-picture': "Oscar's Best Picture Winners",
  '4-stars': '4+ Stars on Letterboxd',
  '38-stars': '3.8+ Stars on Letterboxd',
  '1m-views': '1M+ Views on Letterboxd',
};

// Helper function to convert filename to column name (matches backend logic)
const filenameToColumnName = (filename) => {
  // Remove .csv extension if present
  const name = filename.replace(/\.csv$/, '');
  // Convert to snake_case and add 'is_' prefix
  return 'is_' + name.replace(/[-\s]+/g, '_').toLowerCase();
};

// Generate filter types for tracked lists
const generateTrackedListFilters = () => {
  const listFilters = {};
  for (const [filename, displayName] of Object.entries(trackedListNames)) {
    const columnName = filenameToColumnName(filename);
    listFilters[columnName] = {
      label: displayName,
      field: columnName,
      type: 'boolean',
      defaultConfig: { value: true },
      formatDisplay: (config) => {
        if (config.value === true) return displayName;
        if (config.value === false) return `Not in ${displayName}`;
        return displayName;
      },
      getApiParams: (config) => {
        // We'll need to merge all list filters into a single list_filters JSON parameter
        // This will be handled in the API service
        return {
          [columnName]: config.value !== null && config.value !== undefined ? config.value : null,
        };
      },
    };
  }
  return listFilters;
};

// Filter type definitions
const baseFilterTypes = {
  search: {
    label: 'Search Title',
    field: 'search',
    type: 'text',
    defaultConfig: { value: '' },
    formatDisplay: (config) => (config.value ? `Search: ${config.value}` : 'Search'),
    getApiParams: (config) => ({ search: config.value || null }),
  },
  favorites_only: {
    label: 'Favorites',
    field: 'favorites_only',
    type: 'boolean',
    defaultConfig: { value: true },
    formatDisplay: (config) => {
      if (config.value === true) return 'Favorites';
      if (config.value === false) return 'Non-favorites';
      return 'Favorites';
    },
    getApiParams: (config) => ({
      favorites_only: config.value !== null && config.value !== undefined ? config.value : null,
    }),
  },
  seen_before: {
    label: 'Seen Before',
    field: 'seen_before',
    type: 'boolean',
    defaultConfig: { value: true },
    formatDisplay: (config) => {
      if (config.value === true) return 'Seen Before';
      if (config.value === false) return 'Not Seen Before';
      return 'Seen Before';
    },
    getApiParams: (config) => ({
      seen_before: config.value !== null && config.value !== undefined ? config.value : null,
    }),
  },
  favorited_directors_only: {
    label: 'All Favorited Directors',
    field: 'favorited_directors_only',
    type: 'boolean',
    defaultConfig: { value: true },
    formatDisplay: (config) => {
      if (config.value === true) return 'All Favorited Directors';
      return 'All Favorited Directors';
    },
    getApiParams: (config) => ({
      favorited_directors_only: config.value === true ? true : null,
    }),
  },
  year: {
    label: 'Year',
    field: 'year',
    type: 'numeric_range',
    defaultConfig: { operator: 'between', min: null, max: null },
    formatDisplay: (config) => {
      if (config.operator === 'between') {
        if (config.min && config.max) return `Year: ${config.min}-${config.max}`;
        if (config.min) return `Year >= ${config.min}`;
        if (config.max) return `Year <= ${config.max}`;
        return 'Year';
      } else if (config.operator === '<=') {
        return `Year ≤ ${config.value}`;
      } else if (config.operator === '>=') {
        return `Year ≥ ${config.value}`;
      } else if (config.operator === '=') {
        return `Year = ${config.value}`;
      }
      return 'Year';
    },
    getApiParams: (config) => {
      const params = {};
      if (config.operator === 'between') {
        if (config.min !== null && config.min !== undefined) params.year_min = config.min;
        if (config.max !== null && config.max !== undefined) params.year_max = config.max;
      } else if (config.operator === '<=') {
        params.year_max = config.value;
      } else if (config.operator === '>=') {
        params.year_min = config.value;
      } else if (config.operator === '=') {
        params.year_min = config.value;
        params.year_max = config.value;
      }
      return params;
    },
  },
  runtime: {
    label: 'Length',
    field: 'runtime',
    type: 'numeric_range',
    defaultConfig: { operator: '<=', value: null },
    formatDisplay: (config) => {
      if (config.operator === 'between') {
        if (config.min && config.max) return `Length: ${config.min}-${config.max}`;
        if (config.min) return `Length ≥ ${config.min}`;
        if (config.max) return `Length ≤ ${config.max}`;
        return 'Length';
      }
      if (config.value !== null && config.value !== undefined) {
        const operatorSymbol =
          config.operator === '='
            ? '='
            : config.operator === '<='
              ? '≤'
              : config.operator === '>='
                ? '≥'
                : config.operator;
        return `Length ${operatorSymbol} ${config.value}`;
      }
      return 'Length';
    },
    getApiParams: (config) => {
      const params = {};
      if (config.operator === '<=') {
        params.runtime_max = config.value;
      } else if (config.operator === '>=') {
        params.runtime_min = config.value;
      } else if (config.operator === '=') {
        params.runtime_min = config.value;
        params.runtime_max = config.value;
      } else if (config.operator === 'between') {
        if (config.min !== null && config.min !== undefined) params.runtime_min = config.min;
        if (config.max !== null && config.max !== undefined) params.runtime_max = config.max;
      }
      return params;
    },
  },
  director: {
    label: 'Director',
    field: 'director',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const ALL_FAVORITED_DIRECTORS_OPTION = '__ALL_FAVORITED_DIRECTORS__';
        // Check if "All Favorited Directors" is selected
        const hasAllFavorited = config.values.includes(ALL_FAVORITED_DIRECTORS_OPTION);

        if (hasAllFavorited) {
          // If "All Favorited Directors" is selected, show that
          const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
          // Filter out the special option and show regular directors if any
          const regularDirectors = config.values.filter(
            (v) => v !== ALL_FAVORITED_DIRECTORS_OPTION
          );
          if (regularDirectors.length > 0) {
            return `${prefix}Director: All Favorited Directors, ${regularDirectors.join(', ')}`;
          }
          return `${prefix}Director: All Favorited Directors`;
        }

        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        return `${prefix}Director: ${config.values.join(', ')}`;
      }
      return 'Director';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        const ALL_FAVORITED_DIRECTORS_OPTION = '__ALL_FAVORITED_DIRECTORS__';
        const hasAllFavorited = config.values.includes(ALL_FAVORITED_DIRECTORS_OPTION);

        // Filter out the special option from regular director values
        const regularDirectors = config.values.filter((v) => v !== ALL_FAVORITED_DIRECTORS_OPTION);

        const params = {};

        // If "All Favorited Directors" is selected, set favorited_directors_only
        if (hasAllFavorited) {
          params.favorited_directors_only = true;
        }

        // If there are regular directors selected, include them
        if (regularDirectors.length > 0) {
          if (config.operator === 'is_not') {
            params.director = regularDirectors;
            params.director_exclude = true;
          } else {
            params.director = regularDirectors;
          }
        }

        // If only "All Favorited Directors" is selected, return just that
        if (hasAllFavorited && regularDirectors.length === 0) {
          return params;
        }

        // If both are selected, return both
        if (hasAllFavorited && regularDirectors.length > 0) {
          return params;
        }

        // Otherwise, return regular director filter
        if (regularDirectors.length > 0) {
          return config.operator === 'is_not'
            ? { director: regularDirectors, director_exclude: true }
            : { director: regularDirectors };
        }
      }
      return { director: null };
    },
  },
  country: {
    label: 'Country',
    field: 'country',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        const normalizedValues = config.values.map((v) => {
          if (v === '__UNSEEN_COUNTRIES__') return 'Unseen Countries';
          return normalizeCountryName(v);
        });
        return `${prefix}Country: ${normalizedValues.join(', ')}`;
      }
      return 'Country';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        // Check if "Unseen Countries" is selected
        const hasUnseenCountries = config.values.includes('__UNSEEN_COUNTRIES__');
        const regularCountries = config.values.filter((v) => v !== '__UNSEEN_COUNTRIES__');

        const params = {};
        if (hasUnseenCountries) {
          params.exclude_seen_countries = true;
        }
        if (regularCountries.length > 0) {
          if (config.operator === 'is_not') {
            params.country = regularCountries;
            params.country_exclude = true;
          } else {
            params.country = regularCountries;
          }
        }
        return params;
      }
      return { country: null };
    },
  },
  genre: {
    label: 'Genre',
    field: 'genre',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        return `${prefix}Genre: ${config.values.join(', ')}`;
      }
      return 'Genre';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        return config.operator === 'is_not'
          ? { genre: config.values, genre_exclude: true }
          : { genre: config.values };
      }
      return { genre: null };
    },
  },
  original_language: {
    label: 'Language',
    field: 'original_language',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        const langNames = config.values.map(getLanguageName);
        // Show first language if only one, otherwise show count
        if (langNames.length === 1) {
          return `${prefix}Language: ${langNames[0]}`;
        }
        return `${prefix}Language: ${langNames[0]}${langNames.length > 1 ? ` +${langNames.length - 1}` : ''}`;
      }
      return 'Language';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        return config.operator === 'is_not'
          ? { original_language: config.values, original_language_exclude: true }
          : { original_language: config.values };
      }
      return { original_language: null };
    },
  },
  production_company: {
    label: 'Production Company',
    field: 'production_company',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        return `${prefix}Production Company: ${config.values.join(', ')}`;
      }
      return 'Production Company';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        return config.operator === 'is_not'
          ? { production_company: config.values, production_company_exclude: true }
          : { production_company: config.values };
      }
      return { production_company: null };
    },
  },
  actor: {
    label: 'Actor',
    field: 'actor',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        return `${prefix}Actor: ${config.values.join(', ')}`;
      }
      return 'Actor';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        return config.operator === 'is_not'
          ? { actor: config.values, actor_exclude: true }
          : { actor: config.values };
      }
      return { actor: null };
    },
  },
  writer: {
    label: 'Writer',
    field: 'writer',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        return `${prefix}Writer: ${config.values.join(', ')}`;
      }
      return 'Writer';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        return config.operator === 'is_not'
          ? { writer: config.values, writer_exclude: true }
          : { writer: config.values };
      }
      return { writer: null };
    },
  },
  producer: {
    label: 'Producer',
    field: 'producer',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        return `${prefix}Producer: ${config.values.join(', ')}`;
      }
      return 'Producer';
    },
    getApiParams: (config) => {
      if (config.values && config.values.length > 0) {
        return config.operator === 'is_not'
          ? { producer: config.values, producer_exclude: true }
          : { producer: config.values };
      }
      return { producer: null };
    },
  },
  collection: {
    label: 'In a Collection',
    field: 'collection',
    type: 'boolean',
    defaultConfig: { value: true },
    formatDisplay: (config) => {
      if (config.value === true) return 'In Collection';
      if (config.value === false) return 'Not in Collection';
      return 'In a Collection';
    },
    getApiParams: (config) => ({
      collection: config.value !== null && config.value !== undefined ? config.value : null,
    }),
  },
  date_added: {
    label: 'Date Added',
    field: 'date_added',
    type: 'numeric_range',
    defaultConfig: { operator: 'between', min: null, max: null },
    formatDisplay: (config) => {
      if (config.operator === 'between') {
        if (config.min && config.max) return `Date Added: ${config.min}-${config.max}`;
        if (config.min) return `Date Added >= ${config.min}`;
        if (config.max) return `Date Added <= ${config.max}`;
        return 'Date Added';
      } else if (config.operator === '<=') {
        return `Date Added ≤ ${config.value}`;
      } else if (config.operator === '>=') {
        return `Date Added ≥ ${config.value}`;
      } else if (config.operator === '=') {
        return `Date Added = ${config.value}`;
      }
      return 'Date Added';
    },
    getApiParams: (config) => {
      const params = {};
      if (config.operator === 'between') {
        if (config.min !== null && config.min !== undefined) params.date_added_min = config.min;
        if (config.max !== null && config.max !== undefined) params.date_added_max = config.max;
      } else if (config.operator === '<=') {
        params.date_added_max = config.value;
      } else if (config.operator === '>=') {
        params.date_added_min = config.value;
      } else if (config.operator === '=') {
        params.date_added_min = config.value;
        params.date_added_max = config.value;
      }
      return params;
    },
  },
  availability: {
    label: 'Availability',
    field: 'availability',
    type: 'multiselect',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config) => {
      if (config.values && config.values.length > 0) {
        const labels = {
          for_free: 'For Free (including streaming)',
          for_rent: 'For Rent',
          to_buy: 'To Buy',
          unavailable: 'Unavailable',
        };
        const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
        // Extract value from objects if needed, otherwise use directly
        const displayValues = config.values.map((v) => {
          const value = typeof v === 'object' ? v.value : v;
          return labels[value] || value || (typeof v === 'object' ? v.label : v);
        });
        return `${prefix}Availability: ${displayValues.join(', ')}`;
      }
      return 'Availability';
    },
    getApiParams: (config, countryCode = 'US', preferredServices = []) => {
      if (config.values && config.values.length > 0) {
        // Extract value from objects if they're objects, otherwise use directly
        const availabilityTypes = config.values
          .map((v) => (typeof v === 'object' ? v.value : v))
          .filter((v) => v != null);
        if (availabilityTypes.length > 0) {
          // Only include preferred_services if they're provided (from streaming_service filter or settings)
          // If no services provided, availability filter won't work (needs services to check)
          return {
            availability_type: availabilityTypes,
            preferred_services: preferredServices && preferredServices.length > 0 ? preferredServices : null,
            watch_region: countryCode,
            availability_exclude: config.operator === 'is_not',
          };
        }
      }
      return { availability_type: null, preferred_services: null, watch_region: null };
    },
  },
  streaming_service: {
    label: 'Streaming Service',
    field: 'streaming_service',
    type: 'streaming_service',
    defaultConfig: { values: [], operator: 'is' },
    formatDisplay: (config, streamingServicesMap = {}) => {
      if (config.values && config.values.length > 0) {
        const serviceNames = config.values
          .map((serviceId) => {
            // Handle different formats: object with id/name, or just ID
            if (typeof serviceId === 'object' && serviceId !== null) {
              return serviceId.name || serviceId.provider_name || serviceId.id || serviceId;
            }
            // If it's a number/string ID, try to look it up in the map
            const service = streamingServicesMap[serviceId];
            if (service) {
              return typeof service === 'string' ? service : service.name || service.provider_name || serviceId;
            }
            // Fallback: show ID if no name found
            return serviceId;
          })
          .filter(Boolean);
        if (serviceNames.length > 0) {
          const prefix = config.operator === 'is_not' ? 'Exclude ' : '';
          // Show first service name, or count if multiple
          if (serviceNames.length === 1) {
            return `${prefix}Streaming Service: ${serviceNames[0]}`;
          } else {
            return `${prefix}Streaming Service: ${serviceNames[0]}${serviceNames.length > 1 ? ` +${serviceNames.length - 1}` : ''}`;
          }
        }
      }
      return 'Streaming Service';
    },
    getApiParams: (config, countryCode = 'US') => {
      if (config.values && config.values.length > 0) {
        // Extract service IDs from objects if they're objects, otherwise use directly
        const serviceIds = config.values
          .map((v) => {
            if (typeof v === 'object' && v !== null) {
              return v.id || v.provider_id || v;
            }
            return v;
          })
          .filter((v) => v != null);
        if (serviceIds.length > 0) {
          return {
            preferred_services: serviceIds,
            watch_region: countryCode,
            // Always filter for free/streaming when streaming service is selected
            availability_type: ['for_free'],
          };
        }
      }
      return { preferred_services: null, watch_region: null, availability_type: null };
    },
  },
};

// Merge base filter types with tracked list filters first
const allFilterTypes = {
  ...baseFilterTypes,
  ...generateTrackedListFilters(),
};

// OR Group filter type (needs access to allFilterTypes)
const orGroupFilterType = {
  or_group: {
    label: 'OR Group',
    field: 'or_group',
    type: 'or_group',
    defaultConfig: { filters: [] },
    formatDisplay: (config) => {
      if (!config.filters || config.filters.length === 0) {
        return 'OR Group (empty)';
      }
      return config.filters
        .map((f) => {
          const filterType = allFilterTypes[f.type];
          if (filterType && filterType.formatDisplay) {
            return filterType.formatDisplay(f.config);
          }
          return filterType?.label || f.type;
        })
        .join(' OR ');
    },
    getApiParams: (config) => {
      // Extract list filters from the OR group
      const listFilters = [];
      config.filters.forEach((f) => {
        const filterType = allFilterTypes[f.type];
        if (filterType && filterType.getApiParams) {
          const apiParams = filterType.getApiParams(f.config);
          Object.keys(apiParams).forEach((key) => {
            if (key.startsWith('is_')) {
              listFilters.push(key);
            }
          });
        }
      });
      return { or_group_list_filters: listFilters };
    },
  },
};

// Merge base filter types with tracked list filters and OR group
export const filterTypes = {
  ...allFilterTypes,
  ...orGroupFilterType,
};

// Generate sort fields for tracked lists
const generateTrackedListSortFields = () => {
  const listSortFields = {};
  for (const [filename, displayName] of Object.entries(trackedListNames)) {
    const columnName = filenameToColumnName(filename);
    listSortFields[columnName] = displayName;
  }
  return listSortFields;
};

export const sortFields = {
  // String/text columns
  title: 'Title',
  director: 'Director',
  country: 'Country',
  original_language: 'Language',
  production_company: 'Production Company',
  // Numeric columns
  year: 'Release Date',
  runtime: 'Length',
  // JSON array columns
  genres: 'Genres',
  // Boolean columns (favorites is handled separately, not sortable)
  in_collection: 'In a Collection',
  // Date columns
  date_added: 'Date Added',
  // Tracked list columns (dynamically added)
  ...generateTrackedListSortFields(),
};
