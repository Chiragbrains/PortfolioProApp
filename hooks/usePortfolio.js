import { useState, useEffect, useCallback } from 'react';
import { useSupabaseConfig } from '../SupabaseConfigContext';
import {
    fetchPortfolioSummary,
    fetchInvestmentAccounts,
    addInvestmentAccount,
    updateInvestmentAccount,
    deleteInvestmentAccount,
    bulkImportInvestmentAccounts,
    truncateInvestmentAccounts,
    refreshPortfolioDataIfNeeded,
} from '../stocksService';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../utils/constants';

export const usePortfolio = () => {
    const { supabaseClient } = useSupabaseConfig();
    const [portfolioData, setPortfolioData] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const loadPortfolioData = useCallback(async () => {
        if (!supabaseClient) return;
        
        setLoading(true);
        setError(null);
        
        try {
            const [summaryData, accountsData] = await Promise.all([
                fetchPortfolioSummary(supabaseClient),
                fetchInvestmentAccounts(supabaseClient)
            ]);
            
            setPortfolioData(summaryData);
            setAccounts(accountsData);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Error loading portfolio data:', err);
            setError(ERROR_MESSAGES.serverError);
        } finally {
            setLoading(false);
        }
    }, [supabaseClient]);

    const refreshData = useCallback(async (force = false) => {
        if (!supabaseClient) return;
        
        try {
            await refreshPortfolioDataIfNeeded(supabaseClient, force);
            await loadPortfolioData();
            return SUCCESS_MESSAGES.dataUpdated;
        } catch (err) {
            console.error('Error refreshing data:', err);
            setError(ERROR_MESSAGES.serverError);
            throw err;
        }
    }, [supabaseClient, loadPortfolioData]);

    const addStock = useCallback(async (stockData) => {
        if (!supabaseClient) return;
        
        try {
            const result = await addInvestmentAccount(supabaseClient, stockData);
            await loadPortfolioData();
            return SUCCESS_MESSAGES.dataUpdated;
        } catch (err) {
            console.error('Error adding stock:', err);
            setError(ERROR_MESSAGES.serverError);
            throw err;
        }
    }, [supabaseClient, loadPortfolioData]);

    const updateStock = useCallback(async (id, updateData) => {
        if (!supabaseClient) return;
        
        try {
            const result = await updateInvestmentAccount(supabaseClient, id, updateData);
            await loadPortfolioData();
            return SUCCESS_MESSAGES.dataUpdated;
        } catch (err) {
            console.error('Error updating stock:', err);
            setError(ERROR_MESSAGES.serverError);
            throw err;
        }
    }, [supabaseClient, loadPortfolioData]);

    const deleteStock = useCallback(async (id) => {
        if (!supabaseClient) return;
        
        try {
            await deleteInvestmentAccount(supabaseClient, id);
            await loadPortfolioData();
            return SUCCESS_MESSAGES.dataDeleted;
        } catch (err) {
            console.error('Error deleting stock:', err);
            setError(ERROR_MESSAGES.serverError);
            throw err;
        }
    }, [supabaseClient, loadPortfolioData]);

    const importStocks = useCallback(async (stocksData) => {
        if (!supabaseClient) return;
        
        try {
            await bulkImportInvestmentAccounts(supabaseClient, stocksData);
            await loadPortfolioData();
            return SUCCESS_MESSAGES.dataImported;
        } catch (err) {
            console.error('Error importing stocks:', err);
            setError(ERROR_MESSAGES.serverError);
            throw err;
        }
    }, [supabaseClient, loadPortfolioData]);

    const clearAllData = useCallback(async () => {
        if (!supabaseClient) return;
        
        try {
            await truncateInvestmentAccounts(supabaseClient);
            setPortfolioData([]);
            setAccounts([]);
            return SUCCESS_MESSAGES.dataDeleted;
        } catch (err) {
            console.error('Error clearing data:', err);
            setError(ERROR_MESSAGES.serverError);
            throw err;
        }
    }, [supabaseClient]);

    useEffect(() => {
        loadPortfolioData();
    }, [loadPortfolioData]);

    return {
        portfolioData,
        accounts,
        loading,
        error,
        lastUpdated,
        refreshData,
        addStock,
        updateStock,
        deleteStock,
        importStocks,
        clearAllData,
    };
}; 