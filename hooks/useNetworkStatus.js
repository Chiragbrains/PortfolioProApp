import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { ERROR_MESSAGES } from '../utils/constants';

export const useNetworkStatus = () => {
    const [isConnected, setIsConnected] = useState(true);
    const [connectionType, setConnectionType] = useState(null);
    const [connectionQuality, setConnectionQuality] = useState(null);

    const checkConnection = useCallback(async () => {
        try {
            const state = await NetInfo.fetch();
            setIsConnected(state.isConnected);
            setConnectionType(state.type);
            setConnectionQuality(state.details?.strength || null);
            return state.isConnected;
        } catch (err) {
            console.error('Error checking network status:', err);
            return false;
        }
    }, []);

    const handleConnectivityChange = useCallback((state) => {
        setIsConnected(state.isConnected);
        setConnectionType(state.type);
        setConnectionQuality(state.details?.strength || null);
    }, []);

    useEffect(() => {
        // Initial check
        checkConnection();

        // Subscribe to network state updates
        const unsubscribe = NetInfo.addEventListener(handleConnectivityChange);

        // Cleanup subscription
        return () => {
            unsubscribe();
        };
    }, [checkConnection, handleConnectivityChange]);

    const isWifi = useCallback(() => {
        return connectionType === 'wifi';
    }, [connectionType]);

    const isCellular = useCallback(() => {
        return connectionType === 'cellular';
    }, [connectionType]);

    const isEthernet = useCallback(() => {
        return connectionType === 'ethernet';
    }, [connectionType]);

    const isBluetooth = useCallback(() => {
        return connectionType === 'bluetooth';
    }, [connectionType]);

    const isVpn = useCallback(() => {
        return connectionType === 'vpn';
    }, [connectionType]);

    const getConnectionQualityLabel = useCallback(() => {
        if (!connectionQuality) return 'Unknown';
        if (connectionQuality >= 80) return 'Excellent';
        if (connectionQuality >= 60) return 'Good';
        if (connectionQuality >= 40) return 'Fair';
        if (connectionQuality >= 20) return 'Poor';
        return 'Very Poor';
    }, [connectionQuality]);

    const getConnectionErrorMessage = useCallback(() => {
        if (!isConnected) return ERROR_MESSAGES.networkError;
        if (connectionQuality && connectionQuality < 20) return 'Poor network connection. Some features may be limited.';
        return null;
    }, [isConnected, connectionQuality]);

    return {
        isConnected,
        connectionType,
        connectionQuality,
        checkConnection,
        isWifi,
        isCellular,
        isEthernet,
        isBluetooth,
        isVpn,
        getConnectionQualityLabel,
        getConnectionErrorMessage,
    };
}; 