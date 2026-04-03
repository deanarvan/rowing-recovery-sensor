/**
 * Real-Time Biofeedback System — v2.0
 *
 * Provides immediate visual and auditory feedback during exercise when
 * compensatory patterns are detected. Integrates with the injury profile
 * system for pattern-specific detection, the exercise engine for
 * context-appropriate alerts, and the biphasic fatigue module.
 *
 * v2.0 additions:
 *   - Coaching mode toggle (patient vs clinician feedback)
 *   - Biphasic fatigue integration
 *   - LSI drift tracking across session
 *   - Pattern suppression with stroke-count-based cooldown
 *   - Dual-message alerts (coachingCue + clinicianDetail)
 *
 * Patent Reference: Section 8 — Real-Time Biofeedback and Dashboard
 */

import { detectCompensatoryPatterns, FEEDBACK_MODE, LSI_FATIGUE_DRIFT_THRESHOLD } from './injuryProfiles.js';
import { analyzeBiphasicFatigue, generateFatigueAlerts } from './fatigueAnalysis.js';

// ─── Alert Types ────────────────────────────────────────────────────────────

export const ALERT_SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
};

export const ALERT_TYPES = {
    COMPENSATORY_PATTERN: 'compensatory_pattern',
    CRS_DROP: 'crs_drop',
    SI_SPIKE: 'si_spike',
    FATIGUE_PHASE1: 'fatigue_phase1',
    FATIGUE_PHASE2: 'fatigue_phase2',
    FATIGUE_PROXIMAL_SHIFT: 'fatigue_proximal_shift',
    LSI_DRIFT: 'lsi_drift',
    PHASE_TRANSITION: 'phase_transition',
    EPIC_HIDDEN_DEFICIT: 'epic_hidden_deficit',
};

// ─── Alert State Manager ────────────────────────────────────────────────────

/**
 * Creates a biofeedback state manager that tracks active alerts,
 * suppresses repeated alerts, manages alert lifecycle, and integrates
 * biphasic fatigue analysis with coaching mode support.
 *
 * @param {Object} [options] - Configuration options
 * @param {string} [options.feedbackMode] - FEEDBACK_MODE.PATIENT or FEEDBACK_MODE.CLINICIAN
 * @param {number} [options.suppressionStrokes] - Strokes to suppress repeated pattern alerts (default 5)
 */
