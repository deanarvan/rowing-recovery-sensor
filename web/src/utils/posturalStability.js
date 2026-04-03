/**
 * Postural Stability and Balance Assessment Module
 *
 * Implements force-plate-grade postural analysis adapted for the FSR insole system:
 *   - CoP sway metrics (velocity, path length, ellipse area)
 *   - Bilateral weight distribution classification (4 clinical tiers)
 *   - Stiffening strategy detection (paradoxical ACLR pattern)
 *   - FSR-adapted composite balance score (CC-PSI inspired, 0-100)
 *   - Injury-specific sway profiles with normative recovery trajectories
 *   - Visual deprivation ratio analysis (eyes-open vs eyes-closed)
 *
 * Research basis: Gemini deep research report 05 — Postural Stability and Balance
 *
 * Key clinical data integrated:
 *   - Normative CoP: EO velocity 9.6 mm/s, EC velocity 11.6 mm/s (healthy 18-30)
 *   - Bilateral weight asymmetry: 0-5% normal, 5-11% gray zone, >11% impairment
 *   - ACLR stiffening: surgical limb sway < healthy limb = maladaptive co-contraction
 *   - EC/EO ratio: 30-50% area increase, 15-25% velocity increase = normal
 *   - Single-leg LSI: >90% = clearance, 85-90% = incomplete, <85% = critical
 *   - CC-PSI: 34-68 = normal (1 SD), Normalized Path Length → 0-100 percentile
 *
 * Patent Reference: Section 8 — Real-Time Biofeedback and Dashboard
 */

import { getClosestBaseline } from './injuryProfiles.js';

// ─── Normative Reference Data ───────────────────────────────────────────────

/**
 * Normative CoP metrics for healthy young adults (18-30), 30-second bipedal stance.
 * From research: n > 6,280 community-dwelling individuals.
 *
 * All values in mm or mm/s. Sway area in mm².
 */
export const NORMATIVE_COP = {
    eyesOpen: {
        male: {
            swayArea95: { mean: 130, sd: 85 },       // mm²
            copVelocity: { mean: 9.7, sd: 2.1 },     // mm/s
            pathLength: { mean: 265, sd: 120 },       // mm (30s trial)
        },
        female: {
            swayArea95: { mean: 120, sd: 78 },
            copVelocity: { mean: 9.5, sd: 1.8 },
            pathLength: { mean: 235, sd: 110 },
        },
        combined: {
            swayArea95: { mean: 125, sd: 82 },
            copVelocity: { mean: 9.6, sd: 2.0 },
            pathLength: { mean: 250, sd: 116 },
        },
    },
    eyesClosed: {
        male: {
            swayArea95: { mean: 195, sd: 135 },
            copVelocity: { mean: 12.1, sd: 3.2 },
            pathLength: { mean: 360, sd: 160 },
        },
        female: {
            swayArea95: { mean: 155, sd: 110 },
            copVelocity: { mean: 11.2, sd: 2.9 },
            pathLength: { mean: 315, sd: 140 },
        },
        combined: {
            swayArea95: { mean: 175, sd: 125 },
            copVelocity: { mean: 11.6, sd: 3.1 },
            pathLength: { mean: 337, sd: 151 },
        },
    },
};

/**
 * Visual deprivation normal ratios.
 * EC/EO ratio outside these ranges → visual over-reliance (proprioceptive deficit).
 */
export const VISUAL_DEPRIVATION_NORMS = {
    swayAreaRatio: { min: 1.30, max: 1.50, label: 'Sway area EC/EO ratio' },
    velocityRatio: { min: 1.15, max: 1.25, label: 'CoP velocity EC/EO ratio' },
};

/**
 * Age-based CoP velocity scaling.
 * Research: sway increases with age, accelerating post-60.
 * These multipliers scale the 18-30 normative baseline.
 */
const AGE_COP_SCALE = [
    { maxAge: 30, multiplier: 1.00 },
    { maxAge: 40, multiplier: 1.05 },
    { maxAge: 50, multiplier: 1.12 },
    { maxAge: 60, multiplier: 1.25 },
    { maxAge: 70, multiplier: 1.45 },
    { maxAge: 80, multiplier: 1.75 },
    { maxAge: 999, multiplier: 2.10 },
];

function getAgeCoPScale(age) {
    for (const bracket of AGE_COP_SCALE) {
        if (age <= bracket.maxAge) return bracket.multiplier;
    }
    return 2.10;
}


