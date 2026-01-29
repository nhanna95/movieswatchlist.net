import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import MovieList from './components/MovieList';
import FilterBar from './components/FilterBar';
import UploadCSV from './components/UploadCSV';
import MovieModal from './components/MovieModal';
import DirectorsModal from './components/DirectorsModal';
import StatisticsDashboard from './components/StatisticsDashboard';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import ToastContainer from './components/ToastContainer';
import DialogContainer from './components/DialogContainer';
import { getDefaultColumns } from './components/ColumnCustomizer';
import SettingsModal from './components/SettingsModal';
import AddMovieModal from './components/AddMovieModal';
import HelpModal from './components/HelpModal';
import AuthGuard from './components/AuthGuard';
import { AuthProvider, useAuth } from './hooks/useAuth';
import {
  getMovies,
  getStats,
  getMovie,
  getCollectionMovies,
  getSimilarMovies,
  clearCache,
  processTrackedLists,
  setMovieFavorite,
  exportProfile,
  exportMovies,
  deleteMovie,
  processCSVWithSelections,
  getFavoriteDirectors,
  getSettings,
  saveSettings,
} from './services/api';
import { getToken } from './services/auth';
import { filterTypes } from './components/filterTypes';
import { formatRuntime } from './utils';
import { detectCountry, setStoredCountry, getStoredCountry } from './utils/countryDetection';
import './components/UploadCSV.css';

