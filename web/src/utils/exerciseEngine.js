/**
 * Exercise-Aware Analysis Engine
 *
 * Adapts the asymmetry extraction pipeline to the biomechanical demands
 * of each exercise type. Each exercise gets its own processing pipeline
 * with exercise-specific phase segmentation and metric computation.
 *
 * Supported exercises:
 *   - Rowing: temporal phase segmentation (drive/recovery), stroke-based metrics
 *   - Squat: eccentric/concentric decomposition, quad avoidance detection
 *   - Balance Board: CoP velocity, sway area, mediolateral transition timing
 *
 * Patent Reference: Section 6 — Exercise-Aware Analysis Engine
 */

import { calcSymmetryIndex, calcImpulseRatio, calcShapeDifference,
         calcFootCoP, calcCoPAsymmetry, calcFatigueSlope, calcImpulse } from './recoveryMetrics.js';

// ─── Exercise Types ──────────────────────────────────────────────────────────

export const EXERCISE_TYPES = {
    ROWING: 'rowing',
    SQUAT: 'squat',
    BALANCE_BOARD: 'balance_board',
};

// ─── Squat Analysis Engine ───────────────────────────────────────────────────

/**
 * Segment a squat repetition into eccentric (descent) and concentric (ascent) phases.
 * Uses the inflection point of the total force-time curve.
 *
 * @param {Array} samples - Array of data points for one rep
 * @returns {{ eccentric: Array, concentric: Array, inflectionIdx: number }}
 */
export function segmentSquatPhases(samples) {
    if (!samples || samples.length < 5) {
        return { eccentric: samples || [], concentric: [], inflectionIdx: 0 };
    }

    // Total force per sample
    const forces = samples.map(s => (s.leftForce || 0) + (s.rightForce || 0));

    // Find the minimum force point (bottom of squat = inflection)
    // During descent, total GRF decreases (unweighting); during ascent, it increases
    let minForce = Infinity;
    let inflectionIdx = 0;

    for (let i = 1; i < forces.length - 1; i++) {
        if (forces[i] < minForce) {
            minForce = forces[i];
            inflectionIdx = i;
        }
    }

    return {
        eccentric: samples.slice(0, inflectionIdx + 1),
        concentric: samples.slice(inflectionIdx),
        inflectionIdx,
    };
}

/**
 * Detect quadriceps avoidance pattern (specific to ACL reconstruction patients).
 *
 * Pattern signature:
 *   - Elevated early-stance GRF (momentum-dependent descent, using gravity not muscles)
 *   - Depressed mid-stance GRF (reduced eccentric quadriceps loading)
 *
 * @param {Array} eccentricSamples - Eccentric phase data points
 * @param {string} injuredSide - 'left' or 'right'
 * @returns {{ detected: boolean, severity: string, earlyStanceRatio: number, midStanceRatio: number }}
 */
export function detectQuadAvoidance(eccentricSamples, injuredSide) {
    if (!eccentricSamples || eccentricSamples.length < 6) {
        return { detected: false, severity: 'none', earlyStanceRatio: 1, midStanceRatio: 1 };
    }

    const third = Math.floor(eccentricSamples.length / 3);

    // Split eccentric into early, mid, and late thirds
    const earlyPhase = eccentricSamples.slice(0, third);
    const midPhase = eccentricSamples.slice(third, third * 2);

    // Compute average force for injured leg in each phase
    const getForce = (s) => injuredSide === 'right' ? (s.rightForce || 0) : (s.leftForce || 0);
    const getHealthyForce = (s) => injuredSide === 'right' ? (s.leftForce || 0) : (s.rightForce || 0);

    const earlyInjured = earlyPhase.reduce((sum, s) => sum + getForce(s), 0) / earlyPhase.length;
    const midInjured = midPhase.reduce((sum, s) => sum + getForce(s), 0) / midPhase.length;
    const earlyHealthy = earlyPhase.reduce((sum, s) => sum + getHealthyForce(s), 0) / earlyPhase.length;
    const midHealthy = midPhase.reduce((sum, s) => sum + getHealthyForce(s), 0) / midPhase.length;

    // Ratios: injured/healthy for each phase
    const earlyStanceRatio = earlyHealthy > 0 ? earlyInjured / earlyHealthy : 1;
    const midStanceRatio = midHealthy > 0 ? midInjured / midHealthy : 1;

    // Quad avoidance pattern: early ratio near normal, mid ratio significantly lower
    // (patient is "falling" into the squat rather than controlling the descent)
    const earlyNormal = earlyStanceRatio > 0.7;
    const midDepressed = midStanceRatio < 0.6;

    const detected = earlyNormal && midDepressed;
    let severity = 'none';
    if (detected) {
        if (midStanceRatio < 0.4) severity = 'high';
        else if (midStanceRatio < 0.6) severity = 'medium';
        else severity = 'low';
    }

    return { detected, severity, earlyStanceRatio, midStanceRatio };
}

