import React from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion } from 'framer-motion';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass-panel p-4 text-sm">
                <p className="font-bold text-gray-200">Position: {label}%</p>
                <p style={{ color: '#38bdf8' }}>Force: {Math.round(payload[0].value)} N</p>
            </div>
        );
    }
    return null;
};

const ForceCurveGraph = ({ data }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-6 w-full flex flex-col"
            style={{ height: '400px' }}
        >
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl text-gray-100">Force Curve Analysis</h2>
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-sky-400 opacity-50"></span>
                        <span className="text-gray-400">Your Curve</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border border-dashed border-gray-400"></span>
                        <span className="text-gray-400">Ideal (Healthy)</span>
                    </div>
                </div>
            </div>

            <div style={{ width: '100%', height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="position"
                            type="number"
                            domain={[0, 100]}
                            hide
                        />
                        <YAxis hide domain={[0, 120]} />
                        <Tooltip content={<CustomTooltip />} />

                        {/* Ideal Curve (Dashed Line) */}
                        <Line
                            type="monotone"
                            dataKey="ideal"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            isAnimationActive={false}
                        />

                        {/* Actual Curve (Filled Area) */}
                        <Area
                            type="monotone"
                            dataKey="actual"
                            stroke="#38bdf8"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorActual)"
                            isAnimationActive={false} // Disable internal animation for smoother slider drag
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="flex justify-between text-xs text-gray-500 mt-2 px-2">
                <span>CATCH (Flexion Dependent)</span>
                <span>FINISH (Extension)</span>
            </div>
        </motion.div>
    );
};

export default ForceCurveGraph;
