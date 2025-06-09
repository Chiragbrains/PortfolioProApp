import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';

export const useAppLifecycle = () => {
    const [appState, setAppState] = useState(AppState.currentState);
    const [lastActive, setLastActive] = useState(new Date());
    const [isBackground, setIsBackground] = useState(false);
    const [isInactive, setIsInactive] = useState(false);

    const handleAppStateChange = useCallback((nextAppState) => {
        const now = new Date();

        if (appState.match(/inactive|background/) && nextAppState === 'active') {
            // App has come to the foreground
            setIsBackground(false);
            setIsInactive(false);
            setLastActive(now);
        } else if (nextAppState === 'background') {
            // App has gone to the background
            setIsBackground(true);
            setIsInactive(false);
        } else if (nextAppState === 'inactive') {
            // App is inactive (e.g., during a phone call)
            setIsInactive(true);
            setIsBackground(false);
        }

        setAppState(nextAppState);
    }, [appState]);

    useEffect(() => {
        // Subscribe to app state changes
        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Cleanup subscription
        return () => {
            subscription.remove();
        };
    }, [handleAppStateChange]);

    const getTimeSinceLastActive = useCallback(() => {
        const now = new Date();
        const diff = now - lastActive;
        return diff;
    }, [lastActive]);

    const isAppActive = useCallback(() => {
        return appState === 'active';
    }, [appState]);

    const isAppBackground = useCallback(() => {
        return appState === 'background';
    }, [appState]);

    const isAppInactive = useCallback(() => {
        return appState === 'inactive';
    }, [appState]);

    const getAppStateLabel = useCallback(() => {
        switch (appState) {
            case 'active':
                return 'Active';
            case 'background':
                return 'Background';
            case 'inactive':
                return 'Inactive';
            default:
                return 'Unknown';
        }
    }, [appState]);

    return {
        appState,
        lastActive,
        isBackground,
        isInactive,
        getTimeSinceLastActive,
        isAppActive,
        isAppBackground,
        isAppInactive,
        getAppStateLabel,
    };
}; 