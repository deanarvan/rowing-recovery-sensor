import React from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const LiveForceCurve = ({ data, strokePhase, currentPosition, plotMode = 'total' }) => {
    let leftKey = "leftForce";
    let rightKey = "rightForce";
    let leftLabel = "Left Leg";
    let rightLabel = "Right Leg";

    if (plotMode === 'heel') {
        leftKey = "leftHeel"; rightKey = "rightHeel";
        leftLabel = "Left Heel"; rightLabel = "Right Heel";
    } else if (plotMode === 'ball') {
        leftKey = "leftBall"; rightKey = "rightBall";
        leftLabel = "Left Ball"; rightLabel = "Right Ball";
    } else if (plotMode === 'toe') {
        leftKey = "leftToe"; rightKey = "rightToe";
        leftLabel = "Left Toe"; rightLabel = "Right Toe";
    }
    const phaseColors = {
        drive: '#4ade80',
        recovery: '#38bdf8',
        idle: '#64748b'
    };

    const phaseLabels = {
        drive: '💪 DRIVE PHASE',
        recovery: '⏳ RECOVERY',
        idle: '⏸️ IDLE'
    };

    return (
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
            {/* Phase Indicator */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={strokePhase}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        background: phaseColors[strokePhase] + '20',
                        border: `1px solid ${phaseColors[strokePhase]}`,
                        color: phaseColors[strokePhase],
                        fontSize: '12px',
                        fontWeight: 'bold',
                        letterSpacing: '0.05em',
                        zIndex: 10
                    }}
                >
                    {phaseLabels[strokePhase]}
                </motion.div>
            </AnimatePresence>

            {/* Progress Bar */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                width: `${strokePhase === 'drive' ? currentPosition : 0}%`,
                background: `linear-gradient(90deg, #38bdf8, #818cf8)`,
                transition: 'width 50ms linear',
                borderRadius: '0 2px 0 0'
            }} />

            {/* Live Label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <motion.div
                    animate={{ scale: strokePhase === 'drive' ? [1, 1.3, 1] : 1 }}
                    transition={{ repeat: strokePhase === 'drive' ? Infinity : 0, duration: 0.6 }}
                    style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: strokePhase === 'idle' ? '#64748b' : '#ef4444',
                        boxShadow: strokePhase !== 'idle' ? '0 0 8px #ef4444' : 'none'
                    }}
                />
                <span style={{
                    color: '#f8fafc',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    letterSpacing: '0.02em'
                }}>
                    LIVE SENSOR DATA
                </span>
            </div>

            {/* Chart Area */}
            <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data.length > 0 ? data : [{ position: 0, [leftKey]: 0, [rightKey]: 0 }]} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="liveGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4ade80" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#4ade80" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="rightGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="position"
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={{ stroke: '#334155' }}
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                    />
                    <YAxis
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={{ stroke: '#334155' }}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'rgba(30, 41, 59, 0.95)',
                            border: '1px solid #475569',
                            borderRadius: '8px',
                            fontSize: '12px'
                        }}
                        itemStyle={{ color: '#e2e8f0' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        formatter={(value, name) => {
                            if (name === leftKey) return [`${value}`, leftLabel];
                            if (name === rightKey) return [`${value}`, rightLabel];
                            return [`${value}`, name];
                        }}
                        labelFormatter={(label) => `Position: ${label}`}
                    />
                    {/* Filled areas */}
                    <Area
                        type="monotone"
                        dataKey={leftKey}
                        fill="url(#liveGradient)"
                        stroke="none"
                        isAnimationActive={false}
                    />
                    <Area
                        type="monotone"
                        dataKey={rightKey}
                        fill="url(#rightGradient)"
                        stroke="none"
                        isAnimationActive={false}
                    />
                    {/* Main lines */}
                    <Line
                        type="monotone"
                        dataKey={leftKey}
                        stroke="#4ade80"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey={rightKey}
                        stroke="#a855f7"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '20px', height: '3px', background: '#4ade80', borderRadius: '2px' }} />
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{leftLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '20px', height: '3px', background: '#a855f7', borderRadius: '2px' }} />
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{rightLabel}</span>
                </div>
            </div>
        </div>
    );
};

export default LiveForceCurve;
