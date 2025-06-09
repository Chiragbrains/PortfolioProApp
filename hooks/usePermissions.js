import { useState, useEffect, useCallback } from 'react';
import * as Permissions from 'expo-permissions';
import { Platform } from 'react-native';

export const usePermissions = () => {
    const [permissions, setPermissions] = useState({
        camera: null,
        location: null,
        notifications: null,
        contacts: null,
        calendar: null,
        microphone: null,
        photos: null,
        storage: null,
    });

    const checkPermission = useCallback(async (permissionType) => {
        try {
            const { status } = await Permissions.getAsync(permissionType);
            setPermissions(prev => ({
                ...prev,
                [permissionType]: status,
            }));
            return status;
        } catch (err) {
            console.error(`Error checking ${permissionType} permission:`, err);
            return 'error';
        }
    }, []);

    const requestPermission = useCallback(async (permissionType) => {
        try {
            const { status } = await Permissions.requestAsync(permissionType);
            setPermissions(prev => ({
                ...prev,
                [permissionType]: status,
            }));
            return status;
        } catch (err) {
            console.error(`Error requesting ${permissionType} permission:`, err);
            return 'error';
        }
    }, []);

    const checkAllPermissions = useCallback(async () => {
        const permissionTypes = [
            Permissions.CAMERA,
            Permissions.LOCATION,
            Permissions.NOTIFICATIONS,
            Permissions.CONTACTS,
            Permissions.CALENDAR,
            Permissions.MICROPHONE,
            Permissions.MEDIA_LIBRARY,
            Permissions.STORAGE,
        ];

        const results = await Promise.all(
            permissionTypes.map(type => checkPermission(type))
        );

        const newPermissions = {};
        permissionTypes.forEach((type, index) => {
            newPermissions[type] = results[index];
        });

        setPermissions(newPermissions);
    }, [checkPermission]);

    const requestAllPermissions = useCallback(async () => {
        const permissionTypes = [
            Permissions.CAMERA,
            Permissions.LOCATION,
            Permissions.NOTIFICATIONS,
            Permissions.CONTACTS,
            Permissions.CALENDAR,
            Permissions.MICROPHONE,
            Permissions.MEDIA_LIBRARY,
            Permissions.STORAGE,
        ];

        const results = await Promise.all(
            permissionTypes.map(type => requestPermission(type))
        );

        const newPermissions = {};
        permissionTypes.forEach((type, index) => {
            newPermissions[type] = results[index];
        });

        setPermissions(newPermissions);
    }, [requestPermission]);

    const isPermissionGranted = useCallback((permissionType) => {
        return permissions[permissionType] === 'granted';
    }, [permissions]);

    const isPermissionDenied = useCallback((permissionType) => {
        return permissions[permissionType] === 'denied';
    }, [permissions]);

    const isPermissionUndetermined = useCallback((permissionType) => {
        return permissions[permissionType] === 'undetermined';
    }, [permissions]);

    const getPermissionStatus = useCallback((permissionType) => {
        return permissions[permissionType] || 'undetermined';
    }, [permissions]);

    const shouldShowPermissionRationale = useCallback((permissionType) => {
        if (Platform.OS === 'android') {
            return isPermissionDenied(permissionType);
        }
        return false;
    }, [isPermissionDenied]);

    useEffect(() => {
        checkAllPermissions();
    }, [checkAllPermissions]);

    return {
        permissions,
        checkPermission,
        requestPermission,
        checkAllPermissions,
        requestAllPermissions,
        isPermissionGranted,
        isPermissionDenied,
        isPermissionUndetermined,
        getPermissionStatus,
        shouldShowPermissionRationale,
    };
}; 