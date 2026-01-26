// Re-export formatting utilities
export { normalizeCountryName, getLanguageName, languageNames } from './formatting';

export function formatRuntime(minutes, format = 'auto') {
  if (!minutes || minutes === 0) return '0';

  const weeks = Math.floor(minutes / (7 * 24 * 60));
  const remainingAfterWeeks = minutes % (7 * 24 * 60);
  const days = Math.floor(remainingAfterWeeks / (24 * 60));
  const remainingAfterDays = remainingAfterWeeks % (24 * 60);
  const hours = Math.floor(remainingAfterDays / 60);
  const mins = remainingAfterDays % 60;

  const parts = [];

  if (format === 'hours') {
    // Hours and minutes only (no days, no weeks) - convert entire runtime
    const totalHours = Math.floor(minutes / 60);
    const totalMins = minutes % 60;
    if (totalHours > 0) {
      parts.push(`${totalHours} ${totalHours === 1 ? 'hour' : 'hours'}`);
    }
    if (totalMins > 0) {
      parts.push(`${totalMins} ${totalMins === 1 ? 'min' : 'min'}`);
    }
  } else if (format === 'days') {
    // Days, hours, minutes (no weeks)
    if (days > 0) {
      parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }
    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    if (mins > 0 && parts.length < 3) {
      parts.push(`${mins} ${mins === 1 ? 'min' : 'min'}`);
    }
  } else if (format === 'weeks') {
    // Weeks, days, hours, minutes
    if (weeks > 0) {
      parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
    }
    if (days > 0) {
      parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }
    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    if (mins > 0) {
      parts.push(`${mins} ${mins === 1 ? 'min' : 'min'}`);
    }
  } else {
    // Auto format (default behavior)
    const isLessThanWeek = weeks === 0;

    // Show up to 3 time spans, prioritizing larger units
    if (weeks > 0) {
      parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
    }
    if (days > 0 && parts.length < 3) {
      parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }
    if (hours > 0 && parts.length < 3) {
      parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    // Show minutes only if runtime is less than a week and we haven't reached 3 spans yet
    if (mins > 0 && isLessThanWeek && parts.length < 3) {
      parts.push(`${mins} ${mins === 1 ? 'min' : 'min'}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : '0';
}
