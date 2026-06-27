import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Rough conversion: scaled 0-100 values → approximate Newtons.
 */
export const NEWTONS_PER_UNIT = 4.9;

export function toNewtons(scaledValue) {
    return Math.round(scaledValue * NEWTONS_PER_UNIT * 10) / 10;
}

export function formatNewtons(scaledValue) {
    return `${toNewtons(scaledValue)} N`;
}

/**
 * Color coding for metric quality. Returns { bg, text } css colors.
 */
function metricColor(value, thresholds) {
    // thresholds: { good, ok } — below good is green, below ok is yellow, else red
    if (value === null || value === undefined || value === '—') return { bg: '#f1f5f9', text: '#475569' };
    const v = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(v)) return { bg: '#f1f5f9', text: '#475569' };
    if (v <= thresholds.good) return { bg: '#dcfce7', text: '#166534' }; // green
    if (v <= thresholds.ok) return { bg: '#fef9c3', text: '#854d0e' };   // yellow
    return { bg: '#fee2e2', text: '#991b1b' };                            // red
}

/** Reverse scale: higher = better (e.g. recovery score) */
function metricColorReverse(value, thresholds) {
    if (value === null || value === undefined || value === '—') return { bg: '#f1f5f9', text: '#475569' };
    const v = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(v)) return { bg: '#f1f5f9', text: '#475569' };
    if (v >= thresholds.good) return { bg: '#dcfce7', text: '#166534' };
    if (v >= thresholds.ok) return { bg: '#fef9c3', text: '#854d0e' };
    return { bg: '#fee2e2', text: '#991b1b' };
}

/** Neutral color — no good/bad judgment */
function neutralColor() {
    return { bg: '#f1f5f9', text: '#475569' };
}

/**
 * Distance proxy: rowing ~8-10m per stroke at recreational pace.
 * Using 8.5m as a conservative estimate for recovery rowing.
 */
const METERS_PER_STROKE = 8.5;

/**
 * Generate a PDF session report using pure DOM (no React components).
 */
