/**
 * HeelRiseView — heel rise hold / fatigue mode.
 * Emphasizes: vertical weight transfer (toe %), bilateral synchrony, hold duration.
 * Layout: CoP + anterior/posterior bars showing how much weight is on toes vs heels.
 */

import React, { useState, useEffect, useRef } from 'react';
import CoPDisplay from './CoPDisplay';
import CoPMetrics from './CoPMetrics';
import { ArrowUpToLine, Play, Square } from 'lucide-react';

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
        onReset();
    };

    return (
        <div>
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

const StatusCard = ({ icon: Icon, label, value, color, pulse }) => (
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
