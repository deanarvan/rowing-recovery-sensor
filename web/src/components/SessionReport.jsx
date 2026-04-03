import React, { forwardRef, useState, useImperativeHandle, useRef, useCallback } from 'react';
import { toNewtons, formatNewtons } from '../utils/sessionReport';

/**
 * Hidden print-optimized report layout for PDF capture.
 * Uses a Canvas-drawn chart instead of Recharts to avoid infinite re-render loops
 * when placed in off-screen containers.
 * 
 * The component starts hidden and empty. Call `prepareForCapture()` via the
 * imperative handle to populate data and draw the chart, then capture with html2canvas.
 */
const SessionReport = forwardRef((props, ref) => {
    const [isReady, setIsReady] = useState(false);
    const [reportData, setReportData] = useState(null);
    const containerRef = useRef(null);
    const canvasRef = useRef(null);

    // Draw the force-over-time chart on a canvas element
    const drawChart = useCallback((canvas, data) => {
        if (!canvas || !data || data.length === 0) return;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const padding = { top: 20, right: 20, bottom: 40, left: 60 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        // Clear
        ctx.fillStyle = '#fafbfc';
        ctx.fillRect(0, 0, w, h);

        // Find ranges
        const times = data.map(p => p.time || 0);
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const allForces = data.flatMap(p => [p.actual || 0, p.leftForce || 0, p.rightForce || 0]);
        const maxForce = Math.max(...allForces, 1);

        const xScale = (v) => padding.left + ((v - minTime) / (maxTime - minTime || 1)) * chartW;
        const yScale = (v) => padding.top + chartH - (v / maxForce) * chartH;

        // Grid lines
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (i / 5) * chartH;
            ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartW, y); ctx.stroke();
            // Y labels
            const forceVal = maxForce * (1 - i / 5);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '18px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${toNewtons(forceVal).toFixed(0)}N`, padding.left - 8, y + 5);
        }

        // X axis labels
        const timeRange = maxTime - minTime;
        const tickCount = Math.min(10, Math.floor(timeRange));
        for (let i = 0; i <= tickCount; i++) {
            const t = minTime + (i / tickCount) * timeRange;
            const x = xScale(t);
            ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, padding.top + chartH); ctx.stroke();
            ctx.fillStyle = '#94a3b8';
            ctx.font = '18px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(t)}s`, x, padding.top + chartH + 25);
        }

        // Axis labels
        ctx.fillStyle = '#64748b';
        ctx.font = '20px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Time (seconds)', padding.left + chartW / 2, h - 5);
        ctx.save();
        ctx.translate(15, padding.top + chartH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Force (N)', 0, 0);
        ctx.restore();

        // Downsample if too many points
        let plotData = data;
        if (data.length > 800) {
            const step = Math.ceil(data.length / 800);
            plotData = data.filter((_, i) => i % step === 0);
        }

        // Draw lines: Combined (blue), Left (green), Right (purple)
        const drawLine = (key, color, width) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            plotData.forEach((pt, i) => {
                const x = xScale(pt.time || 0);
                const y = yScale(pt[key] || 0);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        drawLine('leftForce', '#22c55e', 2);
        drawLine('rightForce', '#8b5cf6', 2);
        drawLine('actual', '#3b82f6', 3);

        // Border
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(padding.left, padding.top, chartW, chartH);
    }, []);

    // Imperative handle: populate data and draw chart, then return the container ref for capture
    useImperativeHandle(ref, () => ({
        prepareForCapture: (sessionData) => {
            setReportData(sessionData);
            setIsReady(true);

            // Draw chart on next frame after state has settled
            return new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (canvasRef.current && sessionData.cumulativeData) {
                            drawChart(canvasRef.current, sessionData.cumulativeData);
                        }
                        resolve(containerRef.current);
                    });
                });
            });
        },
        getContainer: () => containerRef.current,
        cleanup: () => {
            setIsReady(false);
            setReportData(null);
        }
    }), [drawChart]);

    if (!isReady || !reportData) {
        return <div ref={containerRef} style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }} />;
    }

    const {
        cumulativeData = [], strokeCount = 0, strokeRate = 0,
        rollingAverage = 0, completedStrokes = [],
        recoveryScore, fatigueData = {}, injuredSide = 'right'
    } = reportData;

    const now = new Date();
    const durationSec = cumulativeData.length > 0 ? ((cumulativeData[cumulativeData.length - 1].time || 0) - (cumulativeData[0].time || 0)) : 0;
    const durationMin = Math.floor(durationSec / 60);
    const durationRemSec = Math.round(durationSec % 60);

    const drivePoints = cumulativeData.filter(p => p.phase === 'drive');
    const allForces = drivePoints.map(p => p.actual || 0).filter(f => f > 0);
    const avgForce = allForces.length > 0 ? allForces.reduce((a, b) => a + b, 0) / allForces.length : 0;
    const maxForce = allForces.length > 0 ? Math.max(...allForces) : 0;
    const avgLeftForce = drivePoints.length > 0 ? drivePoints.reduce((s, p) => s + (p.leftForce || 0), 0) / drivePoints.length : 0;
    const avgRightForce = drivePoints.length > 0 ? drivePoints.reduce((s, p) => s + (p.rightForce || 0), 0) / drivePoints.length : 0;

    const avgSI = completedStrokes.length > 0
        ? (completedStrokes.reduce((s, st) => s + (st.symmetryIndex || 0), 0) / completedStrokes.length).toFixed(1) : '—';
    const avgIR = completedStrokes.length > 0
        ? (completedStrokes.reduce((s, st) => s + (st.impulseRatio || 0), 0) / completedStrokes.length).toFixed(1) : '—';

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                left: '-9999px',
                top: 0,
                width: '1120px',
                background: '#ffffff',
                color: '#1e293b',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                padding: '28px 32px',
                boxSizing: 'border-box'
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                        Rowing Session Report
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                        Achilles Recovery Monitoring — Bilateral Force Analysis
                    </p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                    <div style={{ fontWeight: 700 }}>{now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div style={{ marginTop: '2px', color: '#94a3b8' }}>Duration: {durationMin}m {durationRemSec}s</div>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <StatBox label="Strokes" value={strokeCount} />
                <StatBox label="SPM" value={strokeRate} />
                <StatBox label="Avg Force" value={formatNewtons(avgForce)} />
                <StatBox label="Peak Force" value={formatNewtons(maxForce)} />
                <StatBox label="Avg Left" value={formatNewtons(avgLeftForce)} />
                <StatBox label="Avg Right" value={formatNewtons(avgRightForce)} />
            </div>

            {/* Bilateral Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <MetricBox label="Recovery Score" value={recoveryScore != null ? recoveryScore : '—'} color={recoveryScore >= 75 ? '#16a34a' : recoveryScore >= 50 ? '#d97706' : '#dc2626'} />
                <MetricBox label="Symmetry Index" value={`${avgSI}%`} subtext="0% = symmetric" />
                <MetricBox label="Impulse Ratio" value={`${avgIR}%`} subtext="50% = symmetric" />
                <MetricBox label="Fatigue Slope" value={`${((fatigueData.slope || 0) * 100).toFixed(2)}%/stroke`} />
                <MetricBox label="Injured Side" value={injuredSide === 'right' ? 'Right Leg' : 'Left Leg'} />
            </div>

            {/* Force Over Time Chart — Canvas-based to avoid Recharts re-render issues */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#fafbfc' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    Force Over Time — Full Session ({cumulativeData.length} samples, {durationMin}m {durationRemSec}s)
                </h3>
                <canvas
                    ref={canvasRef}
                    width={2120}
                    height={520}
                    style={{ width: '1060px', height: '260px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '4px', fontSize: '9px', color: '#64748b' }}>
                    <span><span style={{ color: '#3b82f6' }}>━</span> Combined</span>
                    <span><span style={{ color: '#22c55e' }}>━</span> Left (Healthy)</span>
                    <span><span style={{ color: '#8b5cf6' }}>━</span> Right (Injured)</span>
                </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: '12px', fontSize: '9px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                <span>Generated by Rowing Recovery Analyzer</span>
                <span>Force values are approximate — calibrate with known weights for clinical accuracy</span>
            </div>
        </div>
    );
});

SessionReport.displayName = 'SessionReport';

function StatBox({ label, value }) {
    return (
        <div style={{ background: '#f1f5f9', borderRadius: '6px', padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{value}</div>
            <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>{label}</div>
        </div>
    );
}

function MetricBox({ label, value, color, subtext }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: color || '#0f172a' }}>{value}</div>
            <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>{label}</div>
            {subtext && <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '1px' }}>{subtext}</div>}
        </div>
    );
}

export default SessionReport;
