import { useState, useCallback } from 'react';

export const useLoadingState = () => {
    const [loadingStates, setLoadingStates] = useState({
        initial: false,
        refresh: false,
        addStock: false,
        editStock: false,
        deleteStock: false,
        importStocks: false,
        clearData: false,
        disconnect: false,
    });

    const setLoading = useCallback((key, value) => {
        setLoadingStates(prev => ({
            ...prev,
            [key]: value,
        }));
    }, []);

    const startLoading = useCallback((key) => {
        setLoading(key, true);
    }, [setLoading]);

    const stopLoading = useCallback((key) => {
        setLoading(key, false);
    }, [setLoading]);

    const withLoading = useCallback(async (key, operation) => {
        try {
            startLoading(key);
            const result = await operation();
            return result;
        } finally {
            stopLoading(key);
        }
    }, [startLoading, stopLoading]);

    const isLoading = useCallback((key) => {
        return loadingStates[key] || false;
    }, [loadingStates]);

    const isAnyLoading = useCallback(() => {
        return Object.values(loadingStates).some(state => state === true);
    }, [loadingStates]);

    return {
        loadingStates,
        setLoading,
        startLoading,
        stopLoading,
        withLoading,
        isLoading,
        isAnyLoading,
    };
}; 