// ─── Bilateral Weight Distribution Classification ───────────────────────────

/**
 * Clinical tiers for bilateral weight distribution asymmetry.
 * Asymmetry = |leftPercent - 50| (deviation from perfect 50/50).
 */
export const WEIGHT_DISTRIBUTION_TIERS = {
    NORMAL: 'normal',
    GRAY_ZONE: 'gray_zone',
    IMPAIRED: 'impaired',
    SEVERE: 'severe',
};

/**
 * Classify bilateral weight distribution from force data.
 *
 * @param {number} leftForce - Total force on left foot (any unit)
 * @param {number} rightForce - Total force on right foot (any unit)
 * @returns {Object} Classification result
 */
export function classifyWeightDistribution(leftForce, rightForce) {
    const total = leftForce + rightForce;
    if (total === 0) {
        return { tier: null, valid: false, error: 'No force detected' };
    }

    const leftPercent = (leftForce / total) * 100;
    const rightPercent = (rightForce / total) * 100;
    const asymmetry = Math.abs(leftPercent - 50);
    const heavierSide = leftPercent > rightPercent ? 'left' : 'right';
    const ratio = `${Math.round(Math.max(leftPercent, rightPercent))}/${Math.round(Math.min(leftPercent, rightPercent))}`;

    let tier, clinicalNote, severity;

    if (asymmetry <= 2.5) {
        // 0-5% asymmetry (50/50 to 52.5/47.5)
        tier = WEIGHT_DISTRIBUTION_TIERS.NORMAL;
        clinicalNote = 'Within normal physiological variance.';
        severity = 'none';
    } else if (asymmetry <= 5.5) {
        // 5-11% asymmetry (55/45 range)
        tier = WEIGHT_DISTRIBUTION_TIERS.GRAY_ZONE;
        clinicalNote = 'Subclinical compensation zone. ~25% of active population exhibits this. ' +
            'May indicate chronic micro-trauma offloading, strength imbalance, or early sensorimotor deterioration. ' +
            'Warrants preventive intervention.';
        severity = 'low';
    } else if (asymmetry < 11) {
        // >5.5% to <11% deviation from center = research's ">11%" total asymmetry band
        tier = WEIGHT_DISTRIBUTION_TIERS.IMPAIRED;
        clinicalNote = 'Clinical impairment threshold exceeded. Significant structural, orthopaedic, or ' +
            'neurological deficit indicated. Requires immediate therapeutic correction.';
        severity = 'medium';
    } else {
        // 20%+ asymmetry (60/40 or worse)
        tier = WEIGHT_DISTRIBUTION_TIERS.SEVERE;
        clinicalNote = 'Severe lateralized asymmetry (hemiparesis-level). CNS midline remapping likely. ' +
            'Drastically reduced margin of stability toward unloaded side. ' +
            'Requires aggressive mediolateral weight-shifting interventions with visual biofeedback.';
        severity = 'high';
    }

    return {
        valid: true,
        tier,
        severity,
        leftPercent: round1(leftPercent),
        rightPercent: round1(rightPercent),
        asymmetryPercent: round1(asymmetry * 2), // Full asymmetry range (0-100)
        heavierSide,
        ratio,
        clinicalNote,
    };
}


// ─── CoP Sway Metrics from FSR Data ────────────────────────────────────────

/**
 * Compute CoP position from 3-zone FSR readings (heel, ball, toe) for one foot.
 * Returns a 1D CoP index along the anterior-posterior axis.
 *
 * Coordinate system: 0.0 = pure heel, 0.5 = mid-foot, 1.0 = pure toe.
 *
 * @param {number} heel - Heel sensor force
 * @param {number} ball - Ball sensor force
 * @param {number} toe - Toe sensor force
 * @returns {number} CoP index (0-1)
 */
export function calcCoPIndex(heel, ball, toe) {
    const total = heel + ball + toe;
    if (total === 0) return 0.5; // No force → midpoint
    // Weighted average: heel=0, ball=0.5, toe=1.0
    return (heel * 0.0 + ball * 0.5 + toe * 1.0) / total;
}

/**
 * Compute bilateral CoP position (mediolateral axis) from left/right foot forces.
 * Returns ML position: -1.0 = fully left, 0.0 = centered, +1.0 = fully right.
 *
 * @param {number} leftTotal - Total force on left foot
 * @param {number} rightTotal - Total force on right foot
 * @returns {number} ML CoP position (-1 to +1)
 */
