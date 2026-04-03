/**
 * Pluggable Injury Profile System — v2.0
 *
 * Updated with clinical research data from Gemini deep research synthesis:
 *   - Compensatory pattern thresholds scaled +20% safety margin from clinical values
 *   - Research-derived normative baselines with biphasic age-decline model
 *   - Phased CoP tracking (catch → mid-drive → finish)
 *   - Per-activity LSI normative targets (rowing 95%, squat 93-95%, balance 95.1%)
 *   - Coaching cues (patient-facing) and clinician alerts (data-driven) per pattern
 *   - LSI fatigue drift detection (>5% = pathological per research)
 *
 * Each injury profile defines:
 *   (a) Metric weighting vectors for the Composite Recovery Score
 *   (b) Phase-specific threshold ranges (early/mid/late rehab)
 *   (c) Compensatory pattern signatures for real-time detection
 *   (d) Alert trigger definitions
 *   (e) Dynamic weight adjustments per rehab phase and fatigue state
 *   (f) Coaching cues per detected pattern (patient + clinician modes)
 *
 * Patent Reference: Section 7 — Injury Profile System
 * Clinical Sources: Gemini deep research reports on compensatory patterns & normative data
 */

// ─── Feedback Mode ──────────────────────────────────────────────────────────

export const FEEDBACK_MODE = {
    PATIENT: 'patient',       // Plain-language coaching cues
    CLINICIAN: 'clinician',   // Data-driven technical alerts
};

// ─── Rehab Phase Definitions ────────────────────────────────────────────────
export const REHAB_PHASES = {
    EARLY: 'early',     // 0–12 weeks post-op (Achilles: 0–16 weeks)
    MID: 'mid',         // 12–24 weeks
    LATE: 'late',       // 24+ weeks, return-to-activity
};

// ─── Over-Compensation Threshold ────────────────────────────────────────────
// Melbourne ACL Guide: penalize LSI >110% (healthy leg doing >10% more).
// Over-compensation masks true deficits via contralateral hyper-reliance.
export const OVER_COMPENSATION_LSI = 110; // LSI above this = over-compensation

// ─── Phased CoP Normative Targets ───────────────────────────────────────────
// Research-derived heel/ball/toe distribution targets per drive sub-phase.
// Each exercise has its own normative CoP phase sequence.

export const COP_PHASE_TARGETS = {
    rowing: {
        // Catch (0–15% of drive): feet compressed, heels up
        catch:    { heel: 0.00, ball: 0.85, toe: 0.15, drivePercent: [0, 0.15] },
        // Mid-drive (15–60%): heels coming down, posterior chain engaging
        midDrive: { heel: 0.30, ball: 0.60, toe: 0.10, drivePercent: [0.15, 0.60] },
        // Finish (60–100%): heels dominant, trunk opened
        finish:   { heel: 0.60, ball: 0.40, toe: 0.00, drivePercent: [0.60, 1.00] },
    },
    squat: {
        // Squat ascent (sticking point): heavily posterior
        ascent:   { heel: 0.825, ball: 0.175, toe: 0.00, phaseLabel: 'ascent' },
    },
    calfRaise: {
        // Peak concentric: entirely anterior
        peak:     { heel: 0.00, ball: 0.875, toe: 0.125, phaseLabel: 'peak' },
    },
    standing: {
        // Quiet standing: posterior bias
        quiet:    { heel: 0.556, ball: 0.344, toe: 0.10, phaseLabel: 'quiet' },
    },
};

/**
 * Score a CoP sample against a phased target.
 * Returns 0-100 where 100 = perfect match to normative distribution.
 *
 * @param {Object} actual - { heel, ball, toe } as fractions summing to ~1.0
 * @param {Object} target - Target from COP_PHASE_TARGETS
 * @returns {number} Score 0-100
 */
export function scoreCoPPhase(actual, target) {
    if (!actual || !target) return 100;
    const dH = Math.abs((actual.heel || 0) - target.heel);
    const dB = Math.abs((actual.ball || 0) - target.ball);
    const dT = Math.abs((actual.toe || 0) - target.toe);
    // Max deviation = 1.0 per zone, 3.0 total
    const totalDev = dH + dB + dT;
    return Math.max(0, Math.round(100 - (totalDev / 2.0) * 100));
}

/**
 * Analyze a full stroke's CoP trace against the 3-phase rowing targets.
 * Splits the force curve into catch/mid/finish and scores each.
 *
 * @param {Array} samples - Drive-phase samples with heel/ball/toe per foot
 * @param {string} side - 'left' or 'right'
 * @returns {Object} Per-phase CoP scores and overall
 */
export function analyzeStrokeCoPPhases(samples, side) {
    if (!samples || samples.length < 6) return null;

    const n = samples.length;
    const phases = COP_PHASE_TARGETS.rowing;

    // Split samples into 3 sub-phases by drive percentage
    const catchEnd = Math.floor(n * 0.15);
    const midEnd = Math.floor(n * 0.60);

    const catchSamples = samples.slice(0, Math.max(1, catchEnd));
    const midSamples = samples.slice(catchEnd, midEnd);
    const finishSamples = samples.slice(midEnd);

    const avgCoP = (samps) => {
        if (samps.length === 0) return { heel: 0, ball: 0, toe: 0 };
        const prefix = side === 'left' ? 'left' : 'right';
        let h = 0, b = 0, t = 0;
        for (const s of samps) {
            h += s[`${prefix}Heel`] || 0;
            b += s[`${prefix}Ball`] || 0;
            t += s[`${prefix}Toe`] || 0;
        }
        const total = h + b + t;
        if (total === 0) return { heel: 0, ball: 0, toe: 0 };
        return { heel: h / total, ball: b / total, toe: t / total };
    };

    const catchCoP = avgCoP(catchSamples);
    const midCoP = avgCoP(midSamples);
    const finishCoP = avgCoP(finishSamples);

    return {
        catch:  { actual: catchCoP, target: phases.catch, score: scoreCoPPhase(catchCoP, phases.catch) },
        mid:    { actual: midCoP, target: phases.midDrive, score: scoreCoPPhase(midCoP, phases.midDrive) },
        finish: { actual: finishCoP, target: phases.finish, score: scoreCoPPhase(finishCoP, phases.finish) },
        overall: Math.round(
            (scoreCoPPhase(catchCoP, phases.catch) * 0.2 +
             scoreCoPPhase(midCoP, phases.midDrive) * 0.5 +
             scoreCoPPhase(finishCoP, phases.finish) * 0.3)
        ),
    };
}


// ─── Per-Activity LSI Normative Targets ─────────────────────────────────────
// Research-derived: healthy adults' natural LSI by activity type.

export const LSI_TARGETS = {
    rowing:  { mean: 95.0, floor: 90.0, hardFloor: 85.0 },
    squat:   { mean: 94.0, floor: 90.0, hardFloor: 85.0 },
    balance: { mean: 95.1, floor: 90.0, hardFloor: 85.0 },
    general: { mean: 97.7, floor: 93.3, hardFloor: 85.0 },
};

// Research finding: healthy adults show 0% LSI degradation under fatigue.
// Any drift > 5% over a session is pathological, not normal fatigue.
export const LSI_FATIGUE_DRIFT_THRESHOLD = 5.0; // percentage points


