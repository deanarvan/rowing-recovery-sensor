/**
 * TargetTracking — keep CoP inside a shrinking target ring.
 *
 * Progression: 40% → 30% → 20% → 12% → 6% of board radius.
 * Hold inside ring for 5s to advance. Timer resets if you drift out.
 * Scoring: time-in-zone accumulated across levels.
 */

import React, { useState, useEffect, useRef } from 'react';
import CoPDisplay from '../CoPDisplay';
import { Target, Trophy, RotateCcw, ChevronRight } from 'lucide-react';

const LEVELS = [
    { radius: 40, label: 'Level 1', color: '#22c55e' },
    { radius: 30, label: 'Level 2', color: '#4ade80' },
    { radius: 20, label: 'Level 3', color: '#f59e0b' },
    { radius: 12, label: 'Level 4', color: '#fb923c' },
    { radius: 6,  label: 'Level 5', color: '#ef4444' },
];
const HOLD_DURATION_S = 5;

const TargetTracking = ({ cop, instantaneousData, onReset }) => {
    const [levelIdx, setLevelIdx] = useState(0);
    const [inZoneTime, setInZoneTime] = useState(0);
    const [totalScore, setTotalScore] = useState(0);
    const [completed, setCompleted] = useState(false);
    const lastTickRef = useRef(performance.now());

    const level = LEVELS[levelIdx];
    const data = instantaneousData || { leftForce: 0, rightForce: 0 };
    const inactive = (data.leftForce + data.rightForce) < 20;

    // Check if CoP is in the target ring (centered at 0,0)
    const distFromCenter = cop ? Math.sqrt(cop.x * cop.x + cop.y * cop.y) : 999;
    const inZone = distFromCenter <= level.radius;

    useEffect(() => {
        if (completed) return;
        const id = setInterval(() => {
            const now = performance.now();
            const dt = (now - lastTickRef.current) / 1000;
            lastTickRef.current = now;

            if (inZone && !inactive) {
                setInZoneTime(t => {
                    const next = t + dt;
                    setTotalScore(s => s + dt);
                    if (next >= HOLD_DURATION_S) {
                        // Level up
                        if (levelIdx + 1 < LEVELS.length) {
                            setLevelIdx(i => i + 1);
                            return 0;
                        } else {
                            setCompleted(true);
                            return HOLD_DURATION_S;
                        }
                    }
                    return next;
                });
            } else {
                setInZoneTime(t => Math.max(0, t - dt * 2)); // decay faster
            }
        }, 50);
        return () => clearInterval(id);
    }, [inZone, inactive, levelIdx, completed]);

    const reset = () => {
        setLevelIdx(0);
        setInZoneTime(0);
        setTotalScore(0);
        setCompleted(false);
        if (onReset) onReset();
    };

    const holdProgressPct = (inZoneTime / HOLD_DURATION_S) * 100;

    // Overlay: render the target ring scaled to CoP display coords
    const overlay = (
        <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${level.radius}%`,
            height: `${level.radius}%`,
            borderRadius: '50%',
            border: `3px solid ${level.color}`,
            transform: 'translate(-50%, -50%)',
            boxShadow: inZone ? `0 0 30px ${level.color}` : 'none',
            transition: 'width 0.5s, height 0.5s, box-shadow 0.2s',
            background: inZone ? `${level.color}20` : 'transparent',
        }}>
            {/* Bullseye center dot */}
            <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 6,
                height: 6,
                background: level.color,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
            }} />
        </div>
    );

    return (
        <div>
            {/* Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                <StatusCard label="Level" value={`${levelIdx + 1}/${LEVELS.length}`} color={level.color} />
                <StatusCard label="Target Radius" value={level.radius + '%'} color="#38bdf8" />
                <StatusCard label="Hold Progress" value={`${Math.max(0, inZoneTime).toFixed(1)}s / ${HOLD_DURATION_S}s`} color="#a78bfa" />
                <StatusCard label="Total Score" value={totalScore.toFixed(1) + 's'} color="#f59e0b" />
            </div>

            {/* Main layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <CoPDisplay
                        cop={cop}
                        trail={[]}
                        size={460}
                        inactive={inactive}
                        overlay={overlay}
                        dotColor={inZone ? level.color : '#38bdf8'}
                    />

                    {/* Hold progress bar */}
                    <div style={{ width: 460 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#94a3b8' }}>
                            <span>Hold progress</span>
                            <span style={{ fontFamily: 'monospace', color: level.color }}>{inZone ? 'IN ZONE' : 'drift out'}</span>
                        </div>
                        <div style={{ height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{
                                width: `${holdProgressPct}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${level.color}88, ${level.color})`,
                                transition: 'width 0.1s',
                            }} />
                        </div>
                    </div>
                </div>

                {/* Right panel: instructions + level preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="glass-panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b' }}>
                            <Target size={16} />
                            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>How to play</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
                            Keep your center of pressure inside the glowing ring. Hold for 5 seconds to advance to the next (smaller) target. Complete all 5 levels.
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Levels</div>
                        {LEVELS.map((lvl, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                background: i === levelIdx ? `${lvl.color}22` : 'rgba(15, 23, 42, 0.3)',
                                border: `1px solid ${i === levelIdx ? lvl.color : 'rgba(51, 65, 85, 0.3)'}`,
                                borderRadius: 6,
                                fontSize: 11,
                            }}>
                                <span style={{ color: i <= levelIdx ? lvl.color : '#64748b', fontWeight: 600 }}>
                                    {i < levelIdx && '✓ '}
                                    {lvl.label}
                                </span>
                                <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{lvl.radius}%</span>
                            </div>
                        ))}
                    </div>

                    {completed && (
                        <div className="glass-panel" style={{ padding: 14, background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', marginBottom: 4 }}>
                                <Trophy size={16} />
                                <span style={{ fontSize: 13, fontWeight: 800 }}>COMPLETED!</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#bbf7d0' }}>
                                Total in-zone time: {totalScore.toFixed(1)}s
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
                        <RotateCcw size={13} /> Restart
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
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color }}>
            {value}
        </div>
    </div>
);

export default TargetTracking;
