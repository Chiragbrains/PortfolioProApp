// UI Constants
export const COLORS = {
    primary: '#0066cc',
    secondary: '#8A94A6',
    success: '#34C759',
    danger: '#FF3B30',
    warning: '#FF9500',
    info: '#5856D6',
    light: '#F2F2F7',
    dark: '#333333',
    white: '#FFFFFF',
    black: '#000000',
    gray: {
        100: '#F2F2F7',
        200: '#E5E5EA',
        300: '#D1D1D6',
        400: '#C7C7CC',
        500: '#AEAEB2',
        600: '#8E8E93',
        700: '#636366',
        800: '#48484A',
        900: '#3A3A3C',
    },
};

export const FONT_SIZES = {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
};

export const SPACING = {
    xs: 4,
    sm: 8,
    base: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
    '3xl': 64,
};

export const BORDER_RADIUS = {
    sm: 4,
    base: 8,
    lg: 12,
    xl: 16,
    full: 9999,
};

// App Constants
export const APP_CONFIG = {
    refreshInterval: 5 * 60 * 1000, // 5 minutes
    maxRetries: 3,
    defaultPageSize: 20,
    maxFileSize: 5 * 1024 * 1024, // 5MB
    supportedFileTypes: ['.xlsx', '.xls', '.csv'],
};

// API Constants
export const API_ENDPOINTS = {
    portfolio: '/portfolio',
    accounts: '/accounts',
    transactions: '/transactions',
    summary: '/summary',
};

// Error Messages
export const ERROR_MESSAGES = {
    networkError: 'Network connection error. Please check your internet connection.',
    serverError: 'Server error. Please try again later.',
    invalidData: 'Invalid data format. Please check your input.',
    fileTooLarge: 'File size exceeds the maximum limit of 5MB.',
    unsupportedFile: 'Unsupported file type. Please use .xlsx, .xls, or .csv files.',
    requiredFields: 'Please fill in all required fields.',
    invalidNumber: 'Please enter a valid number.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
    dataImported: 'Data imported successfully.',
    dataUpdated: 'Data updated successfully.',
    dataDeleted: 'Data deleted successfully.',
    connectionEstablished: 'Connection established successfully.',
};

// Validation Patterns
export const VALIDATION_PATTERNS = {
    email: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
    phone: /^\+?[\d\s-]{10,}$/,
    password: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/,
    ticker: /^[A-Z]{1,5}$/,
}; 