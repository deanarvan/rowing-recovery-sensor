import React, { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
    BarChart, Bar, ScatterChart, Scatter, ResponsiveContainer, ReferenceArea,
    Legend, Cell, Area, AreaChart
} from 'recharts';
import { Activity, TrendingUp, Target, Footprints, BarChart3, Zap, Award, ArrowRight } from 'lucide-react';
import RecoveryScoreGauge from './RecoveryScoreGauge';
import IntervalTrainer from './IntervalTrainer';

/**
 * Recovery targets based on Achilles rehab physiology.
 * These define the progression milestones.
 */
const TARGETS = {
    symmetry: { current: 10, stretch: 5, label: '±10%', stretchLabel: '±5%' },
    impulseRatio: { current: 45, stretch: 48, label: '45-55%', stretchLabel: '48-52%' },
    shapeDiff: { current: 0.25, stretch: 0.10, label: '<0.25', stretchLabel: '<0.10' },
    cop: { current: 0.3, stretch: 0.15, label: '<0.30', stretchLabel: '<0.15' },
    fatigue: { current: 1.0, stretch: 0.3, label: '<1.0%/str', stretchLabel: '<0.3%/str' },
    score: { current: 70, stretch: 85, label: '70+', stretchLabel: '85+' }
};

/** Small target badge component */
const TargetBadge = ({ met, label, stretch = false }) => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '9px',
        fontWeight: 700,
        background: met ? 'rgba(34, 197, 94, 0.15)' : stretch ? 'rgba(251, 191, 36, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        color: met ? '#4ade80' : stretch ? '#fbbf24' : '#f87171',
        border: `1px solid ${met ? 'rgba(34,197,94,0.3)' : stretch ? 'rgba(251,191,36,0.25)' : 'rgba(239,68,68,0.25)'}`,
    }}>
        {met ? '✓' : '→'} {label}
    </span>
);

/** Coaching tip shown below each chart */
const CoachTip = ({ text }) => (
    <div style={{
        marginTop: '8px',
        padding: '8px 12px',
        background: 'rgba(56, 189, 248, 0.06)',
        border: '1px solid rgba(56, 189, 248, 0.15)',
        borderRadius: '6px',
        fontSize: '10px',
        color: '#94a3b8',
        lineHeight: 1.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px'
    }}>
        <ArrowRight size={12} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '1px' }} />
        <span>{text}</span>
    </div>
);

/**
 * RecoveryDashboard — Full tab rendering all 6 bilateral asymmetry metrics
 * with recovery targets, coaching tips, and visual progress guidance.
 */
