/**
 * useCoPMetrics — calculates Center of Pressure metrics over rolling and session windows.
 *
 * Inputs: instantaneousData (live sensor snapshot)
 * Outputs:
 *   - cop: { x, y }   current CoP position, normalized [-100, 100]
 *   - live: { velocity, ellipseArea, symmetry, samples }  rolling 10s window
 *   - session: { velocity, ellipseArea, symmetry, duration, samples }  full session
 *   - trail: last ~3s of CoP points for visual trail
 *   - resetSession: () => void
 *
 * Metrics:
 *   velocity     — mean absolute CoP displacement per second, in %/s
 *   ellipseArea  — 95% confidence ellipse area (sqrt of X variance × Y variance × 5.991), in %²
 *   symmetry     — mean |leftPct - rightPct|, in percentage points
 */

import { useState, useRef, useEffect, useCallback } from 'react';

const ROLLING_WINDOW_MS = 10_000; // 10 seconds live window
const TRAIL_WINDOW_MS = 3_000;     // 3 seconds visible trail
// Validity gate is on the RAW ADC sum (all six channels), NOT the ×0.005-scaled,
// integer-rounded force. Rationale: standing only swings the scaled total to ~6, so
// the old gate of 20 left 0% of samples valid; and the rounded single-digit ints
// destroy CoP resolution. The raw sum is ~1100 standing / exactly 0 on an empty board,
// giving ~200× more resolution and a clean active/inactive separation. Tune here.
export const MIN_RAW_TOTAL_FOR_VALID = 300; // raw counts: empty=0, single-leg~520, two-leg~1100

// Sum of the raw (unscaled) per-channel ADC values exposed by useForceData (leftRaw/rightRaw).
export function rawStanceTotal(data) {
    if (!data) return 0;
    const l = data.leftRaw || {};
    const r = data.rightRaw || {};
    return (l.heel || 0) + (l.ball || 0) + (l.toe || 0)
         + (r.heel || 0) + (r.ball || 0) + (r.toe || 0);
}

// True when there's enough weight on the board to trust the CoP. Shared so every
// balance view can gate identically (replaces the duplicated `total < 20` literals).
export function isActiveStance(data) {
    return rawStanceTotal(data) >= MIN_RAW_TOTAL_FOR_VALID;
}

function computeCoP(data) {
    if (!data) return null;
    const l = data.leftRaw || {};
    const r = data.rightRaw || {};
    const rawLeft = (l.heel || 0) + (l.ball || 0) + (l.toe || 0);
    const rawRight = (r.heel || 0) + (r.ball || 0) + (r.toe || 0);
    const total = rawLeft + rawRight;
    if (total < MIN_RAW_TOTAL_FOR_VALID) return null;

    // X: -100 (all left) to +100 (all right) — from raw sums, for full resolution.
    const x = ((rawRight - rawLeft) / total) * 100;
    // Y: -100 (all heel) to +100 (all toe). NOTE: this stays heel-pinned (~-100) until
    // the toe channels actually register load — that's a hardware/load-path issue,
    // not this math. Ellipse area will read ~0 (degenerate 1-D) while toes are dead.
    const frontTotal = (l.ball || 0) + (l.toe || 0) + (r.ball || 0) + (r.toe || 0);
    const heelTotal = (l.heel || 0) + (r.heel || 0);
    const apTotal = frontTotal + heelTotal;
    const y = apTotal > 0 ? ((frontTotal - heelTotal) / apTotal) * 100 : 0;

    const leftPct = (rawLeft / total) * 100;
    const rightPct = (rawRight / total) * 100;

    return {
        x: Math.max(-100, Math.min(100, x)),
        y: Math.max(-100, Math.min(100, y)),
        leftPct,
        rightPct,
        total,
    };
}

