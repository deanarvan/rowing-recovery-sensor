import React from 'react';
import { Timer, Activity, Zap, PlaySquare, Square } from 'lucide-react';

export function IntervalTrainer({ intervalProps }) {
    const {
        intervalConfig: config,
        intervalState: state,
        startIntervals,
        stopIntervals,
        toggleConfig,
        fatiguedStrokeCount
    } = intervalProps;

    if (!config.enabled) {
        return (
            <div style={{ padding: '12px 16px', background: '#1e293b', borderRadius: '8px', color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Timer size={18} color="#94a3b8" />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Interval Training Mode</span>
                </div>
                <button
                    onClick={toggleConfig}
                    style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                    Enable
                </button>
            </div>
        );
    }

    // Determine banner color and text based on phase and fatigue
    let bannerBg = '#334155'; // idle
    let bannerText = 'Ready to start intervals';
    let bannerColor = '#cbd5e1';

    if (state.phase === 'work') {
        if (fatiguedStrokeCount > 0) {
            bannerBg = '#fef08a'; // yellow warning
            bannerText = `Right leg fading — ${config.consecutiveStrokes - fatiguedStrokeCount} more stroke(s) before forced rest`;
            bannerColor = '#854d0e';
        } else {
            bannerBg = '#bbf7d0'; // green go
            bannerText = 'GO — Row bilaterally';
            bannerColor = '#166534';
        }
    } else if (state.phase === 'rest') {
        bannerBg = '#fecaca'; // red rest

        // Check if the last interval was fatigue-triggered
        const lastInterval = state.intervalsCompleted[state.intervalsCompleted.length - 1];
        if (lastInterval && lastInterval.isFatigueTriggered) {
            bannerText = `REST — Right leg fatigued at stroke ${lastInterval.fatigueOnsetStroke || lastInterval.strokeCount}`;
        } else {
            bannerText = 'REST — Recover for next interval';
        }
        bannerColor = '#991b1b';
    }

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
            {/* Header / Banner */}
            <div style={{ background: bannerBg, color: bannerColor, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.3s' }}>
                <div style={{ fontWeight: 800, fontSize: '15px' }}>
                    {bannerText}
                </div>

                {state.phase !== 'idle' && (
                    <div style={{ fontSize: '24px', fontWeight: 900, fontFamily: 'monospace' }}>
                        {Math.floor(state.timeRemaining / 60)}:{(state.timeRemaining % 60).toString().padStart(2, '0')}
                    </div>
                )}
            </div>

            {/* Controls & Stats */}
            <div style={{ padding: '16px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Controls */}
                <div style={{ display: 'flex', gap: '8px', borderRight: '1px solid #e2e8f0', paddingRight: '24px' }}>
                    {state.phase === 'idle' ? (
                        <button onClick={startIntervals} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                            <PlaySquare size={16} /> Start
                        </button>
                    ) : (
                        <button onClick={stopIntervals} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                            <Square size={16} /> Stop
                        </button>
                    )}
                    <button onClick={toggleConfig} style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        Disable
                    </button>
                </div>

                {/* Current Status */}
                <div style={{ display: 'flex', gap: '24px' }}>
                    <div>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Current Interval</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>#{state.currentInterval}</div>
                    </div>
                    {state.phase === 'work' && (
                        <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Phase Target</div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{config.workDuration}s Work</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Interval History (if any) */}
            {state.intervalsCompleted.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px', background: '#ffffff' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Recent Intervals</div>
                    <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                        {state.intervalsCompleted.map((int, i) => (
                            <div key={i} style={{ minWidth: '180px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', background: int.isFatigueTriggered ? '#fef2f2' : '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>#{int.intervalNumber}</span>
                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{int.strokeCount} strokes</span>
                                </div>

                                <div style={{ fontSize: '11px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>Fatigue Onset:</span>
                                        <span style={{ fontWeight: 600, color: int.fatigueOnsetStroke ? '#ef4444' : '#22c55e' }}>
                                            {int.fatigueOnsetStroke ? `Stroke ${int.fatigueOnsetStroke}` : 'None'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>Avg SI:</span>
                                        <span style={{ fontWeight: 600 }}>{int.avgSI ? `+${int.avgSI.toFixed(0)}%` : '--'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>R Peak Trend:</span>
                                        <span style={{ fontWeight: 600 }}>
                                            {int.startRightPeak && int.endRightPeak ? `${Math.round(int.startRightPeak)} → ${Math.round(int.endRightPeak)}` : '--'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )).reverse()} {/* Show most recent first */}
                    </div>
                </div>
            )}
        </div>
    );
}

export default IntervalTrainer;