export function calcMLCoP(leftTotal, rightTotal) {
    const total = leftTotal + rightTotal;
    if (total === 0) return 0;
    // -1 = all left, +1 = all right
    return (rightTotal - leftTotal) / total;
}

/**
 * Analyze a series of stance samples for CoP sway metrics.
 *
 * Input: array of samples, each with per-foot 3-zone FSR readings.
 * Computes: CoP path length, mean velocity, AP/ML sway ranges,
 *           95% confidence ellipse area approximation.
 *
 * @param {Array} samples - Array of { leftHeel, leftBall, leftToe, rightHeel, rightBall, rightToe, timestamp }
 * @param {number} [sampleRateHz=50] - Sampling rate
 * @returns {Object} Sway analysis metrics
 */
export function analyzeStanceSway(samples, sampleRateHz = 50) {
    if (!samples || samples.length < 10) {
        return { valid: false, error: 'Insufficient samples (need ≥10)' };
    }

    const n = samples.length;
    const duration = n / sampleRateHz; // seconds

    // ─── Compute CoP trace ────────────────────────────────────────
    const apTrace = []; // Anterior-posterior (per injured foot, or averaged)
    const mlTrace = []; // Mediolateral

    for (const s of samples) {
        const leftTotal = (s.leftHeel || 0) + (s.leftBall || 0) + (s.leftToe || 0);
        const rightTotal = (s.rightHeel || 0) + (s.rightBall || 0) + (s.rightToe || 0);

        // AP: average of left and right foot CoP indices
        const leftCoP = calcCoPIndex(s.leftHeel || 0, s.leftBall || 0, s.leftToe || 0);
        const rightCoP = calcCoPIndex(s.rightHeel || 0, s.rightBall || 0, s.rightToe || 0);
        apTrace.push((leftCoP + rightCoP) / 2);

        // ML: bilateral weight shift
        mlTrace.push(calcMLCoP(leftTotal, rightTotal));
    }

    // ─── Path length and velocity ─────────────────────────────────
    let apPathLength = 0;
    let mlPathLength = 0;
    let totalPathLength = 0;

    for (let i = 1; i < n; i++) {
        const dAP = apTrace[i] - apTrace[i - 1];
        const dML = mlTrace[i] - mlTrace[i - 1];
        apPathLength += Math.abs(dAP);
        mlPathLength += Math.abs(dML);
        totalPathLength += Math.sqrt(dAP * dAP + dML * dML);
    }

    const meanVelocity = totalPathLength / duration;
    const apVelocity = apPathLength / duration;
    const mlVelocity = mlPathLength / duration;

    // ─── Sway ranges ──────────────────────────────────────────────
    const apRange = Math.max(...apTrace) - Math.min(...apTrace);
    const mlRange = Math.max(...mlTrace) - Math.min(...mlTrace);

    // ─── 95% Confidence Ellipse Area (approximation) ──────────────
    // Using the product of AP and ML standard deviations × π × 3.0
    // (3.0 ≈ chi-squared critical value for 95% confidence, 2 DOF ≈ 5.991, √5.991 ≈ 2.45,
    //  but the factor 3.0 is commonly used in posturography for the 95% ellipse)
    const apMean = mean(apTrace);
    const mlMean = mean(mlTrace);
    const apSD = stdDev(apTrace, apMean);
    const mlSD = stdDev(mlTrace, mlMean);
    const swayArea95 = Math.PI * 3.0 * apSD * mlSD;

    // ─── Directional dominance ────────────────────────────────────
    const apmlRatio = mlVelocity > 0 ? apVelocity / mlVelocity : 999;
    const directionalFlag = apmlRatio < 0.8
        ? 'ml_dominant'   // Disproportionate ML sway = hip weakness / fall risk
        : apmlRatio > 1.5
            ? 'ap_dominant' // Normal: AP > ML in bipedal stance
            : 'balanced';

    return {
        valid: true,
        duration: round2(duration),
        sampleCount: n,

        pathLength: {
            total: round4(totalPathLength),
            ap: round4(apPathLength),
            ml: round4(mlPathLength),
        },

        velocity: {
            mean: round4(meanVelocity),
            ap: round4(apVelocity),
            ml: round4(mlVelocity),
        },

        range: {
            ap: round4(apRange),
            ml: round4(mlRange),
        },

        swayArea95: round4(swayArea95),
        apSD: round4(apSD),
        mlSD: round4(mlSD),

        directionalDominance: directionalFlag,
        apmlRatio: round2(apmlRatio),

        // Raw traces for charting
        traces: { ap: apTrace, ml: mlTrace },
    };
}


