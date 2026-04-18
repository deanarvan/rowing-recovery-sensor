/**
 * ShapeTracing — trace shapes (circle, figure-8, star) with CoP.
 *
 * The shape is rendered as an ordered set of checkpoints. Each checkpoint
 * illuminates when CoP is within ~8% radius of it. Completing all checkpoints
 * in sequence (wrapping for closed shapes) counts as one lap.
 */

import React, { useState, useEffect, useMemo } from 'react';
import CoPDisplay from '../CoPDisplay';
import { Spline, Trophy, RotateCcw } from 'lucide-react';

// Generate shape checkpoints in normalized coords (-100..100)
function circleShape(n = 24, r = 50) {
    return Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    });
}

function figure8Shape(n = 32, r = 45) {
    // Lemniscate: x = r * cos(t) / (1 + sin^2(t)), y = r * sin(t) * cos(t) / (1 + sin^2(t))
    return Array.from({ length: n }, (_, i) => {
        const t = (i / n) * Math.PI * 2;
        const denom = 1 + Math.sin(t) ** 2;
        return {
            x: (r * 1.3 * Math.cos(t)) / denom,
            y: (r * 1.3 * Math.sin(t) * Math.cos(t)) / denom,
        };
    });
}

function starShape(points = 5, r = 55) {
    // 5-point star — alternate outer and inner vertices
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
        const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.4;
        pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    // Interpolate along edges so tracing is smooth
    const interpolated = [];
    const segments = 4;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        for (let s = 0; s < segments; s++) {
            const f = s / segments;
            interpolated.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        }
    }
    return interpolated;
}

const SHAPES = {
    circle:   { name: 'Circle', icon: '◯', generator: circleShape },
    figure8:  { name: 'Figure-8', icon: '∞', generator: figure8Shape },
    star:     { name: 'Star', icon: '★', generator: starShape },
};

const HIT_RADIUS = 10; // % — how close CoP must be to a checkpoint to trigger it

const ShapeTracing = ({ cop, instantaneousData }) => {
    const [shapeKey, setShapeKey] = useState('circle');
    const [nextIdx, setNextIdx] = useState(0);
    const [lapCount, setLapCount] = useState(0);
    const [hitsEver, setHitsEver] = useState(new Set()); // for rendering completed points

    const shape = useMemo(() => SHAPES[shapeKey].generator(), [shapeKey]);

    const data = instantaneousData || { leftForce: 0, rightForce: 0 };
    const inactive = (data.leftForce + data.rightForce) < 20;

    // Detect hit on next checkpoint
    useEffect(() => {
        if (inactive || !cop) return;
        const target = shape[nextIdx];
        const dx = cop.x - target.x;
        const dy = cop.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= HIT_RADIUS) {
            setHitsEver(prev => new Set(prev).add(nextIdx));
            if (nextIdx + 1 >= shape.length) {
                setLapCount(c => c + 1);
                setNextIdx(0);
                setHitsEver(new Set());
            } else {
                setNextIdx(i => i + 1);
            }
        }
    }, [cop, nextIdx, shape, inactive]);

    const reset = () => {
        setNextIdx(0);
        setLapCount(0);
        setHitsEver(new Set());
    };

    const changeShape = (key) => {
        setShapeKey(key);
        setNextIdx(0);
        setHitsEver(new Set());
    };

    // Build SVG path for shape outline
    const pathD = shape.map((p, i) => {
        const x = (p.x + 100) / 2;
        const y = (-p.y + 100) / 2;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ') + ' Z';

    const overlay = (
        <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
            {/* Shape path outline */}
            <path
                d={pathD}
                fill="none"
                stroke="#475569"
                strokeWidth="0.4"
                strokeDasharray="1 1"
                opacity="0.5"
            />
            {/* Checkpoints */}
            {shape.map((p, i) => {
                const cx = (p.x + 100) / 2;
                const cy = (-p.y + 100) / 2;
                const isNext = i === nextIdx;
                const isHit = hitsEver.has(i);
                return (
                    <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r={isNext ? 2 : 1}
                        fill={isHit ? '#22c55e' : isNext ? '#f59e0b' : '#475569'}
                        opacity={isHit ? 0.9 : isNext ? 1 : 0.6}
                        style={{
                            filter: isNext ? 'drop-shadow(0 0 3px #f59e0b)' : 'none',
                            transition: 'fill 0.3s, r 0.2s',
                        }}
                    />
                );
            })}
        </svg>
    );

    const progressPct = (nextIdx / shape.length) * 100;

    return (
        <div>
            {/* Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                <StatusCard label="Shape" value={SHAPES[shapeKey].icon + ' ' + SHAPES[shapeKey].name} color="#38bdf8" />
                <StatusCard label="Laps" value={lapCount} color="#a78bfa" />
                <StatusCard label="Progress" value={`${nextIdx + 1}/${shape.length}`} color="#f59e0b" />
                <StatusCard label="Next Point" value={`${Math.round(progressPct)}%`} color="#22c55e" />
            </div>

            {/* Main layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <CoPDisplay
                    cop={cop}
                    trail={[]}
                    size={460}
                    inactive={inactive}
                    overlay={overlay}
                />

                {/* Right panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="glass-panel" style={{ padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#38bdf8', marginBottom: 10 }}>
                            <Spline size={16} />
                            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose shape</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            {Object.entries(SHAPES).map(([key, s]) => (
                                <button
                                    key={key}
                                    onClick={() => changeShape(key)}
                                    style={{
                                        padding: '10px 8px',
                                        background: shapeKey === key ? '#38bdf833' : 'rgba(30, 41, 59, 0.5)',
                                        border: `1px solid ${shapeKey === key ? '#38bdf8' : 'rgba(51, 65, 85, 0.6)'}`,
                                        color: shapeKey === key ? '#38bdf8' : '#94a3b8',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}
                                >
                                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                            How to play
                        </div>
                        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
                            Move your CoP to each glowing orange checkpoint in order. Hit all {shape.length} points to complete a lap. Green = hit, orange = next target.
                        </div>
                    </div>

                    {lapCount >= 3 && (
                        <div className="glass-panel" style={{ padding: 14, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid #a855f7' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a855f7' }}>
                                <Trophy size={16} />
                                <span style={{ fontSize: 13, fontWeight: 800 }}>{lapCount} LAPS!</span>
                            </div>
                        </div>
                    )}

                    <button onClick={reset} style={{
                        padding: '10px 14px',
                        background: 'rgba(51, 65, 85, 0.4)',
                        color: '#94a3b8',
                        border: '1px solid rgba(51, 65, 85, 0.6)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                    }}>
                        <RotateCcw size={13} /> Reset
                    </button>
                </div>
            </div>
        </div>
    );
};

const StatusCard = ({ label, value, color }) => (
    <div style={{
        padding: '10px 14px',
        background: 'rgba(15, 23, 42, 0.6)',
        borderRadius: 8,
        border: `1px solid ${color}66`,
        textAlign: 'center',
    }}>
        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>
            {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color }}>
            {value}
        </div>
    </div>
);

export default ShapeTracing;
