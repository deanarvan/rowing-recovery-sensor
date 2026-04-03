import React from 'react';
import { motion } from 'framer-motion';
import { Footprints, ArrowDownToLine, ArrowUpToLine } from 'lucide-react';

const BalanceBoardView = ({ instantaneousData }) => {
    // Safety check in case it's strictly empty
    const data = instantaneousData || {
        leftForce: 0, rightForce: 0,
        leftRaw: { heel: 0, ball: 0, toe: 0 },
        rightRaw: { heel: 0, ball: 0, toe: 0 }
    };

    const left = data.leftForce;
    const right = data.rightForce;
    const total = left + right;

    // Left/Right Percentages
    const leftPct = total > 0 ? Math.round((left / total) * 100) : 50;
    const rightPct = total > 0 ? Math.round((right / total) * 100) : 50;

    // Helper to calculate front/back bias per foot
    const getBias = (rawObj) => {
        const heel = rawObj.heel;
        const front = rawObj.ball + rawObj.toe;
        const subtotal = heel + front;
        if (subtotal === 0) return { frontPct: 50, heelPct: 50 };
        return {
            frontPct: Math.round((front / subtotal) * 100),
            heelPct: Math.round((heel / subtotal) * 100)
        };
    };

    const leftBias = getBias(data.leftRaw);
    const rightBias = getBias(data.rightRaw);

    // Center of Pressure calculation for the 2D plane mapping
    // X axis: -100 (Full Left) to +100 (Full Right)
    // Y axis: -100 (Full Heel) to +100 (Full Toes)
    const copX = total > 0 ? ((right - left) / total) * 100 : 0;

    // Calculate global Y COP combining both feet
    const totalFront = data.leftRaw.ball + data.leftRaw.toe + data.rightRaw.ball + data.rightRaw.toe;
    const totalHeel = data.leftRaw.heel + data.rightRaw.heel;
    const copY = total > 0 ? ((totalFront - totalHeel) / total) * 100 : 0;

    // Clamping for the visual dot to stay within bounds nicely
    const safeX = Math.max(-100, Math.min(100, copX));
    // Invert Y for CSS (negative is UP in our visual mapping, positive is DOWN)
    const safeY = Math.max(-100, Math.min(100, copY * -1));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Top Row: Foot Bias Panels + Total Load */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Left Foot Bias */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ margin: 0, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                            <Footprints size={16} /> Left Foot
                        </h4>
                        <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', color: '#4ade80' }}>{leftPct}%</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e2e8f0', marginBottom: '4px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowUpToLine size={12} /> Forefoot</span>
                                <span>{leftBias.frontPct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                                <motion.div animate={{ width: `${leftBias.frontPct}%` }} transition={{ duration: 0.1 }} style={{ background: '#4ade80', height: '100%' }} />
                            </div>
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e2e8f0', marginBottom: '4px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} /> Heel</span>
                                <span>{leftBias.heelPct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                                <motion.div animate={{ width: `${leftBias.heelPct}%` }} transition={{ duration: 0.1 }} style={{ background: '#22c55e', height: '100%' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Foot Bias */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ margin: 0, color: '#a855f7', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                            <Footprints size={16} /> Right Foot
                        </h4>
                        <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', color: '#a855f7' }}>{rightPct}%</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e2e8f0', marginBottom: '4px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowUpToLine size={12} /> Forefoot</span>
                                <span>{rightBias.frontPct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                                <motion.div animate={{ width: `${rightBias.frontPct}%` }} transition={{ duration: 0.1 }} style={{ background: '#a855f7', height: '100%' }} />
                            </div>
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e2e8f0', marginBottom: '4px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} /> Heel</span>
                                <span>{rightBias.heelPct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                                <motion.div animate={{ width: `${rightBias.heelPct}%` }} transition={{ duration: 0.1 }} style={{ background: '#8b5cf6', height: '100%' }} />
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Center of Pressure Target — Full Width */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#e2e8f0' }}>Center of Pressure</h3>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Load: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{total} units</span></div>
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>Keep the dot in the center ring during squats.</p>

                {/* The Target Area */}
                <div style={{ position: 'relative', width: '280px', height: '280px', background: '#0f172a', borderRadius: '50%', border: '2px solid #334155', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {/* Inner Rings */}
                    <div style={{ position: 'absolute', width: '170px', height: '170px', borderRadius: '50%', border: '1px dashed #475569' }} />
                    <div style={{ position: 'absolute', width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #22c55e' }} />

                    {/* Axes */}
                    <div style={{ position: 'absolute', width: '100%', height: '1px', background: '#334155' }} />
                    <div style={{ position: 'absolute', width: '1px', height: '100%', background: '#334155' }} />

                    {/* Labels */}
                    <div style={{ position: 'absolute', top: '10px', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>TOES</div>
                    <div style={{ position: 'absolute', bottom: '10px', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>HEELS</div>
                    <div style={{ position: 'absolute', left: '10px', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>LEFT</div>
                    <div style={{ position: 'absolute', right: '10px', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>RIGHT</div>

                    {/* The CoP Dot */}
                    <motion.div
                        animate={{
                            left: `${(safeX + 100) / 2}%`,
                            top: `${(safeY + 100) / 2}%`
                        }}
                        transition={{ type: 'spring', damping: 15, stiffness: 100 }}
                        style={{
                            position: 'absolute',
                            width: '24px',
                            height: '24px',
                            background: '#38bdf8',
                            borderRadius: '50%',
                            transform: 'translate(-50%, -50%)',
                            boxShadow: '0 0 15px rgba(56, 189, 248, 0.8), inset 0 0 10px #fff',
                            zIndex: 20,
                            opacity: total > 20 ? 1 : 0.2
                        }}
                    />
                </div>

                {total < 10 && (
                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#ef4444', marginTop: '12px' }}>
                        Please step onto the Balance Board.
                    </div>
                )}
            </div>

        </div>
    );
};

export default BalanceBoardView;
