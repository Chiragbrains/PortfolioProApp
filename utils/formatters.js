/**
 * Formats a number with commas as thousand separators
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Formats a timestamp into a readable date string
 * @param {string|number} timestamp - The timestamp to format
 * @returns {string|null} Formatted date string or null if invalid
 */
export const formatTimestamp = (timestamp) => {
    if (!timestamp) return null;
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return "Invalid Date";
        return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } catch (e) {
        console.error("Error formatting timestamp:", e);
        return "Error formatting date";
    }
};

/**
 * Formats a currency value with dollar sign and commas
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, decimals = 2) => {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    return `$${formatNumber(value.toFixed(decimals))}`;
};

/**
 * Formats a percentage value with sign and decimal places
 * @param {number} value - The percentage value to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 1) => {
    if (value === null || value === undefined || isNaN(value)) return '0.0%';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
}; 