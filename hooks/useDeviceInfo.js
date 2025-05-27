import { useState, useEffect, useCallback } from 'react';
import { Platform, Dimensions, PixelRatio, StatusBar } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

export const useDeviceInfo = () => {
    const [deviceInfo, setDeviceInfo] = useState({
        brand: null,
        manufacturer: null,
        modelName: null,
        osName: null,
        osVersion: null,
        deviceType: null,
        isDevice: false,
        isEmulator: false,
        isTablet: false,
        isPhone: false,
        isDesktop: false,
        isTV: false,
        isWeb: false,
        appVersion: null,
        buildNumber: null,
        screenWidth: Dimensions.get('window').width,
        screenHeight: Dimensions.get('window').height,
        statusBarHeight: StatusBar.currentHeight || 0,
        pixelRatio: PixelRatio.get(),
        fontScale: PixelRatio.getFontScale(),
    });

    const loadDeviceInfo = useCallback(async () => {
        try {
            const brand = await Device.getBrandAsync();
            const manufacturer = await Device.getManufacturerAsync();
            const modelName = await Device.getModelNameAsync();
            const osName = Platform.OS;
            const osVersion = Platform.Version;
            const deviceType = await Device.getDeviceTypeAsync();
            const isDevice = await Device.isDeviceAsync();
            const isEmulator = !isDevice;
            const isTablet = await Device.isTabletAsync();
            const isPhone = !isTablet;
            const isDesktop = Platform.OS === 'web';
            const isTV = Platform.OS === 'tv';
            const isWeb = Platform.OS === 'web';
            const appVersion = Application.nativeApplicationVersion;
            const buildNumber = Application.nativeBuildVersion;

            setDeviceInfo({
                brand,
                manufacturer,
                modelName,
                osName,
                osVersion,
                deviceType,
                isDevice,
                isEmulator,
                isTablet,
                isPhone,
                isDesktop,
                isTV,
                isWeb,
                appVersion,
                buildNumber,
                screenWidth: Dimensions.get('window').width,
                screenHeight: Dimensions.get('window').height,
                statusBarHeight: StatusBar.currentHeight || 0,
                pixelRatio: PixelRatio.get(),
                fontScale: PixelRatio.getFontScale(),
            });
        } catch (err) {
            console.error('Error loading device info:', err);
        }
    }, []);

    useEffect(() => {
        loadDeviceInfo();

        // Listen for dimension changes
        const subscription = Dimensions.addEventListener('change', ({ window }) => {
            setDeviceInfo(prev => ({
                ...prev,
                screenWidth: window.width,
                screenHeight: window.height,
            }));
        });

        return () => {
            subscription.remove();
        };
    }, [loadDeviceInfo]);

    const getDeviceTypeLabel = useCallback(() => {
        if (deviceInfo.isTablet) return 'Tablet';
        if (deviceInfo.isPhone) return 'Phone';
        if (deviceInfo.isDesktop) return 'Desktop';
        if (deviceInfo.isTV) return 'TV';
        return 'Unknown';
    }, [deviceInfo]);

    const getOSLabel = useCallback(() => {
        switch (deviceInfo.osName) {
            case 'ios':
                return `iOS ${deviceInfo.osVersion}`;
            case 'android':
                return `Android ${deviceInfo.osVersion}`;
            case 'web':
                return 'Web';
            default:
                return deviceInfo.osName;
        }
    }, [deviceInfo]);

    const getDeviceLabel = useCallback(() => {
        return `${deviceInfo.manufacturer} ${deviceInfo.modelName}`;
    }, [deviceInfo]);

    const getAppVersionLabel = useCallback(() => {
        return `${deviceInfo.appVersion} (${deviceInfo.buildNumber})`;
    }, [deviceInfo]);

    const isLandscape = useCallback(() => {
        return deviceInfo.screenWidth > deviceInfo.screenHeight;
    }, [deviceInfo]);

    const isPortrait = useCallback(() => {
        return deviceInfo.screenWidth < deviceInfo.screenHeight;
    }, [deviceInfo]);

    return {
        ...deviceInfo,
        getDeviceTypeLabel,
        getOSLabel,
        getDeviceLabel,
        getAppVersionLabel,
        isLandscape,
        isPortrait,
    };
}; 