function metricsFromBuffer(buffer) {
    if (buffer.length < 2) {
        return { velocity: 0, ellipseArea: 0, symmetry: 0, samples: buffer.length };
    }

    // Velocity: total path length / elapsed time
    let pathLength = 0;
    for (let i = 1; i < buffer.length; i++) {
        const dx = buffer[i].x - buffer[i - 1].x;
        const dy = buffer[i].y - buffer[i - 1].y;
        pathLength += Math.sqrt(dx * dx + dy * dy);
    }
    const elapsedS = (buffer[buffer.length - 1].t - buffer[0].t) / 1000;
    const velocity = elapsedS > 0 ? pathLength / elapsedS : 0;

    // Ellipse area: 95% confidence ellipse via variance
    const meanX = buffer.reduce((s, p) => s + p.x, 0) / buffer.length;
    const meanY = buffer.reduce((s, p) => s + p.y, 0) / buffer.length;
    const varX = buffer.reduce((s, p) => s + (p.x - meanX) ** 2, 0) / buffer.length;
    const varY = buffer.reduce((s, p) => s + (p.y - meanY) ** 2, 0) / buffer.length;
    const covXY = buffer.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) / buffer.length;
    // 95% prediction ellipse: pi * sqrt(5.991) * sqrt(varX*varY - covXY^2)
    const det = Math.max(0, varX * varY - covXY * covXY);
    const ellipseArea = Math.PI * Math.sqrt(5.991) * Math.sqrt(det);

    // Symmetry: mean |L% - R%|
    const symmetry = buffer.reduce((s, p) => s + Math.abs(p.leftPct - p.rightPct), 0) / buffer.length;

    return { velocity, ellipseArea, symmetry, samples: buffer.length };
}

export function useCoPMetrics(instantaneousData) {
    const bufferRef = useRef([]);       // [{ t, x, y, leftPct, rightPct }]
    const sessionStartRef = useRef(null);
    const [cop, setCop] = useState(null);
    const [liveMetrics, setLiveMetrics] = useState({ velocity: 0, ellipseArea: 0, symmetry: 0, samples: 0 });
    const [sessionMetrics, setSessionMetrics] = useState({ velocity: 0, ellipseArea: 0, symmetry: 0, samples: 0, duration: 0 });
    const [trail, setTrail] = useState([]);

    // Ingest new samples
    useEffect(() => {
        if (!instantaneousData) return;
        const c = computeCoP(instantaneousData);
        if (!c) return;
        const now = performance.now();
        if (sessionStartRef.current === null) sessionStartRef.current = now;

        bufferRef.current.push({ t: now, ...c });
        // Cap buffer at 5 minutes to prevent unbounded growth
        const cap = now - 5 * 60 * 1000;
        while (bufferRef.current.length > 0 && bufferRef.current[0].t < cap) {
            bufferRef.current.shift();
        }
        setCop({ x: c.x, y: c.y });
    }, [instantaneousData]);

    // Compute metrics at ~10 Hz (decoupled from data rate to reduce re-renders)
    useEffect(() => {
        const id = setInterval(() => {
            const now = performance.now();
            const rollingStart = now - ROLLING_WINDOW_MS;
            const rolling = bufferRef.current.filter(p => p.t >= rollingStart);
            setLiveMetrics(metricsFromBuffer(rolling));

            const full = bufferRef.current;
            const sessionM = metricsFromBuffer(full);
            const duration = sessionStartRef.current ? (now - sessionStartRef.current) / 1000 : 0;
            setSessionMetrics({ ...sessionM, duration });

            const trailStart = now - TRAIL_WINDOW_MS;
            const recentTrail = bufferRef.current.filter(p => p.t >= trailStart).map(p => ({
                x: p.x, y: p.y, age: (now - p.t) / TRAIL_WINDOW_MS, // 0 = newest, 1 = oldest
            }));
            setTrail(recentTrail);
        }, 100);
        return () => clearInterval(id);
    }, []);

    const resetSession = useCallback(() => {
        bufferRef.current = [];
        sessionStartRef.current = performance.now();
        setLiveMetrics({ velocity: 0, ellipseArea: 0, symmetry: 0, samples: 0 });
        setSessionMetrics({ velocity: 0, ellipseArea: 0, symmetry: 0, samples: 0, duration: 0 });
        setTrail([]);
    }, []);

    return { cop, live: liveMetrics, session: sessionMetrics, trail, resetSession };
}

export default useCoPMetrics;
