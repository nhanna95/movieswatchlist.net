import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  isAuthenticated,
  getStoredUser,
  verifyToken,
  fetchCurrentUser,
  isGuestMode as authIsGuestMode,
  createGuestSession as authCreateGuestSession,
  clearGuestSession as authClearGuestSession,
} from '../services/auth';
import { clearAllUserData } from '../constants/userStorageKeys';

// Create Auth Context
const AuthContext = createContext(null);

/**
 * Auth Provider component that wraps the app and provides authentication state
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [guestMode, setGuestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (isAuthenticated()) {
          const isGuest = authIsGuestMode();
          if (isGuest) {
            setGuestMode(true);
          }
          const storedUser = getStoredUser();
          if (storedUser) {
            setUser(storedUser);
          }
          const isValid = await verifyToken();
          if (isValid) {
            const currentUser = await fetchCurrentUser();
            setUser(currentUser);
            if (currentUser?.guest) {
              setGuestMode(true);
            }
          } else {
            setUser(null);
            setGuestMode(false);
          }
        }
      } catch (err) {
        console.error('Error checking auth:', err);
        setUser(null);
        setGuestMode(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const handleUnauthorized = () => {
      setUser(null);
      setGuestMode(false);
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
      setGuestMode(false);
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
  const register = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      await authRegister(username, password);
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setGuestMode(false);
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
      setGuestMode(false);
      setError(null);
      clearAllUserData();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Start guest mode (no account). Creates guest session and sets user from API.
   */
  const startGuestMode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await authCreateGuestSession();
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setGuestMode(true);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Could not start guest session';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Exit guest mode. Calls guest logout endpoint and clears token/state.
   */
  const exitGuestMode = useCallback(async () => {
    setLoading(true);
    try {
      await authLogout();
      setUser(null);
      setGuestMode(false);
      setError(null);
      clearAllUserData();
    } catch (err) {
      console.error('Exit guest error:', err);
      authClearGuestSession();
      setUser(null);
      setGuestMode(false);
      clearAllUserData();
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
    guestMode,
    loading,
    error,
    isAuthenticated: !!user || guestMode,
    login,
    register,
    logout,
    startGuestMode,
    exitGuestMode,
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
