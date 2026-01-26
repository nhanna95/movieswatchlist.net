import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  isAuthenticated,
  getStoredUser,
  verifyToken,
  fetchCurrentUser,
} from '../services/auth';

// Create Auth Context
const AuthContext = createContext(null);

/**
 * Auth Provider component that wraps the app and provides authentication state
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (isAuthenticated()) {
          // Try to get stored user first
          const storedUser = getStoredUser();
          if (storedUser) {
            setUser(storedUser);
          }
          // Verify token is still valid
          const isValid = await verifyToken();
          if (isValid) {
            const currentUser = await fetchCurrentUser();
            setUser(currentUser);
          } else {
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Error checking auth:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for unauthorized events
    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  /**
   * Login with username and password
   */
  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      await authLogin(username, password);
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Register a new account
   */
  const register = useCallback(async (username, email, password) => {
    setLoading(true);
    setError(null);
    try {
      await authRegister(username, email, password);
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Logout the current user
   */
  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await authLogout();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Clear any error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to access authentication state and functions
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default useAuth;
