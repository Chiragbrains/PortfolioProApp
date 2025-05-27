import { useState, useCallback } from 'react';

export const useUIState = () => {
    const [activeTab, setActiveTab] = useState('portfolio');
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [isAddStockModalVisible, setIsAddStockModalVisible] = useState(false);
    const [isEditStockModalVisible, setIsEditStockModalVisible] = useState(false);
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [isClearDataModalVisible, setIsClearDataModalVisible] = useState(false);
    const [isDisconnectModalVisible, setIsDisconnectModalVisible] = useState(false);
    const [isConnectionErrorModalVisible, setIsConnectionErrorModalVisible] = useState(false);
    const [isValueVisible, setIsValueVisible] = useState(true);
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    const [expandedAccounts, setExpandedAccounts] = useState(new Set());
    const [selectedStock, setSelectedStock] = useState(null);
    const [notification, setNotification] = useState({ visible: false, message: '' });

    const toggleMenu = useCallback(() => {
        setIsMenuVisible(prev => !prev);
    }, []);

    const toggleAddStockModal = useCallback(() => {
        setIsAddStockModalVisible(prev => !prev);
    }, []);

    const toggleEditStockModal = useCallback(() => {
        setIsEditStockModalVisible(prev => !prev);
    }, []);

    const toggleImportModal = useCallback(() => {
        setIsImportModalVisible(prev => !prev);
    }, []);

    const toggleClearDataModal = useCallback(() => {
        setIsClearDataModalVisible(prev => !prev);
    }, []);

    const toggleDisconnectModal = useCallback(() => {
        setIsDisconnectModalVisible(prev => !prev);
    }, []);

    const toggleConnectionErrorModal = useCallback(() => {
        setIsConnectionErrorModalVisible(prev => !prev);
    }, []);

    const toggleValueVisibility = useCallback(() => {
        setIsValueVisible(prev => !prev);
    }, []);

    const toggleSummaryCollapse = useCallback(() => {
        setIsSummaryCollapsed(prev => !prev);
    }, []);

    const toggleAccountExpansion = useCallback((accountName) => {
        setExpandedAccounts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountName)) {
                newSet.delete(accountName);
            } else {
                newSet.add(accountName);
            }
            return newSet;
        });
    }, []);

    const showNotification = useCallback((message, duration = 3000) => {
        setNotification({ visible: true, message });
        setTimeout(() => {
            setNotification({ visible: false, message: '' });
        }, duration);
    }, []);

    const handleStockSelect = useCallback((stock) => {
        setSelectedStock(stock);
        setIsEditStockModalVisible(true);
    }, []);

    const closeAllModals = useCallback(() => {
        setIsMenuVisible(false);
        setIsAddStockModalVisible(false);
        setIsEditStockModalVisible(false);
        setIsImportModalVisible(false);
        setIsClearDataModalVisible(false);
        setIsDisconnectModalVisible(false);
        setIsConnectionErrorModalVisible(false);
    }, []);

    return {
        // State
        activeTab,
        isMenuVisible,
        isAddStockModalVisible,
        isEditStockModalVisible,
        isImportModalVisible,
        isClearDataModalVisible,
        isDisconnectModalVisible,
        isConnectionErrorModalVisible,
        isValueVisible,
        isSummaryCollapsed,
        expandedAccounts,
        selectedStock,
        notification,

        // Actions
        setActiveTab,
        toggleMenu,
        toggleAddStockModal,
        toggleEditStockModal,
        toggleImportModal,
        toggleClearDataModal,
        toggleDisconnectModal,
        toggleConnectionErrorModal,
        toggleValueVisibility,
        toggleSummaryCollapse,
        toggleAccountExpansion,
        showNotification,
        handleStockSelect,
        closeAllModals,
    };
}; 