const RecoveryDashboard = ({ completedStrokes, recoveryScore, fatigueData, injuredSide, intervalProps, strokePhase, strokeCount, cumulativeDataLength }) => {
    const [selectedStroke, setSelectedStroke] = useState(null);

    const strokes = completedStrokes || [];
    const hasData = strokes.length >= 2;
    const injuredLabel = injuredSide === 'left' ? 'Left (Injured)' : 'Right (Injured)';
    const healthyLabel = injuredSide === 'left' ? 'Right (Healthy)' : 'Left (Healthy)';

    // ---- Derived chart data ----

    // Metric 1: Symmetry Index time series
    const symmetryData = useMemo(() =>
        strokes.map(s => ({
            stroke: s.strokeNumber,
            si: s.symmetryIndex,
            color: Math.abs(s.symmetryIndex) <= 10 ? '#4ade80'
                : Math.abs(s.symmetryIndex) <= 25 ? '#fbbf24' : '#f87171'
        })),
        [strokes]
    );

    // Metric 2: Impulse per stroke
    const impulseData = useMemo(() =>
        strokes.map(s => ({
            stroke: s.strokeNumber,
            left: s.leftImpulse,
            right: s.rightImpulse,
            ratio: s.impulseRatio
        })),
        [strokes]
    );

    // Metric 3: Force curve overlay for selected stroke
    const selectedStrokeData = useMemo(() => {
        const idx = selectedStroke != null ? selectedStroke : strokes.length - 1;
        const s = strokes[idx];
        if (!s || !s.forceCurve || s.forceCurve.length < 2) return [];

        const leftPeak = s.leftPeak || 1;
        const rightPeak = s.rightPeak || 1;
        const totalSamples = s.forceCurve.length;

        return s.forceCurve.map((pt, i) => ({
            position: Math.round((i / totalSamples) * 100),
            leftNorm: (pt.l / leftPeak) * 100,
            rightNorm: (pt.r / rightPeak) * 100
        }));
    }, [strokes, selectedStroke]);

    // Metric 4: CoP data per stroke
    const copData = useMemo(() =>
        strokes.map(s => {
            const avgLeftCoP = s.leftCoPTrace && s.leftCoPTrace.length > 0
                ? s.leftCoPTrace.reduce((a, b) => a + b, 0) / s.leftCoPTrace.length : 0;
            const avgRightCoP = s.rightCoPTrace && s.rightCoPTrace.length > 0
                ? s.rightCoPTrace.reduce((a, b) => a + b, 0) / s.rightCoPTrace.length : 0;
            return {
                stroke: s.strokeNumber,
                leftCoP: Math.round(avgLeftCoP * 100) / 100,
                rightCoP: Math.round(avgRightCoP * 100) / 100,
                asymmetry: s.copAsymmetry
            };
        }),
        [strokes]
    );

    // Metric 5: Fatigue scatter
    const fatigueScatterData = useMemo(() =>
        strokes.map(s => ({
            stroke: s.strokeNumber,
            ratio: s.leftPeak > 0 ? Math.round((s.rightPeak / s.leftPeak) * 100) / 100 : 1,
            trend: fatigueData.intercept + fatigueData.slope * (s.strokeNumber - 1)
        })),
        [strokes, fatigueData]
    );

    // ---- Compute current metric averages for target checking ----
    const avgSI = useMemo(() => {
        if (strokes.length === 0) return null;
        return strokes.reduce((s, st) => s + Math.abs(st.symmetryIndex || 0), 0) / strokes.length;
    }, [strokes]);

    const avgIR = useMemo(() => {
        if (strokes.length === 0) return null;
        return strokes.reduce((s, st) => s + (st.impulseRatio || 0), 0) / strokes.length;
    }, [strokes]);

    const avgSD = useMemo(() => {
        if (strokes.length === 0) return null;
        return strokes.reduce((s, st) => s + (st.shapeDifference || 0), 0) / strokes.length;
    }, [strokes]);

    const avgCoP = useMemo(() => {
        if (strokes.length === 0) return null;
        return Math.abs(strokes.reduce((s, st) => s + (st.copAsymmetry || 0), 0) / strokes.length);
    }, [strokes]);

    const fatiguePct = Math.abs((fatigueData.slope || 0) * 100);

    // ---- Generate coaching tips based on current data ----
    const siTip = useMemo(() => {
        if (avgSI === null) return '';
        if (avgSI <= 5) return 'Excellent bilateral symmetry. Maintain this consistency as you increase intensity.';
        if (avgSI <= 10) return 'Good symmetry range. Focus on matching push-off force with both legs equally through each stroke.';
        if (avgSI <= 25) return 'Moderate asymmetry — your healthy leg is compensating. Try slowing stroke rate by 2-3 SPM and focus on consciously loading the injured side.';
        return 'High asymmetry detected. Reduce intensity and use shorter work intervals. Focus on controlled, deliberate loading of the injured leg.';
    }, [avgSI]);

    const fatigueTip = useMemo(() => {
        if (!fatigueData || strokes.length < 3) return '';
        if (fatigueData.slope > -0.003) return 'Fatigue rate is well controlled. You can start extending work intervals by 10-15 seconds.';
        if (fatigueData.slope > -0.01) return 'Mild fatigue trend — right leg losing force over time. Try 30s work / 30s rest intervals to build endurance without overloading.';
        return 'Significant fatigue asymmetry — injured leg drops off sharply. Shorten work intervals to 20s and focus on the Alfredson eccentric protocol off the erg.';
    }, [fatigueData, strokes.length]);

    const copTip = useMemo(() => {
        if (avgCoP === null) return '';
        if (avgCoP <= 0.15) return 'Load distribution between feet is well balanced. Both feet are loading heel-to-toe similarly.';
        if (avgCoP <= 0.3) return 'Slight CoP imbalance — one foot is more toe-loaded. This may indicate guarding. Focus on driving through the heel on the injured side.';
        return 'Significant CoP asymmetry — the injured foot is likely avoiding heel loading (Achilles protection reflex). Practice slow heel-raises off the erg to rebuild confidence.';
    }, [avgCoP]);

    // ---- Empty state ----
    if (!hasData) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {intervalProps && <IntervalTrainer intervalProps={intervalProps} />}

                {/* Recovery Targets Overview — always visible */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <Award size={20} style={{ color: '#fbbf24' }} />
                        <h3 style={{ margin: 0, fontSize: '16px', color: '#e2e8f0' }}>Recovery Targets</h3>
                        <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 'auto' }}>Start a session to track progress</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {[
                            { label: 'Symmetry Index', target: TARGETS.symmetry.label, stretch: TARGETS.symmetry.stretchLabel, desc: 'Bilateral force balance' },
                            { label: 'Impulse Ratio', target: TARGETS.impulseRatio.label, stretch: TARGETS.impulseRatio.stretchLabel, desc: 'Work distribution between legs' },
                            { label: 'Shape Difference', target: TARGETS.shapeDiff.label, stretch: TARGETS.shapeDiff.stretchLabel, desc: 'Force curve similarity' },
                            { label: 'CoP Asymmetry', target: TARGETS.cop.label, stretch: TARGETS.cop.stretchLabel, desc: 'Heel-to-toe loading balance' },
                            { label: 'Fatigue Rate', target: TARGETS.fatigue.label, stretch: TARGETS.fatigue.stretchLabel, desc: 'Endurance under load' },
                            { label: 'Recovery Score', target: TARGETS.score.label, stretch: TARGETS.score.stretchLabel, desc: 'Composite rehabilitation metric' }
                        ].map(t => (
                            <div key={t.label} style={{
                                padding: '12px',
                                background: '#1e293b',
                                borderRadius: '8px',
                                border: '1px solid #334155'
                            }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>{t.label}</div>
                                <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '8px' }}>{t.desc}</div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '8px', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
                                        Target: {t.target}
                                    </span>
                                    <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '8px', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                                        Stretch: {t.stretch}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
                    <Activity size={48} style={{ color: '#475569', marginBottom: '16px' }} />
                    <h3 style={{ color: '#e2e8f0', margin: '0 0 8px' }}>Waiting for Stroke Data</h3>
                    <p style={{ color: '#94a3b8', margin: 0, maxWidth: '400px', marginInline: 'auto', lineHeight: 1.5 }}>
                        Start a rowing session (Demo or Hardware). The recovery metrics will appear after at least 2 valid strokes are detected.
                        Currently: <strong>{strokes.length}</strong> strokes recorded.
                    </p>
                    {/* Debug telemetry — visible so we can diagnose issues */}
                    <div style={{
                        marginTop: '16px',
                        padding: '8px 16px',
                        background: '#0f172a',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#64748b',
                        display: 'inline-block'
                    }}>
                        phase: <span style={{ color: strokePhase === 'drive' ? '#4ade80' : strokePhase === 'recovery' ? '#38bdf8' : '#64748b' }}>{strokePhase || 'none'}</span>
                        {' | '}strokeCount: <span style={{ color: '#e2e8f0' }}>{strokeCount || 0}</span>
                        {' | '}completedStrokes: <span style={{ color: strokes.length > 0 ? '#fbbf24' : '#64748b' }}>{strokes.length}</span>
                        {' | '}dataPoints: <span style={{ color: '#e2e8f0' }}>{cumulativeDataLength || 0}</span>
                        {' | '}recoveryScore: <span style={{ color: '#e2e8f0' }}>{recoveryScore != null ? recoveryScore : 'null'}</span>
                    </div>
                </div>
            </div>
        );
    }

    const currentStrokeIdx = selectedStroke != null ? selectedStroke : strokes.length - 1;

    // Target status checks
    const siMet = avgSI !== null && avgSI <= TARGETS.symmetry.current;
    const siStretch = avgSI !== null && avgSI <= TARGETS.symmetry.stretch;
    const irMet = avgIR !== null && Math.abs(avgIR - 50) <= (50 - TARGETS.impulseRatio.current);
    const irStretch = avgIR !== null && Math.abs(avgIR - 50) <= (50 - TARGETS.impulseRatio.stretch);
    const sdMet = avgSD !== null && avgSD <= TARGETS.shapeDiff.current;
    const sdStretch = avgSD !== null && avgSD <= TARGETS.shapeDiff.stretch;
    const copMet = avgCoP !== null && avgCoP <= TARGETS.cop.current;
    const copStretch = avgCoP !== null && avgCoP <= TARGETS.cop.stretch;
    const fatMet = fatiguePct <= TARGETS.fatigue.current;
    const fatStretch = fatiguePct <= TARGETS.fatigue.stretch;
    const scoreMet = recoveryScore !== null && recoveryScore >= TARGETS.score.current;
    const scoreStretch = recoveryScore !== null && recoveryScore >= TARGETS.score.stretch;

    const targetsHit = [siMet, irMet, sdMet, copMet, fatMet, scoreMet].filter(Boolean).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {intervalProps && <IntervalTrainer intervalProps={intervalProps} />}

            {/* Target Progress Summary Bar */}
            <div className="glass-panel" style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                background: targetsHit >= 5 ? 'rgba(34, 197, 94, 0.08)' : targetsHit >= 3 ? 'rgba(251, 191, 36, 0.06)' : 'rgba(239, 68, 68, 0.05)',
                borderColor: targetsHit >= 5 ? 'rgba(34,197,94,0.2)' : targetsHit >= 3 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.12)'
            }}>
                <Award size={20} style={{ color: targetsHit >= 5 ? '#4ade80' : targetsHit >= 3 ? '#fbbf24' : '#f87171' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                        Recovery Targets: {targetsHit}/6 met
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <TargetBadge met={siMet} label={siStretch ? `SI ✓✓` : `SI ${TARGETS.symmetry.label}`} stretch={!siMet} />
                        <TargetBadge met={irMet} label={irStretch ? `IR ✓✓` : `IR ${TARGETS.impulseRatio.label}`} stretch={!irMet} />
                        <TargetBadge met={sdMet} label={sdStretch ? `SD ✓✓` : `SD ${TARGETS.shapeDiff.label}`} stretch={!sdMet} />
                        <TargetBadge met={copMet} label={copStretch ? `CoP ✓✓` : `CoP ${TARGETS.cop.label}`} stretch={!copMet} />
                        <TargetBadge met={fatMet} label={fatStretch ? `Fat ✓✓` : `Fat ${TARGETS.fatigue.label}`} stretch={!fatMet} />
                        <TargetBadge met={scoreMet} label={scoreStretch ? `Score ✓✓` : `Score ${TARGETS.score.label}`} stretch={!scoreMet} />
                    </div>
                </div>
                {/* Mini progress bar */}
                <div style={{ width: '80px' }}>
                    <div style={{ height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${(targetsHit / 6) * 100}%`,
                            background: targetsHit >= 5 ? '#4ade80' : targetsHit >= 3 ? '#fbbf24' : '#f87171',
                            borderRadius: '4px',
                            transition: 'width 0.5s ease'
                        }} />
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center', marginTop: '2px' }}>
                        {Math.round((targetsHit / 6) * 100)}%
                    </div>
                </div>
            </div>

            {/* Row 1: Recovery Score + Symmetry Index */}
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px' }}>

                {/* Recovery Score Gauge */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <RecoveryScoreGauge score={recoveryScore} size={220} />
                    <div style={{ marginTop: '12px', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <TargetBadge met={scoreMet} label={`Target: ${TARGETS.score.label}`} />
                        <TargetBadge met={scoreStretch} label={`Stretch: ${TARGETS.score.stretchLabel}`} stretch />
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
                        Based on {strokes.length} strokes<br />
                        <span style={{ color: '#64748b' }}>Combines symmetry, impulse, shape, CoP &amp; fatigue</span>
                    </div>
                </div>

                {/* Metric 1: Symmetry Index Chart */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                            <TrendingUp size={18} style={{ color: '#60a5fa' }} /> Symmetry Index (Per-Stroke)
                        </h3>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <TargetBadge met={siMet} label={TARGETS.symmetry.label} />
                            <TargetBadge met={siStretch} label={TARGETS.symmetry.stretchLabel} stretch />
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={symmetryData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="stroke" stroke="#64748b" fontSize={10} />
                            <YAxis domain={[-100, 100]} stroke="#64748b" fontSize={10} tickFormatter={v => `${v}%`} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                formatter={(v) => [`${v.toFixed(1)}% `, 'SI']}
                            />
                            {/* Target zone bands */}
                            <ReferenceArea y1={-5} y2={5} fill="#4ade80" fillOpacity={0.1} label={{ value: 'STRETCH', fill: '#4ade80', fontSize: 8, position: 'insideTopRight' }} />
                            <ReferenceArea y1={-10} y2={-5} fill="#4ade80" fillOpacity={0.05} />
                            <ReferenceArea y1={5} y2={10} fill="#4ade80" fillOpacity={0.05} />
                            <ReferenceArea y1={10} y2={25} fill="#fbbf24" fillOpacity={0.06} />
                            <ReferenceArea y1={-25} y2={-10} fill="#fbbf24" fillOpacity={0.06} />
                            <ReferenceArea y1={25} y2={100} fill="#f87171" fillOpacity={0.06} />
                            <ReferenceArea y1={-100} y2={-25} fill="#f87171" fillOpacity={0.06} />
                            <ReferenceLine y={0} stroke="#60a5fa" strokeDasharray="4 4" strokeWidth={1.5} />
                            {/* Target lines */}
                            <ReferenceLine y={10} stroke="#4ade80" strokeDasharray="2 4" strokeWidth={1} />
                            <ReferenceLine y={-10} stroke="#4ade80" strokeDasharray="2 4" strokeWidth={1} />
                            <Area type="monotone" dataKey="si" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px', fontSize: '10px', color: '#94a3b8' }}>
                        <span>0% = Perfect</span>
                        <span style={{ color: '#4ade80' }}>■ ±10% Target</span>
                        <span style={{ color: '#fbbf24' }}>■ ±25% Caution</span>
                        <span style={{ color: '#f87171' }}>■ &gt;±25% Reduce load</span>
                    </div>
                    <CoachTip text={siTip} />
                </div>
            </div>

            {/* Row 2: Impulse Ratio + Force Curve Overlay */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Metric 2: Impulse Ratio */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                            <BarChart3 size={18} style={{ color: '#a78bfa' }} /> Impulse Ratio (Per-Stroke)
                        </h3>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <TargetBadge met={irMet} label={TARGETS.impulseRatio.label} />
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={impulseData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="stroke" stroke="#64748b" fontSize={10} />
                            <YAxis stroke="#64748b" fontSize={10} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                formatter={(v, name) => [`${v.toFixed(1)} `, name === 'left' ? healthyLabel : injuredLabel]}
                            />
                            <Bar dataKey="left" fill="#4ade80" radius={[3, 3, 0, 0]} maxBarSize={20} name="left" />
                            <Bar dataKey="right" fill="#a78bfa" radius={[3, 3, 0, 0]} maxBarSize={20} name="right" />
                        </BarChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                        Latest ratio: <strong style={{ color: '#e2e8f0' }}>{impulseData.length > 0 ? impulseData[impulseData.length - 1].ratio.toFixed(1) : '—'}%</strong> left
                        <span style={{ color: '#64748b' }}> (50% = symmetric, target: 45-55%)</span>
                    </div>
                    <CoachTip text={
                        avgIR !== null && Math.abs(avgIR - 50) <= 5
                            ? 'Work distribution is well balanced between legs. Good bilateral loading.'
                            : avgIR !== null && avgIR > 55
                                ? 'Left leg doing more total work. Focus on maintaining right leg engagement through the full stroke, especially during the drive phase.'
                                : 'Right leg working harder — this can indicate overcompensation. Ensure smooth, controlled strokes.'
                    } />
                </div>

                {/* Metric 3: Force Curve Shape Overlay */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                            <Activity size={18} style={{ color: '#f472b6' }} /> Curve Shape Comparison
                        </h3>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <TargetBadge met={sdMet} label={`RMSD ${TARGETS.shapeDiff.label}`} />
                            {strokes.slice(-10).map((s, i) => {
                                const idx = strokes.length - 10 + i;
                                const realIdx = idx >= 0 ? idx : 0;
                                return (
                                    <button
                                        key={s.strokeNumber}
                                        onClick={() => setSelectedStroke(realIdx)}
                                        style={{
                                            width: '24px', height: '24px', borderRadius: '4px', border: 'none',
                                            background: currentStrokeIdx === realIdx ? '#60a5fa' : '#1e293b',
                                            color: currentStrokeIdx === realIdx ? '#fff' : '#64748b',
                                            fontSize: '9px', fontWeight: 700, cursor: 'pointer'
                                        }}
                                    >
                                        {s.strokeNumber}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={selectedStrokeData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="position" stroke="#64748b" fontSize={10} tickFormatter={v => `${v}%`} />
                            <YAxis domain={[0, 110]} stroke="#64748b" fontSize={10} tickFormatter={v => `${v}%`} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                formatter={(v, name) => [`${v.toFixed(0)}% `, name === 'leftNorm' ? healthyLabel : injuredLabel]}
                            />
                            <Line type="monotone" dataKey="leftNorm" stroke="#4ade80" strokeWidth={2} dot={false} name="leftNorm" />
                            <Line type="monotone" dataKey="rightNorm" stroke="#a78bfa" strokeWidth={2} dot={false} strokeDasharray="5 3" name="rightNorm" />
                        </LineChart>
                    </ResponsiveContainer>
                    {strokes[currentStrokeIdx] && (
                        <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                            RMSD: <strong style={{ color: '#e2e8f0' }}>{strokes[currentStrokeIdx].shapeDifference.toFixed(3)}</strong>
                            <span style={{ color: '#64748b' }}> (0 = identical, target &lt;0.25)</span>
                        </div>
                    )}
                    <CoachTip text="Both curves should peak at the same point in the stroke. If the injured leg peaks earlier or later, focus on synchronizing your drive timing." />
                </div>
            </div>

            {/* Row 3: CoP Asymmetry + Fatigue */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Metric 4: Heel-to-Toe CoP */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                            <Footprints size={18} style={{ color: '#fb923c' }} /> Heel-to-Toe CoP Index
                        </h3>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <TargetBadge met={copMet} label={TARGETS.cop.label} />
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={copData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="stroke" stroke="#64748b" fontSize={10} />
                            <YAxis domain={[0, 2]} stroke="#64748b" fontSize={10} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                formatter={(v, name) => [v.toFixed(2), name === 'leftCoP' ? `${healthyLabel} CoP` : `${injuredLabel} CoP`]}
                            />
                            {/* Target zone */}
                            <ReferenceArea y1={0.7} y2={1.1} fill="#4ade80" fillOpacity={0.06} />
                            <ReferenceLine y={0.9} stroke="#4ade80" strokeDasharray="3 3" label={{ value: 'Normal ~0.9', fill: '#4ade80', fontSize: 9, position: 'right' }} />
                            <Line type="monotone" dataKey="leftCoP" stroke="#4ade80" strokeWidth={2} dot={{ r: 2 }} name="leftCoP" />
                            <Line type="monotone" dataKey="rightCoP" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2 }} name="rightCoP" />
                        </LineChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                        0 = All Heel | ~0.9 = Normal | 2 = All Toe
                    </div>
                    <CoachTip text={copTip} />
                </div>

                {/* Metric 5: Fatigue Asymmetry */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                            <Zap size={18} style={{ color: '#fbbf24' }} /> Fatigue Asymmetry
                        </h3>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <TargetBadge met={fatMet} label={TARGETS.fatigue.label} />
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={fatigueScatterData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="stroke" stroke="#64748b" fontSize={10} label={{ value: 'Stroke #', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }} />
                            <YAxis domain={['auto', 'auto']} stroke="#64748b" fontSize={10} label={{ value: 'R/L Ratio', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                formatter={(v, name) => [v.toFixed(3), name === 'ratio' ? 'Peak Ratio' : 'Trend']}
                            />
                            {/* Target zone around 1.0 */}
                            <ReferenceArea y1={0.85} y2={1.15} fill="#4ade80" fillOpacity={0.05} />
                            <ReferenceLine y={1} stroke="#4ade80" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Symmetric', fill: '#4ade80', fontSize: 8, position: 'right' }} />
                            <Line type="monotone" dataKey="ratio" stroke="#fbbf24" strokeWidth={0} dot={{ r: 4, fill: '#fbbf24' }} name="ratio" />
                            <Line type="monotone" dataKey="trend" stroke="#f87171" strokeWidth={2} dot={false} strokeDasharray="6 3" name="trend" />
                        </LineChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                        Slope: <strong style={{ color: fatigueData.slope < -0.01 ? '#f87171' : '#4ade80' }}>
                            {(fatigueData.slope * 100).toFixed(2)}% per stroke
                        </strong>
                        <span style={{ color: '#64748b' }}> ({fatigueData.slope < -0.01 ? `${injuredLabel} fatiguing faster` : 'Balanced fatigue rate'})</span>
                    </div>
                    <CoachTip text={fatigueTip} />
                </div>
            </div>
        </div>
    );
};

export default RecoveryDashboard;