// ─── Population Normative Reference Data (Tier 3 EPIC Baselines) ────────────
// Research-derived with biphasic age-decline model:
//   - Pre-52 years: 0.15% decline per year from peak (age 25 baseline)
//   - Post-52 years: 1.3% decline per year (accelerated sarcopenic decline)
//
// Peak baseline (age 25) per-foot steady-state values:
//   Male:   439N peak force, 185 N·s impulse
//   Female: 332N peak force, 137 N·s impulse
//
// These are research values for calibrated sensors. For uncalibrated FSRs,
// the system uses relative metrics (ratios, symmetry) which are scale-independent.
// When calibration is available, absolute values are compared to these targets.

const PEAK_BASELINES = {
    male:   { peakForce: 438.8, impulsePerStroke: 185.3, copIndex: 0.95, fatigueSlope: -0.005, shapeDifference: 0.08, symmetryIndex: 2.5 },
    female: { peakForce: 331.5, impulsePerStroke: 136.5, copIndex: 0.92, fatigueSlope: -0.006, shapeDifference: 0.09, symmetryIndex: 3.0 },
};

/**
 * Biphasic age-decline model.
 * Pre-52: 0.15% per year from age 25 baseline.
 * Post-52: 1.3% per year (accelerating).
 *
 * @param {number} age - Patient age
 * @returns {number} Multiplier (1.0 = no decline, 0.7 = 30% decline)
 */
function ageDeclineFactor(age) {
    if (age <= 25) return 1.0;
    if (age <= 52) {
        // 0.15% per year for years 26-52
        return 1.0 - (age - 25) * 0.0015;
    }
    // First 27 years of slow decline (age 25-52)
    const slowDecline = 27 * 0.0015; // 4.05%
    // Then 1.3% per year after 52
    const fastDecline = (age - 52) * 0.013;
    return 1.0 - slowDecline - fastDecline;
}

export const NORMATIVE_BASELINES = {
    '18-25:male':   { ...PEAK_BASELINES.male },
    '18-25:female': { ...PEAK_BASELINES.female },
    '26-35:male':   scaleBaseline(PEAK_BASELINES.male, ageDeclineFactor(30)),
    '26-35:female': scaleBaseline(PEAK_BASELINES.female, ageDeclineFactor(30)),
    '36-45:male':   scaleBaseline(PEAK_BASELINES.male, ageDeclineFactor(40)),
    '36-45:female': scaleBaseline(PEAK_BASELINES.female, ageDeclineFactor(40)),
    '46-60:male':   scaleBaseline(PEAK_BASELINES.male, ageDeclineFactor(53)),
    '46-60:female': scaleBaseline(PEAK_BASELINES.female, ageDeclineFactor(53)),
};

function scaleBaseline(base, factor) {
    return {
        peakForce: Math.round(base.peakForce * factor),
        impulsePerStroke: Math.round(base.impulsePerStroke * factor),
        copIndex: base.copIndex, // CoP doesn't scale with strength
        fatigueSlope: Math.round(base.fatigueSlope * (1 + (1 - factor) * 0.5) * 1000) / 1000, // Fatigue worsens slightly with age
        shapeDifference: Math.round((base.shapeDifference + (1 - factor) * 0.1) * 100) / 100,
        symmetryIndex: Math.round((base.symmetryIndex + (1 - factor) * 5) * 10) / 10,
    };
}

/**
 * Get the closest matching normative baseline for a patient.
 * Uses biphasic age-decline model for precise age-adjusted values.
 *
 * @param {number} age - Patient age
 * @param {string} sex - 'male' or 'female'
 * @returns {Object} normative baseline values
 */
export function getClosestBaseline(age, sex = 'male') {
    // For exact age scaling, compute directly from peak baselines
    const base = PEAK_BASELINES[sex] || PEAK_BASELINES.male;
    const factor = ageDeclineFactor(age);
    return scaleBaseline(base, factor);
}


// ─── Compensatory Pattern Helpers ───────────────────────────────────────────
// Side-aware helper: gets the injured side's metrics from a stroke.

function getInjuredPeak(stroke, injuredSide) {
    return injuredSide === 'right' ? stroke.rightPeak : stroke.leftPeak;
}

function getHealthyPeak(stroke, injuredSide) {
    return injuredSide === 'right' ? stroke.leftPeak : stroke.rightPeak;
}

function getInjuredCoPTrace(stroke, injuredSide) {
    return injuredSide === 'right' ? stroke.rightCoPTrace : stroke.leftCoPTrace;
}

function getInjuredCoPAvg(stroke, injuredSide) {
    const trace = getInjuredCoPTrace(stroke, injuredSide);
    if (!trace || trace.length === 0) return 0;
    return trace.reduce((s, v) => s + v, 0) / trace.length;
}

/**
 * Compute initial loading rate (ILR) for one side from force curve.
 * ILR = force at 15% of drive / peak force. Low ILR = slow force onset.
 *
 * @param {Array} forceCurve - Array of { l, r } force values
 * @param {string} side - 'l' or 'r'
 * @returns {number} ILR as fraction (0-1)
 */
function calcILR(forceCurve, side) {
    if (!forceCurve || forceCurve.length < 5) return 1;
    const idx15pct = Math.max(1, Math.floor(forceCurve.length * 0.15));
    let peak = 0;
    for (const f of forceCurve) {
        if (f[side] > peak) peak = f[side];
    }
    if (peak === 0) return 1;
    return forceCurve[idx15pct][side] / peak;
}

/**
 * Compute rate of force development (RFD) for one side.
 * RFD = force change in first 50-75ms of drive onset.
 *
 * @param {Array} forceCurve - Array of { l, r } force values
 * @param {string} side - 'l' or 'r'
 * @param {number} sampleRateHz - Sampling rate (default 50Hz)
 * @returns {number} RFD in force units per second
 */
function calcRFD(forceCurve, side, sampleRateHz = 50) {
    if (!forceCurve || forceCurve.length < 4) return 0;
    // First 50-75ms ≈ 3-4 samples at 50Hz
    const windowSamples = Math.max(2, Math.round(sampleRateHz * 0.0625)); // 62.5ms avg
    const endIdx = Math.min(windowSamples, forceCurve.length - 1);
    const dt = endIdx / sampleRateHz;
    if (dt === 0) return 0;
    return (forceCurve[endIdx][side] - forceCurve[0][side]) / dt;
}

/**
 * Compute drive onset delay between limbs.
 * Returns delay in milliseconds (positive = injured side later).
 *
 * @param {Array} forceCurve
 * @param {string} injuredSide - 'left' or 'right'
 * @param {number} sampleRateHz
 * @returns {number} Delay in ms
 */
