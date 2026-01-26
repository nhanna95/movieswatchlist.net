import React, { useState, useEffect } from 'react';
import './StatisticsDashboard.css';
import { getStats, getMovies } from '../services/api';
import { normalizeCountryName, getLanguageName, languageNames } from '../utils/formatting';

// Helper to convert language name back to code
const getLanguageCode = (name) => {
  for (const [code, langName] of Object.entries(languageNames)) {
    if (langName.toLowerCase() === name.toLowerCase()) {
      return code;
    }
  }
  // If not found, try uppercase
  return name.toUpperCase();
};

const StatisticsDashboard = ({ onClose, onApplyFilter }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [genreData, setGenreData] = useState([]);
  const [languageData, setLanguageData] = useState([]);
  const [directorData, setDirectorData] = useState([]);
  const [allDirectorsWith2Plus, setAllDirectorsWith2Plus] = useState([]);
  const [directorDisplayLimit, setDirectorDisplayLimit] = useState(0);
  const [countryData, setCountryData] = useState([]);

  useEffect(() => {
    loadStatistics();
  }, []);

  // Handle Escape key to close the modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const statsData = await getStats();
      setStats(statsData);

      // Load all movies for detailed statistics
      const moviesData = await getMovies({ limit: 10000 });
      const movies = moviesData.movies || [];

      // Process genre distribution
      const genreCounts = {};
      movies.forEach((movie) => {
        if (movie.genres && Array.isArray(movie.genres)) {
          movie.genres.forEach((genre) => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          });
        }
      });
      const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
      setGenreData(sortedGenres); // Include all genres

      // Process language distribution
      const languageCounts = {};
      movies.forEach((movie) => {
        if (movie.original_language) {
          const langCode = movie.original_language;
          languageCounts[langCode] = (languageCounts[langCode] || 0) + 1;
        }
      });
      // Convert to array of [languageName, count, code], filter to only languages with 2+ movies, and sort by count
      // Store code as third element for filtering
      const sortedLanguages = Object.entries(languageCounts)
        .filter(([code, count]) => count >= 2)
        .map(([code, count]) => [getLanguageName(code), count, code])
        .sort((a, b) => b[1] - a[1]);
      setLanguageData(sortedLanguages);

      // Process country distribution
      const countryCounts = {};
      movies.forEach((movie) => {
        if (movie.country) {
          const normalizedCountry = normalizeCountryName(movie.country);
          countryCounts[normalizedCountry] = (countryCounts[normalizedCountry] || 0) + 1;
        }
      });
      // Filter to only countries with 2+ movies and sort by count
      const sortedCountries = Object.entries(countryCounts)
        .filter(([country, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1]);
      setCountryData(sortedCountries);

      // Process director frequency
      const directorCounts = {};
      movies.forEach((movie) => {
        if (movie.director) {
          directorCounts[movie.director] = (directorCounts[movie.director] || 0) + 1;
        }
      });
      const sortedDirectors = Object.entries(directorCounts).sort((a, b) => b[1] - a[1]);
      // Filter to only directors with 2+ movies
      const directorsWith2Plus = sortedDirectors.filter(([director, count]) => count >= 2);
      setAllDirectorsWith2Plus(directorsWith2Plus);
      // Start with the number of countries minus one
      const initialLimit = Math.max(
        0,
        Math.min(directorsWith2Plus.length, sortedCountries.length - 1)
      );
      setDirectorDisplayLimit(initialLimit);
      setDirectorData(directorsWith2Plus.slice(0, initialLimit));
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const maxValue = (data) => Math.max(...data.map((d) => d[1]), 1);

  const handleLoadMoreDirectors = () => {
    // Add at least 10 directors
    const minNewLimit = Math.min(directorDisplayLimit + 10, allDirectorsWith2Plus.length);

    // If we've reached the end, just show all
    if (minNewLimit >= allDirectorsWith2Plus.length) {
      setDirectorDisplayLimit(allDirectorsWith2Plus.length);
      setDirectorData(allDirectorsWith2Plus);
      return;
    }

    // Get the count of the director at the minimum new limit position
    const lastDirectorCount = allDirectorsWith2Plus[minNewLimit - 1][1];

    // Find all directors with the same count as the last one
    let newLimit = minNewLimit;
    while (
      newLimit < allDirectorsWith2Plus.length &&
      allDirectorsWith2Plus[newLimit][1] === lastDirectorCount
    ) {
      newLimit++;
    }

    setDirectorDisplayLimit(newLimit);
    setDirectorData(allDirectorsWith2Plus.slice(0, newLimit));
  };

  const handleLabelClick = (label, filterType, languageCode = null) => {
    if (!onApplyFilter) return;

    let filterField;
    let filterValue = label;

    // Determine filter field and value based on filter type
    if (filterType === 'genre') {
      filterField = 'genre';
      filterValue = label; // Genre name as-is
    } else if (filterType === 'language') {
      filterField = 'original_language';
      filterValue = languageCode || getLanguageCode(label); // Use stored code or convert
    } else if (filterType === 'director') {
      filterField = 'director';
      filterValue = label; // Director name as-is
    } else if (filterType === 'country') {
      filterField = 'country';
      filterValue = label; // Country name as-is
    } else {
      return;
    }

    // Create filter object
    const newFilter = {
      id: `${filterField}-${Date.now()}`,
      type: filterField,
      config: {
        values: [filterValue],
        exclude: false,
      },
    };

    // Apply filter and close modal
    onApplyFilter(newFilter);
    onClose();
  };

  const BarChart = ({
    data,
    title,
    showLoadMore = false,
    onLoadMore = null,
    canLoadMore = false,
    filterType = null,
  }) => {
    if (!data || data.length === 0) return <p>No data available</p>;
    const max = maxValue(data);
    return (
      <div className="stat-chart">
        <h3>{title}</h3>
        <div className="bar-chart">
          {data.map((item, index) => {
            // Handle both [label, value] and [label, value, code] formats
            const label = item[0];
            const value = item[1];
            const code = item[2]; // Optional third element for language code
            return (
              <div key={index} className="bar-item">
                <div
                  className={`bar-label ${filterType ? 'bar-label-clickable' : ''}`}
                  onClick={filterType ? () => handleLabelClick(label, filterType, code) : undefined}
                  style={filterType ? { cursor: 'pointer' } : {}}
                >
                  {label}
                </div>
                <div className="bar-container">
                  <div className="bar-fill" style={{ width: `${(value / max) * 100}%` }}>
                    <span className={`bar-value ${value >= max * 0.9 ? 'bar-value-first' : ''}`}>
                      {value}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {showLoadMore && canLoadMore && onLoadMore && (
          <button
            className="stats-load-more-button"
            onClick={onLoadMore}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              width: '100%',
            }}
          >
            See More Directors
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="stats-modal-overlay" onClick={onClose}>
        <div className="stats-modal-content" onClick={(e) => e.stopPropagation()}>
          <p>Loading statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-modal-overlay" onClick={onClose}>
      <div className="stats-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="stats-modal-close" onClick={onClose}>
          ×
        </button>
        <h2>Statistics Dashboard</h2>
        {stats && (
          <div className="stats-summary">
            <div className="stat-summary-item">
              <div className="stat-summary-value">{stats.total_movies}</div>
              <div className="stat-summary-label">Total Movies</div>
            </div>
            <div className="stat-summary-item">
              <div className="stat-summary-value">{stats.unique_directors}</div>
              <div className="stat-summary-label">Directors</div>
            </div>
            <div className="stat-summary-item">
              <div className="stat-summary-value">{stats.unique_countries}</div>
              <div className="stat-summary-label">Countries</div>
            </div>
            {stats.year_range && (
              <div className="stat-summary-item">
                <div className="stat-summary-value">
                  {stats.year_range.min} - {stats.year_range.max}
                </div>
                <div className="stat-summary-label">Year Range</div>
              </div>
            )}
          </div>
        )}
        <div className="stats-charts">
          <BarChart data={genreData} title="Genres" filterType="genre" />
          <BarChart data={languageData} title="Top Languages" filterType="language" />
          <BarChart
            data={directorData}
            title="Directors"
            showLoadMore={true}
            onLoadMore={handleLoadMoreDirectors}
            canLoadMore={directorDisplayLimit < allDirectorsWith2Plus.length}
            filterType="director"
          />
          <BarChart data={countryData} title="Top Countries" filterType="country" />
        </div>
      </div>
    </div>
  );
};

export default StatisticsDashboard;