/**
 * Build a complete squat rep summary.
 *
 * @param {number} repNumber - Repetition number
 * @param {Array} samples - Data points for this rep
 * @param {string} injuredSide - 'left' or 'right'
 * @returns {Object} Squat rep summary
 */
export function buildSquatRepSummary(repNumber, samples, injuredSide) {
    if (!samples || samples.length < 5) return null;

    const { eccentric, concentric, inflectionIdx } = segmentSquatPhases(samples);

    // Whole-rep metrics (same as rowing stroke metrics)
    let leftPeak = 0, rightPeak = 0;
    for (const s of samples) {
        if ((s.leftForce || 0) > leftPeak) leftPeak = s.leftForce || 0;
        if ((s.rightForce || 0) > rightPeak) rightPeak = s.rightForce || 0;
    }

    const leftImpulse = calcImpulse(samples, 'leftForce');
    const rightImpulse = calcImpulse(samples, 'rightForce');
    const symmetryIndex = calcSymmetryIndex(leftPeak, rightPeak);
    const impulseRatio = calcImpulseRatio(leftImpulse, rightImpulse);
    const shapeDifference = calcShapeDifference(samples);
    const copAsymmetry = samples.reduce((sum, s) => sum + calcCoPAsymmetry(s), 0) / samples.length;

    // Phase-specific metrics
    const eccentricSI = eccentric.length >= 3
        ? calcShapeDifference(eccentric)
        : 0;
    const concentricSI = concentric.length >= 3
        ? calcShapeDifference(concentric)
        : 0;

    // Quad avoidance detection
    const quadAvoidance = detectQuadAvoidance(eccentric, injuredSide);

    // Phase-specific impulse ratios
    const eccentricLeftImpulse = calcImpulse(eccentric, 'leftForce');
    const eccentricRightImpulse = calcImpulse(eccentric, 'rightForce');
    const concentricLeftImpulse = calcImpulse(concentric, 'leftForce');
    const concentricRightImpulse = calcImpulse(concentric, 'rightForce');

    return {
        repNumber,
        exerciseType: EXERCISE_TYPES.SQUAT,
        startTime: samples[0].time,
        endTime: samples[samples.length - 1].time,
        sampleCount: samples.length,
        inflectionIdx,

        // Standard bilateral metrics
        leftPeak,
        rightPeak,
        leftImpulse: Math.round(leftImpulse * 100) / 100,
        rightImpulse: Math.round(rightImpulse * 100) / 100,
        symmetryIndex: Math.round(symmetryIndex * 10) / 10,
        impulseRatio: Math.round(impulseRatio * 10) / 10,
        shapeDifference: Math.round(shapeDifference * 1000) / 1000,
        copAsymmetry: Math.round(copAsymmetry * 1000) / 1000,

        // Squat-specific metrics
        eccentricShapeDiff: Math.round(eccentricSI * 1000) / 1000,
        concentricShapeDiff: Math.round(concentricSI * 1000) / 1000,
        eccentricImpulseRatio: Math.round(
            calcImpulseRatio(eccentricLeftImpulse, eccentricRightImpulse) * 10
        ) / 10,
        concentricImpulseRatio: Math.round(
            calcImpulseRatio(concentricLeftImpulse, concentricRightImpulse) * 10
        ) / 10,

        // ACL-specific
        quadAvoidance,

        // Force curve for visualization
        forceCurve: samples.map(s => ({ l: s.leftForce || 0, r: s.rightForce || 0 })),
    };
}


// ─── Balance Board Analysis Engine ───────────────────────────────────────────

/**
 * Compute Center-of-Pressure velocity (first derivative of CoP trajectory).
 * Higher velocity = less stable, more sway.
 *
 * @param {Array} samples - Array of data points with time and sensor values
 * @returns {{ leftVelocity: number, rightVelocity: number, asymmetry: number }}
 */