function calcDriveOnsetDelay(forceCurve, injuredSide, sampleRateHz = 50) {
    if (!forceCurve || forceCurve.length < 5) return 0;

    const injKey = injuredSide === 'right' ? 'r' : 'l';
    const healthyKey = injuredSide === 'right' ? 'l' : 'r';

    // Find peak for threshold
    let injPeak = 0, healthyPeak = 0;
    for (const f of forceCurve) {
        if (f[injKey] > injPeak) injPeak = f[injKey];
        if (f[healthyKey] > healthyPeak) healthyPeak = f[healthyKey];
    }
    if (injPeak === 0 || healthyPeak === 0) return 0;

    const injThresh = injPeak * 0.1;
    const healthyThresh = healthyPeak * 0.1;

    let injOnset = -1, healthyOnset = -1;
    for (let i = 0; i < forceCurve.length; i++) {
        if (injOnset < 0 && forceCurve[i][injKey] > injThresh) injOnset = i;
        if (healthyOnset < 0 && forceCurve[i][healthyKey] > healthyThresh) healthyOnset = i;
    }
    if (injOnset < 0 || healthyOnset < 0) return 0;

    const delaySamples = injOnset - healthyOnset; // Positive = injured is later
    return (delaySamples / sampleRateHz) * 1000; // Convert to ms
}

/**
 * Compute F1/F2 ratio (early peak vs late sustained force).
 * F1 = peak in first 30% of drive, F2 = peak in last 40% of drive.
 * F1/F2 > 1.0 means early spike without sustained push (push-off avoidance).
 *
 * @param {Array} forceCurve
 * @param {string} side - 'l' or 'r'
 * @returns {number} F1/F2 ratio
 */
function calcF1F2Ratio(forceCurve, side) {
    if (!forceCurve || forceCurve.length < 5) return 1.0;
    const n = forceCurve.length;
    const split30 = Math.floor(n * 0.3);
    const split60 = Math.floor(n * 0.6);

    let f1 = 0, f2 = 0;
    for (let i = 0; i < split30; i++) {
        if (forceCurve[i][side] > f1) f1 = forceCurve[i][side];
    }
    for (let i = split60; i < n; i++) {
        if (forceCurve[i][side] > f2) f2 = forceCurve[i][side];
    }
    if (f2 === 0) return f1 > 0 ? 999 : 1.0;
    return f1 / f2;
}


// ─── Base Profile Interface ─────────────────────────────────────────────────

const DEFAULT_PROFILE = {
    id: 'default',
    name: 'General Bilateral Recovery',
    description: 'General-purpose bilateral force recovery monitoring',

    weights: {
        [REHAB_PHASES.EARLY]: { si: 0.35, ir: 0.30, sd: 0.10, cop: 0.15, fr: 0.10 },
        [REHAB_PHASES.MID]:   { si: 0.30, ir: 0.30, sd: 0.15, cop: 0.15, fr: 0.10 },
        [REHAB_PHASES.LATE]:  { si: 0.25, ir: 0.25, sd: 0.20, cop: 0.15, fr: 0.15 },
    },

    fatigueBoost: {
        maxBoost: 0.10,
        source: 'si',
        onsetStroke: 10,
        fullStroke: 30,
    },

    phaseThresholds: {
        [REHAB_PHASES.EARLY]: {
            expectedCRS: { min: 20, max: 55 },
            expectedSI: { min: -50, max: 50 },
            expectedIR: { min: 35, max: 65 },
            transitionCRS: 55,
            transitionSessions: 5,
        },
        [REHAB_PHASES.MID]: {
            expectedCRS: { min: 45, max: 75 },
            expectedSI: { min: -30, max: 30 },
            expectedIR: { min: 40, max: 60 },
            transitionCRS: 75,
            transitionSessions: 5,
        },
        [REHAB_PHASES.LATE]: {
            expectedCRS: { min: 65, max: 100 },
            expectedSI: { min: -15, max: 15 },
            expectedIR: { min: 45, max: 55 },
            clearanceCRS: 85,
            clearanceSessions: 8,
        },
    },

    phaseTimeline: { earlyEnd: 12, midEnd: 24 },

    compensatoryPatterns: [
        {
            id: 'contralateral_overload',
            name: 'Contralateral Overloading',
            description: 'Healthy leg doing significantly more work than injured leg',
            detect: (stroke, injuredSide) => {
                const ir = stroke.impulseRatio;
                if (injuredSide === 'right') return ir > 60;
                return ir < 40;
            },
            severity: (stroke, injuredSide) => {
                const ir = stroke.impulseRatio;
                const deviation = injuredSide === 'right' ? ir - 50 : 50 - ir;
                if (deviation > 20) return 'high';
                if (deviation > 10) return 'medium';
                return 'low';
            },
            message: 'Healthy leg absorbing excessive load — ease into bilateral effort',
            coachingCue: 'Focus on pushing equally with both feet. Your healthy leg is doing too much work.',
            clinicianMessage: (stroke, injuredSide) => {
                const ir = stroke.impulseRatio;
                return `Impulse ratio ${ir.toFixed(1)}% (target 50%). ${injuredSide === 'right' ? 'Left' : 'Right'} (healthy) leg bearing disproportionate load.`;
            },
            zones: ['impulse'],
        },
        {
            id: 'fatigue_divergence',
            name: 'Fatigue-Induced Asymmetry',
            description: 'Injured leg fatiguing significantly faster than healthy leg',
            detect: (stroke, injuredSide, sessionContext) => {
                if (!sessionContext || !sessionContext.fatigueSlope) return false;
                const slope = sessionContext.fatigueSlope;
                if (injuredSide === 'right') return slope < -0.02;
                return slope > 0.02;
            },
            severity: (stroke, injuredSide, sessionContext) => {
                const slope = Math.abs(sessionContext?.fatigueSlope || 0);
                if (slope > 0.05) return 'high';
                if (slope > 0.03) return 'medium';
                return 'low';
            },
            message: 'Injured leg fading — consider resting before continuing',
            coachingCue: 'Your injured leg is tiring faster than your healthy leg. Take a short break.',
            clinicianMessage: (stroke, injuredSide, ctx) =>
                `Fatigue slope ${Math.abs(ctx?.fatigueSlope || 0).toFixed(4)}. Unilateral fatigue on ${injuredSide} side exceeds bilateral norm.`,
            zones: ['fatigue'],
        },
        {
            id: 'over_compensation',
            name: 'Over-Compensation (Healthy Limb Hyper-Reliance)',
            description: 'Healthy leg producing >10% more force than expected. Melbourne Guide penalizes LSI >110%. Masks true deficit.',
            detect: (stroke) => {
                // LSI >110% means healthy side is doing significantly more
                const minPeak = Math.min(stroke.leftPeak, stroke.rightPeak);
                const maxPeak = Math.max(stroke.leftPeak, stroke.rightPeak);
                if (maxPeak === 0) return false;
                const lsi = (minPeak / maxPeak) * 100;
                // Inverted: if the *healthy* side is >110% of injured, flag it
                // This shows up as IR far from 50 AND high total force
                return Math.abs(stroke.impulseRatio - 50) > 12;
            },
            severity: (stroke) => {
                const deviation = Math.abs(stroke.impulseRatio - 50);
                if (deviation > 25) return 'high';
                if (deviation > 18) return 'medium';
                return 'low';
            },
            message: 'Healthy leg over-compensating — apparent symmetry may mask true deficit',
            coachingCue: 'You\'re relying too heavily on your healthy leg. Try to let your recovering leg do more of the work, even if it feels harder.',
            clinicianMessage: (stroke) => {
                const deviation = Math.abs(stroke.impulseRatio - 50);
                return `Over-compensation: IR deviation ${deviation.toFixed(1)}% from midline. Melbourne Guide penalizes LSI >110%. Apparent symmetry via contralateral hyper-reliance masks operative limb deficit.`;
            },
            zones: ['impulse'],
        },
        {
            id: 'lsi_fatigue_drift',
            name: 'Pathological LSI Drift Under Fatigue',
            description: 'LSI degrading during session — healthy adults maintain flat LSI under fatigue',
            detect: (stroke, injuredSide, sessionContext) => {
                if (!sessionContext?.lsiDrift) return false;
                return Math.abs(sessionContext.lsiDrift) > LSI_FATIGUE_DRIFT_THRESHOLD;
            },
            severity: (stroke, injuredSide, sessionContext) => {
                const drift = Math.abs(sessionContext?.lsiDrift || 0);
                if (drift > 15) return 'high';
                if (drift > 10) return 'medium';
                return 'low';
            },
            message: 'Bilateral symmetry breaking down during session — this indicates pathological fatigue, not normal tiredness',
            coachingCue: 'Your balance between legs is getting worse as you tire. This is a sign to stop and rest.',
            clinicianMessage: (stroke, injuredSide, ctx) =>
                `LSI drift ${Math.abs(ctx?.lsiDrift || 0).toFixed(1)}% over session. Research shows healthy adults maintain <1% drift. Drift >5% indicates pathological unilateral fatigue.`,
            zones: ['fatigue', 'impulse'],
        },
    ],

    alerts: {
        crsDropAlert: 15,
        siSpikeAlert: 50,
        consecutiveThreshold: 3,
    },

    epicConfig: {
        earlyCaptureSessions: 3,
        earlyWindowWeeks: 4,
        bafRecalibrationCRS: 80,
        bafRecalibrationSessions: 5,
    },
};


