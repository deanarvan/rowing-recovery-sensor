/**
 * Impulse Tracking Module
 *
 * Calculates per-stroke mechanical impulse (force × time integral) during
 * the drive phase. Impulse is a superior metric to peak force because it
 * captures total energy transfer and neuromuscular endurance.
 *
 * Research baselines (per-leg, steady-state):
 *   Male:   185.3 Ns (SD: ± 20.0 Ns)
 *   Female: 136.5 Ns (SD: ± 11.8 Ns)
 *
 * Normal force degradation: 1.0-1.5% per stroke over 30-stroke session.
 * Asymmetric fatigue slope (left vs right) is the primary pathological marker.
 *
 * Drive phase timing:
 *   20 SPM: 1.00s drive, 2.00s recovery (1:2 ratio)
 *   24 SPM: 0.70s drive, 1.80s recovery
 *   Integration window: 0.70-1.00s depending on stroke rate
 *
 * Patent Reference: Section 4 — Force Integration and Impulse Analysis
 * Clinical Sources: Gemini deep research on normative biomechanical data
 */

import { getClosestBaseline } from './injuryProfiles.js';

// ─── Impulse Reference Baselines ────────────────────────────────────────────

export const IMPULSE_BASELINES = {
    // Per-leg impulse targets (Ns) during steady-state drive phase
    // Derived from elite cohort scaled to 65% steady-state
    peak: {
        male:   { impulse: 185.3, sd: 20.0 },
        female: { impulse: 136.5, sd: 11.8 },
    },

    // Age-scaled per-leg targets using biphasic decline model
    // Same model as force baselines: 0.15%/yr pre-52, 1.3%/yr post-52
    getAgeScaled(age, sex) {
        const base = this.peak[sex] || this.peak.male;
        const factor = ageDeclineFactor(age);
        return {
            target: Math.round(base.impulse * factor * 10) / 10,
            sd: Math.round(base.sd * factor * 10) / 10,
            floor: Math.round(base.impulse * factor * 0.7 * 10) / 10, // 70% of target = minimum acceptable
        };
    },
};

function ageDeclineFactor(age) {
    if (age <= 25) return 1.0;
    if (age <= 52) return 1.0 - (age - 25) * 0.0015;
    const slowDecline = 27 * 0.0015;
    const fastDecline = (age - 52) * 0.013;
    return Math.max(0.3, 1.0 - slowDecline - fastDecline);
}


// ─── Drive Phase Detection ──────────────────────────────────────────────────

/**
 * Detect the drive phase boundaries from raw sensor samples.
 * The drive phase begins when total force exceeds a threshold and ends
 * when force drops back below it.
 *
 * @param {Array} samples - Raw sensor samples with timestamps
 * @param {number} [forceThreshold] - Fraction of peak force to define drive onset/offset (default 0.1)
 * @param {number} [sampleRateHz] - Sampling rate (default 50Hz)
 * @returns {{ startIdx: number, endIdx: number, durationMs: number, samples: Array }}
 */
export function detectDrivePhase(samples, forceThreshold = 0.1, sampleRateHz = 50) {
    if (!samples || samples.length < 3) return null;

    // Compute total force per sample (all 6 sensors)
    const forces = samples.map(s => {
        const left = (s.leftHeel || 0) + (s.leftBall || 0) + (s.leftToe || 0);
        const right = (s.rightHeel || 0) + (s.rightBall || 0) + (s.rightToe || 0);
        return { total: left + right, left, right, ts: s.timestamp || 0 };
    });

    // Find peak total force
    let peakForce = 0;
    for (const f of forces) {
        if (f.total > peakForce) peakForce = f.total;
    }
    if (peakForce === 0) return null;

    const threshold = peakForce * forceThreshold;

    // Find drive onset (first sample above threshold)
    let startIdx = -1;
    for (let i = 0; i < forces.length; i++) {
        if (forces[i].total > threshold) {
            startIdx = i;
            break;
        }
    }

    // Find drive offset (last sample above threshold after start)
    let endIdx = startIdx;
    for (let i = forces.length - 1; i > startIdx; i--) {
        if (forces[i].total > threshold) {
            endIdx = i;
            break;
        }
    }

    if (startIdx < 0 || endIdx <= startIdx) return null;

    const driveSamples = forces.slice(startIdx, endIdx + 1);
    const durationMs = (driveSamples.length / sampleRateHz) * 1000;

    return {
        startIdx,
        endIdx,
        durationMs: Math.round(durationMs),
        durationS: Math.round(durationMs / 10) / 100,
        sampleCount: driveSamples.length,
        samples: driveSamples,
    };
}


