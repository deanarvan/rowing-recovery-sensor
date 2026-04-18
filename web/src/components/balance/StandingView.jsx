/**
 * StandingView — bilateral/single-leg stance mode.
 * Emphasizes: sway control (velocity), postural balance (ellipse area), L/R symmetry.
 * Layout: Large CoP center, metrics right side, foot % bars below.
 */

import React, { useState } from 'react';
import CoPDisplay from './CoPDisplay';
import CoPMetrics from './CoPMetrics';
import { Footprints, Eye, EyeOff } from 'lucide-react';

const StandingView = ({ instantaneousData, cop, trail, live, session, onReset }) => {
    const [challenge, setChallenge] = useState('eyes-open');
    const data = instantaneousData || { leftForce: 0, rightForce: 0 };
    const total = data.leftForce + data.rightForce;
    const leftPct = total > 0 ? Math.round((data.leftForce / total) * 100) : 50;
    const rightPct = total > 0 ? Math.round((data.rightForce / total) * 100) : 50;
    const inactive = total < 20;

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

            {/* Main layout: CoP center, metrics right */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 280px', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <CoPDisplay cop={cop} trail={trail} size={460} inactive={inactive} />

                    {/* L/R distribution bars below CoP */}
                    <div style={{ width: 460, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Footprints size={14} color="#4ade80" />
                            <div style={{ flex: 1, height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                                <div style={{ width: `${leftPct}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.15s' }} />
                            </div>
                            <span style={{ color: '#4ade80', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, minWidth: 40, textAlign: 'right' }}>{leftPct}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Footprints size={14} color="#a855f7" />
                            <div style={{ flex: 1, height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                                <div style={{ width: `${rightPct}%`, height: '100%', background: 'linear-gradient(90deg, #9333ea, #a855f7)', transition: 'width 0.15s' }} />
                            </div>
                            <span style={{ color: '#a855f7', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, minWidth: 40, textAlign: 'right' }}>{rightPct}%</span>
                        </div>
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

export default StandingView;
