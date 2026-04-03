import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { motion } from 'framer-motion';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass-panel p-2 text-xs">
                <p className="font-bold text-gray-200">Flexion: {label}%</p>
                <p style={{ color: '#4ade80' }}>Output: {payload[0].value}</p>
            </div>
        );
    }
    return null;
};

const FlexionTrendGraph = ({ data, currentFlexion }) => {
    // Find the exact data point for currentFlexion (or closest)
    const currentPoint = data.find(d => Math.abs(d.flexion - currentFlexion) < 2) || data[0];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6 w-full flex flex-col"
            style={{ height: '300px' }}
        >
            <div className="mb-4">
                <h2 className="text-lg text-gray-100 font-bold">Performance Recovery Curve</h2>
                <p className="text-xs text-gray-400">Predicted kg/s Output vs. Ankle Flexion</p>
            </div>

            <div style={{ width: '100%', height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="flexion"
                            type="number"
                            domain={[0, 100]}
                            tick={{ fill: '#64748b', fontSize: 10 }}
                            tickCount={5}
                            label={{ value: 'Ankle Flexion %', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10 }}
                        />
                        <YAxis hide domain={[0, 'auto']} />
                        <Tooltip content={<CustomTooltip />} />

                        <Area
                            type="monotone"
                            dataKey="output"
                            stroke="#4ade80"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorOutput)"
                        />

                        {/* The "You are here" marker */}
                        <ReferenceDot
                            x={currentPoint.flexion}
                            y={currentPoint.output}
                            r={6}
                            fill="#fff"
                            stroke="#4ade80"
                            strokeWidth={2}
                            isFront={true}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
};

export default FlexionTrendGraph;