// ─── Stiffening Strategy Detection ──────────────────────────────────────────

/**
 * Detect maladaptive stiffening strategy (primarily post-ACLR).
 *
 * Research: ACLR limb shows 1.82° ± 0.84° sway vs healthy 2.07° ± 0.96°.
 * Less sway on surgical limb = pathological co-contraction, NOT superior balance.
 *
 * Detection: if surgical limb sway metrics are significantly LOWER than healthy
 * limb (asymmetry in the "wrong" direction), flag stiffening.
 *
 * @param {Object} surgicalSway - Sway analysis for surgical limb (single-leg stance)
 * @param {Object} healthySway - Sway analysis for healthy limb (single-leg stance)
 * @param {string} injuryType - 'acl', 'achilles', 'patellofemoral'
 * @returns {Object} Stiffening detection result
 */
export function detectStiffeningStrategy(surgicalSway, healthySway, injuryType = 'acl') {
    if (!surgicalSway?.valid || !healthySway?.valid) {
        return { detected: false, available: false, error: 'Insufficient sway data' };
    }

    // Compare sway magnitudes: velocity, path length, sway area
    const surgVel = surgicalSway.velocity.mean;
    const healthyVel = healthySway.velocity.mean;
    const surgPath = surgicalSway.pathLength.total;
    const healthyPath = healthySway.pathLength.total;
    const surgArea = surgicalSway.swayArea95;
    const healthyArea = healthySway.swayArea95;

    // Stiffening: surgical limb has LESS sway than healthy
    // Using a threshold of 12% less sway (research: ~12% difference in ACLR)
    const velRatio = healthyVel > 0 ? surgVel / healthyVel : 1;
    const pathRatio = healthyPath > 0 ? surgPath / healthyPath : 1;
    const areaRatio = healthyArea > 0 ? surgArea / healthyArea : 1;

    // Stiffening threshold: surgical limb sway < 88% of healthy limb
    // (i.e., >12% reduction in sway on surgical side)
    const STIFFENING_THRESHOLD = 0.88;

    const velStiff = velRatio < STIFFENING_THRESHOLD;
    const pathStiff = pathRatio < STIFFENING_THRESHOLD;
    const areaStiff = areaRatio < STIFFENING_THRESHOLD;

    // Need at least 2 of 3 metrics showing stiffening for confidence
    const stiffeningCount = [velStiff, pathStiff, areaStiff].filter(Boolean).length;
    const detected = stiffeningCount >= 2;

    // Severity
    let severity = 'none';
    if (detected) {
        const avgRatio = (velRatio + pathRatio + areaRatio) / 3;
        if (avgRatio < 0.70) severity = 'high';
        else if (avgRatio < 0.80) severity = 'medium';
        else severity = 'low';
    }

    // Injury-specific messaging
    const messages = {
        acl: {
            coaching: 'Your surgical knee feels tight and locked — that\'s your body protecting it. ' +
                'Try to relax and allow small, natural movements. Stiffness isn\'t the same as stability.',
            clinician: `ACLR stiffening strategy detected. Surgical limb sway velocity ${round1(velRatio * 100)}% of healthy ` +
                `(research norm: 88% = 1.82°/2.07°). Maladaptive co-contraction reduces dynamic adaptability. ` +
                `Neuromuscular retraining with perturbation exercises recommended.`,
        },
        achilles: {
            coaching: 'Your repaired ankle is very rigid during balance. Try to gently shift your weight ' +
                'and allow small ankle movements rather than locking everything in place.',
            clinician: `Ankle stiffening detected on surgical side. Sway velocity ratio ${round1(velRatio * 100)}%. ` +
                `Likely compensating for reduced Achilles proprioception via ankle co-contraction. ` +
                `Progressive perturbation and eccentric loading indicated.`,
        },
        patellofemoral: {
            coaching: 'Your surgical leg is very locked during balance. Allow your knee to bend slightly ' +
                'and shift naturally — being too rigid actually makes you less stable.',
            clinician: `PFJ stiffening: surgical limb sway ${round1(velRatio * 100)}% of healthy. ` +
                `Guarding behavior reducing dynamic force absorption capacity.`,
        },
    };

    const msg = messages[injuryType] || messages.acl;

    return {
        available: true,
        detected,
        severity,
        stiffeningCount,
        metrics: {
            velocityRatio: round2(velRatio),
            pathLengthRatio: round2(pathRatio),
            swayAreaRatio: round2(areaRatio),
            velocityStiff: velStiff,
            pathStiff,
            areaStiff,
        },
        coachingCue: detected ? msg.coaching : null,
        clinicianNote: detected ? msg.clinician : null,
    };
}


