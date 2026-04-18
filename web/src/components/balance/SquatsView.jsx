/**
 * SquatsView — squat mode.
 * Emphasizes: bilateral loading during flexion, depth (via total load increase as deeper = more weight),
 *              CoP stability during descent/ascent (velocity should stay low).
 * Layout: CoP + depth indicator + rep counter.
 */

import React, { useState, useEffect, useRef } from 'react';
import CoPDisplay from './CoPDisplay';
import CoPMetrics from './CoPMetrics';
import { ArrowDownToLine, ArrowUpToLine, Activity } from 'lucide-react';

const SquatsView = ({ instantaneousData, cop, trail, live, session, onReset }) => {
    const data = instantaneousData || { leftForce: 0, rightForce: 0 };
    const total = data.leftForce + data.rightForce;
    const inactive = total < 20;
    const leftPct = total > 0 ? (data.leftForce / total) * 100 : 50;
    const rightPct = total > 0 ? (data.rightForce / total) * 100 : 50;

    // Track a rolling baseline (resting weight) to detect squat phase
    const [baseline, setBaseline] = useState(0);
    const baselineSamplesRef = useRef([]);
    const [phase, setPhase] = useState('ready'); // ready | descending | bottom | ascending
    const [repCount, setRepCount] = useState(0);
    const [maxLoad, setMaxLoad] = useState(0);
    const lastTotalRef = useRef(total);
    const phaseStartRef = useRef(performance.now());

    // Collect baseline (first 3s of standing)
    useEffect(() => {
        if (inactive) return;
        if (phase !== 'ready') return;
        baselineSamplesRef.current.push(total);
        if (baselineSamplesRef.current.length > 60) {
            baselineSamplesRef.current.shift();
            const avg = baselineSamplesRef.current.reduce((a, b) => a + b, 0) / baselineSamplesRef.current.length;
            setBaseline(avg);
        }
    }, [total, inactive, phase]);

    // Squat phase detection: total force drops during descent (unweighting) then rises
    useEffect(() => {
        if (inactive || baseline === 0) return;
        const ratio = total / baseline;
        const prev = lastTotalRef.current;

        if (phase === 'ready' && ratio < 0.85) {
            // Descent detected — user is unweighting
            setPhase('descending');
            phaseStartRef.current = performance.now();
        } else if (phase === 'descending' && total > prev && ratio < 0.9) {
            // Bottom of squat
            setPhase('bottom');
            phaseStartRef.current = performance.now();
        } else if (phase === 'bottom' && ratio > 1.1) {
            // Ascending
            setPhase('ascending');
            if (total > maxLoad) setMaxLoad(total);
        } else if (phase === 'ascending' && Math.abs(ratio - 1) < 0.08) {
            // Back to baseline — rep complete
            setPhase('ready');
            setRepCount(c => c + 1);
        }

        lastTotalRef.current = total;
    }, [total, baseline, phase, inactive, maxLoad]);

    // Depth indicator: lower bar = deeper (less weight on sensors = more weight redistributing or unweighting during descent)
    const loadRatio = baseline > 0 ? Math.min(1.5, total / baseline) : 1;
    // Visual depth: 0 = top (standing), 100 = bottom (full squat)
    // During descent, total drops. Convert to depth: higher deviation from baseline = deeper
    const depthPct = baseline > 0 ? Math.max(0, Math.min(100, (1 - loadRatio) * 300)) : 0;

    const resetAll = () => {
        setRepCount(0);
        setMaxLoad(0);
        setBaseline(0);
        baselineSamplesRef.current = [];
        setPhase('ready');
        onReset();
    };

    const phaseColor = {
        ready: '#64748b',
        descending: '#f59e0b',
        bottom: '#ef4444',
        ascending: '#22c55e',
    }[phase];

    return (
        <div>
            {/* Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                <StatusCard label="Phase" value={phase.toUpperCase()} color={phaseColor} />
                <StatusCard label="Reps" value={repCount} color="#a78bfa" />
                <StatusCard label="Baseline" value={baseline > 0 ? baseline.toFixed(0) : '—'} color="#38bdf8" unit="N" />
                <StatusCard label="Peak Load" value={maxLoad > 0 ? maxLoad.toFixed(0) : '—'} color="#f59e0b" unit="N" />
            </div>

            {/* Main layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {/* Depth indicator - vertical bar next to CoP */}
                        <div style={{
                            width: 36,
                            height: 460,
                            background: 'rgba(15, 23, 42, 0.6)',
                            borderRadius: 18,
                            position: 'relative',
                            border: '1px solid rgba(51, 65, 85, 0.6)',
                            overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', top: 6, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#64748b', fontWeight: 700 }}>
                                TOP
                            </div>
                            <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#64748b', fontWeight: 700 }}>
                                DEEP
                            </div>
                            {/* Depth indicator dot */}
                            <div style={{
                                position: 'absolute',
                                left: 4,
                                right: 4,
                                top: `${8 + (depthPct * 0.8)}%`,
                                height: 8,
                                background: phaseColor,
                                borderRadius: 4,
                                boxShadow: `0 0 12px ${phaseColor}`,
                                transition: 'top 0.2s, background 0.3s',
                            }} />
                        </div>

                        <CoPDisplay
                            cop={cop}
                            trail={trail}
                            size={460}
                            inactive={inactive}
                            dotColor={phaseColor}
                        />
                    </div>

                    {/* L/R balance during squat */}
                    <div style={{ width: 460 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#94a3b8' }}>
                            <span>Bilateral Distribution (stay 45-55%)</span>
                            <span style={{ fontFamily: 'monospace', color: Math.abs(leftPct - rightPct) < 10 ? '#22c55e' : '#ef4444' }}>
                                {leftPct.toFixed(0)}% / {rightPct.toFixed(0)}%
                            </span>
                        </div>
                        <div style={{ height: 14, background: '#1e293b', borderRadius: 7, display: 'flex', overflow: 'hidden' }}>
                            <div style={{ width: `${leftPct}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.15s' }} />
                            <div style={{ width: `${rightPct}%`, background: 'linear-gradient(90deg, #9333ea, #a855f7)', transition: 'width 0.15s' }} />
                        </div>
                        {/* Ideal zone markers (45% and 55%) */}
                        <div style={{ position: 'relative', height: 4, marginTop: 2 }}>
                            <div style={{ position: 'absolute', left: '45%', width: 1, height: 4, background: '#22c55e' }} />
                            <div style={{ position: 'absolute', left: '55%', width: 1, height: 4, background: '#22c55e' }} />
                        </div>
                    </div>
                </div>

                <CoPMetrics live={live} session={session} onReset={resetAll} layout="vertical" />
            </div>

            {baseline === 0 && !inactive && (
                <div style={{ textAlign: 'center', marginTop: 12, color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
                    Stand still for 3 seconds to capture baseline...
                </div>
            )}

            {inactive && (
                <div style={{ textAlign: 'center', marginTop: 12, color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                    Step on board to begin
                </div>
            )}
        </div>
    );
};

const StatusCard = ({ label, value, color, unit }) => (
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
            {value}{unit && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 2 }}>{unit}</span>}
        </div>
    </div>
);

export default SquatsView;