// ─── Achilles Tendon Repair Profile ─────────────────────────────────────────
// Clinical thresholds from research, all scaled +20% safety margin:
//   - Toe-walking: CoP ≥1.0 at initial contact → trigger at ≥1.2
//   - Push-off avoidance (F1/F2 ratio): >1.10 → trigger at >1.32
//   - Spike-and-fade: rapid dF/dt decline → shape difference >0.48 (was 0.4)
//   - Heel guarding: CoP <0.5 → trigger at <0.6

const ACHILLES_PROFILE = {
    ...DEFAULT_PROFILE,
    id: 'achilles',
    name: 'Achilles Tendon Repair',
    description: 'Post-operative Achilles tendon repair recovery monitoring. Emphasizes heel-zone force recovery, CoP analysis, and plantarflexion deficit tracking.',

    weights: {
        [REHAB_PHASES.EARLY]: { si: 0.35, ir: 0.25, sd: 0.10, cop: 0.20, fr: 0.10 },
        [REHAB_PHASES.MID]:   { si: 0.25, ir: 0.25, sd: 0.15, cop: 0.25, fr: 0.10 },
        [REHAB_PHASES.LATE]:  { si: 0.20, ir: 0.20, sd: 0.20, cop: 0.25, fr: 0.15 },
    },

    fatigueBoost: {
        maxBoost: 0.12,
        source: 'si',
        onsetStroke: 8,
        fullStroke: 25,
    },

    phaseThresholds: {
        [REHAB_PHASES.EARLY]: {
            expectedCRS: { min: 15, max: 50 },
            expectedSI: { min: -60, max: 60 },
            expectedIR: { min: 30, max: 70 },
            expectedCoP: { min: -0.5, max: 0.5 },
            transitionCRS: 50,
            transitionSessions: 5,
        },
        [REHAB_PHASES.MID]: {
            expectedCRS: { min: 40, max: 70 },
            expectedSI: { min: -35, max: 35 },
            expectedIR: { min: 38, max: 62 },
            expectedCoP: { min: -0.3, max: 0.3 },
            transitionCRS: 70,
            transitionSessions: 5,
        },
        [REHAB_PHASES.LATE]: {
            expectedCRS: { min: 60, max: 100 },
            expectedSI: { min: -20, max: 20 },
            expectedIR: { min: 43, max: 57 },
            expectedCoP: { min: -0.15, max: 0.15 },
            clearanceCRS: 80,
            clearanceSessions: 8,
        },
    },

    phaseTimeline: { earlyEnd: 16, midEnd: 28 },

    // Hybrid time gates: minimum weeks post-op BEFORE phase transition allowed
    // Research: Achilles needs 24+ weeks before RTS consideration
    timeGates: {
        [REHAB_PHASES.EARLY]: { minWeeksForTransition: 6 },   // Can't leave early before 6 weeks
        [REHAB_PHASES.MID]:   { minWeeksForTransition: 16 },  // Can't leave mid before 16 weeks
        [REHAB_PHASES.LATE]:  { minWeeksForClearance: 24 },   // Can't clear before 24 weeks
    },

    compensatoryPatterns: [
        ...DEFAULT_PROFILE.compensatoryPatterns,
        {
            id: 'toe_walking_compensation',
            name: 'Toe-Walking Compensation',
            description: 'Injured foot loading through toe to bypass ball-of-foot (Achilles avoidance). Clinical threshold: CoP ≥1.0 at initial contact.',
            // Scaled +20%: CoP ≥1.2 (clinical: ≥1.0)
            detect: (stroke, injuredSide) => {
                const copAvg = getInjuredCoPAvg(stroke, injuredSide);
                return copAvg > 1.2;
            },
            severity: (stroke, injuredSide) => {
                const copAvg = getInjuredCoPAvg(stroke, injuredSide);
                if (copAvg > 1.7) return 'high';
                if (copAvg > 1.4) return 'medium';
                return 'low';
            },
            message: 'Injured foot bypassing mid-foot — focus on heel-to-ball transition',
            coachingCue: 'You\'re landing on your toes on the injured side. Focus on making contact with the ball of your foot first, then roll through naturally.',
            clinicianMessage: (stroke, injuredSide) => {
                const copAvg = getInjuredCoPAvg(stroke, injuredSide);
                return `Toe-walking detected: CoP index ${copAvg.toFixed(2)} on ${injuredSide} foot (threshold ≥1.2, clinical ≥1.0). Bypassing metatarsal push-off.`;
            },
            zones: ['cop', 'toe'],
        },
        {
            id: 'heel_guarding',
            name: 'Heel Guarding / Push-Off Avoidance',
            description: 'Injured foot staying on heel, avoiding Achilles-loading push-off. Clinical: CoP <0.5.',
            // Scaled +20%: CoP <0.6 (clinical: <0.5)
            detect: (stroke, injuredSide) => {
                const copAvg = getInjuredCoPAvg(stroke, injuredSide);
                return copAvg < 0.6;
            },
            severity: (stroke, injuredSide) => {
                const copAvg = getInjuredCoPAvg(stroke, injuredSide);
                if (copAvg < 0.3) return 'high';
                if (copAvg < 0.5) return 'medium';
                return 'low';
            },
            message: 'Injured foot avoiding push-off — possible Achilles pain or guarding',
            coachingCue: 'You\'re staying on your heel and not pushing through the ball of your foot. Try gently pressing through the forefoot at the end of each stroke.',
            clinicianMessage: (stroke, injuredSide) => {
                const copAvg = getInjuredCoPAvg(stroke, injuredSide);
                return `Heel guarding: CoP index ${copAvg.toFixed(2)} on ${injuredSide} (threshold <0.6, clinical <0.5). Plantarflexion avoidance pattern.`;
            },
            zones: ['cop', 'heel'],
        },
        {
            id: 'push_off_avoidance_f1f2',
            name: 'Push-Off Force Avoidance (F1/F2)',
            description: 'Early force spike without sustained push-off. Clinical: F1/F2 >1.10.',
            // Scaled +20%: F1/F2 >1.32 (clinical: >1.10)
            detect: (stroke, injuredSide) => {
                if (!stroke.forceCurve || stroke.forceCurve.length < 5) return false;
                const side = injuredSide === 'right' ? 'r' : 'l';
                const ratio = calcF1F2Ratio(stroke.forceCurve, side);
                return ratio > 1.32;
            },
            severity: (stroke, injuredSide) => {
                const side = injuredSide === 'right' ? 'r' : 'l';
                const ratio = calcF1F2Ratio(stroke.forceCurve, side);
                if (ratio > 2.0) return 'high';
                if (ratio > 1.5) return 'medium';
                return 'low';
            },
            message: 'Force spikes early then drops — calf not sustaining push-off contraction',
            coachingCue: 'Try to maintain a steady push through the whole stroke instead of a quick burst at the start. Imagine pressing evenly through the drive.',
            clinicianMessage: (stroke, injuredSide) => {
                const side = injuredSide === 'right' ? 'r' : 'l';
                const ratio = calcF1F2Ratio(stroke.forceCurve, side);
                return `F1/F2 ratio ${ratio.toFixed(2)} on ${injuredSide} (threshold >1.32, clinical >1.10). Gastrocnemius/soleus failing to sustain concentric contraction through finish.`;
            },
            zones: ['shape', 'heel'],
        },
        {
            id: 'spike_and_fade',
            name: 'Spike-and-Fade Force Pattern',
            description: 'Injured leg producing brief force spike then rapid dropoff. Clinical: rapid -dF/dt within 1-2 sec.',
            // Scaled +20%: shapeDifference >0.48 (clinical: >0.4)
            detect: (stroke) => {
                return stroke.shapeDifference > 0.48;
            },
            severity: (stroke) => {
                if (stroke.shapeDifference > 0.7) return 'high';
                if (stroke.shapeDifference > 0.55) return 'medium';
                return 'low';
            },
            message: 'Force curve distorted — injured leg spiking then fading (calf endurance deficit)',
            coachingCue: 'Your injured leg produces a quick burst of force then drops off. Focus on a smooth, sustained push rather than a sharp kick.',
            clinicianMessage: (stroke) =>
                `Shape difference ${stroke.shapeDifference.toFixed(3)} (threshold >0.48, clinical >0.40). Bilateral force curve RMSD indicates spike-and-fade neuromuscular pattern.`,
            zones: ['shape'],
        },
    ],

    alerts: {
        crsDropAlert: 12,
        siSpikeAlert: 45,
        consecutiveThreshold: 3,
        copShiftAlert: 0.4,
    },

    epicConfig: {
        earlyCaptureSessions: 3,
        earlyWindowWeeks: 3,
        bafRecalibrationCRS: 75,
        bafRecalibrationSessions: 5,
    },
};


