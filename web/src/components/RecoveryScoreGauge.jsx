import React from 'react';

/**
 * SVG arc gauge showing a 0–100 recovery score.
 * Color bands: red (<50), amber (50–75), green (75+).
 */
const RecoveryScoreGauge = ({ score, size = 200 }) => {
    const radius = size * 0.38;
    const strokeWidth = size * 0.08;
    const cx = size / 2;
    const cy = size / 2 + 10;

    // Arc from 225° to -45° (270° sweep)
    const startAngle = 225;
    const endAngle = -45;
    const sweep = startAngle - endAngle; // 270

    const polarToCartesian = (angle) => {
        const rad = (angle * Math.PI) / 180;
        return {
            x: cx + radius * Math.cos(rad),
            y: cy - radius * Math.sin(rad)
        };
    };

    const describeArc = (start, end) => {
        const s = polarToCartesian(start);
        const e = polarToCartesian(end);
        const largeArc = start - end > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 0 ${e.x} ${e.y}`;
    };

    const safeScore = score != null ? Math.max(0, Math.min(100, score)) : 0;
    const fillAngle = startAngle - (safeScore / 100) * sweep;

    const getColor = (s) => {
        if (s >= 75) return '#4ade80';
        if (s >= 50) return '#fbbf24';
        return '#f87171';
    };

    const getLabel = (s) => {
        if (s >= 75) return 'Minor Asymmetry';
        if (s >= 50) return 'Moderate Deficit';
        return 'Significant Deficit';
    };

    const color = getColor(safeScore);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
                {/* Background track */}
                <path
                    d={describeArc(startAngle, endAngle)}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />

                {/* Color band markers */}
                {/* Red zone 0-50 */}
                <path
                    d={describeArc(startAngle, startAngle - (50 / 100) * sweep)}
                    fill="none"
                    stroke="rgba(248, 113, 113, 0.15)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
                {/* Amber zone 50-75 */}
                <path
                    d={describeArc(startAngle - (50 / 100) * sweep, startAngle - (75 / 100) * sweep)}
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.15)"
                    strokeWidth={strokeWidth}
                />
                {/* Green zone 75-100 */}
                <path
                    d={describeArc(startAngle - (75 / 100) * sweep, endAngle)}
                    fill="none"
                    stroke="rgba(74, 222, 128, 0.15)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />

                {/* Active fill */}
                {score != null && safeScore > 0 && (
                    <path
                        d={describeArc(startAngle, fillAngle)}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        style={{
                            filter: `drop-shadow(0 0 6px ${color}40)`,
                            transition: 'all 0.8s ease-out'
                        }}
                    />
                )}

                {/* Center score text */}
                <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    style={{
                        fontSize: size * 0.22,
                        fontWeight: 800,
                        fill: score != null ? color : '#475569',
                        fontFamily: 'Inter, system-ui, sans-serif'
                    }}
                >
                    {score != null ? safeScore : '—'}
                </text>
                <text
                    x={cx}
                    y={cy + size * 0.09}
                    textAnchor="middle"
                    style={{
                        fontSize: size * 0.065,
                        fill: '#94a3b8',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                    }}
                >
                    Recovery Score
                </text>
            </svg>
            {score != null && (
                <div style={{
                    marginTop: '-4px',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    background: `${color}15`,
                    border: `1px solid ${color}30`,
                    color: color,
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                    {getLabel(safeScore)}
                </div>
            )}
        </div>
    );
};

export default RecoveryScoreGauge;
