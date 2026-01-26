import axios from 'axios';
import qs from 'qs';
import { getToken, removeToken } from './auth';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Custom params serializer for FastAPI array query parameters
// FastAPI expects repeated keys: ?director=value1&director=value2
// Using qs library with 'repeat' format to ensure proper array serialization
const paramsSerializer = (params) => {
  if (!params) return '';

  // Filter out null/undefined values and empty arrays before serialization
  const filteredParams = {};
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === null || value === undefined) {
      return; // Skip null/undefined
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        filteredParams[key] = value;
      }
      // Skip empty arrays
    } else if (typeof value === 'string' && value.trim() === '') {
      return; // Skip empty strings
    } else if (typeof value === 'boolean') {
      // Ensure boolean values are explicitly included
      // qs.stringify will convert them to "true" or "false" strings
      filteredParams[key] = value;
    } else {
      filteredParams[key] = value;
    }
  });

  // Use qs to serialize with 'repeat' format for arrays (creates ?key=val1&key=val2)
  // Note: qs.stringify converts booleans to "true"/"false" strings, which FastAPI can parse
  return qs.stringify(filteredParams, {
    arrayFormat: 'repeat',
    skipNulls: true,
    encode: true,
    // Ensure boolean values are properly serialized
    serializeDate: (date) => date.toISOString(),
  });
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired - clear it
      removeToken();
      // Dispatch a custom event that can be listened to by the app
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const getMovies = async (params = {}) => {
  const response = await api.get('/api/movies', {
    params,
    paramsSerializer: paramsSerializer,
  });
  return response.data;
};

export const getStats = async () => {
  const response = await api.get('/api/movies/stats');
  return response.data;
};

export const getDirectors = async () => {
  const response = await api.get('/api/movies/directors');
  return response.data;
};

export const getCountries = async () => {
  const response = await api.get('/api/movies/countries');
  return response.data;
};

export const getGenres = async () => {
  const response = await api.get('/api/movies/genres');
  return response.data;
};

export const getOriginalLanguages = async () => {
  const response = await api.get('/api/movies/original-languages');
  return response.data;
};

export const getProductionCompanies = async () => {
  const response = await api.get('/api/movies/production-companies');
  return response.data;
};

export const getSpokenLanguages = async () => {
  const response = await api.get('/api/movies/spoken-languages');
  return response.data;
};

export const getActors = async () => {
  const response = await api.get('/api/movies/actors');
  return response.data;
};

export const getWriters = async () => {
  const response = await api.get('/api/movies/writers');
  return response.data;
};

export const getProducers = async () => {
  const response = await api.get('/api/movies/producers');
  return response.data;
};

export const getMovie = async (movieId) => {
  const response = await api.get(`/api/movies/${movieId}`);
  return response.data;
};

export const setMovieFavorite = async (movieId, isFavorite) => {
  const response = await api.patch(`/api/movies/${movieId}/favorite`, {
    is_favorite: isFavorite,
  });
  return response.data;
};

export const setMovieSeenBefore = async (movieId, seenBefore) => {
  const response = await api.patch(`/api/movies/${movieId}/seen-before`, {
    seen_before: seenBefore,
  });
  return response.data;
};

export const setMovieNotes = async (movieId, notes) => {
  const response = await api.patch(`/api/movies/${movieId}/notes`, {
    notes: notes,
  });
  return response.data;
};

export const deleteMovie = async (movieId) => {
  const response = await api.delete(`/api/movies/${movieId}`);
  return response.data;
};

export const addMovie = async (movieData) => {
  const response = await api.post('/api/movies', movieData);
  return response.data;
};

export const searchTmdbMovie = async (title, year) => {
  const response = await api.get('/api/movies/search-tmdb', {
    params: { title, year },
  });
  return response.data;
};

export const getTmdbMovieDetails = async (tmdbId) => {
  const response = await api.get(`/api/movies/tmdb/${tmdbId}/details`);
  return response.data;
};

export const getCollectionMovies = async (movieId) => {
  const response = await api.get(`/api/movies/${movieId}/collection`);
  return response.data;
};

export const getSimilarMovies = async (movieId) => {
  const response = await api.get(`/api/movies/${movieId}/similar`);
  return response.data;
};

export const getDirectorMovies = async (directorName) => {
  const response = await api.get(`/api/movies/director/${encodeURIComponent(directorName)}`);
  return response.data;
};

export const getFavoriteDirectors = async () => {
  const response = await api.get('/api/directors/favorites');
  return response.data;
};