export function createBiofeedbackManager(options = {}) {
    let activeAlerts = [];
    let alertHistory = [];
    let consecutiveSISpikes = 0;
    let lastCRS = null;
    let suppressedPatterns = new Map(); // patternId → stroke number when suppressed
    let allStrokes = []; // Accumulated for biphasic fatigue analysis
    let baselineLSI = null; // First 5 strokes' average LSI for drift detection
    let feedbackMode = options.feedbackMode || FEEDBACK_MODE.CLINICIAN;
    const suppressionStrokes = options.suppressionStrokes || 5;

    return {
        /**
         * Set the feedback mode (patient coaching cues vs clinician data).
         * Can be toggled mid-session.
         */
        setFeedbackMode(mode) {
            feedbackMode = mode;
        },

        getFeedbackMode() {
            return feedbackMode;
        },

        /**
         * Process a new stroke and generate any applicable alerts.
         *
         * @param {Object} stroke - Completed stroke summary
         * @param {Object} config - { profileId, injuredSide, rehabPhase, sessionContext }
         * @returns {Array} Array of new alerts generated
         */
        processStroke(stroke, config) {
            const { profileId, injuredSide, sessionContext } = config;
            const newAlerts = [];

            // Accumulate strokes for biphasic fatigue
            allStrokes.push(stroke);

            // ─── LSI Drift Tracking ─────────────────────────────────
            // Research: healthy adults maintain 0% LSI drift under fatigue.
            // >5% drift = pathological.
            const currentLSI = stroke.leftPeak > 0 && stroke.rightPeak > 0
                ? (Math.min(stroke.leftPeak, stroke.rightPeak) / Math.max(stroke.leftPeak, stroke.rightPeak)) * 100
                : 100;

            if (allStrokes.length <= 5) {
                // Build baseline from first 5 strokes
                if (allStrokes.length === 5) {
                    const lsiValues = allStrokes.map(s => {
                        const min = Math.min(s.leftPeak, s.rightPeak);
                        const max = Math.max(s.leftPeak, s.rightPeak);
                        return max > 0 ? (min / max) * 100 : 100;
                    });
                    baselineLSI = lsiValues.reduce((a, b) => a + b, 0) / lsiValues.length;
                }
            }

            // Compute LSI drift from baseline
            const lsiDrift = baselineLSI != null ? baselineLSI - currentLSI : 0;

            // Augment session context with LSI drift for pattern detection
            const augmentedContext = {
                ...(sessionContext || {}),
                lsiDrift,
                currentLSI,
                baselineLSI,
            };

            // ─── 1. Compensatory Patterns ───────────────────────────
            const patterns = detectCompensatoryPatterns(
                profileId, stroke, injuredSide, augmentedContext, feedbackMode
            );

            for (const pattern of patterns) {
                // Check suppression with stroke-based cooldown
                const suppressedAt = suppressedPatterns.get(pattern.id);
                if (suppressedAt != null && (stroke.strokeNumber - suppressedAt) < suppressionStrokes) {
                    continue;
                }

                newAlerts.push({
                    type: ALERT_TYPES.COMPENSATORY_PATTERN,
                    severity: pattern.severity,
                    patternId: pattern.id,
                    patternName: pattern.name,
                    message: pattern.message,
                    coachingCue: pattern.coachingCue,
                    clinicianDetail: pattern.clinicianDetail,
                    zones: pattern.zones,
                    strokeNumber: stroke.strokeNumber,
                    timestamp: Date.now(),
                });

                // Suppress for N strokes
                suppressedPatterns.set(pattern.id, stroke.strokeNumber);
            }

            // ─── 2. SI Spike Detection ──────────────────────────────
            if (Math.abs(stroke.symmetryIndex) > 45) {
                consecutiveSISpikes++;
                if (consecutiveSISpikes >= 3) {
                    const msg = feedbackMode === FEEDBACK_MODE.PATIENT
                        ? `Your legs have been very uneven for ${consecutiveSISpikes} strokes in a row. Try to push equally with both.`
                        : `Symmetry Index above ±45% for ${consecutiveSISpikes} consecutive strokes`;
                    newAlerts.push({
                        type: ALERT_TYPES.SI_SPIKE,
                        severity: consecutiveSISpikes >= 5 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
                        message: msg,
                        strokeNumber: stroke.strokeNumber,
                        timestamp: Date.now(),
                        value: stroke.symmetryIndex,
                    });
                }
            } else {
                consecutiveSISpikes = 0;
            }

            // ─── 3. CRS Drop Detection ─────────────────────────────
            if (augmentedContext.recoveryScore != null && lastCRS != null) {
                const drop = lastCRS - augmentedContext.recoveryScore;
                if (drop > 15) {
                    const msg = feedbackMode === FEEDBACK_MODE.PATIENT
                        ? `Your recovery score dropped significantly. Consider taking a rest.`
                        : `Recovery Score dropped ${Math.round(drop)} points (${lastCRS} → ${augmentedContext.recoveryScore})`;
                    newAlerts.push({
                        type: ALERT_TYPES.CRS_DROP,
                        severity: drop > 25 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
                        message: msg,
                        strokeNumber: stroke.strokeNumber,
                        timestamp: Date.now(),
                        value: drop,
                    });
                }
            }
            if (augmentedContext.recoveryScore != null) {
                lastCRS = augmentedContext.recoveryScore;
            }

            // ─── 4. Biphasic Fatigue Analysis ───────────────────────
            // Run every 5 strokes to avoid excessive computation
            if (allStrokes.length >= 10 && allStrokes.length % 5 === 0) {
                const fatigueResult = analyzeBiphasicFatigue(allStrokes, injuredSide);
                const fatigueAlerts = generateFatigueAlerts(fatigueResult, profileId);

                for (const fa of fatigueAlerts) {
                    // Check suppression
                    const suppressedAt = suppressedPatterns.get(fa.type);
                    if (suppressedAt != null && (stroke.strokeNumber - suppressedAt) < suppressionStrokes * 2) {
                        continue; // Fatigue alerts suppressed longer
                    }

                    const displayMsg = feedbackMode === FEEDBACK_MODE.PATIENT
                        ? fa.coachingCue
                        : fa.clinicianMessage;

                    newAlerts.push({
                        type: ALERT_TYPES[fa.type.toUpperCase()] || ALERT_TYPES.FATIGUE_PHASE1,
                        severity: fa.severity,
                        message: displayMsg,
                        coachingCue: fa.coachingCue,
                        clinicianDetail: fa.clinicianMessage,
                        zones: ['fatigue'],
                        strokeNumber: stroke.strokeNumber,
                        timestamp: Date.now(),
                        fatiguePhase: fa.phase,
                    });

                    suppressedPatterns.set(fa.type, stroke.strokeNumber);
                }
            }

            // Update active alerts (keep last 10, remove old ones)
            activeAlerts = [...newAlerts, ...activeAlerts].slice(0, 10);
            alertHistory.push(...newAlerts);

            return newAlerts;
        },

        /**
         * Process EPIC analysis results and generate alerts for hidden deficits.
         */
        processEPIC(epicAnalysis) {
            const newAlerts = [];

            if (epicAnalysis?.hiddenDeficit) {
                const msg = feedbackMode === FEEDBACK_MODE.PATIENT
                    ? `Your recovery looks good on the surface, but compared to your baseline, there's still a hidden gap. Keep working on it.`
                    : `Hidden deficit detected: standard LSI passes (${epicAnalysis.peak.standardLSI}%) but EPIC-adjusted LSI fails (${epicAnalysis.peak.epicLSI}%). Healthy limb has declined ${epicAnalysis.peak.bilateralDecline}% from baseline.`;

                newAlerts.push({
                    type: ALERT_TYPES.EPIC_HIDDEN_DEFICIT,
                    severity: ALERT_SEVERITY.HIGH,
                    message: msg,
                    timestamp: Date.now(),
                    data: epicAnalysis,
                });
            }

            activeAlerts = [...newAlerts, ...activeAlerts].slice(0, 10);
            alertHistory.push(...newAlerts);
            return newAlerts;
        },

        /**
         * Get the current biphasic fatigue analysis for the full session.
         */
        getFatigueAnalysis(injuredSide) {
            if (allStrokes.length < 6) return null;
            return analyzeBiphasicFatigue(allStrokes, injuredSide);
        },

        /**
         * Get LSI drift from session baseline.
         */
        getLSIDrift() {
            return {
                baselineLSI,
                currentDrift: baselineLSI != null && allStrokes.length > 5
                    ? (() => {
                        const last5 = allStrokes.slice(-5);
                        const recentLSI = last5.map(s => {
                            const min = Math.min(s.leftPeak, s.rightPeak);
                            const max = Math.max(s.leftPeak, s.rightPeak);
                            return max > 0 ? (min / max) * 100 : 100;
                        });
                        return baselineLSI - (recentLSI.reduce((a, b) => a + b, 0) / recentLSI.length);
                    })()
                    : 0,
                threshold: LSI_FATIGUE_DRIFT_THRESHOLD,
                isPathological: false, // Updated below
            };
        },

        getActiveAlerts() { return activeAlerts; },
        getAlertHistory() { return alertHistory; },
        getStrokeCount() { return allStrokes.length; },

        dismissAlert(index) { activeAlerts.splice(index, 1); },

        clearAlerts() {
            activeAlerts = [];
            alertHistory = [];
            consecutiveSISpikes = 0;
            lastCRS = null;
            suppressedPatterns.clear();
            allStrokes = [];
            baselineLSI = null;
        },

        clearSuppression() {
            suppressedPatterns.clear();
            consecutiveSISpikes = 0;
        },
    };
}


