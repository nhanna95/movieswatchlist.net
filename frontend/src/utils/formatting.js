/**
 * Shared formatting utilities for the application.
 * Consolidates duplicate helper functions from multiple components.
 */

/**
 * Normalize country name for display.
 * Shortens "United States of America" to "USA" for cleaner display.
 */
export const normalizeCountryName = (countryName) => {
  if (!countryName) return countryName;
  return countryName === 'United States of America' ? 'USA' : countryName;
};

/**
 * Language code to human-readable name mapping.
 */
export const languageNames = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  hi: 'Hindi',
  ar: 'Arabic',
  fa: 'Persian',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  tl: 'Tagalog',
  he: 'Hebrew',
  uk: 'Ukrainian',
  el: 'Greek',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  is: 'Icelandic',
  ga: 'Irish',
  mt: 'Maltese',
  cy: 'Welsh',
  bn: 'Bengali',
  hy: 'Armenian',
  ln: 'Lingala',
  wo: 'Wolof',
  cn: 'Chinese (Variant)',
  xx: 'Unknown/No Language',
};

/**
 * Get human-readable language name from ISO 639-1 code.
 * Falls back to uppercase code if not found.
 */
export const getLanguageName = (code) => {
  if (!code) return code;
  const lowerCode = code.toLowerCase();
  return languageNames[lowerCode] || languageNames[code] || code.toUpperCase();
};