// ─── Per-Stroke Impulse Calculation ─────────────────────────────────────────

/**
 * Calculate the mechanical impulse for a single stroke using trapezoidal integration.
 *
 * Impulse = ∫F·dt = Σ((F[i] + F[i+1])/2 × Δt)
 *
 * Returns per-leg impulse values in Newton-seconds (for calibrated sensors)
 * or arbitrary impulse units (for uncalibrated sensors).
 *
 * @param {Array} driveSamples - Drive-phase samples from detectDrivePhase()
 * @param {number} sampleRateHz - Sampling rate (default 50Hz)
 * @returns {{ leftImpulse: number, rightImpulse: number, totalImpulse: number, ratio: number }}
 */
export function calcStrokeImpulse(driveSamples, sampleRateHz = 50) {
    if (!driveSamples || driveSamples.length < 2) {
        return { leftImpulse: 0, rightImpulse: 0, totalImpulse: 0, ratio: 50 };
    }

    const dt = 1.0 / sampleRateHz; // Time between samples in seconds
    let leftImpulse = 0;
    let rightImpulse = 0;

    // Trapezoidal integration
    for (let i = 0; i < driveSamples.length - 1; i++) {
        const leftAvg = (driveSamples[i].left + driveSamples[i + 1].left) / 2;
        const rightAvg = (driveSamples[i].right + driveSamples[i + 1].right) / 2;
        leftImpulse += leftAvg * dt;
        rightImpulse += rightAvg * dt;
    }

    const totalImpulse = leftImpulse + rightImpulse;
    const ratio = totalImpulse > 0
        ? Math.round((leftImpulse / totalImpulse) * 1000) / 10
        : 50;

    return {
        leftImpulse: Math.round(leftImpulse * 100) / 100,
        rightImpulse: Math.round(rightImpulse * 100) / 100,
        totalImpulse: Math.round(totalImpulse * 100) / 100,
        ratio, // Left as % of total (50 = symmetric)
    };
}


// ─── Session Impulse Tracking ───────────────────────────────────────────────

/**
 * Track impulse across a full session and compute degradation slopes.
 *
 * Normal degradation: 1.0-1.5% per stroke.
 * Asymmetric degradation: left vs right slopes diverging = pathological.
 *
 * @param {Array} strokeImpulses - Array of { leftImpulse, rightImpulse, strokeNumber }
 * @returns {Object} Session impulse analysis
 */
export function analyzeSessionImpulse(strokeImpulses) {
    if (!strokeImpulses || strokeImpulses.length < 5) {
        return { available: false };
    }

    const n = strokeImpulses.length;

    // Compute degradation slopes via linear regression
    const leftSlope = linearRegressionSlope(strokeImpulses.map(s => s.leftImpulse));
    const rightSlope = linearRegressionSlope(strokeImpulses.map(s => s.rightImpulse));

    // Convert to percentage per stroke relative to first stroke
    const firstLeft = strokeImpulses[0].leftImpulse;
    const firstRight = strokeImpulses[0].rightImpulse;
    const leftDegPct = firstLeft > 0 ? (leftSlope / firstLeft) * 100 : 0;
    const rightDegPct = firstRight > 0 ? (rightSlope / firstRight) * 100 : 0;

    // Session averages
    const avgLeft = strokeImpulses.reduce((s, v) => s + v.leftImpulse, 0) / n;
    const avgRight = strokeImpulses.reduce((s, v) => s + v.rightImpulse, 0) / n;

    // Asymmetric fatigue detection
    // If one side degrades >2x faster than the other, it's pathological
    const slopeRatio = Math.abs(rightDegPct) > 0
        ? Math.abs(leftDegPct / rightDegPct)
        : leftDegPct !== 0 ? Infinity : 1;
    const asymmetricFatigue = slopeRatio > 2.0 || slopeRatio < 0.5;

    // Normal range check: 1.0-1.5% per stroke
    const avgDegPct = (Math.abs(leftDegPct) + Math.abs(rightDegPct)) / 2;
    const degradationSeverity =
        avgDegPct > 3.0 ? 'severe' :
        avgDegPct > 1.5 ? 'elevated' :
        'normal';

    return {
        available: true,
        strokeCount: n,

        session: {
            leftAvgImpulse: Math.round(avgLeft * 100) / 100,
            rightAvgImpulse: Math.round(avgRight * 100) / 100,
            totalAvgImpulse: Math.round((avgLeft + avgRight) * 100) / 100,
            impulseSymmetry: Math.round((Math.min(avgLeft, avgRight) / Math.max(avgLeft, avgRight)) * 1000) / 10,
        },

        degradation: {
            leftSlopePerStroke: Math.round(leftSlope * 1000) / 1000,
            rightSlopePerStroke: Math.round(rightSlope * 1000) / 1000,
            leftPctPerStroke: Math.round(leftDegPct * 100) / 100,
            rightPctPerStroke: Math.round(rightDegPct * 100) / 100,
            avgPctPerStroke: Math.round(avgDegPct * 100) / 100,
            severity: degradationSeverity,
            asymmetricFatigue,
            slopeRatio: Math.round(slopeRatio * 100) / 100,
        },

        // Per-stroke data for charting
        perStroke: strokeImpulses.map((s, i) => ({
            stroke: i + 1,
            left: s.leftImpulse,
            right: s.rightImpulse,
            total: s.leftImpulse + s.rightImpulse,
        })),
    };
}


