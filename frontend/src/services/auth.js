import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Token storage key
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const GUEST_MODE_KEY = 'guest_mode';
const GUEST_SESSION_ID_KEY = 'guest_session_id';

/**
 * Get the stored authentication token
 */
export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Set the authentication token
 */
export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
};

/**
 * Remove the authentication token and guest state
 */
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(GUEST_MODE_KEY);
  localStorage.removeItem(GUEST_SESSION_ID_KEY);
};

/**
 * Get the stored user data
 */
export const getStoredUser = () => {
  const userData = localStorage.getItem(USER_KEY);
  if (userData) {
    try {
      return JSON.parse(userData);
    } catch (e) {
      return null;
    }
  }
  return null;
};

/**
 * Store user data
 */
export const setStoredUser = (user) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

/**
 * Check if the user is authenticated (has a token)
 */
export const isAuthenticated = () => {
  return !!getToken();
};

/**
 * Get the stored guest session ID
 */
export const getGuestSessionId = () => {
  return localStorage.getItem(GUEST_SESSION_ID_KEY);
};

/**
 * Set the guest session ID and guest mode flag
 */
export const setGuestSessionId = (sessionId) => {
  if (sessionId) {
    localStorage.setItem(GUEST_MODE_KEY, 'true');
    localStorage.setItem(GUEST_SESSION_ID_KEY, sessionId);
  } else {
    localStorage.removeItem(GUEST_MODE_KEY);
    localStorage.removeItem(GUEST_SESSION_ID_KEY);
  }
};

/**
 * Check if the current session is guest mode
 */
export const isGuestMode = () => {
  return localStorage.getItem(GUEST_MODE_KEY) === 'true';
};

/**
 * Create a guest session (no account). Stores token and guest flag.
 * @returns {Promise<{access_token: string, token_type: string, guest: boolean, session_id: string}>}
 */
export const createGuestSession = async () => {
  const response = await axios.post(`${API_BASE_URL}/api/auth/guest`);
  const { access_token, session_id } = response.data;
  setToken(access_token);
  setGuestSessionId(session_id);
  return response.data;
};

/**
 * Clear guest session and token (exit guest mode)
 */
export const clearGuestSession = () => {
  removeToken();
};

/**
 * Create an axios instance with auth headers
 */
const createAuthAxios = () => {
  const token = getToken();
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

/**
 * Register a new user
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<{access_token: string, token_type: string}>}
 */
export const register = async (username, password) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/register`, {
      username,
      password,
    });

    const { access_token } = response.data;
    setToken(access_token);

    // Fetch user info and store it
    const userResponse = await fetchCurrentUser();
    if (userResponse) {
      setStoredUser(userResponse);
    }

    return response.data;
  } catch (error) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw error;
  }
};

/**
 * Login with username and password
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<{access_token: string, token_type: string}>}
 */
export const login = async (username, password) => {
  try {
    // OAuth2 password flow requires form data
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token } = response.data;
    setToken(access_token);

    // Fetch user info and store it
    const userResponse = await fetchCurrentUser();
    if (userResponse) {
      setStoredUser(userResponse);
    }

    return response.data;
  } catch (error) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw error;
  }
};

/**
 * Logout the current user. If in guest mode, optionally call guest logout endpoint first.
 */
export const logout = async () => {
  try {
    if (isGuestMode()) {
      const authAxios = createAuthAxios();
      await authAxios.post('/api/auth/guest/logout');
    } else {
      const authAxios = createAuthAxios();
      await authAxios.post('/api/auth/logout');
    }
  } catch (error) {
    console.warn('Logout API call failed:', error);
  } finally {
    removeToken();
  }
};

/**
 * Fetch the current user's information
 * @returns {Promise<{id: number, username: string, schema_name: string, created_at: string}>}
 */
export const fetchCurrentUser = async () => {
  try {
    const authAxios = createAuthAxios();
    const response = await authAxios.get('/api/auth/me');
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      // Token is invalid or expired
      removeToken();
      return null;
    }
    throw error;
  }
};

/**
 * Verify if the current token is valid
 * @returns {Promise<boolean>}
 */
export const verifyToken = async () => {
  const token = getToken();
  if (!token) {
    return false;
  }

  try {
    const user = await fetchCurrentUser();
    if (user) {
      setStoredUser(user);
      return true;
    }
    return false;
  } catch (error) {
    removeToken();
    return false;
  }
};

/**
 * Get authorization headers for API requests
 * @returns {Object} Headers object with Authorization if token exists
 */
export const getAuthHeaders = () => {
  const token = getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

export default {
  getToken,
  setToken,
  removeToken,
  getStoredUser,
  setStoredUser,
  isAuthenticated,
  getGuestSessionId,
  setGuestSessionId,
  isGuestMode,
  createGuestSession,
  clearGuestSession,
  register,
  login,
  logout,
  fetchCurrentUser,
  verifyToken,
  getAuthHeaders,
};