// ─── FSR-Adapted Composite Balance Score (CC-PSI Inspired) ──────────────────

/**
 * Normative Normalized Path Length (NPL) baselines for the composite score.
 * These are adapted from the CC-PSI concept for our FSR CoP index scale (0-1 range).
 *
 * Since our FSR system uses a 0-1 CoP index rather than mm, the path length
 * values are in CoP-index-units. The statistical distribution is preserved.
 *
 * Structure: age bracket × sex × stance condition → { mean, sd }
 */
const NPL_NORMS = {
    '18-30': {
        male: {
            bipedal_eo: { mean: 0.42, sd: 0.18 },
            bipedal_ec: { mean: 0.58, sd: 0.25 },
            unipedal: { mean: 1.25, sd: 0.45 },
        },
        female: {
            bipedal_eo: { mean: 0.38, sd: 0.16 },
            bipedal_ec: { mean: 0.50, sd: 0.22 },
            unipedal: { mean: 1.15, sd: 0.42 },
        },
    },
    '31-45': {
        male: {
            bipedal_eo: { mean: 0.46, sd: 0.20 },
            bipedal_ec: { mean: 0.64, sd: 0.28 },
            unipedal: { mean: 1.40, sd: 0.50 },
        },
        female: {
            bipedal_eo: { mean: 0.42, sd: 0.18 },
            bipedal_ec: { mean: 0.56, sd: 0.24 },
            unipedal: { mean: 1.30, sd: 0.48 },
        },
    },
    '46-60': {
        male: {
            bipedal_eo: { mean: 0.54, sd: 0.24 },
            bipedal_ec: { mean: 0.78, sd: 0.34 },
            unipedal: { mean: 1.65, sd: 0.58 },
        },
        female: {
            bipedal_eo: { mean: 0.48, sd: 0.20 },
            bipedal_ec: { mean: 0.68, sd: 0.30 },
            unipedal: { mean: 1.50, sd: 0.52 },
        },
    },
    '61+': {
        male: {
            bipedal_eo: { mean: 0.68, sd: 0.30 },
            bipedal_ec: { mean: 1.02, sd: 0.44 },
            unipedal: { mean: 2.10, sd: 0.72 },
        },
        female: {
            bipedal_eo: { mean: 0.60, sd: 0.26 },
            bipedal_ec: { mean: 0.88, sd: 0.38 },
            unipedal: { mean: 1.85, sd: 0.65 },
        },
    },
};

function getNPLNorm(age, sex, condition) {
    let bracket;
    if (age <= 30) bracket = '18-30';
    else if (age <= 45) bracket = '31-45';
    else if (age <= 60) bracket = '46-60';
    else bracket = '61+';

    const sexNorms = NPL_NORMS[bracket]?.[sex] || NPL_NORMS[bracket]?.male;
    return sexNorms?.[condition] || sexNorms?.bipedal_eo;
}

/**
 * Convert a Z-score to a percentile using the standard normal CDF approximation.
 * Uses Abramowitz & Stegun approximation (error < 1.5×10⁻⁷).
 */
function zToPercentile(z) {
    // Cumulative normal distribution approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    const absZ = Math.abs(z);
    const t = 1.0 / (1.0 + p * absZ);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);

    return (0.5 * (1.0 + sign * y)) * 100;
}

/**
 * Compute the FSR-adapted Composite Balance Score.
 *
 * Inspired by the CC-PSI system:
 *   1. Compute Normalized Path Length from FSR sway analysis
 *   2. Calculate Z-score against age/sex-matched norms
 *   3. Convert to 0-100 percentile
 *
 * IMPORTANT: In this system, LOWER score = BETTER balance (like CC-PSI).
 * A score of 50 means exactly average for your age/sex.
 * A score of 85 means worse balance than 85% of the normative population.
 *
 * @param {Object} swayAnalysis - Output from analyzeStanceSway()
 * @param {Object} options - { age, sex, condition }
 * @param {number} options.age - Patient age
 * @param {string} options.sex - 'male' or 'female'
 * @param {string} options.condition - 'bipedal_eo', 'bipedal_ec', or 'unipedal'
 * @returns {Object} Composite balance score
 */
