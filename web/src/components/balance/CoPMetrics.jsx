/**
 * CoPMetrics — displays live (10s rolling) and session metrics side-by-side.
 *
 * Props:
 *   live     { velocity, ellipseArea, symmetry, samples }
 *   session  { velocity, ellipseArea, symmetry, samples, duration }
 *   onReset  () => void
 *   layout   'vertical' | 'horizontal' (default vertical)
 *   compact  boolean — smaller version
 */

import React from 'react';
import { Activity, Target, GitCompare, RotateCcw, Timer } from 'lucide-react';

const Stat = ({ icon: Icon, label, value, unit, color, hint, compact }) => (
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: compact ? '8px 10px' : '10px 14px',
        background: 'rgba(15, 23, 42, 0.5)',
        borderRadius: 8,
        border: '1px solid rgba(51, 65, 85, 0.5)',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            <Icon size={11} color={color} />
            {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: compact ? 18 : 22, fontWeight: 800, fontFamily: 'monospace', color, lineHeight: 1 }}>
                {value}
            </span>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{unit}</span>
        </div>
        {hint && <div style={{ fontSize: 9, color: '#64748b' }}>{hint}</div>}
    </div>
);

const MetricBlock = ({ title, data, color, compact }) => (
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: compact ? '10px' : '12px',
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: 10,
        border: `1px solid ${color}33`,
    }}>
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
        }}>
            <span>{title}</span>
            {data.duration !== undefined && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#64748b', fontWeight: 500 }}>
                    <Timer size={10} />
                    {Math.floor(data.duration)}s
                </span>
            )}
        </div>
        <Stat
            icon={Activity}
            label="CoP Velocity"
            value={data.velocity.toFixed(1)}
            unit="%/s"
            color="#38bdf8"
            hint={data.velocity < 25 ? 'Normal range' : data.velocity < 50 ? 'Elevated' : 'High sway'}
            compact={compact}
        />
        <Stat
            icon={Target}
            label="Ellipse Area"
            value={data.ellipseArea < 1000 ? data.ellipseArea.toFixed(0) : (data.ellipseArea / 1000).toFixed(1) + 'k'}
            unit="%²"
            color="#a78bfa"
            hint={data.ellipseArea < 2000 ? 'Tight control' : data.ellipseArea < 6000 ? 'Moderate' : 'Large spread'}
            compact={compact}
        />
        <Stat
            icon={GitCompare}
            label="Symmetry"
            value={data.symmetry.toFixed(1)}
            unit="% asym"
            color="#4ade80"
            hint={data.symmetry < 5 ? 'Excellent' : data.symmetry < 10 ? 'Good' : 'Asymmetric'}
            compact={compact}
        />
    </div>
);

const CoPMetrics = ({ live, session, onReset, layout = 'vertical', compact = false }) => {
    const safeLive = live || { velocity: 0, ellipseArea: 0, symmetry: 0, samples: 0 };
    const safeSession = session || { velocity: 0, ellipseArea: 0, symmetry: 0, samples: 0, duration: 0 };

    const containerStyle = {
        display: 'flex',
        flexDirection: layout === 'horizontal' ? 'row' : 'column',
        gap: 10,
        width: '100%',
    };

    return (
        <div style={containerStyle}>
            <div style={{ flex: 1 }}>
                <MetricBlock title="Live (10s)" data={safeLive} color="#38bdf8" compact={compact} />
            </div>
            <div style={{ flex: 1 }}>
                <MetricBlock title="Session" data={safeSession} color="#f59e0b" compact={compact} />
            </div>
            {onReset && (
                <button
                    onClick={onReset}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        background: 'rgba(51, 65, 85, 0.4)',
                        color: '#94a3b8',
                        border: '1px solid rgba(51, 65, 85, 0.6)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        alignSelf: layout === 'horizontal' ? 'stretch' : 'center',
                    }}
                    title="Reset session metrics"
                >
                    <RotateCcw size={12} /> Reset
                </button>
            )}
        </div>
    );
};

export default CoPMetrics;
