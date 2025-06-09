import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { APP_CONFIG, ERROR_MESSAGES } from '../utils/constants';

export const useFileOperations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const pickFile = useCallback(async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) {
                return null;
            }

            const file = result.assets[0];
            
            // Check file size
            const fileInfo = await FileSystem.getInfoAsync(file.uri);
            if (fileInfo.size > APP_CONFIG.maxFileSize) {
                throw new Error(ERROR_MESSAGES.fileTooLarge);
            }

            // Check file extension
            const extension = file.name.split('.').pop().toLowerCase();
            if (!APP_CONFIG.supportedFileTypes.includes(`.${extension}`)) {
                throw new Error(ERROR_MESSAGES.unsupportedFile);
            }

            return file;
        } catch (err) {
            console.error('Error picking file:', err);
            setError(err.message || ERROR_MESSAGES.serverError);
            throw err;
        }
    }, []);

    const readExcelFile = useCallback(async (file) => {
        setLoading(true);
        setError(null);

        try {
            const fileContent = await FileSystem.readAsStringAsync(file.uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const workbook = XLSX.read(fileContent, { type: 'base64' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Remove empty rows and columns
            const cleanData = data
                .filter(row => row.some(cell => cell !== null && cell !== ''))
                .map(row => row.filter(cell => cell !== null && cell !== ''));

            return cleanData;
        } catch (err) {
            console.error('Error reading Excel file:', err);
            setError(err.message || ERROR_MESSAGES.serverError);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const validateExcelData = useCallback((data) => {
        if (!Array.isArray(data) || data.length < 2) {
            throw new Error(ERROR_MESSAGES.invalidData);
        }

        const headers = data[0];
        const requiredColumns = ['ticker', 'account', 'quantity', 'cost_basis'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));

        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        const rows = data.slice(1);
        const invalidRows = rows.filter(row => {
            const ticker = row[headers.indexOf('ticker')];
            const account = row[headers.indexOf('account')];
            const quantity = row[headers.indexOf('quantity')];
            const cost_basis = row[headers.indexOf('cost_basis')];

            return !ticker || !account || 
                   isNaN(parseFloat(quantity)) || 
                   isNaN(parseFloat(cost_basis));
        });

        if (invalidRows.length > 0) {
            throw new Error(`Invalid data in ${invalidRows.length} row(s)`);
        }

        return true;
    }, []);

    const processExcelData = useCallback((data) => {
        const headers = data[0];
        const rows = data.slice(1);

        return rows.map(row => {
            const findColumnValue = (prefixes) => {
                const columnIndex = headers.findIndex(header => 
                    prefixes.some(prefix => 
                        header.toLowerCase().includes(prefix.toLowerCase())
                    )
                );
                return columnIndex !== -1 ? row[columnIndex] : null;
            };

            return {
                ticker: findColumnValue(['ticker', 'symbol']),
                account: findColumnValue(['account', 'portfolio']),
                quantity: findColumnValue(['quantity', 'shares', 'units']),
                cost_basis: findColumnValue(['cost', 'basis', 'price']),
                type: findColumnValue(['type', 'asset type']),
                company_name: findColumnValue(['company', 'name', 'description']),
            };
        });
    }, []);

    return {
        loading,
        error,
        pickFile,
        readExcelFile,
        validateExcelData,
        processExcelData,
    };
}; 