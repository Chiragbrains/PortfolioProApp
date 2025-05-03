// PortfolioGraph.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { fetchPortfolioHistory } from './stocksService'; // Assuming this correctly filters by days
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSupabaseConfig } from './SupabaseConfigContext'; // Import hook


const screenWidth = Dimensions.get('window').width;

// --- Chart Configuration Constants ---
// Adjusted for no Y-axis labels
const CHART_PADDING_LEFT = 10; // Reduced padding now that labels are gone
const CHART_PADDING_RIGHT = 16;
const Y_AXIS_LABEL_WIDTH = 0; // Set to 0 as labels are hidden
const CHART_MARGIN_VERTICAL = 10;
const CHART_HEIGHT = 220;
// --- End Chart Configuration Constants ---

const PortfolioGraph = () => {
  const [historyData, setHistoryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(90);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [chartWidth, setChartWidth] = useState(screenWidth);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showIndicator, setShowIndicator] = useState(true); // CHANGED: Set default to true to show the indicator
  const indicatorX = useRef(new Animated.Value(0)).current;
  const [selectedIndex, setSelectedIndex] = useState(null);

  const { supabaseClient } = useSupabaseConfig(); // Get client


  const getChartLayout = useCallback(() => {
    const containerPaddingHorizontal = 0;
    const effectiveChartWidth = chartWidth - (containerPaddingHorizontal * 2);
    // Use updated Y_AXIS_LABEL_WIDTH (0) in calculation
    const drawableWidth = effectiveChartWidth - CHART_PADDING_LEFT - CHART_PADDING_RIGHT - Y_AXIS_LABEL_WIDTH;
    // startX is now just the left padding
    const startX = CHART_PADDING_LEFT;
    return { drawableWidth, startX, effectiveChartWidth };
  }, [chartWidth]); // chartWidth is the dependency


  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString + 'T00:00:00');
        if (isNaN(date.getTime())) {
            console.warn("Invalid date string received:", dateString);
            return 'Invalid Date';
        }
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return 'Error Date';
    }
  };

  const updateSelectedPoint = useCallback((index) => {
    if (
        historyData &&
        historyData.originalData &&
        index >= 0 &&
        index < historyData.originalData.length
       ) {
      const dataPoint = historyData.originalData[index];
      if (dataPoint) {
        const stockValue = dataPoint.total_value || 0;
        const totalValue = stockValue;

        setSelectedPoint(prevPoint => {
            if (prevPoint?.index === index && prevPoint?.value === totalValue && prevPoint?.date === dataPoint.date) {
                return prevPoint;
            }
            return {
                value: totalValue,
                date: dataPoint.date,
                index: index,
            };
        });
      } else {
          console.warn(`Data point at index ${index} is undefined.`);
      }
    }
  }, [historyData]);

  // Make sure fetchPortfolioHistory is stable or add it to dependencies if needed
  const loadHistory = useCallback(async (days) => {
    console.log(`Loading history for ${days} days...`); // Log: Check if called
    setIsLoading(true);
    setError(null);
    // REMOVED: setShowIndicator(false); - We want indicator to stay visible
    // Reset data *before* fetching new data to ensure UI updates
    setHistoryData(null);
    setSelectedPoint(null);
  
    if (!supabaseClient) { // Guard
      setError("Supabase connection not configured.");
      setIsLoading(false);
      return;
  }

    try {
      const data = await fetchPortfolioHistory(supabaseClient, days);
      console.log(`Fetched data for ${days} days:`, data ? data.length : 0, "items"); // Log: Check fetched data

      if (data && data.length > 0) {
        // Ensure data is sorted by date
        data.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Process data *only* from the fetched result
        const labels = data.map(item => {
          const date = new Date(item.date + 'T00:00:00');
          return `${date.getMonth() + 1}/${date.getDate()}`;
        });

        const values = data.map(item => {
          const cashValue = item.cash_value || 0;
          const stockValue = item.total_value || 0;
          return stockValue + cashValue;
        });

        const newHistoryData = {
          labels: labels,
          datasets: [
            {
              data: values,
              color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
              strokeWidth: 3,
            },
          ],
          originalData: data,
        };
        console.log(`Setting new history data for ${days} days.`); // Log: Check before setting state
        setHistoryData(newHistoryData); // Update state with new data

        // Set selected point based on the *new* data
        if (values.length > 0) {
            const lastIndex = values.length - 1;
            const lastDataPoint = data[lastIndex];
            const lastCashValue = lastDataPoint.cash_value || 0;
            const lastStockValue = lastDataPoint.total_value || 0;
            setSelectedPoint({
                value: lastStockValue + lastCashValue,
                date: lastDataPoint.date,
                index: lastIndex,
            });
            
            // ADDED: Set initial indicator position at the end of the chart
            const { drawableWidth, startX } = getChartLayout();
            Animated.timing(indicatorX, {
                toValue: startX + drawableWidth,
                duration: 0,
                useNativeDriver: false,
            }).start();
        }

      } else {
        // Explicitly handle no data case after fetch
        setHistoryData(null);
        setSelectedPoint(null);
        console.log(`No data returned for ${days} days.`); // Log: Check empty data case
      }
    } catch (err) {
      console.error(`Error loading portfolio history for ${days} days:`, err);
      setError('Failed to load portfolio history.');
      // Ensure state is cleared on error too
      setHistoryData(null);
      setSelectedPoint(null);
    } finally {
      setIsLoading(false);
    }
    // Removed fetchPortfolioHistory from dependency array assuming it's a stable import
    // If fetchPortfolioHistory itself depends on component props/state, add it back.
  }, [supabaseClient, getChartLayout]); // Added getChartLayout to dependencies

  useEffect(() => {
    if (supabaseClient) {
      loadHistory(timeRange);
  }
}, [timeRange, loadHistory, supabaseClient]); // Add supabaseClient dependency

  useEffect(() => {
    if (selectedPoint) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true
      }).start();
    }
  }, [selectedPoint, fadeAnim]);

  const handleTimeRangeChange = (days) => {
    if (timeRange !== days) {
        console.log("Changing time range to:", days); // Log: Check if handler is called
        setTimeRange(days); // This state change triggers the useEffect above
    }
  };

  const updateIndicatorAndData = useCallback((touchX) => {
    if (!historyData || !historyData.datasets || historyData.datasets[0].data.length === 0) return;

    const { drawableWidth, startX, effectiveChartWidth } = getChartLayout();
    const dataPoints = historyData.datasets[0].data.length;

    console.log(`updateIndicatorAndData - touchX: ${touchX.toFixed(2)}, startX: ${startX.toFixed(2)}, drawableWidth: ${drawableWidth.toFixed(2)}, chartWidth: ${chartWidth}, effectiveChartWidth: ${effectiveChartWidth}`); // <<< ADD THIS LOG

    const clampedTouchX = Math.max(startX, Math.min(touchX, startX + drawableWidth));
    
    console.log(`updateIndicatorAndData - clampedTouchX (indicatorX): ${clampedTouchX.toFixed(2)}`); // <<< ADD THIS LOG

    Animated.timing(indicatorX, {
      toValue: clampedTouchX,
      duration: 50,
      useNativeDriver: false,
    }).start();

    let relativeX = 0;
    if (drawableWidth > 0) {
        relativeX = (clampedTouchX - startX) / drawableWidth;
    }

    let index = 0;
    if (dataPoints > 1) {
        index = Math.round(relativeX * (dataPoints - 1));
    }
    index = Math.max(0, Math.min(index, dataPoints - 1));

    updateSelectedPoint(index);

    setSelectedIndex(index);
  }, [historyData, getChartLayout, updateSelectedPoint]);

  const panGesture = Gesture.Pan()
    .onBegin((event) => {
           console.log('panGesture: onBegin - Setting showIndicator to TRUE'); // <<< LOG ADDED
           setShowIndicator(true);
           updateIndicatorAndData(event.x);
    })
    .onUpdate((event) => {
      if (showIndicator) {
          updateIndicatorAndData(event.x);
      } else {
        // This case might happen if onBegin didn't fire correctly or state update was delayed
        console.log('panGesture: onUpdate - SKIPPING update, showIndicator is FALSE'); // <<< LOG ADDED
        setShowIndicator(true); // ADDED: Force indicator to show
        updateIndicatorAndData(event.x);
      }
    })
    .onEnd(() => {
      console.log('panGesture: onEnd'); // <<< LOG ADDED
      // REMOVED: Don't hide indicator on pan end
    })
    .hitSlop({ top: -10, bottom: -10, left: -CHART_PADDING_LEFT, right: -CHART_PADDING_RIGHT });

  const composedGesture = panGesture;

  const hideInteraction = useCallback(() => {
      // CHANGED: This function now just updates the selected point to the end
      // but doesn't hide the indicator
      if (historyData && historyData.originalData && historyData.originalData.length > 0) {
          updateSelectedPoint(historyData.originalData.length - 1);
          // ADDED: Update indicator position to the end of the chart
          const { drawableWidth, startX } = getChartLayout();
          Animated.timing(indicatorX, {
            toValue: startX + drawableWidth,
            duration: 0,
            useNativeDriver: false,
          }).start();
      }
  }, [historyData, updateSelectedPoint, getChartLayout]);


  const calculateGainLoss = useCallback(() => {
    if (historyData?.datasets?.[0]?.data && selectedPoint && selectedPoint.index > 0) {
      const data = historyData.datasets[0].data;
      const index = selectedPoint.index;

      if (index < data.length) {
        const currentValue = selectedPoint.value; // This should be the stock value only
        const previousDataPoint = historyData.originalData[index - 1]; // Get the previous data point
        const previousValue = previousDataPoint ? previousDataPoint.total_value || 0 : 0; // Only use stock value

        // Log the values being used
        console.log(`  Current Value : ${currentValue}`);
        console.log(`  Previous Value : ${previousValue}`); // Compare if needed

        if (previousValue != null && previousValue !== 0) {
          const gainLoss = currentValue - previousValue;
          const percent = (gainLoss / previousValue) * 100;
          if (isFinite(gainLoss) && isFinite(percent)) {
              return { value: gainLoss, percent: percent };
          }
        }
      }
    }
    return { value: 0, percent: 0 };
  }, [historyData, selectedPoint]);

  const getGainLossColor = (value) => {
    return value >= 0 ? styles.positiveChange : styles.negativeChange;
  };

  // --- Render Logic ---

  if (isLoading) {
    // Keep loading state simple
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading Portfolio History...</Text>
      </View>
    );
  }

  // Separate check for error state
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        {/* Pass the *current* timeRange to retry */}
        <TouchableOpacity onPress={() => loadHistory(timeRange)} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Main Render ---
  // Calculate layout and gain/loss *after* checking loading/error states
  const { effectiveChartWidth } = getChartLayout();
  const gainLoss = calculateGainLoss();

  // Calculate decorator values (memoized calculation might be overkill here)
  const getDecoratorValues = () => {
      if (!selectedPoint || !historyData?.datasets?.[0]?.data) {
          return { pointY: 0 }; // Only need pointY
      }
      const data = historyData.datasets[0].data;
      const validData = data.filter(val => val !== null && val !== undefined);
      if (validData.length === 0) return { pointY: 0 };

      const minValue = Math.min(...validData);
      const maxValue = Math.max(...validData);
      const chartDrawableHeight = CHART_HEIGHT - (CHART_MARGIN_VERTICAL * 2);

      let pointY = CHART_HEIGHT - CHART_MARGIN_VERTICAL;
      if (maxValue > minValue && chartDrawableHeight > 0 && selectedPoint.value !== null) {
          const normalizedValue = (selectedPoint.value - minValue) / (maxValue - minValue);
          pointY = CHART_MARGIN_VERTICAL + chartDrawableHeight - (normalizedValue * chartDrawableHeight);
          pointY = Math.max(CHART_MARGIN_VERTICAL, Math.min(pointY, CHART_HEIGHT - CHART_MARGIN_VERTICAL));
      } else if (maxValue === minValue && chartDrawableHeight > 0) {
          pointY = CHART_MARGIN_VERTICAL + chartDrawableHeight / 2;
      }
      return { pointY };
  };
  const decoratorValues = getDecoratorValues();

  console.log('Render - showIndicator:', showIndicator); // <<< LOG ADDED

  return (
    <TouchableWithoutFeedback onPress={() => {
        console.log('TouchableWithoutFeedback: onPress triggered'); // <<< LOG ADDED (showIndicator) {
        hideInteraction();
      }}>
      <View style={styles.container}>
        {/* Header section */}
        <View style={styles.valueDisplayContainer}>
          <Animated.View style={{ opacity: fadeAnim }} key={selectedPoint?.index ?? 'initial'}>
            {selectedPoint ? (
              <>
                <Text style={styles.valueLabel}>Portfolio Value</Text>
                <Text style={styles.valueAmount}>
                  {formatCurrency(selectedPoint.value)}
                </Text>
                <Text style={styles.valueDate}>
                  {formatDate(selectedPoint.date)}
                </Text>
                {selectedPoint.index > 0 && (gainLoss.value !== 0 || gainLoss.percent !== 0) && (
                  <Text style={[styles.gainLossText, getGainLossColor(gainLoss.value)]}>
                    {gainLoss.value >= 0 ? '+' : ''}{formatCurrency(gainLoss.value)} ({gainLoss.percent >= 0 ? '+' : ''}{gainLoss.percent.toFixed(2)}%)
                  </Text>
                )}
              </>
            ) : (
              // Placeholder when no point is selected (e.g., after error or no data)
              <>
                <Text style={styles.valueLabel}>Portfolio Value</Text>
                <Text style={styles.valueAmount}>--</Text>
                <Text style={styles.valueDate}>{historyData ? 'Select a point' : 'No data available'}</Text>
              </>
            )}
          </Animated.View>
        </View>

        {/* Time range selector */}
        <View style={styles.timeRangeSelector}>
          {/* Buttons call handleTimeRangeChange */}
          <TouchableOpacity onPress={() => handleTimeRangeChange(30)} style={[styles.timeButton, timeRange === 30 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 30 && styles.activeTimeButtonText]}>1M</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => handleTimeRangeChange(90)} style={[styles.timeButton, timeRange === 90 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 90 && styles.activeTimeButtonText]}>3M</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => handleTimeRangeChange(180)} style={[styles.timeButton, timeRange === 180 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 180 && styles.activeTimeButtonText]}>6M</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => handleTimeRangeChange(365)} style={[styles.timeButton, timeRange === 365 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 365 && styles.activeTimeButtonText]}>1Y</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => handleTimeRangeChange(730)} style={[styles.timeButton, timeRange === 730 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 730 && styles.activeTimeButtonText]}>2Y</Text></TouchableOpacity>
        </View>

        {/* Chart section */}
        {/* Conditionally render chart or empty state based on historyData */}
        {historyData && historyData.datasets && historyData.datasets[0].data.length > 0 ? (
          <GestureDetector gesture={composedGesture}>
            <View style={styles.chartOuterContainer}>
              <LineChart
                data={historyData} // Use the state variable directly
                width={effectiveChartWidth} // Use calculated width
                height={CHART_HEIGHT}
                // yAxisLabel="$" // REMOVED
                yAxisSuffix=""
                withInnerLines={false}
                withOuterLines={false}
                withVerticalLines={false}
                withHorizontalLines={true} // Keep horizontal grid lines
                // withHorizontalLabels={false} // Alternative way to hide labels, but formatYLabel is safer
                horizontalLabelRotation={0}
                chartConfig={{
                  backgroundColor: 'white',
                  backgroundGradientFrom: 'white',
                  backgroundGradientTo: 'white',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
                  labelColor: (opacity = 0.6) => `rgba(102, 102, 102, ${opacity})`, // X-axis label color
                  propsForBackgroundLines: {
                    strokeDasharray: '',
                    strokeWidth: 0.5,
                    stroke: '#ebebeb',
                  },
                  propsForDots: {
                    r: showIndicator ? "0" : "3",
                    strokeWidth: "0",
                  },
                  propsForLabels: { // Style for X-axis labels
                    fontSize: 10,
                    fontWeight: '400',
                  },
                  formatYLabel: () => '', // HIDE Y-Axis Labels
                  yAxisLabelWidth: Y_AXIS_LABEL_WIDTH, // Use constant (0)
                  style: {
                       marginVertical: 0,
                  }
                }}
                bezier
                style={styles.chart} // Contains paddingLeft, paddingRight
                decorator={() => {
                  if (!selectedPoint) return null;
                  const { pointY } = decoratorValues;
                  return (
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      {/* Vertical bar */}
                      <Animated.View
                        style={[
                          styles.decoratorLine,
                          { left: indicatorX }
                        ]}
                      />
                      {/* Dot */}
                      <Animated.View
                        style={[
                          styles.decoratorDot,
                          { top: pointY - 7, left: Animated.subtract(indicatorX, 7) }
                        ]}
                      />
                    </View>
                  );
                }}
              />
            </View>
          </GestureDetector>
        ) : (
          // Show empty state if historyData is null or empty after loading/error checks
          <View style={[styles.chartOuterContainer, styles.centered, { height: CHART_HEIGHT }]}>
              <Text style={styles.emptyText}>No historical data for this period</Text>
              <Text style={styles.emptySubText}>Portfolio snapshots are generated daily</Text>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  // (Keep existing styles, but add decorator styles)
  container: {
    flex: 1,
    backgroundColor: 'white',
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  valueDisplayContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 105,
    justifyContent: 'center',
  },
  valueLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  valueAmount: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
    lineHeight: 34,
  },
  valueDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  gainLossText: {
    fontSize: 15,
    fontWeight: '500',
  },
  chartOuterContainer: {
    // backgroundColor: '#fafafa', // Optional: for debugging layout
  },
  chart: {
    paddingRight: CHART_PADDING_RIGHT,
    paddingLeft: CHART_PADDING_LEFT, // Use updated constant
  },
  timeRangeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  activeTimeButton: {
    backgroundColor: '#1565C0',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  timeButtonText: {
    color: '#333',
    fontWeight: '500',
    fontSize: 13,
  },
  activeTimeButtonText: {
    color: 'white',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorText: {
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 15,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 5,
  },
  emptySubText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1565C0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  positiveChange: {
    color: '#4CAF50',
  },
  negativeChange: {
    color: '#D32F2F',
  },
  // Styles for Decorator elements
  decoratorLine: {
    position: 'absolute',
    top: CHART_MARGIN_VERTICAL,
    bottom: CHART_MARGIN_VERTICAL,
    width: 2,
    backgroundColor: '#1976D2', // Modern blue
    borderRadius: 1,
    opacity: 0.7,
  },
  decoratorDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#1976D2',
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default PortfolioGraph;