export async function generateSessionPDF(sessionData, timestamp = Date.now(), directoryHandle = null) {
    const {
        cumulativeData = [], strokeCount = 0, strokeRate = 0,
        rollingAverage = 0, completedStrokes = [],
        recoveryScore = null, fatigueData = { slope: 0, intercept: 1 },
        injuredSide = 'right',
        intervalState = null
    } = sessionData;

    if (cumulativeData.length === 0) {
        console.warn('No data to generate PDF report from.');
        return;
    }

    // --- Build stats ---
    const now = new Date();
    const durationSec = cumulativeData.length > 0 ? ((cumulativeData[cumulativeData.length - 1].time || 0) - (cumulativeData[0].time || 0)) : 0;
    const durationMin = Math.floor(durationSec / 60);
    const durationRemSec = Math.round(durationSec % 60);

    // Force stats from ALL data
    const allForces = cumulativeData.map(p => p.actual || 0).filter(f => f > 0);
    const avgForce = allForces.length > 0 ? allForces.reduce((a, b) => a + b, 0) / allForces.length : 0;
    let maxForce = 0;
    for (let i = 0; i < allForces.length; i++) { if (allForces[i] > maxForce) maxForce = allForces[i]; }
    const avgLeftForce = cumulativeData.length > 0 ? cumulativeData.reduce((s, p) => s + (p.leftForce || 0), 0) / cumulativeData.length : 0;
    const avgRightForce = cumulativeData.length > 0 ? cumulativeData.reduce((s, p) => s + (p.rightForce || 0), 0) / cumulativeData.length : 0;

    // Stroke-level asymmetry averages
    const hasStrokes = completedStrokes.length > 0;
    const avgSI = hasStrokes
        ? (completedStrokes.reduce((s, st) => s + (st.symmetryIndex || 0), 0) / completedStrokes.length) : null;
    const avgIR = hasStrokes
        ? (completedStrokes.reduce((s, st) => s + (st.impulseRatio || 0), 0) / completedStrokes.length) : null;
    const avgSD = hasStrokes
        ? (completedStrokes.reduce((s, st) => s + (st.shapeDifference || 0), 0) / completedStrokes.length) : null;
    const avgCoP = hasStrokes
        ? (completedStrokes.reduce((s, st) => s + (st.copAsymmetry || 0), 0) / completedStrokes.length) : null;

    // Total work (impulse) per leg across all completed strokes
    const totalLeftWork = hasStrokes ? completedStrokes.reduce((s, st) => s + (st.leftImpulse || 0), 0) : 0;
    const totalRightWork = hasStrokes ? completedStrokes.reduce((s, st) => s + (st.rightImpulse || 0), 0) : 0;

    // Distance proxy
    const distanceM = Math.round(strokeCount * METERS_PER_STROKE);

    // Fatigue slope
    const fatiguePct = ((fatigueData.slope || 0) * 100).toFixed(2);

    // Average CoP per foot (for visualization) — use last N samples for representative average
    const recentSamples = cumulativeData.slice(-Math.min(200, cumulativeData.length));
    const avgLeftCoP = computeAvgFootCoP(recentSamples, 'left');
    const avgRightCoP = computeAvgFootCoP(recentSamples, 'right');

    // --- Color coding ---
    const siColor = metricColor(avgSI !== null ? Math.abs(avgSI) : null, { good: 10, ok: 25 });
    const irColor = metricColor(avgIR !== null ? Math.abs(avgIR - 50) : null, { good: 5, ok: 15 });
    const sdColor = metricColor(avgSD, { good: 0.15, ok: 0.35 });
    const copColor = metricColor(avgCoP !== null ? Math.abs(avgCoP) : null, { good: 0.2, ok: 0.5 });
    const fatigueColor = metricColor(Math.abs(parseFloat(fatiguePct)), { good: 0.5, ok: 2.0 });
    const recoveryColor = metricColorReverse(recoveryScore, { good: 75, ok: 50 });

    // --- Build DOM ---
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:1120px;background:#fff;color:#1e293b;font-family:Inter,system-ui,sans-serif;padding:28px 32px;box-sizing:border-box;';
    document.body.appendChild(container);

    container.innerHTML = `
        <!-- HEADER -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px;">
            <div>
                <h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a">Rowing Session Report</h1>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b">Achilles Recovery Monitoring — Bilateral Force Analysis</p>
            </div>
            <div style="text-align:right;font-size:12px;color:#475569">
                <div style="font-weight:700">${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div>${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="margin-top:2px;color:#94a3b8">Duration: ${durationMin}m ${durationRemSec}s</div>
            </div>
        </div>

        <!-- ROW 1: Primary Session Stats (7 cols) -->
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:12px;">
            ${colorStatBox('Strokes', strokeCount, neutralColor())}
            ${colorStatBox('SPM', strokeRate, neutralColor())}
            ${colorStatBox('Distance', `${distanceM} m`, neutralColor())}
            ${colorStatBox('Avg Force', formatNewtons(avgForce), neutralColor())}
            ${colorStatBox('Peak Force', formatNewtons(maxForce), neutralColor())}
            ${colorStatBox('Avg Left', formatNewtons(avgLeftForce), neutralColor())}
            ${colorStatBox('Avg Right', formatNewtons(avgRightForce), neutralColor())}
        </div>

        <!-- ROW 2: Specialty Metrics as Vertical Bars -->
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:12px;">
            ${metricBar('Recovery Score', recoveryScore != null ? recoveryScore : '—', recoveryScore, recoveryColor, 0, 100, 100, '100')}
            ${metricBar('Symmetry Index', avgSI !== null ? `${avgSI.toFixed(1)}%` : '—', avgSI !== null ? Math.abs(avgSI) : null, siColor, 0, 100, 0, '0%')}
            ${metricBar('Impulse Ratio', avgIR !== null ? `${avgIR.toFixed(1)}%` : '—', avgIR !== null ? Math.abs(avgIR - 50) : null, irColor, 0, 50, 0, '50%')}
            ${metricBar('Shape Diff', avgSD !== null ? avgSD.toFixed(2) : '—', avgSD, sdColor, 0, 1.0, 0, '0.0')}
            ${metricBar('CoP Asym', avgCoP !== null ? avgCoP.toFixed(2) : '—', avgCoP, copColor, 0, 1.0, 0, '0.0')}
            ${metricBar('Fatigue', `${fatiguePct}%/str`, Math.abs(parseFloat(fatiguePct)), fatigueColor, 0, 5, 0, '0%')}
        </div>

        <!-- ROW 3: Work per leg + CoP Visualization + Injured Side -->
        <div style="display:grid;grid-template-columns:1fr 1fr 280px 120px;gap:10px;margin-bottom:14px;">
            ${colorStatBox('Left Leg Work', `${(totalLeftWork * NEWTONS_PER_UNIT).toFixed(1)} N·s`, neutralColor())}
            ${colorStatBox('Right Leg Work', `${(totalRightWork * NEWTONS_PER_UNIT).toFixed(1)} N·s`, neutralColor())}
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center;">
                <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Load Distribution (Left vs Right)</div>
                <div style="display:flex; justify-content:space-around; align-items:center;">
                    ${copCirclePair('Toe', avgLeftCoP.toe, avgRightCoP.toe)}
                    ${copCirclePair('Ball', avgLeftCoP.ball, avgRightCoP.ball)}
                    ${copCirclePair('Heel', avgLeftCoP.heel, avgRightCoP.heel)}
                </div>
            </div>

            ${colorMetricBox('Injured Side', injuredSide === 'right' ? 'Right Leg' : 'Left Leg', { bg: '#fef2f2', text: '#991b1b' })}
        </div>
        
        ${intervalState && intervalState.intervalsCompleted && intervalState.intervalsCompleted.length > 0 ? `
        <!-- ROW 4: Interval Training Summary (Conditional) -->
        <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;">
            <h3 style="margin:0 0 8px;font-size:13px;font-weight:700;color:#334155">Interval Training Summary</h3>
            <div style="display:flex;gap:12px;overflow-x:hidden;">
                ${intervalState.intervalsCompleted.map(int => `
                    <div style="flex:0 0 auto;width:160px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;background:${int.isFatigueTriggered ? '#fef2f2' : '#ffffff'}">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:11px;font-weight:800;color:#0f172a">Interval #${int.intervalNumber}</span>
                            <span style="font-size:10px;color:#64748b">${int.strokeCount} str</span>
                        </div>
                        <div style="font-size:10px;color:#334155;line-height:1.4;">
                            <div>Fatigue Onset: <strong style="color:${int.fatigueOnsetStroke ? '#ef4444' : '#22c55e'}">${int.fatigueOnsetStroke ? `Stroke ${int.fatigueOnsetStroke}` : 'None'}</strong></div>
                            <div>Avg SI: <strong>${int.avgSI ? `+${int.avgSI.toFixed(0)}%` : '--'}</strong></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <!-- CHART -->
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fafbfc;">
            <h3 style="margin:0 0 8px;font-size:13px;font-weight:700;color:#334155">
                Force Over Time — Full Session (${cumulativeData.length} samples, ${durationMin}m ${durationRemSec}s)
            </h3>
            <canvas id="pdf-chart-canvas" width="2120" height="520" style="width:1060px;height:260px;"></canvas>
            <div style="display:flex;justify-content:center;gap:24px;margin-top:4px;font-size:9px;color:#64748b">
                <span><span style="color:#22c55e">━</span> Left (Healthy)</span>
                <span><span style="color:#8b5cf6">━</span> Right (Injured)</span>
            </div>
        </div>

        <!-- FOOTER -->
        <div style="margin-top:10px;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between">
            <span>Generated by Rowing Recovery Analyzer</span>
            <span>Force values are approximate — calibrate with known weights for clinical accuracy</span>
        </div>
    `;

    // --- Draw Chart ---
    const chartCanvas = container.querySelector('#pdf-chart-canvas');
    drawForceChart(chartCanvas, cumulativeData);

    // --- Capture ---
    try {
        await new Promise(r => setTimeout(r, 100));

        const capturedCanvas = await html2canvas(container, {
            scale: 1.5,  // 1.5x is sharp enough for print, saves ~55% vs 2x
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: 1120,
            height: container.scrollHeight
        });

        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 297;
        const pageHeight = 210;
        const margin = 8;

        const imgWidth = pageWidth - margin * 2;
        const imgHeight = (capturedCanvas.height / capturedCanvas.width) * imgWidth;
        const finalHeight = Math.min(imgHeight, pageHeight - margin * 2);
        const finalWidth = (finalHeight / imgHeight) * imgWidth;

        pdf.addImage(
            capturedCanvas.toDataURL('image/jpeg', 0.85),
            'JPEG',
            margin,
            margin,
            finalWidth,
            finalHeight
        );

        const dateStr = formatTimestampForFilename(timestamp);
        const filename = `ForceOverTime_${dateStr}.pdf`;

        if (directoryHandle) {
            // Save directly to chosen folder (verify permission first)
            try {
                const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    const requested = await directoryHandle.requestPermission({ mode: 'readwrite' });
                    if (requested !== 'granted') {
                        console.warn('⚠️ PDF folder write permission denied — falling back to download');
                    }
                }
                if ((await directoryHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    const pdfBlob = pdf.output('blob');
                    await writable.write(pdfBlob);
                    await writable.close();
                    console.log(`✅ PDF saved to folder: ${filename}`);
                    showExportToast(`✅ PDF saved: ${filename}`);
                } else {
                    pdf.save(filename);
                }
            } catch (err) {
                console.warn('⚠️ Folder save failed, falling back to download:', err);
                showExportToast(`⚠️ PDF folder save failed — downloaded instead`, true);
                pdf.save(filename);
            }
        } else {
            pdf.save(filename);
            console.log(`✅ PDF saved: ${filename}`);
        }
    } catch (err) {
        console.error('PDF generation failed:', err);
        // Show a visible toast/alert so the user knows it failed
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.textContent = `PDF export failed: ${err.message}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    } finally {
        document.body.removeChild(container);
    }
}

/**
 * Compute average CoP position for a foot from samples.
 * Returns { heel, ball, toe } as normalized percentages (0-1).
 */
function computeAvgFootCoP(samples, side) {
    if (!samples || samples.length === 0) return { heel: 0.33, ball: 0.33, toe: 0.33 };

    const heelKey = `${side}Heel`;
    const ballKey = `${side}Ball`;
    const toeKey = `${side}Toe`;

    let totalHeel = 0, totalBall = 0, totalToe = 0;
    for (const s of samples) {
        totalHeel += (s[heelKey] || 0);
        totalBall += (s[ballKey] || 0);
        totalToe += (s[toeKey] || 0);
    }
    const total = totalHeel + totalBall + totalToe;
    if (total === 0) return { heel: 0.33, ball: 0.33, toe: 0.33 };
    return {
        heel: totalHeel / total,
        ball: totalBall / total,
        toe: totalToe / total
    };
}

/**
 * Draw force-over-time chart on a canvas element.
 */
function drawForceChart(canvas, data) {
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, w, h);

    // Safe min/max — no spread operator on large arrays (prevents stack overflow)
    let minTime = Infinity, maxTime = -Infinity, maxForce = 1;
    for (const p of data) {
        const t = p.time || 0;
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
        const lf = p.leftForce || 0;
        const rf = p.rightForce || 0;
        if (lf > maxForce) maxForce = lf;
        if (rf > maxForce) maxForce = rf;
    }

    const xScale = v => padding.left + ((v - minTime) / (maxTime - minTime || 1)) * chartW;
    const yScale = v => padding.top + chartH - (v / maxForce) * chartH;

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (i / 5) * chartH;
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartW, y); ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${toNewtons(maxForce * (1 - i / 5)).toFixed(0)}N`, padding.left - 8, y + 5);
    }

    const tickCount = Math.min(10, Math.max(2, Math.floor(maxTime - minTime)));
    for (let i = 0; i <= tickCount; i++) {
        const t = minTime + (i / tickCount) * (maxTime - minTime);
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

    // Downsample
    let plotData = data;
    if (data.length > 800) {
        const step = Math.ceil(data.length / 800);
        plotData = data.filter((_, i) => i % step === 0);
    }

    const drawLine = (key, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        plotData.forEach((pt, i) => {
            const x = xScale(pt.time || 0);
            const y = yScale(pt[key] || 0);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    };

    drawLine('leftForce', '#22c55e', 2);
    drawLine('rightForce', '#8b5cf6', 2);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, chartW, chartH);
}

/** Brief visual toast so user knows export succeeded or failed */
function showExportToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
        position: 'fixed', bottom: '24px', right: '24px', zIndex: '99999',
        padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
        color: '#fff', background: isError ? '#ef4444' : '#22c55e',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.3s',
        fontFamily: 'system-ui, sans-serif'
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

/**
 * Auto-export CSV data with timestamped filename.
 */
export async function autoExportCSV(data, timestamp = Date.now(), directoryHandle = null) {
    if (!data || data.length === 0) return;

    const dateStr = formatTimestampForFilename(timestamp);
    const filename = `ForceOverTime_csv_${dateStr}.csv`;

    const headers = [
        'Time(s)', 'Position(%)', 'Total_Force', 'Left_Force', 'Right_Force',
        'L_Heel', 'L_Ball', 'L_Toe', 'R_Heel', 'R_Ball', 'R_Toe',
        'Phase', 'Total_Force_N', 'Left_Force_N', 'Right_Force_N',
        'Pitch_deg', 'Roll_deg', 'Yaw_deg'
    ];

    const rows = data.map(pt => [
        pt.time?.toFixed(3) || '0',
        pt.position?.toFixed(1) || '0',
        pt.actual?.toFixed(1) || '0',
        pt.leftForce?.toFixed(1) || '0',
        pt.rightForce?.toFixed(1) || '0',
        pt.leftHeel?.toFixed(1) || '0',
        pt.leftBall?.toFixed(1) || '0',
        pt.leftToe?.toFixed(1) || '0',
        pt.rightHeel?.toFixed(1) || '0',
        pt.rightBall?.toFixed(1) || '0',
        pt.rightToe?.toFixed(1) || '0',
        pt.phase || 'unknown',
        toNewtons(pt.actual || 0),
        toNewtons(pt.leftForce || 0),
        toNewtons(pt.rightForce || 0),
        pt.pitch != null ? pt.pitch.toFixed(2) : '',
        pt.roll != null ? pt.roll.toFixed(2) : '',
        pt.yaw != null ? pt.yaw.toFixed(2) : ''
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    if (directoryHandle) {
        try {
            // Verify we still have write permission (can be revoked if tab lost focus)
            const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                const requested = await directoryHandle.requestPermission({ mode: 'readwrite' });
                if (requested !== 'granted') {
                    console.warn('⚠️ Folder write permission denied — falling back to download');
                    // Fall through to browser download
                }
            }
            if ((await directoryHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(csv);
                await writable.close();
                console.log(`✅ CSV saved to folder: ${filename}`);
                showExportToast(`✅ CSV saved: ${filename}`);
                return;
            }
        } catch (err) {
            console.warn('⚠️ Folder save failed, falling back to download:', err);
            showExportToast(`⚠️ Folder save failed — downloaded instead`, true);
        }
    }

    // Fallback: browser download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`✅ CSV saved: ${filename}`);
}

/**
 * Auto-export balance board session CSV with timestamped filename.
 * Format matches balance_logger.py output so files are interchangeable.
 */
export async function autoExportBalanceBoardCSV(historyData, timestamp = Date.now(), directoryHandle = null) {
    if (!historyData || historyData.length === 0) return;

    const dateStr = formatTimestampForFilename(timestamp);
    const filename = `BalanceBoard_${dateStr}.csv`;

    const headers = [
        'timestamp', 'elapsed_s', 'fl', 'fr', 'rl', 'rr',
        'left_pct', 'right_pct', 'left_ap', 'right_ap'
    ];

    const sessionStart = new Date(timestamp - (historyData[historyData.length - 1]?.elapsed || 0) * 1000);

    const rows = historyData.map(pt => {
        const raw = pt.raw || {};
        const total = (pt.leftForce || 0) + (pt.rightForce || 0);
        const leftPct = total > 0 ? ((pt.leftForce || 0) / total * 100) : 50;
        const rightPct = total > 0 ? ((pt.rightForce || 0) / total * 100) : 50;
        // A/P ratio: +1 = front, -1 = rear
        const leftAP = (pt.leftForce || 0) > 0
            ? (((raw.fl || 0) - (raw.rl || 0)) / (pt.leftForce || 1)) : 0;
        const rightAP = (pt.rightForce || 0) > 0
            ? (((raw.fr || 0) - (raw.rr || 0)) / (pt.rightForce || 1)) : 0;

        const ts = new Date(sessionStart.getTime() + (pt.elapsed || 0) * 1000);
        return [
            ts.toISOString(),
            (pt.elapsed || 0).toFixed(3),
            Math.round(raw.fl || 0),
            Math.round(raw.fr || 0),
            Math.round(raw.rl || 0),
            Math.round(raw.rr || 0),
            leftPct.toFixed(1),
            rightPct.toFixed(1),
            leftAP.toFixed(2),
            rightAP.toFixed(2)
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    if (directoryHandle) {
        try {
            const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                const requested = await directoryHandle.requestPermission({ mode: 'readwrite' });
                if (requested !== 'granted') {
                    console.warn('⚠️ Folder write permission denied — falling back to download');
                }
            }
            if ((await directoryHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(csv);
                await writable.close();
                console.log(`✅ Balance board CSV saved to folder: ${filename}`);
                showExportToast(`✅ Balance board session saved: ${filename}`);
                return;
            }
        } catch (err) {
            console.warn('⚠️ Folder save failed, falling back to download:', err);
            showExportToast(`⚠️ Folder save failed — downloaded instead`, true);
        }
    }

    // Fallback: browser download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`✅ Balance board CSV downloaded: ${filename}`);
    showExportToast(`✅ Balance board session downloaded: ${filename}`);
}

/**
 * Export an exercise session CSV to a mode-specific subfolder.
 * Creates: {directoryHandle}/Balance_Board_2/{exerciseFolder}/{filename}.csv
 * Includes BSI column for symmetry tracking.
 */
export async function exportExerciseSessionCSV(exerciseFolder, historyData, bsiData, copTrace, timestamp = Date.now(), directoryHandle = null) {
    if (!historyData || historyData.length === 0) return;

    const dateStr = formatTimestampForFilename(timestamp);
    const filename = `${exerciseFolder}_${dateStr}.csv`;

    const headers = [
        'timestamp', 'elapsed_s', 'fl', 'fr', 'rl', 'rr',
        'left_force', 'right_force', 'left_pct', 'right_pct', 'front_pct', 'bsi', 'phase'
    ];

    const sessionStart = new Date(timestamp - (historyData[historyData.length - 1]?.elapsed || 0) * 1000);

    const rows = historyData.map((pt, idx) => {
        const raw = pt.raw || {};
        const lf = pt.leftForce || 0;
        const rf = pt.rightForce || 0;
        const fl = raw.fl || 0;
        const fr = raw.fr || 0;
        const rl = raw.rl || 0;
        const rr = raw.rr || 0;
        const tot = lf + rf;
        const leftPct = tot > 0 ? (lf / tot * 100) : 50;
        const rightPct = tot > 0 ? (rf / tot * 100) : 50;
        const frontPct = tot > 0 ? ((fl + fr) / (fl + fr + rl + rr) * 100) : 50;
        const bsi = tot > 0 ? (Math.abs(lf - rf) / tot * 100) : 0;

        const ts = new Date(sessionStart.getTime() + (pt.elapsed || 0) * 1000);
        return [
            ts.toISOString(),
            (pt.elapsed || 0).toFixed(3),
            Math.round(fl),
            Math.round(fr),
            Math.round(rl),
            Math.round(rr),
            Math.round(lf),
            Math.round(rf),
            leftPct.toFixed(1),
            rightPct.toFixed(1),
            frontPct.toFixed(1),
            bsi.toFixed(2),
            pt.phase || 'main'
        ].join(',');
    });

    // Compute session-level CoP metrics for summary
    let avgBSI = 0;
    if (bsiData && bsiData.length > 0) {
        avgBSI = bsiData.reduce((s, v) => s + v.bsi, 0) / bsiData.length;
    }

    let copVelocity = 0, copTranslation = 0, copEllipseArea = 0;
    if (copTrace && copTrace.length > 2) {
        // CoP Velocity
        let velSum = 0, velCount = 0;
        for (let i = 1; i < copTrace.length; i++) {
            const dt = copTrace[i].t - copTrace[i - 1].t;
            if (dt > 0) {
                const dml = copTrace[i].ml - copTrace[i - 1].ml;
                const dap = copTrace[i].ap - copTrace[i - 1].ap;
                velSum += Math.sqrt(dml * dml + dap * dap) / dt;
                velCount++;
            }
        }
        copVelocity = velCount > 0 ? velSum / velCount : 0;

        // CoP Translation
        let mlMin = Infinity, mlMax = -Infinity, apMin = Infinity, apMax = -Infinity;
        for (const pt of copTrace) {
            if (pt.ml < mlMin) mlMin = pt.ml;
            if (pt.ml > mlMax) mlMax = pt.ml;
            if (pt.ap < apMin) apMin = pt.ap;
            if (pt.ap > apMax) apMax = pt.ap;
        }
        copTranslation = Math.sqrt((mlMax - mlMin) ** 2 + (apMax - apMin) ** 2);

        // CoP Ellipse Area (95% confidence)
        const n = copTrace.length;
        const meanML = copTrace.reduce((s, p) => s + p.ml, 0) / n;
        const meanAP = copTrace.reduce((s, p) => s + p.ap, 0) / n;
        let varML = 0, varAP = 0, covMLAP = 0;
        for (const pt of copTrace) {
            const dml = pt.ml - meanML;
            const dap = pt.ap - meanAP;
            varML += dml * dml;
            varAP += dap * dap;
            covMLAP += dml * dap;
        }
        varML /= (n - 1); varAP /= (n - 1); covMLAP /= (n - 1);
        const det = varML * varAP - covMLAP * covMLAP;
        copEllipseArea = Math.PI * 5.991 * Math.sqrt(Math.max(det, 0));
    }

    const summaryComment = `# Exercise: ${exerciseFolder} | Samples: ${historyData.length} | Avg BSI: ${avgBSI.toFixed(2)}% | CoP Velocity: ${copVelocity.toFixed(2)} %/s | CoP Translation: ${copTranslation.toFixed(2)}% | CoP Ellipse Area: ${copEllipseArea.toFixed(1)} %²`;

    const csv = [summaryComment, headers.join(','), ...rows].join('\n');

    if (directoryHandle) {
        try {
            const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                const requested = await directoryHandle.requestPermission({ mode: 'readwrite' });
                if (requested !== 'granted') {
                    console.warn('⚠️ Folder write permission denied — falling back to download');
                }
            }
            if ((await directoryHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                // Create subfolder hierarchy: Balance_Board_2 / exerciseFolder
                const bb2Handle = await directoryHandle.getDirectoryHandle('Balance_Board_2', { create: true });
                const exerciseDirHandle = await bb2Handle.getDirectoryHandle(exerciseFolder, { create: true });
                const fileHandle = await exerciseDirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(csv);
                await writable.close();
                console.log(`✅ Exercise CSV saved: Balance_Board_2/${exerciseFolder}/${filename}`);
                showExportToast(`✅ Saved: Balance_Board_2/${exerciseFolder}/${filename}`);
                return;
            }
        } catch (err) {
            console.warn('⚠️ Folder save failed, falling back to download:', err);
            showExportToast(`⚠️ Folder save failed — downloaded instead`, true);
        }
    }

    // Fallback: browser download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`✅ Exercise CSV downloaded: ${filename}`);
    showExportToast(`✅ Exercise session downloaded: ${filename}`);
}

function formatTimestampForFilename(timestamp) {
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function colorStatBox(label, value, color) {
    return `<div style="background:${color.bg};border-radius:6px;padding:8px 10px;text-align:center">
        <div style="font-size:16px;font-weight:800;color:${color.text}">${value}</div>
        <div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">${label}</div>
    </div>`;
}

function colorMetricBox(label, value, color, subtext = '') {
    return `<div style="background:${color.bg};border:1px solid ${color.bg === '#f1f5f9' ? '#e2e8f0' : color.bg};border-radius:6px;padding:7px 8px;text-align:center">
        <div style="font-size:14px;font-weight:800;color:${color.text}">${value}</div>
        <div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;margin-top:2px">${label}</div>
        ${subtext ? `<div style="font-size:7px;color:#94a3b8;margin-top:1px">${subtext}</div>` : ''}
    </div>`;
}

function metricBar(label, displayValue, rawValue, color, min, max, ideal, idealLabel) {
    const pct = rawValue !== null && rawValue !== undefined && !isNaN(rawValue)
        ? Math.max(0, Math.min(100, ((rawValue - min) / (max - min)) * 100))
        : 0;
    const idealPct = ((ideal - min) / (max - min)) * 100;

    return `<div style="background:${color.bg};border:1px solid ${color.bg === '#f1f5f9' ? '#e2e8f0' : color.bg};border-radius:6px;padding:8px 10px;text-align:center;position:relative;">
        <div style="font-size:14px;font-weight:800;color:${color.text}">${displayValue}</div>
        <div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">${label}</div>
        <div style="margin-top:6px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;position:relative;">
            <div style="height:100%;width:${pct}%;background:${color.text};border-radius:3px;"></div>
            <div style="position:absolute;top:-2px;left:${idealPct}%;width:2px;height:10px;background:#475569;border-radius:1px;"></div>
        </div>
        <div style="font-size:7px;color:#94a3b8;margin-top:2px;">Ideal: ${idealLabel}</div>
    </div>`;
}

function copCirclePair(zone, leftPct, rightPct) {
    const maxSize = 32;
    const minSize = 8;
    const lSize = Math.round(minSize + (maxSize - minSize) * Math.min(leftPct * 2, 1));
    const rSize = Math.round(minSize + (maxSize - minSize) * Math.min(rightPct * 2, 1));
    const lOpacity = (0.3 + 0.7 * Math.min(leftPct * 2, 1)).toFixed(2);
    const rOpacity = (0.3 + 0.7 * Math.min(rightPct * 2, 1)).toFixed(2);

    return `<div style="text-align:center;">
        <div style="font-size:8px;color:#64748b;font-weight:600;margin-bottom:4px;">${zone}</div>
        <div style="display:flex;gap:4px;justify-content:center;align-items:center;">
            <div style="width:${lSize}px;height:${lSize}px;border-radius:50%;background:rgba(34,197,94,${lOpacity});border:1px solid #22c55e;" title="Left ${(leftPct * 100).toFixed(0)}%"></div>
            <div style="width:${rSize}px;height:${rSize}px;border-radius:50%;background:rgba(139,92,246,${rOpacity});border:1px solid #8b5cf6;" title="Right ${(rightPct * 100).toFixed(0)}%"></div>
        </div>
        <div style="font-size:7px;color:#94a3b8;margin-top:2px;">${(leftPct * 100).toFixed(0)}/${(rightPct * 100).toFixed(0)}</div>
    </div>`;
}
