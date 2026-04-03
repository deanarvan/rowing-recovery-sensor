/**
 * Psychological Readiness Module — ACL-RSI Integration
 *
 * Implements the ACL-Return to Sport after Injury (ACL-RSI) scale as a parallel
 * domain for phase transition and RTS clearance gating.
 *
 * Research basis (Gemini deep research report 04):
 *   - ACL-RSI >65 required alongside physical criteria for RTS clearance
 *   - Scores <60 predict lower RTS rates independent of physical function
 *   - Fear of reinjury alters motor control under competitive stress
 *   - Melbourne ACL Rehabilitation Guide 2.0 includes TSK-11 as pass/fail gate
 *   - Psychological readiness is a PARALLEL domain — not a sub-component of CRS
 *
 * The ACL-RSI is a 12-item self-report scale (0-100 each), averaged to a
 * composite 0-100 score. Higher = more psychologically ready.
 *
 * This module also tracks kinesiophobia (Tampa Scale of Kinesiophobia-11)
 * as a secondary marker when available.
 *
 * Patent Reference: Section 7 — Injury Profile System (psychological gate)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * ACL-RSI threshold for RTS clearance.
 * Scores below this gate the transition regardless of physical readiness.
 */
export const ACL_RSI_CLEARANCE_THRESHOLD = 65;

/**
 * ACL-RSI warning threshold — scores below this predict lower RTS rates.
 */
export const ACL_RSI_WARNING_THRESHOLD = 60;

/**
 * Tampa Scale of Kinesiophobia-11 (TSK-11) pass/fail threshold.
 * Melbourne Guide uses this as a binary gate.
 * TSK-11 range: 11-44; higher = more fear. Scores >28 considered elevated.
 */
export const TSK11_ELEVATED_THRESHOLD = 28;

/**
 * Minimum number of ACL-RSI assessments needed for trend analysis.
 */
const MIN_ASSESSMENTS_FOR_TREND = 3;

/**
 * ACL-RSI 12 question domains (for reference and UI labeling).
 * Each is scored 0-100 on a visual analog scale.
 */
export const ACL_RSI_DOMAINS = [
    { id: 1, domain: 'emotions', text: 'Are you confident that you can perform at your previous level of sport participation?' },
    { id: 2, domain: 'emotions', text: 'Do you think you are likely to reinjure your knee by participating in sport?' },
    { id: 3, domain: 'confidence', text: 'Are you nervous about playing sport?' },
    { id: 4, domain: 'risk_appraisal', text: 'Do you find it frustrating to have to consider your knee with respect to sport?' },
    { id: 5, domain: 'emotions', text: 'Are you fearful of reinjuring your knee by playing sport?' },
    { id: 6, domain: 'risk_appraisal', text: 'Are you confident that your knee can cope with sport participation?' },
    { id: 7, domain: 'confidence', text: 'Are you confident that you can perform without risk to your knee?' },
    { id: 8, domain: 'emotions', text: 'Do you feel relaxed about playing sport?' },
    { id: 9, domain: 'risk_appraisal', text: 'Are you confident about your knee holding up under pressure?' },
    { id: 10, domain: 'emotions', text: 'Are you confident that you can play without concern for your knee?' },
    { id: 11, domain: 'confidence', text: 'Do you find it difficult to be confident about your knee?' },
    { id: 12, domain: 'risk_appraisal', text: 'Are you confident about your ability to perform well at sport?' },
];

// Reverse-scored items (higher raw score = MORE fear/less readiness)
const REVERSE_SCORED_ITEMS = [2, 3, 4, 5, 11];


// ─── Core Scoring ───────────────────────────────────────────────────────────

/**
 * Score an ACL-RSI assessment from raw item responses.
 *
 * @param {Object} responses - Map of item id → raw score (0-100 VAS)
 * @returns {Object} Scored assessment
 */
export function scoreACLRSI(responses) {
    if (!responses || typeof responses !== 'object') {
        return { valid: false, error: 'No responses provided' };
    }

    const itemScores = [];
    const domainScores = { emotions: [], confidence: [], risk_appraisal: [] };
    const missing = [];

    for (const item of ACL_RSI_DOMAINS) {
        const raw = responses[item.id];
        if (raw === undefined || raw === null) {
            missing.push(item.id);
            continue;
        }

        // Clamp to 0-100
        const clamped = Math.max(0, Math.min(100, Number(raw)));

        // Reverse-score where needed (so higher always = more ready)
        const scored = REVERSE_SCORED_ITEMS.includes(item.id)
            ? (100 - clamped)
            : clamped;

        itemScores.push({ id: item.id, raw: clamped, scored, domain: item.domain });
        domainScores[item.domain].push(scored);
    }

    // Need at least 10 of 12 items for a valid score
    if (itemScores.length < 10) {
        return {
            valid: false,
            error: `Only ${itemScores.length}/12 items answered (minimum 10 required)`,
            missing,
        };
    }

    // Composite = mean of all scored items
    const composite = itemScores.reduce((sum, i) => sum + i.scored, 0) / itemScores.length;

    // Domain sub-scores
    const domains = {};
    for (const [key, scores] of Object.entries(domainScores)) {
        domains[key] = scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : null;
    }

    return {
        valid: true,
        composite: Math.round(composite * 10) / 10,
        domains,
        itemScores,
        itemCount: itemScores.length,
        missing,
        timestamp: Date.now(),
    };
}