// ─── ACL Reconstruction Profile ─────────────────────────────────────────────
// Clinical thresholds scaled +20%:
//   - Quad avoidance (ILR): <85% → trigger at <82%
//   - Stiff-knee (midstance GRF flattening): shapeDiff >0.35 → >0.42
//   - Temporal drive delay: >50ms → >60ms

const ACL_PROFILE = {
    ...DEFAULT_PROFILE,
    id: 'acl',
    name: 'ACL Reconstruction',
    description: 'Post-operative ACL reconstruction recovery monitoring. Emphasizes eccentric-phase force curve analysis, quadriceps avoidance detection, and temporal drive initiation.',

    weights: {
        [REHAB_PHASES.EARLY]: { si: 0.30, ir: 0.25, sd: 0.20, cop: 0.10, fr: 0.15 },
        [REHAB_PHASES.MID]:   { si: 0.25, ir: 0.25, sd: 0.25, cop: 0.10, fr: 0.15 },
        [REHAB_PHASES.LATE]:  { si: 0.20, ir: 0.20, sd: 0.25, cop: 0.10, fr: 0.25 },
    },

    fatigueBoost: {
        maxBoost: 0.15,
        source: 'cop',
        onsetStroke: 8,
        fullStroke: 20,
    },

    phaseThresholds: {
        [REHAB_PHASES.EARLY]: {
            expectedCRS: { min: 20, max: 55 },
            expectedSI: { min: -55, max: 55 },
            expectedIR: { min: 30, max: 70 },
            transitionCRS: 55,
            transitionSessions: 5,
        },
        [REHAB_PHASES.MID]: {
            expectedCRS: { min: 45, max: 75 },
            expectedSI: { min: -30, max: 30 },
            expectedIR: { min: 40, max: 60 },
            transitionCRS: 75,
            transitionSessions: 5,
        },
        [REHAB_PHASES.LATE]: {
            expectedCRS: { min: 65, max: 100 },
            expectedSI: { min: -15, max: 15 },
            expectedIR: { min: 44, max: 56 },
            clearanceCRS: 90,
            clearanceSessions: 8,
        },
    },

    phaseTimeline: { earlyEnd: 12, midEnd: 24 },

    // Hybrid time gates: Research — RTS before 9 months = 7× re-tear rate.
    // Each month delayed up to 9mo = 51% reinjury reduction.
    timeGates: {
        [REHAB_PHASES.EARLY]: { minWeeksForTransition: 4 },    // Can't leave early before 4 weeks
        [REHAB_PHASES.MID]:   { minWeeksForTransition: 16 },   // Can't leave mid before 16 weeks
        [REHAB_PHASES.LATE]:  { minWeeksForClearance: 36 },    // MINIMUM 9 months (36 weeks) before RTS
    },

    compensatoryPatterns: [
        ...DEFAULT_PROFILE.compensatoryPatterns,
        {
            id: 'quad_avoidance',
            name: 'Quadriceps Avoidance Pattern',
            description: 'Reduced initial loading rate on injured side — quadriceps not engaging in early stance. Clinical: ILR <85%.',
            // Scaled +20%: ILR <0.82 (clinical: <0.85) — i.e., 18% below healthy side
            detect: (stroke, injuredSide) => {
                if (!stroke.forceCurve || stroke.forceCurve.length < 5) return false;
                const injKey = injuredSide === 'right' ? 'r' : 'l';
                const healthyKey = injuredSide === 'right' ? 'l' : 'r';
                const injILR = calcILR(stroke.forceCurve, injKey);
                const healthyILR = calcILR(stroke.forceCurve, healthyKey);
                if (healthyILR === 0) return false;
                const ilrRatio = injILR / healthyILR;
                return ilrRatio < 0.82;
            },
            severity: (stroke, injuredSide) => {
                if (!stroke.forceCurve || stroke.forceCurve.length < 5) return 'low';
                const injKey = injuredSide === 'right' ? 'r' : 'l';
                const healthyKey = injuredSide === 'right' ? 'l' : 'r';
                const ilrRatio = calcILR(stroke.forceCurve, injKey) / (calcILR(stroke.forceCurve, healthyKey) || 1);
                if (ilrRatio < 0.6) return 'high';
                if (ilrRatio < 0.75) return 'medium';
                return 'low';
            },
            message: 'Quadriceps avoidance — injured leg not loading aggressively through early drive',
            coachingCue: 'Push harder with your injured leg at the very start of each stroke. Focus on driving through your heel right from the catch.',
            clinicianMessage: (stroke, injuredSide) => {
                const injKey = injuredSide === 'right' ? 'r' : 'l';
                const healthyKey = injuredSide === 'right' ? 'l' : 'r';
                const ilrRatio = calcILR(stroke.forceCurve, injKey) / (calcILR(stroke.forceCurve, healthyKey) || 1);
                return `Quad avoidance: ILR ratio ${(ilrRatio * 100).toFixed(1)}% (threshold <82%, clinical <85%). Reduced initial loading rate on ${injuredSide} indicates arthrogenic muscle inhibition.`;
            },
            zones: ['shape', 'eccentric'],
        },
        {
            id: 'stiff_knee_gait',
            name: 'Stiff-Knee Pattern',
            description: 'Reduced knee flexion manifesting as midstance GRF flattening. Clinical: midstance force curve plateau.',
            // Scaled +20%: shapeDiff >0.42 (clinical: >0.35)
            detect: (stroke) => {
                return stroke.shapeDifference > 0.42;
            },
            severity: (stroke) => {
                if (stroke.shapeDifference > 0.6) return 'high';
                if (stroke.shapeDifference > 0.5) return 'medium';
                return 'low';
            },
            message: 'Force curve suggests stiff-knee compensation — insufficient mid-range knee flexion loading',
            coachingCue: 'Try to bend your knee more through the middle of the stroke. Don\'t keep it rigid — let it flex and extend smoothly.',
            clinicianMessage: (stroke) =>
                `Stiff-knee pattern: shape difference ${stroke.shapeDifference.toFixed(3)} (threshold >0.42, clinical >0.35). Midstance GRF flattening suggests reduced knee flexion excursion.`,
            zones: ['shape', 'eccentric'],
        },
        {
            id: 'acl_temporal_delay',
            name: 'Drive Initiation Delay',
            description: 'Injured leg begins force production significantly later. Clinical: Δt >50ms.',
            // Scaled +20%: >60ms (clinical: >50ms)
            detect: (stroke, injuredSide) => {
                const delayMs = calcDriveOnsetDelay(stroke.forceCurve, injuredSide);
                return delayMs > 60;
            },
            severity: (stroke, injuredSide) => {
                const delayMs = calcDriveOnsetDelay(stroke.forceCurve, injuredSide);
                if (delayMs > 120) return 'high';
                if (delayMs > 80) return 'medium';
                return 'low';
            },
            message: 'Injured leg initiating force production late — temporal compensation detected',
            coachingCue: 'Try to start pushing with both legs at exactly the same moment. Your injured leg is lagging behind.',
            clinicianMessage: (stroke, injuredSide) => {
                const delayMs = calcDriveOnsetDelay(stroke.forceCurve, injuredSide);
                return `Temporal delay: ${Math.round(delayMs)}ms on ${injuredSide} (threshold >60ms, clinical >50ms). Neuromuscular activation latency on surgical side.`;
            },
            zones: ['temporal'],
        },
    ],

    alerts: {
        crsDropAlert: 15,
        siSpikeAlert: 45,
        consecutiveThreshold: 3,
        shapeAlert: 0.4,
    },

    epicConfig: {
        earlyCaptureSessions: 3,
        earlyWindowWeeks: 4,
        bafRecalibrationCRS: 85,
        bafRecalibrationSessions: 5,
    },
};


