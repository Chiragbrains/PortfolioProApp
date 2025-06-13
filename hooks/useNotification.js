import { useState, useCallback } from 'react';
import { SUCCESS_MESSAGES } from '../utils/constants';

export const useNotification = () => {
    const [notification, setNotification] = useState({
        visible: false,
        message: '',
        type: 'info', // 'info', 'success', 'warning', 'error'
        duration: 3000,
    });

    const showNotification = useCallback((message, type = 'info', duration = 3000) => {
        setNotification({
            visible: true,
            message,
            type,
            duration,
        });

        // Auto-hide notification after duration
        setTimeout(() => {
            setNotification(prev => ({
                ...prev,
                visible: false,
            }));
        }, duration);
    }, []);

    const hideNotification = useCallback(() => {
        setNotification(prev => ({
            ...prev,
            visible: false,
        }));
    }, []);

    const showSuccess = useCallback((message, duration) => {
        showNotification(message || SUCCESS_MESSAGES.dataUpdated, 'success', duration);
    }, [showNotification]);

    const showError = useCallback((message, duration) => {
        showNotification(message, 'error', duration);
    }, [showNotification]);

    const showWarning = useCallback((message, duration) => {
        showNotification(message, 'warning', duration);
    }, [showNotification]);

    const showInfo = useCallback((message, duration) => {
        showNotification(message, 'info', duration);
    }, [showNotification]);

    return {
        notification,
        showNotification,
        hideNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
    };
}; 