// ─── Audio Feedback ─────────────────────────────────────────────────────────

/**
 * Generate an audio alert tone based on severity.
 * Uses Web Audio API for real-time synthesis.
 */
export function playAlertTone(severity, type = 'pattern') {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        switch (severity) {
            case ALERT_SEVERITY.HIGH:
                osc.frequency.value = 880;
                gain.gain.value = 0.3;
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
                break;

            case ALERT_SEVERITY.MEDIUM:
                osc.frequency.value = 660;
                gain.gain.value = 0.2;
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
                break;

            case ALERT_SEVERITY.LOW:
            default:
                osc.frequency.value = 440;
                gain.gain.value = 0.1;
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
                break;
        }

        setTimeout(() => ctx.close(), 500);
    } catch (e) {
        // Audio not available — silently degrade
    }
}


// ─── Visual Feedback Helpers ────────────────────────────────────────────────

export function getAlertColor(severity) {
    switch (severity) {
        case ALERT_SEVERITY.HIGH: return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' };
        case ALERT_SEVERITY.MEDIUM: return { bg: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24', text: '#fde68a' };
        case ALERT_SEVERITY.LOW: return { bg: 'rgba(56, 189, 248, 0.1)', border: '#38bdf8', text: '#7dd3fc' };
        default: return { bg: 'rgba(100, 116, 139, 0.1)', border: '#64748b', text: '#94a3b8' };
    }
}

export function getAlertIcon(type) {
    switch (type) {
        case ALERT_TYPES.COMPENSATORY_PATTERN: return '\u26A0\uFE0F';
        case ALERT_TYPES.CRS_DROP: return '\uD83D\uDCC9';
        case ALERT_TYPES.SI_SPIKE: return '\u26A1';
        case ALERT_TYPES.FATIGUE_PHASE1: return '\uD83D\uDD0B';
        case ALERT_TYPES.FATIGUE_PHASE2: return '\uD83D\uDEA8';
        case ALERT_TYPES.FATIGUE_PROXIMAL_SHIFT: return '\uD83E\uDDB6';
        case ALERT_TYPES.LSI_DRIFT: return '\uD83D\uDCC8';
        case ALERT_TYPES.PHASE_TRANSITION: return '\uD83C\uDFAF';
        case ALERT_TYPES.EPIC_HIDDEN_DEFICIT: return '\uD83D\uDD0D';
        default: return '\u2139\uFE0F';
    }
}

/**
 * Format an alert for display in the UI.
 * Supports dual-message mode: returns both coaching and clinician text.
 */
export function formatAlert(alert) {
    const colors = getAlertColor(alert.severity);
    const icon = getAlertIcon(alert.type);

    return {
        ...alert,
        colors,
        icon,
        displayText: `${icon} ${alert.message}`,
        shortText: alert.patternName || alert.type.replace(/_/g, ' '),
        age: Date.now() - alert.timestamp,
        // Dual message support for UI toggle
        hasCoachingCue: !!alert.coachingCue,
        hasClinicianDetail: !!alert.clinicianDetail,
    };
}

export function getZoneHighlights(alert) {
    if (!alert.zones) return {};

    const highlights = {};
    for (const zone of alert.zones) {
        switch (zone) {
            case 'impulse': highlights.leftBar = true; highlights.rightBar = true; break;
            case 'cop': highlights.copTrace = true; break;
            case 'heel': highlights.heelZone = true; break;
            case 'toe': highlights.toeZone = true; break;
            case 'shape': highlights.forceCurve = true; break;
            case 'fatigue': highlights.fatigueTrend = true; break;
            case 'temporal': highlights.driveOnset = true; break;
            case 'eccentric': highlights.eccentricPhase = true; break;
            case 'lateral': highlights.mlBalance = true; break;
            case 'rate': highlights.loadingRate = true; break;
        }
    }

    return highlights;
}
