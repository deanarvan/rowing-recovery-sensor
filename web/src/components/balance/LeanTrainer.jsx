/**
 * LeanTrainer — compact gamified L/R lean strip driven by the BNO055 board ROLL angle.
 * Sits directly above the CoP plot so the lean bar + CoP circle are visible together.
 *
 * Input: roll (degrees, from instantaneousData.roll; null when no IMU on the wire).
 * Measured signal: roll spans ~±10°, neutral ~-3° (uncalibrated-accel offset → needs a
 * zero), +roll = leaning RIGHT. Pitch is the heel-rise axis (task-3); this view uses roll.
 *
 * Modes:
 *   FREE    — live angle + lean bar, no scoring (pure feedback).
 *   TARGETS — a band appears alternately L/R; tilt the orb into it and HOLD to score.
 *             Alternating sides = lateral weight-shift reps; longest hold = stability.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Gauge, Crosshair, RotateCcw, Activity } from 'lucide-react';

// Physical limit measured from a full side-to-side rock (board bottoming out on
// each side): reach ≈ ±7.5° about the mechanical centre, symmetric. The display
// maps to that range (orb reaches the rail when the board grounds out), and every
// target stays INSIDE it with margin so you HOLD a controlled lean, not slam the stop.
const REACH_DEG = 7.5;              // board bottom-out angle each side (measured)
const MAX_DEG = 9;                  // display half-range (just past the bottom-out)
const TICK_MS = 50;                 // game loop period
const DIFFS = {
    Easy: { angle: 3.0, band: 2.0, holdMs: 1000, label: 'Easy' },
    Med:  { angle: 4.5, band: 1.5, holdMs: 1300, label: 'Med' },
    Hard: { angle: 5.5, band: 1.2, holdMs: 1600, label: 'Hard' },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const degToPct = (deg) => 50 + (clamp(deg, -MAX_DEG, MAX_DEG) / MAX_DEG) * 50; // -MAX..MAX → 2..98%

const LeanTrainer = ({ roll }) => {
    const [mode, setMode] = useState('Targets');
    const [diffKey, setDiffKey] = useState('Med');
    const [ui, setUi] = useState({ lean: null, progress: 0, inBand: false });
    const [score, setScore] = useState(0);
    const [bestHoldMs, setBestHoldMs] = useState(0);
    const [flash, setFlash] = useState(0);

    // Live-value refs read by the game loop (decoupled from React render rate).
    const rollRef = useRef(roll);
    rollRef.current = roll;
    const neutralRef = useRef(0);
    const neutralSetRef = useRef(false);
    const targetRef = useRef({ side: 1, angle: DIFFS.Med.angle });
    const holdStartRef = useRef(null);
    const bestHoldRef = useRef(0);
    const modeRef = useRef(mode); modeRef.current = mode;
    const diffRef = useRef(diffKey); diffRef.current = diffKey;

    const setNeutral = useCallback(() => {
        if (rollRef.current != null) { neutralRef.current = rollRef.current; neutralSetRef.current = true; }
    }, []);

    const resetGame = useCallback(() => {
        setScore(0); setBestHoldMs(0); bestHoldRef.current = 0;
        holdStartRef.current = null;
        targetRef.current = { side: 1, angle: DIFFS[diffRef.current].angle };
    }, []);

    // Single game loop.
    useEffect(() => {
        const id = setInterval(() => {
            const raw = rollRef.current;
            if (raw == null) { setUi((u) => ({ ...u, lean: null })); return; }

            // Auto-zero on first valid sample so the resting tilt reads as center.
            if (!neutralSetRef.current) { neutralRef.current = raw; neutralSetRef.current = true; }
            const lean = raw - neutralRef.current;
            const diff = DIFFS[diffRef.current];

            if (modeRef.current !== 'Targets') {
                setUi({ lean, progress: 0, inBand: false });
                holdStartRef.current = null;
                return;
            }

            const t = targetRef.current;
            const center = t.side * t.angle;
            const inBand = Math.abs(lean - center) <= diff.band;
            const now = performance.now();
            let progress = 0;

            if (inBand) {
                if (holdStartRef.current == null) holdStartRef.current = now;
                const held = now - holdStartRef.current;
                if (held > bestHoldRef.current) { bestHoldRef.current = held; setBestHoldMs(held); }
                progress = Math.min(1, held / diff.holdMs);
                if (progress >= 1) {
                    setScore((s) => s + 1);
                    setFlash(now);
                    targetRef.current = { side: -t.side, angle: diff.angle }; // alternate L↔R
                    holdStartRef.current = null;
                    progress = 0;
                }
            } else {
                holdStartRef.current = null;
            }
            setUi({ lean, progress, inBand });
        }, TICK_MS);
        return () => clearInterval(id);
    }, []);

    const diff = DIFFS[diffKey];
    const lean = ui.lean;
    const hasIMU = lean != null;
    const leanAbs = hasIMU ? Math.abs(lean) : 0;
    const dir = !hasIMU ? '' : lean > 0.4 ? 'RIGHT' : lean < -0.4 ? 'LEFT' : 'LEVEL';
    const dirColor = dir === 'RIGHT' ? '#a855f7' : dir === 'LEFT' ? '#4ade80' : '#38bdf8';
    const target = targetRef.current;
    const targetCenterPct = degToPct(target.side * target.angle);
    const targetHalfPct = (diff.band / MAX_DEG) * 50;
    const orbPct = hasIMU ? degToPct(lean) : 50;
    const justHit = flash && (performance.now() - flash < 350);

    return (
        <div style={{
            maxWidth: 760, margin: '0 auto 12px', padding: '9px 14px', borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(15,23,42,0.6), rgba(2,6,23,0.5))',
            border: '1px solid rgba(51,65,85,0.6)',
        }}>
            {/* Row 1 — controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', fontWeight: 700, fontSize: 12, letterSpacing: 0.4 }}>
                    <Gauge size={14} color="#38bdf8" /> L/R LEAN
                    <span style={{ color: '#64748b', fontWeight: 600, fontSize: 10 }}>· BNO055 roll</span>
                </div>
                <div style={{ flex: 1 }} />
                {['Free', 'Targets'].map((m) => (
                    <Chip key={m} active={mode === m} onClick={() => setMode(m)}
                          icon={m === 'Targets' ? Crosshair : Activity} label={m} color="#38bdf8" />
                ))}
                <div style={{ width: 1, height: 18, background: 'rgba(51,65,85,0.8)' }} />
                {Object.keys(DIFFS).map((k) => (
                    <Chip key={k} active={diffKey === k} onClick={() => setDiffKey(k)} label={DIFFS[k].label} color="#f59e0b" small />
                ))}
                <button onClick={setNeutral} style={{ ...btnStyle, borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' }} title="Zero the resting tilt">
                    Set Neutral
                </button>
                {mode === 'Targets' && (
                    <button onClick={resetGame} style={btnStyle} title="Reset score"><RotateCcw size={12} /></button>
                )}
            </div>

            {/* Row 2 — angle + lean bar (+ score in Targets mode) */}
            {!hasIMU ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Waiting for IMU… <span style={{ color: '#475569' }}>(connect the board — roll arrives on bytes 12–17)</span>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* angle readout */}
                    <div style={{ width: 78, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 24, color: dirColor, lineHeight: 1 }}>{leanAbs.toFixed(1)}°</div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: dirColor }}>{dir}</div>
                    </div>

                    {/* lean bar / game track */}
                    <div style={{
                        position: 'relative', height: 54, flex: 1, borderRadius: 10,
                        background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(51,65,85,0.6)', overflow: 'hidden',
                    }}>
                        {/* bottom-out zones: beyond ±REACH_DEG the board hits the ground — targets stay inside */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${degToPct(-REACH_DEG)}%`, background: 'rgba(239,68,68,0.13)', borderRight: '1px dashed rgba(239,68,68,0.55)' }} />
                        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${100 - degToPct(REACH_DEG)}%`, background: 'rgba(239,68,68,0.13)', borderLeft: '1px dashed rgba(239,68,68,0.55)' }} />
                        <div style={{ position: 'absolute', left: '50%', top: 5, bottom: 5, width: 2, background: 'rgba(148,163,184,0.35)' }} />
                        <div style={{ position: 'absolute', left: 9, top: 5, color: '#4ade80', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>◀ L</div>
                        <div style={{ position: 'absolute', right: 9, top: 5, color: '#a855f7', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>R ▶</div>

                        {mode === 'Targets' && (
                            <div style={{
                                position: 'absolute', top: 4, bottom: 4,
                                left: `${targetCenterPct - targetHalfPct}%`, width: `${targetHalfPct * 2}%`, borderRadius: 7,
                                background: ui.inBand ? 'rgba(74,222,128,0.28)' : 'rgba(245,158,11,0.16)',
                                border: `1.5px solid ${ui.inBand ? '#4ade80' : 'rgba(245,158,11,0.6)'}`,
                                transition: 'left 0.25s, background 0.15s, border-color 0.15s',
                            }} />
                        )}

                        <div style={{ position: 'absolute', top: '50%', left: `${orbPct}%`, transform: 'translate(-50%,-50%)', transition: 'left 0.1s linear' }}>
                            <svg width="42" height="42" viewBox="0 0 42 42" style={{ display: 'block' }}>
                                <circle cx="21" cy="21" r="17" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="3" />
                                {mode === 'Targets' && (
                                    <circle cx="21" cy="21" r="17" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"
                                            strokeDasharray={`${2 * Math.PI * 17}`} strokeDashoffset={`${2 * Math.PI * 17 * (1 - ui.progress)}`}
                                            transform="rotate(-90 21 21)" style={{ transition: 'stroke-dashoffset 0.08s linear' }} />
                                )}
                                <circle cx="21" cy="21" r="10" fill={dirColor}
                                        style={{ filter: `drop-shadow(0 0 ${justHit ? 9 : 4}px ${dirColor})`, transition: 'fill 0.2s' }} />
                            </svg>
                        </div>
                    </div>

                    {/* score / best (Targets only) */}
                    {mode === 'Targets' && (
                        <div style={{ width: 64, flexShrink: 0, textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: 0.5 }}>SCORE</div>
                            <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: '#f59e0b', lineHeight: 1.1 }}>{score}</div>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>best {(bestHoldMs / 1000).toFixed(1)}s</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const Chip = ({ active, onClick, icon: Icon, label, color, small }) => (
    <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
        padding: small ? '4px 9px' : '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
        background: active ? color + '26' : 'rgba(30,41,59,0.5)',
        border: `1px solid ${active ? color : 'rgba(51,65,85,0.6)'}`,
        color: active ? color : '#94a3b8',
    }}>
        {Icon && <Icon size={12} />} {label}
    </button>
);

const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
    padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(51,65,85,0.6)', color: '#94a3b8',
};

export default LeanTrainer;
