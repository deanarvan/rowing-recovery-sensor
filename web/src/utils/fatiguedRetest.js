/**
 * Structured Fatigued-State Re-Test Protocol
 *
 * Implements the Melbourne ACL Rehabilitation Guide 2.0 concept of fatigued-state
 * testing as a critical component of return-to-sport readiness.
 *
 * Research basis (Gemini deep research report 04):
 *   - Melbourne Guide allocates 20% of total score to fatigued re-testing
 *   - Hop test symmetry must be maintained under metabolic exhaustion
 *   - Maps directly to the biphasic fatigue model
 *   - Fatigued-state LSI/CRS degradation reveals hidden deficits that rested
 *     testing misses — this is the "last 10 minutes of the game" problem
 *
 * Protocol:
 *   1. Complete standard rested session (baseline CRS, LSI, hop tests)
 *   2. Metabolic fatigue induction (10-stroke maximal effort burst)
 *   3. Immediately re-test the same metrics under fatigue
 *   4. Score the delta between rested and fatigued performance
 *   5. Penalize disproportionate degradation on the injured side
 *
 * Patent Reference: Section 6 — Fatigue Analysis and Adaptive Load Management
 */

import { analyzeBiphasicFatigue, FATIGUE_PHASE } from './fatigueAnalysis.js';
import { LSI_FATIGUE_DRIFT_THRESHOLD, OVER_COMPENSATION_LSI } from './injuryProfiles.js';

// ─── Protocol Configuration ─────────────────────────────────────────────────

/**
 * Default protocol settings for the fatigued re-test.
 */
export const RETEST_PROTOCOL = {
    // Rested baseline capture
    restedMinStrokes: 10,           // Minimum strokes for rested baseline
    restedMaxStrokes: 20,           // Maximum strokes for rested baseline

    // Fatigue induction phase
    fatigueInductionStrokes: 10,    // Maximal effort burst to induce fatigue
    fatigueInductionRPE: 9,         // Target RPE (Rate of Perceived Exertion, 1-10)

    // Fatigued re-test capture
    fatiguedMinStrokes: 10,         // Minimum strokes for fatigued capture
    fatiguedMaxStrokes: 15,         // Maximum strokes for fatigued capture

    // Scoring
    maxScore: 20,                   // Melbourne Guide: 20% of total composite
    lsiDegradationPenaltyWeight: 0.4,    // Weight for LSI degradation
    forceDegradationPenaltyWeight: 0.3,  // Weight for force output degradation
    copDegradationPenaltyWeight: 0.15,   // Weight for CoP stability degradation
    asymmetryDriftPenaltyWeight: 0.15,   // Weight for asymmetric fatigue slope

    // Acceptable degradation thresholds (beyond these → penalty applied)
    acceptableLSIDegradation: 1.0,       // % — healthy adults show ~0%; 1% tolerance for FSR noise
    acceptableForceDegradation: 15.0,    // % — normal: 10-15% under fatigue
    acceptableCoPShift: 0.15,            // CoP drift units
    acceptableAsymmetryDrift: 5.0,       // % — >5% = pathological per research
};


// ─── Protocol State Machine ─────────────────────────────────────────────────

export const PROTOCOL_STATES = {
    NOT_STARTED: 'not_started',
    RESTED_CAPTURE: 'rested_capture',
    FATIGUE_INDUCTION: 'fatigue_induction',
    FATIGUED_CAPTURE: 'fatigued_capture',
    COMPLETE: 'complete',
};

/**
 * Create a fatigued re-test session manager.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.injuredSide - 'left' or 'right'
 * @param {string} options.injuryType - 'achilles', 'acl', 'patellofemoral'
 * @param {Object} [options.protocol] - Override default protocol settings
 * @returns {Object} Session manager with methods
 */
