/**
 * ReactiveTargets — random targets appear; move CoP to them within a time limit.
 *
 * Each target appears at a random position (40-60% from center).
 * Player has reactionWindow seconds to hit it. Hit = CoP within 8% of target.
 * Tracks: hits, misses, average reaction time, best reaction time.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import CoPDisplay from '../CoPDisplay';
import { Zap, Trophy, RotateCcw, TimerReset } from 'lucide-react';

const DIFFICULTIES = {
    easy: { window: 2.0, interval: 3.0, label: 'Easy (2s window)' },
    medium: { window: 1.3, interval: 2.2, label: 'Medium (1.3s window)' },
    hard: { window: 0.8, interval: 1.5, label: 'Hard (0.8s window)' },
};

const HIT_RADIUS = 10;
const TARGET_ZONE_MIN = 35;
const TARGET_ZONE_MAX = 60;

const ReactiveTargets = ({ cop, instantaneousData }) => {
    const [difficulty, setDifficulty] = useState('medium');
    const [target, setTarget] = useState(null); // { x, y, appearedAt }
    const [nextSpawnAt, setNextSpawnAt] = useState(null);
    const [stats, setStats] = useState({ hits: 0, misses: 0, reactionTimes: [] });
    const [isRunning, setIsRunning] = useState(false);

    const settings = DIFFICULTIES[difficulty];
    const data = instantaneousData || { leftForce: 0, rightForce: 0 };
    const inactive = (data.leftForce + data.rightForce) < 20;

    const spawnTarget = useCallback(() => {
        const angle = Math.random() * Math.PI * 2;
        const radius = TARGET_ZONE_MIN + Math.random() * (TARGET_ZONE_MAX - TARGET_ZONE_MIN);
        setTarget({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            appearedAt: performance.now(),
        });
    }, []);

    // Main game loop
    useEffect(() => {
        if (!isRunning || inactive) return;
        const id = setInterval(() => {
            const now = performance.now();
            if (!target && (nextSpawnAt === null || now >= nextSpawnAt)) {
                spawnTarget();
                setNextSpawnAt(null);
            } else if (target) {
                const elapsed = (now - target.appearedAt) / 1000;
                // Check hit
                if (cop) {
                    const dx = cop.x - target.x;
                    const dy = cop.y - target.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= HIT_RADIUS) {
                        // Hit!
                        setStats(s => ({
                            ...s,
                            hits: s.hits + 1,
                            reactionTimes: [...s.reactionTimes, elapsed].slice(-20),
                        }));
                        setTarget(null);
                        setNextSpawnAt(now + settings.interval * 1000);
                        return;
                    }
                }
                if (elapsed > settings.window) {
                    // Missed
                    setStats(s => ({ ...s, misses: s.misses + 1 }));
                    setTarget(null);
                    setNextSpawnAt(now + settings.interval * 1000);
                }
            }
        }, 50);
        return () => clearInterval(id);
    }, [isRunning, inactive, target, nextSpawnAt, cop, settings, spawnTarget]);

    const start = () => {
        setStats({ hits: 0, misses: 0, reactionTimes: [] });
        setTarget(null);
        setNextSpawnAt(performance.now() + 500);
        setIsRunning(true);
    };

    const stop = () => {
        setIsRunning(false);
        setTarget(null);
    };

    const reset = () => {
        stop();
        setStats({ hits: 0, misses: 0, reactionTimes: [] });
    };

    const totalAttempts = stats.hits + stats.misses;
    const accuracy = totalAttempts > 0 ? (stats.hits / totalAttempts) * 100 : 0;
    const avgReaction = stats.reactionTimes.length > 0
        ? stats.reactionTimes.reduce((a, b) => a + b, 0) / stats.reactionTimes.length
        : 0;
    const bestReaction = stats.reactionTimes.length > 0 ? Math.min(...stats.reactionTimes) : 0;

    // Overlay
    const overlay = target ? (
        <div style={{
            position: 'absolute',
            left: `${(target.x + 100) / 2}%`,
            top: `${(-target.y + 100) / 2}%`,
            width: `${HIT_RADIUS * 2}%`,
            height: `${HIT_RADIUS * 2}%`,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.6) 0%, rgba(239, 68, 68, 0.1) 60%, transparent 100%)',
            border: '2px solid #ef4444',
            transform: 'translate(-50%, -50%)',
            animation: 'pulse 0.6s ease-in-out infinite',
            pointerEvents: 'none',
        }}>
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(1.1); }
                }
            `}</style>
        </div>
    ) : null;

    return (
        <div>
            {/* Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                <StatusCard label="Hits" value={stats.hits} color="#22c55e" />
                <StatusCard label="Misses" value={stats.misses} color="#ef4444" />
                <StatusCard label="Accuracy" value={totalAttempts > 0 ? accuracy.toFixed(0) + '%' : '—'} color="#38bdf8" />
                <StatusCard label="Avg Reaction" value={avgReaction > 0 ? avgReaction.toFixed(2) + 's' : '—'} color="#f59e0b" />
            </div>

            {/* Main layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <CoPDisplay
                    cop={cop}
                    trail={[]}
                    size={460}
                    inactive={inactive}
                    overlay={overlay}
                    dotColor={target ? '#fde047' : '#38bdf8'}
                />

                {/* Right panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="glass-panel" style={{ padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', marginBottom: 10 }}>
                            <Zap size={16} />
                            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Difficulty</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(DIFFICULTIES).map(([key, d]) => (
                                <button
                                    key={key}
                                    onClick={() => { setDifficulty(key); if (isRunning) start(); }}
                                    disabled={isRunning && difficulty !== key}
                                    style={{
                                        padding: '8px 12px',
                                        background: difficulty === key ? '#ef444433' : 'rgba(30, 41, 59, 0.5)',
                                        border: `1px solid ${difficulty === key ? '#ef4444' : 'rgba(51, 65, 85, 0.6)'}`,
                                        color: difficulty === key ? '#ef4444' : '#94a3b8',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        textAlign: 'left',
                                    }}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                            Stats
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#cbd5e1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Best reaction:</span>
                                <span style={{ fontFamily: 'monospace', color: '#22c55e' }}>
                                    {bestReaction > 0 ? bestReaction.toFixed(2) + 's' : '—'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Attempts:</span>
                                <span style={{ fontFamily: 'monospace' }}>{totalAttempts}</span>
                            </div>
                        </div>
                    </div>

                    {!isRunning ? (
                        <button onClick={start} style={{
                            padding: '12px 14px',
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}>
                            <Zap size={14} /> START
                        </button>
                    ) : (
                        <button onClick={stop} style={{
                            padding: '12px 14px',
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#ef4444',
                            border: '1px solid #ef4444',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}>
                            <TimerReset size={14} /> STOP
                        </button>
                    )}

                    <button onClick={reset} style={{
                        padding: '8px 14px',
                        background: 'rgba(51, 65, 85, 0.4)',
                        color: '#94a3b8',
                        border: '1px solid rgba(51, 65, 85, 0.6)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                    }}>
                        <RotateCcw size={12} /> Reset Stats
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

export default ReactiveTargets;
