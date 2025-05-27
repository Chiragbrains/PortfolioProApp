import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useDataPersistence = (key, initialValue = null) => {
    const [data, setData] = useState(initialValue);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Load data from storage on mount
    useEffect(() => {
        loadData();
    }, [key]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const storedData = await AsyncStorage.getItem(key);
            if (storedData !== null) {
                setData(JSON.parse(storedData));
            }
        } catch (err) {
            console.error('Error loading data from storage:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [key]);

    const saveData = useCallback(async (newData) => {
        try {
            setLoading(true);
            const jsonValue = JSON.stringify(newData);
            await AsyncStorage.setItem(key, jsonValue);
            setData(newData);
        } catch (err) {
            console.error('Error saving data to storage:', err);
            setError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [key]);

    const removeData = useCallback(async () => {
        try {
            setLoading(true);
            await AsyncStorage.removeItem(key);
            setData(initialValue);
        } catch (err) {
            console.error('Error removing data from storage:', err);
            setError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [key, initialValue]);

    const clearAllData = useCallback(async () => {
        try {
            setLoading(true);
            await AsyncStorage.clear();
            setData(initialValue);
        } catch (err) {
            console.error('Error clearing storage:', err);
            setError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [initialValue]);

    const updateData = useCallback(async (updater) => {
        try {
            setLoading(true);
            const newData = typeof updater === 'function' ? updater(data) : updater;
            await saveData(newData);
        } catch (err) {
            console.error('Error updating data:', err);
            setError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [data, saveData]);

    return {
        data,
        loading,
        error,
        saveData,
        loadData,
        removeData,
        clearAllData,
        updateData,
    };
}; 