export function calcCoPVelocity(samples) {
    if (!samples || samples.length < 3) {
        return { leftVelocity: 0, rightVelocity: 0, asymmetry: 0 };
    }

    let leftVelSum = 0, rightVelSum = 0;
    let count = 0;

    for (let i = 1; i < samples.length; i++) {
        const dt = samples[i].time - samples[i - 1].time;
        if (dt <= 0 || dt > 1) continue;

        const leftCoP_now = calcFootCoP(
            samples[i].leftHeel || 0, samples[i].leftBall || 0, samples[i].leftToe || 0
        );
        const leftCoP_prev = calcFootCoP(
            samples[i - 1].leftHeel || 0, samples[i - 1].leftBall || 0, samples[i - 1].leftToe || 0
        );
        const rightCoP_now = calcFootCoP(
            samples[i].rightHeel || 0, samples[i].rightBall || 0, samples[i].rightToe || 0
        );
        const rightCoP_prev = calcFootCoP(
            samples[i - 1].rightHeel || 0, samples[i - 1].rightBall || 0, samples[i - 1].rightToe || 0
        );

        leftVelSum += Math.abs(leftCoP_now - leftCoP_prev) / dt;
        rightVelSum += Math.abs(rightCoP_now - rightCoP_prev) / dt;
        count++;
    }

    if (count === 0) return { leftVelocity: 0, rightVelocity: 0, asymmetry: 0 };

    const leftVelocity = leftVelSum / count;
    const rightVelocity = rightVelSum / count;
    const maxVel = Math.max(leftVelocity, rightVelocity);
    const asymmetry = maxVel > 0 ? ((leftVelocity - rightVelocity) / maxVel) * 100 : 0;

    return {
        leftVelocity: Math.round(leftVelocity * 1000) / 1000,
        rightVelocity: Math.round(rightVelocity * 1000) / 1000,
        asymmetry: Math.round(asymmetry * 10) / 10,
    };
}

/**
 * Compute mediolateral sway area.
 * Bounded area of the CoP path over a defined window.
 *
 * Uses a simplified ellipse approximation: π × stdX × stdY
 * where X is the left-right force balance and Y is the anterior-posterior CoP.
 *
 * @param {Array} samples - Array of data points
 * @returns {{ leftSwayArea: number, rightSwayArea: number, totalSwayArea: number }}
 */
export function calcSwayArea(samples) {
    if (!samples || samples.length < 5) {
        return { leftSwayArea: 0, rightSwayArea: 0, totalSwayArea: 0 };
    }

    // Compute CoP traces for both feet
    const leftCoPs = samples.map(s =>
        calcFootCoP(s.leftHeel || 0, s.leftBall || 0, s.leftToe || 0)
    );
    const rightCoPs = samples.map(s =>
        calcFootCoP(s.rightHeel || 0, s.rightBall || 0, s.rightToe || 0)
    );

    // Left-right balance (mediolateral)
    const mlBalance = samples.map(s => {
        const leftTotal = (s.leftHeel || 0) + (s.leftBall || 0) + (s.leftToe || 0);
        const rightTotal = (s.rightHeel || 0) + (s.rightBall || 0) + (s.rightToe || 0);
        const total = leftTotal + rightTotal;
        return total > 0 ? (leftTotal - rightTotal) / total : 0;
    });

    // Standard deviation helper
    const std = (arr) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    };

    const leftStdCoP = std(leftCoPs);
    const rightStdCoP = std(rightCoPs);
    const mlStd = std(mlBalance);

    // Sway area approximation (ellipse: π × σ_AP × σ_ML)
    const leftSwayArea = Math.PI * leftStdCoP * mlStd;
    const rightSwayArea = Math.PI * rightStdCoP * mlStd;
    const totalSwayArea = Math.PI * std(leftCoPs.concat(rightCoPs)) * mlStd;

    return {
        leftSwayArea: Math.round(leftSwayArea * 10000) / 10000,
        rightSwayArea: Math.round(rightSwayArea * 10000) / 10000,
        totalSwayArea: Math.round(totalSwayArea * 10000) / 10000,
    };
}

/**
 * Compute mediolateral weight transition timing.
 * Time to shift weight from one limb to the other.
 * Clinical significance: transitions exceeding 3 seconds indicate impaired control.
 *
 * @param {Array} samples - Array of data points with time
 * @param {number} [threshold=0.6] - Proportion of weight that constitutes "on that side"
 * @returns {{ transitions: Array, avgTransitionTime: number, slowTransitions: number }}
 */
