import React, { useState, useEffect } from 'react';
import './SettingsModal.css';
import {
  getAvailableStreamingServices,
  getSeenCountries,
  addSeenCountry,
  removeSeenCountry,
} from '../services/api';
import { getStoredCountry, setStoredCountry, getCommonCountries } from '../utils/countryDetection';

// Complete list of all countries from Letterboxd
const ALL_COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'American Samoa',
  'Andorra',
  'Angola',
  'Anguilla',
  'Antarctica',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Aruba',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bermuda',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Bouvet Island',
  'Brazil',
  'British Indian Ocean Territory',
  'British Virgin Islands',
  'Brunei Darussalam',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cayman Islands',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Christmas Island',
  'Cocos (Keeling) Islands',
  'Colombia',
  'Comoros',
  'Congo',
  'Cook Islands',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czechia',
  'Czechoslovakia',
  'Democratic Republic of Congo',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'East Germany',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Falkland Islands',
  'Faroe Islands',
  'Federated States of Micronesia',
  'Fiji',
  'Finland',
  'France',
  'French Guiana',
  'French Polynesia',
  'French Southern Territories',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Gibraltar',
  'Greece',
  'Greenland',
  'Grenada',
  'Guadeloupe',
  'Guam',
  'Guatemala',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Heard Island and McDonald Islands',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Kosovo',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Macao',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Martinique',
  'Mauritania',
  'Mauritius',
  'Mayotte',
  'Mexico',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Montserrat',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'Netherlands Antilles',
  'New Caledonia',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'Niue',
  'Norfolk Island',
  'Northern Mariana Islands',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Pitcairn',
  'Poland',
  'Portugal',
  'Puerto Rico',
  'Qatar',
  'Réunion',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Helena, Ascension and Tristan da Cunha',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Pierre and Miquelon',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Serbia and Montenegro',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Georgia and the South Sandwich Islands',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'State of Palestine',
  'Sudan',
  'Suriname',
  'Svalbard and Jan Mayen',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tokelau',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Turks and Caicos Islands',
  'Tuvalu',
  'Uganda',
  'UK',
  'Ukraine',
  'United Arab Emirates',
  'United States Minor Outlying Islands',
  'Uruguay',
  'USA',
  'USSR',
  'US Virgin Islands',
  'Uzbekistan',
  'Vanuatu',
  'Vatican City',
  'Venezuela',
  'Vietnam',
  'Wallis and Futuna',
  'Western Sahara',
  'Yemen',
  'Yugoslavia',
  'Zambia',
  'Zimbabwe',
].sort();

const STORAGE_KEY = 'preferred_streaming_services';
const COUNTRY_STORAGE_KEY = 'streaming_country_code';
const STATS_SETTINGS_KEY = 'stats_customization_settings';

// Popular services to show in a separate section
const POPULAR_SERVICES = [
  'Amazon Prime Video',
  'Apple TV',
  'Criterion Channel',
  'Crunchyroll',
  'Disney+',
  'HBO Max',
  'Hulu',
  'MUBI',
  'Netflix',
  'Paramount Plus',
  'Peacock Premium',
  'Plex',
  'Tubi',
  'Youtube',
];

