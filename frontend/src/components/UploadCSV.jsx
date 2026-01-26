import React, { useState, useEffect, useRef } from 'react';
import './UploadCSV.css';
import { previewCSV, processCSVWithSelections } from '../services/api';

const STORAGE_KEY = 'csvProcessingState';

const UploadCSV = ({ onUploadSuccess, onShowPreview }) => {
  // Initialize state from localStorage if available
  const getInitialState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);

        // Check if processing state is stale (older than 5 minutes)
        // This handles the case where the app was restarted but localStorage still has old state
        if (parsed.processing && parsed.timestamp) {
          const timeSinceLastUpdate = Date.now() - parsed.timestamp;
          const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

          if (timeSinceLastUpdate > STALE_THRESHOLD) {
            console.log('Clearing stale processing state (older than 5 minutes)');
            localStorage.removeItem(STORAGE_KEY);
            return {
              processing: false,
              progress: { current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 },
              message: null,
              error: null,
            };
          }
        }

        // Restore if it was processing or if there's a completion message
        if (parsed.processing) {
          return {
            processing: parsed.processing,
            progress: {
              ...(parsed.progress || { current: 0, total: 0, processed: 0, skipped: 0 }),
              timestamp: parsed.timestamp || 0,
            },
            message: null,
            error: null,
          };
        } else if (parsed.message) {
          // Processing completed, show the message
          // But only if it's recent (within last 10 seconds) to avoid showing old messages
          const messageAge = Date.now() - (parsed.timestamp || 0);
          if (messageAge < 10000) {
            return {
              processing: false,
              progress: { current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 },
              message: parsed.message,
              error: null,
            };
          } else {
            // Message is too old, clear it
            localStorage.removeItem(STORAGE_KEY);
          }
        } else if (parsed.error) {
          // Processing errored - show error but only if recent
          const errorAge = Date.now() - (parsed.timestamp || 0);
          if (errorAge < 10000) {
            return {
              processing: false,
              progress: { current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 },
              message: null,
              error: parsed.error,
            };
          } else {
            // Error is too old, clear it
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      console.error('Error loading processing state from localStorage:', e);
      // Clear corrupted state
      localStorage.removeItem(STORAGE_KEY);
    }
    return {
      processing: false,
      progress: { current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 },
      message: null,
      error: null,
    };
  };

  const initialState = getInitialState();
  const [processing, setProcessing] = useState(initialState.processing);
  const [message, setMessage] = useState(initialState.message);
  const [error, setError] = useState(initialState.error);
  const [progress, setProgress] = useState({
    ...initialState.progress,
    timestamp: 0,
  });
  const progressRef = useRef(progress);
  const readerRef = useRef(null);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedMovies, setSelectedMovies] = useState({
    toAdd: new Map(), // Map of URI -> { willAdd: bool }
    toRemove: new Map(), // Map of ID -> 'keep' | 'remove'
  });
  const currentFileRef = useRef(null);

  // Keep progressRef in sync with progress state
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    if (processing) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          processing,
          progress,
          timestamp: Date.now(),
        })
      );
    } else {
      // Clear persisted state when not processing
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [processing, progress]);

  // Track mounted state and check for stale state on mount
  useEffect(() => {
    isMountedRef.current = true;

    // On mount, check if we have stale processing state
    // This handles the case where the app was restarted
    const checkStaleState = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.processing && parsed.timestamp) {
            const timeSinceLastUpdate = Date.now() - parsed.timestamp;
            const STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

            // If no updates for 2 minutes, clear the stale state
            if (timeSinceLastUpdate > STALE_THRESHOLD) {
              console.log('Detected stale processing state on mount, clearing it');
              localStorage.removeItem(STORAGE_KEY);
              setProcessing(false);
              setProgress({ current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 });
              setError(null);
              setMessage(null);
            }
          }
        }
      } catch (e) {
        console.error('Error checking stale state:', e);
      }
    };

    // Check immediately on mount
    checkStaleState();

    return () => {
      isMountedRef.current = false;
      // Don't abort the request on unmount - let it continue in background
      // The request will continue processing even if modal is closed
      // Don't set readerRef.current = null here - let the stream continue reading
    };
  }, []);

  // Poll localStorage for updates when processing (in case modal was closed and reopened)
  useEffect(() => {
    if (!processing) return;

    let lastUpdateTime = Date.now();
    let stuckCheckInterval = null;

    // Check for updates from background processing
    const checkForUpdates = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const currentProgress = progressRef.current;

          if (parsed.processing && parsed.progress) {
            // Always update progress from localStorage (it's the source of truth)
            // Compare by timestamp to detect new updates
            const currentTimestamp = parsed.timestamp || 0;
            const lastTimestamp = currentProgress.timestamp || 0;

            // Update if timestamp is newer OR if values are different
            if (
              currentTimestamp > lastTimestamp ||
              parsed.progress.current !== currentProgress.current ||
              parsed.progress.total !== currentProgress.total ||
              parsed.progress.processed !== currentProgress.processed ||
              parsed.progress.skipped !== currentProgress.skipped
            ) {
              // New update detected - update progress
              lastUpdateTime = Date.now();
              setProgress({
                ...parsed.progress,
                timestamp: currentTimestamp,
              });
            } else {
              // Check if progress is stuck (no updates for 10 seconds)
              const timeSinceLastUpdate = Date.now() - lastUpdateTime;
              if (timeSinceLastUpdate > 10000 && parsed.progress.current < parsed.progress.total) {
                // Progress appears stuck - show warning
                console.warn(
                  'Progress appears stuck. Last update was',
                  timeSinceLastUpdate,
                  'ms ago'
                );
                // Don't set error yet, just log - the stream might still be processing
              }
            }
          } else if (!parsed.processing && parsed.message) {
            // Processing completed while modal was closed
            setProcessing(false);
            setMessage(parsed.message);
            if (stuckCheckInterval) clearInterval(stuckCheckInterval);
            // Clear after showing
            setTimeout(() => {
              localStorage.removeItem(STORAGE_KEY);
            }, 100);
          } else if (!parsed.processing && parsed.error) {
            // Processing errored while modal was closed
            setProcessing(false);
            setError(parsed.error);
            if (stuckCheckInterval) clearInterval(stuckCheckInterval);
            // Clear after showing
            setTimeout(() => {
              localStorage.removeItem(STORAGE_KEY);
            }, 100);
          } else if (!parsed.processing && !parsed.message && !parsed.error) {
            // Processing stopped but no message - might have been cleared
            setProcessing(false);
            if (stuckCheckInterval) clearInterval(stuckCheckInterval);
          }
        } else {
          // No saved state - processing must have completed or been cleared
          setProcessing(false);
          if (stuckCheckInterval) clearInterval(stuckCheckInterval);
        }
      } catch (e) {
        console.error('Error checking for updates:', e);
      }
    };

    // Check immediately
    checkForUpdates();

    // Poll every 250ms for updates (more frequent for better responsiveness)
    const interval = setInterval(checkForUpdates, 250);

    // Check for stuck progress every 5 seconds
    stuckCheckInterval = setInterval(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.processing && parsed.progress) {
            const timeSinceLastUpdate = Date.now() - (parsed.timestamp || 0);
            // If no update for 30 seconds and not complete, mark as stuck
            if (timeSinceLastUpdate > 30000 && parsed.progress.current < parsed.progress.total) {
              console.error('Progress appears to be stuck. Stream may have stopped.');
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                  processing: false,
                  error:
                    'Processing appears to have stopped. The connection may have been lost. Please try again.',
                  timestamp: Date.now(),
                })
              );
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      if (stuckCheckInterval) clearInterval(stuckCheckInterval);
    };
  }, [processing]); // Removed progress from dependencies to avoid resetting interval

  const handleReset = () => {
    // Manually clear stuck state
    localStorage.removeItem(STORAGE_KEY);
    setProcessing(false);
    setError(null);
    setMessage(null);
    setProgress({ current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 });
    readerRef.current = null;
    console.log('Manually reset processing state');
  };

  const handleUploadCSV = () => {
    // Trigger file input click
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const validateCSV = (file) => {
    const errors = [];

    // Check file type
    if (!file.name.endsWith('.csv')) {
      errors.push('File must be a CSV file');
      return errors;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      errors.push('File size must be less than 10MB');
      return errors;
    }

    return errors;
  };

  const handlePreviewCSV = async (file) => {
    setLoadingPreview(true);
    setValidationErrors([]);
    currentFileRef.current = file;

    try {
      const data = await previewCSV(file);

      // Initialize selections
      const toAddMap = new Map();
      const toRemoveMap = new Map();

      // All movies to add are selected by default
      data.movies_to_add.forEach((movie) => {
        toAddMap.set(movie.letterboxd_uri, {
          ...movie,
          willAdd: true,
          isFavorite: false, // Initialize isFavorite
        });
      });

      // All movies to remove are kept by default
      data.movies_to_remove.forEach((movie) => {
        toRemoveMap.set(movie.id, {
          ...movie,
          action: 'keep',
        });
      });

      setSelectedMovies({
        toAdd: toAddMap,
        toRemove: toRemoveMap,
      });

      const previewDataObj = {
        movies_to_add: data.movies_to_add,
        movies_to_remove: data.movies_to_remove,
        total_to_add: data.total_to_add,
        total_to_remove: data.total_to_remove,
        fileName: file.name,
        fileSize: file.size,
      };

      setPreviewData(previewDataObj);

      // If onShowPreview callback exists, use it to show preview in separate modal
      // Otherwise, show preview inline (legacy behavior)
      if (onShowPreview) {
        onShowPreview(
          previewDataObj,
          {
            toAdd: toAddMap,
            toRemove: toRemoveMap,
          },
          file
        );
        // Don't show inline preview when using separate modal
        setShowPreview(false);
      } else {
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error previewing CSV:', error);
      setValidationErrors(['Error previewing CSV: ' + (error.message || 'Unknown error')]);
      setShowPreview(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleFileSelected = (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const errors = validateCSV(file);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setError(errors.join(', '));
      return;
    }

    // Show preview before processing
    handlePreviewCSV(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const errors = validateCSV(file);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setError(errors.join(', '));
        return;
      }

      // Set file to input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
      }

      handlePreviewCSV(file);
    }
  };

  // Helper functions for managing selections
  const toggleMovieToAdd = (uri) => {
    const newToAdd = new Map(selectedMovies.toAdd);
    const movie = newToAdd.get(uri);
    if (movie) {
      newToAdd.set(uri, { ...movie, willAdd: !movie.willAdd });
      setSelectedMovies({ ...selectedMovies, toAdd: newToAdd });
    }
  };

  const selectAllMoviesToAdd = () => {
    const newToAdd = new Map(selectedMovies.toAdd);
    newToAdd.forEach((movie, uri) => {
      newToAdd.set(uri, { ...movie, willAdd: true });
    });
    setSelectedMovies({ ...selectedMovies, toAdd: newToAdd });
  };

  const deselectAllMoviesToAdd = () => {
    const newToAdd = new Map(selectedMovies.toAdd);
    newToAdd.forEach((movie, uri) => {
      newToAdd.set(uri, { ...movie, willAdd: false });
    });
    setSelectedMovies({ ...selectedMovies, toAdd: newToAdd });
  };

  const setMovieAction = (id, action) => {
    const newToRemove = new Map(selectedMovies.toRemove);
    const movie = newToRemove.get(id);
    if (movie) {
      newToRemove.set(id, { ...movie, action });
      setSelectedMovies({ ...selectedMovies, toRemove: newToRemove });
    }
  };

  const keepAllMovies = () => {
    const newToRemove = new Map(selectedMovies.toRemove);
    newToRemove.forEach((movie, id) => {
      newToRemove.set(id, { ...movie, action: 'keep' });
    });
    setSelectedMovies({ ...selectedMovies, toRemove: newToRemove });
  };

  const removeAllMovies = () => {
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
    if (!currentFileRef.current) {
      return;
    }

    const file = currentFileRef.current;
    const { toAddCount, toRemoveCount } = getSelectionCounts();

    if (toAddCount === 0 && toRemoveCount === 0) {
      setError('Please select at least one movie to add or remove');
      return;
    }

    // Prepare selections
    const movies_to_add = Array.from(selectedMovies.toAdd.values())
      .filter((m) => m.willAdd)
      .map((m) => ({
        name: m.name,
        year: m.year,
        letterboxd_uri: m.letterboxd_uri,
      }));

    const movies_to_remove_ids = Array.from(selectedMovies.toRemove.values())
      .filter((m) => m.action === 'remove')
      .map((m) => m.id);

    const selections = {
      movies_to_add,
      movies_to_remove_ids,
    };

    // Clear any previous state
    localStorage.removeItem(STORAGE_KEY);
    setProcessing(true);
    setError(null);
    setMessage(null);
    setValidationErrors([]);
    setShowPreview(false);
    setProgress({ current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 });

    console.log('Starting CSV processing with selections...');

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
              const saved = localStorage.getItem(STORAGE_KEY);
              if (saved) {
                try {
                  const parsed = JSON.parse(saved);
                  if (parsed.processing) {
                    localStorage.removeItem(STORAGE_KEY);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
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
                    localStorage.setItem(
                      STORAGE_KEY,
                      JSON.stringify({
                        processing: false,
                        error: data.error,
                        timestamp: Date.now(),
                      })
                    );
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
                    localStorage.setItem(
                      STORAGE_KEY,
                      JSON.stringify({
                        processing: false,
                        message: doneMessage,
                        timestamp: Date.now(),
                      })
                    );
                    setTimeout(() => {
                      localStorage.removeItem(STORAGE_KEY);
                    }, 5000);

                    if (isMountedRef.current) {
                      setMessage(doneMessage);
                      setProcessing(false);
                      if (onUploadSuccess) {
                        onUploadSuccess();
                      }
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
                  const timestamp = Date.now();
                  localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({
                      processing: true,
                      progress: newProgress,
                      timestamp: timestamp,
                    })
                  );

                  if (isMountedRef.current) {
                    setProgress({
                      ...newProgress,
                      timestamp: timestamp,
                    });
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
            if (err.name === 'AbortError') {
              console.log('Request aborted');
              return;
            }
            console.error('Error reading stream:', err);
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                processing: false,
                error: 'Error reading progress updates: ' + (err.message || 'Unknown error'),
                timestamp: Date.now(),
              })
            );
            if (isMountedRef.current) {
              setError('Error reading progress updates');
              setProcessing(false);
            }
            readerRef.current = null;
          });
      };

      readStream();
    } catch (err) {
      console.error('Error processing CSV with selections:', err);
      let errorMessage = 'Error processing CSV file';
      if (err.message) {
        errorMessage = err.message;
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        errorMessage = `Failed to connect to backend server at ${API_BASE_URL}. Please ensure the backend server is running.`;
      }
      localStorage.removeItem(STORAGE_KEY);
      if (isMountedRef.current) {
        setError(errorMessage);
        setProcessing(false);
      }
      readerRef.current = null;
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Old handleProcessFile for backward compatibility with existing code
  const handleProcessFileOld = () => {
    if (!fileInputRef.current || !fileInputRef.current.files[0]) {
      return;
    }

    const file = fileInputRef.current.files[0];
    const errors = validateCSV(file);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setError(errors.join(', '));
      return;
    }

    // Clear any previous state
    localStorage.removeItem(STORAGE_KEY);
    setProcessing(true);
    setError(null);
    setMessage(null);
    setValidationErrors([]);
    setShowPreview(false);
    setPreviewData(null);
    setProgress({ current: 0, total: 0, processed: 0, skipped: 0, timestamp: 0 });

    console.log('Starting CSV upload...');

    // Create FormData with the file
    const formData = new FormData();
    formData.append('file', file);

    // Use fetch with ReadableStream to handle SSE from POST endpoint
    // Note: We don't abort on unmount - let processing continue in background
    fetch(`${API_BASE_URL}/api/upload-csv`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let browser set it with boundary for multipart/form-data
    })
      .then((response) => {
        if (!response.ok) {
          return response.text().then((text) => {
            try {
              const json = JSON.parse(text);
              throw new Error(json.detail || `HTTP error! status: ${response.status}`);
            } catch (e) {
              if (e instanceof Error && e.message.includes('HTTP error')) {
                throw e;
              }
              throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
            }
          });
        }
        if (!response.body) {
          throw new Error('Response body is null - server may not support streaming');
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';

        const readStream = () => {
          // Continue reading even if component unmounts - we'll still update localStorage
          // Use catch to handle any errors and continue
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                // Stream is done - clear the ref and localStorage
                readerRef.current = null;
                // If processing completed, localStorage should already have the completion message
                // But if it was aborted or errored, clear it
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                  try {
                    const parsed = JSON.parse(saved);
                    // Only clear if it's still marked as processing (meaning it didn't complete normally)
                    if (parsed.processing) {
                      localStorage.removeItem(STORAGE_KEY);
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
                return;
              }

              // Decode chunk and append to buffer
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');

              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim() && line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.substring(6));

                    if (data.error) {
                      // Clear persisted state
                      localStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify({
                          processing: false,
                          error: data.error,
                          timestamp: Date.now(),
                        })
                      );
                      if (isMountedRef.current) {
                        setError(data.error);
                        setProcessing(false);
                      }
                      readerRef.current = null;
                      return;
                    }

                    if (data.done) {
                      const doneMessage = `Successfully processed ${data.processed} movies. ${data.skipped} skipped.`;
                      // Persist completion state briefly so it can be shown if modal reopens
                      localStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify({
                          processing: false,
                          message: doneMessage,
                          timestamp: Date.now(),
                        })
                      );
                      // Clear after a short delay (5 seconds) to allow modal to reopen and see the message
                      setTimeout(() => {
                        localStorage.removeItem(STORAGE_KEY);
                      }, 5000);

                      if (isMountedRef.current) {
                        setMessage(doneMessage);
                        setProcessing(false);
                        // Notify parent component
                        if (onUploadSuccess) {
                          onUploadSuccess();
                        }
                      }
                      readerRef.current = null;
                      return;
                    }

                    // Update progress (and persist to localStorage)
                    const newProgress = {
                      current: data.current || 0,
                      total: data.total || 0,
                      processed: data.processed || 0,
                      skipped: data.skipped || 0,
                    };
                    const timestamp = Date.now();
                    // Always persist to localStorage, even if component is unmounted
                    // This is the source of truth for progress
                    localStorage.setItem(
                      STORAGE_KEY,
                      JSON.stringify({
                        processing: true,
                        progress: newProgress,
                        timestamp: timestamp,
                      })
                    );
                    // Log progress updates for debugging
                    console.log(
                      'Progress update:',
                      newProgress.current,
                      '/',
                      newProgress.total,
                      'timestamp:',
                      timestamp
                    );
                    // Only update state if component is still mounted
                    if (isMountedRef.current) {
                      setProgress({
                        ...newProgress,
                        timestamp: timestamp,
                      });
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, 'Line:', line);
                  }
                }
              }

              // Continue reading - don't check if mounted, let it continue in background
              // Use setTimeout to ensure the promise chain continues even if component unmounts
              setTimeout(() => {
                readStream();
              }, 0);
            })
            .catch((err) => {
              // Ignore abort errors (user closed modal)
              if (err.name === 'AbortError') {
                console.log('Request aborted - this may happen if modal was closed');
                // Don't clear localStorage on abort - let the stuck detection handle it
                return;
              }
              console.error('Error reading stream:', err, err.stack);
              // Persist error state so it can be shown if modal reopens
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                  processing: false,
                  error: 'Error reading progress updates: ' + (err.message || 'Unknown error'),
                  timestamp: Date.now(),
                })
              );
              if (isMountedRef.current) {
                setError('Error reading progress updates');
                setProcessing(false);
              }
              readerRef.current = null;
            });
        };

        readStream();
      })
      .catch((err) => {
        // Ignore abort errors (user closed modal)
        if (err.name === 'AbortError') {
          console.log('Request aborted');
          return;
        }
        console.error('Error uploading CSV:', err);
        let errorMessage = 'Error uploading CSV file';
        if (err.message) {
          errorMessage = err.message;
        }
        // Provide more specific error messages
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
          errorMessage = `Failed to connect to backend server at ${API_BASE_URL}. Please ensure the backend server is running on port 8000.`;
        }
        localStorage.removeItem(STORAGE_KEY);
        if (isMountedRef.current) {
          setError(errorMessage);
          setProcessing(false);
        }
        readerRef.current = null;
      });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="upload-csv">
      <h2>Import Watchlist</h2>
      <p className="upload-description">
        Upload a CSV file to import your watchlist and update the database.
      </p>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".csv"
        style={{ display: 'none' }}
      />

      <div
        className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={!processing ? handleUploadCSV : undefined}
      >
        {dragActive ? (
          <div className="dropzone-content">
            <p>Drop CSV file here</p>
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
            <p>Drag & drop CSV file here or click to browse</p>
            <p className="dropzone-hint">Supports .csv files up to 10MB</p>
          </div>
        )}
      </div>

      {validationErrors.length > 0 && (
        <div className="upload-validation-errors">
          <h4>Validation Errors:</h4>
          <ul>
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {loadingPreview && (
        <div className="upload-preview">
          <div className="preview-header">
            <h4>Loading Preview...</h4>
          </div>
          <p>Analyzing CSV file...</p>
        </div>
      )}

      {showPreview && previewData && !loadingPreview && (
        <div className="upload-preview">
          <div className="preview-header">
            <h4>CSV Import Preview</h4>
            <button
              className="preview-close"
              onClick={() => {
                setShowPreview(false);
                setPreviewData(null);
                setSelectedMovies({ toAdd: new Map(), toRemove: new Map() });
                currentFileRef.current = null;
              }}
            >
              ×
            </button>
          </div>
          <div className="preview-info">
            <p>
              <strong>File:</strong> {previewData.fileName}
            </p>
            <p>
              <strong>Size:</strong> {(previewData.fileSize / 1024).toFixed(2)} KB
            </p>
          </div>

          {(() => {
            const { toAddCount, toRemoveCount } = getSelectionCounts();
            return (
              <div
                className="preview-summary"
                style={{
                  marginBottom: '20px',
                  padding: '10px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                }}
              >
                <strong>Summary:</strong> {toAddCount} movie{toAddCount !== 1 ? 's' : ''} to add,{' '}
                {toRemoveCount} movie{toRemoveCount !== 1 ? 's' : ''} to remove
              </div>
            );
          })()}

          {/* Movies to Add Section */}
          {previewData.movies_to_add && previewData.movies_to_add.length > 0 && (
            <div className="preview-section" style={{ marginBottom: '30px' }}>
              <div className="preview-section-header" style={{ marginBottom: '10px' }}>
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
                      <th>Title</th>
                      <th style={{ width: '80px' }}>Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.movies_to_add.map((movie) => {
                      const selection = selectedMovies.toAdd.get(movie.letterboxd_uri) || {
                        willAdd: true,
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
            <div className="preview-section" style={{ marginBottom: '30px' }}>
              <div className="preview-section-header" style={{ marginBottom: '10px' }}>
                <h5>Movies to Remove ({previewData.total_to_remove})</h5>
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
              {(() => {
                const { toAddCount, toRemoveCount } = getSelectionCounts();
                return (
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {toAddCount} to add, {toRemoveCount} to remove
                  </span>
                );
              })()}
            </div>
            <div>
              <button
                className="upload-button"
                onClick={handleProcessFile}
                disabled={
                  processing ||
                  (getSelectionCounts().toAddCount === 0 &&
                    getSelectionCounts().toRemoveCount === 0)
                }
                style={{ marginRight: '10px' }}
              >
                Process Selected
              </button>
              <button
                className="upload-button cancel"
                onClick={() => {
                  setShowPreview(false);
                  setPreviewData(null);
                  setSelectedMovies({ toAdd: new Map(), toRemove: new Map() });
                  currentFileRef.current = null;
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="upload-controls">
        {processing && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
            <button
              onClick={handleReset}
              className="upload-button"
              style={{
                background: 'var(--danger)',
                padding: '10px 15px',
              }}
              title="Reset stuck processing state"
            >
              Reset
            </button>
          </div>
        )}

        {processing && (
          <div className="progress-bar-container">
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
      </div>

      {message && <div className="upload-message success">{message}</div>}

      {error && <div className="upload-message error">{error}</div>}
    </div>
  );
};

export default UploadCSV;