export function calcTransitionTiming(samples, threshold = 0.6) {
    if (!samples || samples.length < 10) {
        return { transitions: [], avgTransitionTime: 0, slowTransitions: 0 };
    }

    const transitions = [];
    let currentSide = null; // 'left', 'right', or 'center'
    let transitionStart = null;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const leftTotal = (s.leftHeel || 0) + (s.leftBall || 0) + (s.leftToe || 0);
        const rightTotal = (s.rightHeel || 0) + (s.rightBall || 0) + (s.rightToe || 0);
        const total = leftTotal + rightTotal;

        if (total === 0) continue;

        const leftRatio = leftTotal / total;
        let side;
        if (leftRatio > threshold) side = 'left';
        else if (leftRatio < (1 - threshold)) side = 'right';
        else side = 'center';

        if (currentSide && side !== currentSide && side !== 'center') {
            // Transition detected
            if (transitionStart !== null) {
                const duration = s.time - transitionStart;
                transitions.push({
                    from: currentSide,
                    to: side,
                    startTime: transitionStart,
                    endTime: s.time,
                    duration: Math.round(duration * 1000) / 1000,
                    slow: duration > 3.0,
                });
            }
            transitionStart = s.time;
            currentSide = side;
        } else if (side !== 'center' && currentSide !== side) {
            currentSide = side;
            transitionStart = s.time;
        }
    }

    const avgTransitionTime = transitions.length > 0
        ? transitions.reduce((sum, t) => sum + t.duration, 0) / transitions.length
        : 0;
    const slowTransitions = transitions.filter(t => t.slow).length;

    return {
        transitions,
        avgTransitionTime: Math.round(avgTransitionTime * 1000) / 1000,
        slowTransitions,
    };
}

/**
 * Build a complete balance board analysis for a time window.
 *
 * @param {Array} samples - Data points for the analysis window
 * @param {string} injuredSide - 'left' or 'right'
 * @returns {Object} Balance board analysis summary
 */
export function buildBalanceBoardAnalysis(samples, injuredSide) {
    if (!samples || samples.length < 10) return null;

    const copVelocity = calcCoPVelocity(samples);
    const swayArea = calcSwayArea(samples);
    const transitions = calcTransitionTiming(samples);

    // Bilateral force metrics
    let leftPeak = 0, rightPeak = 0;
    for (const s of samples) {
        const lf = (s.leftHeel || 0) + (s.leftBall || 0) + (s.leftToe || 0);
        const rf = (s.rightHeel || 0) + (s.rightBall || 0) + (s.rightToe || 0);
        if (lf > leftPeak) leftPeak = lf;
        if (rf > rightPeak) rightPeak = rf;
    }

    const symmetryIndex = calcSymmetryIndex(leftPeak, rightPeak);

    // Average CoP asymmetry
    const avgCoPAsymmetry = samples.reduce((sum, s) => sum + calcCoPAsymmetry(s), 0) / samples.length;

    // Stability score (0-100): lower sway + lower CoP velocity + balanced transitions = higher score
    const swayScore = Math.max(0, 100 - swayArea.totalSwayArea * 5000);
    const velocityScore = Math.max(0, 100 - (copVelocity.leftVelocity + copVelocity.rightVelocity) * 25);
    const transitionScore = transitions.slowTransitions === 0 ? 100 : Math.max(0, 100 - transitions.slowTransitions * 20);
    const symmetryScore = Math.max(0, 100 - Math.abs(symmetryIndex));

    const stabilityScore = Math.round(
        0.30 * swayScore + 0.25 * velocityScore + 0.25 * transitionScore + 0.20 * symmetryScore
    );

    return {
        exerciseType: EXERCISE_TYPES.BALANCE_BOARD,
        duration: samples[samples.length - 1].time - samples[0].time,
        sampleCount: samples.length,

        copVelocity,
        swayArea,
        transitions,

        symmetryIndex: Math.round(symmetryIndex * 10) / 10,
        copAsymmetry: Math.round(avgCoPAsymmetry * 1000) / 1000,
        stabilityScore,

        // Injured side specific
        injuredSideCoPVelocity: injuredSide === 'right' ? copVelocity.rightVelocity : copVelocity.leftVelocity,
        healthySideCoPVelocity: injuredSide === 'right' ? copVelocity.leftVelocity : copVelocity.rightVelocity,
        injuredSideSwayArea: injuredSide === 'right' ? swayArea.rightSwayArea : swayArea.leftSwayArea,
        healthySideSwayArea: injuredSide === 'right' ? swayArea.leftSwayArea : swayArea.rightSwayArea,
    };
}


// ─── Exercise Auto-Detection ─────────────────────────────────────────────────

/**
 * Attempt to auto-detect the exercise type from force signature.
 *
 * Rowing: cyclical force pattern with clear drive/recovery phases, 20-35 SPM
 * Squat: slow, deep force pattern with clear eccentric/concentric, 5-15 RPM
 * Balance Board: relatively constant force with sway patterns, minimal cyclicality
 *
 * @param {Array} samples - Recent data points (last ~10 seconds)
 * @returns {{ exercise: string, confidence: number, reason: string }}
 */
