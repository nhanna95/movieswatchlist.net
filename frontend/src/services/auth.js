import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Token storage key
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

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
 * Remove the authentication token
 */
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
 * Check if the user is authenticated
 */
export const isAuthenticated = () => {
  return !!getToken();
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
 * Logout the current user
 */
export const logout = async () => {
  try {
    const authAxios = createAuthAxios();
    await authAxios.post('/api/auth/logout');
  } catch (error) {
    // Logout should still proceed even if the API call fails
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
  register,
  login,
  logout,
  fetchCurrentUser,
  verifyToken,
  getAuthHeaders,
};