// ─── Readiness Classification ───────────────────────────────────────────────

/**
 * Classify psychological readiness from an ACL-RSI composite score.
 *
 * @param {number} composite - ACL-RSI composite score (0-100)
 * @returns {Object} Classification with status, gate result, and messaging
 */
export function classifyReadiness(composite) {
    if (composite === null || composite === undefined || isNaN(composite)) {
        return {
            status: 'unavailable',
            gateResult: 'unknown',
            message: 'No psychological readiness data available.',
            clinicianNote: 'ACL-RSI not administered. Cannot assess psychological readiness.',
        };
    }

    if (composite >= ACL_RSI_CLEARANCE_THRESHOLD) {
        return {
            status: 'ready',
            gateResult: 'pass',
            message: 'You\'re feeling confident about returning to activity. Great progress!',
            clinicianNote: `ACL-RSI ${composite}/100 — exceeds clearance threshold (≥${ACL_RSI_CLEARANCE_THRESHOLD}). Psychological gate: PASS.`,
        };
    }

    if (composite >= ACL_RSI_WARNING_THRESHOLD) {
        return {
            status: 'approaching',
            gateResult: 'caution',
            message: 'You\'re building confidence, but there\'s still some hesitation about your knee. That\'s normal — let\'s keep progressing.',
            clinicianNote: `ACL-RSI ${composite}/100 — below clearance (${ACL_RSI_CLEARANCE_THRESHOLD}) but above warning floor (${ACL_RSI_WARNING_THRESHOLD}). ` +
                `Consider targeted psychological support. Research: scores 60-65 may benefit from graded exposure protocols.`,
        };
    }

    return {
        status: 'not_ready',
        gateResult: 'fail',
        message: 'It sounds like you\'re still worried about your knee. That\'s completely understandable. ' +
            'Addressing these concerns is just as important as the physical side of recovery.',
        clinicianNote: `ACL-RSI ${composite}/100 — below warning threshold (${ACL_RSI_WARNING_THRESHOLD}). ` +
            `Research: scores <60 predict lower RTS rates independent of physical function. ` +
            `Fear of reinjury alters motor control under competitive stress. ` +
            `Recommend: sport psychology referral, graded exposure, visualization training.`,
    };
}


// ─── TSK-11 Scoring ─────────────────────────────────────────────────────────

/**
 * Score a Tampa Scale of Kinesiophobia-11 assessment.
 * TSK-11 is an 11-item scale, each scored 1-4 (strongly disagree → strongly agree).
 * Total range: 11-44. Higher = more kinesiophobia.
 *
 * @param {number[]} responses - Array of 11 item scores (1-4)
 * @returns {Object} TSK-11 result
 */
export function scoreTSK11(responses) {
    if (!Array.isArray(responses) || responses.length < 11) {
        return { valid: false, error: 'TSK-11 requires exactly 11 item scores (1-4)' };
    }

    // Items 4 and 8 are reverse-scored in TSK-11
    const reverseItems = [3, 7]; // 0-indexed positions for items 4 and 8
    const scored = responses.slice(0, 11).map((val, idx) => {
        const clamped = Math.max(1, Math.min(4, Math.round(val)));
        return reverseItems.includes(idx) ? (5 - clamped) : clamped;
    });

    const total = scored.reduce((a, b) => a + b, 0);
    const elevated = total >= TSK11_ELEVATED_THRESHOLD;

    return {
        valid: true,
        total,
        elevated,
        gateResult: elevated ? 'fail' : 'pass',
        clinicianNote: elevated
            ? `TSK-11 total ${total}/44 — ELEVATED kinesiophobia (≥${TSK11_ELEVATED_THRESHOLD}). Melbourne Guide: FAIL gate. Address movement fears before clearance.`
            : `TSK-11 total ${total}/44 — within normal range (<${TSK11_ELEVATED_THRESHOLD}). Melbourne Guide: PASS gate.`,
        timestamp: Date.now(),
    };
}


