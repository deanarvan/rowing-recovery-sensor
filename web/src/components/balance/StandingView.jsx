/**
 * StandingView — bilateral/single-leg stance mode.
 * Emphasizes: sway control (velocity), postural balance (ellipse area), L/R symmetry.
 * Layout: Large CoP center, metrics right side, foot % bars below.
 */

import React, { useState } from 'react';
import CoPDisplay from './CoPDisplay';
import CoPMetrics from './CoPMetrics';
import LeanTrainer from './LeanTrainer';
import CalibrationHelper from './CalibrationHelper';
import { isActiveStance } from '../../hooks/useCoPMetrics';
import { Footprints, Eye, EyeOff } from 'lucide-react';

const StandingView = ({ instantaneousData, cop, trail, live, session, onReset }) => {
    const [challenge, setChallenge] = useState('eyes-open');
    const data = instantaneousData || {};
    // L/R bars and the active gate run off the raw ADC sums (full resolution),
    // matching useCoPMetrics — not the ×0.005 rounded single-digit force.
    const lr = data.leftRaw || { heel: 0, ball: 0, toe: 0 };
    const rr = data.rightRaw || { heel: 0, ball: 0, toe: 0 };
    const rawLeft = lr.heel + lr.ball + lr.toe;
    const rawRight = rr.heel + rr.ball + rr.toe;
    const rawTotal = rawLeft + rawRight;
    const leftPct = rawTotal > 0 ? Math.round((rawLeft / rawTotal) * 100) : 50;
    const rightPct = rawTotal > 0 ? Math.round((rawRight / rawTotal) * 100) : 50;
    const inactive = !isActiveStance(data);

    return (
        <div>
            {/* Challenge selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, justifyContent: 'center' }}>
                {[
                    { id: 'eyes-open', label: 'Eyes Open', icon: Eye },
                    { id: 'eyes-closed', label: 'Eyes Closed', icon: EyeOff },
                    { id: 'single-left', label: 'Left Only', icon: Footprints, color: '#4ade80' },
                    { id: 'single-right', label: 'Right Only', icon: Footprints, color: '#a855f7' },
                ].map(opt => {
                    const Icon = opt.icon;
                    const active = challenge === opt.id;
                    return (
                        <button
                            key={opt.id}
                            onClick={() => setChallenge(opt.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 14px',
                                background: active ? (opt.color || '#38bdf8') + '33' : 'rgba(30, 41, 59, 0.5)',
                                border: `1px solid ${active ? (opt.color || '#38bdf8') : 'rgba(51, 65, 85, 0.6)'}`,
                                color: active ? (opt.color || '#38bdf8') : '#94a3b8',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                            }}
                        >
                            <Icon size={12} /> {opt.label}
                        </button>
                    );
                })}
            </div>

            {/* IMU board-roll L/R lean — compact bar above the CoP so both are visible together */}
            <LeanTrainer roll={data.roll} />

            {/* BNO055 calibration status + guided dance (collapsed by default) */}
            <CalibrationHelper cal={data.cal} />

            {/* Main layout: CoP center, metrics right */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <CoPDisplay cop={cop} trail={trail} size={460} inactive={inactive} />

                    {/* L/R vertical distribution bars below CoP — left bar = left foot, right bar = right foot, mirrors physical reality */}
                    <div style={{ width: 460, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, paddingTop: 4 }}>
                        <VerticalFootBar label="Left" pct={leftPct} color="#4ade80" gradFrom="#22c55e" gradTo="#4ade80" />
                        <VerticalFootBar label="Right" pct={rightPct} color="#a855f7" gradFrom="#9333ea" gradTo="#a855f7" />
                    </div>
                </div>

                <CoPMetrics live={live} session={session} onReset={onReset} layout="vertical" />
            </div>

            {inactive && (
                <div style={{ textAlign: 'center', marginTop: 12, color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                    Step on board to begin
                </div>
            )}
        </div>
    );
};

const VerticalFootBar = ({ label, pct, color, gradFrom, gradTo }) => {
    const fillPct = Math.max(0, Math.min(100, pct));
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {/* Vertical fill bar */}
            <div style={{
                width: '100%',
                height: 110,
                background: '#1e293b',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: 8,
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Fill rises from bottom */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${fillPct}%`,
                    background: `linear-gradient(0deg, ${gradFrom}, ${gradTo})`,
                    transition: 'height 0.15s ease-out',
                    boxShadow: `0 0 12px ${color}66`,
                }} />
                {/* 50% reference line */}
                <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: '50%',
                    height: 1,
                    background: 'rgba(148, 163, 184, 0.4)',
                    pointerEvents: 'none',
                }} />
                {/* Percentage label centered in bar */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: 24,
                    textShadow: '0 1px 4px rgba(0, 0, 0, 0.7)',
                    pointerEvents: 'none',
                }}>
                    {fillPct}%
                </div>
            </div>
            {/* Foot label below bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontSize: 12, fontWeight: 700 }}>
                <Footprints size={14} />
                {label}
            </div>
        </div>
    );
};

export default StandingView;