export const addFavoriteDirector = async (directorName) => {
  const response = await api.post('/api/directors/favorites', {
    director_name: directorName,
  });
  return response.data;
};

export const removeFavoriteDirector = async (directorName) => {
  const response = await api.delete(`/api/directors/favorites/${encodeURIComponent(directorName)}`);
  return response.data;
};

export const getSeenCountries = async () => {
  const response = await api.get('/api/countries/seen');
  return response.data;
};

export const addSeenCountry = async (countryName) => {
  const response = await api.post('/api/countries/seen', {
    country_name: countryName,
  });
  return response.data;
};

export const removeSeenCountry = async (countryName) => {
  const response = await api.delete(`/api/countries/seen/${encodeURIComponent(countryName)}`);
  return response.data;
};

export const getStreamingInfo = async (movieId, countryCode = 'US') => {
  const response = await api.get(`/api/movies/${movieId}/streaming`, {
    params: { country_code: countryCode },
  });
  return response.data;
};

export const getAvailableStreamingServices = async () => {
  const response = await api.get('/api/streaming-services');
  return response.data;
};

export const clearCache = async () => {
  const response = await api.post('/api/movies/clear-cache');
  return response.data;
};

export const exportProfile = async (includeTmdbData = true, preferences = {}) => {
  // Export profile downloads a ZIP file, so we need to handle it differently
  const response = await api.post(
    '/api/export-profile',
    {
      include_tmdb_data: includeTmdbData,
      preferences: preferences,
    },
    {
      responseType: 'blob', // Important for binary data
    }
  );

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers['content-disposition'];
  let filename = 'profile-export.zip';
  if (contentDisposition) {
    // Handle both quoted and unquoted filenames
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"|filename=([^;\s]+)/);
    if (filenameMatch) {
      filename = filenameMatch[1] || filenameMatch[2];
    }
  }

  // Create blob and trigger download
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);

  return { success: true, filename };
};

export const importProfile = async (file) => {
  // Import profile uploads a ZIP file
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/api/import-profile', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export const previewCSV = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  // Create a new axios instance without default Content-Type header for FormData
  // axios will automatically set multipart/form-data with boundary when it detects FormData
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const token = getToken();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/preview-csv`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Don't set Content-Type - browser will set it with boundary automatically
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    // Handle network errors (CORS, connection refused, etc.)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(`Failed to connect to backend at ${API_BASE_URL}. Please check CORS configuration and ensure the backend is running.`);
    }
    throw error;
  }
};

export const processCSVWithSelections = async (file, selections) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('selections', JSON.stringify(selections));

  // Returns a fetch response for streaming
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const token = getToken();
  return fetch(`${API_BASE_URL}/api/process-csv-with-selections`, {
    method: 'POST',
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

export const exportMovies = async (params = {}) => {
  // Export movies downloads a file, so we need to handle it differently
  try {
    // Log the request for debugging
    console.log('Exporting movies to:', `${API_BASE_URL}/api/movies/export`);
    console.log('Export params:', params);

    // Add a longer timeout for export requests (5 minutes) as they may take time
    const response = await api.get('/api/movies/export', {
      params,
      paramsSerializer: paramsSerializer,
      responseType: 'blob', // Important for binary data
      timeout: 300000, // 5 minutes timeout
    });

    // Get filename from Content-Disposition header or generate one
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'movies-export.csv';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Create blob and trigger download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true, filename };
  } catch (error) {
    // Handle different types of errors
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      // Network error or timeout
      const networkError = new Error(
        'Network error: Unable to connect to server. Please check if the backend server is running.'
      );
      networkError.isNetworkError = true;
      throw networkError;
    }

    if (error.response) {
      // HTTP error response
      if (error.response.data instanceof Blob) {
        // For blob responses, error responses are also blobs, so we need to parse them
        try {
          const errorText = await error.response.data.text();
          try {
            const errorJson = JSON.parse(errorText);
            error.response.data = errorJson;
          } catch (e) {
            // If it's not JSON, use the text as the error message
            error.response.data = { detail: errorText };
          }
        } catch (e) {
          // If we can't read the blob, create a generic error
          error.response.data = {
            detail: `HTTP ${error.response.status}: ${error.response.statusText}`,
          };
        }
      }
    } else if (!error.request) {
      // Request was made but no response received (network error)
      const networkError = new Error(
        'Network error: No response from server. Please check your connection and ensure the backend server is running.'
      );
      networkError.isNetworkError = true;
      throw networkError;
    }

    throw error;
  }
};