// ─── Trend Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze longitudinal ACL-RSI trends across assessments.
 *
 * @param {Array} assessments - Array of scored ACL-RSI objects (with .composite and .timestamp)
 * @returns {Object} Trend analysis
 */
export function analyzeReadinessTrend(assessments) {
    if (!assessments || assessments.length < MIN_ASSESSMENTS_FOR_TREND) {
        return {
            available: false,
            reason: `Need at least ${MIN_ASSESSMENTS_FOR_TREND} assessments for trend analysis`,
        };
    }

    // Sort by timestamp
    const sorted = [...assessments]
        .filter(a => a.valid && a.composite !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (sorted.length < MIN_ASSESSMENTS_FOR_TREND) {
        return { available: false, reason: 'Insufficient valid assessments' };
    }

    const composites = sorted.map(a => a.composite);
    const first = composites[0];
    const last = composites[composites.length - 1];
    const change = last - first;

    // Linear regression slope (points per assessment)
    const slope = linearSlope(composites);

    // Calculate weeks between first and last
    const msSpan = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
    const weeksSpan = msSpan / (7 * 24 * 60 * 60 * 1000);
    const slopePerWeek = weeksSpan > 0 ? change / weeksSpan : 0;

    // Projected weeks to reach clearance threshold
    let projectedWeeksToThreshold = null;
    if (last < ACL_RSI_CLEARANCE_THRESHOLD && slopePerWeek > 0) {
        projectedWeeksToThreshold = Math.ceil((ACL_RSI_CLEARANCE_THRESHOLD - last) / slopePerWeek);
    }

    return {
        available: true,
        assessmentCount: sorted.length,
        firstScore: first,
        latestScore: last,
        totalChange: Math.round(change * 10) / 10,
        direction: change > 2 ? 'improving' : change < -2 ? 'declining' : 'stable',
        slopePerAssessment: Math.round(slope * 100) / 100,
        slopePerWeek: Math.round(slopePerWeek * 100) / 100,
        projectedWeeksToThreshold,
        meetsThreshold: last >= ACL_RSI_CLEARANCE_THRESHOLD,
    };
}


// ─── Composite Psychological Gate ───────────────────────────────────────────

/**
 * Evaluate the combined psychological gate for phase transition.
 * Combines ACL-RSI and TSK-11 (if available) into a single gate result.
 *
 * @param {Object} aclRsi - Scored ACL-RSI result (from scoreACLRSI)
 * @param {Object} [tsk11] - Scored TSK-11 result (from scoreTSK11), optional
 * @returns {Object} Combined psychological gate result
 */
export function evaluatePsychologicalGate(aclRsi, tsk11 = null) {
    const gates = [];
    let overallPass = true;

    // ACL-RSI gate
    if (aclRsi && aclRsi.valid) {
        const classification = classifyReadiness(aclRsi.composite);
        gates.push({
            instrument: 'ACL-RSI',
            score: aclRsi.composite,
            threshold: ACL_RSI_CLEARANCE_THRESHOLD,
            result: classification.gateResult,
            note: classification.clinicianNote,
        });
        if (classification.gateResult === 'fail') overallPass = false;
    }

    // TSK-11 gate (Melbourne Guide: pass/fail)
    if (tsk11 && tsk11.valid) {
        gates.push({
            instrument: 'TSK-11',
            score: tsk11.total,
            threshold: TSK11_ELEVATED_THRESHOLD,
            result: tsk11.gateResult,
            note: tsk11.clinicianNote,
        });
        if (tsk11.gateResult === 'fail') overallPass = false;
    }

    return {
        overallPass,
        gates,
        psychologicalScore: aclRsi?.valid ? aclRsi.composite : null,
        recommendation: overallPass
            ? 'Psychological readiness criteria met.'
            : 'Psychological readiness criteria NOT met. Address psychological barriers before advancing phase.',
    };
}


// ─── Persistence Helpers ────────────────────────────────────────────────────

const STORAGE_KEY_PSYCH = 'psych_assessments';

/**
 * Save a psychological assessment to local storage.
 */
export function saveAssessment(assessment) {
    try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_KEY_PSYCH) || '[]');
        existing.push(assessment);
        localStorage.setItem(STORAGE_KEY_PSYCH, JSON.stringify(existing));
        return true;
    } catch {
        return false;
    }
}

/**
 * Load all psychological assessments from local storage.
 */
export function loadAssessments() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_PSYCH) || '[]');
    } catch {
        return [];
    }
}


// ─── Utility ────────────────────────────────────────────────────────────────

function linearSlope(series) {
    const n = series.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += series[i];
        sumXY += i * series[i];
        sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
}