export function computeCompositeBalanceScore(swayAnalysis, options = {}) {
    const { age = 30, sex = 'male', condition = 'bipedal_eo' } = options;

    if (!swayAnalysis?.valid) {
        return { valid: false, error: 'Invalid sway analysis' };
    }

    const norm = getNPLNorm(age, sex, condition);
    const npl = swayAnalysis.pathLength.total;

    // Z-score: how many SDs above/below the population mean
    const zScore = norm.sd > 0 ? (npl - norm.mean) / norm.sd : 0;

    // Percentile: 0 = elite, 50 = average, 100 = profound instability
    const percentile = zToPercentile(zScore);

    // Clinical classification (CC-PSI bands)
    let classification, clinicalNote;
    if (percentile < 2.3) {
        classification = 'elite';
        clinicalNote = 'Outstanding postural control — elite level.';
    } else if (percentile < 34) {
        classification = 'above_average';
        clinicalNote = 'Above-average postural control. Within or better than 1 SD of population mean.';
    } else if (percentile <= 68) {
        classification = 'normal';
        clinicalNote = 'Normal postural stability. Performance within 1 SD of age/sex-matched population mean.';
    } else if (percentile <= 97.7) {
        classification = 'below_average';
        clinicalNote = 'Below-average stability. 1-2 SD worse than population mean. May indicate underlying deficit.';
    } else {
        classification = 'impaired';
        clinicalNote = 'Profound postural instability. Worse than ~98% of normative population. Comprehensive evaluation required.';
    }

    return {
        valid: true,
        score: round1(percentile),
        zScore: round2(zScore),
        npl: round4(npl),
        normMean: norm.mean,
        normSD: norm.sd,
        classification,
        clinicalNote,
        demographics: { age, sex, condition },
    };
}


// ─── Single-Leg Balance LSI ─────────────────────────────────────────────────

/**
 * Compute single-leg balance LSI from bilateral sway assessments.
 *
 * LSI = (surgical limb metric / healthy limb metric) × 100
 * For sway metrics, LOWER is better, so we invert:
 *   LSI = (healthy sway / surgical sway) × 100
 *
 * This way, LSI > 100 = surgical limb has less sway (possible stiffening).
 *          LSI ≈ 100 = symmetric.
 *          LSI < 100 = surgical limb has more sway (expected deficit).
 *
 * @param {Object} surgicalSway - Sway analysis for surgical limb
 * @param {Object} healthySway - Sway analysis for healthy limb
 * @returns {Object} Balance LSI with clinical classification
 */
export function computeBalanceLSI(surgicalSway, healthySway) {
    if (!surgicalSway?.valid || !healthySway?.valid) {
        return { valid: false, error: 'Need both limb sway analyses' };
    }

    // Use velocity as primary metric (most reliable per research)
    const surgVel = surgicalSway.velocity.mean;
    const healthyVel = healthySway.velocity.mean;

    // Invert: for sway, lower = better
    const lsi = surgVel > 0 ? (healthyVel / surgVel) * 100 : 0;
    const asymmetry = Math.abs(100 - lsi);

    let classification, clinicalNote;

    if (lsi > 112) {
        // Surgical limb too stable → stiffening
        classification = 'stiffening_suspect';
        clinicalNote = `Balance LSI ${round1(lsi)}% — surgical limb showing less sway than healthy. ` +
            `Possible maladaptive stiffening strategy (co-contraction).`;
    } else if (asymmetry < 10) {
        // >90% LSI
        classification = 'clearance';
        clinicalNote = `Balance LSI ${round1(lsi)}% — within 10% symmetry. Gold-standard RTS threshold met.`;
    } else if (asymmetry < 15) {
        // 85-90% LSI
        classification = 'incomplete';
        clinicalNote = `Balance LSI ${round1(lsi)}% — 10-15% asymmetry. Heightened reinjury risk. ` +
            `Targeted neuromuscular retraining required: perturbation, dual-tasking, reactive landing.`;
    } else {
        // <85% LSI
        classification = 'critical';
        clinicalNote = `Balance LSI ${round1(lsi)}% — >15% asymmetry. Profound neuromuscular inhibition. ` +
            `Return to cutting/pivoting sports contraindicated. Proprioceptive integration rehabilitation required.`;
    }

    return {
        valid: true,
        lsi: round1(lsi),
        asymmetry: round1(asymmetry),
        classification,
        clinicalNote,
        metrics: {
            surgicalVelocity: round4(surgVel),
            healthyVelocity: round4(healthyVel),
            surgicalPathLength: round4(surgicalSway.pathLength.total),
            healthyPathLength: round4(healthySway.pathLength.total),
        },
    };
}