const normalizeForMatching = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace('+', ' plus')
    .replace('&', ' and')
    .replace(' and ', ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

const SettingsModal = ({ onClose, theme, setTheme }) => {
  const [streamingServices, setStreamingServices] = useState([]);
  const [preferredServices, setPreferredServices] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [streamingCountry, setStreamingCountry] = useState(() => {
    const stored = getStoredCountry();
    return stored || 'US';
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [seenCountries, setSeenCountries] = useState([]);
  const [selectedCountryToAdd, setSelectedCountryToAdd] = useState('');
  const [loadingSeenCountries, setLoadingSeenCountries] = useState(true);
  const [statsSettings, setStatsSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STATS_SETTINGS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // Ignore parse errors
    }
    // Default settings
    return {
      showTotalMovies: true,
      showFavoritedMovies: true,
      showTotalRuntime: false,
      showFavoritedRuntime: true,
      runtimeFormat: 'auto', // 'auto', 'weeks', 'days', 'hours'
    };
  });

  useEffect(() => {
    const loadServices = async () => {
      try {
        const data = await getAvailableStreamingServices();
        setStreamingServices(data?.services || []);
      } catch (error) {
        console.error('Error loading streaming services:', error);
      } finally {
        setLoading(false);
      }
    };
    loadServices();
  }, []);

  useEffect(() => {
    const loadSeenCountries = async () => {
      try {
        setLoadingSeenCountries(true);
        const seenData = await getSeenCountries();
        setSeenCountries(seenData?.countries || []);
      } catch (error) {
        console.error('Error loading seen countries:', error);
      } finally {
        setLoadingSeenCountries(false);
      }
    };
    loadSeenCountries();
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const toggleService = (service) => {
    // service can be an object with ids array, or just an id for backward compatibility
    const serviceIds = service.ids || [service.id || service];
    const primaryId = service.id || service;

    // Check if any of the service IDs are already in preferred
    const isSelected = serviceIds.some((id) => preferredServices.includes(id));

    let newPreferred;
    if (isSelected) {
      // Remove all IDs for this service
      newPreferred = preferredServices.filter((id) => !serviceIds.includes(id));
    } else {
      // Add all IDs for this service
      newPreferred = [
        ...preferredServices,
        ...serviceIds.filter((id) => !preferredServices.includes(id)),
      ];
    }

    setPreferredServices(newPreferred);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferred));

    // Trigger custom event to notify other components (simulating storage event)
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: STORAGE_KEY });
    Object.defineProperty(event, 'newValue', { value: JSON.stringify(newPreferred) });
    window.dispatchEvent(event);

    // Also dispatch custom event for same-tab updates
    window.dispatchEvent(
      new CustomEvent('preferredServicesChanged', {
        detail: { newValue: JSON.stringify(newPreferred), key: STORAGE_KEY },
      })
    );
  };

  const handleCountryChange = (newCountryCode) => {
    setStreamingCountry(newCountryCode);
    setStoredCountry(newCountryCode);

    // Trigger custom event to notify other components
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: COUNTRY_STORAGE_KEY });
    Object.defineProperty(event, 'newValue', { value: newCountryCode });
    window.dispatchEvent(event);

    // Also dispatch custom event for same-tab updates
    window.dispatchEvent(
      new CustomEvent('streamingCountryChanged', {
        detail: { newValue: newCountryCode, key: COUNTRY_STORAGE_KEY },
      })
    );
  };

  const updateStatsSettings = (newSettings) => {
    setStatsSettings(newSettings);
    localStorage.setItem(STATS_SETTINGS_KEY, JSON.stringify(newSettings));

    // Trigger custom event to notify other components
    window.dispatchEvent(
      new CustomEvent('statsSettingsChanged', {
        detail: { newValue: JSON.stringify(newSettings), key: STATS_SETTINGS_KEY },
      })
    );
  };

  const toggleStatsSetting = (key) => {
    updateStatsSettings({ ...statsSettings, [key]: !statsSettings[key] });
  };

  const handleAddSeenCountry = async (countryName) => {
    const country = countryName || selectedCountryToAdd;
    if (!country || seenCountries.includes(country)) {
      return;
    }
    try {
      await addSeenCountry(country);
      setSeenCountries([...seenCountries, country]);
      setSelectedCountryToAdd('');
    } catch (error) {
      console.error('Error adding seen country:', error);
    }
  };

  const handleRemoveSeenCountry = async (countryName) => {
    try {
      await removeSeenCountry(countryName);
      setSeenCountries(seenCountries.filter((c) => c !== countryName));
    } catch (error) {
      console.error('Error removing seen country:', error);
    }
  };

  // Separate popular and other services
  const popularServicesNormalized = POPULAR_SERVICES.map(normalizeForMatching);
  const popularServices = streamingServices.filter((service) => {
    const normalized = normalizeForMatching(service.name);
    return popularServicesNormalized.includes(normalized);
  });

  const otherServices = streamingServices.filter((service) => {
    const normalized = normalizeForMatching(service.name);
    return !popularServicesNormalized.includes(normalized);
  });

  const filteredPopularServices = searchQuery
    ? popularServices.filter((service) =>
        service.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : popularServices;

  const filteredOtherServices = searchQuery
    ? otherServices.filter((service) =>
        service.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : otherServices;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="settings-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="settings-modal-header">
          <h2>Settings</h2>
        </div>

        <div className="settings-modal-body">
          <div className="settings-section">
            <h3 className="settings-section-title">Theme</h3>
            <p className="settings-section-description">
              Choose your preferred color theme for the application.
            </p>
            <div className="settings-theme-selector">
              <div className="settings-theme-options">
                <button
                  className={`settings-theme-option ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => setTheme('system')}
                  aria-label="Use system theme"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      x="2"
                      y="4"
                      width="20"
                      height="14"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M8 2v4M16 2v4M2 8h20"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="13" r="2" fill="currentColor" />
                  </svg>
                  <span>System</span>
                </button>
                <button
                  className={`settings-theme-option ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  aria-label="Use dark theme"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
                    <path
                      d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Dark</span>
                </button>
                <button
                  className={`settings-theme-option ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                  aria-label="Use light theme"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
                  </svg>
                  <span>Light</span>
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Stats Customization</h3>
            <p className="settings-section-description">
              Customize which statistics are displayed next to the search bar.
            </p>
            <div className="settings-stats-options">
              <div className="settings-stats-toggle">
                <label className="settings-stats-label">
                  <input
                    type="checkbox"
                    checked={statsSettings.showTotalMovies}
                    onChange={() => toggleStatsSetting('showTotalMovies')}
                  />
                  <span>Show Total Movies</span>
                </label>
              </div>
              <div className="settings-stats-toggle">
                <label className="settings-stats-label">
                  <input
                    type="checkbox"
                    checked={statsSettings.showFavoritedMovies}
                    onChange={() => toggleStatsSetting('showFavoritedMovies')}
                  />
                  <span>Show Favorited Movies</span>
                </label>
              </div>
              <div className="settings-stats-toggle">
                <label className="settings-stats-label">
                  <input
                    type="checkbox"
                    checked={statsSettings.showTotalRuntime}
                    onChange={() => toggleStatsSetting('showTotalRuntime')}
                  />
                  <span>Show Total Runtime</span>
                </label>
              </div>
              <div className="settings-stats-toggle">
                <label className="settings-stats-label">
                  <input
                    type="checkbox"
                    checked={statsSettings.showFavoritedRuntime}
                    onChange={() => toggleStatsSetting('showFavoritedRuntime')}
                  />
                  <span>Show Favorited Runtime</span>
                </label>
              </div>
              <div className="settings-stats-format">
                <label className="settings-stats-format-label">Runtime Format:</label>
                <select
                  className="settings-stats-format-select"
                  value={statsSettings.runtimeFormat}
                  onChange={(e) =>
                    updateStatsSettings({ ...statsSettings, runtimeFormat: e.target.value })
                  }
                >
                  <option value="auto">Auto (weeks, days, hours, minutes)</option>
                  <option value="weeks">Weeks, Days, Hours, Minutes</option>
                  <option value="days">Days, Hours, Minutes</option>
                  <option value="hours">Hours and Minutes Only</option>
                </select>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Streaming Country</h3>
            <p className="settings-section-description">
              Select your country to see accurate streaming availability when filtering by streaming
              service and in movie details.
            </p>
            <div className="settings-country-selector">
              <select
                className="settings-country-select"
                value={streamingCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
              >
                {getCommonCountries().map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Seen Countries</h3>
            <p className="settings-section-description">
              Manage the list of countries where you've seen movies. Use the "Exclude Seen
              Countries" filter to find movies from countries you haven't explored yet.
            </p>
            {loadingSeenCountries ? (
              <div className="settings-loading">Loading seen countries...</div>
            ) : (
              <>
                <div className="settings-seen-countries-add">
                  <select
                    className="settings-seen-countries-select"
                    value={selectedCountryToAdd}
                    onChange={(e) => {
                      const country = e.target.value;
                      if (country) {
                        handleAddSeenCountry(country);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && selectedCountryToAdd) {
                        e.preventDefault();
                        handleAddSeenCountry(selectedCountryToAdd);
                      }
                    }}
                  >
                    <option value="">Select a country to add...</option>
                    {ALL_COUNTRIES.filter((country) => !seenCountries.includes(country)).map(
                      (country) => (
                        <option key={country} value={country}>
                          {country === 'United States of America' ? 'USA' : country}
                        </option>
                      )
                    )}
                  </select>
                </div>
                {seenCountries.length > 0 ? (
                  <div className="settings-seen-countries-list">
                    {seenCountries.map((country) => (
                      <div key={country} className="settings-seen-country-item">
                        <span className="settings-seen-country-name">
                          {country === 'United States of America' ? 'USA' : country}
                        </span>
                        <button
                          className="settings-seen-country-remove"
                          onClick={() => handleRemoveSeenCountry(country)}
                          aria-label={`Remove ${country}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="settings-empty">No seen countries added yet.</div>
                )}
              </>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Preferred Streaming Services</h3>
            <p className="settings-section-description">
              Select your preferred streaming services. They will be highlighted in the "Where to
              Watch" section.
            </p>

            {loading ? (
              <div className="settings-loading">Loading streaming services...</div>
            ) : (
              <>
                <div className="settings-search">
                  <input
                    type="text"
                    className="settings-search-input"
                    placeholder="Search streaming services..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {filteredPopularServices.length > 0 && (
                  <div className="settings-popular-section">
                    <h4 className="settings-subsection-title">Popular Services</h4>
                    <div className="settings-services-list">
                      {filteredPopularServices.map((service) => {
                        // Check if any of the service IDs are in preferred (for grouped services)
                        const serviceIds = service.ids || [service.id];
                        const isSelected = serviceIds.some((id) => preferredServices.includes(id));

                        return (
                          <div
                            key={service.id}
                            className={`settings-service-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleService(service)}
                          >
                            <div className="settings-service-checkbox">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleService(service)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {service.logo_path && (
                              <img
                                src={`https://image.tmdb.org/t/p/w154${service.logo_path}`}
                                alt={service.name}
                                className="settings-service-logo"
                              />
                            )}
                            <span className="settings-service-name">{service.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredOtherServices.length > 0 && (
                  <div className="settings-all-section">
                    <h4 className="settings-subsection-title">All Services</h4>
                    <div className="settings-services-list">
                      {filteredOtherServices.map((service) => {
                        // Check if any of the service IDs are in preferred (for grouped services)
                        const serviceIds = service.ids || [service.id];
                        const isSelected = serviceIds.some((id) => preferredServices.includes(id));

                        return (
                          <div
                            key={service.id}
                            className={`settings-service-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleService(service)}
                          >
                            <div className="settings-service-checkbox">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleService(service)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {service.logo_path && (
                              <img
                                src={`https://image.tmdb.org/t/p/w154${service.logo_path}`}
                                alt={service.name}
                                className="settings-service-logo"
                              />
                            )}
                            <span className="settings-service-name">{service.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredPopularServices.length === 0 && filteredOtherServices.length === 0 && (
                  <div className="settings-empty">No streaming services found.</div>
                )}

                {preferredServices.length > 0 && (
                  <div className="settings-summary">
                    {preferredServices.length} service{preferredServices.length !== 1 ? 's' : ''}{' '}
                    selected
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
