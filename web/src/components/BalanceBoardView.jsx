/**
 * BalanceBoardView — redesigned around Center of Pressure as the primary metric.
 *
 * Modes:
 *   - Exercise views: Standing, Heel Rise, Squats (each with exercise-specific overlays)
 *   - Game views: Target Tracking, Shape Tracing, Reactive Targets (CoP training)
 *
 * Uses useCoPMetrics for velocity, ellipse area, symmetry — both live (10s) and session windows.
 */

import React, { useState } from 'react';
import {
    User, ArrowUpToLine, ArrowDownWideNarrow,
    Target, Spline, Zap,
} from 'lucide-react';
import useCoPMetrics from '../hooks/useCoPMetrics';
import StandingView from './balance/StandingView';
import HeelRiseView from './balance/HeelRiseView';
import SquatsView from './balance/SquatsView';
import TargetTracking from './balance/games/TargetTracking';
import ShapeTracing from './balance/games/ShapeTracing';
import ReactiveTargets from './balance/games/ReactiveTargets';

const MODES = [
    { id: 'standing',   label: 'Standing',   icon: User,              category: 'exercise' },
    { id: 'heelrise',   label: 'Heel Rise',  icon: ArrowUpToLine,     category: 'exercise' },
    { id: 'squats',     label: 'Squats',     icon: ArrowDownWideNarrow, category: 'exercise' },
    { id: 'target',     label: 'Target',     icon: Target,            category: 'game' },
    { id: 'tracing',    label: 'Tracing',    icon: Spline,            category: 'game' },
    { id: 'reactive',   label: 'Reactive',   icon: Zap,               category: 'game' },
];

const BalanceBoardView = ({ instantaneousData }) => {
    const [mode, setMode] = useState('standing');
    const { cop, live, session, trail, resetSession } = useCoPMetrics(instantaneousData);

    const commonProps = { instantaneousData, cop, trail, live, session, onReset: resetSession };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Mode selector */}
            <div className="glass-panel" style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {/* Exercise group */}
                <div style={{ display: 'flex', gap: 4, padding: '2px 6px', borderRight: '1px solid rgba(51, 65, 85, 0.4)', marginRight: 4 }}>
                    <span style={{ alignSelf: 'center', fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>
                        Exercise
                    </span>
                    {MODES.filter(m => m.category === 'exercise').map(m => (
                        <ModeButton key={m.id} mode={m} active={mode === m.id} onClick={() => setMode(m.id)} activeColor="#38bdf8" />
                    ))}
                </div>
                {/* Game group */}
                <div style={{ display: 'flex', gap: 4, padding: '2px 6px' }}>
                    <span style={{ alignSelf: 'center', fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>
                        Training
                    </span>
                    {MODES.filter(m => m.category === 'game').map(m => (
                        <ModeButton key={m.id} mode={m} active={mode === m.id} onClick={() => setMode(m.id)} activeColor="#a855f7" />
                    ))}
                </div>
            </div>

            {/* Active view */}
            <div>
                {mode === 'standing' && <StandingView {...commonProps} />}
                {mode === 'heelrise' && <HeelRiseView {...commonProps} />}
                {mode === 'squats'   && <SquatsView {...commonProps} />}
                {mode === 'target'   && <TargetTracking cop={cop} instantaneousData={instantaneousData} onReset={resetSession} />}
                {mode === 'tracing'  && <ShapeTracing cop={cop} instantaneousData={instantaneousData} />}
                {mode === 'reactive' && <ReactiveTargets cop={cop} instantaneousData={instantaneousData} />}
            </div>
        </div>
    );
};

const ModeButton = ({ mode, active, onClick, activeColor }) => {
    const Icon = mode.icon;
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: active ? `${activeColor}22` : 'transparent',
                border: `1px solid ${active ? activeColor : 'transparent'}`,
                color: active ? activeColor : '#94a3b8',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.15s',
            }}
        >
            <Icon size={13} />
            {mode.label}
        </button>
    );
};

export default BalanceBoardView;
