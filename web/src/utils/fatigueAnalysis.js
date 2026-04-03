/**
 * Biphasic Fatigue Analysis Module
 *
 * Implements the two-phase fatigue deterioration model from clinical research:
 *   Phase 1 — Protective Adaptation: subtle CoP shifts, slight asymmetry drift,
 *             maintained overall force output. The body's neuromuscular system
 *             compensates by redistributing load.
 *   Phase 2 — Mechanical Failure: sharp asymmetry spikes, force collapse,
 *             loss of motor control. Compensation strategies are exhausted.
 *
 * Also implements Sample Entropy (SampEn) as a fatigue biomarker:
 *   - Rising SampEn indicates loss of motor control precision (increased signal noise)
 *   - SampEn computed over a sliding window of force variability
 *
 * Clinical basis: Gemini deep research synthesis on biphasic fatigue deterioration
 * across Achilles, ACL, and patellofemoral post-operative populations.
 *
 * Patent Reference: Section 6 — Fatigue Analysis and Adaptive Load Management
 */

// ─── Sample Entropy (SampEn) ────────────────────────────────────────────────

/**
 * Calculate Sample Entropy of a time series.
 * SampEn measures the regularity/predictability of a signal.
 * Higher values = more irregular = more fatigued motor control.
 *
 * @param {number[]} series - Time series data (e.g., peak force per stroke)
 * @param {number} m - Template length (default 2)
 * @param {number} r - Tolerance as fraction of series SD (default 0.2)
 * @returns {number} SampEn value (typically 0.0–2.5; higher = more irregular)
 */
export function calcSampleEntropy(series, m = 2, r = 0.2) {
    const n = series.length;
    if (n < m + 2) return 0; // Insufficient data

    // Compute standard deviation
    const mean = series.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    if (sd === 0) return 0; // Constant series

    const tolerance = r * sd;

    // Count template matches for length m and m+1
    let countM = 0;
    let countM1 = 0;

    for (let i = 0; i < n - m; i++) {
        for (let j = i + 1; j < n - m; j++) {
            // Check if templates of length m match within tolerance
            let matchM = true;
            for (let k = 0; k < m; k++) {
                if (Math.abs(series[i + k] - series[j + k]) > tolerance) {
                    matchM = false;
                    break;
                }
            }

            if (matchM) {
                countM++;
                // Also check the (m+1)th element
                if (i + m < n && j + m < n) {
                    if (Math.abs(series[i + m] - series[j + m]) <= tolerance) {
                        countM1++;
                    }
                }
            }
        }
    }

    if (countM === 0 || countM1 === 0) return 0;
    return -Math.log(countM1 / countM);
}


// ─── Biphasic Fatigue Detection ─────────────────────────────────────────────

/**
 * Fatigue phase classifications.
 */
export const FATIGUE_PHASE = {
    BASELINE: 'baseline',           // No significant fatigue detected
    PROTECTIVE: 'protective',       // Phase 1: protective adaptation
    MECHANICAL_FAILURE: 'mechanical_failure', // Phase 2: mechanical failure
};

/**
 * Analyze a session for biphasic fatigue patterns.
 *
 * Phase 1 (Protective Adaptation) indicators:
 *   - CoP begins shifting (injured foot changes loading pattern)
 *   - Slight asymmetry drift (1–5% SI increase from baseline)
 *   - Force output mostly maintained
 *   - SampEn begins rising (subtle loss of motor precision)
 *
 * Phase 2 (Mechanical Failure) indicators:
 *   - Sharp asymmetry spike (>10% SI increase from baseline)
 *   - Force output drops
 *   - SampEn rises significantly (>40% above baseline window)
 *   - CoP shifts become large and erratic
 *
 * @param {Array} strokes - Array of stroke summary objects (chronological)
 * @param {string} injuredSide - 'left' or 'right'
 * @param {Object} [config] - Optional configuration overrides
 * @returns {Object} Fatigue analysis result
 */
