import React from 'react';

/**
 * SVG component showing overlaid ankle dorsiflexion comparison with protractor lines.
 * Healthy ankle: ~20° dorsiflexion (full range)
 * Recovering ankle: Scaled based on flexion slider (0-100% maps to ~0-20°)
 */
const AnkleComparison = ({ recoveringFlexionPercent }) => {
    const healthyAngle = 20;
    const recoveringAngle = (recoveringFlexionPercent / 100) * healthyAngle;
    const angleDiff = healthyAngle - recoveringAngle;

    // Heel lift calculation for ~6'3" person
    // Ball-to-heel distance ≈ 4.5 inches
    const heelToForefoot = 4.5; // inches
    const heelLiftInches = heelToForefoot * Math.sin((angleDiff * Math.PI) / 180);

    // Pivot point (heel/ankle)
    const pivotX = 80;
    const pivotY = 100;
    const radius = 70;

    // Helper: Calculate endpoint for a line at given angle from horizontal
    const getLineEnd = (angleDeg) => {
        const rad = (-angleDeg * Math.PI) / 180; // Negative = upward
        return {
            x: pivotX + radius * Math.cos(rad),
            y: pivotY + radius * Math.sin(rad)
        };
    };

    const healthyEnd = getLineEnd(healthyAngle);
    const recoveringEnd = getLineEnd(recoveringAngle);
    const baselineEnd = getLineEnd(0);

    // Generate protractor tick marks (every 5°)
    const ticks = [];
    for (let deg = 0; deg <= 25; deg += 5) {
        const tickRad = (-deg * Math.PI) / 180;
        const innerR = 55;
        const outerR = 65;
        ticks.push({
            x1: pivotX + innerR * Math.cos(tickRad),
            y1: pivotY + innerR * Math.sin(tickRad),
            x2: pivotX + outerR * Math.cos(tickRad),
            y2: pivotY + outerR * Math.sin(tickRad),
            label: deg,
            labelX: pivotX + 75 * Math.cos(tickRad),
            labelY: pivotY + 75 * Math.sin(tickRad)
        });
    }

    return (
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg width="200" height="140" viewBox="0 0 200 140">
                {/* Protractor arc background */}
                <path
                    d={`M ${pivotX + 60} ${pivotY} A 60 60 0 0 0 ${pivotX + 60 * Math.cos((-25 * Math.PI) / 180)} ${pivotY + 60 * Math.sin((-25 * Math.PI) / 180)}`}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="12"
                    strokeLinecap="round"
                />

                {/* Tick marks */}
                {ticks.map((t, i) => (
                    <g key={i}>
                        <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#64748b" strokeWidth="1" />
                        <text x={t.labelX} y={t.labelY} fill="#64748b" fontSize="8" textAnchor="middle" dominantBaseline="middle">
                            {t.label}°
                        </text>
                    </g>
                ))}

                {/* Baseline (0°) */}
                <line x1={pivotX} y1={pivotY} x2={baselineEnd.x} y2={baselineEnd.y} stroke="#475569" strokeWidth="2" strokeDasharray="4 2" />

                {/* Healthy angle line (green) */}
                <line x1={pivotX} y1={pivotY} x2={healthyEnd.x} y2={healthyEnd.y} stroke="#4ade80" strokeWidth="3" />
                <circle cx={healthyEnd.x} cy={healthyEnd.y} r="4" fill="#4ade80" />

                {/* Recovering angle line (blue) */}
                <line x1={pivotX} y1={pivotY} x2={recoveringEnd.x} y2={recoveringEnd.y} stroke="#38bdf8" strokeWidth="3" />
                <circle cx={recoveringEnd.x} cy={recoveringEnd.y} r="4" fill="#38bdf8" />

                {/* Pivot point (heel) */}
                <circle cx={pivotX} cy={pivotY} r="6" fill="#f8fafc" stroke="#334155" strokeWidth="2" />

                {/* Arc showing the gap */}
                {angleDiff > 0 && (
                    <path
                        d={`M ${recoveringEnd.x} ${recoveringEnd.y} A ${radius} ${radius} 0 0 0 ${healthyEnd.x} ${healthyEnd.y}`}
                        fill="none"
                        stroke="#f87171"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                    />
                )}
            </svg>

            {/* Labels */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '8px', fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4ade80' }}></span>
                    <span style={{ color: '#e2e8f0' }}>Healthy <strong>{healthyAngle}°</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#38bdf8' }}></span>
                    <span style={{ color: '#e2e8f0' }}>Recovering <strong>{recoveringAngle.toFixed(0)}°</strong></span>
                </div>
                {angleDiff > 0.5 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '10px', height: '2px', background: '#f87171' }}></span>
                        <span style={{ color: '#f87171' }}>Gap <strong>{angleDiff.toFixed(0)}°</strong></span>
                    </div>
                )}
            </div>
            {/* Heel Lift Calculation */}
            {heelLiftInches > 0.1 && (
                <div style={{ marginTop: '12px', padding: '10px 16px', background: '#1e293b', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                        Down Dog Heel Gap (6'3" person)
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 'bold', color: '#fbbf24', fontFamily: 'monospace' }}>
                        ~{heelLiftInches.toFixed(1)}"
                        <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#94a3b8' }}> to reach floor</span>
                    </p>
                </div>
            )}
        </div>
    );
};

export default AnkleComparison;
