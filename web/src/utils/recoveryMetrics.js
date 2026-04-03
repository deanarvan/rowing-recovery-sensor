/**
 * Recovery Metrics — Pure calculation module for bilateral asymmetry analysis.
 * All functions are stateless and take stroke data as input.
 */

/**
 * Symmetry Index per stroke.
 * 0% = perfect symmetry, positive = left-dominant, negative = right-dominant.
 */
export function calcSymmetryIndex(leftPeak, rightPeak) {
    const maxPeak = Math.max(leftPeak, rightPeak);
    if (maxPeak === 0) return 0;
    return ((leftPeak - rightPeak) / maxPeak) * 100;
}

/**
 * Impulse Asymmetry Ratio per stroke.
 * 50% = perfect symmetry, >50% = left doing more work.
 */
export function calcImpulseRatio(leftImpulse, rightImpulse) {
    const total = leftImpulse + rightImpulse;
    if (total === 0) return 50;
    return (leftImpulse / total) * 100;
}

/**
 * Force curve shape difference (RMSD of normalized curves).
 * 0 = identical shapes, higher = more distortion.
 */
export function calcShapeDifference(samples) {
    if (!samples || samples.length < 3) return 0;

    let leftPeak = 0, rightPeak = 0;
    for (const s of samples) {
        const lf = s.leftForce || 0;
        const rf = s.rightForce || 0;
        if (lf > leftPeak) leftPeak = lf;
        if (rf > rightPeak) rightPeak = rf;
    }

    if (leftPeak === 0 || rightPeak === 0) return 0;

    let sumSqDiff = 0;
    for (const s of samples) {
        const lNorm = (s.leftForce || 0) / leftPeak;
        const rNorm = (s.rightForce || 0) / rightPeak;
        sumSqDiff += (lNorm - rNorm) ** 2;
    }

    return Math.sqrt(sumSqDiff / samples.length);
}

/**
 * Center of Pressure index for one foot.
 * 0 = all heel, 2 = all toe, ~0.8-1.0 = normal balanced loading.
 */
export function calcFootCoP(heel, ball, toe) {
    const total = heel + ball + toe;
    if (total === 0) return 0;
    return (ball * 1 + toe * 2) / total;
}

/**
 * CoP Asymmetry = Left CoP - Right CoP.
 * Positive = left foot is more toe-loaded than right.
 */
export function calcCoPAsymmetry(sample) {
    const leftCoP = calcFootCoP(
        sample.leftHeel || 0,
        sample.leftBall || 0,
        sample.leftToe || 0
    );
    const rightCoP = calcFootCoP(
        sample.rightHeel || 0,
        sample.rightBall || 0,
        sample.rightToe || 0
    );
    return leftCoP - rightCoP;
}

/**
 * Mean CoP asymmetry for all samples in a stroke.
 */
export function calcStrokeCoPAsymmetry(samples) {
    if (!samples || samples.length === 0) return 0;
    const sum = samples.reduce((acc, s) => acc + calcCoPAsymmetry(s), 0);
    return sum / samples.length;
}

/**
 * Fatigue Asymmetry — linear regression slope of peak ratio over strokes.
 * slope < 0 = injured (right) leg fatiguing faster.
 */
