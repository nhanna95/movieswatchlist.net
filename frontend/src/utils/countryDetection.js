/**
 * Country detection utility for streaming service availability.
 * Detects user's country via browser language/timezone and stores preference in localStorage.
 */

const STORAGE_KEY = 'streaming_country_code';

// Common country code mappings from language/timezone
const LANGUAGE_TO_COUNTRY = {
  'en-US': 'US',
  'en-GB': 'GB',
  'en-CA': 'CA',
  'en-AU': 'AU',
  'en-NZ': 'NZ',
  'es-ES': 'ES',
  'es-MX': 'MX',
  'es-AR': 'AR',
  'fr-FR': 'FR',
  'fr-CA': 'CA',
  'de-DE': 'DE',
  'it-IT': 'IT',
  'pt-BR': 'BR',
  'pt-PT': 'PT',
  'ja-JP': 'JP',
  'ko-KR': 'KR',
  'zh-CN': 'CN',
  'zh-TW': 'TW',
  'ru-RU': 'RU',
  'nl-NL': 'NL',
  'sv-SE': 'SE',
  'no-NO': 'NO',
  'da-DK': 'DK',
  'fi-FI': 'FI',
  'pl-PL': 'PL',
  'tr-TR': 'TR',
  'hi-IN': 'IN',
  'ar-SA': 'SA',
  'cs-CZ': 'CZ',
  'hu-HU': 'HU',
  'ro-RO': 'RO',
  'th-TH': 'TH',
  'vi-VN': 'VN',
  'id-ID': 'ID',
  'ms-MY': 'MY',
  'he-IL': 'IL',
  'uk-UA': 'UA',
  'el-GR': 'GR',
  'bg-BG': 'BG',
  'hr-HR': 'HR',
  'sr-RS': 'RS',
  'sk-SK': 'SK',
  'sl-SI': 'SI',
  'et-EE': 'EE',
  'lv-LV': 'LV',
  'lt-LT': 'LT',
  'is-IS': 'IS',
};

// Map timezone to country codes (most common)
const TIMEZONE_TO_COUNTRY = {
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'America/Honolulu': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'America/Buenos_Aires': 'AR',
  'America/Santiago': 'CL',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES',
  'Europe/Amsterdam': 'NL',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU',
  'Europe/Bucharest': 'RO',
  'Europe/Athens': 'GR',
  'Europe/Istanbul': 'TR',
  'Europe/Moscow': 'RU',
  'Europe/Kiev': 'UA',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH',
  'Asia/Jakarta': 'ID',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Manila': 'PH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/New_Delhi': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Tehran': 'IR',
  'Asia/Jerusalem': 'IL',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ',
};

/**
 * Detect country code from browser language
 */
const detectFromLanguage = () => {
  const language = navigator.language || navigator.userLanguage;
  if (language) {
    // Check full locale first
    if (LANGUAGE_TO_COUNTRY[language]) {
      return LANGUAGE_TO_COUNTRY[language];
    }
    // Check language code (first 2 chars)
    const langCode = language.split('-')[0];
    // Map common languages to default countries
    const langDefaults = {
      en: 'US',
      es: 'ES',
      fr: 'FR',
      de: 'DE',
      it: 'IT',
      pt: 'PT',
      ja: 'JP',
      ko: 'KR',
      zh: 'CN',
      ru: 'RU',
      nl: 'NL',
      sv: 'SE',
      no: 'NO',
      da: 'DK',
      fi: 'FI',
      pl: 'PL',
      tr: 'TR',
      hi: 'IN',
      ar: 'SA',
      cs: 'CZ',
      hu: 'HU',
      ro: 'RO',
      th: 'TH',
      vi: 'VN',
      id: 'ID',
      ms: 'MY',
      he: 'IL',
      uk: 'UA',
      el: 'GR',
      bg: 'BG',
      hr: 'HR',
      sr: 'RS',
      sk: 'SK',
      sl: 'SI',
      et: 'EE',
      lv: 'LV',
      lt: 'LT',
      is: 'IS',
    };
    if (langDefaults[langCode]) {
      return langDefaults[langCode];
    }
  }
  return null;
};

/**
 * Detect country code from timezone
 */
const detectFromTimezone = () => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone && TIMEZONE_TO_COUNTRY[timezone]) {
      return TIMEZONE_TO_COUNTRY[timezone];
    }
  } catch (e) {
    // Timezone detection failed
  }
  return null;
};

/**
 * Detect country code using multiple methods
 * Falls back to 'US' if detection fails
 */
export const detectCountry = async () => {
  // Check localStorage first
  const stored = getStoredCountry();
  if (stored) {
    return stored;
  }

  // Try timezone detection first (more reliable)
  const timezoneCountry = detectFromTimezone();
  if (timezoneCountry) {
    setStoredCountry(timezoneCountry);
    return timezoneCountry;
  }

  // Try language detection
  const languageCountry = detectFromLanguage();
  if (languageCountry) {
    setStoredCountry(languageCountry);
    return languageCountry;
  }

  // Fallback to US
  const defaultCountry = 'US';
  setStoredCountry(defaultCountry);
  return defaultCountry;
};

/**
 * Get stored country code from localStorage
 */
export const getStoredCountry = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length === 2) {
      return stored.toUpperCase();
    }
  } catch (e) {
    // localStorage not available
  }
  return null;
};

/**
 * Set country code in localStorage
 */
export const setStoredCountry = (countryCode) => {
  try {
    if (countryCode && countryCode.length === 2) {
      localStorage.setItem(STORAGE_KEY, countryCode.toUpperCase());
    }
  } catch (e) {
    // localStorage not available
  }
};

/**
 * Get country name from country code
 */
export const getCountryName = (countryCode) => {
  const countryNames = {
    US: 'United States',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
    NZ: 'New Zealand',
    DE: 'Germany',
    FR: 'France',
    IT: 'Italy',
    ES: 'Spain',
    NL: 'Netherlands',
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    FI: 'Finland',
    PL: 'Poland',
    CZ: 'Czech Republic',
    HU: 'Hungary',
    RO: 'Romania',
    GR: 'Greece',
    TR: 'Turkey',
    RU: 'Russia',
    UA: 'Ukraine',
    JP: 'Japan',
    KR: 'South Korea',
    CN: 'China',
    TW: 'Taiwan',
    HK: 'Hong Kong',
    SG: 'Singapore',
    TH: 'Thailand',
    ID: 'Indonesia',
    MY: 'Malaysia',
    PH: 'Philippines',
    VN: 'Vietnam',
    IN: 'India',
    AE: 'United Arab Emirates',
    SA: 'Saudi Arabia',
    IR: 'Iran',
    IL: 'Israel',
    BR: 'Brazil',
    MX: 'Mexico',
    AR: 'Argentina',
    CL: 'Chile',
    PT: 'Portugal',
    IE: 'Ireland',
    AT: 'Austria',
    CH: 'Switzerland',
    BE: 'Belgium',
    ZA: 'South Africa',
  };
  return countryNames[countryCode] || countryCode;
};

/**
 * Get list of common countries for dropdown
 */
export const getCommonCountries = () => {
  return [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'IN', name: 'India' },
    { code: 'CN', name: 'China' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'PL', name: 'Poland' },
    { code: 'NZ', name: 'New Zealand' },
  ];
};
