/**
 * HeelRiseView — heel rise / Achilles rehab mode.
 *
 * Two faces, chosen by whether IMU board-angle is on the wire:
 *   • With angle (BFS board over BLE): the gamified Alfredson eccentric-tempo heel raise — live
 *     ankle-angle rocker (AnkleRocker), side-to-side balance gradient (SideToSideLevel), per-rep
 *     ROM + controlled-descent tempo scoring + L/R symmetry, via useAchillesMetrics.
 *   • Without angle (USB board / simulation / legacy firmware): the original force-only heel-rise
 *     hold/fatigue tool (toe %, hold duration, reps) — unchanged — plus a hint to connect the BFS
 *     board for live ankle tracking.
 */

import React, { useState, useEffect, useRef } from 'react';
import CoPDisplay from './CoPDisplay';
import CoPMetrics from './CoPMetrics';
import AnkleRocker from './AnkleRocker';
import SideToSideLevel from './SideToSideLevel';
import useAchillesMetrics from '../../hooks/useAchillesMetrics';
import { ArrowUpToLine, Play, Square, Crosshair, RefreshCw, RotateCcw, Minus, Plus, Star, Bluetooth } from 'lucide-react';

const TARGET_ROM = 20;          // deg plantarflexion goal band on the rocker
const MIN_TARGET = 2, MAX_TARGET = 6; // eccentric-tempo target bounds (s)

const tempoColor = (key) => (key === 'excellent' ? '#22c55e' : key === 'good' ? '#38bdf8' : '#ef4444');
const symColor = (s) => (s < 10 ? '#22c55e' : s < 20 ? '#f59e0b' : '#ef4444');