// LogoutButton Component - uses the auth hook to log out
const LogoutButton = () => {
  const { logout, user } = useAuth();

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
    }
  };

  return (
    <button
      className="logout-button"
      onClick={handleLogout}
      title={user ? `Logout (${user.username})` : 'Logout'}
      aria-label="Logout"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="16,17 21,12 16,7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="21"
          y1="12"
          x2="9"
          y2="12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

// CSVPreviewModal Component
const CSVPreviewModal = ({ previewData, initialSelections, file, onClose, onUploadSuccess }) => {
  const [selectedMovies, setSelectedMovies] = useState(
    initialSelections || {
      toAdd: new Map(),
      toRemove: new Map(),
    }
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    processed: 0,
    skipped: 0,
    removed: 0,
  });
  const readerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Helper functions for managing selections
  const toggleMovieToAdd = (uri) => {
    const newToAdd = new Map(selectedMovies.toAdd);
    const movie = newToAdd.get(uri);
    if (movie) {
      newToAdd.set(uri, { ...movie, willAdd: !movie.willAdd });
      setSelectedMovies({ ...selectedMovies, toAdd: newToAdd });
    }
  };

  const updateMovieFavorite = (uri, isFavorite) => {
    const newToAdd = new Map(selectedMovies.toAdd);
    const movie = newToAdd.get(uri);
    if (movie) {
      newToAdd.set(uri, { ...movie, isFavorite });
      setSelectedMovies({ ...selectedMovies, toAdd: newToAdd });
    }
  };

  const updateMovieSeenBefore = (uri, seenBefore) => {
    const newToAdd = new Map(selectedMovies.toAdd);
    const movie = newToAdd.get(uri);
    if (movie) {
      newToAdd.set(uri, { ...movie, seenBefore });
      setSelectedMovies({ ...selectedMovies, toAdd: newToAdd });
    }
  };

  const setMovieAction = (id, action) => {
    const newToRemove = new Map(selectedMovies.toRemove);
    const movie = newToRemove.get(id);
    if (movie) {
      newToRemove.set(id, { ...movie, action });
      setSelectedMovies({ ...selectedMovies, toRemove: newToRemove });
    }
  };

  const selectAllMoviesToRemove = () => {
    const newToRemove = new Map(selectedMovies.toRemove);
    newToRemove.forEach((movie, id) => {
      newToRemove.set(id, { ...movie, action: 'remove' });
    });
    setSelectedMovies({ ...selectedMovies, toRemove: newToRemove });
  };

  // Get counts for summary
  const getSelectionCounts = () => {
    const toAddCount = Array.from(selectedMovies.toAdd.values()).filter((m) => m.willAdd).length;
    const toRemoveCount = Array.from(selectedMovies.toRemove.values()).filter(
      (m) => m.action === 'remove'
    ).length;
    return { toAddCount, toRemoveCount };
  };

  const handleProcessFile = async () => {
    if (!file) {
      return;
    }

    const { toAddCount, toRemoveCount } = getSelectionCounts();

    if (toAddCount === 0 && toRemoveCount === 0) {
      setError('Please select at least one movie to add or remove');
      return;
    }

    // Prepare selections
    const movies_to_add = Array.from(selectedMovies.toAdd.values())
      .filter((m) => m.willAdd)
      .map((m) => {
        // Ensure isFavorite is explicitly set as boolean
        const isFavorite = m.isFavorite === true;
        // Ensure seenBefore is explicitly set as boolean
        const seenBefore = m.seenBefore === true;
        return {
          name: m.name,
          year: m.year,
          letterboxd_uri: m.letterboxd_uri,
          is_favorite: isFavorite,
          seen_before: seenBefore,
        };
      });

    // Debug log to verify favorites are being sent
    console.log(
      'Sending movies to add with favorites:',
      movies_to_add.map((m) => ({
        name: m.name,
        is_favorite: m.is_favorite,
      }))
    );

    const movies_to_remove_ids = Array.from(selectedMovies.toRemove.values())
      .filter((m) => m.action === 'remove')
      .map((m) => m.id);

    const selections = {
      movies_to_add,
      movies_to_remove_ids,
    };

    setProcessing(true);
    setError(null);
    setMessage(null);
    setProgress({ current: 0, total: 0, processed: 0, skipped: 0, removed: 0 });

    try {
      const response = await processCSVWithSelections(file, selections);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null - server may not support streaming');
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      const readStream = () => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              readerRef.current = null;
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() && line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));

                  if (data.error) {
                    if (isMountedRef.current) {
                      setError(data.error);
                      setProcessing(false);
                    }
                    readerRef.current = null;
                    return;
                  }

                  if (data.done) {
                    const doneMessage =
                      data.message ||
                      `Added ${data.processed || 0} movies, removed ${data.removed || 0} movies.`;
                    if (isMountedRef.current) {
                      setMessage(doneMessage);
                      setProcessing(false);
                      if (onUploadSuccess) {
                        onUploadSuccess();
                      }
                      // Close modal after successful processing
                      setTimeout(() => {
                        onClose();
                      }, 2000);
                    }
                    readerRef.current = null;
                    return;
                  }

                  const newProgress = {
                    current: data.current || 0,
                    total: data.total || 0,
                    processed: data.processed || 0,
                    skipped: data.skipped || 0,
                    removed: data.removed || 0,
                  };

                  if (isMountedRef.current) {
                    setProgress(newProgress);
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e, 'Line:', line);
                }
              }
            }

            setTimeout(() => {
              readStream();
            }, 0);
          })
          .catch((err) => {
            console.error('Error reading stream:', err);
            if (isMountedRef.current) {
              setError('Error reading progress updates: ' + (err.message || 'Unknown error'));
              setProcessing(false);
            }
            readerRef.current = null;
          });
      };

      readStream();
    } catch (err) {
      console.error('Error processing CSV with selections:', err);
      setError(err.message || 'Error processing CSV file');
      setProcessing(false);
      readerRef.current = null;
    }
  };

  const { toAddCount, toRemoveCount } = getSelectionCounts();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="import-export-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflow: 'auto' }}
      >
        <button className="modal-close" onClick={onClose} title="Close" aria-label="Close">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="modal-header">
          <h2>CSV Import Preview</h2>
        </div>
        <div className="modal-content">
          <div className="preview-info">
            <p>
              <strong>File:</strong> {previewData.fileName}
            </p>
            <p>
              <strong>Size:</strong> {(previewData.fileSize / 1024).toFixed(2)} KB
            </p>
          </div>

          <div
            className="preview-summary"
            style={{
              marginBottom: '15px',
              padding: '6px 10px',
              background: 'var(--bg-tertiary, #f0f0f0)',
              borderRadius: '4px',
            }}
          >
            <strong>Summary:</strong> {toAddCount} movie{toAddCount !== 1 ? 's' : ''} to add,{' '}
            {toRemoveCount} movie{toRemoveCount !== 1 ? 's' : ''} to remove
          </div>

          {/* Movies to Add Section */}
          {previewData.movies_to_add && previewData.movies_to_add.length > 0 && (
            <div className="preview-section" style={{ marginBottom: '20px' }}>
              <div className="preview-section-header" style={{ marginBottom: '8px' }}>
                <h5>Movies to Add ({previewData.total_to_add})</h5>
              </div>
              <div
                className="preview-table-container"
                style={{ maxHeight: '300px', overflowY: 'auto' }}
              >
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Add</th>
                      <th style={{ width: '80px' }}>Favorite</th>
                      <th style={{ width: '80px' }}>Seen</th>
                      <th>Title</th>
                      <th style={{ width: '80px' }}>Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.movies_to_add.map((movie) => {
                      const selection = selectedMovies.toAdd.get(movie.letterboxd_uri) || {
                        willAdd: true,
                        isFavorite: false,
                        seenBefore: false,
                      };
                      return (
                        <tr key={movie.letterboxd_uri}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selection.willAdd}
                              onChange={() => toggleMovieToAdd(movie.letterboxd_uri)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                updateMovieFavorite(
                                  movie.letterboxd_uri,
                                  !(selection.isFavorite || false)
                                )
                              }
                              disabled={!selection.willAdd}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: selection.willAdd ? 'pointer' : 'not-allowed',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: selection.willAdd ? 1 : 0.5,
                              }}
                              title={
                                selection.isFavorite ? 'Remove from favorites' : 'Add to favorites'
                              }
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill={selection.isFavorite ? '#FFD700' : 'none'}
                                stroke={selection.isFavorite ? '#FFD700' : '#ccc'}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                updateMovieSeenBefore(
                                  movie.letterboxd_uri,
                                  !(selection.seenBefore || false)
                                )
                              }
                              disabled={!selection.willAdd}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: selection.willAdd ? 'pointer' : 'not-allowed',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: selection.willAdd ? 1 : 0.5,
                              }}
                              title={selection.seenBefore ? 'Mark as not seen' : 'Mark as seen'}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={selection.seenBefore ? '#76EE5C' : '#A7B1BA'}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path
                                  d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                                  fill={selection.seenBefore ? '#76EE5C' : 'none'}
                                />
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="3.5"
                                  fill="none"
                                  stroke={selection.seenBefore ? '#3F424A' : '#A7B1BA'}
                                />
                              </svg>
                            </button>
                          </td>
                          <td>{movie.name}</td>
                          <td>{movie.year}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Movies to Remove Section */}
          {previewData.movies_to_remove && previewData.movies_to_remove.length > 0 && (
            <div className="preview-section" style={{ marginBottom: '20px' }}>
              <div
                className="preview-section-header"
                style={{
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h5>Movies to Remove ({previewData.total_to_remove})</h5>
                <button
                  type="button"
                  onClick={selectAllMoviesToRemove}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
                    border: '1px solid var(--border-color, #ddd)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--text-primary, #333)',
                  }}
                  title="Select all movies to delete"
                >
                  Select All
                </button>
              </div>
              <div
                className="preview-table-container"
                style={{ maxHeight: '300px', overflowY: 'auto' }}
              >
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Remove</th>
                      <th>Title</th>
                      <th style={{ width: '80px' }}>Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.movies_to_remove.map((movie) => {
                      const selection = selectedMovies.toRemove.get(movie.id) || { action: 'keep' };
                      const isRemove = selection.action === 'remove';
                      return (
                        <tr key={movie.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isRemove}
                              onChange={(e) =>
                                setMovieAction(movie.id, e.target.checked ? 'remove' : 'keep')
                              }
                            />
                          </td>
                          <td>{movie.title}</td>
                          <td>{movie.year}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!previewData.movies_to_add || previewData.movies_to_add.length === 0) &&
            (!previewData.movies_to_remove || previewData.movies_to_remove.length === 0) && (
              <p>No changes needed. All movies in CSV already exist in database.</p>
            )}

          {processing && (
            <div className="progress-bar-container" style={{ marginTop: '20px' }}>
              {progress.total > 0 && (
                <div className="progress-info">
                  <span className="progress-text">
                    {progress.current} / {progress.total} movies
                  </span>
                </div>
              )}
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width:
                      progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
                  }}
                ></div>
              </div>
            </div>
          )}

          {message && (
            <div className="upload-message success" style={{ marginTop: '20px' }}>
              {message}
            </div>
          )}

          {error && (
            <div className="upload-message error" style={{ marginTop: '20px' }}>
              {error}
            </div>
          )}

          <div
            className="preview-actions"
            style={{
              marginTop: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {toAddCount} to add, {toRemoveCount} to remove
              </span>
            </div>
            <div>
              <button
                className="upload-button"
                onClick={handleProcessFile}
                disabled={processing || (toAddCount === 0 && toRemoveCount === 0)}
                style={{ marginRight: '10px' }}
              >
                Process Selected
              </button>
              <button className="upload-button cancel" onClick={onClose} disabled={processing}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ImportExportModal = ({
  onClose,
  onUploadSuccess,
  onClearCache,
  onProcessTrackedLists,
  onExportProfile,
  onImportProfile,
  filters,
  sorts,
  search,
  onShowPreview,
  addToast,
  showConfirm,
  countryCode = 'US',
  preferredServices = [],
}) => {
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [includeTmdbData, setIncludeTmdbData] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMoviesOpen, setExportMoviesOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportColumns, setExportColumns] = useState('title,year,director,runtime,genres');
  const [exportIncludeNotes, setExportIncludeNotes] = useState(true);
  const [exportMoviesLoading, setExportMoviesLoading] = useState(false);
  const [importProcessing, setImportProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    processed: 0,
    failed: 0,
    message: null,
  });
  const [importMessage, setImportMessage] = useState(null);
  const [importError, setImportError] = useState(null);
  const [isProcessingTmdb, setIsProcessingTmdb] = useState(false);
  const [importDragActive, setImportDragActive] = useState(false);
  const importFileInputRef = useRef(null);
  const importProgressRef = useRef({
    current: 0,
    total: 0,
    processed: 0,
    failed: 0,
    message: null,
  });

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Add event listener when modal is open
    document.addEventListener('keydown', handleEscape);

    // Cleanup: remove event listener when modal closes
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleExportClick = async () => {
    setExportLoading(true);
    try {
      await onExportProfile(includeTmdbData);
      setExportOptionsOpen(false);
    } catch (error) {
      console.error('Error exporting profile:', error);
      if (addToast) {
        addToast(
          'Error exporting profile: ' + (error.response?.data?.detail || error.message),
          'error'
        );
      }
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportClick = () => {
    if (importFileInputRef.current && !importProcessing) {
      importFileInputRef.current.click();
    }
  };

  const handleImportDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setImportDragActive(true);
    } else if (e.type === 'dragleave') {
      setImportDragActive(false);
    }
  };

  const handleImportDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setImportDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];

      // Validate file type
      if (!file.name.endsWith('.zip')) {
        if (addToast) {
          addToast('Please select a ZIP file', 'error');
        }
        return;
      }

      // Show confirmation dialog
      if (showConfirm) {
        const confirmed = await showConfirm(
          'Importing a profile will permanently delete all current movies and replace them with the imported data. This action cannot be undone. Do you want to continue?',
          'Confirm Profile Import'
        );
        if (!confirmed) {
          return;
        }
      }

      // Set file to input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (importFileInputRef.current) {
        importFileInputRef.current.files = dataTransfer.files;
      }

      // Trigger file selection handler
      handleImportFileSelected({ target: { files: [file] } });
    }
  };

  const handleImportFileSelected = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      if (addToast) {
        addToast('Please select a ZIP file', 'error');
      }
      return;
    }

    // Show confirmation dialog
    if (showConfirm) {
      const confirmed = await showConfirm(
        'Importing a profile will permanently delete all current movies and replace them with the imported data. This action cannot be undone. Do you want to continue?',
        'Confirm Profile Import'
      );
      if (!confirmed) {
        // Reset file input if user cancelled
        if (importFileInputRef.current) {
          importFileInputRef.current.value = '';
        }
        return;
      }
    }

    // Reset state
    setImportProcessing(true);
    setIsProcessingTmdb(false);
    setImportError(null);
    setImportMessage(null);
    setImportProgress({ current: 0, total: 0, processed: 0, failed: 0, message: null });

    try {
      await onImportProfile(file, {
        onProgress: (progress) => {
          // Update ref and state
          importProgressRef.current = progress;
          setImportProgress(progress);
        },
        onImportComplete: (result) => {
          // Import complete, now processing TMDB data if needed
        },
        onSetProcessingTmdb: (isProcessing) => setIsProcessingTmdb(isProcessing),
        onComplete: (result) => {
          setImportProcessing(false);
          setImportMessage(
            `Successfully imported ${result.movies_imported} movies.${result.tmdb_data_fetched > 0 ? ` Fetched TMDB data for ${result.tmdb_data_fetched} movies.` : ''}`
          );
          // Close modal and trigger reload immediately
          onClose();
          if (onUploadSuccess) {
            onUploadSuccess();
          }
        },
        onError: (error) => {
          setImportProcessing(false);
          setImportError(error);
        },
      });
    } catch (error) {
      console.error('Error importing profile:', error);
      setImportProcessing(false);
      setImportError('Error importing profile: ' + (error.response?.data?.detail || error.message));
    } finally {
      // Reset file input
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };

  const handleExportMovies = async () => {
    setExportMoviesLoading(true);
    try {
      // Build export params from current filters
      // Ensure format is valid
      const validFormat = ['csv', 'json', 'markdown', 'letterboxd'].includes(exportFormat)
        ? exportFormat
        : 'csv';
      const params = {
        format: validFormat,
        include_notes: exportIncludeNotes !== undefined ? exportIncludeNotes : true,
      };

      // Only include columns if provided and not empty
      if (exportColumns && exportColumns.trim() !== '') {
        params.columns = exportColumns.trim();
      }

      // Add current filters to export params
      const currentFilters = filters || [];
      const currentSearch = search || '';

      if (currentSearch && currentSearch.trim() !== '') {
        params.search = currentSearch.trim();
      }

      // Convert filters to API params (similar to loadMovies)
      const andFilters = {};
      const orGroups = [];

      currentFilters.forEach((filter) => {
        const filterType = filterTypes[filter.type];

        if (filter.type === 'or_group') {
          if (filterType && filterType.getApiParams) {
            const apiParams = filterType.getApiParams(filter.config, filterTypes);
            if (apiParams.or_group_list_filters && apiParams.or_group_list_filters.length > 0) {
              orGroups.push(apiParams.or_group_list_filters);
            }
          }
          return;
        }

        if (filterType && filterType.getApiParams) {
          // Pass countryCode and preferredServices for availability filter
          const apiParams =
            filter.type === 'availability'
              ? filterType.getApiParams(filter.config, countryCode, preferredServices)
              : filterType.getApiParams(filter.config);
          Object.keys(apiParams).forEach((key) => {
            const value = apiParams[key];
            if (value !== null && value !== undefined) {
              if (key.startsWith('is_')) {
                andFilters[key] = value;
              } else {
                if (Array.isArray(value)) {
                  if (value.length > 0) {
                    params[key] = value;
                  }
                } else if (typeof value === 'string') {
                  if (value.trim() !== '') {
                    params[key] = value;
                  }
                } else {
                  params[key] = value;
                }
              }
            }
          });
        }
      });

      const listFiltersParam = {};
      if (Object.keys(andFilters).length > 0) {
        listFiltersParam.and_filters = andFilters;
      }
      if (orGroups.length > 0) {
        listFiltersParam.or_groups = orGroups;
      }

      if (Object.keys(listFiltersParam).length > 0) {
        params.list_filters = JSON.stringify(listFiltersParam);
      }

      // Filter params to only include those accepted by export endpoint
      // Export endpoint only accepts: format, columns, include_notes, skip, limit,
      // year_min, year_max, director, director_exclude, country, country_exclude, genre, genre_exclude,
      // runtime_min, runtime_max, search, favorites_only, list_filters
      const allowedParams = new Set([
        'format',
        'columns',
        'include_notes',
        'skip',
        'limit',
        'year_min',
        'year_max',
        'director',
        'director_exclude',
        'country',
        'country_exclude',
        'genre',
        'genre_exclude',
        'runtime_min',
        'runtime_max',
        'search',
        'favorites_only',
        'list_filters',
      ]);

      const filteredParams = {};
      Object.keys(params).forEach((key) => {
        if (allowedParams.has(key)) {
          let value = params[key];

          // Ensure types match what FastAPI expects
          if (
            key === 'skip' ||
            key === 'limit' ||
            key === 'year_min' ||
            key === 'year_max' ||
            key === 'runtime_min' ||
            key === 'runtime_max'
          ) {
            // These should be integers
            if (value !== null && value !== undefined) {
              value = parseInt(value, 10);
              if (isNaN(value)) {
                console.warn(`Invalid ${key} value, skipping:`, params[key]);
                return;
              }
            }
          } else if (
            key === 'include_notes' ||
            key === 'include_tags' ||
            key === 'favorites_only' ||
            key === 'director_exclude' ||
            key === 'country_exclude' ||
            key === 'genre_exclude' ||
            key === 'tags_exclude'
          ) {
            // These should be booleans
            if (value !== null && value !== undefined) {
              value = value === true || value === 'true' || value === 1;
            }
          }

          filteredParams[key] = value;
        } else {
          console.warn(`Skipping parameter '${key}' - not supported by export endpoint`);
        }
      });

      // Log the final params being sent (for debugging)
      console.log('Export params being sent:', {
        ...filteredParams,
        list_filters: filteredParams.list_filters ? '[JSON string]' : undefined,
      });

      await exportMovies(filteredParams);
      setExportMoviesOpen(false);
    } catch (error) {
      console.error('Error exporting movies:', error);
      console.error('Error response:', error.response?.data);
      console.error('Request params:', error.config?.params);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (addToast) {
        let errorDetail = error.message;

        // Handle network errors specifically
        if (
          error.isNetworkError ||
          error.code === 'ECONNABORTED' ||
          error.message === 'Network Error' ||
          !error.response
        ) {
          errorDetail =
            'Network error: Unable to connect to server. Please check if the backend server is running and accessible.';
        } else if (error.response?.data) {
          const data = error.response.data;
          // FastAPI 422 errors have detail as an array of validation errors
          if (Array.isArray(data.detail)) {
            errorDetail = data.detail
              .map((err) => `${err.loc?.join('.') || 'field'}: ${err.msg}`)
              .join(', ');
          } else if (data.detail) {
            errorDetail =
              typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
          } else if (data.message) {
            errorDetail = data.message;
          }
        } else if (error.response) {
          errorDetail = `HTTP ${error.response.status}: ${error.response.statusText}`;
        }

        addToast('Error exporting movies: ' + errorDetail, 'error');
      }
    } finally {
      setExportMoviesLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="import-export-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close" aria-label="Close">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="modal-header">
          <h2>Import and Export</h2>
        </div>
        <div className="modal-content">
          <UploadCSV onUploadSuccess={onUploadSuccess} onShowPreview={onShowPreview} />

          <div className="cache-control" style={{ marginTop: '2rem' }}>
            <h2>Import Profile</h2>
            <p className="cache-description">
              Import a previously exported profile ZIP file. This will replace all current movies
              and restore your preferences
            </p>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".zip"
              style={{ display: 'none' }}
              onChange={handleImportFileSelected}
            />
            {!importProcessing && (
              <div
                className={`upload-dropzone ${importDragActive ? 'drag-active' : ''}`}
                onDragEnter={handleImportDrag}
                onDragLeave={handleImportDrag}
                onDragOver={handleImportDrag}
                onDrop={handleImportDrop}
                onClick={handleImportClick}
                style={{ marginBottom: '1rem' }}
              >
                {importDragActive ? (
                  <div className="dropzone-content">
                    <p>Drop ZIP file here</p>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p>Drag & drop ZIP file here or click to browse</p>
                    <p className="dropzone-hint">Supports .zip files</p>
                  </div>
                )}
              </div>
            )}
            {importProcessing && isProcessingTmdb && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span>Processing TMDB data...</span>
                    <span>
                      {importProgress.current} / {importProgress.total}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '20px',
                      backgroundColor: 'var(--bg-tertiary, #f0f0f0)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                        height: '100%',
                        backgroundColor: 'var(--success)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Processed: {importProgress.processed} | Failed: {importProgress.failed}
                  </div>
                </div>
              </div>
            )}
            {importProcessing && !isProcessingTmdb && !importMessage && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span>{importProgress.message || 'Importing profile...'}</span>
                    {importProgress.total > 0 && (
                      <span>
                        {importProgress.current} / {importProgress.total}
                      </span>
                    )}
                  </div>
                  {importProgress.total > 0 && (
                    <>
                      <div
                        style={{
                          width: '100%',
                          height: '20px',
                          backgroundColor: 'var(--bg-tertiary, #f0f0f0)',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${(importProgress.current / importProgress.total) * 100}%`,
                            height: '100%',
                            backgroundColor: 'var(--primary, #007bff)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Processed: {importProgress.processed} | Failed: {importProgress.failed}
                      </div>
                    </>
                  )}
                  {importProgress.total === 0 && importProgress.message && (
                    <div
                      style={{
                        padding: '0.5rem',
                        backgroundColor: 'var(--bg-secondary, #f5f5f5)',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {importProgress.message}
                    </div>
                  )}
                </div>
              </div>
            )}
            {importMessage && (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--success-light)',
                  color: 'var(--success)',
                  borderRadius: '4px',
                  marginTop: '1rem',
                }}
              >
                {importMessage}
              </div>
            )}
            {importError && (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--danger-light)',
                  color: 'var(--danger)',
                  borderRadius: '4px',
                  marginTop: '1rem',
                }}
              >
                {importError}
              </div>
            )}
          </div>

          <div className="cache-control" style={{ marginTop: '2rem' }}>
            <h2>Export Profile</h2>
            <p className="cache-description">
              Export your complete profile including all movies, favorites, sorting, filters, and
              preferences to a ZIP file
            </p>
            <div
              style={{ position: 'relative', display: 'block', width: '100%', marginTop: '1rem' }}
            >
              <button
                onClick={() => setExportOptionsOpen(!exportOptionsOpen)}
                className="upload-button"
                disabled={exportLoading}
                style={{ width: '100%' }}
              >
                {exportLoading ? 'Exporting...' : 'Export Profile'}
              </button>
              {exportOptionsOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '0.5rem',
                    padding: '1rem',
                    backgroundColor: 'var(--modal-bg, white)',
                    border: '1px solid var(--border-color, #ddd)',
                    borderRadius: '4px',
                    zIndex: 1000,
                    minWidth: '200px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeTmdbData}
                      onChange={(e) => setIncludeTmdbData(e.target.checked)}
                    />
                    <span>Include TMDB data</span>
                  </label>
                  <button
                    onClick={handleExportClick}
                    className="upload-button"
                    disabled={exportLoading}
                    style={{ width: '100%' }}
                  >
                    {exportLoading ? 'Exporting...' : 'Download'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="cache-control" style={{ marginTop: '2rem' }}>
            <h2>Export Movies</h2>
            <p className="cache-description">
              Export filtered movies in CSV, JSON, Markdown, or Letterboxd format
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: '500' }}>
                Quick Export Presets:
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  className="upload-button"
                  onClick={async () => {
                    setExportFormat('letterboxd');
                    setExportColumns(''); // Letterboxd format uses its own columns
                    setExportIncludeNotes(false);
                    await handleExportMovies();
                  }}
                  disabled={exportMoviesLoading}
                  style={{ width: '100%', fontSize: '0.9rem' }}
                >
                  Letterboxd Format (CSV)
                </button>
                <button
                  className="upload-button"
                  onClick={async () => {
                    setExportFormat('csv');
                    setExportColumns('title,year');
                    setExportIncludeNotes(false);
                    await handleExportMovies();
                  }}
                  disabled={exportMoviesLoading}
                  style={{ width: '100%', fontSize: '0.9rem' }}
                >
                  Simple List (Title, Year)
                </button>
                <button
                  className="upload-button"
                  onClick={async () => {
                    setExportFormat('csv');
                    setExportColumns('title,year,director,runtime,genres,country,notes');
                    setExportIncludeNotes(true);
                    await handleExportMovies();
                  }}
                  disabled={exportMoviesLoading}
                  style={{ width: '100%', fontSize: '0.9rem' }}
                >
                  Detailed List (All Fields)
                </button>
              </div>
            </div>
            <div style={{ position: 'relative', display: 'block', width: '100%' }}>
              <button
                onClick={() => setExportMoviesOpen(!exportMoviesOpen)}
                className="upload-button"
                disabled={exportMoviesLoading}
                style={{ width: '100%' }}
              >
                {exportMoviesLoading ? 'Exporting...' : 'Custom Export'}
              </button>
              {exportMoviesOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '0.5rem',
                    padding: '1rem',
                    backgroundColor: 'var(--modal-bg, white)',
                    border: '1px solid var(--border-color, #ddd)',
                    borderRadius: '4px',
                    zIndex: 1000,
                    minWidth: '300px',
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Format:
                    </label>
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                      <option value="markdown">Markdown</option>
                      <option value="letterboxd">Letterboxd Format</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Columns (comma-separated):
                    </label>
                    {exportFormat === 'letterboxd' ? (
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--input-disabled-bg, #f5f5f5)',
                          color: 'var(--text-secondary, #666)',
                          fontSize: '0.9rem',
                        }}
                      >
                        Letterboxd format uses fixed columns: Title, Year, Directors, LetterboxdURI
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={exportColumns}
                        onChange={(e) => setExportColumns(e.target.value)}
                        placeholder="title,year,director,runtime,genres"
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                        }}
                      />
                    )}
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={exportIncludeNotes}
                      onChange={(e) => setExportIncludeNotes(e.target.checked)}
                    />
                    <span>Include notes</span>
                  </label>
                  <button
                    onClick={handleExportMovies}
                    className="upload-button"
                    disabled={exportMoviesLoading}
                    style={{ width: '100%' }}
                  >
                    {exportMoviesLoading ? 'Exporting...' : 'Download'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {onProcessTrackedLists && (
            <div className="cache-control" style={{ marginTop: '2rem' }}>
              <h2>Tracked Lists</h2>
              <p className="cache-description">
                Re-apply tracked lists (e.g. IMDb Top 250, Letterboxd Top 250) to match your movies. Run this after adding or importing movies.
              </p>
              <button onClick={onProcessTrackedLists} className="clear-cache-button" type="button">
                Refresh Tracked Lists
              </button>
            </div>
          )}
          <div className="cache-control" style={{ marginTop: '2rem' }}>
            <h2>Reset Database</h2>
            <p className="cache-description">
              Clear the movie cache and reset all settings to default values
            </p>
            <button onClick={onClearCache} className="clear-cache-button">
              Reset Database
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const { user } = useAuth();

  // Get system theme preference
  const getSystemTheme = useCallback(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  // Get resolved theme (what actually gets applied to the DOM)
  const getResolvedTheme = useCallback(
    (themeValue) => {
      if (themeValue === 'system') {
        return getSystemTheme();
      }
      return themeValue;
    },
    [getSystemTheme]
  );

  // Initialize theme from localStorage or default to 'system'
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    // Support legacy 'dark' and 'light' values, or default to 'system'
    return savedTheme && ['system', 'dark', 'light'].includes(savedTheme) ? savedTheme : 'system';
  });

  // Apply theme to document
  useEffect(() => {
    const resolvedTheme = getResolvedTheme(theme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('theme', theme);
  }, [theme, getResolvedTheme]);

  // Listen for system preference changes when theme is set to 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const resolvedTheme = getSystemTheme();
      document.documentElement.setAttribute('data-theme', resolvedTheme);
    };

    // Set initial theme
    handleChange();

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, getSystemTheme]);

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [previousMovie, setPreviousMovie] = useState(null);
  const [collectionMovies, setCollectionMovies] = useState([]);
  const [similarMovies, setSimilarMovies] = useState([]);
  const [selectedDirector, setSelectedDirector] = useState(null);
  const [directorsModalOpen, setDirectorsModalOpen] = useState(false);
  const [favoriteDirectors, setFavoriteDirectors] = useState([]);
  const [statisticsDashboardOpen, setStatisticsDashboardOpen] = useState(false);
  // Initialize viewMode from localStorage or default to 'expanded'
  const [viewMode, setViewMode] = useState(() => {
    const savedViewMode = localStorage.getItem('viewMode');
    return savedViewMode || 'expanded'; // 'tile' or 'expanded'
  });
  const [importExportModalOpen, setImportExportModalOpen] = useState(false);
  const [csvPreviewModalOpen, setCsvPreviewModalOpen] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState(null);
  const [csvPreviewSelections, setCsvPreviewSelections] = useState(null);
  const [csvPreviewFile, setCsvPreviewFile] = useState(null);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [selectedMovieIndex, setSelectedMovieIndex] = useState(-1);
  const [toasts, setToasts] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const [randomPickerOpen, setRandomPickerOpen] = useState(false);
  const [randomPickerOpenInMenu, setRandomPickerOpenInMenu] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [countryCode, setCountryCode] = useState(() => {
    // Initialize from localStorage if available, otherwise default to 'US'
    const stored = getStoredCountry();
    return stored || 'US';
  });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [addMovieModalOpen, setAddMovieModalOpen] = useState(false);
  const [addMovieModalInitialData, setAddMovieModalInitialData] = useState(null);
  const [preferredServices, setPreferredServices] = useState(() => {
    try {
      const saved = localStorage.getItem('preferred_streaming_services');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [statsSettings, setStatsSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('stats_customization_settings');
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
  const searchInputRef = useRef(null);
  const randomPickerRef = useRef(null);
  const headerContainerRef = useRef(null);
  const headerTitleRef = useRef(null);
  const headerActionsRef = useRef(null);
  const hamburgerMenuRef = useRef(null);
  const [isHamburgerMenuOpen, setIsHamburgerMenuOpen] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showDialog = useCallback((options) => {
    const id = `dialog-${Date.now()}-${Math.random()}`;
    const dialog = {
      id,
      title: options.title || null,
      message: options.message || '',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      type: options.type || 'confirm',
      onConfirm: options.onConfirm || null,
      onCancel: options.onCancel || null,
    };
    setDialogs((prev) => [...prev, dialog]);
    return id;
  }, []);

  const removeDialog = useCallback((id) => {
    setDialogs((prev) => prev.filter((dialog) => dialog.id !== id));
  }, []);

  // Helper function to show a confirmation dialog (similar to window.confirm)
  const showConfirm = useCallback(
    (message, title = 'Confirm') => {
      return new Promise((resolve) => {
        showDialog({
          title,
          message,
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          type: 'confirm',
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
    },
    [showDialog]
  );
  // Helper function to remove is_favorite from sorts array (favorites are always fixed at top)
  const removeFavoritesFromSorts = (sortsArray) => {
    if (!sortsArray || !Array.isArray(sortsArray)) {
      return [
        { field: 'year', order: 'desc' },
        { field: 'title', order: 'asc' },
      ];
    }

    // Remove is_favorite from sorts (favorites are always fixed at top via show_favorites_first)
    return sortsArray.filter((s) => s.field !== 'is_favorite');
  };

  // Helper function to sort movies according to the sorts array
  const sortMovies = (moviesArray, sortsArray) => {
    if (!moviesArray || moviesArray.length === 0) return moviesArray;
    if (!sortsArray || sortsArray.length === 0) {
      // Default sort: year desc, then title asc
      sortsArray = [
        { field: 'year', order: 'desc' },
        { field: 'title', order: 'asc' },
      ];
    }

    const sorted = [...moviesArray].sort((a, b) => {
      for (const sort of sortsArray) {
        const { field, order } = sort;
        let aValue = a[field];
        let bValue = b[field];

        // Handle special cases
        if (field === 'genres') {
          aValue = a.genres && Array.isArray(a.genres) ? a.genres.join(', ') : '';
          bValue = b.genres && Array.isArray(b.genres) ? b.genres.join(', ') : '';
        } else if (field === 'production_company') {
          aValue = a.production_company || '';
          bValue = b.production_company || '';
        } else if (field === 'vote_average') {
          aValue = a.vote_average ?? 0;
          bValue = b.vote_average ?? 0;
        } else if (field === 'popularity') {
          aValue = a.popularity ?? 0;
          bValue = b.popularity ?? 0;
        } else if (field === 'runtime') {
          aValue = a.runtime ?? 0;
          bValue = b.runtime ?? 0;
        } else if (field === 'year') {
          aValue = a.year ?? 0;
          bValue = b.year ?? 0;
        } else if (field === 'director') {
          aValue = (a.director || '').toLowerCase();
          bValue = (b.director || '').toLowerCase();
        } else if (field === 'country') {
          aValue = (a.country || '').toLowerCase();
          bValue = (b.country || '').toLowerCase();
        } else {
          // Default: treat as string
          aValue = (aValue || '').toString().toLowerCase();
          bValue = (bValue || '').toString().toLowerCase();
        }

        // Handle null/undefined values - put them at the end
        if (aValue === null || aValue === undefined || aValue === '') {
          if (bValue === null || bValue === undefined || bValue === '') {
            continue; // Both are null/undefined, check next sort field
          }
          return 1; // a comes after b
        }
        if (bValue === null || bValue === undefined || bValue === '') {
          return -1; // b comes after a
        }

        // Compare values
        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        }

        if (comparison !== 0) {
          return order === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });

    return sorted;
  };

  // Load default sorts from localStorage or use default (favorites are handled separately)
  const [defaultSorts, setDefaultSorts] = useState(() => {
    const saved = localStorage.getItem('defaultSorts');
    if (saved) {
      try {
        const loadedSorts = JSON.parse(saved);
        return removeFavoritesFromSorts(loadedSorts);
      } catch (e) {
        console.error('Error parsing defaultSorts from localStorage:', e);
      }
    }
    return [
      { field: 'year', order: 'desc' },
      { field: 'title', order: 'asc' },
    ];
  });

  const [sorts, setSorts] = useState(() => {
    // Try to load current sorts first, fallback to defaultSorts, then to default
    const savedCurrent = localStorage.getItem('currentSorts');
    if (savedCurrent) {
      try {
        const loadedSorts = JSON.parse(savedCurrent);
        return removeFavoritesFromSorts(loadedSorts);
      } catch (e) {
        console.error('Error parsing currentSorts from localStorage:', e);
      }
    }
    // Fallback to defaultSorts if currentSorts not found
    const savedDefault = localStorage.getItem('defaultSorts');
    if (savedDefault) {
      try {
        const loadedSorts = JSON.parse(savedDefault);
        return removeFavoritesFromSorts(loadedSorts);
      } catch (e) {
        return removeFavoritesFromSorts(null);
      }
    }
    return removeFavoritesFromSorts(null);
  });
  // Load showFavoritesFirst from localStorage or default to true
  const [showFavoritesFirst, setShowFavoritesFirst] = useState(() => {
    const saved = localStorage.getItem('showFavoritesFirst');
    if (saved !== null) {
      return saved === 'true';
    }
    return true; // Default to true
  });
  // Load defaultShowFavoritesFirst from localStorage or default to true
  const [defaultShowFavoritesFirst, setDefaultShowFavoritesFirst] = useState(() => {
    const saved = localStorage.getItem('defaultShowFavoritesFirst');
    if (saved !== null) {
      return saved === 'true';
    }
    return true; // Default to true
  });

  // Save defaultSorts to localStorage when they change (ensure is_favorite is removed)
  useEffect(() => {
    const cleanedSorts = defaultSorts.filter((s) => s.field !== 'is_favorite');
    localStorage.setItem('defaultSorts', JSON.stringify(cleanedSorts));
  }, [defaultSorts]);

  // Save current sorts to localStorage when they change (ensure is_favorite is removed)
  useEffect(() => {
    const cleanedSorts = sorts.filter((s) => s.field !== 'is_favorite');
    localStorage.setItem('currentSorts', JSON.stringify(cleanedSorts));
  }, [sorts]);

  // Always ensure showFavoritesFirst is true (favorites always at top)
  useEffect(() => {
    if (!showFavoritesFirst) {
      setShowFavoritesFirst(true);
    }
  }, [showFavoritesFirst]);

  // Save defaultShowFavoritesFirst to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('defaultShowFavoritesFirst', defaultShowFavoritesFirst.toString());
  }, [defaultShowFavoritesFirst]);

  // Save showFavoritesFirst to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('showFavoritesFirst', showFavoritesFirst.toString());
  }, [showFavoritesFirst]);

  // Save viewMode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  // Monitor header to detect when buttons overflow and show hamburger menu
  useEffect(() => {
    const checkButtonOverflow = () => {
      const container = headerContainerRef.current;
      const title = headerTitleRef.current;
      const actions = headerActionsRef.current;

      if (!container || !title || !actions) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();

      // Always measure the regular buttons container (it's always rendered, just hidden)
      const regularButtons = actions.querySelector('.header-actions-regular');
      if (!regularButtons) {
        setShowHamburgerMenu(false);
        return;
      }

      // Temporarily make it visible to measure accurately
      const wasHidden = regularButtons.classList.contains('header-actions-hidden');
      if (wasHidden) {
        regularButtons.classList.remove('header-actions-hidden');
        // Force a reflow to ensure measurement is accurate
        void regularButtons.offsetWidth;
      }

      const regularButtonsRect = regularButtons.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const titleWidth = titleRect.width;
      const regularButtonsWidth = regularButtonsRect.width;

      // Restore hidden state if it was hidden
      if (wasHidden) {
        regularButtons.classList.add('header-actions-hidden');
      }

      // Don't make decisions if elements aren't measured yet
      if (containerWidth === 0 || titleWidth === 0 || regularButtonsWidth === 0) {
        // Elements not ready yet - default to showing regular buttons
        setShowHamburgerMenu(false);
        return;
      }

      // Calculate required width: title + buttons + minimum gap
      const minGap = 12;
      const requiredWidth = titleWidth + regularButtonsWidth + minGap;

      // Use hysteresis to prevent rapid toggling (blinking)
      // Consistent thresholds for both show and hide (30px buffer)
      const threshold = 30;
      const exceedsBy = requiredWidth - containerWidth;

      // Use a ref to track the current state to avoid stale closures
      setShowHamburgerMenu((prev) => {
        if (prev) {
          // Hamburger is currently showing - show regular buttons if there's enough space
          if (exceedsBy <= -threshold) {
            return false;
          }
        } else {
          // Regular buttons are showing - show hamburger if they don't fit
          if (exceedsBy > threshold) {
            return true;
          }
        }
        return prev;
      });
    };

    // Debounce function
    let debounceTimer;
    const debouncedCheck = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkButtonOverflow, 150);
    };

    // Initial check after render - give it time for elements to fully render
    let initialTimer;
    let rafId;
    const doInitialCheck = () => {
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          initialTimer = setTimeout(checkButtonOverflow, 200);
        });
      });
    };
    doInitialCheck();

    // Set up ResizeObserver for container
    const containerObserver = headerContainerRef.current
      ? new ResizeObserver(debouncedCheck)
      : null;

    // Set up ResizeObserver for title (in case content changes)
    const titleObserver = headerTitleRef.current ? new ResizeObserver(debouncedCheck) : null;

    // Set up ResizeObserver for actions (in case buttons change)
    const actionsObserver = headerActionsRef.current ? new ResizeObserver(debouncedCheck) : null;

    // Also listen to window resize as fallback
    window.addEventListener('resize', debouncedCheck);

    if (containerObserver && headerContainerRef.current) {
      containerObserver.observe(headerContainerRef.current);
    }
    if (titleObserver && headerTitleRef.current) {
      titleObserver.observe(headerTitleRef.current);
    }
    if (actionsObserver && headerActionsRef.current) {
      actionsObserver.observe(headerActionsRef.current);
    }

    // Cleanup
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      clearTimeout(initialTimer);
      clearTimeout(debounceTimer);
      window.removeEventListener('resize', debouncedCheck);
      if (containerObserver) {
        containerObserver.disconnect();
      }
      if (titleObserver) {
        titleObserver.disconnect();
      }
      if (actionsObserver) {
        actionsObserver.disconnect();
      }
    };
  }, []);

  // Close hamburger menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        hamburgerMenuRef.current &&
        !hamburgerMenuRef.current.contains(event.target) &&
        randomPickerRef.current &&
        !randomPickerRef.current.contains(event.target)
      ) {
        setIsHamburgerMenuOpen(false);
        setRandomPickerOpenInMenu(false);
      }
    };

    if (isHamburgerMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHamburgerMenuOpen]);

  // Handle Escape key to close hamburger menu
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isHamburgerMenuOpen) {
        if (randomPickerOpenInMenu) {
          setRandomPickerOpenInMenu(false);
        } else {
          setIsHamburgerMenuOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isHamburgerMenuOpen, randomPickerOpenInMenu]);

  // Load column preferences from localStorage or use defaults
  const [columnsExpanded, setColumnsExpanded] = useState(() => {
    const saved = localStorage.getItem('columnsExpanded');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing columnsExpanded from localStorage:', e);
      }
    }
    return getDefaultColumns('expanded');
  });

  const [columnCustomizerOpen, setColumnCustomizerOpen] = useState(false);

  // Save column preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('columnsExpanded', JSON.stringify(columnsExpanded));
  }, [columnsExpanded]);

  // Get current columns based on view mode
  const currentColumns = viewMode === 'expanded' ? columnsExpanded : null;

  const [filters, setFilters] = useState(() => {
    // Load filters from localStorage on mount
    const saved = localStorage.getItem('currentFilters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing currentFilters from localStorage:', e);
      }
    }
    return [];
  });
  const [search, setSearch] = useState(() => {
    // Load search from localStorage on mount
    const saved = localStorage.getItem('currentSearch');
    return saved || '';
  });
  const [searchHistory, setSearchHistory] = useState(() => {
    const saved = localStorage.getItem('searchHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);
  const [previousFilters, setPreviousFilters] = useState(null); // Store filters before label click
  const [pagination, setPagination] = useState({
    skip: 0,
    limit: 200,
    total: 0,
    hasMore: true,
  });

  const paginationRef = useRef(pagination);
  const importReaderRef = useRef(null);
  const sortsRef = useRef(sorts);
  const filtersRef = useRef(filters);
  const searchRef = useRef(search);
  const isUpdatingFavoriteRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  useEffect(() => {
    sortsRef.current = sorts;
  }, [sorts]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // Apply preferences from server or import to state and localStorage (shared with import flow)
  const applyPreferences = useCallback(
    (prefs) => {
      if (!prefs || typeof prefs !== 'object') return;
      if (prefs.theme) {
        localStorage.setItem('theme', prefs.theme);
        setTheme(prefs.theme);
      }
      if (prefs.viewMode) {
        localStorage.setItem('viewMode', prefs.viewMode);
        setViewMode(prefs.viewMode);
      }
      if (prefs.streaming_country_code) {
        setStoredCountry(prefs.streaming_country_code);
        setCountryCode(prefs.streaming_country_code);
      }
      if (prefs.preferred_streaming_services != null) {
        const arr = Array.isArray(prefs.preferred_streaming_services)
          ? prefs.preferred_streaming_services
          : [];
        localStorage.setItem('preferred_streaming_services', JSON.stringify(arr));
        setPreferredServices(arr);
      }
      if (prefs.stats_customization_settings != null) {
        localStorage.setItem(
          'stats_customization_settings',
          JSON.stringify(prefs.stats_customization_settings)
        );
        setStatsSettings(prefs.stats_customization_settings);
      }
      if (prefs.columnsExpanded) {
        localStorage.setItem('columnsExpanded', JSON.stringify(prefs.columnsExpanded));
        setColumnsExpanded(prefs.columnsExpanded);
      }
      if (prefs.defaultSorts) {
        localStorage.setItem('defaultSorts', JSON.stringify(prefs.defaultSorts));
        setDefaultSorts(prefs.defaultSorts);
      }
      if (prefs.defaultShowFavoritesFirst !== undefined) {
        localStorage.setItem(
          'defaultShowFavoritesFirst',
          prefs.defaultShowFavoritesFirst.toString()
        );
        setDefaultShowFavoritesFirst(prefs.defaultShowFavoritesFirst);
      }
      if (prefs.currentSorts) {
        const newSorts = JSON.parse(JSON.stringify(prefs.currentSorts));
        setSorts(newSorts);
        sortsRef.current = newSorts;
        localStorage.setItem('currentSorts', JSON.stringify(newSorts));
      }
      if (prefs.currentShowFavoritesFirst !== undefined) {
        setShowFavoritesFirst(prefs.currentShowFavoritesFirst);
      }
      if (prefs.currentFilters) {
        const newFilters = JSON.parse(JSON.stringify(prefs.currentFilters));
        setFilters(newFilters);
        filtersRef.current = newFilters;
        localStorage.setItem('currentFilters', JSON.stringify(newFilters));
      }
      if (prefs.defaultFilters != null) {
        localStorage.setItem('defaultFilters', JSON.stringify(prefs.defaultFilters));
      }
      if (prefs.currentSearch != null) {
        localStorage.setItem('currentSearch', prefs.currentSearch);
        setSearch(prefs.currentSearch);
      }
      if (prefs.filterPresets) {
        localStorage.setItem('filterPresets', JSON.stringify(prefs.filterPresets));
        window.dispatchEvent(new CustomEvent('filterPresetsLoaded', { detail: prefs.filterPresets }));
      }
      if (prefs.searchHistory) {
        localStorage.setItem('searchHistory', JSON.stringify(prefs.searchHistory));
        setSearchHistory(prefs.searchHistory);
      }
    },
    []
  );

  // Load user settings from server when user is set (login or page refresh with token)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getSettings()
      .then((prefs) => {
        if (!cancelled && prefs && typeof prefs === 'object' && Object.keys(prefs).length > 0) {
          skipNextSaveRef.current = true;
          applyPreferences(prefs);
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn('Failed to load user settings:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [user, applyPreferences]);

  // Persist preferences to server when they change (debounced; skip first run after load from server)
  const SAVE_SETTINGS_DEBOUNCE_MS = 1500;
  useEffect(() => {
    if (!user) return;
    const timeoutId = setTimeout(() => {
      if (skipNextSaveRef.current) {
        skipNextSaveRef.current = false;
        return;
      }
      let filterPresets = [];
      try {
        const saved = localStorage.getItem('filterPresets');
        if (saved) filterPresets = JSON.parse(saved);
      } catch (_) {}
      let defaultFilters = [];
      try {
        const saved = localStorage.getItem('defaultFilters');
        if (saved) defaultFilters = JSON.parse(saved);
      } catch (_) {}
      const blob = {
        theme: theme || 'system',
        viewMode: viewMode || 'expanded',
        streaming_country_code: getStoredCountry() || 'US',
        preferred_streaming_services: preferredServices || [],
        stats_customization_settings: statsSettings || {},
        defaultSorts: defaultSorts || [],
        currentSorts: sorts || [],
        showFavoritesFirst: showFavoritesFirst,
        defaultShowFavoritesFirst: defaultShowFavoritesFirst,
        columnsExpanded: columnsExpanded || getDefaultColumns('expanded'),
        currentFilters: filters || [],
        defaultFilters,
        currentSearch: search ?? '',
        searchHistory: searchHistory || [],
        filterPresets,
      };
      saveSettings(blob).catch((err) => console.warn('Failed to save user settings:', err));
    }, SAVE_SETTINGS_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [
    user,
    theme,
    viewMode,
    defaultSorts,
    sorts,
    showFavoritesFirst,
    defaultShowFavoritesFirst,
    columnsExpanded,
    filters,
    search,
    searchHistory,
    preferredServices,
    statsSettings,
  ]);

  const loadMovies = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
        const initialPagination = { skip: 0, limit: 200, total: 0, hasMore: true };
        setPagination(initialPagination);
        paginationRef.current = initialPagination;
      } else {
        setLoadingMore(true);
      }

      try {
        const currentPagination = paginationRef.current;
        const currentSkip = reset ? 0 : currentPagination.skip;
        const currentLimit = currentPagination.limit;

        const params = {
          skip: currentSkip,
          limit: currentLimit,
        };

        // Use refs to get current values instead of closure values
        // This ensures we always use the latest filters/sorts/search, especially after import
        const currentSearch = searchRef.current;
        const currentFilters = filtersRef.current;
        const currentSorts = sortsRef.current;

        // Add search parameter
        if (currentSearch && currentSearch.trim() !== '') {
          params.search = currentSearch.trim();
        }

        // Collect list filters separately to combine into single JSON parameter
        const andFilters = {}; // Traditional AND filters
        const orGroups = []; // OR groups

        // Convert filters array to API params
        currentFilters.forEach((filter) => {
          const filterType = filterTypes[filter.type];

          // Handle OR groups separately
          if (filter.type === 'or_group') {
            if (filterType && filterType.getApiParams) {
              const apiParams = filterType.getApiParams(filter.config, filterTypes);
              // OR groups return or_group_list_filters array
              if (apiParams.or_group_list_filters && apiParams.or_group_list_filters.length > 0) {
                orGroups.push(apiParams.or_group_list_filters);
              }
            }
            return; // Skip processing OR groups as regular filters
          }

          if (filterType && filterType.getApiParams) {
            // Pass countryCode and preferredServices for availability filter
            const apiParams =
              filter.type === 'availability'
                ? filterType.getApiParams(filter.config, countryCode, preferredServices)
                : filterType.getApiParams(filter.config);
            // Only add non-null, non-undefined, and non-empty values
            Object.keys(apiParams).forEach((key) => {
              const value = apiParams[key];
              if (value !== null && value !== undefined) {
                // Check if this is a list filter (starts with 'is_')
                if (key.startsWith('is_')) {
                  // Collect list filters separately for AND logic
                  andFilters[key] = value;
                } else {
                  // For arrays, only include if not empty
                  if (Array.isArray(value)) {
                    if (value.length > 0) {
                      params[key] = value;
                    }
                  } else if (typeof value === 'string') {
                    // For strings, only include if not empty (after trimming)
                    if (value.trim() !== '') {
                      params[key] = value;
                    }
                  } else {
                    // For other types (numbers, booleans), include them
                    params[key] = value;
                  }
                }
              }
            });
          }
        });

        // Combine list filters into single JSON parameter with OR groups support
        const listFiltersParam = {};
        if (Object.keys(andFilters).length > 0) {
          listFiltersParam.and_filters = andFilters;
        }
        if (orGroups.length > 0) {
          listFiltersParam.or_groups = orGroups;
        }

        // Only send list_filters if we have either AND filters or OR groups
        if (Object.keys(listFiltersParam).length > 0) {
          params.list_filters = JSON.stringify(listFiltersParam);
        }

        // Convert sorts array to API format
        if (currentSorts && currentSorts.length > 0) {
          params.sorts = JSON.stringify(currentSorts);
        }

        // Always show favorites first (favorites are always fixed at top)
        params.show_favorites_first = true;

        const data = await getMovies(params);
        const newMovies = data.movies || [];

        if (reset) {
          setMovies(newMovies);
        } else {
          setMovies((prevMovies) => [...prevMovies, ...newMovies]);
        }

        const newTotal = data.total || 0;
        const newSkip = currentSkip + newMovies.length;
        const hasMore = newSkip < newTotal;

        const updatedPagination = {
          skip: newSkip,
          limit: currentLimit,
          total: newTotal,
          hasMore,
        };
        setPagination(updatedPagination);
        paginationRef.current = updatedPagination;
      } catch (error) {
        console.error('Error loading movies:', error);
        if (reset) {
          setMovies([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [showFavoritesFirst, countryCode, preferredServices]
  ); // Remove sorts/filters/search from dependencies since we use refs

  const handleToggleFavorite = async (movie) => {
    if (!movie?.id) return;
    const nextFavorite = !movie.is_favorite;

    // Save current scroll position before updating
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;

    // Get current sorts (excluding favorites sort)
    const currentSorts = removeFavoritesFromSorts(sortsRef.current);

    // Optimistic update
    setMovies((prevMovies) => {
      const updatedMovies = prevMovies.map((item) =>
        item.id === movie.id ? { ...item, is_favorite: nextFavorite } : item
      );

      if (Array.isArray(updatedMovies)) {
        const favorites = updatedMovies.filter((m) => m.is_favorite);
        const others = updatedMovies.filter((m) => !m.is_favorite);

        // If unfavoriting, sort the others array (including the unfavorited movie)
        // according to current sorts, then place favorites first
        if (!nextFavorite) {
          const sortedOthers = sortMovies(others, currentSorts);
          return [...favorites, ...sortedOthers];
        } else {
          // If favoriting, just put favorites first (they're already sorted by favorites)
          return [...favorites, ...others];
        }
      }
      return updatedMovies;
    });
    setSelectedMovie((prevSelected) =>
      prevSelected && prevSelected.id === movie.id
        ? { ...prevSelected, is_favorite: nextFavorite }
        : prevSelected
    );

    // Restore scroll position after DOM update
    // Use double requestAnimationFrame + setTimeout to ensure React has finished rendering
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.scrollTo(0, scrollPosition);
        }, 0);
      });
    });

    // Set flag to prevent infinite scroll during update
    isUpdatingFavoriteRef.current = true;
    try {
      await setMovieFavorite(movie.id, nextFavorite);
      addToast(nextFavorite ? 'Added to favorites' : 'Removed from favorites', 'success');
      // Reset flag after a short delay to allow DOM to update
      setTimeout(() => {
        isUpdatingFavoriteRef.current = false;
      }, 100);
    } catch (error) {
      console.error('Error updating favorite:', error);
      // Revert optimistic update on error
      setMovies((prevMovies) => {
        const updatedMovies = prevMovies.map((item) =>
          item.id === movie.id ? { ...item, is_favorite: !nextFavorite } : item
        );
        if (Array.isArray(updatedMovies)) {
          const favorites = updatedMovies.filter((m) => m.is_favorite);
          const others = updatedMovies.filter((m) => !m.is_favorite);

          // If nextFavorite was true (tried to favorite, failed), the movie is now unfavorited (in others)
          // So we need to sort others. If nextFavorite was false (tried to unfavorite, failed),
          // the movie is back in favorites, so no sorting needed.
          if (nextFavorite) {
            const sortedOthers = sortMovies(others, currentSorts);
            return [...favorites, ...sortedOthers];
          } else {
            return [...favorites, ...others];
          }
        }
        return updatedMovies;
      });
      setSelectedMovie((prevSelected) =>
        prevSelected && prevSelected.id === movie.id
          ? { ...prevSelected, is_favorite: !nextFavorite }
          : prevSelected
      );
      // Restore scroll position after error revert
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo(0, scrollPosition);
          }, 0);
        });
      });
      addToast('Error updating favorite', 'error');
      // Reset flag on error
      isUpdatingFavoriteRef.current = false;
    }
  };

  const handleMovieClick = useCallback(
    async (movie) => {
      try {
        // Fetch full movie data with all TMDB information
        const fullMovieData = await getMovie(movie.id);
        setSelectedMovie(fullMovieData);

        // Fetch collection movies if the movie belongs to a collection
        try {
          const collectionData = await getCollectionMovies(movie.id);
          setCollectionMovies(collectionData.movies || []);
        } catch (error) {
          console.error('Error loading collection movies:', error);
          setCollectionMovies([]);
        }

        // Fetch similar movies
        try {
          const similarData = await getSimilarMovies(movie.id);
          setSimilarMovies(similarData.similar_movies || []);
        } catch (error) {
          console.error('Error loading similar movies:', error);
          setSimilarMovies([]);
        }
      } catch (error) {
        console.error('Error loading movie details:', error);
        // Fallback to basic movie data if fetch fails
        setSelectedMovie(movie);
        setCollectionMovies([]);
        setSimilarMovies([]);
      }
    },
    [
      getMovie,
      getCollectionMovies,
      getSimilarMovies,
      setSelectedMovie,
      setCollectionMovies,
      setSimilarMovies,
    ]
  );

  const handleDeleteMovie = async (movie) => {
    if (!movie?.id) return;

    // Confirm deletion
    const confirmed = await showConfirm(
      `Are you sure you want to delete "${movie.title}" from the database?`,
      'Delete Movie'
    );
    if (!confirmed) {
      return;
    }

    // Save current scroll position before updating
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;

    // Optimistic update - remove movie from list
    let deletedMovie = null;
    setMovies((prevMovies) => {
      deletedMovie = prevMovies.find((m) => m.id === movie.id);
      return prevMovies.filter((m) => m.id !== movie.id);
    });

    // Clear selected movie if it was the deleted one
    setSelectedMovie((prevSelected) =>
      prevSelected && prevSelected.id === movie.id ? null : prevSelected
    );

    // Restore scroll position after DOM update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.scrollTo(0, scrollPosition);
        }, 0);
      });
    });

    try {
      await deleteMovie(movie.id);
      addToast(`"${movie.title}" deleted successfully`, 'success');
    } catch (error) {
      console.error('Error deleting movie:', error);
      // Revert optimistic update on error
      if (deletedMovie) {
        setMovies((prevMovies) => {
          // Try to maintain the position, but if we don't have enough context,
          // just add it back at the end
          return [...prevMovies, deletedMovie];
        });
      }
      addToast('Error deleting movie', 'error');
    }
  };

  const loadMoreMovies = useCallback(() => {
    const currentPagination = paginationRef.current;
    if (!loadingMore && !loading && currentPagination.hasMore) {
      loadMovies(false);
    }
  }, [loadMovies, loadingMore, loading]);

  const loadStats = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  useEffect(() => {
    loadMovies(true);
  }, [sorts, filters, search, loadMovies]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Load favorite directors on mount
  useEffect(() => {
    const fetchFavoriteDirectors = async () => {
      try {
        const data = await getFavoriteDirectors();
        setFavoriteDirectors(data.directors || []);
      } catch (error) {
        console.error('Error loading favorite directors:', error);
      }
    };
    fetchFavoriteDirectors();
  }, []);

  // Infinite scroll detection and scroll-to-top button visibility
  useEffect(() => {
    const handleScroll = () => {
      // Don't trigger during favorite updates to prevent issues with list reordering
      if (isUpdatingFavoriteRef.current) {
        return;
      }

      // Show/hide scroll-to-top button
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollToTop(scrollTop > 300);

      // Check if we're near the bottom of the page
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;

      // Validate scroll values to prevent issues when DOM is updating
      if (scrollHeight <= 0 || clientHeight <= 0 || scrollTop < 0) {
        return;
      }

      // Load more when within 200px of bottom
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom >= 0 && distanceFromBottom < 200) {
        loadMoreMovies();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreMovies]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't trigger shortcuts when typing in inputs, textareas, or when modals are open
      const target = event.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isContentEditable = target.contentEditable === 'true';

      // Allow Escape to close modals even when in inputs
      if (
        event.key === 'Escape' &&
        (selectedMovie ||
          importExportModalOpen ||
          shortcutsHelpOpen ||
          statisticsDashboardOpen ||
          settingsModalOpen ||
          helpModalOpen ||
          addMovieModalOpen)
      ) {
        if (shortcutsHelpOpen) {
          setShortcutsHelpOpen(false);
        } else if (settingsModalOpen) {
          setSettingsModalOpen(false);
        } else if (helpModalOpen) {
          setHelpModalOpen(false);
        } else if (addMovieModalOpen) {
          setAddMovieModalOpen(false);
        } else if (selectedMovie) {
          handleCloseModal();
        } else if (importExportModalOpen) {
          setImportExportModalOpen(false);
        } else if (statisticsDashboardOpen) {
          setStatisticsDashboardOpen(false);
        }
        event.preventDefault();
        return;
      }

      // Allow ? to open shortcuts help from anywhere
      // Handle both '?' key and Shift+/ (which produces '?' on most keyboards)
      if (
        (event.key === '?' || (event.key === '/' && event.shiftKey)) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !isInput &&
        !isContentEditable
      ) {
        setShortcutsHelpOpen(true);
        event.preventDefault();
        return;
      }

      if (
        isInput ||
        isContentEditable ||
        selectedMovie ||
        importExportModalOpen ||
        shortcutsHelpOpen ||
        statisticsDashboardOpen ||
        settingsModalOpen ||
        helpModalOpen ||
        addMovieModalOpen
      ) {
        return;
      }

      // Handle shortcuts
      switch (event.key) {
        case '/':
          event.preventDefault();
          if (searchInputRef.current) {
            searchInputRef.current.focus();
          }
          break;
        case 'Escape':
          event.preventDefault();
          setSelectedMovieIndex(-1);
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedMovieIndex >= 0 && selectedMovieIndex < movies.length) {
            const movie = movies[selectedMovieIndex];
            // Use the handler from props/scope
            handleMovieClick(movie);
          }
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          if (selectedMovieIndex >= 0 && selectedMovieIndex < movies.length) {
            const movie = movies[selectedMovieIndex];
            handleToggleFavorite(movie);
          }
          break;
        case '?':
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            setShortcutsHelpOpen(true);
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (selectedMovieIndex > 0) {
            setSelectedMovieIndex(selectedMovieIndex - 1);
            // Scroll into view
            const prevElement = document.querySelector(
              `[data-movie-index="${selectedMovieIndex - 1}"]`
            );
            if (prevElement) {
              prevElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (selectedMovieIndex < movies.length - 1) {
            setSelectedMovieIndex(selectedMovieIndex + 1);
            // Scroll into view
            const nextElement = document.querySelector(
              `[data-movie-index="${selectedMovieIndex + 1}"]`
            );
            if (nextElement) {
              nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
          break;
        default:
          // No action for other keys
          break;
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    movies,
    selectedMovieIndex,
    selectedMovie,
    importExportModalOpen,
    shortcutsHelpOpen,
    statisticsDashboardOpen,
    addMovieModalOpen,
    handleToggleFavorite,
    settingsModalOpen,
    helpModalOpen,
    handleMovieClick,
  ]);

  // Reset selected movie index when movies change
  useEffect(() => {
    setSelectedMovieIndex(-1);
  }, [movies]);

  // Close random picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (randomPickerRef.current && !randomPickerRef.current.contains(event.target)) {
        setRandomPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSortsChange = (newSorts) => {
    // Remove is_favorite from sorts (favorites are always fixed at top)
    const cleanedSorts = newSorts.filter((s) => s.field !== 'is_favorite');
    setSorts(cleanedSorts);
  };

  const handleSetDefaultSorts = (newDefaultSorts) => {
    // Remove is_favorite from default sorts (favorites are always fixed at top)
    const cleanedSorts = (newDefaultSorts || []).filter((s) => s.field !== 'is_favorite');
    setDefaultSorts(cleanedSorts);
    setSorts(cleanedSorts);
  };

  const handleSetDefaultShowFavoritesFirst = (newDefaultShowFavoritesFirst) => {
    setDefaultShowFavoritesFirst(newDefaultShowFavoritesFirst);
    setShowFavoritesFirst(newDefaultShowFavoritesFirst);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    // Don't clear previousFilters here - only clear when reverting or when a new label is clicked
  };

  const handleFilterByTrackedList = (columnName) => {
    // Save current filters so user can revert
    setPreviousFilters(filters.length > 0 ? JSON.parse(JSON.stringify(filters)) : []);

    // Create a new filter for this tracked list only (clearing all other filters)
    const filterType = filterTypes[columnName];
    if (!filterType) {
      // If filter type not found, just return
      return;
    }

    const newFilter = {
      id: `${columnName}-${Date.now()}`,
      type: columnName,
      config: { value: true },
    };

    const newFilters = [newFilter];
    setFilters(newFilters);
    filtersRef.current = newFilters;
    loadMovies(true);
  };

  const handleRevertFilters = () => {
    if (previousFilters) {
      setFilters(previousFilters);
      filtersRef.current = previousFilters;
      setPreviousFilters(null); // Clear after reverting
      loadMovies(true);
    }
  };

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem('currentFilters', JSON.stringify(filters));
  }, [filters]);

  // Save search to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('currentSearch', search);
  }, [search]);

  // Initialize country detection on mount
  useEffect(() => {
    const initCountry = async () => {
      const detected = await detectCountry();
      setCountryCode(detected);
    };
    initCountry();
  }, []);

  // Update stored country when countryCode changes
  useEffect(() => {
    if (countryCode) {
      setStoredCountry(countryCode);
    }
  }, [countryCode]);

  // Listen for changes to preferred services in localStorage
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'preferred_streaming_services') {
        try {
          const newPreferred = e.newValue ? JSON.parse(e.newValue) : [];
          setPreferredServices(newPreferred);
        } catch (err) {
          console.error('Error parsing preferred services:', err);
        }
      }
    };
    const handleCustomChange = (e) => {
      try {
        const newPreferred = e.detail?.newValue ? JSON.parse(e.detail.newValue) : [];
        setPreferredServices(newPreferred);
      } catch (err) {
        console.error('Error parsing preferred services:', err);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom events (for same-tab updates)
    window.addEventListener('preferredServicesChanged', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('preferredServicesChanged', handleCustomChange);
    };
  }, []);

  // Listen for changes to streaming country in localStorage
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'streaming_country_code') {
        if (e.newValue && e.newValue.length === 2) {
          setCountryCode(e.newValue.toUpperCase());
        }
      }
    };
    const handleCustomChange = (e) => {
      const newCountry = e.detail?.newValue;
      if (newCountry && newCountry.length === 2) {
        setCountryCode(newCountry.toUpperCase());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom events (for same-tab updates)
    window.addEventListener('streamingCountryChanged', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('streamingCountryChanged', handleCustomChange);
    };
  }, []);

  // Listen for changes to stats settings in localStorage
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'stats_customization_settings') {
        try {
          const newSettings = e.newValue ? JSON.parse(e.newValue) : null;
          if (newSettings) {
            setStatsSettings(newSettings);
          }
        } catch (err) {
          console.error('Error parsing stats settings:', err);
        }
      }
    };
    const handleCustomChange = (e) => {
      try {
        const newSettings = e.detail?.newValue ? JSON.parse(e.detail.newValue) : null;
        if (newSettings) {
          setStatsSettings(newSettings);
        }
      } catch (err) {
        console.error('Error parsing stats settings:', err);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom events (for same-tab updates)
    window.addEventListener('statsSettingsChanged', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('statsSettingsChanged', handleCustomChange);
    };
  }, []);

  // Function to add search to history (only called on final searches, not keystrokes)
  const addToSearchHistory = useCallback((searchTerm) => {
    const trimmed = searchTerm.trim();
    if (trimmed && trimmed !== '') {
      setSearchHistory((prev) => {
        // Don't add if it's the same as the most recent search
        if (prev.length > 0 && prev[0] === trimmed) {
          return prev;
        }
        const filtered = prev.filter((s) => s !== trimmed);
        const updated = [trimmed, ...filtered].slice(0, 10); // Keep last 10
        localStorage.setItem('searchHistory', JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  const handleUploadSuccess = () => {
    loadMovies();
    loadStats();
    setImportExportModalOpen(false);
  };

  const handleAddMovieSuccess = () => {
    loadMovies();
    loadStats();
    addToast('Movie added successfully!', 'success');
  };

  const handleExportProfile = async (includeTmdbData) => {
    // Collect preferences from localStorage
    const preferences = {
      theme: localStorage.getItem('theme') || 'system',
      viewMode: localStorage.getItem('viewMode') || 'expanded',
      columnsExpanded: (() => {
        try {
          const saved = localStorage.getItem('columnsExpanded');
          return saved ? JSON.parse(saved) : getDefaultColumns('expanded');
        } catch (e) {
          return getDefaultColumns('expanded');
        }
      })(),
      defaultSorts: (() => {
        try {
          const saved = localStorage.getItem('defaultSorts');
          return saved ? JSON.parse(saved) : defaultSorts;
        } catch (e) {
          return defaultSorts;
        }
      })(),
      defaultShowFavoritesFirst: localStorage.getItem('defaultShowFavoritesFirst') === 'true',
      currentSorts: sorts || [],
      currentShowFavoritesFirst: showFavoritesFirst,
      currentFilters: filters || [],
      defaultFilters: (() => {
        try {
          const saved = localStorage.getItem('defaultFilters');
          return saved ? JSON.parse(saved) : [];
        } catch (e) {
          return [];
        }
      })(),
      filterPresets: (() => {
        try {
          const saved = localStorage.getItem('filterPresets');
          return saved ? JSON.parse(saved) : [];
        } catch (e) {
          return [];
        }
      })(),
      searchHistory: (() => {
        try {
          const saved = localStorage.getItem('searchHistory');
          return saved ? JSON.parse(saved) : [];
        } catch (e) {
          return [];
        }
      })(),
      streaming_country_code: getStoredCountry() || 'US',
      preferred_streaming_services: preferredServices || [],
      stats_customization_settings: statsSettings || {},
    };

    await exportProfile(includeTmdbData, preferences);
  };

  const handleImportProfile = async (
    file,
    callbacks = {},
    loadMoviesFn = null,
    loadStatsFn = null
  ) => {
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const formData = new FormData();
    formData.append('file', file);

    try {
      let response;
      const token = getToken();
      try {
        response = await fetch(`${API_BASE_URL}/api/import-profile`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          // Don't set Content-Type - browser will set it with boundary automatically
        });
      } catch (fetchError) {
        // Handle network errors (CORS, connection refused, etc.)
        if (fetchError.name === 'TypeError' && (fetchError.message.includes('fetch') || fetchError.message.includes('Failed to fetch'))) {
          throw new Error(`Failed to connect to backend at ${API_BASE_URL}. Please check CORS configuration and ensure the backend is running.`);
        }
        throw fetchError;
      }

      if (!response.ok) {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.detail || `HTTP error! status: ${response.status}`);
        } catch (e) {
          if (e instanceof Error && e.message.includes('HTTP error')) {
            throw e;
          }
          throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
      }

      if (!response.body) {
        throw new Error('Response body is null - server may not support streaming');
      }

      const reader = response.body.getReader();
      importReaderRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      let importResult = null;

      const readStream = () => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              importReaderRef.current = null;
              if (callbacks.onComplete && importResult) {
                callbacks.onComplete(importResult);
              }
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() && line.startsWith('data: ')) {
                try {
                  const jsonStr = line.substring(6); // Remove 'data: ' prefix
                  const data = JSON.parse(jsonStr);

                  // Don't handle import phase progress - only show progress during TMDB processing
                  // Ignore any import_phase or finalizing messages

                  // Handle import completion
                  if (data.import_complete) {
                    importResult = {
                      movies_imported: data.movies_imported,
                      movies_failed: data.movies_failed,
                      errors: data.errors,
                      preferences: data.preferences,
                      tmdb_data_fetched: 0,
                    };

                    // Check if TMDB processing is needed (if done is also true, no TMDB processing)
                    if (data.done) {
                      // No TMDB processing needed - mark as complete immediately
                      if (callbacks.onSetProcessingTmdb) {
                        callbacks.onSetProcessingTmdb(false);
                      }
                      importResult.tmdb_data_fetched = data.tmdb_data_fetched || 0;
                      importResult.tmdb_data_failed = data.failed || 0;
                    } else {
                      // TMDB processing will follow
                      if (callbacks.onSetProcessingTmdb) {
                        callbacks.onSetProcessingTmdb(true);
                      }
                    }

                    // Restore preferences immediately - set state and localStorage (shared applyPreferences)
                    if (data.preferences) {
                      applyPreferences(data.preferences);
                    }

                    if (callbacks.onImportComplete) {
                      callbacks.onImportComplete(importResult);
                    }

                    // If done is true, complete immediately (no TMDB processing needed)
                    // Note: loadMovies will be called automatically by useEffect when sorts/filters/search change
                    // But we still need to call it if no preferences were restored
                    if (data.done) {
                      // Call loadMovies immediately (useEffect will also trigger if preferences changed)
                      // Using setTimeout(0) to ensure it runs after all preference state updates
                      setTimeout(() => {
                        if (loadMoviesFn) {
                          loadMoviesFn(true);
                        }
                        if (loadStatsFn) {
                          loadStatsFn();
                        }
                      }, 0);
                      // Call onComplete to close modal and show success message
                      if (importResult && callbacks.onComplete) {
                        callbacks.onComplete(importResult);
                      }
                    }
                  }

                  // Handle TMDB processing progress (only if not import phase)
                  if (
                    data.current !== undefined &&
                    data.total !== undefined &&
                    !data.done &&
                    !data.import_phase &&
                    !data.import_complete
                  ) {
                    if (callbacks.onSetProcessingTmdb) {
                      callbacks.onSetProcessingTmdb(true);
                    }
                    if (callbacks.onProgress) {
                      callbacks.onProgress({
                        current: data.current,
                        total: data.total,
                        processed: data.processed || 0,
                        failed: data.failed || 0,
                      });
                    }
                  }

                  // Handle completion (after TMDB processing completes)
                  if (data.done && !data.import_complete) {
                    if (callbacks.onSetProcessingTmdb) {
                      callbacks.onSetProcessingTmdb(false);
                    }
                    // Update importResult with TMDB processing results
                    if (importResult) {
                      importResult.tmdb_data_fetched = data.processed || 0;
                      importResult.tmdb_data_failed = data.failed || 0;
                    }

                    // Reload movies and stats immediately when complete
                    // loadMovies will read from refs which have the latest filters/sorts values
                    if (loadMoviesFn) {
                      loadMoviesFn(true);
                    }
                    if (loadStatsFn) {
                      loadStatsFn();
                    }

                    // Call onComplete to close modal and show success message
                    if (importResult && callbacks.onComplete) {
                      callbacks.onComplete(importResult);
                    }
                  }

                  // Handle errors
                  if (data.error) {
                    if (callbacks.onError) {
                      callbacks.onError(data.error);
                    }
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e, line);
                }
              }
            }

            // Continue reading immediately - don't wait
            readStream();
          })
          .catch((error) => {
            console.error('Error reading stream:', error);
            importReaderRef.current = null;
            if (callbacks.onError) {
              callbacks.onError(error.message);
            }
          });
      };

      // Start reading the stream immediately and continuously
      readStream();
    } catch (error) {
      console.error('Error importing profile:', error);
      if (callbacks.onError) {
        callbacks.onError(error.message);
      }
      throw error;
    }
  };

  const handleClearCache = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to reset the database? This will permanently delete all movies and reset all settings to their default values.',
      'Reset Database'
    );
    if (confirmed) {
      try {
        const result = await clearCache();

        // Default values
        const defaultSortsValue = [
          { field: 'year', order: 'desc' },
          { field: 'title', order: 'asc' },
        ];
        const defaultColumnsExpanded = getDefaultColumns('expanded');

        // Reset all localStorage settings to defaults
        localStorage.setItem('theme', 'system');
        setTheme('system');
        localStorage.setItem('viewMode', 'expanded');
        localStorage.setItem('defaultSorts', JSON.stringify(defaultSortsValue));
        localStorage.setItem('currentSorts', JSON.stringify(defaultSortsValue));
        localStorage.setItem('showFavoritesFirst', 'true');
        localStorage.setItem('defaultShowFavoritesFirst', 'true');
        localStorage.setItem('columnsExpanded', JSON.stringify(defaultColumnsExpanded));
        localStorage.setItem('currentFilters', JSON.stringify([]));
        localStorage.setItem('currentSearch', '');
        // Clear CSV processing state if it exists
        localStorage.removeItem('csvProcessingState');
        // Clear filter presets so they don't persist to a new account or after reset
        localStorage.removeItem('filterPresets');
        window.dispatchEvent(new CustomEvent('filterPresetsCleared'));

        // Reset all state to defaults
        setTheme('dark');
        setViewMode('expanded');
        setDefaultSorts(defaultSortsValue);
        setSorts(defaultSortsValue);
        setShowFavoritesFirst(true);
        setDefaultShowFavoritesFirst(true);
        setColumnsExpanded(defaultColumnsExpanded);
        setFilters([]);
        setSearch('');
        setPagination({
          skip: 0,
          limit: 200,
          total: 0,
          hasMore: true,
        });

        addToast(
          `Successfully reset database! Deleted ${result.movies_deleted || 0} movies and reset all settings to defaults.`,
          'success'
        );
        // Clear movies from UI
        setMovies([]);
        setSelectedMovie(null);
        setCollectionMovies([]);
        loadStats();
      } catch (error) {
        console.error('Error resetting database:', error);
        addToast(
          'Error resetting database: ' + (error.response?.data?.detail || error.message),
          'error'
        );
      }
    }
  };

  const handleProcessTrackedLists = async () => {
    try {
      const data = await processTrackedLists();
      loadMovies(true);
      const msg =
        data?.results && Object.keys(data.results).length
          ? Object.entries(data.results)
              .map(([name, r]) => `${name}: ${r.matched ?? 0}/${r.total ?? 0} matched`)
              .join('; ')
          : 'Tracked lists refreshed.';
      addToast(msg, 'success');
    } catch (error) {
      console.error('Error refreshing tracked lists:', error);
      addToast(
        'Error refreshing tracked lists: ' + (error.response?.data?.detail || error.message),
        'error'
      );
    }
  };

  const handleCloseModal = () => {
    setSelectedMovie(null);
    setPreviousMovie(null);
    setCollectionMovies([]);
    setSimilarMovies([]);
  };

  const handleCollectionMovieClick = async (collectionMovie) => {
    // Save current movie as previous before opening new one
    if (selectedMovie) {
      setPreviousMovie(selectedMovie);
    }
    // Use the collection movie object directly (it has an id field)
    // handleMovieClick only needs the id, so this will work
    await handleMovieClick(collectionMovie);
  };

  const handleGoBack = async () => {
    if (previousMovie) {
      // When going back, don't save the current movie as previous
      // (we're going back in history, not forward)
      await handleMovieClick(previousMovie);
      setPreviousMovie(null);
    }
  };

  const handleAddCollectionMovie = (collectionMovie) => {
    // Open AddMovieModal with pre-filled data from the collection movie
    setAddMovieModalInitialData({
      tmdbId: collectionMovie.tmdb_id,
      title: collectionMovie.title,
      year: collectionMovie.year,
    });
    setAddMovieModalOpen(true);
  };

  const handleDirectorClick = (directorName) => {
    setSelectedDirector(directorName);
    setDirectorsModalOpen(true);
  };

  const handleCloseDirectorsModal = () => {
    setDirectorsModalOpen(false);
    setSelectedDirector(null);
  };

  const handleDirectorMovieClick = async (directorMovie) => {
    // Save current movie as previous before opening new one
    if (selectedMovie) {
      setPreviousMovie(selectedMovie);
    }
    // Close directors modal
    handleCloseDirectorsModal();
    // Open movie modal
    await handleMovieClick(directorMovie);
  };

  const handleAddDirectorMovie = (directorMovie) => {
    // Close directors modal
    handleCloseDirectorsModal();
    // Open AddMovieModal with pre-filled data from the director movie
    setAddMovieModalInitialData({
      tmdbId: directorMovie.tmdb_id,
      title: directorMovie.title,
      year: directorMovie.year,
    });
    setAddMovieModalOpen(true);
  };

  const handleToggleFavoriteDirector = (directorName, isFavorite) => {
    // Update favorite directors list
    if (isFavorite) {
      setFavoriteDirectors((prev) => [...prev, directorName]);
    } else {
      setFavoriteDirectors((prev) => prev.filter((name) => name !== directorName));
    }
  };

  const handleRandomMovie = useCallback(
    async (type = 'random') => {
      try {
        // Build API params from current filters, sorts, and search (same logic as loadMovies)
        const params = {
          skip: 0,
          limit: 1, // First fetch just to get the total count
        };

        // Use refs to get current values
        const currentSearch = searchRef.current;
        const currentFilters = filtersRef.current;
        const currentSorts = sortsRef.current;

        // Add search parameter
        if (currentSearch && currentSearch.trim() !== '') {
          params.search = currentSearch.trim();
        }

        // Collect list filters separately to combine into single JSON parameter
        const andFilters = {};
        const orGroups = [];

        // Convert filters array to API params
        currentFilters.forEach((filter) => {
          const filterType = filterTypes[filter.type];

          // Handle OR groups separately
          if (filter.type === 'or_group') {
            if (filterType && filterType.getApiParams) {
              const apiParams = filterType.getApiParams(filter.config, filterTypes);
              if (apiParams.or_group_list_filters && apiParams.or_group_list_filters.length > 0) {
                orGroups.push(apiParams.or_group_list_filters);
              }
            }
            return;
          }

          if (filterType && filterType.getApiParams) {
            const apiParams = filterType.getApiParams(filter.config);
            Object.keys(apiParams).forEach((key) => {
              const value = apiParams[key];
              if (value !== null && value !== undefined) {
                if (key.startsWith('is_')) {
                  andFilters[key] = value;
                } else {
                  if (Array.isArray(value)) {
                    if (value.length > 0) {
                      params[key] = value;
                    }
                  } else if (typeof value === 'string') {
                    if (value.trim() !== '') {
                      params[key] = value;
                    }
                  } else {
                    params[key] = value;
                  }
                }
              }
            });
          }
        });

        // Combine list filters into single JSON parameter
        const listFiltersParam = {};
        if (Object.keys(andFilters).length > 0) {
          listFiltersParam.and_filters = andFilters;
        }
        if (orGroups.length > 0) {
          listFiltersParam.or_groups = orGroups;
        }

        if (Object.keys(listFiltersParam).length > 0) {
          params.list_filters = JSON.stringify(listFiltersParam);
        }

        // Convert sorts array to API format
        if (currentSorts && currentSorts.length > 0) {
          params.sorts = JSON.stringify(currentSorts);
        }

        // Add favorites filter if type is 'favorite'
        if (type === 'favorite') {
          params.favorites_only = true;
        }

        // First, get the total count of movies matching the filters
        const countData = await getMovies(params);
        const total = countData.total || 0;

        if (total === 0) {
          const message =
            type === 'favorite'
              ? 'No favorite movies match the current filters'
              : 'No movies match the current filters';
          addToast(message, 'warning');
          return;
        }

        // Generate a random index and fetch that movie
        const randomIndex = Math.floor(Math.random() * total);
        params.skip = randomIndex;
        params.limit = 1;

        const randomData = await getMovies(params);
        const randomMovies = randomData.movies || [];

        if (randomMovies.length > 0) {
          handleMovieClick(randomMovies[0]);
        } else {
          addToast('Failed to fetch random movie', 'error');
        }
      } catch (error) {
        console.error('Error fetching random movie:', error);
        addToast('Error fetching random movie', 'error');
      }
    },
    [handleMovieClick, addToast]
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content" ref={headerContainerRef}>
          <div ref={headerTitleRef}>
            <h1>movieswatchlist.net</h1>
            <p>Sort and filter your watchlist movies</p>
          </div>
          <div className="header-actions" ref={headerActionsRef}>
            <div
              className={`header-actions-regular ${showHamburgerMenu ? 'header-actions-hidden' : ''}`}
            >
              <div className="header-action-group" ref={randomPickerRef}>
                <button
                  className="random-movie-button"
                  onClick={() => setRandomPickerOpen(!randomPickerOpen)}
                  title="Random Movie"
                  aria-label="Random Movie"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      x="4"
                      y="4"
                      width="16"
                      height="16"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                    <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                    <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                  </svg>
                  <span>Random Movie</span>
                </button>
                {randomPickerOpen && (
                  <div className="random-picker-dropdown">
                    <button
                      className="random-picker-option"
                      onClick={() => {
                        handleRandomMovie('random');
                        setRandomPickerOpen(false);
                      }}
                    >
                      Random Movie
                    </button>
                    <button
                      className="random-picker-option"
                      onClick={() => {
                        handleRandomMovie('favorite');
                        setRandomPickerOpen(false);
                      }}
                    >
                      Random Favorite
                    </button>
                  </div>
                )}
              </div>
              <button
                className="import-export-button"
                onClick={() => setStatisticsDashboardOpen(true)}
                title="View Statistics"
                aria-label="View Statistics"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 3v18h18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="7" y="14" width="3" height="7" fill="currentColor" />
                  <rect x="12" y="9" width="3" height="12" fill="currentColor" />
                  <rect x="17" y="5" width="3" height="16" fill="currentColor" />
                </svg>
                <span>View Statistics</span>
              </button>
              <button
                className="import-export-button"
                onClick={() => setImportExportModalOpen(true)}
                title="Import and Export"
                aria-label="Import and Export"
              >
                <svg
                  width="24"
                  height="20"
                  viewBox="0 0 28 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M14 3v14m0 0l-4-4m4 4l4-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="5"
                    y1="21"
                    x2="23"
                    y2="21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="5"
                    y1="17"
                    x2="5"
                    y2="21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="23"
                    y1="17"
                    x2="23"
                    y2="21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span>Import and Export</span>
              </button>
              <button
                className="import-export-button"
                onClick={() => setHelpModalOpen(true)}
                title="Help"
                aria-label="Help"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="12"
                    y1="17"
                    x2="12.01"
                    y2="17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Help</span>
              </button>
              <button
                className="settings-button"
                onClick={() => setSettingsModalOpen(true)}
                title="Settings"
                aria-label="Settings"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <LogoutButton />
            </div>
            <div
              className={`header-actions-hamburger ${!showHamburgerMenu ? 'header-actions-hidden' : ''}`}
            >
              <div className="header-action-group" ref={hamburgerMenuRef}>
                <button
                  className="hamburger-menu-button"
                  onClick={() => setIsHamburgerMenuOpen(!isHamburgerMenuOpen)}
                  title="Menu"
                  aria-label="Menu"
                  aria-expanded={isHamburgerMenuOpen}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M3 6H21M3 12H21M3 18H21"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {isHamburgerMenuOpen && (
                  <div className="hamburger-menu-dropdown">
                    <div className="hamburger-menu-item-group" ref={randomPickerRef}>
                      <button
                        className="hamburger-menu-item"
                        onClick={() => setRandomPickerOpenInMenu(!randomPickerOpenInMenu)}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <rect
                            x="4"
                            y="4"
                            width="16"
                            height="16"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                          <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                          <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                        </svg>
                        <span>Random Movie</span>
                      </button>
                      {randomPickerOpenInMenu && (
                        <div className="hamburger-menu-submenu">
                          <button
                            className="hamburger-menu-submenu-item"
                            onClick={() => {
                              handleRandomMovie('random');
                              setRandomPickerOpenInMenu(false);
                              setIsHamburgerMenuOpen(false);
                            }}
                          >
                            Random Movie
                          </button>
                          <button
                            className="hamburger-menu-submenu-item"
                            onClick={() => {
                              handleRandomMovie('favorite');
                              setRandomPickerOpenInMenu(false);
                              setIsHamburgerMenuOpen(false);
                            }}
                          >
                            Random Favorite
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      className="hamburger-menu-item"
                      onClick={() => {
                        setStatisticsDashboardOpen(true);
                        setIsHamburgerMenuOpen(false);
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M3 3v18h18"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <rect x="7" y="14" width="3" height="7" fill="currentColor" />
                        <rect x="12" y="9" width="3" height="12" fill="currentColor" />
                        <rect x="17" y="5" width="3" height="16" fill="currentColor" />
                      </svg>
                      <span>View Statistics</span>
                    </button>
                    <button
                      className="hamburger-menu-item"
                      onClick={() => {
                        setImportExportModalOpen(true);
                        setIsHamburgerMenuOpen(false);
                      }}
                    >
                      <svg
                        width="24"
                        height="20"
                        viewBox="0 0 28 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M14 3v14m0 0l-4-4m4 4l4-4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <line
                          x1="5"
                          y1="21"
                          x2="23"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <line
                          x1="5"
                          y1="17"
                          x2="5"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <line
                          x1="23"
                          y1="17"
                          x2="23"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Import and Export</span>
                    </button>
                    <button
                      className="hamburger-menu-item"
                      onClick={() => {
                        setHelpModalOpen(true);
                        setIsHamburgerMenuOpen(false);
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <line
                          x1="12"
                          y1="17"
                          x2="12.01"
                          y2="17"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Help</span>
                    </button>
                    <button
                      className="hamburger-menu-item"
                      onClick={() => {
                        setSettingsModalOpen(true);
                        setIsHamburgerMenuOpen(false);
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Settings</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {importExportModalOpen && (
        <ImportExportModal
          onClose={() => setImportExportModalOpen(false)}
          onUploadSuccess={handleUploadSuccess}
          onClearCache={handleClearCache}
          onProcessTrackedLists={handleProcessTrackedLists}
          onExportProfile={handleExportProfile}
          onImportProfile={(file, callbacks) =>
            handleImportProfile(file, callbacks, loadMovies, loadStats)
          }
          filters={filters}
          sorts={sorts}
          search={search}
          onShowPreview={(previewData, selections, file) => {
            setImportExportModalOpen(false);
            setCsvPreviewData(previewData);
            setCsvPreviewSelections(selections);
            setCsvPreviewFile(file);
            setCsvPreviewModalOpen(true);
          }}
          addToast={addToast}
          showConfirm={showConfirm}
          countryCode={countryCode}
          preferredServices={preferredServices}
        />
      )}

      {csvPreviewModalOpen && csvPreviewData && (
        <CSVPreviewModal
          previewData={csvPreviewData}
          initialSelections={csvPreviewSelections}
          file={csvPreviewFile}
          onClose={() => {
            setCsvPreviewModalOpen(false);
            setCsvPreviewData(null);
            setCsvPreviewSelections(null);
            setCsvPreviewFile(null);
          }}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      <div className="app-content">
        <div className="app-main">
          {/* Search and Stats Bar */}
          <div className="search-stats-bar">
            <div className="search-stats-search">
              <div className="search-input-wrapper">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search movies... (Press '/' to focus)"
                  value={search || ''}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addToSearchHistory(search);
                      setSearchHistoryOpen(false);
                    }
                  }}
                  onFocus={() => setSearchHistoryOpen(true)}
                  onBlur={(e) => {
                    // Add to history when user finishes searching (blurs the input)
                    addToSearchHistory(search);
                    setTimeout(() => setSearchHistoryOpen(false), 200);
                  }}
                  className="search-stats-input"
                />
                {search && (
                  <button
                    className="search-clear-button"
                    onClick={() => {
                      setSearch('');
                      searchInputRef.current?.focus();
                    }}
                    title="Clear search"
                    aria-label="Clear search"
                    type="button"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <line
                        x1="18"
                        y1="6"
                        x2="6"
                        y2="18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <line
                        x1="6"
                        y1="6"
                        x2="18"
                        y2="18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <button
                className="search-bar-add-movie-button"
                onClick={() => setAddMovieModalOpen(true)}
                title="Add Movie"
                aria-label="Add Movie"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <line
                    x1="12"
                    y1="5"
                    x2="12"
                    y2="19"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="5"
                    y1="12"
                    x2="19"
                    y2="12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span>Add Movie</span>
              </button>
              {searchHistory.length > 0 && searchHistoryOpen && (
                <div className="search-history-dropdown">
                  <div className="search-history-header">Recent Searches</div>
                  {searchHistory.map((term, index) => (
                    <button
                      key={index}
                      className="search-history-item"
                      onClick={() => {
                        setSearch(term);
                        setSearchHistoryOpen(false);
                      }}
                      type="button"
                    >
                      {term}
                    </button>
                  ))}
                  <button
                    className="search-history-clear"
                    onClick={() => {
                      setSearchHistory([]);
                      localStorage.removeItem('searchHistory');
                    }}
                    type="button"
                  >
                    Clear History
                  </button>
                </div>
              )}
            </div>
            <div className="search-stats-info">
              {stats && (
                <>
                  {statsSettings.showTotalMovies && <span>Total Movies: {stats.total_movies}</span>}
                  {statsSettings.showFavoritedMovies && (
                    <span>Favorites: {stats.favorite_movies || 0}</span>
                  )}
                  {statsSettings.showFavoritedRuntime && stats.favorite_movies > 0 && (
                    <span>
                      Favorites Runtime:{' '}
                      {formatRuntime(stats.favorite_runtime || 0, statsSettings.runtimeFormat)}
                    </span>
                  )}
                  {statsSettings.showTotalRuntime && (
                    <span>
                      Total Runtime:{' '}
                      {formatRuntime(stats.total_runtime, statsSettings.runtimeFormat)}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="view-controls">
              <div className="view-toggle">
                <button
                  className={`view-toggle-btn ${viewMode === 'tile' ? 'active' : ''}`}
                  onClick={() => setViewMode('tile')}
                  title="Tile View"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* 3x2 grid of tiles */}
                    <rect x="2" y="2" width="4.5" height="7" rx="0.5" fill="currentColor" />
                    <rect x="7.5" y="2" width="4.5" height="7" rx="0.5" fill="currentColor" />
                    <rect x="13" y="2" width="4.5" height="7" rx="0.5" fill="currentColor" />
                    <rect x="2" y="10" width="4.5" height="7" rx="0.5" fill="currentColor" />
                    <rect x="7.5" y="10" width="4.5" height="7" rx="0.5" fill="currentColor" />
                    <rect x="13" y="10" width="4.5" height="7" rx="0.5" fill="currentColor" />
                  </svg>
                </button>
                <button
                  className={`view-toggle-btn ${viewMode === 'expanded' ? 'active' : ''}`}
                  onClick={() => setViewMode('expanded')}
                  title="List View"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* 4 horizontal lines */}
                    <rect x="2" y="3" width="16" height="2" rx="0.5" fill="currentColor" />
                    <rect x="2" y="7" width="16" height="2" rx="0.5" fill="currentColor" />
                    <rect x="2" y="11" width="16" height="2" rx="0.5" fill="currentColor" />
                    <rect x="2" y="15" width="16" height="2" rx="0.5" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <FilterBar
            sorts={sorts}
            filters={filters}
            onSortsChange={handleSortsChange}
            onFiltersChange={handleFiltersChange}
            stats={stats}
            search={search}
            onSearchChange={setSearch}
            defaultSorts={defaultSorts}
            onSetDefaultSorts={handleSetDefaultSorts}
            showFavoritesFirst={showFavoritesFirst}
            onShowFavoritesFirstChange={setShowFavoritesFirst}
            defaultShowFavoritesFirst={defaultShowFavoritesFirst}
            onSetDefaultShowFavoritesFirst={handleSetDefaultShowFavoritesFirst}
            viewMode={viewMode}
            columnCustomizerOpen={columnCustomizerOpen}
            onColumnCustomizerOpen={() => setColumnCustomizerOpen(!columnCustomizerOpen)}
            columnsExpanded={columnsExpanded}
            onColumnsChange={(newColumns) => {
              setColumnsExpanded(newColumns);
            }}
            previousFilters={previousFilters}
            onRevertFilters={handleRevertFilters}
            onResetFilters={() => setPreviousFilters(null)}
            onSavePreviousFilters={(filters) => setPreviousFilters(filters)}
            showConfirm={showConfirm}
            filteredCount={pagination.total}
          />

          <MovieList
            movies={movies}
            loading={loading}
            loadingMore={loadingMore}
            onMovieClick={handleMovieClick}
            viewMode={viewMode}
            onToggleFavorite={handleToggleFavorite}
            onDeleteMovie={handleDeleteMovie}
            columns={currentColumns}
            sorts={sorts}
            onSortsChange={handleSortsChange}
            showFavoritesFirst={showFavoritesFirst}
            onShowFavoritesFirstChange={setShowFavoritesFirst}
            filters={filters}
            selectedMovieIndex={selectedMovieIndex}
            onColumnsChange={(newColumns) => {
              setColumnsExpanded(newColumns);
            }}
          />
        </div>
      </div>
      <MovieModal
        movie={selectedMovie}
        onClose={handleCloseModal}
        collectionMovies={collectionMovies}
        similarMovies={similarMovies}
        onCollectionMovieClick={handleCollectionMovieClick}
        onAddCollectionMovie={handleAddCollectionMovie}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDeleteMovie}
        countryCode={countryCode}
        onCountryChange={setCountryCode}
        preferredServices={preferredServices}
        onNotesSaved={(message, type) => addToast(message, type || 'success')}
        movies={movies}
        onMovieChange={handleMovieClick}
        onFilterByTrackedList={handleFilterByTrackedList}
        previousMovie={previousMovie}
        onGoBack={handleGoBack}
        onDirectorClick={handleDirectorClick}
      />
      {directorsModalOpen && selectedDirector && (
        <DirectorsModal
          directorName={selectedDirector}
          onClose={handleCloseDirectorsModal}
          onDirectorMovieClick={handleDirectorMovieClick}
          onAddDirectorMovie={handleAddDirectorMovie}
          isFavorite={favoriteDirectors.includes(selectedDirector)}
          onToggleFavorite={handleToggleFavoriteDirector}
        />
      )}
      {shortcutsHelpOpen && <KeyboardShortcutsHelp onClose={() => setShortcutsHelpOpen(false)} />}
      {helpModalOpen && <HelpModal onClose={() => setHelpModalOpen(false)} />}
      {settingsModalOpen && (
        <SettingsModal
          onClose={() => setSettingsModalOpen(false)}
          theme={theme}
          setTheme={setTheme}
        />
      )}
      {addMovieModalOpen && (
        <AddMovieModal
          onClose={() => {
            setAddMovieModalOpen(false);
            setAddMovieModalInitialData(null);
          }}
          onAddSuccess={handleAddMovieSuccess}
          initialTmdbId={addMovieModalInitialData?.tmdbId || null}
          initialTitle={addMovieModalInitialData?.title || null}
          initialYear={addMovieModalInitialData?.year || null}
        />
      )}
      {statisticsDashboardOpen && (
        <StatisticsDashboard
          onClose={() => setStatisticsDashboardOpen(false)}
          onApplyFilter={(newFilter) => {
            // Save current filters as previous filters (so user can revert)
            setPreviousFilters([...filters]);
            // Reset all filters and apply only the new label filter
            const updatedFilters = [newFilter];
            setFilters(updatedFilters);
            // Update the ref immediately so loadMovies uses the new filters
            filtersRef.current = updatedFilters;
            // Close the modal
            setStatisticsDashboardOpen(false);
            // Reload movies with the new filter
            loadMovies(true);
          }}
        />
      )}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
      <DialogContainer dialogs={dialogs} onRemoveDialog={removeDialog} />
      {showScrollToTop && (
        <button
          className="scroll-to-top-button"
          onClick={scrollToTop}
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 19V5M5 12L12 5L19 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// Wrapper component that provides authentication context
function AppWithAuth() {
  return (
    <AuthProvider>
      <AuthGuard>
        <App />
      </AuthGuard>
    </AuthProvider>
  );
}

export default AppWithAuth;
