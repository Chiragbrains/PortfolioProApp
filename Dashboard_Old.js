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
import { LineChart, PieChart, BarChart } from 'react-native-gifted-charts';
import { useSupabaseConfig } from './SupabaseConfigContext';
// Conceptual data fetching functions - you'll need to implement these
// import { fetchDashboardKpiData, fetchPortfolioValueHistory, fetchDailyPnlHistory, fetchAssetAllocation } from './stocksService';

const screenWidth = Dimensions.get('window').width;

const Dashboard = () => {
  const { supabaseClient } = useSupabaseConfig();

  const [activeChartType, setActiveChartType] = useState('valueTrend'); // 'valueTrend', 'dailyPnl', 'allocation'
  const [selectedTimeRange, setSelectedTimeRange] = useState(90); // Default to 3M for line/bar charts

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
      // const data = await fetchDashboardKpiData(supabaseClient);
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network delay
      setKpiData({
        totalPortfolioValue: Math.random() * 250000 + 75000,
        overallPnlDollar: (Math.random() - 0.4) * 15000,
        overallPnlPercent: (Math.random() - 0.4) * 12,
        todayPnlDollar: (Math.random() - 0.5) * 2000,
        todayPnlPercent: (Math.random() - 0.5) * 2,
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
      await new Promise(resolve => setTimeout(resolve, 1200)); // Simulate network delay
      let data;
      if (chartType === 'valueTrend') {
        // data = await fetchPortfolioValueHistory(supabaseClient, timeRangeDays);
        data = Array.from({ length: timeRangeDays }, (_, i) => ({
          value: 100000 + Math.sin(i / (timeRangeDays / 20)) * 10000 + Math.random() * 5000 - (timeRangeDays * 10) + (i * (15000 / timeRangeDays)),
          label: `${i + 1}`, // gifted-charts needs label for LineChart points if showing labels
          date: new Date(new Date().setDate(new Date().getDate() - timeRangeDays + i + 1)).toISOString().split('T')[0]
        }));
      } else if (chartType === 'dailyPnl') {
        // data = await fetchDailyPnlHistory(supabaseClient, timeRangeDays);
        data = Array.from({ length: timeRangeDays }, (_, i) => ({
          value: (Math.random() - 0.45) * (500 + (timeRangeDays / 30 * 150)),
          label: `${i + 1}`,
          frontColor: (Math.random() - 0.45) * 200 >= 0 ? '#10b981' : '#ef4444', // For BarChart
          date: new Date(new Date().setDate(new Date().getDate() - timeRangeDays + i + 1)).toISOString().split('T')[0]
        }));
      } else if (chartType === 'allocation') {
        // data = await fetchAssetAllocation(supabaseClient);
        const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];
        const assets = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'NVDA'];
        data = assets.slice(0, Math.floor(Math.random()*3)+3).map((asset, i) => ({
          value: Math.random() * 30 + 10,
          text: `${asset}`, // For PieChart, 'text' is often used for the label on the slice
          color: colors[i % colors.length],
          // focused: i === 0 // Example: focus the first slice
        }));
      }
      setChartData(data);
    } catch (err) {
      console.error(`Error loading ${chartType} data:`, err);
      setChartError(`Failed to load ${chartType.replace(/([A-Z])/g, ' $1').toLowerCase()} data.`);
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

  // --- Render Functions ---
  const renderKpiCards = () => {
    if (isLoadingKpis) return <ActivityIndicator color="#8b5cf6" style={{ marginVertical: 20 }} />;
    if (kpiError) return <Text style={styles.errorText}>{kpiError}</Text>;
    if (!kpiData) return <Text style={styles.emptyText}>No summary data available.</Text>;

    const kpis = [
      { label: 'Total Portfolio Value', value: formatCurrency(kpiData.totalPortfolioValue), large: true },
      { label: "Today's P&L", value: formatCurrency(kpiData.todayPnlDollar, true), subValue: `(${kpiData.todayPnlPercent >= 0 ? '+' : ''}${kpiData.todayPnlPercent?.toFixed(2)}%)`, valueColor: getPnlColor(kpiData.todayPnlDollar) },
      { label: 'Overall P&L', value: formatCurrency(kpiData.overallPnlDollar, true), subValue: `(${kpiData.overallPnlPercent >= 0 ? '+' : ''}${kpiData.overallPnlPercent?.toFixed(2)}%)`, valueColor: getPnlColor(kpiData.overallPnlDollar) },
      // Add more KPIs if needed, e.g., Best/Worst Performer
    ];

    return (
      <View style={styles.kpiContainer}>
        {kpis.map((kpi, index) => (
          <View key={index} style={[styles.kpiCard, kpi.large && styles.kpiCardLarge, index % 2 !== 0 && !kpi.large && { marginLeft: 10 }, index >= 2 && !kpi.large && { marginTop: 10 } ]}>
            <Text style={styles.kpiLabel}>{kpi.label}</Text>
            <Text style={[kpi.large ? styles.kpiValueLarge : styles.kpiValue, kpi.valueColor]}>{kpi.value}</Text>
            {kpi.subValue && <Text style={[styles.kpiSubValue, kpi.valueColor]}>{kpi.subValue}</Text>}
          </View>
        ))}
      </View>
    );
  };

  const renderChartNavigation = () => {
    const navItems = [
      { type: 'valueTrend', label: 'Value Trend' },
      { type: 'dailyPnl', label: 'Daily P&L' },
      { type: 'allocation', label: 'Allocation' },
    ];
    return (
      <View style={styles.chartNavContainer}>
        {navItems.map(item => (
          <TouchableOpacity
            key={item.type}
            style={[styles.chartNavButton, activeChartType === item.type && styles.activeChartNavButton]}
            onPress={() => handleChartTypeChange(item.type)}
          >
            <Text style={[styles.chartNavButtonText, activeChartType === item.type && styles.activeChartNavButtonText]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
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
    if (isLoadingChart) return <ActivityIndicator color="#8b5cf6" style={{ height: 300, justifyContent: 'center' }} />;
    if (chartError) return <Text style={[styles.errorText, { height: 300, textAlignVertical: 'center' }]}>{chartError}</Text>;
    if (!chartData || chartData.length === 0) return <Text style={[styles.emptyText, { height: 300, textAlignVertical: 'center' }]}>No data available for this view.</Text>;

    const commonLineChartProps = {
      data: chartData,
      height: 280,
      width: screenWidth - 60, // Adjust based on padding
      color: '#9ca3af', // Default axis/label color
      textColor: '#9ca3af',
      // xAxisLabelTextStyle: { color: '#9ca3af', fontSize: 10 },
      // yAxisLabelTextStyle: { color: '#9ca3af', fontSize: 10 },
      // yAxisTextStyle: { color: '#9ca3af', fontSize: 10 },
      // xAxisTextStyle: { color: '#9ca3af', fontSize: 10 },
      rulesColor: '#374151',
      rulesType: 'dashed',
      // showXAxisIndices: true,
      // xAxisIndicesColor: '#9ca3af',
      // xAxisIndicesWidth: 1,
      // xAxisIndicesHeight: 5,
      // hideRules: false,
      // showVerticalLines: true,
      // verticalLinesColor: '#374151',
      noOfSections: 4,
      // yAxisLabelWidth: 40,
      // formatYLabel: (label) => `$${Math.round(parseFloat(label) / 1000)}k`,
      // pointerConfig for interactivity
      pointerConfig: {
        pointerStripHeight: 280,
        pointerStripColor: 'lightgray',
        pointerStripWidth: 2,
        pointerColor: 'lightgray',
        radius: 6,
        pointerLabelWidth: 100,
        pointerLabelHeight: 90,
        activatePointersOnLongPress: true,
        autoAdjustPointerLabelPosition: false,
        pointerLabelComponent: items => {
          if (!items || !items[0] || !items[0].date) {
            return null;
          }
          const item = items[0];
          const date = new Date(item.date + 'T00:00:00');
          return (
            <View style={styles.tooltipContainer}>
              <Text style={styles.tooltipDate}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              <Text style={styles.tooltipValue}>{activeChartType === 'valueTrend' ? formatCurrency(item.value) : formatCurrency(item.value, true)}</Text>
            </View>
          );
        },
      },
    };

    switch (activeChartType) {
      case 'valueTrend':
        return (
          <LineChart
            {...commonLineChartProps}
            areaChart
            curved
            data={chartData.map(d => ({...d, dataPointText: formatCurrency(d.value)}))} // Add dataPointText for labels on points
            // dataPointsShape={'circular'}
            // dataPointsWidth={6}
            // dataPointsHeight={6}
            // dataPointsColor={'#8b5cf6'}
            // dataPointsRadius={3}
            // textFontSize={10}
            // textColor1="#8b5cf6"
            startFillColor="rgba(139, 92, 246, 0.3)"
            endFillColor="rgba(139, 92, 246, 0.05)"
            startOpacity={0.3}
            endOpacity={0.05}
            color1="#8b5cf6" // Line color
            // hideDataPoint
            // showValuesAsDataPointsText
            // dataPointsTextSize={10}
            // dataPointsColor={'#8b5cf6'}
            // dataPointLabelShiftY={-15}
            // dataPointLabelShiftX={0}
            // dataPointLabelColor={'#FFF'}
            initialSpacing={10}
            spacing={ (screenWidth - 80) / (chartData.length > 1 ? chartData.length -1 : 1) } // Dynamic spacing
            thickness={3}
            yAxisLabelSuffix=" " // Add a space to prevent clipping
            yAxisThickness={0}
            xAxisThickness={0}
            // yAxisTextStyle={{color: '#9ca3af'}}
            // xAxisLabelTexts={chartData.map(d => new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short'}))}
            // For gifted charts, labels are often part of the data object itself
            // We might need to process `chartData` to include `label` fields for X-axis
            // gifted-charts might also have specific props for X-axis labels like `xAxisLabelTexts`
            // For Y-axis, it might auto-calculate or use `yAxisLabelTexts`
            // Check gifted-charts docs for precise axis label configuration
          />
        );
      case 'dailyPnl':
        return (
          <BarChart
            {...commonLineChartProps} // Some props might not apply or need adjustment for BarChart
            barWidth={Math.max(5, (screenWidth - 120) / chartData.length * 0.6)}
            barBorderRadius={4}
            frontColor="lightgray" // Default, will be overridden by item.frontColor
            data={chartData.map(d => ({...d, topLabelComponent: () => <Text style={{color: d.value >= 0 ? '#10b981' : '#ef4444', fontSize: 8, width: 30, textAlign: 'center'}}>{formatCurrency(d.value).replace('$', '')}</Text>}))}
            // yAxisLabelTexts={['-$1k', '$0', '$1k', '$2k']} // Example, adjust based on data range
            // xAxisLabelTexts={chartData.map(d => new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric'}))}
            // renderTooltip
            spacing={ (screenWidth - 80) / (chartData.length > 1 ? chartData.length : 1) * 0.4 } // Dynamic spacing
            initialSpacing={10}
            yAxisThickness={0}
            xAxisThickness={0}
            // yAxisTextStyle={{color: '#9ca3af'}}
          />
        );
      case 'allocation':
        return (
          <View style={{ alignItems: 'flex-start', paddingVertical: 20, paddingLeft: 20 }}>
            <PieChart
              data={chartData}
              donut // Make it a donut chart
              showText // Show text labels on slices
              textColor="white"
              radius={Math.min(screenWidth / 3, 130)}
              innerRadius={Math.min(screenWidth / 6, 65)}
              textSize={10}
              // showTextBackground
              // textBackgroundColor="black"
              // textBackgroundRadius={10}
              focusOnPress
              // toggleFocusOnPress // If you want to toggle focus
              // strokeColor="white" // Border for slices
              // strokeWidth={2}
              // sectionAutoFocus // Auto focus the largest section
              centerLabelComponent={() => (
                <View style={{justifyContent: 'center', alignItems: 'center'}}>
                  <Text style={{fontSize: 18, color: 'white', fontWeight: 'bold'}}>Assets</Text>
                </View>
              )}
            />
            <View style={styles.legendContainer}>
              {chartData.map(item => (
                <View key={item.text} style={styles.legendItem}>
                  <View style={[styles.legendColorBox, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.text} ({item.value.toFixed(1)}%)</Text>
                </View>
              ))}
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} scrollIndicatorInsets={{ right: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Portfolio Dashboard</Text>
      </View>

      {renderKpiCards()}

      {renderChartNavigation()}

      <View style={styles.chartDisplayContainer}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>
            {activeChartType === 'valueTrend' && 'Portfolio Value Over Time'}
            {activeChartType === 'dailyPnl' && 'Daily Profit & Loss'}
            {activeChartType === 'allocation' && 'Asset Allocation'}
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
    color: 'white', // Text color for dark theme
    // For gradient text, you might need a library or a more complex approach
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
    width: '100%', // Full width for the large KPI card
    minHeight: 120,
    marginBottom: 15,
  },
  kpiLabel: {
    fontSize: 13,
    color: '#9ca3af', // text-gray-400
    marginBottom: 5,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  kpiValueLarge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  kpiSubValue: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 3,
  },
  // Chart Navigation
  chartNavContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10, // Similar to gap-4
    marginBottom: 20,
  },
  chartNavButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12, // rounded-xl
    backgroundColor: 'rgba(55, 65, 81, 0.9)', // bg-gray-700
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
    backgroundColor: 'rgba(17, 24, 39, 0.9)', // bg-gray-900 with opacity
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8, // rounded-xl
    borderWidth: 1,
    borderColor: '#374151', // border-gray-700
  },
  tooltipDate: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 3,
  },
  tooltipValue: {
    color: '#d1d5db', // text-gray-300
    fontSize: 14,
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
});

export default Dashboard;