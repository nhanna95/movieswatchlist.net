import { useState, useEffect, useCallback } from 'react';
import { getStoredCountry, setStoredCountry } from '../utils/countryDetection';

/**
 * Custom hook for managing application settings with localStorage persistence.
 *
 * @returns {Object} Settings state and handlers
 */
export const useSettings = () => {
  // Theme settings
  const getSystemTheme = useCallback(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  const getResolvedTheme = useCallback(
    (themeValue) => {
      if (themeValue === 'system') {
        return getSystemTheme();
      }
      return themeValue;
    },
    [getSystemTheme]
  );

  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme && ['system', 'dark', 'light'].includes(savedTheme) ? savedTheme : 'system';
  });

  // View mode (tile or expanded)
  const [viewMode, setViewMode] = useState(() => {
    const savedViewMode = localStorage.getItem('viewMode');
    return savedViewMode || 'expanded';
  });

  // Country code for streaming services
  const [countryCode, setCountryCode] = useState(() => {
    const stored = getStoredCountry();
    return stored || 'US';
  });

  // Preferred streaming services
  const [preferredServices, setPreferredServices] = useState(() => {
    try {
      const saved = localStorage.getItem('preferred_streaming_services');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Stats customization settings
  const [statsSettings, setStatsSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('stats_customization_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // Ignore parse errors
    }
    return {
      showTotalMovies: true,
      showFavoritedMovies: true,
      showTotalRuntime: false,
      showFavoritedRuntime: true,
      runtimeFormat: 'auto',
    };
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

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, getSystemTheme]);

  // Save viewMode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  // Save preferredServices to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('preferred_streaming_services', JSON.stringify(preferredServices));
  }, [preferredServices]);

  // Save statsSettings to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('stats_customization_settings', JSON.stringify(statsSettings));
  }, [statsSettings]);

  // Handle country code changes
  const handleCountryChange = useCallback((newCountryCode) => {
    setCountryCode(newCountryCode);
    setStoredCountry(newCountryCode);
  }, []);

  return {
    // Theme
    theme,
    setTheme,
    getResolvedTheme,

    // View mode
    viewMode,
    setViewMode,

    // Country/Streaming
    countryCode,
    setCountryCode: handleCountryChange,
    preferredServices,
    setPreferredServices,

    // Stats
    statsSettings,
    setStatsSettings,
  };
};

export default useSettings;
