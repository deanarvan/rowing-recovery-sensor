/**
 * useAchillesMetrics — IMU-driven ankle-angle engine for Achilles rehab (Alfredson eccentrics).
 *
 * Input: instantaneousData (the BLE snapshot from useForceData; carries pitch/roll/yaw in degrees
 *        plus the force fields). When pitch is null (USB-serial board, simulation, or a legacy
 *        12-byte firmware) the hook is inert and `hasAngle` is false so the view falls back to
 *        force-only mode.
 *
 * What it does:
 *   - Zeroes board pitch & roll at a neutral stance (auto on mount + manual setNeutral()).
 *   - Auto-detects plantarflexion direction by correlating the first heel-off (forefoot load) with
 *     the sign of the pitch change, so plantarflexion always reads positive. flipDirection() overrides.
 *   - Runs a debounced REST → ASCEND → DESCEND state machine over the smoothed pitch angle, gated by
 *     forefoot load (heel-off) — i.e. it combines the IMU angle with the force shifting heel→toe.
 *   - Per rep: peak plantarflexion ROM, eccentric (descent) duration scored against a target tempo
 *     (Alfredson ~3 s), L/R forefoot-load symmetry, and the worst medial-lateral wobble.
 *   - Surfaces live roll as a force-independent side-to-side tilt for the balance gradient.
 *
 * Mirrors useCoPMetrics' structure: a per-sample ingest effect + a 50 ms interval for the live
 * eccentric timer. Tunable thresholds are named consts at the top.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Tunable thresholds ───────────────────────────────────────────────────────
const CALIB_N = 10;            // samples averaged to capture the neutral zero (~0.2 s @ 50 Hz)
const ANGLE_SMOOTHING = 0.3;   // EMA factor for pitch & roll (matches useForceData's idiom)
const ACTIVITY_MIN = 20;       // total force to count as "on the board" (matches the CoP gate)
const ANGLE_RISE = 4;          // deg above neutral to begin a rep (heel-off candidate)
const FWD_ON = 60;             // forefoot load % gating heel-off (start of a rep)
const FWD_OFF = 45;            // forefoot load % confirming heel-down again (end of a rep)
const DROP_EPS = 2;            // deg below the apex to declare the eccentric descent has begun
const MIN_ROM = 8;             // deg peak plantarflexion required to count a rep
const MIN_SAMPLES = 4;         // debounce: samples to hold before a phase transition

export function tempoScore(eccentricS, targetEccentricS) {
    const r = targetEccentricS > 0 ? eccentricS / targetEccentricS : 0;
    if (r >= 0.85) return { stars: 3, label: 'Excellent control', key: 'excellent' };
    if (r >= 0.5)  return { stars: 2, label: 'Good', key: 'good' };
    return { stars: 1, label: 'Too fast — control it', key: 'fast' };
}

export function useAchillesMetrics(instantaneousData, { targetEccentricS = 3 } = {}) {
    const [hasAngle, setHasAngle] = useState(false);
    const [live, setLive] = useState({
        angle: 0, rollDeg: 0, lateralTiltDeg: 0, phase: 'REST',
        peakThisRep: 0, leftShare: 50, rightShare: 50, symmetryPct: 0,
    });
    const [repSummary, setRepSummary] = useState({
        count: 0, lastEccentricS: 0, lastTempoScore: null, bestEccentricS: 0, bestRomDeg: 0,
    });
    const [reps, setReps] = useState([]);
    const [eccentricElapsedS, setEccentricElapsedS] = useState(0);

    // Calibration / zero reference
    const calibRef = useRef({ n: 0, pSum: 0, rSum: 0, done: false });
    const neutralRef = useRef({ pitch: 0, roll: 0 });
    const dirRef = useRef({ sign: 1, detected: false });

    // EMA smoothing state
    const smRef = useRef({ angle: 0, roll: 0, init: false });

    // Phase machine state
    const phaseRef = useRef('REST');
    const peakRef = useRef(0);
    const samplesRef = useRef(0);
    const eccStartRef = useRef(0);
    const accRef = useRef({ symSum: 0, symN: 0, maxLat: 0 });

    // Latest target tempo, readable from the interval without re-subscribing
    const targetRef = useRef(targetEccentricS);
    targetRef.current = targetEccentricS;

    const resetMachine = () => {
        phaseRef.current = 'REST';
        peakRef.current = 0;
        samplesRef.current = 0;
        accRef.current = { symSum: 0, symN: 0, maxLat: 0 };
    };

    // ── Per-sample ingest ──────────────────────────────────────────────────────
    useEffect(() => {
        const d = instantaneousData;
        if (!d || d.pitch == null) {
            if (hasAngle) { setHasAngle(false); resetMachine(); }
            return;
        }
        if (!hasAngle) setHasAngle(true);

        const rawPitch = d.pitch;
        const rawRoll = d.roll ?? 0;

        // Capture the neutral zero over the first CALIB_N samples (running mean)
        const cal = calibRef.current;
        if (!cal.done) {
            cal.n += 1; cal.pSum += rawPitch; cal.rSum += rawRoll;
            neutralRef.current = { pitch: cal.pSum / cal.n, roll: cal.rSum / cal.n };
            if (cal.n >= CALIB_N) cal.done = true;
        }
        const neutral = neutralRef.current;

        // Forces / forefoot fractions (same maths HeelRiseView already uses)
        const lr = d.leftRaw || { heel: 0, ball: 0, toe: 0 };
        const rr = d.rightRaw || { heel: 0, ball: 0, toe: 0 };
        const leftFwd = (lr.ball || 0) + (lr.toe || 0);
        const rightFwd = (rr.ball || 0) + (rr.toe || 0);
        const totalFront = leftFwd + rightFwd;
        const totalAll = totalFront + (lr.heel || 0) + (rr.heel || 0);
        const fwd = totalAll > 0 ? (totalFront / totalAll) * 100 : 0;
        const leftShare = totalFront > 0 ? (leftFwd / totalFront) * 100 : 50;
        const rightShare = 100 - leftShare;
        const symmetryPct = Math.abs(leftShare - rightShare);
        const active = ((d.leftForce || 0) + (d.rightForce || 0)) >= ACTIVITY_MIN;

        // Auto-detect plantarflexion direction on the first qualifying heel-off
        if (!dirRef.current.detected && active && fwd > FWD_ON && cal.done) {
            const s = Math.sign(rawPitch - neutral.pitch);
            if (s !== 0) {
                dirRef.current.sign = s;
                dirRef.current.detected = true;
                smRef.current.init = false; // re-seed smoothing with corrected sign (no jump)
            }
        }

        // Signed, direction-corrected pitch (plantarflexion positive) + EMA smoothing
        const sm = smRef.current;
        const rawAngle = (rawPitch - neutral.pitch) * dirRef.current.sign;
        const rawRollDeg = rawRoll - neutral.roll;
        if (!sm.init) { sm.angle = rawAngle; sm.roll = rawRollDeg; sm.init = true; }
        sm.angle = rawAngle * ANGLE_SMOOTHING + sm.angle * (1 - ANGLE_SMOOTHING);
        sm.roll = rawRollDeg * ANGLE_SMOOTHING + sm.roll * (1 - ANGLE_SMOOTHING);
        const angle = sm.angle;
        const rollDeg = sm.roll;
        const lateralTiltDeg = Math.abs(rollDeg);

        // ── Phase machine ──
        samplesRef.current += 1;
        const phase = phaseRef.current;
        const acc = accRef.current;

        if (!active) {
            if (phase !== 'REST') resetMachine(); // stepped off / unloaded → abort the rep
        } else if (phase === 'REST') {
            if (fwd > FWD_ON && angle > ANGLE_RISE && samplesRef.current > MIN_SAMPLES) {
                phaseRef.current = 'ASCEND';
                peakRef.current = angle;
                accRef.current = { symSum: symmetryPct, symN: 1, maxLat: lateralTiltDeg };
                samplesRef.current = 0;
            }
        } else if (phase === 'ASCEND') {
            if (angle > peakRef.current) peakRef.current = angle;
            acc.symSum += symmetryPct; acc.symN += 1;
            if (lateralTiltDeg > acc.maxLat) acc.maxLat = lateralTiltDeg;
            // Apex passed → eccentric descent has begun
            if (samplesRef.current > MIN_SAMPLES && angle < peakRef.current - DROP_EPS) {
                phaseRef.current = 'DESCEND';
                eccStartRef.current = performance.now();
                samplesRef.current = 0;
            }
        } else if (phase === 'DESCEND') {
            acc.symSum += symmetryPct; acc.symN += 1;
            if (lateralTiltDeg > acc.maxLat) acc.maxLat = lateralTiltDeg;
            const backDown = angle < ANGLE_RISE / 2 || fwd < FWD_OFF;
            if (backDown && samplesRef.current > MIN_SAMPLES) {
                const eccS = (performance.now() - eccStartRef.current) / 1000;
                const romDeg = peakRef.current;
                if (romDeg >= MIN_ROM) {
                    const score = tempoScore(eccS, targetRef.current);
                    const symAvg = acc.symN > 0 ? acc.symSum / acc.symN : 0;
                    const rep = {
                        t: performance.now(),
                        romDeg,
                        eccentricS: eccS,
                        tempoScore: score,
                        symmetryPct: symAvg,
                        maxLateralTiltDeg: acc.maxLat,
                    };
                    setReps(prev => {
                        const u = [...prev, rep];
                        return u.length > 20 ? u.slice(-20) : u;
                    });
                    setRepSummary(prev => ({
                        count: prev.count + 1,
                        lastEccentricS: eccS,
                        lastTempoScore: score,
                        bestEccentricS: Math.max(prev.bestEccentricS, eccS),
                        bestRomDeg: Math.max(prev.bestRomDeg, romDeg),
                    }));
                }
                phaseRef.current = 'REST';
                samplesRef.current = 0;
            }
        }

        setLive({
            angle, rollDeg, lateralTiltDeg,
            phase: phaseRef.current,
            peakThisRep: peakRef.current,
            leftShare, rightShare, symmetryPct,
        });
    }, [instantaneousData]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Live eccentric timer (decoupled from data rate) ──
    useEffect(() => {
        const id = setInterval(() => {
            if (phaseRef.current === 'DESCEND') {
                setEccentricElapsedS((performance.now() - eccStartRef.current) / 1000);
            } else {
                setEccentricElapsedS(0);
            }
        }, 50);
        return () => clearInterval(id);
    }, []);

    const setNeutral = useCallback(() => {
        calibRef.current = { n: 0, pSum: 0, rSum: 0, done: false };
        smRef.current.init = false;
        resetMachine();
    }, []);

    const flipDirection = useCallback(() => {
        dirRef.current.sign *= -1;
        dirRef.current.detected = true; // a manual override sticks
        smRef.current.init = false;     // re-seed smoothing with the new sign
        resetMachine();
    }, []);

    const reset = useCallback(() => {
        resetMachine();
        dirRef.current = { sign: 1, detected: false };
        calibRef.current = { n: 0, pSum: 0, rSum: 0, done: false };
        smRef.current = { angle: 0, roll: 0, init: false };
        setReps([]);
        setRepSummary({ count: 0, lastEccentricS: 0, lastTempoScore: null, bestEccentricS: 0, bestRomDeg: 0 });
        setEccentricElapsedS(0);
        setLive(l => ({ ...l, phase: 'REST', peakThisRep: 0 }));
    }, []);

    return {
        hasAngle,
        angle: live.angle,
        phase: live.phase,
        peakThisRep: live.peakThisRep,
        rollDeg: live.rollDeg,
        lateralTiltDeg: live.lateralTiltDeg,
        rom: { best: repSummary.bestRomDeg },
        rep: {
            count: repSummary.count,
            lastEccentricS: repSummary.lastEccentricS,
            lastTempoScore: repSummary.lastTempoScore,
            bestEccentricS: repSummary.bestEccentricS,
        },
        reps,
        symmetryPct: live.symmetryPct,
        leftShare: live.leftShare,
        rightShare: live.rightShare,
        eccentricElapsedS,
        targetEccentricS,
        setNeutral,
        flipDirection,
        reset,
    };
}

export default useAchillesMetrics;
