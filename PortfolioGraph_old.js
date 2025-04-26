// PortfolioGraph.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Dimensions, StyleSheet, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { fetchPortfolioHistory } from './stocksService';

const screenWidth = Dimensions.get('window').width;

const PortfolioGraph = () => {
  const [historyData, setHistoryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(90); // Default to 90 days
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [chartWidth, setChartWidth] = useState(screenWidth); // Set to screen width
  const [indicatorPosition, setIndicatorPosition] = useState(null); // For vertical indicator
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const loadHistory = async (days) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPortfolioHistory(days);

      if (data && data.length > 0) {
        const labels = data.map(item => {
          const date = new Date(item.date + 'T00:00:00');
          return `${date.getMonth() + 1}/${date.getDate()}`;
        });

        // Include cash value in total value
        const values = data.map(item => {
          const cashValue = item.cash_value || 0;
          const stockValue = item.total_value || 0;
          return stockValue + cashValue;
        });
        
        // Set default selected point to the most recent data point
        setSelectedPoint({
          value: values[values.length - 1],
          date: data[data.length - 1].date,
          index: values.length - 1
        });

        setHistoryData({
          labels: labels,
          datasets: [
            {
              data: values,
              color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`, // Deeper blue for modern look
              strokeWidth: 3,
            },
          ],
          originalData: data, // Keep the original data for reference
        });
      } else {
        setHistoryData(null);
      }
    } catch (err) {
      console.error("Error loading portfolio history:", err);
      setError('Failed to load portfolio history.');
      setHistoryData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(timeRange);
  }, [timeRange]);

  // Animate the value display when it changes
  useEffect(() => {
    if (selectedPoint) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false // Changed to false to avoid native driver errors
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false // Changed to false to avoid native driver errors
        })
      ]).start();
    }
  }, [selectedPoint]);

  const handleTimeRangeChange = (days) => {
    setTimeRange(days);
    setSelectedPoint(null); // Clear selected point when changing time range
  };

  const handleDataPointClick = ({ value, index }) => {
    if (historyData && historyData.originalData && historyData.originalData[index]) {
      const dataPoint = historyData.originalData[index];
      const cashValue = dataPoint.cash_value || 0;
      const stockValue = dataPoint.total_value || 0;
      const totalValue = stockValue + cashValue;

      setSelectedPoint({
        value: totalValue,
        date: dataPoint.date,
        index: index
      });
      setIndicatorPosition(index); // Set the position for the vertical indicator
    }
  };

  const calculateGainLoss = () => {
    if (historyData && selectedPoint) {
      const index = selectedPoint.index;
      if (index > 0) {
        const previousValue = historyData.datasets[0].data[index - 1];
        const gainLoss = selectedPoint.value - previousValue;
        return {
          value: gainLoss,
          percent: (gainLoss / previousValue) * 100
        };
      }
    }
    return { value: 0, percent: 0 };
  };

  const getGainLossColor = (value) => {
    return value >= 0 ? styles.positiveChange : styles.negativeChange;
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading Portfolio History...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => loadHistory(timeRange)} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!historyData || historyData.datasets[0].data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No historical data available</Text>
        <Text style={styles.emptySubText}>Portfolio snapshots are generated daily</Text>
      </View>
    );
  }

  const gainLoss = calculateGainLoss();

  return (
    <View style={styles.container}>
      {/* Header section with portfolio value and date */}
      <View style={styles.valueDisplayContainer}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {selectedPoint && (
            <>
              <Text style={styles.valueLabel}>Portfolio Value</Text>
              <Text style={styles.valueAmount}>
                {formatCurrency(selectedPoint.value)}
              </Text>
              <Text style={styles.valueDate}>
                {formatDate(selectedPoint.date)}
              </Text>
              {selectedPoint.index > 0 && (
                <Text style={[styles.gainLossText, getGainLossColor(gainLoss.value)]}>
                  Gain/Loss: {formatCurrency(gainLoss.value)} ({gainLoss.percent.toFixed(2)}%)
                </Text>
              )}
            </>
          )}
        </Animated.View>
      </View>

      {/* Time range selector */}
      <View style={styles.timeRangeSelector}>
        <TouchableOpacity 
          onPress={() => handleTimeRangeChange(30)} 
          style={[styles.timeButton, timeRange === 30 && styles.activeTimeButton]}>
          <Text style={[styles.timeButtonText, timeRange === 30 && styles.activeTimeButtonText]}>1M</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => handleTimeRangeChange(90)} 
          style={[styles.timeButton, timeRange === 90 && styles.activeTimeButton]}>
          <Text style={[styles.timeButtonText, timeRange === 90 && styles.activeTimeButtonText]}>3M</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => handleTimeRangeChange(180)} 
          style={[styles.timeButton, timeRange === 180 && styles.activeTimeButton]}>
          <Text style={[styles.timeButtonText, timeRange === 180 && styles.activeTimeButtonText]}>6M</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => handleTimeRangeChange(365)} 
          style={[styles.timeButton, timeRange === 365 && styles.activeTimeButton]}>
          <Text style={[styles.timeButtonText, timeRange === 365 && styles.activeTimeButtonText]}>1Y</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => handleTimeRangeChange(730)} 
          style={[styles.timeButton, timeRange === 730 && styles.activeTimeButton]}>
          <Text style={[styles.timeButtonText, timeRange === 730 && styles.activeTimeButtonText]}>2Y</Text>
        </TouchableOpacity>
      </View>

      {/* Static chart section */}
      <View style={styles.chartContainer}>
        <LineChart
          data={historyData}
          width={chartWidth}
          height={220}
          yAxisLabel=""
          withInnerLines={false}
          withOuterLines={false}
          withVerticalLines={false}
          withHorizontalLines={true}
          horizontalLabelRotation={0}
          chartConfig={{
            backgroundColor: 'white',
            backgroundGradientFrom: 'white',
            backgroundGradientTo: 'white',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
            labelColor: (opacity = 0.5) => `rgba(102, 102, 102, ${opacity})`,
            style: {
              borderRadius: 0,
              marginVertical: 10, // Add margin for better spacing
            },
            propsForBackgroundLines: {
              strokeDasharray: '', // solid line
              strokeWidth: 0.5,
              stroke: '#ebebeb',
            },
            propsForDots: {
              r: selectedPoint ? "0" : "3",
              strokeWidth: "2",
              stroke: "#1565C0",
              fill: 'white'
            },
            propsForLabels: {
              fontSize: 10,
              fontWeight: '400',
            },
            formatYLabel: (yValue) => {
              const num = parseFloat(yValue);
              if (num >= 1000000) {
                return `$${(num / 1000000).toFixed(1)}M`;
              } else if (num >= 1000) {
                return `$${(num / 1000).toFixed(0)}K`;
              }
              return `$${num.toFixed(0)}`;
            },
            yAxisLabelWidth: 60,
            yLabelsOffset: 10
          }}
          bezier
          style={styles.chart}
          onDataPointClick={handleDataPointClick}
        />
        {/* Vertical Indicator */}
        {indicatorPosition !== null && (
          <View
            style={{
              position: 'absolute',
              left: (chartWidth / historyData.labels.length) * indicatorPosition,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: '#1565C0',
            }}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    paddingTop: 16,
    paddingBottom: 20,
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
    minHeight: 90,
  },
  valueLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  valueAmount: {
    fontSize: 26,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  valueDate: {
    fontSize: 14,
    color: '#666',
  },
  gainLossText: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartContainer: {
    backgroundColor: 'white',
    marginVertical: 16,
    borderRadius: 0,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  scrollContentContainer: {
    paddingRight: 16,
  },
  chart: {
    borderRadius: 0,
    paddingRight: 16,
    paddingTop: 16,
    paddingLeft: 10, // Add padding for y-axis labels
  },
  timeRangeSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 10,
  },
  timeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#f5f5f5',
  },
  activeTimeButton: {
    backgroundColor: '#1565C0',
  },
  timeButtonText: {
    color: '#666',
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
  },
  emptySubText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
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
});

export default PortfolioGraph;