const HeelRiseView = ({ instantaneousData, cop, trail, live, session, onReset }) => {
    const data = instantaneousData || { leftRaw: { heel: 0, ball: 0, toe: 0 }, rightRaw: { heel: 0, ball: 0, toe: 0 }, leftForce: 0, rightForce: 0 };

    // Compute front (toe) percentage per foot
    const leftToeArea = (data.leftRaw.ball || 0) + (data.leftRaw.toe || 0);
    const leftHeel = data.leftRaw.heel || 0;
    const leftFrontPct = (leftToeArea + leftHeel) > 0 ? (leftToeArea / (leftToeArea + leftHeel)) * 100 : 50;

    const rightToeArea = (data.rightRaw.ball || 0) + (data.rightRaw.toe || 0);
    const rightHeel = data.rightRaw.heel || 0;
    const rightFrontPct = (rightToeArea + rightHeel) > 0 ? (rightToeArea / (rightToeArea + rightHeel)) * 100 : 50;

    // Overall front %
    const totalFront = leftToeArea + rightToeArea;
    const totalAll = totalFront + leftHeel + rightHeel;
    const overallFrontPct = totalAll > 0 ? (totalFront / totalAll) * 100 : 50;

    const total = data.leftForce + data.rightForce;
    const inactive = total < 20;

    // Hold timer — starts when overall front % > 75 (user is up on toes)
    const [isHolding, setIsHolding] = useState(false);
    const [holdDuration, setHoldDuration] = useState(0);
    const [bestHold, setBestHold] = useState(0);
    const [repCount, setRepCount] = useState(0);
    const holdStartRef = useRef(null);

    // Achilles (IMU) engine — eccentric tempo target is user-adjustable
    const [targetEccentricS, setTargetEccentricS] = useState(3);
    const ankle = useAchillesMetrics(instantaneousData, { targetEccentricS });

    useEffect(() => {
        const onToes = overallFrontPct > 75 && !inactive;
        if (onToes && !isHolding) {
            setIsHolding(true);
            holdStartRef.current = performance.now();
            setRepCount(c => c + 1);
        } else if (!onToes && isHolding) {
            setIsHolding(false);
            const duration = (performance.now() - holdStartRef.current) / 1000;
            if (duration > bestHold) setBestHold(duration);
            setHoldDuration(0);
        }
    }, [overallFrontPct, inactive, isHolding, bestHold]);

    useEffect(() => {
        if (!isHolding) return;
        const id = setInterval(() => {
            setHoldDuration((performance.now() - holdStartRef.current) / 1000);
        }, 100);
        return () => clearInterval(id);
    }, [isHolding]);

    const resetAll = () => {
        setBestHold(0);
        setRepCount(0);
        setHoldDuration(0);
        ankle.reset();
        onReset();
    };

    const adjustTarget = (delta) => setTargetEccentricS(t => Math.max(MIN_TARGET, Math.min(MAX_TARGET, t + delta)));

    // ════════════════════════════════════════════════════════════════════════
    // ACHILLES GAME (IMU board-angle present)
    // ════════════════════════════════════════════════════════════════════════
    if (ankle.hasAngle) {
        const last = ankle.rep.lastTempoScore;
        const eccPct = Math.min(100, (ankle.eccentricElapsedS / targetEccentricS) * 100);
        const descending = ankle.phase === 'DESCEND';

        return (
            <div>
                {/* Status row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
                    <StatusCard label="Ankle Angle" value={`${ankle.angle >= 0 ? '+' : ''}${ankle.angle.toFixed(0)}°`} color="#38bdf8" />
                    <StatusCard label="Peak ROM / Best" value={`${ankle.peakThisRep.toFixed(0)}° / ${ankle.rom.best.toFixed(0)}°`} color="#22c55e" />
                    <StatusCard label="Reps" value={ankle.rep.count} color="#a78bfa" />
                    <StatusCard
                        label="Last Eccentric"
                        value={ankle.rep.count > 0 ? `${ankle.rep.lastEccentricS.toFixed(1)}s` : '—'}
                        color={last ? tempoColor(last.key) : '#64748b'}
                        sub={last ? <StarRating stars={last.stars} color={tempoColor(last.key)} /> : null}
                    />
                    <StatusCard label="L/R Symmetry" value={`${ankle.symmetryPct.toFixed(0)}%`} color={symColor(ankle.symmetryPct)} />
                </div>

                {/* Main layout: rocker + balance on the left, metrics + weight on the right */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'start', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <AnkleRocker
                            angle={ankle.angle}
                            phase={ankle.phase}
                            peakThisRep={ankle.peakThisRep}
                            best={ankle.rom.best}
                            targetRom={TARGET_ROM}
                            targetEccentricS={targetEccentricS}
                            eccentricElapsedS={ankle.eccentricElapsedS}
                            lateralTiltDeg={ankle.lateralTiltDeg}
                            hasAngle={ankle.hasAngle}
                        />

                        <SideToSideLevel rollDeg={ankle.rollDeg} lateralTiltDeg={ankle.lateralTiltDeg} />

                        {/* Live eccentric-tempo bar */}
                        <div style={{ width: '100%', maxWidth: 420 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#94a3b8' }}>
                                <span>Controlled descent</span>
                                <span style={{ fontFamily: 'monospace', color: descending ? '#facc15' : '#64748b' }}>
                                    {ankle.eccentricElapsedS.toFixed(1)}s / {targetEccentricS.toFixed(0)}s
                                </span>
                            </div>
                            <div style={{ height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                                <div style={{
                                    width: `${eccPct}%`, height: '100%',
                                    background: eccPct >= 85 ? 'linear-gradient(90deg, #16a34a, #22c55e)' : 'linear-gradient(90deg, #ca8a04, #facc15)',
                                    transition: 'width 0.1s, background 0.2s',
                                }} />
                                {/* target line at 100% is the right edge; mark the "good control" 85% line */}
                                <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 2, background: '#22c55e', opacity: 0.7 }} />
                            </div>
                            <div style={{ fontSize: 9, color: '#22c55e', marginTop: 2 }}>Reach the green line — lower slowly for full eccentric credit</div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 2 }}>
                            <CtrlButton icon={Crosshair} label="Set Neutral" onClick={ankle.setNeutral} />
                            <CtrlButton icon={RefreshCw} label="Flip Dir" onClick={ankle.flipDirection} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.6)', borderRadius: 8 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Tempo</span>
                                <button onClick={() => adjustTarget(-1)} style={stepBtn}><Minus size={12} /></button>
                                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#e2e8f0', minWidth: 22, textAlign: 'center' }}>{targetEccentricS}s</span>
                                <button onClick={() => adjustTarget(1)} style={stepBtn}><Plus size={12} /></button>
                            </div>
                            <CtrlButton icon={RotateCcw} label="Reset" onClick={resetAll} />
                        </div>
                    </div>

                    {/* Right column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <CoPMetrics live={live} session={session} onReset={resetAll} layout="vertical" />

                        {/* Compact weight-position CoP */}
                        <div className="glass-panel" style={{ padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Weight Position</span>
                            <CoPDisplay cop={cop} trail={trail} size={150} inactive={inactive} dotColor={descending ? '#facc15' : '#38bdf8'} />
                        </div>

                        {/* Recent reps */}
                        {ankle.reps.length > 0 && (
                            <div className="glass-panel" style={{ padding: 12 }}>
                                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 6 }}>Recent Reps</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {ankle.reps.slice(-5).reverse().map((r, i) => (
                                        <div key={r.t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                                            <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{r.romDeg.toFixed(0)}° · {r.eccentricS.toFixed(1)}s</span>
                                            <StarRating stars={r.tempoScore.stars} color={tempoColor(r.tempoScore.key)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Forefoot load bars (kept — show heel-off + force-based L/R balance) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
                    <FootRiseBar label="Left forefoot" pct={leftFrontPct} color="#4ade80" />
                    <FootRiseBar label="Right forefoot" pct={rightFrontPct} color="#a855f7" />
                </div>

                {inactive && (
                    <div style={{ textAlign: 'center', marginTop: 12, color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
                        Stand on the board — the angle gauge is live, step on to score reps.
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // FORCE-ONLY FALLBACK (no IMU angle on the wire) — original behavior
    // ════════════════════════════════════════════════════════════════════════
    return (
        <div>
            {/* Hint: how to unlock the Achilles game */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 12, padding: '8px 14px', borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)',
                color: '#7dd3fc', fontSize: 12, fontWeight: 600,
            }}>
                <Bluetooth size={14} />
                Connect the BFS board over Bluetooth for live ankle-angle tracking &amp; the eccentric-tempo game.
            </div>

            {/* Hold status bar */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 10,
                marginBottom: 14,
            }}>
                <StatusCard
                    icon={isHolding ? Play : Square}
                    label="Status"
                    value={isHolding ? 'HOLDING' : 'Down'}
                    color={isHolding ? '#22c55e' : '#64748b'}
                    pulse={isHolding}
                />
                <StatusCard
                    label="Current Hold"
                    value={holdDuration.toFixed(1) + 's'}
                    color="#38bdf8"
                />
                <StatusCard
                    label="Best Hold"
                    value={bestHold.toFixed(1) + 's'}
                    color="#f59e0b"
                />
                <StatusCard
                    label="Reps"
                    value={repCount}
                    color="#a78bfa"
                />
            </div>

            {/* Main layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <CoPDisplay
                        cop={cop}
                        trail={trail}
                        size={460}
                        inactive={inactive}
                        dotColor={isHolding ? '#22c55e' : '#38bdf8'}
                        ringColor={isHolding ? '#22c55e' : '#334155'}
                    />

                    {/* Anterior/posterior bars for each foot */}
                    <div style={{ width: 460, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <FootRiseBar label="Left" pct={leftFrontPct} color="#4ade80" />
                        <FootRiseBar label="Right" pct={rightFrontPct} color="#a855f7" />
                    </div>

                    {/* Overall front bar */}
                    <div style={{ width: 460 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#94a3b8' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ArrowUpToLine size={12} /> Forefoot Load</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: overallFrontPct > 75 ? '#22c55e' : '#94a3b8' }}>
                                {overallFrontPct.toFixed(0)}%
                            </span>
                        </div>
                        <div style={{ height: 14, background: '#1e293b', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                                width: `${overallFrontPct}%`,
                                height: '100%',
                                background: overallFrontPct > 75 ? 'linear-gradient(90deg, #16a34a, #22c55e)' : 'linear-gradient(90deg, #475569, #64748b)',
                                transition: 'width 0.15s, background 0.2s',
                            }} />
                            {/* 75% threshold marker */}
                            <div style={{
                                position: 'absolute',
                                left: '75%',
                                top: 0, bottom: 0,
                                width: 2,
                                background: '#f59e0b',
                                boxShadow: '0 0 4px #f59e0b',
                            }} />
                        </div>
                        <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 2 }}>Goal line (75%): on toes</div>
                    </div>
                </div>

                <CoPMetrics live={live} session={session} onReset={resetAll} layout="vertical" />
            </div>

            {inactive && (
                <div style={{ textAlign: 'center', marginTop: 12, color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                    Step on board to begin
                </div>
            )}
        </div>
    );
};

const stepBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
    background: 'rgba(51,65,85,0.6)', border: '1px solid rgba(71,85,105,0.6)', color: '#e2e8f0',
};

const CtrlButton = ({ icon: Icon, label, onClick }) => (
    <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.6)',
        color: '#cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    }}>
        <Icon size={13} /> {label}
    </button>
);

const StarRating = ({ stars, color }) => (
    <div style={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
        {[1, 2, 3].map(n => (
            <Star key={n} size={12} fill={n <= stars ? color : 'none'} color={n <= stars ? color : '#475569'} />
        ))}
    </div>
);

const StatusCard = ({ icon: Icon, label, value, color, pulse, sub }) => (
    <div style={{
        padding: '10px 14px',
        background: 'rgba(15, 23, 42, 0.6)',
        borderRadius: 8,
        border: `1px solid ${color}66`,
        textAlign: 'center',
        animation: pulse ? 'pulse 1s ease-in-out infinite' : 'none',
    }}>
        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>
            {Icon && <Icon size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
            {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color }}>
            {value}
        </div>
        {sub && <div style={{ marginTop: 4 }}>{sub}</div>}
    </div>
);

const FootRiseBar = ({ label, pct, color }) => (
    <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 10, color: '#94a3b8' }}>
            <span>{label}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: pct > 75 ? color : '#94a3b8' }}>{pct.toFixed(0)}% fwd</span>
        </div>
        <div style={{ height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
                width: `${pct}%`,
                height: '100%',
                background: pct > 75 ? color : '#475569',
                transition: 'width 0.15s, background 0.2s',
            }} />
        </div>
    </div>
);

export default HeelRiseView;
