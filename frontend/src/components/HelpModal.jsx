import React, { useEffect } from 'react';
import './HelpModal.css';

const HelpModal = ({ onClose }) => {
  // Handle Escape key to close modal
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

  const shortcuts = [
    { key: '/', description: 'Focus search bar' },
    { key: '?', description: 'Show keyboard shortcuts help' },
    { key: 'Escape', description: 'Close modals/clear selection' },
    { key: 'Enter', description: 'Open selected movie modal' },
    { key: 'F', description: 'Toggle favorite on selected movie' },
    { key: '↑ ↓', description: 'Navigate between movies' },
    { key: 'Ctrl/Cmd + F', description: 'Open filter panel' },
    { key: 'Ctrl/Cmd + S', description: 'Save current filter preset' },
  ];

  // GitHub repository URL - update this with your actual repository
  // Format: https://github.com/username/repository-name
  const GITHUB_REPO_URL = 'https://github.com/nhanna95/movieswatchlist.net';

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="help-modal-close" onClick={onClose} aria-label="Close help">
          ×
        </button>
        <div className="help-modal-header">
          <h2 className="help-modal-title">Help & Documentation</h2>
        </div>
        <div className="help-modal-body">
          {/* Basic Features Section */}
          <section className="help-section">
            <h3 className="help-section-title">Basic Features</h3>
            <div className="help-section-content">
              <div className="help-feature">
                <h4 className="help-feature-title">Import Movies from Letterboxd</h4>
                <p className="help-feature-description">
                  Export your Letterboxd watchlist as CSV and upload it to import all your movies
                  at once. You can preview and select which movies to add or remove before
                  processing.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Add Movies Manually</h4>
                <p className="help-feature-description">
                  Search for movies using the "Add Movie" button and add them directly from The
                  Movie Database (TMDb). Movies are automatically enriched with metadata including
                  cast, crew, genres, and more.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Filter Movies</h4>
                <p className="help-feature-description">
                  Use the filter bar to filter your collection by year, director, genre, country,
                  runtime, ratings, streaming availability, and many other criteria. Combine
                  multiple filters to find exactly what you're looking for.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">View Statistics</h4>
                <p className="help-feature-description">
                  Access the statistics dashboard to see comprehensive analytics about your
                  collection, including year distribution, genre breakdown, country statistics, and
                  more. Statistics update based on your current filters.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Mark Favorites & Track Watched</h4>
                <p className="help-feature-description">
                  Mark movies as favorites and track which movies you've already seen. Use these
                  filters to quickly find unwatched favorites or discover new movies.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Add Personal Notes</h4>
                <p className="help-feature-description">
                  Add personal notes to any movie. Click on a movie to open its details modal, then
                  click "Edit Notes" to add your thoughts, reminders, or any other information.
                </p>
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts Section */}
          <section className="help-section">
            <h3 className="help-section-title">Keyboard Shortcuts</h3>
            <div className="help-section-content">
              <div className="help-shortcuts-list">
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="help-shortcut-item">
                    <div className="help-shortcut-keys">
                      {shortcut.key.split(' + ').map((key, i) => (
                        <span key={i} className="help-shortcut-key">
                          {key}
                        </span>
                      ))}
                    </div>
                    <div className="help-shortcut-description">{shortcut.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Advanced Features Section */}
          <section className="help-section">
            <h3 className="help-section-title">Advanced Features</h3>
            <div className="help-section-content">
              <div className="help-feature">
                <h4 className="help-feature-title">OR Groups for Complex Filtering</h4>
                <p className="help-feature-description">
                  Create OR groups to build complex filter logic. For example, find movies from
                  either "France" OR "Italy" that are also from the "Drama" genre. This allows for
                  powerful combinations of filter conditions.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Filter Presets</h4>
                <p className="help-feature-description">
                  Save your frequently used filter combinations as presets. Access them quickly from
                  the filter bar to instantly apply complex filter sets.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Column Customization</h4>
                <p className="help-feature-description">
                  Customize which columns are visible in your movie list and reorder them to match
                  your preferences. Access column customization from the Settings menu.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Profile Export & Import</h4>
                <p className="help-feature-description">
                  Export your complete profile including all movies, favorites, settings, and
                  preferences to a ZIP file. Import it later to restore everything on a new device
                  or after clearing data.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Tracked Lists</h4>
                <p className="help-feature-description">
                  Movies are automatically matched against popular lists like IMDb Top 250,
                  Letterboxd Top 250, and others. Filter by these lists to discover which
                  acclaimed films are in your watchlist.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Favorite Directors</h4>
                <p className="help-feature-description">
                  Mark directors as favorites and quickly filter to see all movies from your
                  favorite directors. Access director management from the Settings menu.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Seen Countries Tracking</h4>
                <p className="help-feature-description">
                  Track which countries you've watched movies from. Exclude seen countries from
                  filters to discover movies from new regions.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Streaming Availability</h4>
                <p className="help-feature-description">
                  See where movies are available to stream in your region. Configure your preferred
                  streaming services and country in Settings to see availability information.
                </p>
              </div>
              <div className="help-feature">
                <h4 className="help-feature-title">Random Movie Picker</h4>
                <p className="help-feature-description">
                  Use the random movie picker to help decide what to watch. Choose from all movies
                  or filter to random favorites only.
                </p>
              </div>
            </div>
          </section>

          {/* Links Section */}
          <section className="help-section">
            <h3 className="help-section-title">Links & Support</h3>
            <div className="help-section-content">
              <div className="help-links">
                <a
                  href="https://letterboxd.com/noxinh/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="help-link"
                >
                  <span className="help-link-icon">📽️</span>
                  <div className="help-link-content">
                    <span className="help-link-title">Follow on Letterboxd</span>
                    <span className="help-link-description">Check out my Letterboxd profile</span>
                  </div>
                </a>
                <a
                  href={`${GITHUB_REPO_URL}/issues/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="help-link"
                >
                  <span className="help-link-icon">🐛</span>
                  <div className="help-link-content">
                    <span className="help-link-title">Report a Bug</span>
                    <span className="help-link-description">
                      Found an issue? Report it on GitHub
                    </span>
                  </div>
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
