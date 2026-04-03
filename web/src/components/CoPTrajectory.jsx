import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Navigation, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * CoPTrajectory - Visualizes Center of Pressure path through the stroke
 * Shows curved (injured) vs straight (healthy) trajectory patterns
 */
const CoPTrajectory = ({ data, strokeCount, ankleFlexion }) => {
    const trajectoryData = useMemo(() => {
        if (!data || data.length === 0) return [];

        return data
            .filter(p => p.phase === 'drive')
            .map((point) => {
                // Combine Left and Right forces for a single Center of Pressure
                const heel = point.leftHeel + point.rightHeel;
                const ball = point.leftBall + point.rightBall; // Medial (First Metatarsal)
                const toe = point.leftToe + point.rightToe;    // Lateral (Fifth Metatarsal)

                const total = Math.max(1, heel + ball + toe);

                // Map sensor readings to physical SVG grid locations
                // Heel: x=10, y=50
                // Ball (Medial): x=80, y=65
                // Toe (Lateral): x=80, y=35

                const x = ((heel * 10) + (ball * 80) + (toe * 80)) / total;
                const y = ((heel * 50) + (ball * 65) + (toe * 35)) / total;

                return {
                    x,
                    y,
                    force: point.actual,
                    time: point.time,
                    strokeNum: point.strokeNum
                };
            });
    }, [data]);

    // Calculate trajectory straightness score
    const straightnessScore = useMemo(() => {
        if (trajectoryData.length < 3) return 100;

        // Calculate deviation from straight line (y = 50)
        const deviations = trajectoryData.map(p => Math.abs(p.y - 50));
        const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
        const maxDeviation = 20; // Max expected deviation

        return Math.max(0, Math.round(100 - (avgDeviation / maxDeviation) * 100));
    }, [trajectoryData]);

    // Get current stroke trajectory only
    const currentStrokeData = useMemo(() => {
        if (strokeCount === 0) return [];
        return trajectoryData.filter(p => p.strokeNum === strokeCount);
    }, [trajectoryData, strokeCount]);

    // Ideal straight path for reference
    const idealPath = useMemo(() => {
        return Array.from({ length: 20 }, (_, i) => ({
            x: (i / 19) * 100,
            y: 50
        }));
    }, []);

    const scoreColor = straightnessScore >= 85 ? '#4ade80' :
        straightnessScore >= 60 ? '#fbbf24' : '#f87171';

    return (
        <div className="glass-panel" style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Navigation size={20} style={{ color: '#818cf8' }} />
                    <span style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '14px' }}>
                        CoP TRAJECTORY
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {straightnessScore >= 85 ? (
                        <CheckCircle size={16} style={{ color: '#4ade80' }} />
                    ) : (
                        <AlertCircle size={16} style={{ color: scoreColor }} />
                    )}
                    <span style={{
                        color: scoreColor,
                        fontWeight: 'bold',
                        fontSize: '13px',
                        fontFamily: 'monospace'
                    }}>
                        {straightnessScore}% Straight
                    </span>
                </div>
            </div>

            {/* Trajectory Visualization */}
            <div style={{
                position: 'relative',
                width: '100%',
                height: '180px',
                background: '#1e293b',
                borderRadius: '12px',
                overflow: 'hidden'
            }}>
                {/* Foot outline (simplified) */}
                <svg
                    viewBox="0 0 100 100"
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0
                    }}
                    preserveAspectRatio="none"
                >
                    {/* Grid lines */}
                    <defs>
                        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#334155" strokeWidth="0.3" />
                        </pattern>
                    </defs>
                    <rect width="100" height="100" fill="url(#grid)" />

                    {/* Labels */}
                    <text x="5" y="50" fill="#64748b" fontSize="4" textAnchor="start">HEEL</text>
                    <text x="95" y="50" fill="#64748b" fontSize="4" textAnchor="end">TOE</text>
                    <text x="50" y="8" fill="#64748b" fontSize="3" textAnchor="middle">LATERAL</text>
                    <text x="50" y="98" fill="#64748b" fontSize="3" textAnchor="middle">MEDIAL</text>

                    {/* Ideal path (dashed line) */}
                    <line
                        x1="5" y1="50" x2="95" y2="50"
                        stroke="#38bdf8"
                        strokeWidth="0.8"
                        strokeDasharray="2 1"
                        opacity="0.5"
                    />

                    {/* Actual trajectory path */}
                    {currentStrokeData.length > 1 && (
                        <motion.path
                            d={`M ${currentStrokeData.map(p => `${p.x},${p.y}`).join(' L ')}`}
                            fill="none"
                            stroke={straightnessScore >= 85 ? '#4ade80' : '#f87171'}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.5 }}
                        />
                    )}

                    {/* Current position marker */}
                    {currentStrokeData.length > 0 && (
                        <motion.circle
                            cx={currentStrokeData[currentStrokeData.length - 1]?.x || 5}
                            cy={currentStrokeData[currentStrokeData.length - 1]?.y || 50}
                            r="3"
                            fill={straightnessScore >= 85 ? '#4ade80' : '#f87171'}
                            initial={{ scale: 0 }}
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ repeat: Infinity, duration: 0.8 }}
                        />
                    )}

                    {/* Sensor positions (3-sensor layout) */}
                    <circle cx="10" cy="50" r="4" fill="none" stroke="#475569" strokeWidth="0.5" /> {/* Heel */}
                    <circle cx="80" cy="35" r="4" fill="none" stroke="#475569" strokeWidth="0.5" /> {/* Lateral */}
                    <circle cx="80" cy="65" r="4" fill="none" stroke="#475569" strokeWidth="0.5" /> {/* Medial */}

                    {/* Sensor labels */}
                    <text x="10" y="58" fill="#475569" fontSize="2.5" textAnchor="middle">H</text>
                    <text x="80" y="31" fill="#475569" fontSize="2.5" textAnchor="middle">L</text>
                    <text x="80" y="71" fill="#475569" fontSize="2.5" textAnchor="middle">M</text>
                </svg>
            </div>

            {/* Interpretation */}
            <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#1e293b',
                borderRadius: '8px',
                borderLeft: `3px solid ${scoreColor}`
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '11px',
                    color: '#94a3b8',
                    lineHeight: 1.5
                }}>
                    {straightnessScore >= 85 ? (
                        <>
                            <strong style={{ color: '#4ade80' }}>✓ Healthy Pattern:</strong> Force path is straight from heel to toe. Good Achilles loading mechanics.
                        </>
                    ) : straightnessScore >= 60 ? (
                        <>
                            <strong style={{ color: '#fbbf24' }}>⚠ Moderate Deviation:</strong> Path curves laterally. You may be "rolling out" to reduce Achilles strain.
                        </>
                    ) : (
                        <>
                            <strong style={{ color: '#f87171' }}>⚠ Guarding Detected:</strong> Significant lateral escape pattern. Classic Achilles protection behavior.
                        </>
                    )}
                </p>
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
                    <div style={{ width: '16px', height: '2px', background: '#38bdf8', opacity: 0.5 }} />
                    <span>Ideal (Straight)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '16px', height: '2px', background: straightnessScore >= 85 ? '#4ade80' : '#f87171' }} />
                    <span>Actual Path</span>
                </div>
            </div>
        </div>
    );
};

export default CoPTrajectory;