export function calcFatigueSlope(strokes) {
    if (!strokes || strokes.length < 3) return { slope: 0, intercept: 1 };

    const n = strokes.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
        const x = i;
        const y = strokes[i].leftPeak > 0
            ? strokes[i].rightPeak / strokes[i].leftPeak
            : 1;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

/**
 * Composite Recovery Score (0–100).
 * Supports both legacy (hardcoded weights) and dynamic (injury profile) modes.
 *
 * @param {Array} strokes - Array of stroke summary objects
 * @param {Object} [weights] - Optional dynamic weights { si, ir, sd, cop, fr } from getDynamicWeights()
 * @returns {number|null} CRS score 0-100, or null if insufficient data
 */
export function calcRecoveryScore(strokes, weights = null) {
    if (!strokes || strokes.length < 2) return null;

    // Average metrics across strokes
    const avgSI = strokes.reduce((s, st) => s + Math.abs(st.symmetryIndex), 0) / strokes.length;
    const avgIR = strokes.reduce((s, st) => s + st.impulseRatio, 0) / strokes.length;
    const avgSD = strokes.reduce((s, st) => s + st.shapeDifference, 0) / strokes.length;
    const avgCoP = strokes.reduce((s, st) => s + Math.abs(st.copAsymmetry), 0) / strokes.length;
    const { slope } = calcFatigueSlope(strokes);

    // Sub-scores (0–100 each)
    const S1 = Math.max(0, 100 - avgSI);                        // Symmetry Index
    const S2 = Math.max(0, 100 - Math.abs(avgIR - 50) * 2);    // Impulse Ratio
    const S3 = Math.max(0, 100 - avgSD * 200);                  // Shape Difference
    const S4 = Math.max(0, 100 - avgCoP * 100);                 // CoP Asymmetry
    const S5 = Math.max(0, 100 - Math.abs(slope) * 1000);       // Fatigue Rate

    // Use dynamic weights from injury profile, or fall back to hardcoded defaults
    const w = weights || { si: 0.30, ir: 0.30, sd: 0.15, cop: 0.15, fr: 0.10 };

    return Math.round(w.si * S1 + w.ir * S2 + w.sd * S3 + w.cop * S4 + w.fr * S5);
}

/**
 * Compute CRS sub-score breakdown for dashboard display.
 * Returns individual sub-scores and their weights for transparency.
 */
export function calcRecoveryScoreBreakdown(strokes, weights = null) {
    if (!strokes || strokes.length < 2) return null;

    const avgSI = strokes.reduce((s, st) => s + Math.abs(st.symmetryIndex), 0) / strokes.length;
    const avgIR = strokes.reduce((s, st) => s + st.impulseRatio, 0) / strokes.length;
    const avgSD = strokes.reduce((s, st) => s + st.shapeDifference, 0) / strokes.length;
    const avgCoP = strokes.reduce((s, st) => s + Math.abs(st.copAsymmetry), 0) / strokes.length;
    const { slope } = calcFatigueSlope(strokes);

    const w = weights || { si: 0.30, ir: 0.30, sd: 0.15, cop: 0.15, fr: 0.10 };

    const subScores = {
        si:  { raw: avgSI, score: Math.max(0, 100 - avgSI), weight: w.si, label: 'Symmetry Index' },
        ir:  { raw: avgIR, score: Math.max(0, 100 - Math.abs(avgIR - 50) * 2), weight: w.ir, label: 'Impulse Ratio' },
        sd:  { raw: avgSD, score: Math.max(0, 100 - avgSD * 200), weight: w.sd, label: 'Shape Difference' },
        cop: { raw: avgCoP, score: Math.max(0, 100 - avgCoP * 100), weight: w.cop, label: 'CoP Asymmetry' },
        fr:  { raw: slope, score: Math.max(0, 100 - Math.abs(slope) * 1000), weight: w.fr, label: 'Fatigue Rate' },
    };

    const total = Math.round(
        Object.values(subScores).reduce((sum, s) => sum + s.weight * s.score, 0)
    );

    return { subScores, total };
}

/**
 * Compute impulse (force × time integral) from an array of samples.
 * Each sample must have a `time` property (seconds) and a force property.
 */
export function calcImpulse(samples, forceKey) {
    if (!samples || samples.length < 2) return 0;

    let impulse = 0;
    for (let i = 1; i < samples.length; i++) {
        const dt = samples[i].time - samples[i - 1].time;
        if (dt > 0 && dt < 1) { // sanity: skip gaps > 1s
            const avgForce = ((samples[i][forceKey] || 0) + (samples[i - 1][forceKey] || 0)) / 2;
            impulse += avgForce * dt;
        }
    }
    return impulse;
}

/**
 * Build a complete stroke summary object from drive-phase samples.
 */
export function buildStrokeSummary(strokeNumber, samples) {
    if (!samples || samples.length < 2) return null;

    // Safe peak detection — no spread operator (prevents stack overflow on large arrays)
    let leftPeak = 0, rightPeak = 0;
    for (const s of samples) {
        const lf = s.leftForce || 0;
        const rf = s.rightForce || 0;
        if (lf > leftPeak) leftPeak = lf;
        if (rf > rightPeak) rightPeak = rf;
    }

    const leftImpulse = calcImpulse(samples, 'leftForce');
    const rightImpulse = calcImpulse(samples, 'rightForce');
    const symmetryIndex = calcSymmetryIndex(leftPeak, rightPeak);
    const impulseRatio = calcImpulseRatio(leftImpulse, rightImpulse);
    const shapeDifference = calcShapeDifference(samples);
    const copAsymmetry = calcStrokeCoPAsymmetry(samples);

    // CoP trace arrays for visualization
    const leftCoPTrace = samples.map(s =>
        calcFootCoP(s.leftHeel || 0, s.leftBall || 0, s.leftToe || 0)
    );
    const rightCoPTrace = samples.map(s =>
        calcFootCoP(s.rightHeel || 0, s.rightBall || 0, s.rightToe || 0)
    );

    return {
        strokeNumber,
        startTime: samples[0].time,
        endTime: samples[samples.length - 1].time,
        sampleCount: samples.length,
        // Lightweight force curve for visualization (2 values per sample instead of ~15 full fields)
        forceCurve: samples.map(s => ({ l: s.leftForce || 0, r: s.rightForce || 0 })),
        leftPeak,
        rightPeak,
        leftImpulse: Math.round(leftImpulse * 100) / 100,
        rightImpulse: Math.round(rightImpulse * 100) / 100,
        symmetryIndex: Math.round(symmetryIndex * 10) / 10,
        impulseRatio: Math.round(impulseRatio * 10) / 10,
        shapeDifference: Math.round(shapeDifference * 1000) / 1000,
        copAsymmetry: Math.round(copAsymmetry * 1000) / 1000,
        leftCoPTrace,
        rightCoPTrace
    };
}