// ─── Drive Time Validation ──────────────────────────────────────────────────

/**
 * Validate drive phase duration against expected ranges.
 *
 * Expected at 20 SPM: 1.00s (drive:recovery = 1:2)
 * Expected at 24 SPM: 0.70s
 * Minimum valid: 0.60s (below = "rushing the slide")
 * Maximum valid: 1.50s (above = very slow, likely not rowing)
 *
 * @param {number} driveDurationMs - Drive phase duration in milliseconds
 * @param {number} strokeRateSPM - Current stroke rate
 * @returns {{ valid: boolean, warning: string|null, expectedMs: number }}
 */
export function validateDriveDuration(driveDurationMs, strokeRateSPM = 20) {
    // At given SPM: cycle time = 60/SPM seconds
    // Drive = cycle / 3 (1:2 ratio means drive is 1/3 of cycle)
    const cycleSec = 60 / strokeRateSPM;
    const expectedDriveSec = cycleSec / 3;
    const expectedMs = Math.round(expectedDriveSec * 1000);

    if (driveDurationMs < 600) {
        return {
            valid: false,
            warning: 'Drive phase too short — "rushing the slide" technique error',
            expectedMs,
        };
    }

    if (driveDurationMs > 1500) {
        return {
            valid: false,
            warning: 'Drive phase unusually long — verify stroke detection boundaries',
            expectedMs,
        };
    }

    // Allow ±30% tolerance
    const tolerance = expectedMs * 0.3;
    if (Math.abs(driveDurationMs - expectedMs) > tolerance) {
        return {
            valid: true,
            warning: `Drive duration ${driveDurationMs}ms differs from expected ${expectedMs}ms at ${strokeRateSPM} SPM`,
            expectedMs,
        };
    }

    return { valid: true, warning: null, expectedMs };
}


// ─── Impulse vs Baseline Comparison ─────────────────────────────────────────

/**
 * Compare a session's average impulse against age/sex-scaled baselines.
 *
 * @param {number} avgPerLegImpulse - Session average per-leg impulse (Ns)
 * @param {number} age - Patient age
 * @param {string} sex - 'male' or 'female'
 * @param {boolean} calibrated - Whether sensor values are in calibrated Newtons
 * @returns {Object} Comparison result
 */
export function compareImpulseToBaseline(avgPerLegImpulse, age, sex, calibrated = false) {
    if (!calibrated) {
        return {
            available: false,
            reason: 'Impulse comparison requires calibrated sensors (run calibration first)',
        };
    }

    const baseline = IMPULSE_BASELINES.getAgeScaled(age, sex);
    const pctOfTarget = (avgPerLegImpulse / baseline.target) * 100;

    return {
        available: true,
        measured: Math.round(avgPerLegImpulse * 10) / 10,
        target: baseline.target,
        floor: baseline.floor,
        pctOfTarget: Math.round(pctOfTarget * 10) / 10,
        meetsTarget: avgPerLegImpulse >= baseline.target,
        meetsFloor: avgPerLegImpulse >= baseline.floor,
        deficit: avgPerLegImpulse < baseline.floor
            ? Math.round((baseline.floor - avgPerLegImpulse) * 10) / 10
            : 0,
        status: avgPerLegImpulse >= baseline.target ? 'normal'
            : avgPerLegImpulse >= baseline.floor ? 'below_target'
            : 'deficit',
    };
}


// ─── Utility ────────────────────────────────────────────────────────────────

function linearRegressionSlope(values) {
    const n = values.length;
    if (n < 3) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
}
