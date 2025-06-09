// yfinance_handler.js
import { Platform } from 'react-native';

class YFinanceHandler {
    constructor() {
        // Set default server URL
        //this.serverUrl = 'REACT_APP_API_BASE_URL';
        const BASE_URL = process.env.REACT_APP_API_BASE_URL;
        //const BASE_URL = 'http://localhost:5002';
        this.serverUrl = BASE_URL;
        // Override for Android emulator
        if (Platform.OS === 'android') {
            this.serverUrl = 'BASE_URL';
        }
        
        this.isProcessing = false;
        this.pythonProcess = null;
        console.log(`[YFinanceHandler] Initialized with server URL: ${this.serverUrl}`);
    }

    setServerUrl(url) {
        if (!url) {
            console.warn('[YFinanceHandler] Attempted to set empty server URL');
            return;
        }
        this.serverUrl = url;
        console.log(`[YFinanceHandler] Server URL updated to: ${this.serverUrl}`);
    }

    async processQuery(query) {
        if (!query || typeof query !== 'string' || !query.trim()) {
            throw new Error('Invalid query: must be a non-empty string');
        }

        if (!this.serverUrl) {
            throw new Error('Server URL not configured');
        }

        if (this.isProcessing) {
            throw new Error('Already processing a query');
        }

        this.isProcessing = true;
        console.log('[YFinanceHandler] Processing query:', query);

        try {
            const response = await fetch(`${this.serverUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to analyze stock');
            }

            const data = await response.json();
            console.log('Received data:', data);

            // Clean up NaN values in the data
            const cleanData = this.cleanNaNValues(data);

            // Add charts to the response if they exist
            if (data.charts) {
                cleanData.charts = data.charts;
                console.log('Charts available:', Object.keys(data.charts));
            }

            return cleanData;
        } catch (error) {
            console.error('Error processing query:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    cleanNaNValues(obj) {
        if (obj === null || obj === undefined) {
            return null;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.cleanNaNValues(item));
        }

        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined) {
                if (typeof value === 'number' && isNaN(value)) {
                    result[key] = null;
                } else if (typeof value === 'object') {
                    result[key] = this.cleanNaNValues(value);
                } else {
                    result[key] = value;
                }
            }
        }
        return result;
    }

    cleanup() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        this.isProcessing = false;
    }
}

export default YFinanceHandler; 