export function analyzeBiphasicFatigue(strokes, injuredSide, config = {}) {
    if (!strokes || strokes.length < 6) {
        return {
            phase: FATIGUE_PHASE.BASELINE,
            phaseOnsetStroke: null,
            metrics: null,
            available: false,
        };
    }

    // Configuration (scaled +20% safety margins applied to clinical thresholds)
    const cfg = {
        baselineWindow: config.baselineWindow || 5,         // First N strokes as baseline
        slidingWindow: config.slidingWindow || 5,           // Window for running metrics
        // Phase 1 thresholds (clinical + 20% margin)
        phase1_siDrift: config.phase1_siDrift || 6.0,       // Clinical: 5% → 6% with margin
        phase1_copDrift: config.phase1_copDrift || 0.12,    // Clinical: 0.10 → 0.12
        phase1_sampenRise: config.phase1_sampenRise || 0.24, // Clinical: 0.20 → 0.24
        // Phase 2 thresholds (clinical + 20% margin)
        phase2_siSpike: config.phase2_siSpike || 12.0,      // Clinical: 10% → 12%
        phase2_forceDropPct: config.phase2_forceDropPct || 18, // Clinical: 15% → 18%
        phase2_sampenRise: config.phase2_sampenRise || 0.48, // Clinical: 0.40 → 0.48
        // Minimum strokes in a phase before it's confirmed
        confirmationStrokes: config.confirmationStrokes || 3,
    };

    const n = strokes.length;
    const bw = Math.min(cfg.baselineWindow, Math.floor(n / 3));

    // ─── Compute baseline metrics from first N strokes ──────────────
    const baselineStrokes = strokes.slice(0, bw);
    const baselineSI = mean(baselineStrokes.map(s => Math.abs(s.symmetryIndex)));
    const baselineCoP = mean(baselineStrokes.map(s => Math.abs(s.copAsymmetry)));

    // Baseline force (injured side)
    const baselineForce = mean(baselineStrokes.map(s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    ));

    // Baseline SampEn from force series
    const baselineForceSeries = baselineStrokes.map(s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const baselineSampEn = calcSampleEntropy(baselineForceSeries);

    // ─── Sliding window analysis ────────────────────────────────────
    const windowMetrics = [];
    let phase1OnsetStroke = null;
    let phase2OnsetStroke = null;
    let consecutivePhase1 = 0;
    let consecutivePhase2 = 0;

    for (let i = bw; i <= n; i++) {
        const windowStart = Math.max(0, i - cfg.slidingWindow);
        const window = strokes.slice(windowStart, i);
        if (window.length < 3) continue;

        const windowSI = mean(window.map(s => Math.abs(s.symmetryIndex)));
        const windowCoP = mean(window.map(s => Math.abs(s.copAsymmetry)));
        const windowForce = mean(window.map(s =>
            injuredSide === 'right' ? s.rightPeak : s.leftPeak
        ));
        const windowForceSeries = window.map(s =>
            injuredSide === 'right' ? s.rightPeak : s.leftPeak
        );
        const windowSampEn = calcSampleEntropy(windowForceSeries);

        // Compute deltas from baseline
        const siDrift = windowSI - baselineSI;
        const copDrift = windowCoP - baselineCoP;
        const forceDropPct = baselineForce > 0
            ? ((baselineForce - windowForce) / baselineForce) * 100
            : 0;
        const sampenRise = windowSampEn - baselineSampEn;

        // Classify this window
        const isPhase2 =
            siDrift >= cfg.phase2_siSpike ||
            forceDropPct >= cfg.phase2_forceDropPct ||
            sampenRise >= cfg.phase2_sampenRise;

        const isPhase1 = !isPhase2 && (
            siDrift >= cfg.phase1_siDrift ||
            copDrift >= cfg.phase1_copDrift ||
            sampenRise >= cfg.phase1_sampenRise
        );

        if (isPhase2) {
            consecutivePhase2++;
            consecutivePhase1 = 0;
            if (consecutivePhase2 >= cfg.confirmationStrokes && phase2OnsetStroke === null) {
                phase2OnsetStroke = i - cfg.confirmationStrokes;
            }
        } else if (isPhase1) {
            consecutivePhase1++;
            consecutivePhase2 = 0;
            if (consecutivePhase1 >= cfg.confirmationStrokes && phase1OnsetStroke === null) {
                phase1OnsetStroke = i - cfg.confirmationStrokes;
            }
        } else {
            consecutivePhase1 = 0;
            consecutivePhase2 = 0;
        }

        windowMetrics.push({
            strokeIndex: i - 1,
            siDrift: round2(siDrift),
            copDrift: round3(copDrift),
            forceDropPct: round1(forceDropPct),
            sampEn: round3(windowSampEn),
            sampenRise: round3(sampenRise),
            windowPhase: isPhase2 ? FATIGUE_PHASE.MECHANICAL_FAILURE
                : isPhase1 ? FATIGUE_PHASE.PROTECTIVE
                : FATIGUE_PHASE.BASELINE,
        });
    }

    // ─── Determine overall session phase ────────────────────────────
    let currentPhase = FATIGUE_PHASE.BASELINE;
    let phaseOnsetStroke = null;

    if (phase2OnsetStroke !== null) {
        currentPhase = FATIGUE_PHASE.MECHANICAL_FAILURE;
        phaseOnsetStroke = phase2OnsetStroke;
    } else if (phase1OnsetStroke !== null) {
        currentPhase = FATIGUE_PHASE.PROTECTIVE;
        phaseOnsetStroke = phase1OnsetStroke;
    }

    // ─── Compute session-level fatigue summary ──────────────────────
    const allForces = strokes.map(s =>
        injuredSide === 'right' ? s.rightPeak : s.leftPeak
    );
    const sessionSampEn = calcSampleEntropy(allForces);

    // Distal-to-proximal load shift indicator:
    // In Achilles fatigue, force shifts from toe/ball → heel
    // Compute CoP trend slope (negative = shifting toward heel)
    const copSeries = strokes.map(s => {
        const trace = injuredSide === 'right' ? s.rightCoPTrace : s.leftCoPTrace;
        if (!trace || trace.length === 0) return 0;
        return trace.reduce((a, b) => a + b, 0) / trace.length;
    });
    const copTrend = linearSlope(copSeries);

    return {
        available: true,
        phase: currentPhase,
        phaseOnsetStroke,
        phase1OnsetStroke,
        phase2OnsetStroke,

        baseline: {
            si: round2(baselineSI),
            cop: round3(baselineCoP),
            force: Math.round(baselineForce),
            sampEn: round3(baselineSampEn),
        },

        current: windowMetrics.length > 0 ? windowMetrics[windowMetrics.length - 1] : null,

        session: {
            sampEn: round3(sessionSampEn),
            copTrendSlope: round4(copTrend),
            copTrendDirection: copTrend < -0.005 ? 'proximal_shift' : copTrend > 0.005 ? 'distal_shift' : 'stable',
            totalStrokes: n,
        },

        // Full window-by-window metrics for charting
        windowMetrics,
    };
}


// ─── Fatigue-Specific Alerts ────────────────────────────────────────────────

/**
 * Generate fatigue-specific alerts from biphasic analysis.
 *
 * @param {Object} fatigueResult - Output from analyzeBiphasicFatigue()
 * @param {string} injuryType - 'achilles', 'acl', or 'patellofemoral'
 * @returns {Array} Array of alert objects
 */
export function generateFatigueAlerts(fatigueResult, injuryType) {
    if (!fatigueResult || !fatigueResult.available) return [];

    const alerts = [];
    const current = fatigueResult.current;

    if (fatigueResult.phase === FATIGUE_PHASE.PROTECTIVE) {
        alerts.push({
            type: 'fatigue_phase1',
            severity: 'medium',
            message: getFatiguePhase1Message(injuryType),
            coachingCue: getFatiguePhase1Coaching(injuryType),
            clinicianMessage: `Phase 1 fatigue onset at stroke ${fatigueResult.phase1OnsetStroke}. ` +
                `SI drift: ${current?.siDrift || '?'}%, CoP drift: ${current?.copDrift || '?'}, ` +
                `SampEn Δ: ${current?.sampenRise || '?'}`,
            phase: FATIGUE_PHASE.PROTECTIVE,
            onsetStroke: fatigueResult.phase1OnsetStroke,
        });
    }

    if (fatigueResult.phase === FATIGUE_PHASE.MECHANICAL_FAILURE) {
        alerts.push({
            type: 'fatigue_phase2',
            severity: 'high',
            message: getFatiguePhase2Message(injuryType),
            coachingCue: getFatiguePhase2Coaching(injuryType),
            clinicianMessage: `Phase 2 mechanical failure at stroke ${fatigueResult.phase2OnsetStroke}. ` +
                `Force drop: ${current?.forceDropPct || '?'}%, SI spike: ${current?.siDrift || '?'}%, ` +
                `SampEn Δ: ${current?.sampenRise || '?'}`,
            phase: FATIGUE_PHASE.MECHANICAL_FAILURE,
            onsetStroke: fatigueResult.phase2OnsetStroke,
        });
    }

    // Distal-to-proximal load shift (primarily relevant for Achilles)
    if (fatigueResult.session.copTrendDirection === 'proximal_shift' && injuryType === 'achilles') {
        alerts.push({
            type: 'fatigue_proximal_shift',
            severity: 'medium',
            message: 'Calf fatigue causing load to shift from forefoot to heel',
            coachingCue: 'Your calf is tiring — focus on maintaining push through the ball of your foot',
            clinicianMessage: `Distal-to-proximal CoP shift detected (slope: ${fatigueResult.session.copTrendSlope}). ` +
                `Indicates plantarflexor fatigue with compensatory heel loading.`,
            phase: fatigueResult.phase,
        });
    }

    return alerts;
}


// ─── Injury-Specific Fatigue Messages ───────────────────────────────────────

function getFatiguePhase1Message(injuryType) {
    switch (injuryType) {
        case 'achilles':
            return 'Early calf fatigue detected — your body is starting to compensate. Consider slowing your stroke rate.';
        case 'acl':
            return 'Quadriceps beginning to fatigue — subtle compensation patterns appearing. Monitor your knee loading.';
        case 'patellofemoral':
            return 'Knee loading pattern changing — early fatigue compensation detected. Watch your form.';
        default:
            return 'Early fatigue compensation detected — your movement pattern is beginning to shift.';
    }
}

function getFatiguePhase1Coaching(injuryType) {
    switch (injuryType) {
        case 'achilles':
            return 'Slow your stroke rate and focus on pushing evenly through both feet. Keep pressure on the ball of your foot.';
        case 'acl':
            return 'Focus on driving through your heels evenly. Keep your knees tracking over your toes.';
        case 'patellofemoral':
            return 'Reduce intensity slightly. Focus on smooth, controlled push through both legs equally.';
        default:
            return 'Take it down a notch — focus on even effort between both legs.';
    }
}

function getFatiguePhase2Message(injuryType) {
    switch (injuryType) {
        case 'achilles':
            return 'Calf fatigue is significant — force production failing. Rest recommended to prevent compensation injury.';
        case 'acl':
            return 'Quad fatigue causing mechanical failure — asymmetry now critical. Stop and rest.';
        case 'patellofemoral':
            return 'Knee loading breakdown detected — continuing risks aggravation. Rest interval needed.';
        default:
            return 'Significant fatigue — movement quality has broken down. Rest interval recommended.';
    }
}

function getFatiguePhase2Coaching(injuryType) {
    switch (injuryType) {
        case 'achilles':
            return 'Time to rest. Your calf cannot sustain this effort. Take a 2-minute break and stretch gently.';
        case 'acl':
            return 'Stop and rest now. Your quad is exhausted and your knee is at risk. Take at least 2 minutes.';
        case 'patellofemoral':
            return 'Rest break needed. Your knee is being loaded unevenly and needs a break. Stand and walk briefly.';
        default:
            return 'Take a rest break. Your body is compensating too much to continue safely.';
    }
}


// ─── Utility Functions ──────────────────────────────────────────────────────

function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function linearSlope(series) {
    const n = series.length;
    if (n < 3) return 0;
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

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
function round4(v) { return Math.round(v * 10000) / 10000; }