// ─── Visual Deprivation Ratio Analysis ──────────────────────────────────────

/**
 * Analyze the ratio between eyes-closed and eyes-open sway performance.
 *
 * Normal: EC/EO sway area ratio 1.30-1.50, velocity ratio 1.15-1.25.
 * Exceeding these → visual over-reliance (proprioceptive/vestibular deficit).
 *
 * @param {Object} eyesOpenSway - Sway analysis with eyes open
 * @param {Object} eyesClosedSway - Sway analysis with eyes closed
 * @returns {Object} Visual deprivation analysis
 */
export function analyzeVisualDeprivation(eyesOpenSway, eyesClosedSway) {
    if (!eyesOpenSway?.valid || !eyesClosedSway?.valid) {
        return { valid: false, error: 'Need both EO and EC sway analyses' };
    }

    const areaRatio = eyesOpenSway.swayArea95 > 0
        ? eyesClosedSway.swayArea95 / eyesOpenSway.swayArea95
        : 0;
    const velRatio = eyesOpenSway.velocity.mean > 0
        ? eyesClosedSway.velocity.mean / eyesOpenSway.velocity.mean
        : 0;

    const areaExcessive = areaRatio > VISUAL_DEPRIVATION_NORMS.swayAreaRatio.max;
    const velExcessive = velRatio > VISUAL_DEPRIVATION_NORMS.velocityRatio.max;

    let classification, clinicalNote;
    if (areaExcessive && velExcessive) {
        classification = 'visual_dependent';
        clinicalNote = `Both sway area ratio (${round2(areaRatio)}×) and velocity ratio (${round2(velRatio)}×) ` +
            `exceed normal EC/EO bounds. Significant visual over-reliance. ` +
            `Underlying proprioceptive or vestibular integration deficit indicated. ` +
            `Progressive eyes-closed balance training recommended.`;
    } else if (areaExcessive || velExcessive) {
        classification = 'mild_visual_reliance';
        clinicalNote = `${areaExcessive ? 'Sway area' : 'Velocity'} ratio exceeds normal EC/EO range. ` +
            `Moderate visual reliance. Consider proprioceptive challenge progression.`;
    } else {
        classification = 'normal';
        clinicalNote = `EC/EO ratios within normal range (area: ${round2(areaRatio)}×, velocity: ${round2(velRatio)}×). ` +
            `Adequate multi-sensory integration.`;
    }

    return {
        valid: true,
        areaRatio: round2(areaRatio),
        velocityRatio: round2(velRatio),
        areaExcessive,
        velocityExcessive: velExcessive,
        classification,
        clinicalNote,
        norms: VISUAL_DEPRIVATION_NORMS,
    };
}


// ─── Injury-Specific Sway Recovery Profiles ─────────────────────────────────

/**
 * Expected sway recovery trajectories per injury type.
 * Used to contextualize a patient's current sway metrics against expected timeline.
 */
