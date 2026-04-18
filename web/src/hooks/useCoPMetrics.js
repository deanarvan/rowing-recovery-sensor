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
const MIN_TOTAL_FOR_VALID = 20;    // ignore samples below this total force (user off board)

function computeCoP(data) {
    const { leftForce, rightForce, leftRaw, rightRaw } = data;
    const total = leftForce + rightForce;
    if (total < MIN_TOTAL_FOR_VALID) return null;

    // X: -100 (all left) to +100 (all right)
    const x = ((rightForce - leftForce) / total) * 100;
    // Y: -100 (all heel) to +100 (all toe)
    const frontTotal = (leftRaw.ball || 0) + (leftRaw.toe || 0) + (rightRaw.ball || 0) + (rightRaw.toe || 0);
    const heelTotal = (leftRaw.heel || 0) + (rightRaw.heel || 0);
    const apTotal = frontTotal + heelTotal;
    const y = apTotal > 0 ? ((frontTotal - heelTotal) / apTotal) * 100 : 0;

    const leftPct = (leftForce / total) * 100;
    const rightPct = (rightForce / total) * 100;

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