export function createFatiguedRetestSession(options = {}) {
    const { injuredSide = 'right', injuryType = 'achilles', protocol = {} } = options;
    const cfg = { ...RETEST_PROTOCOL, ...protocol };

    let state = PROTOCOL_STATES.NOT_STARTED;
    let restedStrokes = [];
    let fatigueInductionStrokes = [];
    let fatiguedStrokes = [];
    let transitionTimestamp = null;

    return {
        // ─── State accessors ──────────────────────────────────────────
        getState: () => state,
        getProgress: () => {
            switch (state) {
                case PROTOCOL_STATES.RESTED_CAPTURE:
                    return {
                        phase: 'Rested Baseline',
                        strokesCollected: restedStrokes.length,
                        strokesNeeded: cfg.restedMinStrokes,
                        canAdvance: restedStrokes.length >= cfg.restedMinStrokes,
                        instruction: 'Row at your comfortable steady-state pace.',
                    };
                case PROTOCOL_STATES.FATIGUE_INDUCTION:
                    return {
                        phase: 'Fatigue Induction',
                        strokesCollected: fatigueInductionStrokes.length,
                        strokesNeeded: cfg.fatigueInductionStrokes,
                        canAdvance: fatigueInductionStrokes.length >= cfg.fatigueInductionStrokes,
                        instruction: `Maximum effort! Push as hard as you can for ${cfg.fatigueInductionStrokes - fatigueInductionStrokes.length} more strokes.`,
                    };
                case PROTOCOL_STATES.FATIGUED_CAPTURE:
                    return {
                        phase: 'Fatigued Re-Test',
                        strokesCollected: fatiguedStrokes.length,
                        strokesNeeded: cfg.fatiguedMinStrokes,
                        canAdvance: fatiguedStrokes.length >= cfg.fatiguedMinStrokes,
                        instruction: 'Return to your steady-state pace. We\'re measuring how you perform under fatigue.',
                    };
                case PROTOCOL_STATES.COMPLETE:
                    return { phase: 'Complete', canAdvance: false, instruction: 'Re-test complete.' };
                default:
                    return { phase: 'Not Started', canAdvance: true, instruction: 'Ready to begin fatigued re-test protocol.' };
            }
        },

        // ─── State transitions ────────────────────────────────────────
        start: () => {
            state = PROTOCOL_STATES.RESTED_CAPTURE;
            restedStrokes = [];
            fatigueInductionStrokes = [];
            fatiguedStrokes = [];
            transitionTimestamp = null;
            return { state, instruction: 'Begin rowing at comfortable steady-state pace.' };
        },

        advancePhase: () => {
            if (state === PROTOCOL_STATES.RESTED_CAPTURE && restedStrokes.length >= cfg.restedMinStrokes) {
                state = PROTOCOL_STATES.FATIGUE_INDUCTION;
                return {
                    state,
                    instruction: `Good baseline captured (${restedStrokes.length} strokes). Now: MAXIMUM EFFORT for ${cfg.fatigueInductionStrokes} strokes!`,
                };
            }
            if (state === PROTOCOL_STATES.FATIGUE_INDUCTION && fatigueInductionStrokes.length >= cfg.fatigueInductionStrokes) {
                state = PROTOCOL_STATES.FATIGUED_CAPTURE;
                transitionTimestamp = Date.now();
                return {
                    state,
                    instruction: 'Good effort! Now return to your normal pace — we\'re measuring your fatigued performance.',
                };
            }
            if (state === PROTOCOL_STATES.FATIGUED_CAPTURE && fatiguedStrokes.length >= cfg.fatiguedMinStrokes) {
                state = PROTOCOL_STATES.COMPLETE;
                return { state, instruction: 'Fatigued re-test complete. Computing results...' };
            }
            return { state, instruction: 'Cannot advance — current phase not complete.' };
        },

        // ─── Data collection ──────────────────────────────────────────
        addStroke: (stroke) => {
            switch (state) {
                case PROTOCOL_STATES.RESTED_CAPTURE:
                    if (restedStrokes.length < cfg.restedMaxStrokes) {
                        restedStrokes.push(stroke);
                    }
                    break;
                case PROTOCOL_STATES.FATIGUE_INDUCTION:
                    fatigueInductionStrokes.push(stroke);
                    break;
                case PROTOCOL_STATES.FATIGUED_CAPTURE:
                    if (fatiguedStrokes.length < cfg.fatiguedMaxStrokes) {
                        fatiguedStrokes.push(stroke);
                    }
                    break;
            }

            // Auto-advance if phase is complete
            const progress = {
                state,
                restedCount: restedStrokes.length,
                fatigueCount: fatigueInductionStrokes.length,
                fatiguedCount: fatiguedStrokes.length,
            };

            return progress;
        },

        // ─── Scoring ──────────────────────────────────────────────────
        score: () => {
            if (state !== PROTOCOL_STATES.COMPLETE ||
                restedStrokes.length < cfg.restedMinStrokes ||
                fatiguedStrokes.length < cfg.fatiguedMinStrokes) {
                return { valid: false, error: 'Protocol not complete' };
            }

            return scoreFatiguedRetest(
                restedStrokes,
                fatiguedStrokes,
                injuredSide,
                injuryType,
                cfg
            );
        },

        // ─── Raw data export ──────────────────────────────────────────
        getRawData: () => ({
            restedStrokes: [...restedStrokes],
            fatigueInductionStrokes: [...fatigueInductionStrokes],
            fatiguedStrokes: [...fatiguedStrokes],
            transitionTimestamp,
        }),
    };
}


// ─── Fatigued Re-Test Scoring ───────────────────────────────────────────────