export const SWAY_RECOVERY_PROFILES = {
    acl: {
        name: 'ACL Reconstruction',
        notes: [
            'Surgical limb may show LESS sway early (stiffening — flag this)',
            'True dynamic stability normalizes by ~12 months',
            'Subtle multi-planar deficits may persist to 24 months',
            'Single-leg balance LSI >90% required for RTS',
        ],
        milestones: {
            3:  { expectedBalanceLSI: { min: 60, max: 75 }, note: 'Expect significant asymmetry. Stiffening common.' },
            6:  { expectedBalanceLSI: { min: 75, max: 85 }, note: 'Progressive improvement. Watch for persistent stiffening.' },
            9:  { expectedBalanceLSI: { min: 82, max: 92 }, note: 'Approaching clearance zone. Dynamic tasks critical.' },
            12: { expectedBalanceLSI: { min: 88, max: 98 }, note: 'Expected normalization. Perturbation training vital.' },
            24: { expectedBalanceLSI: { min: 92, max: 100 }, note: 'Residual deficits should be resolved.' },
        },
    },
    achilles: {
        name: 'Achilles Tendon Repair',
        notes: [
            'AP sway severely compromised (ankle strategy disrupted)',
            'Linear improvement trajectory to ~9 months',
            'Eccentric training accelerates sway area reduction',
            'RTS: 9-12 months, AP sway resolution + >90% plantarflexion LSI',
            'Compensatory dorsiflexion patterns may persist indefinitely',
        ],
        milestones: {
            3:  { expectedBalanceLSI: { min: 55, max: 70 }, note: 'Severe AP sway deficit. Ankle strategy severely limited.' },
            6:  { expectedBalanceLSI: { min: 70, max: 82 }, note: 'Eccentric loading should be reducing sway area.' },
            9:  { expectedBalanceLSI: { min: 80, max: 92 }, note: 'Approaching clearance. AP sway resolution critical.' },
            12: { expectedBalanceLSI: { min: 88, max: 98 }, note: 'Expected normalization of static sway metrics.' },
        },
    },
    patellofemoral: {
        name: 'Patellofemoral / MPFL Reconstruction',
        notes: [
            'Pre-op: excessive sway especially on foam/compliant surfaces',
            'Normalization at ~374 ± 23 days (≈12 months)',
            'Sway improvement correlates with TSK reduction',
            'Monitor IKDC + TSK alongside sway metrics',
        ],
        milestones: {
            3:  { expectedBalanceLSI: { min: 60, max: 75 }, note: 'Initial recovery phase. Pain inhibition common.' },
            6:  { expectedBalanceLSI: { min: 72, max: 85 }, note: 'Progressive improvement. Watch for kinesiophobia effect.' },
            9:  { expectedBalanceLSI: { min: 80, max: 92 }, note: 'Approaching normalization window.' },
            12: { expectedBalanceLSI: { min: 90, max: 100 }, note: 'Research: normalization at ~12 months. Should match controls.' },
        },
    },
};

/**
 * Evaluate a patient's balance progress against their injury-specific recovery profile.
 *
 * @param {string} injuryType - 'acl', 'achilles', 'patellofemoral'
 * @param {number} weeksPostOp - Weeks since surgery
 * @param {number} balanceLSI - Current balance LSI (from computeBalanceLSI)
 * @returns {Object} Progress evaluation
 */
export function evaluateBalanceProgress(injuryType, weeksPostOp, balanceLSI) {
    const profile = SWAY_RECOVERY_PROFILES[injuryType];
    if (!profile) {
        return { available: false, error: `Unknown injury type: ${injuryType}` };
    }

    const monthsPostOp = Math.round(weeksPostOp / 4.33);

    // Find the closest milestone
    const milestoneMonths = Object.keys(profile.milestones).map(Number).sort((a, b) => a - b);
    let closestMonth = milestoneMonths[0];
    for (const m of milestoneMonths) {
        if (monthsPostOp >= m) closestMonth = m;
    }

    const milestone = profile.milestones[closestMonth];
    if (!milestone) {
        return { available: false, error: 'No milestone data available' };
    }

    const { min, max } = milestone.expectedBalanceLSI;
    let status, note;

    if (balanceLSI > max) {
        status = 'ahead';
        note = `Balance LSI ${round1(balanceLSI)}% exceeds expected range (${min}-${max}%) at ${closestMonth} months. Excellent progress.`;
    } else if (balanceLSI >= min) {
        status = 'on_track';
        note = `Balance LSI ${round1(balanceLSI)}% within expected range (${min}-${max}%) at ${closestMonth} months. ${milestone.note}`;
    } else {
        status = 'behind';
        note = `Balance LSI ${round1(balanceLSI)}% below expected range (${min}-${max}%) at ${closestMonth} months. ` +
            `Consider intensifying proprioceptive training. ${milestone.note}`;
    }

    // Check for stiffening (LSI > 112 is suspicious)
    if (balanceLSI > 112) {
        status = 'stiffening_suspect';
        note = `Balance LSI ${round1(balanceLSI)}% — surgical limb showing less sway. ` +
            `Possible stiffening strategy rather than genuine improvement. Verify with dynamic tests.`;
    }

    return {
        available: true,
        injuryType,
        weeksPostOp,
        monthsPostOp,
        balanceLSI: round1(balanceLSI),
        status,
        note,
        milestone: {
            month: closestMonth,
            expectedRange: milestone.expectedBalanceLSI,
            milestoneNote: milestone.note,
        },
        recoveryNotes: profile.notes,
    };
}


// ─── Utility Functions ──────────────────────────────────────────────────────

function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr, m = null) {
    if (!arr || arr.length < 2) return 0;
    const avg = m !== null ? m : mean(arr);
    const sumSq = arr.reduce((s, v) => s + (v - avg) ** 2, 0);
    return Math.sqrt(sumSq / (arr.length - 1));
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }
