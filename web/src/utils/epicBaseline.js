/**
 * EPIC — Estimated Pre-Injury Capacity — v2.0
 *
 * Dynamic Baseline Adjustment system that addresses the fundamental limitation
 * of the standard Limb Symmetry Index (LSI): the contralateral (healthy) limb
 * itself declines 15–30% post-operatively, so an LSI of 90% may mask the fact
 * that both limbs have declined significantly from true pre-injury capacity.
 *
 * v2.0 additions:
 *   - Dual BAF system: session-derived (Tier 2) + time-based exponential decay
 *   - Per-injury-type Dmax decay curves (configurable with research defaults)
 *   - Dual LSI display (standard + EPIC side-by-side)
 *   - Research validation: Wellsandt et al. 2017 — 60% of LSI passers fail EPIC,
 *     EPIC sensitivity 0.818 vs LSI 0.273 for reinjury prediction
 *
 * Three-tier baseline hierarchy:
 *   Tier 1 — True Pre-Injury Baseline (not implemented — requires pre-injury data)
 *   Tier 2 — Early Post-Operative Capture (contralateral limb in first 2–4 weeks)
 *   Tier 3 — Population Normative Data (age/sex-adjusted reference baselines)
 *   Time-Based — Exponential decay model when no early sessions available
 *
 * Patent Reference: Section 5 — Dynamic Baseline Adjustment and EPIC
 * Clinical Sources: Wellsandt et al. JOSPT 2017; Gemini deep research synthesis
 */

import { getInjuryProfile, getClosestBaseline } from './injuryProfiles.js';

// ─── Storage Keys ───────────────────────────────────────────────────────────
const STORAGE_KEY_BASELINE = 'epic_baseline';
const STORAGE_KEY_SESSION_HISTORY = 'epic_session_history';
const STORAGE_KEY_BAF_HISTORY = 'epic_baf_history';


// ─── Contralateral Decline Curves ───────────────────────────────────────────
// Research-derived exponential decay parameters per injury type.
// Dmax = maximum theoretical strength deficit (decimal) due to detraining.
// k = biological decay rate constant.
//
// BAF(t) = 1 / (1 - Dmax × (1 - e^(-k×t)))
//
// These are configurable defaults — clinicians can override per patient.

export const DECLINE_CURVES = {
    acl: {
        label: 'ACL Reconstruction (Quadriceps)',
        // Phase-specific Dmax from longitudinal cohort data:
        //   0-3mo: ~5%, 3-6mo: 10-12%, 6-12mo: ~15%, 12+mo: 15-20% plateau
        // Single Dmax for exponential model: 0.175 (midpoint of 15-20% plateau)
        Dmax: 0.175,
        k: 0.35,  // Fitted: steepest decline at 3-9 months

        // Phase-specific Dmax for granular lookup (months post-op → Dmax)
        phaseDmax: [
            { monthStart: 0, monthEnd: 3,   dmax: 0.05 },
            { monthStart: 3, monthEnd: 6,   dmax: 0.11 },
            { monthStart: 6, monthEnd: 9,   dmax: 0.15 },
            { monthStart: 9, monthEnd: 12,  dmax: 0.175 },
            { monthStart: 12, monthEnd: 999, dmax: 0.175 }, // Plateau
        ],

        // Research context
        source: 'Synthesized from 381-patient longitudinal study. 23.1% lost >10% contralateral strength at 6-12mo.',
    },

    achilles: {
        label: 'Achilles Tendon Repair (Plantarflexors)',
        // More severe early immobilization but narrower final deficit
        //   0-6wk: rapid atrophy, 6-12wk: intermediate, 12-24wk: peak decline, 24+: plateau
        Dmax: 0.15,
        k: 0.30,

        phaseDmax: [
            { monthStart: 0, monthEnd: 1.5, dmax: 0.04 },
            { monthStart: 1.5, monthEnd: 3,  dmax: 0.08 },
            { monthStart: 3, monthEnd: 6,    dmax: 0.12 },
            { monthStart: 6, monthEnd: 12,   dmax: 0.15 },
            { monthStart: 12, monthEnd: 999, dmax: 0.15 }, // Plateau
        ],

        source: 'Derived from Achilles repair populations: 10-30% global calf reduction, structural soleus volume at 84.6%.',
    },

    patellofemoral: {
        label: 'Patellofemoral Procedure',
        // Moderate decline — less immobilization than Achilles, less systemic than ACL
        Dmax: 0.12,
        k: 0.28,

        phaseDmax: [
            { monthStart: 0, monthEnd: 2.5, dmax: 0.04 },
            { monthStart: 2.5, monthEnd: 5,  dmax: 0.08 },
            { monthStart: 5, monthEnd: 10,   dmax: 0.12 },
            { monthStart: 10, monthEnd: 999, dmax: 0.12 },
        ],

        source: 'Estimated from patellofemoral rehabilitation timelines and general detraining literature.',
    },

    general: {
        label: 'General Lower Extremity',
        Dmax: 0.15,
        k: 0.30,

        phaseDmax: [
            { monthStart: 0, monthEnd: 3,   dmax: 0.05 },
            { monthStart: 3, monthEnd: 6,   dmax: 0.10 },
            { monthStart: 6, monthEnd: 12,  dmax: 0.15 },
            { monthStart: 12, monthEnd: 999, dmax: 0.15 },
        ],

        source: 'General detraining literature average.',
    },
};


// ─── Time-Based BAF Model ───────────────────────────────────────────────────

/**
 * Compute the time-based predicted BAF using the exponential decay saturation model.
 *
 * The model: S_contra(t) = S_baseline × (1 - Dmax × (1 - e^(-k×t)))
 * Therefore: BAF = 1 / (1 - Dmax × (1 - e^(-k×t)))
 *
 * BAF > 1.0 always (the healthy limb has declined, so its true baseline was higher).
 *
 * @param {number} monthsPostOp - Months since surgery
 * @param {string} injuryType - 'acl', 'achilles', 'patellofemoral', or 'general'
 * @param {Object} [overrides] - Optional { Dmax, k } overrides for clinician tuning
 * @returns {{ baf: number, estimatedDeclinePct: number, curve: Object }}
 */
export function calcTimeBasedBAF(monthsPostOp, injuryType, overrides = {}) {
    const curve = DECLINE_CURVES[injuryType] || DECLINE_CURVES.general;
    const Dmax = overrides.Dmax ?? curve.Dmax;
    const k = overrides.k ?? curve.k;

    // Clamp time to reasonable range
    const t = Math.max(0, Math.min(monthsPostOp, 36));

    // Exponential decay model
    const decayFraction = Dmax * (1 - Math.exp(-k * t));
    const denominator = 1 - decayFraction;

    // BAF = baseline / current = 1 / (fraction of baseline remaining)
    const baf = denominator > 0.3 ? 1 / denominator : 1 / 0.3; // Cap at ~3.33x

    return {
        baf: Math.round(baf * 1000) / 1000,
        estimatedDeclinePct: Math.round(decayFraction * 1000) / 10,
        model: 'exponential_decay',
        params: { Dmax, k, t },
        curve,
    };
}

/**
 * Get the phase-specific Dmax for a given time point and injury type.
 * Uses the granular phase lookup table.
 *
 * @param {number} monthsPostOp
 * @param {string} injuryType
 * @returns {{ dmax: number, phase: string }}
 */
export function getPhaseDmax(monthsPostOp, injuryType) {
    const curve = DECLINE_CURVES[injuryType] || DECLINE_CURVES.general;

    for (const phase of curve.phaseDmax) {
        if (monthsPostOp >= phase.monthStart && monthsPostOp < phase.monthEnd) {
            return {
                dmax: phase.dmax,
                phase: `${phase.monthStart}-${phase.monthEnd === 999 ? '∞' : phase.monthEnd} months`,
            };
        }
    }

    // Fallback to last phase
    const lastPhase = curve.phaseDmax[curve.phaseDmax.length - 1];
    return { dmax: lastPhase.dmax, phase: 'plateau' };
}


// ─── Core EPIC Calculations ────────────────────────────────────────────────

/**
 * Compute the standard Limb Symmetry Index.
 * LSI = (F_surgical / F_contralateral) × 100%
 */
export function calcStandardLSI(surgicalForce, contralateralForce) {
    if (contralateralForce <= 0) return 0;
    return (surgicalForce / contralateralForce) * 100;
}

/**
 * Compute the Bilateral Adjustment Factor (BAF) from measured session data.
 * BAF = F_contralateral_current / F_contralateral_EPIC_baseline
 *
 * @param {number} contralateralCurrent - Current session's contralateral performance
 * @param {number} contralateralBaseline - EPIC baseline contralateral performance
 * @returns {number} BAF (typically 0.5–1.0)
 */
export function calcBAF(contralateralCurrent, contralateralBaseline) {
    if (contralateralBaseline <= 0) return 1.0;
    return Math.min(1.5, Math.max(0.3, contralateralCurrent / contralateralBaseline));
}

/**
 * Compute the EPIC-adjusted LSI using the dual BAF system.
 *
 * Priority:
 *   1. If session-derived BAF available (Tier 2 baseline), use measured BAF
 *   2. If only time-based available, use exponential decay model
 *   3. If neither, return standard LSI with warning
 *
 * @param {number} surgicalForce
 * @param {number} contralateralForce
 * @param {Object} baselineConfig - {
 *     contralateralBaseline: number|null,    // From Tier 2/3
 *     monthsPostOp: number|null,             // For time-based model
 *     injuryType: string,                    // For decay curve selection
 *     Dmax: number|null,                     // Optional clinician override
 *     k: number|null,                        // Optional clinician override
 * }
 * @returns {Object} Comprehensive EPIC analysis with both LSI metrics
 */
export function calcEPICAdjustedLSI(surgicalForce, contralateralForce, baselineConfig) {
    const standardLSI = calcStandardLSI(surgicalForce, contralateralForce);

    // Support legacy call signature: calcEPICAdjustedLSI(surg, contra, baselineNumber)
    if (typeof baselineConfig === 'number') {
        const baf = calcBAF(contralateralForce, baselineConfig);
        const epicLSI = standardLSI * baf;
        const bilateralDecline = (1 - baf) * 100;
        return {
            standardLSI: Math.round(standardLSI * 10) / 10,
            epicLSI: Math.round(epicLSI * 10) / 10,
            baf: Math.round(baf * 1000) / 1000,
            bilateralDecline: Math.round(bilateralDecline * 10) / 10,
            bafSource: 'session_derived',
        };
    }

    const config = baselineConfig || {};
    let baf = 1.0;
    let bafSource = 'none';
    let timeBasedResult = null;

    // Priority 1: Session-derived BAF (measured Tier 2/3 baseline)
    if (config.contralateralBaseline && config.contralateralBaseline > 0) {
        baf = calcBAF(contralateralForce, config.contralateralBaseline);
        bafSource = 'session_derived';
    }
    // Priority 2: Time-based exponential decay model
    else if (config.monthsPostOp != null && config.monthsPostOp > 0) {
        timeBasedResult = calcTimeBasedBAF(
            config.monthsPostOp,
            config.injuryType || 'general',
            { Dmax: config.Dmax, k: config.k }
        );
        // Time-based BAF is the inverse: baseline/current = BAF from model
        // But our EPIC formula is epicLSI = standardLSI × (current/baseline)
        // Time-based model gives us BAF = baseline/current, so current/baseline = 1/BAF
        baf = 1 / timeBasedResult.baf;
        bafSource = 'time_based';
    }

    const epicLSI = standardLSI * baf;
    const bilateralDecline = (1 - baf) * 100;

    return {
        standardLSI: Math.round(standardLSI * 10) / 10,
        epicLSI: Math.round(epicLSI * 10) / 10,
        baf: Math.round(baf * 1000) / 1000,
        bilateralDecline: Math.round(bilateralDecline * 10) / 10,
        bafSource,

        // Dual display data
        dual: {
            standardPasses: standardLSI >= 90,
            epicPasses: epicLSI >= 90,
            hiddenDeficit: standardLSI >= 90 && epicLSI < 90,
            divergence: Math.round(Math.abs(standardLSI - epicLSI) * 10) / 10,
        },

        // Time-based model details (when used)
        timeBasedModel: timeBasedResult,
    };
}


// ─── Baseline Management ────────────────────────────────────────────────────

/**
 * Create an EPIC baseline from session data or time-based model.
 *
 * @param {string} tier - 'tier2', 'tier3', or 'time_based'
 * @param {Object} data - Session metrics, demographics, or time data
 * @param {string} injuredSide - 'left' or 'right'
 * @returns {Object} baseline object
 */
export function createBaseline(tier, data, injuredSide) {
    const now = Date.now();

    if (tier === 'tier2') {
        return {
            tier: 'tier2',
            createdAt: now,
            injuredSide,
            contralateralPeakForce: data.contralateralPeakForce,
            contralateralImpulse: data.contralateralImpulse,
            contralateralCoP: data.contralateralCoP || null,
            contralateralFatigueSlope: data.contralateralFatigueSlope || null,
            sessionCount: data.sessionCount || 1,
            label: `Early capture (${data.sessionCount || 1} session${data.sessionCount > 1 ? 's' : ''})`,
        };
    }

    if (tier === 'tier3') {
        const norms = getClosestBaseline(data.age, data.sex);
        return {
            tier: 'tier3',
            createdAt: now,
            injuredSide,
            contralateralPeakForce: norms.peakForce,
            contralateralImpulse: norms.impulsePerStroke,
            contralateralCoP: norms.copIndex,
            contralateralFatigueSlope: norms.fatigueSlope,
            demographics: { age: data.age, sex: data.sex },
            label: `Population norms (${data.age}y ${data.sex})`,
        };
    }

    if (tier === 'time_based') {
        // Time-based: estimate baseline from current + decay model
        const result = calcTimeBasedBAF(
            data.monthsPostOp,
            data.injuryType || 'general',
            { Dmax: data.Dmax, k: data.k }
        );
        const estimatedBaseline = data.currentContralateralForce * result.baf;

        return {
            tier: 'time_based',
            createdAt: now,
            injuredSide,
            contralateralPeakForce: Math.round(estimatedBaseline),
            contralateralImpulse: null, // Can't estimate impulse from peak alone
            monthsPostOp: data.monthsPostOp,
            injuryType: data.injuryType,
            decayParams: result.params,
            estimatedDeclinePct: result.estimatedDeclinePct,
            label: `Time-based estimate (${data.monthsPostOp}mo post-op, ${result.estimatedDeclinePct}% predicted decline)`,
        };
    }

    throw new Error(`Unknown EPIC tier: ${tier}`);
}

/**
 * Build a Tier 2 baseline from multiple early sessions.
 */
export function buildTier2BaselineFromSessions(sessions, injuredSide) {
    if (!sessions || sessions.length === 0) return null;

    const contralateralMetrics = sessions.map(session => {
        const strokes = session.strokes || [];
        if (strokes.length === 0) return null;

        const peakForces = strokes.map(s =>
            injuredSide === 'right' ? s.leftPeak : s.rightPeak
        );
        const impulses = strokes.map(s =>
            injuredSide === 'right' ? s.leftImpulse : s.rightImpulse
        );

        return {
            peakForce: peakForces.reduce((a, b) => a + b, 0) / peakForces.length,
            impulse: impulses.reduce((a, b) => a + b, 0) / impulses.length,
        };
    }).filter(Boolean);

    if (contralateralMetrics.length === 0) return null;

    const avgPeak = contralateralMetrics.reduce((s, m) => s + m.peakForce, 0) / contralateralMetrics.length;
    const avgImpulse = contralateralMetrics.reduce((s, m) => s + m.impulse, 0) / contralateralMetrics.length;

    return createBaseline('tier2', {
        contralateralPeakForce: avgPeak,
        contralateralImpulse: avgImpulse,
        sessionCount: contralateralMetrics.length,
    }, injuredSide);
}


// ─── Session-Level EPIC Analysis ────────────────────────────────────────────

/**
 * Compute EPIC metrics for a complete session.
 * Now returns dual LSI display data for standard vs EPIC comparison.
 */
export function analyzeSessionEPIC(strokes, baseline, injuredSide) {
    if (!strokes || strokes.length === 0 || !baseline) {
        return { available: false };
    }

    const surgicalPeaks = strokes.map(s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const contralateralPeaks = strokes.map(s =>
        injuredSide === 'right' ? s.leftPeak : s.rightPeak
    );
    const surgicalImpulses = strokes.map(s =>
        injuredSide === 'right' ? (s.rightImpulse || 0) : (s.leftImpulse || 0)
    );
    const contralateralImpulses = strokes.map(s =>
        injuredSide === 'right' ? (s.leftImpulse || 0) : (s.rightImpulse || 0)
    );

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    const avgSurgicalPeak = avg(surgicalPeaks);
    const avgContralateralPeak = avg(contralateralPeaks);
    const avgSurgicalImpulse = avg(surgicalImpulses);
    const avgContralateralImpulse = avg(contralateralImpulses);

    // Peak force-based EPIC (supports both legacy number and new config object)
    const peakEPIC = calcEPICAdjustedLSI(
        avgSurgicalPeak,
        avgContralateralPeak,
        baseline.contralateralPeakForce
    );

    // Impulse-based EPIC
    const impulseEPIC = baseline.contralateralImpulse
        ? calcEPICAdjustedLSI(
            avgSurgicalImpulse,
            avgContralateralImpulse,
            baseline.contralateralImpulse
        )
        : null;

    return {
        available: true,
        baselineTier: baseline.tier,
        baselineLabel: baseline.label,

        peak: {
            ...peakEPIC,
            surgicalAvg: Math.round(avgSurgicalPeak),
            contralateralAvg: Math.round(avgContralateralPeak),
            baselineContralateral: Math.round(baseline.contralateralPeakForce),
        },

        impulse: impulseEPIC ? {
            ...impulseEPIC,
            surgicalAvg: Math.round(avgSurgicalImpulse * 100) / 100,
            contralateralAvg: Math.round(avgContralateralImpulse * 100) / 100,
            baselineContralateral: Math.round(baseline.contralateralImpulse * 100) / 100,
        } : null,

        // Dual LSI display (primary use case for dashboard)
        dualLSI: {
            standard: peakEPIC.standardLSI,
            epic: peakEPIC.epicLSI,
            divergence: Math.round(Math.abs(peakEPIC.standardLSI - peakEPIC.epicLSI) * 10) / 10,
            baf: peakEPIC.baf,
            bafSource: peakEPIC.bafSource || 'session_derived',
            bilateralDecline: peakEPIC.bilateralDecline,
        },

        passesStandardLSI: peakEPIC.standardLSI >= 90,
        passesEPICLSI: peakEPIC.epicLSI >= 90,
        hiddenDeficit: peakEPIC.standardLSI >= 90 && peakEPIC.epicLSI < 90,

        // Research context for UI tooltip
        researchNote: 'Wellsandt et al. 2017: 60% of patients passing standard LSI ≥90% failed EPIC ≥90%. EPIC sensitivity for reinjury: 0.818 vs LSI: 0.273.',
    };
}


// ─── BAF Recalibration ──────────────────────────────────────────────────────

/**
 * Check if the BAF should be recalibrated based on recovery milestones.
 */
export function checkBAFRecalibration(profileId, recentCRSScores, currentBaseline, currentContralateralPerformance) {
    const profile = getInjuryProfile(profileId);
    const config = profile.epicConfig;

    if (!recentCRSScores || recentCRSScores.length < config.bafRecalibrationSessions) {
        return { shouldRecalibrate: false, newBaseline: null, reason: 'Insufficient sessions' };
    }

    const recentSlice = recentCRSScores.slice(-config.bafRecalibrationSessions);
    const allAboveThreshold = recentSlice.every(s => s >= config.bafRecalibrationCRS);

    if (!allAboveThreshold) {
        return { shouldRecalibrate: false, newBaseline: null, reason: 'CRS not consistently above threshold' };
    }

    if (currentContralateralPerformance > currentBaseline.contralateralPeakForce) {
        const newBaseline = {
            ...currentBaseline,
            contralateralPeakForce: currentContralateralPerformance,
            recalibratedAt: Date.now(),
            recalibrationReason: `CRS exceeded ${config.bafRecalibrationCRS} for ${config.bafRecalibrationSessions} sessions`,
        };

        return {
            shouldRecalibrate: true,
            newBaseline,
            reason: `Contralateral limb has recovered — baseline updated to ${Math.round(currentContralateralPerformance)}`,
        };
    }

    return { shouldRecalibrate: false, newBaseline: null, reason: 'Contralateral not above current baseline' };
}


// ─── Persistence Helpers ────────────────────────────────────────────────────

export function saveBaseline(baseline) {
    try {
        localStorage.setItem(STORAGE_KEY_BASELINE, JSON.stringify(baseline));
    } catch (e) {
        console.warn('Failed to save EPIC baseline:', e);
    }
}

export function loadBaseline() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_BASELINE);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.warn('Failed to load EPIC baseline:', e);
        return null;
    }
}

export function saveSessionToHistory(sessionSummary) {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_SESSION_HISTORY);
        const history = stored ? JSON.parse(stored) : [];
        history.push({ ...sessionSummary, timestamp: Date.now() });
        if (history.length > 100) history.splice(0, history.length - 100);
        localStorage.setItem(STORAGE_KEY_SESSION_HISTORY, JSON.stringify(history));
    } catch (e) {
        console.warn('Failed to save session history:', e);
    }
}

export function loadSessionHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_SESSION_HISTORY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('Failed to load session history:', e);
        return [];
    }
}

export function getCRSTrend(lastN = 10) {
    const history = loadSessionHistory();
    return history.slice(-lastN).map(s => s.crs).filter(Boolean);
}