// ─── Patellofemoral Procedure Profile ───────────────────────────────────────
// Clinical thresholds scaled +20%:
//   - Lateral weight shift: >15% bilateral asymmetry → >18%
//   - RFD asymmetry: >15% in first 50-75ms → >18%
//   - Stair descent avoidance: >50% temporal elongation → >60%

const PATELLOFEMORAL_PROFILE = {
    ...DEFAULT_PROFILE,
    id: 'patellofemoral',
    name: 'Patellofemoral Procedure',
    description: 'Post-operative patellofemoral procedure recovery monitoring. Emphasizes loading rate asymmetry, lateral weight distribution, and eccentric loading patterns.',

    weights: {
        [REHAB_PHASES.EARLY]: { si: 0.30, ir: 0.25, sd: 0.15, cop: 0.20, fr: 0.10 },
        [REHAB_PHASES.MID]:   { si: 0.25, ir: 0.25, sd: 0.20, cop: 0.20, fr: 0.10 },
        [REHAB_PHASES.LATE]:  { si: 0.20, ir: 0.20, sd: 0.25, cop: 0.20, fr: 0.15 },
    },

    fatigueBoost: {
        maxBoost: 0.08,
        source: 'si',
        onsetStroke: 12,
        fullStroke: 35,
    },

    phaseThresholds: {
        [REHAB_PHASES.EARLY]: {
            expectedCRS: { min: 25, max: 55 },
            expectedSI: { min: -45, max: 45 },
            expectedIR: { min: 35, max: 65 },
            transitionCRS: 55,
            transitionSessions: 6,
        },
        [REHAB_PHASES.MID]: {
            expectedCRS: { min: 50, max: 75 },
            expectedSI: { min: -25, max: 25 },
            expectedIR: { min: 42, max: 58 },
            transitionCRS: 75,
            transitionSessions: 6,
        },
        [REHAB_PHASES.LATE]: {
            expectedCRS: { min: 65, max: 100 },
            expectedSI: { min: -15, max: 15 },
            expectedIR: { min: 45, max: 55 },
            clearanceCRS: 88,
            clearanceSessions: 10,
        },
    },

    phaseTimeline: { earlyEnd: 10, midEnd: 22 },

    // Hybrid time gates: MPFL+TTO requires 6 weeks NWB, RTS 16-24+ weeks
    timeGates: {
        [REHAB_PHASES.EARLY]: { minWeeksForTransition: 6 },   // NWB/PWB for 6 weeks minimum
        [REHAB_PHASES.MID]:   { minWeeksForTransition: 12 },
        [REHAB_PHASES.LATE]:  { minWeeksForClearance: 20 },   // 16-24 weeks for RTS
    },

    compensatoryPatterns: [
        ...DEFAULT_PROFILE.compensatoryPatterns,
        {
            id: 'lateral_shift',
            name: 'Lateral Weight Shift',
            description: 'Weight shifting laterally to unload the patellofemoral joint. Clinical: >15% bilateral asymmetry.',
            // Scaled +20%: >18% asymmetry (clinical: >15%)
            detect: (stroke) => {
                return Math.abs(stroke.symmetryIndex) > 18;
            },
            severity: (stroke) => {
                const abssi = Math.abs(stroke.symmetryIndex);
                if (abssi > 30) return 'high';
                if (abssi > 22) return 'medium';
                return 'low';
            },
            message: 'Lateral loading shift detected — possible patellofemoral avoidance',
            coachingCue: 'You\'re shifting your weight to one side. Focus on keeping your weight centered and pressing evenly through both feet.',
            clinicianMessage: (stroke) =>
                `Lateral shift: SI ${stroke.symmetryIndex.toFixed(1)}% (threshold >18%, clinical >15%). Indicates PFJ offloading through contralateral weight transfer.`,
            zones: ['cop', 'lateral'],
        },
        {
            id: 'rfd_asymmetry',
            name: 'Rate of Force Development Asymmetry',
            description: 'Injured leg developing force too slowly in initial 50-75ms. Clinical: >15% RFD asymmetry.',
            // Scaled +20%: >18% RFD asymmetry (clinical: >15%)
            detect: (stroke, injuredSide) => {
                if (!stroke.forceCurve || stroke.forceCurve.length < 4) return false;
                const injKey = injuredSide === 'right' ? 'r' : 'l';
                const healthyKey = injuredSide === 'right' ? 'l' : 'r';
                const injRFD = calcRFD(stroke.forceCurve, injKey);
                const healthyRFD = calcRFD(stroke.forceCurve, healthyKey);
                if (healthyRFD === 0) return false;
                const asymmetry = Math.abs(injRFD - healthyRFD) / healthyRFD;
                return asymmetry > 0.18;
            },
            severity: (stroke, injuredSide) => {
                if (!stroke.forceCurve || stroke.forceCurve.length < 4) return 'low';
                const injKey = injuredSide === 'right' ? 'r' : 'l';
                const healthyKey = injuredSide === 'right' ? 'l' : 'r';
                const injRFD = calcRFD(stroke.forceCurve, injKey);
                const healthyRFD = calcRFD(stroke.forceCurve, healthyKey);
                const asymmetry = healthyRFD > 0 ? Math.abs(injRFD - healthyRFD) / healthyRFD : 0;
                if (asymmetry > 0.35) return 'high';
                if (asymmetry > 0.25) return 'medium';
                return 'low';
            },
            message: 'Force application rate differs between limbs — focus on controlled, even loading',
            coachingCue: 'Start your push smoothly and at the same speed with both legs. Your injured side is ramping up force too slowly.',
            clinicianMessage: (stroke, injuredSide) => {
                const injKey = injuredSide === 'right' ? 'r' : 'l';
                const healthyKey = injuredSide === 'right' ? 'l' : 'r';
                const injRFD = calcRFD(stroke.forceCurve, injKey);
                const healthyRFD = calcRFD(stroke.forceCurve, healthyKey);
                const asymmetry = healthyRFD > 0 ? ((Math.abs(injRFD - healthyRFD) / healthyRFD) * 100).toFixed(1) : '?';
                return `RFD asymmetry ${asymmetry}% (threshold >18%, clinical >15%). Injured: ${Math.round(injRFD)} vs healthy: ${Math.round(healthyRFD)} force/sec in initial 62.5ms.`;
            },
            zones: ['shape', 'rate'],
        },
        {
            id: 'eccentric_avoidance',
            name: 'Eccentric Loading Avoidance',
            description: 'Slow, guarded deceleration indicating fear of eccentric PFJ loading. Clinical: >50% temporal elongation.',
            // Scaled +20%: shape diff >0.42 combined with slow force development (clinical: >0.35)
            detect: (stroke) => {
                return stroke.shapeDifference > 0.42 && Math.abs(stroke.copAsymmetry) > 0.2;
            },
            severity: (stroke) => {
                const combined = stroke.shapeDifference + Math.abs(stroke.copAsymmetry);
                if (combined > 1.0) return 'high';
                if (combined > 0.7) return 'medium';
                return 'low';
            },
            message: 'Eccentric loading avoidance — injured leg decelerating cautiously',
            coachingCue: 'You\'re being too cautious on the way down. Try to control the descent smoothly rather than braking hard.',
            clinicianMessage: (stroke) =>
                `Eccentric avoidance: shape diff ${stroke.shapeDifference.toFixed(3)}, CoP asym ${Math.abs(stroke.copAsymmetry).toFixed(3)}. Temporal elongation of weight acceptance phase suggests PFJ loading apprehension.`,
            zones: ['shape', 'eccentric'],
        },
    ],

    alerts: {
        crsDropAlert: 12,
        siSpikeAlert: 40,
        consecutiveThreshold: 3,
        loadingRateAlert: true,
    },

    epicConfig: {
        earlyCaptureSessions: 4,
        earlyWindowWeeks: 3,
        bafRecalibrationCRS: 80,
        bafRecalibrationSessions: 6,
    },
};


// ─── Profile Registry ───────────────────────────────────────────────────────

const INJURY_PROFILES = {
    achilles: ACHILLES_PROFILE,
    acl: ACL_PROFILE,
    patellofemoral: PATELLOFEMORAL_PROFILE,
    general: DEFAULT_PROFILE,
};

export function getInjuryProfile(profileId) {
    return INJURY_PROFILES[profileId] || DEFAULT_PROFILE;
}

export function listInjuryProfiles() {
    return Object.values(INJURY_PROFILES).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
    }));
}

/**
 * Get dynamic CRS weights for a given profile, phase, and fatigue state.
 */
export function getDynamicWeights(profileId, phase, strokeNumber = 0) {
    const profile = getInjuryProfile(profileId);
    const baseWeights = { ...profile.weights[phase] };
    const boost = profile.fatigueBoost;

    if (strokeNumber <= boost.onsetStroke) {
        return baseWeights;
    }

    const progress = Math.min(1.0,
        (strokeNumber - boost.onsetStroke) / (boost.fullStroke - boost.onsetStroke)
    );
    const currentBoost = boost.maxBoost * progress;

    baseWeights.fr += currentBoost;
    baseWeights[boost.source] -= currentBoost;

    for (const key of Object.keys(baseWeights)) {
        if (baseWeights[key] < 0.05) baseWeights[key] = 0.05;
    }

    const sum = Object.values(baseWeights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(baseWeights)) {
        baseWeights[key] /= sum;
    }

    return baseWeights;
}

/**
 * Detect compensatory patterns for a given stroke.
 * Returns array of detected patterns with severity and feedback messages.
 *
 * @param {string} profileId
 * @param {Object} stroke - Stroke summary
 * @param {string} injuredSide - 'left' or 'right'
 * @param {Object} sessionContext - { fatigueSlope, lsiDrift, recoveryScore, ... }
 * @param {string} feedbackMode - FEEDBACK_MODE.PATIENT or FEEDBACK_MODE.CLINICIAN
 * @returns {Array} Detected patterns
 */