export function detectExerciseType(samples) {
    if (!samples || samples.length < 50) {
        return { exercise: EXERCISE_TYPES.ROWING, confidence: 0, reason: 'Insufficient data' };
    }

    // Compute total force per sample
    const forces = samples.map(s =>
        (s.leftForce || 0) + (s.rightForce || 0) ||
        (s.leftHeel || 0) + (s.leftBall || 0) + (s.leftToe || 0) +
        (s.rightHeel || 0) + (s.rightBall || 0) + (s.rightToe || 0)
    );

    // Coefficient of variation (CV) — how variable is the force?
    const mean = forces.reduce((a, b) => a + b, 0) / forces.length;
    const std = Math.sqrt(forces.reduce((sum, v) => sum + (v - mean) ** 2, 0) / forces.length);
    const cv = mean > 0 ? std / mean : 0;

    // Count zero-crossings of the detrended signal (cyclicality)
    const detrended = forces.map(f => f - mean);
    let zeroCrossings = 0;
    for (let i = 1; i < detrended.length; i++) {
        if ((detrended[i] >= 0) !== (detrended[i - 1] >= 0)) zeroCrossings++;
    }

    // Duration of the sample window
    const duration = (samples[samples.length - 1].time || 0) - (samples[0].time || 0);
    const cycleRate = duration > 0 ? (zeroCrossings / 2) / duration * 60 : 0; // Cycles per minute

    // Decision logic
    if (cv < 0.15) {
        return { exercise: EXERCISE_TYPES.BALANCE_BOARD, confidence: 0.8, reason: 'Low force variability (quasi-static)' };
    }

    if (cycleRate > 15 && cycleRate < 40) {
        return { exercise: EXERCISE_TYPES.ROWING, confidence: 0.7, reason: `Cyclical pattern at ~${Math.round(cycleRate)} SPM` };
    }

    if (cycleRate > 3 && cycleRate < 15) {
        return { exercise: EXERCISE_TYPES.SQUAT, confidence: 0.6, reason: `Slow cyclical pattern at ~${Math.round(cycleRate)} RPM` };
    }

    // Default
    return { exercise: EXERCISE_TYPES.ROWING, confidence: 0.3, reason: 'Ambiguous — defaulting to rowing' };
}


// ─── CRS Weights by Exercise Type ────────────────────────────────────────────

/**
 * Get exercise-specific weight adjustments for the CRS.
 * Balance board emphasizes CoP and shape over impulse.
 * Squat emphasizes shape and fatigue over CoP.
 *
 * These are multiplied against the injury profile's phase-based weights.
 *
 * @param {string} exerciseType - One of EXERCISE_TYPES
 * @returns {Object} weight multipliers { si, ir, sd, cop, fr }
 */
export function getExerciseWeightModifiers(exerciseType) {
    switch (exerciseType) {
        case EXERCISE_TYPES.SQUAT:
            // Squat: shape diff matters more (eccentric patterns), CoP matters less
            return { si: 1.0, ir: 1.0, sd: 1.3, cop: 0.6, fr: 1.2 };

        case EXERCISE_TYPES.BALANCE_BOARD:
            // Balance board: CoP and shape matter most, impulse least (quasi-static)
            return { si: 0.8, ir: 0.5, sd: 1.3, cop: 1.5, fr: 0.8 };

        case EXERCISE_TYPES.ROWING:
        default:
            // Rowing: baseline weights, no modification
            return { si: 1.0, ir: 1.0, sd: 1.0, cop: 1.0, fr: 1.0 };
    }
}

/**
 * Apply exercise-specific modifiers to injury profile weights.
 * Renormalizes to sum to 1.0 after applying modifiers.
 *
 * @param {Object} profileWeights - Base weights from injury profile { si, ir, sd, cop, fr }
 * @param {string} exerciseType - One of EXERCISE_TYPES
 * @returns {Object} Modified and renormalized weights
 */
export function applyExerciseModifiers(profileWeights, exerciseType) {
    const modifiers = getExerciseWeightModifiers(exerciseType);
    const modified = {};

    for (const key of Object.keys(profileWeights)) {
        modified[key] = profileWeights[key] * (modifiers[key] || 1.0);
    }

    // Renormalize
    const sum = Object.values(modified).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(modified)) {
        modified[key] = Math.round((modified[key] / sum) * 1000) / 1000;
    }

    return modified;
}
