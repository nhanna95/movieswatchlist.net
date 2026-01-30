/**
 * Single source of truth for localStorage keys that hold user-specific data.
 * All of these are cleared on logout so no information persists for the next user.
 */

export const USER_STORAGE_KEYS = [
  // Auth
  'auth_token',
  'auth_user',
  'guest_mode',
  'guest_session_id',
  // UI / preferences
  'theme',
  'viewMode',
  'streaming_country_code',
  'preferred_streaming_services',
  'stats_customization_settings',
  'defaultSorts',
  'currentSorts',
  'showFavoritesFirst',
  'defaultShowFavoritesFirst',
  'columnsExpanded',
  'currentFilters',
  'defaultFilters',
  'currentSearch',
  'searchHistory',
  'filterPresets',
  'csvProcessingState',
];

/**
 * Clear all user-specific data from localStorage and dispatch any events
 * the app uses for "cleared" state (e.g. filterPresetsCleared).
 * Call this on logout so the next user on the same device sees no prior data.
 */
export function clearAllUserData() {
  try {
    for (const key of USER_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent('filterPresetsCleared'));
  } catch (e) {
    console.warn('clearAllUserData:', e);
  }
}