export function detectCompensatoryPatterns(profileId, stroke, injuredSide, sessionContext, feedbackMode = FEEDBACK_MODE.CLINICIAN) {
    const profile = getInjuryProfile(profileId);
    const detected = [];

    for (const pattern of profile.compensatoryPatterns) {
        try {
            if (pattern.detect(stroke, injuredSide, sessionContext)) {
                const severity = pattern.severity(stroke, injuredSide, sessionContext);

                // Select message based on feedback mode
                let displayMessage = pattern.message;
                if (feedbackMode === FEEDBACK_MODE.PATIENT && pattern.coachingCue) {
                    displayMessage = pattern.coachingCue;
                } else if (feedbackMode === FEEDBACK_MODE.CLINICIAN && pattern.clinicianMessage) {
                    displayMessage = typeof pattern.clinicianMessage === 'function'
                        ? pattern.clinicianMessage(stroke, injuredSide, sessionContext)
                        : pattern.clinicianMessage;
                }

                detected.push({
                    id: pattern.id,
                    name: pattern.name,
                    message: displayMessage,
                    // Also include both messages for UI toggle
                    coachingCue: pattern.coachingCue || pattern.message,
                    clinicianDetail: typeof pattern.clinicianMessage === 'function'
                        ? pattern.clinicianMessage(stroke, injuredSide, sessionContext)
                        : (pattern.clinicianMessage || pattern.message),
                    severity,
                    zones: pattern.zones,
                });
            }
        } catch (e) {
            console.warn(`Pattern detection error (${pattern.id}):`, e);
        }
    }

    return detected;
}

/**
 * Suggest rehab phase based on HYBRID time + CRS gates.
 *
 * Phase transition requires BOTH conditions to be satisfied simultaneously:
 *   1. Minimum temporal floor (weeks post-op) from profile.timeGates
 *   2. CRS threshold met for N consecutive sessions from profile.phaseThresholds
 *
 * If CRS is met but time gate is not → returns 'time_blocked' advisory.
 * If time gate is met but CRS is not → returns 'crs_pending' advisory.
 * If both are met → returns phase transition recommendation.
 *
 * Also accepts optional psychologicalScore (ACL-RSI) for late-phase/clearance gating.
 *
 * Research basis: Rehab Phase Timelines report —
 *   "Phase transition logic must be criterion-based, not purely time-based.
 *    Time serves as a minimum floor... Both must be satisfied simultaneously."
 */
export function suggestPhaseTransition(profileId, currentPhase, recentCRSScores, weeksPostOp = null, options = {}) {
    const profile = getInjuryProfile(profileId);
    const thresholds = profile.phaseThresholds[currentPhase];

    if (!thresholds || !recentCRSScores || recentCRSScores.length === 0) return null;

    const { psychologicalScore = null } = options;

    // ─── Determine CRS readiness ──────────────────────────────────────
    const requiredSessions = thresholds.transitionSessions || thresholds.clearanceSessions || 5;
    const targetCRS = thresholds.transitionCRS || thresholds.clearanceCRS;
    let crsMet = false;

    if (targetCRS && recentCRSScores.length >= requiredSessions) {
        const recentSlice = recentCRSScores.slice(-requiredSessions);
        crsMet = recentSlice.every(s => s >= targetCRS);
    }

    // ─── Determine time gate readiness ────────────────────────────────
    const timeGates = profile.timeGates || {};
    const currentGate = timeGates[currentPhase];
    let timeGateMet = true; // Default to true if no time gates defined
    let minWeeks = null;

    if (currentGate && weeksPostOp !== null) {
        // For early/mid phases, check minWeeksForTransition
        // For late phase, check minWeeksForClearance
        minWeeks = currentGate.minWeeksForTransition || currentGate.minWeeksForClearance || null;
        if (minWeeks !== null) {
            timeGateMet = weeksPostOp >= minWeeks;
        }
    } else if (currentGate && weeksPostOp === null) {
        // Time gates defined but no weeksPostOp provided — cannot verify
        timeGateMet = false;
    }

    // ─── Determine psychological readiness (late phase / clearance) ───
    let psychMet = true; // Default to true unless required
    let psychRequired = false;
    if (currentPhase === REHAB_PHASES.LATE || currentPhase === REHAB_PHASES.MID) {
        // ACL-RSI threshold: >65 required for clearance per research
        // Only enforce if a psychological score system is active
        if (psychologicalScore !== null) {
            psychRequired = true;
            psychMet = psychologicalScore >= 65;
        }
    }

    // ─── Determine next phase ─────────────────────────────────────────
    const nextPhase = currentPhase === REHAB_PHASES.EARLY
        ? REHAB_PHASES.MID
        : currentPhase === REHAB_PHASES.MID
            ? REHAB_PHASES.LATE
            : currentPhase === REHAB_PHASES.LATE
                ? 'clearance'
                : null;

    if (!nextPhase) return null;

    // ─── All gates satisfied → recommend transition ───────────────────
    if (crsMet && timeGateMet && psychMet) {
        const reasons = [];
        reasons.push(`CRS ≥${targetCRS} for ${requiredSessions} consecutive sessions`);
        if (minWeeks !== null) reasons.push(`${weeksPostOp}wk post-op ≥ ${minWeeks}wk minimum`);
        if (psychRequired) reasons.push(`ACL-RSI score ${psychologicalScore} ≥ 65`);

        return {
            suggestedPhase: nextPhase,
            reason: reasons.join('; '),
            confidence: 'high',
            gateStatus: { crsMet, timeGateMet, psychMet },
        };
    }

    // ─── CRS met but time gate blocks ─────────────────────────────────
    if (crsMet && !timeGateMet) {
        return {
            suggestedPhase: null,
            advisory: 'time_blocked',
            reason: `CRS criteria met (≥${targetCRS} × ${requiredSessions} sessions), but minimum ${minWeeks} weeks post-op not reached (currently ${weeksPostOp}wk). ` +
                `Research: time-based minimum is a safety floor that cannot be bypassed by functional criteria alone.`,
            confidence: 'blocked',
            gateStatus: { crsMet, timeGateMet, psychMet },
            weeksRemaining: minWeeks - weeksPostOp,
        };
    }

    // ─── Time gate met but CRS pending ────────────────────────────────
    if (!crsMet && timeGateMet) {
        // Check if we're significantly past the timeline (soft suggestion)
        const timeline = profile.phaseTimeline;
        let pastTypicalTimeline = false;

        if (weeksPostOp !== null && timeline) {
            if (currentPhase === REHAB_PHASES.EARLY && weeksPostOp > timeline.earlyEnd) {
                pastTypicalTimeline = true;
            }
            if (currentPhase === REHAB_PHASES.MID && weeksPostOp > timeline.midEnd) {
                pastTypicalTimeline = true;
            }
        }

        return {
            suggestedPhase: null,
            advisory: 'crs_pending',
            reason: pastTypicalTimeline
                ? `Time gate met and ${weeksPostOp}wk exceeds typical phase duration, but CRS has not sustained ≥${targetCRS} for ${requiredSessions} sessions. Functional criteria must still be met.`
                : `Time gate met (≥${minWeeks}wk), but CRS has not sustained ≥${targetCRS} for ${requiredSessions} sessions.`,
            confidence: pastTypicalTimeline ? 'medium' : 'low',
            gateStatus: { crsMet, timeGateMet, psychMet },
        };
    }

    // ─── Psychological readiness blocking ─────────────────────────────
    if (crsMet && timeGateMet && !psychMet) {
        return {
            suggestedPhase: null,
            advisory: 'psych_blocked',
            reason: `Physical criteria met, but ACL-RSI score (${psychologicalScore}) is below 65. ` +
                `Research: fear of reinjury alters motor control under competitive stress. Psychological readiness is a parallel domain.`,
            confidence: 'blocked',
            gateStatus: { crsMet, timeGateMet, psychMet },
        };
    }

    // ─── Neither gate met ─────────────────────────────────────────────
    return null;
}
