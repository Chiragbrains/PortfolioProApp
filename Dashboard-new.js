import React, { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, BarChart3, Target, Zap, Users, DollarSign, Activity, Eye } from 'lucide-react';

const ModernDashboard = () => {
  const [activeChart, setActiveChart] = useState('growth');
  const [hoveredMetric, setHoveredMetric] = useState(null);

  // Sample datasets
  const growthData = [
    { month: 'Jan', users: 2400, revenue: 45000, engagement: 78 },
    { month: 'Feb', users: 3200, revenue: 52000, engagement: 82 },
    { month: 'Mar', users: 2800, revenue: 48000, engagement: 75 },
    { month: 'Apr', users: 4100, revenue: 61000, engagement: 88 },
    { month: 'May', users: 3600, revenue: 55000, engagement: 85 },
    { month: 'Jun', users: 4800, revenue: 67000, engagement: 92 },
    { month: 'Jul', users: 5200, revenue: 72000, engagement: 89 },
    { month: 'Aug', users: 4900, revenue: 69000, engagement: 86 },
    { month: 'Sep', users: 6100, revenue: 78000, engagement: 94 },
    { month: 'Oct', users: 6800, revenue: 85000, engagement: 91 },
    { month: 'Nov', users: 7200, revenue: 92000, engagement: 96 },
    { month: 'Dec', users: 8100, revenue: 98000, engagement: 98 }
  ];

  const categoryData = [
    { category: 'Technology', value: 45, growth: 23, color: '#8b5cf6' },
    { category: 'Healthcare', value: 35, growth: 18, color: '#06b6d4' },
    { category: 'Finance', value: 28, growth: 12, color: '#10b981' },
    { category: 'Education', value: 22, growth: 15, color: '#f59e0b' },
    { category: 'Retail', value: 18, growth: 8, color: '#ef4444' },
    { category: 'Manufacturing', value: 15, growth: 5, color: '#8b5a2b' }
  ];

  const performanceData = [
    { subject: 'Speed', A: 120, fullMark: 150 },
    { subject: 'Reliability', A: 98, fullMark: 150 },
    { subject: 'Security', A: 86, fullMark: 150 },
    { subject: 'Usability', A: 99, fullMark: 150 },
    { subject: 'Scalability', A: 85, fullMark: 150 },
    { subject: 'Innovation', A: 110, fullMark: 150 }
  ];

  const regionData = [
    { name: 'North America', value: 35, color: '#8b5cf6' },
    { name: 'Europe', value: 28, color: '#06b6d4' },
    { name: 'Asia Pacific', value: 25, color: '#10b981' },
    { name: 'Latin America', value: 8, color: '#f59e0b' },
    { name: 'Middle East', value: 4, color: '#ef4444' }
  ];

  const metrics = [
    { title: 'Total Revenue', value: '$2.4M', change: '+12.5%', icon: DollarSign, positive: true },
    { title: 'Active Users', value: '48.2K', change: '+18.2%', icon: Users, positive: true },
    { title: 'Conversion Rate', value: '3.24%', change: '+5.1%', icon: Target, positive: true },
    { title: 'Page Views', value: '1.2M', change: '-2.3%', icon: Eye, positive: false }
  ];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900/95 backdrop-blur-xl p-4 rounded-2xl border border-gray-700/50 shadow-2xl">
          <p className="text-white font-semibold mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center space-x-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-300 text-sm">
                {entry.name}: <span className="text-white font-medium">{entry.value?.toLocaleString()}</span>
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const chartContainerClass = "transition-all duration-500 ease-out transform";
    
    switch (activeChart) {
      case 'growth':
        return (
          <div className={chartContainerClass}>
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={growthData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af" 
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="users" 
                  stroke="#8b5cf6" 
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 8, stroke: '#8b5cf6', strokeWidth: 2, fill: '#8b5cf6' }}
                  name="Users"
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#06b6d4" 
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 8, stroke: '#06b6d4', strokeWidth: 2, fill: '#06b6d4' }}
                  name="Revenue ($)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'categories':
        return (
          <div className={chartContainerClass}>
            <ResponsiveContainer width="100%" height={450}>
              <BarChart data={categoryData} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="category" 
                  stroke="#9ca3af" 
                  fontSize={12}
                  angle={-35}
                  textAnchor="end"
                  height={100}
                  interval={0}
                  minTickGap={5}
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} name="Market Share (%)">
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'performance':
        return (
          <div className={`${chartContainerClass} flex justify-center`}>
            <ResponsiveContainer width="100%" height={450}>
              <RadarChart data={performanceData} margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <PolarRadiusAxis 
                  angle={30} 
                  domain={[0, 150]} 
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name="Performance Score"
                  dataKey="A"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.3}
                  strokeWidth={3}
                  dot={false}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'regions':
        return (
          <div className={`${chartContainerClass} flex justify-center`}>
            <ResponsiveContainer width="100%" height={450}>
              <PieChart>
                <Pie
                  data={regionData}
                  cx="50%"
                  cy="50%"
                  outerRadius={140}
                  innerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {regionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
            Analytics Hub
          </h1>
          <p className="text-gray-400 text-lg">Interactive data visualization dashboard</p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <div
                key={index}
                className="group relative bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl rounded-3xl p-6 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:scale-105 cursor-pointer"
                onMouseEnter={() => setHoveredMetric(index)}
                onMouseLeave={() => setHoveredMetric(null)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-cyan-600/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-2xl">
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      metric.positive 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {metric.change}
                    </span>
                  </div>
                  <h3 className="text-gray-300 text-sm font-medium mb-2">{metric.title}</h3>
                  <p className="text-white text-3xl font-bold">{metric.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart Navigation */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {[
            { key: 'growth', label: 'Growth Trends', icon: TrendingUp, color: 'from-purple-600 to-purple-700' },
            { key: 'categories', label: 'Categories', icon: BarChart3, color: 'from-cyan-600 to-cyan-700' },
            { key: 'performance', label: 'Performance', icon: Zap, color: 'from-emerald-600 to-emerald-700' },
            { key: 'regions', label: 'Regions', icon: Target, color: 'from-orange-600 to-orange-700' }
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.key}
                onClick={() => setActiveChart(btn.key)}
                className={`group flex items-center space-x-3 px-8 py-4 rounded-2xl font-semibold transition-all duration-300 ${
                  activeChart === btn.key
                    ? `bg-gradient-to-r ${btn.color} text-white shadow-2xl scale-105`
                    : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white hover:scale-105'
                } backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50`}
              >
                <Icon className="h-5 w-5 group-hover:rotate-12 transition-transform duration-300" />
                <span>{btn.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Chart Container */}
        <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-xl rounded-3xl p-8 border border-gray-700/50 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white mb-2">
              {activeChart === 'growth' && 'User Growth & Revenue Trends'}
              {activeChart === 'categories' && 'Market Share by Category'}
              {activeChart === 'performance' && 'Performance Radar Analysis'}
              {activeChart === 'regions' && 'Regional Distribution'}
            </h2>
            <p className="text-gray-400">
              {activeChart === 'growth' && 'Track user acquisition and revenue growth over time'}
              {activeChart === 'categories' && 'Compare market share across different business categories'}
              {activeChart === 'performance' && 'Multi-dimensional performance evaluation'}
              {activeChart === 'regions' && 'Geographic breakdown of user distribution'}
            </p>
          </div>
          
          <div className="relative">
            {renderChart()}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-gray-500">
            Built with modern web technologies • Interactive data visualization
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModernDashboard;