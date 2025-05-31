import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useSupabaseConfig } from './SupabaseConfigContext';
import { TrendingUp, BarChart3, Target, Zap, Users, DollarSign, Activity, Eye } from 'lucide-react';
// Conceptual data fetching functions - you'll need to implement these
// import { fetchDashboardKpiData, fetchPortfolioValueHistory, fetchDailyPnlHistory, fetchAssetAllocation } from './stocksService';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;
const pieChartSize = Math.max(160, Math.min(screenWidth * 0.6, 320)); // Responsive size for pie chart

const Dashboard = () => {
  const { supabaseClient } = useSupabaseConfig();

  const [activeChartType, setActiveChartType] = useState('valueTrend'); // 'valueTrend', 'weeklyPnl', 'allocation'
  const [selectedTimeRange, setSelectedTimeRange] = useState(90); // Default to 3M for line/bar charts
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [hoveredMetric, setHoveredMetric] = useState(null);
  const [isChartInteracting, setIsChartInteracting] = useState(false); // New state for chart interaction
  const [isValueVisible, setIsValueVisible] = useState(false);

  // KPI Data
  const [kpiData, setKpiData] = useState(null);
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);
  const [kpiError, setKpiError] = useState(null);

  // Chart Data
  const [chartData, setChartData] = useState(null);
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [chartError, setChartError] = useState(null);

  // --- Utility Functions ---
  const formatCurrency = (value, showSign = false) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    const sign = value >= 0 && showSign ? '+' : '';
    return sign + new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getPnlColor = (value) => {
    if (value === null || value === undefined || isNaN(value)) return styles.kpiValue; // Neutral color
    return value >= 0 ? styles.positiveText : styles.negativeText;
  };

  // --- Mock Data Fetching (Replace with actual calls to stocksService.js) ---
  const loadKpiData = useCallback(async () => {
    if (!supabaseClient) return;
    setIsLoadingKpis(true);
    setKpiError(null);
    try {
      // Fetch latest portfolio history
      const { data: historyData, error: historyError } = await supabaseClient
        .from('portfolio_history')
        .select('*')
        .order('date', { ascending: false })
        .limit(2);

      if (historyError) throw historyError;
      if (!historyData || historyData.length === 0) throw new Error('No portfolio history data available');

      const latest = historyData[0];
      const previous = historyData[1] || latest;

      // Calculate today's P&L
      const todayPnlDollar = latest.total_value - previous.total_value;
      const todayPnlPercent = previous.total_value ? (todayPnlDollar / previous.total_value) * 100 : 0;

      // Fetch unique assets count (exclude cash)
      const { data: summaryData, error: summaryError } = await supabaseClient
        .from('portfolio_summary')
        .select('*');

      if (summaryError) throw summaryError;
      // Only count assets where type !== 'cash'
      const uniqueAssets = summaryData ? summaryData.filter(item => item.type !== 'cash').length : 0;

      setKpiData({
        totalPortfolioValue: latest.total_value,
        overallPnlDollar: latest.total_pnl,
        overallPnlPercent: latest.total_cost_basis ? (latest.total_pnl / latest.total_cost_basis) * 100 : 0,
        todayPnlDollar,
        todayPnlPercent,
        uniqueAssets
      });
    } catch (err) {
      console.error("Error loading KPI data:", err);
      setKpiError('Failed to load summary.');
    } finally {
      setIsLoadingKpis(false);
    }
  }, [supabaseClient]);

  const loadChartData = useCallback(async (chartType, timeRangeDays) => {
    if (!supabaseClient) return;
    setIsLoadingChart(true);
    setChartError(null);
    setChartData(null);

    try {
      // Get the latest date from portfolio_history
      const { data: latestHistory, error: historyError } = await supabaseClient
        .from('portfolio_history')
        .select('date')
        .order('date', { ascending: false })
        .limit(1);

      if (historyError) {
        console.error('Error fetching latest history:', historyError);
        throw new Error(`Failed to fetch latest history: ${historyError.message}`);
      }
      
      if (!latestHistory || latestHistory.length === 0) {
        console.error('No portfolio history data found');
        throw new Error('No portfolio history data available');
      }

      const latestDate = new Date(latestHistory[0].date);
      const startDate = new Date(latestDate);
      startDate.setDate(latestDate.getDate() - timeRangeDays);

      console.log('Date range:', {
        startDate: startDate.toISOString(),
        latestDate: latestDate.toISOString(),
        timeRangeDays
      });

      if (chartType === 'valueTrend') {
        const { data: historyData, error: historyError } = await supabaseClient
          .from('portfolio_history')
          .select('*')
          .order('date', { ascending: true })
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', latestDate.toISOString().split('T')[0]);

        if (historyError) {
          console.error('Error fetching history data:', historyError);
          throw new Error(`Failed to fetch history data: ${historyError.message}`);
        }

        if (!historyData || historyData.length === 0) {
          console.error('No history data found for date range');
          throw new Error('No portfolio history data available for the selected time range');
        }

        console.log('History data points:', historyData.length);

        // Group data by week, with current week as a separate week
        const weeklyData = historyData.reduce((acc, item) => {
          const date = new Date(item.date);
          const weekStart = new Date(date);
          const isCurrentWeek = date.getTime() > new Date().setDate(new Date().getDate() - new Date().getDay());
          
          // For current week, use the date itself as the key
          const weekKey = isCurrentWeek ? 
            date.toISOString().split('T')[0] : 
            weekStart.setDate(date.getDate() - date.getDay()) && weekStart.toISOString().split('T')[0];
          
          if (!acc[weekKey]) {
            acc[weekKey] = {
              value: 0,
              costBasis: 0,
              count: 0,
              date: isCurrentWeek ? date : weekStart,
              weeklyChange: 0
            };
          }
          
          acc[weekKey].value += item.total_value;
          acc[weekKey].costBasis += item.total_cost_basis;
          acc[weekKey].count += 1;
          
          return acc;
        }, {});

        // Calculate weekly averages and weekly changes
        const data = Object.values(weeklyData).map((item, index, array) => {
          const weeklyChange = index > 0 ? 
            ((item.value / item.count) - (array[index - 1].value / array[index - 1].count)) : 0;
          
          return {
            value: item.value / item.count,
            costBasis: item.costBasis / item.count,
            label: item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            date: item.date,
            weeklyChange
          };
        });

        console.log('Processed weekly data points:', data.length);
        setChartData(data);
      } else if (chartType === 'weeklyPnl') {
        const { data: historyData, error: historyError } = await supabaseClient
          .from('portfolio_history')
          .select('*')
          .order('date', { ascending: true })
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', latestDate.toISOString().split('T')[0]);

        if (historyError) {
          console.error('Error fetching history data:', historyError);
          throw new Error(`Failed to fetch history data: ${historyError.message}`);
        }

        if (!historyData || historyData.length === 0) {
          console.error('No history data found for date range');
          throw new Error('No portfolio history data available for the selected time range');
        }

        // Group data by week, with current week as a separate week
        const weeklyData = historyData.reduce((acc, item, index) => {
          const date = new Date(item.date);
          const weekStart = new Date(date);
          const isCurrentWeek = date.getTime() > new Date().setDate(new Date().getDate() - new Date().getDay());
          
          // For current week, use the date itself as the key
          const weekKey = isCurrentWeek ? 
            date.toISOString().split('T')[0] : 
            weekStart.setDate(date.getDate() - date.getDay()) && weekStart.toISOString().split('T')[0];
          
          if (!acc[weekKey]) {
            acc[weekKey] = {
              value: 0,
              count: 0,
              date: isCurrentWeek ? date : weekStart
            };
          }
          
          const previousValue = index > 0 ? historyData[index - 1].total_value : item.total_value;
          const weeklyPnl = item.total_value - previousValue;
          
          acc[weekKey].value += weeklyPnl;
          acc[weekKey].count += 1;
          
          return acc;
        }, {});

        // Calculate weekly totals and format for chart
        const data = Object.values(weeklyData).map(item => ({
          value: item.value,
          label: item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          date: item.date,
          frontColor: item.value >= 0 ? '#10b981' : '#ef4444'
        }));

        setChartData(data);
      } else if (chartType === 'allocation') {
        // Fetch portfolio summary for allocation
        const { data: summaryData, error: summaryError } = await supabaseClient
          .from('portfolio_summary')
          .select('*');

        if (summaryError) throw summaryError;
        if (!summaryData || summaryData.length === 0) throw new Error('No portfolio summary data available');

        // Group by type and calculate totals
        const allocation = {
          etf: 0,
          cash: 0,
          stock: 0
        };

        summaryData.forEach(item => {
          if (item.type === 'etf') allocation.etf += item.market_value;
          else if (item.type === 'cash') allocation.cash += item.market_value;
          else if (item.type === 'stock') allocation.stock += item.market_value;
        });

        // Format data for pie chart
        const data = [
          { value: allocation.etf, text: 'ETFs', color: '#8b5cf6' },
          { value: allocation.cash, text: 'Cash', color: '#06b6d4' },
          { value: allocation.stock, text: 'Stocks', color: '#10b981' }
        ].filter(item => item.value > 0);

        setChartData(data);
      }
    } catch (err) {
      console.error(`Error loading ${chartType} data:`, err);
      setChartError(err.message || `Failed to load ${chartType.replace(/([A-Z])/g, ' $1').toLowerCase()} data.`);
    } finally {
      setIsLoadingChart(false);
    }
  }, [supabaseClient]);

  useEffect(() => {
    if (supabaseClient) {
      loadKpiData();
    }
  }, [loadKpiData, supabaseClient]);

  useEffect(() => {
    if (supabaseClient) {
      loadChartData(activeChartType, selectedTimeRange);
    }
  }, [activeChartType, selectedTimeRange, loadChartData, supabaseClient]);

  const handleChartTypeChange = (type) => {
    setActiveChartType(type);
  };

  const handleTimeRangeChange = (days) => {
    setSelectedTimeRange(days);
  };

  const toggleValueVisibility = () => setIsValueVisible(v => !v);

  // --- Render Functions ---
  const renderKpiCards = () => {
    if (isLoadingKpis) return <ActivityIndicator color="#8b5cf6" style={{ marginVertical: 20 }} />;
    if (kpiError) return <Text style={styles.errorText}>{kpiError}</Text>;
    if (!kpiData) return <Text style={styles.emptyText}>No summary data available.</Text>;

    const hiddenValuePlaceholder = '$*****';
    const hiddenPnlPlaceholder = '*****';
    const isProfitable = kpiData.overallPnlDollar >= 0;

    return (
      <View>
        {/* Total Portfolio Value Card */}
        <View style={[styles.kpiCardLarge, styles.gradientCard, { position: 'relative', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }]}> 
          <Text style={styles.kpiLabel}>Total Portfolio Value</Text>
          <Text style={[styles.kpiValueLarge, styles.gradientText]}>
            {isValueVisible ? formatCurrency(kpiData.totalPortfolioValue) : hiddenValuePlaceholder}
          </Text>
          <TouchableOpacity onPress={toggleValueVisibility} style={{ position: 'absolute', right: 18, top: 18, padding: 8 }}>
            <Text style={{ fontSize: 22 }}>{isValueVisible ? '👁️' : '🔒'}</Text>
          </TouchableOpacity>
        </View>
        {/* KPI Row */}
        <View style={styles.kpiRowContainer}>
          {[
            { label: "Today's P&L", value: formatCurrency(kpiData.todayPnlDollar, true), subValue: `(${kpiData.todayPnlPercent >= 0 ? '+' : ''}${kpiData.todayPnlPercent?.toFixed(2)}%)`, valueColor: getPnlColor(kpiData.todayPnlDollar), alwaysShow: true },
            { label: 'Unique Assets', value: kpiData.uniqueAssets?.toString() ?? '--', valueColor: styles.kpiValue, alwaysShow: true },
            { label: 'Overall P&L', value: isValueVisible ? formatCurrency(kpiData.overallPnlDollar, true) : hiddenPnlPlaceholder, subValue: isValueVisible ? `(${kpiData.overallPnlPercent >= 0 ? '+' : ''}${kpiData.overallPnlPercent?.toFixed(2)}%)` : '', valueColor: getPnlColor(kpiData.overallPnlDollar), alwaysShow: false },
          ].map((kpi, index) => (
            <View key={index} style={styles.kpiRowCard}>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={[styles.kpiValue, kpi.valueColor]}>{kpi.value}</Text>
              {kpi.subValue && <Text style={[styles.kpiSubValue, kpi.valueColor]}>{kpi.subValue}</Text>}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderChartNavigation = () => {
    const navItems = [
      { type: 'valueTrend', label: 'Performance', icon: TrendingUp, color: 'from-purple-600 to-purple-700' },
      { type: 'weeklyPnl', label: 'Weekly P&L', icon: BarChart3, color: 'from-cyan-600 to-cyan-700' },
      { type: 'allocation', label: 'Allocation', icon: Target, color: 'from-emerald-600 to-emerald-700' },
    ];
    return (
      <View style={styles.chartNavContainer}>
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.type}
              style={[
                styles.chartNavButton,
                activeChartType === item.type && styles.activeChartNavButton
              ]}
              onPress={() => handleChartTypeChange(item.type)}
            >
              <Icon size={20} color={activeChartType === item.type ? 'white' : '#d1d5db'} />
              <Text style={[
                styles.chartNavButtonText,
                activeChartType === item.type && styles.activeChartNavButtonText
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderTimeRangeSelector = () => {
    if (activeChartType === 'allocation') return null; // No time range for pie chart

    const ranges = [
      { days: 30, label: '1M' },
      { days: 90, label: '3M' },
      { days: 180, label: '6M' },
      { days: 365, label: '1Y' },
      { days: 730, label: '2Y' },
    ];
    return (
      <View style={styles.timeRangeContainer}>
        {ranges.map(range => (
          <TouchableOpacity
            key={range.days}
            style={[styles.timeRangeButton, selectedTimeRange === range.days && styles.activeTimeRangeButton]}
            onPress={() => handleTimeRangeChange(range.days)}
          >
            <Text style={[styles.timeRangeButtonText, selectedTimeRange === range.days && styles.activeTimeRangeButtonText]}>
              {range.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderActiveChart = () => {
    if (isLoadingChart) return <ActivityIndicator color="#8b5cf6" style={{ height: screenHeight * 0.3, justifyContent: 'center' }} />;
    if (chartError) return <Text style={[styles.errorText, { height: screenHeight * 0.3, textAlignVertical: 'center' }]}>{chartError}</Text>;
    if (!chartData || chartData.length === 0) return <Text style={[styles.emptyText, { height: screenHeight * 0.3, textAlignVertical: 'center' }]}>No data available for this view.</Text>;

    const chartWidth = screenWidth - 40; // Account for padding

    const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
        const pnlValue = payload[1] ? payload[0].value - payload[1].value : null;
        const weeklyChange = activeChartType === 'valueTrend' ? payload[0].payload.weeklyChange : null;
        
        if (activeChartType === 'valueTrend') {
          return (
            <View style={styles.tooltipContainer}>
              <Text style={styles.tooltipDate}>{label}</Text>
              <Text style={styles.tooltipValue}>
                Value: {formatCurrency(payload[0].value)}
              </Text>
              {payload[1] && (
                <Text style={styles.tooltipCostBasis}>
                  Cost Basis: {formatCurrency(payload[1].value)}
                </Text>
              )}
              {pnlValue !== null && (
                <Text style={[styles.tooltipPnl, pnlValue >= 0 ? styles.positiveText : styles.negativeText]}>
                  Overall P&L: {formatCurrency(pnlValue, true)}
                </Text>
              )}
              {weeklyChange !== null && (
                <Text style={[styles.tooltipWeeklyChange, weeklyChange >= 0 ? styles.positiveText : styles.negativeText]}>
                  Weekly Change: {formatCurrency(weeklyChange, true)}
                </Text>
              )}
            </View>
          );
        } else if (activeChartType === 'weeklyPnl') {
          return (
            <View style={styles.tooltipContainer}>
              <Text style={styles.tooltipDate}>{label}</Text>
              <Text style={[styles.tooltipValue, payload[0].value >= 0 ? styles.positiveText : styles.negativeText]}>
                Weekly P&L: {formatCurrency(payload[0].value, true)}
              </Text>
            </View>
          );
        }
      }
      return null;
    };

    switch (activeChartType) {
      case 'valueTrend':
        return (
          <ResponsiveContainer width={chartWidth} height={screenHeight * 0.3}>
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              onMouseDown={() => setIsChartInteracting(true)}
              onMouseUp={() => setIsChartInteracting(false)}
              onMouseLeave={() => setIsChartInteracting(false)} // Reset if mouse leaves while pressed
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorcostBasis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="label" 
                stroke="#9ca3af"
                fontSize={12}
                interval="preserveStartEnd"
                tick={{ fill: '#9ca3af' }}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Legend />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#8b5cf6"
                fillOpacity={.5}
                dot={false}
                fill="url(#colorValue)"
                strokeWidth={2}
                name="Total Value"
              />
              <Line
                type="monotone"
                dataKey="costBasis"
                stroke="#9ca3af"
                strokeWidth={2}
                dot={false}
                fillOpacity={1}
                strokeDasharray="5 5"
                name="Cost Basis"
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'weeklyPnl':
        return (
          <ResponsiveContainer width={chartWidth} height={screenHeight * 0.3}>
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              onMouseDown={() => setIsChartInteracting(true)}
              onMouseUp={() => setIsChartInteracting(false)}
              onMouseLeave={() => setIsChartInteracting(false)}
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="label" 
                stroke="#9ca3af"
                fontSize={12}
                interval="preserveStartEnd"
                tick={{ fill: '#9ca3af' }}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="value">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.frontColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'allocation':
        return (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <View style={[styles.allocationContainer, { width: '100%' }]}> {/* Ensure full width for flex */}
              <View style={styles.allocationLegend}>
                {chartData.map((item, index) => (
                  <View key={index} style={[
                    styles.allocationLegendItem,
                    selectedAsset === item.text && styles.selectedLegendItem
                  ]}>
                    <View style={[styles.allocationColorBox, { backgroundColor: item.color }]} />
                    <View style={styles.allocationLegendText}>
                      <Text style={styles.allocationLabel}>{item.text}</Text>
                      <Text style={styles.allocationPercentage}>
                        {((item.value / chartData.reduce((sum, curr) => sum + curr.value, 0)) * 100).toFixed(1)}%
                      </Text>
                      {selectedAsset === item.text && (
                        <Text style={styles.allocationValue}>{formatCurrency(item.value)}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.allocationChart}>
                <ResponsiveContainer width={pieChartSize} height={pieChartSize}>
                  <PieChart>
                    onMouseDown={() => setIsChartInteracting(true)}
                    onMouseUp={() => setIsChartInteracting(false)}
                    onMouseLeave={() => setIsChartInteracting(false)}
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={pieChartSize / 2 - 10}
                      innerRadius={pieChartSize / 2.8}
                      paddingAngle={5}
                      dataKey="value"
                      onPress={(data) => setSelectedAsset(data.text)}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <View style={styles.tooltipContainer}>
                              <Text style={styles.tooltipValue}>
                                {formatCurrency(payload[0].value)}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer} 
      scrollIndicatorInsets={{ right: 1 }}
      scrollEnabled={!isChartInteracting} // Control scroll based on chart interaction
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Portfolio Dashboard</Text>
        <Text style={styles.headerSubtitle}>Interactive portfolio analytics</Text>
      </View>

      {renderKpiCards()}

      {renderChartNavigation()}

      <View style={styles.chartDisplayContainer}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>
            {activeChartType === 'valueTrend' && 'Portfolio Value Over Time'}
            {activeChartType === 'weeklyPnl' && 'Weekly Profit & Loss'}
            {activeChartType === 'allocation' && 'Asset Allocation'}
          </Text>
          <Text style={styles.chartSubtitle}>
            {activeChartType === 'valueTrend' && 'Track your portfolio value growth'}
            {activeChartType === 'weeklyPnl' && 'Monitor weekly performance'}
            {activeChartType === 'allocation' && 'View asset distribution'}
          </Text>
          {renderTimeRangeSelector()}
        </View>
        {renderActiveChart()}
      </View> 
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827', // Dark background (like from-gray-900)
  },
  contentContainer: {
    padding: 15,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textAlign: 'center',
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(to right, #22d3ee, #8b5cf6, #ec4899)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
  },
  // KPI Card Styles
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  kpiCard: {
    backgroundColor: 'rgba(31, 41, 55, 0.7)', // bg-gray-800 with opacity
    borderRadius: 16, // rounded-2xl
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.7)', // border-gray-700
    width: '48%', // For 2 cards per row
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10, // For spacing when wrapping
    // Add shadow for Platform.OS === 'ios' if desired
    elevation: 3, // For Android shadow
  },
  kpiCardLarge: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(31, 41, 55, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.7)',
  },
  kpiLabel: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginTop: 2,
  },
  kpiValueLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
    marginTop: 4,
  },
  kpiSubValue: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  // New styles for KPI row
  kpiRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiRowCard: {
    flex: 1,
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(31, 41, 55, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.7)',
  },
  // Chart Navigation
  chartNavContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10, // Similar to gap-4
    marginBottom: 20,
  },
  chartNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12, // rounded-xl
    backgroundColor: 'rgba(55, 65, 81, 0.9)', // bg-gray-700
    gap: 8,
  },
  activeChartNavButton: {
    backgroundColor: '#8b5cf6', // Example: purple-600
    // Add shadow for active button if desired
  },
  chartNavButtonText: {
    color: '#d1d5db', // text-gray-300
    fontWeight: '500',
  },
  activeChartNavButtonText: {
    color: 'white',
  },
  // Chart Display Area
  chartDisplayContainer: {
    backgroundColor: 'rgba(31, 41, 55, 0.7)', // bg-gray-800 with opacity
    borderRadius: 16, // rounded-2xl
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.7)', // border-gray-700
    minHeight: 350, // Ensure space for chart
  },
  chartHeader: {
    marginBottom: 15,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textAlign: 'center',
  },
  chartSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 10,
    textAlign: 'center',

  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 5,
  },
  timeRangeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
  },
  activeTimeRangeButton: {
    backgroundColor: '#06b6d4', // Example: cyan-600
  },
  timeRangeButtonText: {
    color: '#d1d5db',
    fontSize: 12,
  },
  activeTimeRangeButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  // Tooltip for gifted-charts
  tooltipContainer: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  tooltipDate: {
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 4,
  },
  tooltipValue: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '500',
  },
  tooltipCostBasis: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
  },
  tooltipPnl: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  tooltipWeeklyChange: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  // Legend for Pie Chart
  legendContainer: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 8,
  },
  legendColorBox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    color: '#d1d5db',
    fontSize: 12,
  },
  // General
  errorText: {
    color: '#ef4444', // text-red-500
    textAlign: 'center',
    padding: 10,
    color: 'white',
  },
  emptyText: {
    color: '#9ca3af', // text-gray-400
    textAlign: 'center',
    padding: 10,
    color: 'white',
  },
  positiveText: {
    color: '#22c55e', // text-green-500
  },
  negativeText: {
    color: '#ef4444', // text-red-500
  },
  pointerLabelContainer: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    padding: 8,
    borderRadius: 8,
  },
  pointerLabelDate: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 3,
  },
  pointerLabelValue: {
    color: '#d1d5db',
    fontSize: 14,
  },
  pointerLabelCost: {
    color: '#9ca3af',
    fontSize: 12,
  },
  centerLabelContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.7)',
  },
  centerLabelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    letterSpacing: 0.5,
  },
  allocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    width: '31%',
  },
  allocationLegend: {
    width: '35%',
    paddingRight: 10,
  },
  allocationLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  allocationColorBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    marginRight: 12,
  },
  allocationLegendText: {
    flex: 1,
  },
  allocationLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  allocationValue: {
    color: '#d1d5db',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  allocationPercentage: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
  allocationChart: {
    width: '65%',
    alignItems: 'center',
  },
  selectedLegendItem: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  gradientCard: {
    backgroundColor: 'rgba(31, 41, 55, 0.7)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  gradientText: {
    color: 'white',
    backgroundImage: 'linear-gradient(to right, #22d3ee, #8b5cf6, #ec4899)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
});

export default Dashboard;