/**
 * Score the fatigued re-test by comparing rested vs fatigued performance.
 *
 * Melbourne Guide weighting:
 *   - Max 20 points (20% of 100-point composite)
 *   - Sub-domains: LSI degradation, force degradation, CoP stability, asymmetry drift
 *   - Penalizes if degradation exceeds acceptable thresholds
 *   - Over-compensation (>110% LSI) is also penalized per Melbourne Guide
 *
 * @param {Array} restedStrokes - Strokes from rested baseline phase
 * @param {Array} fatiguedStrokes - Strokes from fatigued re-test phase
 * @param {string} injuredSide - 'left' or 'right'
 * @param {string} injuryType - Injury profile type
 * @param {Object} cfg - Protocol configuration
 * @returns {Object} Fatigued re-test score
 */
function scoreFatiguedRetest(restedStrokes, fatiguedStrokes, injuredSide, injuryType, cfg) {
    // ─── Compute rested baselines ─────────────────────────────────
    const restedLSI = meanOf(restedStrokes, s => calcStrokeLSI(s));
    const fatiguedLSI = meanOf(fatiguedStrokes, s => calcStrokeLSI(s));
    const lsiDegradation = Math.abs(restedLSI - fatiguedLSI);

    const restedForce = meanOf(restedStrokes, s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const fatiguedForce = meanOf(fatiguedStrokes, s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const forceDegradation = restedForce > 0
        ? ((restedForce - fatiguedForce) / restedForce) * 100
        : 0;

    const restedCoP = meanOf(restedStrokes, s => Math.abs(s.copAsymmetry || 0));
    const fatiguedCoP = meanOf(fatiguedStrokes, s => Math.abs(s.copAsymmetry || 0));
    const copShift = Math.abs(fatiguedCoP - restedCoP);

    // Asymmetric fatigue slope: compare degradation rate between sides
    const restedInjuredForces = restedStrokes.map(s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const fatiguedInjuredForces = fatiguedStrokes.map(s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const restedHealthyForces = restedStrokes.map(s =>
        injuredSide === 'right' ? s.leftPeak : s.rightPeak
    );
    const fatiguedHealthyForces = fatiguedStrokes.map(s =>
        injuredSide === 'right' ? s.leftPeak : s.rightPeak
    );

    const injuredDrop = mean(restedInjuredForces) > 0
        ? ((mean(restedInjuredForces) - mean(fatiguedInjuredForces)) / mean(restedInjuredForces)) * 100
        : 0;
    const healthyDrop = mean(restedHealthyForces) > 0
        ? ((mean(restedHealthyForces) - mean(fatiguedHealthyForces)) / mean(restedHealthyForces)) * 100
        : 0;
    const asymmetryDrift = Math.abs(injuredDrop - healthyDrop);

    // ─── Score each sub-domain (0 to sub-weight portion of maxScore) ──
    const maxPts = cfg.maxScore;

    const lsiPts = scoreDomain(
        lsiDegradation,
        cfg.acceptableLSIDegradation,
        cfg.acceptableLSIDegradation * 3,  // Zero points at 3x threshold
        maxPts * cfg.lsiDegradationPenaltyWeight
    );

    const forcePts = scoreDomain(
        forceDegradation,
        cfg.acceptableForceDegradation,
        cfg.acceptableForceDegradation * 2,
        maxPts * cfg.forceDegradationPenaltyWeight
    );

    const copPts = scoreDomain(
        copShift,
        cfg.acceptableCoPShift,
        cfg.acceptableCoPShift * 3,
        maxPts * cfg.copDegradationPenaltyWeight
    );

    const asymPts = scoreDomain(
        asymmetryDrift,
        cfg.acceptableAsymmetryDrift,
        cfg.acceptableAsymmetryDrift * 3,
        maxPts * cfg.asymmetryDriftPenaltyWeight
    );

    const totalScore = round1(lsiPts + forcePts + copPts + asymPts);

    // ─── Over-compensation check ──────────────────────────────────
    const fatiguedLSIRaw = fatiguedLSI;
    const overCompensation = fatiguedLSIRaw > OVER_COMPENSATION_LSI;

    // ─── Pathological fatigue drift check ─────────────────────────
    const pathologicalDrift = lsiDegradation > LSI_FATIGUE_DRIFT_THRESHOLD;

    // ─── Run biphasic analysis on fatigued strokes ────────────────
    const allStrokes = [...restedStrokes, ...fatiguedStrokes];
    const fatigueBiphasic = analyzeBiphasicFatigue(allStrokes, injuredSide);

    return {
        valid: true,
        score: totalScore,
        maxScore: maxPts,
        scorePercent: round1((totalScore / maxPts) * 100),

        subScores: {
            lsi: { points: round1(lsiPts), max: round1(maxPts * cfg.lsiDegradationPenaltyWeight), degradation: round1(lsiDegradation) },
            force: { points: round1(forcePts), max: round1(maxPts * cfg.forceDegradationPenaltyWeight), degradation: round1(forceDegradation) },
            cop: { points: round1(copPts), max: round1(maxPts * cfg.copDegradationPenaltyWeight), shift: round3(copShift) },
            asymmetry: { points: round1(asymPts), max: round1(maxPts * cfg.asymmetryDriftPenaltyWeight), drift: round1(asymmetryDrift) },
        },

        comparisons: {
            rested: { lsi: round1(restedLSI), force: Math.round(restedForce), cop: round3(restedCoP) },
            fatigued: { lsi: round1(fatiguedLSI), force: Math.round(fatiguedForce), cop: round3(fatiguedCoP) },
        },

        perSide: {
            injuredDrop: round1(injuredDrop),
            healthyDrop: round1(healthyDrop),
            asymmetricFatigue: round1(asymmetryDrift),
        },

        flags: {
            pathologicalDrift,
            overCompensation,
            mechanicalFailure: fatigueBiphasic.phase === FATIGUE_PHASE.MECHANICAL_FAILURE,
        },

        biphasicAnalysis: fatigueBiphasic,

        clinicianSummary: generateClinicianSummary(totalScore, maxPts, {
            lsiDegradation, forceDegradation, copShift, asymmetryDrift,
            pathologicalDrift, overCompensation, injuryType,
        }),
    };
}


// ─── Sub-Domain Scoring ─────────────────────────────────────────────────────

/**
 * Score a single domain on a linear scale.
 * Below acceptable threshold → full points.
 * Above zero-point threshold → 0 points.
 * Between → linear interpolation.
 */
function scoreDomain(value, acceptableThreshold, zeroThreshold, maxPoints) {
    if (value <= acceptableThreshold) return maxPoints;
    if (value >= zeroThreshold) return 0;
    const range = zeroThreshold - acceptableThreshold;
    const excess = value - acceptableThreshold;
    return maxPoints * (1 - excess / range);
}


// ─── Clinician Summary ──────────────────────────────────────────────────────

function generateClinicianSummary(score, maxScore, metrics) {
    const lines = [];
    lines.push(`Fatigued Re-Test Score: ${round1(score)}/${maxScore} (${round1((score / maxScore) * 100)}%)`);
    lines.push('');

    if (metrics.lsiDegradation > RETEST_PROTOCOL.acceptableLSIDegradation) {
        lines.push(`⚠ LSI degraded ${round1(metrics.lsiDegradation)}% under fatigue (acceptable: <${RETEST_PROTOCOL.acceptableLSIDegradation}%). Healthy adults show ~0% degradation.`);
    }

    if (metrics.forceDegradation > RETEST_PROTOCOL.acceptableForceDegradation) {
        lines.push(`⚠ Injured-side force dropped ${round1(metrics.forceDegradation)}% (acceptable: <${RETEST_PROTOCOL.acceptableForceDegradation}%).`);
    }

    if (metrics.asymmetryDrift > RETEST_PROTOCOL.acceptableAsymmetryDrift) {
        lines.push(`⚠ Asymmetric fatigue: injured side lost ${round1(metrics.asymmetryDrift)}% more force than healthy side (acceptable: <${RETEST_PROTOCOL.acceptableAsymmetryDrift}%).`);
    }

    if (metrics.pathologicalDrift) {
        lines.push(`🔴 PATHOLOGICAL: LSI fatigue drift exceeds ${LSI_FATIGUE_DRIFT_THRESHOLD}% — this is NOT normal fatigue behavior.`);
    }

    if (metrics.overCompensation) {
        lines.push(`🔴 OVER-COMPENSATION: Fatigued LSI >${OVER_COMPENSATION_LSI}% — Melbourne Guide penalizes healthy-limb hyper-reliance.`);
    }

    if (lines.length === 2) {
        lines.push('All fatigued-state metrics within acceptable ranges.');
    }

    return lines.join('\n');
}


// ─── Utility ────────────────────────────────────────────────────────────────

function calcStrokeLSI(stroke) {
    const left = stroke.leftPeak || 0;
    const right = stroke.rightPeak || 0;
    const max = Math.max(left, right);
    if (max === 0) return 100;
    return (Math.min(left, right) / max) * 100;
}

function meanOf(arr, fn) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, item) => sum + fn(item), 0) / arr.length;
}

function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round1(v) { return Math.round(v * 10) / 10; }
function round3(v) { return Math.round(v * 1000) / 1000; }
