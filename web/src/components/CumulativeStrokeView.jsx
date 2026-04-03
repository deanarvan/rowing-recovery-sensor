import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp, Activity, RotateCw } from 'lucide-react';

const CumulativeStrokeView = ({ data, strokeCount, rollingAverage = 0, strokePeaks = [] }) => {
    // Get the latest time to anchor the scrolling window
    const maxTime = data.length > 0 ? data[data.length - 1].time : 20;
    const minTime = Math.max(0, maxTime - 20);

    // Filter data to only show the last 20 seconds
    const visibleData = data.filter(p => p.time >= minTime);

    // Calculate stroke statistics on the visible data only
    const drivePoints = visibleData.filter(p => p.phase === 'drive');
    const peakForce = drivePoints.length > 0
        ? Math.max(...drivePoints.map(p => p.actual))
        : 0;

    // Get last 5 peaks for sparkline
    const recentPeaks = strokePeaks.slice(-5);

    return (
        <div className="glass-panel" style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp size={20} style={{ color: '#818cf8' }} />
                    <span style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '14px' }}>
                        CUMULATIVE STROKE PATTERN
                    </span>
                    <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#64748b',
                        fontSize: '10px',
                        background: '#1e293b',
                        padding: '2px 6px',
                        borderRadius: '4px'
                    }}>
                        <RotateCw size={10} />
                        20s window
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px' }}>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#64748b' }}>Peak: </span>
                        <span style={{ color: '#4ade80', fontFamily: 'monospace', fontWeight: 'bold' }}>
                            {peakForce.toFixed(1)} kg
                        </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#64748b' }}>5-Stroke Avg: </span>
                        <span style={{ color: '#f59e0b', fontFamily: 'monospace', fontWeight: 'bold' }}>
                            {rollingAverage.toFixed(1)} kg
                        </span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={180}>
                <AreaChart
                    data={visibleData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                >
                    <defs>
                        <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.5} />
                            <stop offset="50%" stopColor="#38bdf8" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="time"
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={{ stroke: '#334155' }}
                        tickFormatter={(value) => `${value.toFixed(0)}s`}
                        domain={[minTime, Math.max(20, maxTime)]}
                        type="number"
                        ticks={[minTime, minTime + 5, minTime + 10, minTime + 15, Math.max(20, maxTime)]}
                    />
                    <YAxis
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={{ stroke: '#334155' }}
                        domain={[0, 110]}
                        ticks={[0, 25, 50, 75, 100]}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'rgba(30, 41, 59, 0.95)',
                            border: '1px solid #475569',
                            borderRadius: '8px',
                            fontSize: '11px'
                        }}
                        itemStyle={{ color: '#e2e8f0' }}
                        labelFormatter={(label) => `Time: ${label.toFixed(1)}s`}
                        formatter={(value, name) => {
                            if (name === 'actual') return [`${value.toFixed(1)} kg`, 'Force'];
                            return [value, name];
                        }}
                    />
                    {/* Rolling Average Line (5-stroke average of peaks) */}
                    {rollingAverage > 0 && (
                        <ReferenceLine
                            y={rollingAverage}
                            stroke="#f59e0b"
                            strokeWidth={2}
                            strokeDasharray="0"
                            label={{
                                value: `${rollingAverage.toFixed(0)}`,
                                position: 'right',
                                fill: '#f59e0b',
                                fontSize: 10,
                                fontWeight: 'bold'
                            }}
                        />
                    )}
                    <Area
                        type="monotone"
                        dataKey="actual"
                        stroke="#818cf8"
                        strokeWidth={1.5}
                        fill="url(#cumulativeGradient)"
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>

            {/* Peak History Sparkline */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '12px',
                padding: '10px 12px',
                background: '#1e293b',
                borderRadius: '8px'
            }}>
                <div style={{ color: '#64748b', fontSize: '10px' }}>
                    Last 5 Peaks:
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '30px' }}>
                    {recentPeaks.map((peak, i) => (
                        <motion.div
                            key={i}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            style={{
                                width: '20px',
                                height: `${Math.max(10, (peak / 100) * 30)}px`,
                                background: i === recentPeaks.length - 1
                                    ? 'linear-gradient(to top, #f59e0b, #fbbf24)'
                                    : 'linear-gradient(to top, #475569, #64748b)',
                                borderRadius: '3px 3px 0 0',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'center',
                                paddingTop: '2px',
                                fontSize: '7px',
                                color: i === recentPeaks.length - 1 ? '#0f172a' : '#94a3b8',
                                fontWeight: 'bold'
                            }}
                        >
                            {peak.toFixed(0)}
                        </motion.div>
                    ))}
                    {recentPeaks.length === 0 && (
                        <span style={{ color: '#475569', fontSize: '10px' }}>Waiting for strokes...</span>
                    )}
                </div>
                <div style={{
                    color: '#f59e0b',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace'
                }}>
                    AVG: {rollingAverage.toFixed(1)}
                </div>
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '20px',
                marginTop: '10px',
                fontSize: '10px',
                color: '#64748b'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={12} style={{ color: '#818cf8' }} />
                    <span>Force over time</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '16px', height: '2px', background: '#f59e0b' }} />
                    <span>5-Stroke Rolling Avg</span>
                </div>
            </div>
        </div>
    );
};

export default CumulativeStrokeView;
