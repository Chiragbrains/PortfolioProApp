import { useState, useCallback } from 'react';
import { ERROR_MESSAGES } from '../utils/constants';

export const useErrorHandler = () => {
    const [error, setError] = useState(null);
    const [isErrorVisible, setIsErrorVisible] = useState(false);

    const handleError = useCallback((error, customMessage = null) => {
        console.error('Error occurred:', error);

        let errorMessage = customMessage;

        if (!errorMessage) {
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else {
                errorMessage = ERROR_MESSAGES.serverError;
            }
        }

        setError(errorMessage);
        setIsErrorVisible(true);

        // Auto-hide error after 5 seconds
        setTimeout(() => {
            setIsErrorVisible(false);
        }, 5000);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
        setIsErrorVisible(false);
    }, []);

    const handleNetworkError = useCallback(() => {
        handleError(new Error(ERROR_MESSAGES.networkError));
    }, [handleError]);

    const handleValidationError = useCallback((message) => {
        handleError(new Error(message || ERROR_MESSAGES.invalidData));
    }, [handleError]);

    const handleFileError = useCallback((error) => {
        if (error.message.includes('size')) {
            handleError(error, ERROR_MESSAGES.fileTooLarge);
        } else if (error.message.includes('type')) {
            handleError(error, ERROR_MESSAGES.unsupportedFile);
        } else {
            handleError(error);
        }
    }, [handleError]);

    const handleDatabaseError = useCallback((error) => {
        if (error.code === '23505') { // Unique violation
            handleError(error, 'This record already exists.');
        } else if (error.code === '23503') { // Foreign key violation
            handleError(error, 'Cannot delete this record as it is referenced by other records.');
        } else {
            handleError(error);
        }
    }, [handleError]);

    return {
        error,
        isErrorVisible,
        handleError,
        clearError,
        handleNetworkError,
        handleValidationError,
        handleFileError,
        handleDatabaseError,
    };
}; 