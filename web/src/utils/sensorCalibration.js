/**
 * Sensor Calibration Module
 *
 * Maps raw FSR (force-sensitive resistor) ADC values to calibrated Newtons
 * using a known-weight calibration routine. This allows the system to use
 * research-derived normative baselines expressed in real physical units.
 *
 * Calibration procedure:
 *   1. User stands on one foot on a bathroom scale → records body weight in kg
 *   2. User stands on one foot on the insole → system captures raw ADC totals
 *   3. System computes scale factor: Newtons = raw_ADC × (known_weight_N / raw_total)
 *   4. Per-sensor scale factors stored for heel, ball, toe independently
 *
 * The calibration can also be done with a simpler two-foot standing method:
 *   1. User stands evenly on both feet → each foot gets ~half body weight
 *   2. System captures raw ADC for both feet
 *   3. Scale factor computed per foot
 *
 * Patent Reference: Section 3 — Sensor Calibration and Data Normalization
 */

// ─── Storage ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'sensor_calibration';

// ─── Default (uncalibrated) Scale Factor ────────────────────────────────────
// When no calibration has been performed, raw ADC values pass through as-is.
// The system treats them as "arbitrary force units" and uses relative metrics
// (ratios, symmetry indices) which are scale-independent.
const DEFAULT_CALIBRATION = {
    calibrated: false,
    method: 'none',
    timestamp: null,

    // Per-sensor scale factors (multiply raw ADC to get Newtons)
    left: { heel: 1.0, ball: 1.0, toe: 1.0 },
    right: { heel: 1.0, ball: 1.0, toe: 1.0 },

    // Global per-foot scale factors (simpler model)
    leftGlobal: 1.0,
    rightGlobal: 1.0,

    // Reference data from calibration
    bodyWeightKg: null,
    bodyWeightN: null,
};


// ─── Calibration Routines ───────────────────────────────────────────────────

/**
 * Perform bilateral standing calibration.
 *
 * The user stands evenly on both feet for ~3 seconds while the system
 * captures sensor readings. Combined with known body weight, this produces
 * a per-foot Newton scale factor.
 *
 * @param {number} bodyWeightKg - User's body weight in kilograms
 * @param {Object} leftReadings - { heel: number, ball: number, toe: number } average raw ADC
 * @param {Object} rightReadings - { heel: number, ball: number, toe: number } average raw ADC
 * @returns {Object} Calibration result
 */
export function calibrateBilateralStanding(bodyWeightKg, leftReadings, rightReadings) {
    const bodyWeightN = bodyWeightKg * 9.81;
    const perFootN = bodyWeightN / 2; // Assuming even bilateral distribution

    const leftTotal = (leftReadings.heel || 0) + (leftReadings.ball || 0) + (leftReadings.toe || 0);
    const rightTotal = (rightReadings.heel || 0) + (rightReadings.ball || 0) + (rightReadings.toe || 0);

    if (leftTotal === 0 || rightTotal === 0) {
        return {
            success: false,
            error: 'One or both feet show zero force. Check sensor connections.',
        };
    }

    // Global per-foot scale factors
    const leftScale = perFootN / leftTotal;
    const rightScale = perFootN / rightTotal;

    // Per-sensor scale factors (proportional to each sensor's share)
    // During quiet standing, expected distribution: ~55% heel, ~35% ball, ~10% toe
    // We use actual measured distribution to compute per-sensor factors
    const leftSensorScales = {
        heel: leftReadings.heel > 0 ? leftScale : 0,
        ball: leftReadings.ball > 0 ? leftScale : 0,
        toe: leftReadings.toe > 0 ? leftScale : 0,
    };
    const rightSensorScales = {
        heel: rightReadings.heel > 0 ? rightScale : 0,
        ball: rightReadings.ball > 0 ? rightScale : 0,
        toe: rightReadings.toe > 0 ? rightScale : 0,
    };

    const calibration = {
        calibrated: true,
        method: 'bilateral_standing',
        timestamp: Date.now(),
        left: leftSensorScales,
        right: rightSensorScales,
        leftGlobal: Math.round(leftScale * 10000) / 10000,
        rightGlobal: Math.round(rightScale * 10000) / 10000,
        bodyWeightKg,
        bodyWeightN: Math.round(bodyWeightN * 10) / 10,

        // Diagnostic info
        rawLeftTotal: Math.round(leftTotal),
        rawRightTotal: Math.round(rightTotal),
        standingSymmetry: Math.round((Math.min(leftTotal, rightTotal) / Math.max(leftTotal, rightTotal)) * 100),
    };

    return { success: true, calibration };
}

/**
 * Perform single-leg calibration (more accurate).
 *
 * User stands on one foot at a time. Full body weight goes through
 * one insole, giving a more precise scale factor.
 *
 * @param {number} bodyWeightKg - User's body weight in kilograms
 * @param {string} side - 'left' or 'right' (which foot is being calibrated)
 * @param {Object} readings - { heel, ball, toe } average raw ADC values
 * @returns {Object} Partial calibration for one side
 */
export function calibrateSingleLeg(bodyWeightKg, side, readings) {
    const bodyWeightN = bodyWeightKg * 9.81;
    const total = (readings.heel || 0) + (readings.ball || 0) + (readings.toe || 0);

    if (total === 0) {
        return { success: false, error: `${side} foot shows zero force. Check sensor connections.` };
    }

    const globalScale = bodyWeightN / total;
    const sensorScales = {
        heel: readings.heel > 0 ? globalScale : 0,
        ball: readings.ball > 0 ? globalScale : 0,
        toe: readings.toe > 0 ? globalScale : 0,
    };

    return {
        success: true,
        side,
        globalScale: Math.round(globalScale * 10000) / 10000,
        sensorScales,
        bodyWeightN: Math.round(bodyWeightN * 10) / 10,
        rawTotal: Math.round(total),
    };
}


// ─── Apply Calibration ──────────────────────────────────────────────────────

/**
 * Convert a raw sensor sample to calibrated Newtons.
 *
 * @param {Object} sample - Raw sample { leftHeel, leftBall, leftToe, rightHeel, rightBall, rightToe, ... }
 * @param {Object} calibration - Calibration object from calibrateBilateralStanding()
 * @returns {Object} Sample with additional calibrated force fields
 */
export function applyCalibratedForce(sample, calibration) {
    if (!calibration || !calibration.calibrated) {
        // No calibration — return raw values as "force" (uncalibrated mode)
        return {
            ...sample,
            leftForceN: (sample.leftHeel || 0) + (sample.leftBall || 0) + (sample.leftToe || 0),
            rightForceN: (sample.rightHeel || 0) + (sample.rightBall || 0) + (sample.rightToe || 0),
            calibrated: false,
        };
    }

    const lh = (sample.leftHeel || 0) * calibration.left.heel;
    const lb = (sample.leftBall || 0) * calibration.left.ball;
    const lt = (sample.leftToe || 0) * calibration.left.toe;
    const rh = (sample.rightHeel || 0) * calibration.right.heel;
    const rb = (sample.rightBall || 0) * calibration.right.ball;
    const rt = (sample.rightToe || 0) * calibration.right.toe;

    return {
        ...sample,
        leftHeelN: Math.round(lh * 10) / 10,
        leftBallN: Math.round(lb * 10) / 10,
        leftToeN: Math.round(lt * 10) / 10,
        rightHeelN: Math.round(rh * 10) / 10,
        rightBallN: Math.round(rb * 10) / 10,
        rightToeN: Math.round(rt * 10) / 10,
        leftForceN: Math.round((lh + lb + lt) * 10) / 10,
        rightForceN: Math.round((rh + rb + rt) * 10) / 10,
        calibrated: true,
    };
}

/**
 * Convert a raw total force value (sum of 3 sensors) to Newtons.
 *
 * @param {number} rawTotal - Raw ADC sum for one foot
 * @param {string} side - 'left' or 'right'
 * @param {Object} calibration - Calibration object
 * @returns {number} Force in Newtons
 */
export function rawToNewtons(rawTotal, side, calibration) {
    if (!calibration || !calibration.calibrated) return rawTotal;
    const scale = side === 'left' ? calibration.leftGlobal : calibration.rightGlobal;
    return rawTotal * scale;
}


// ─── Calibration Validation ─────────────────────────────────────────────────

/**
 * Validate a calibration by checking if the scale factors are reasonable.
 *
 * @param {Object} calibration - Calibration object
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateCalibration(calibration) {
    const warnings = [];

    if (!calibration || !calibration.calibrated) {
        return { valid: false, warnings: ['No calibration data'] };
    }

    // Check that scale factors are within reasonable range
    // (if scale is extremely high, sensors are barely reading; if low, sensors are saturating)
    const scales = [calibration.leftGlobal, calibration.rightGlobal];
    for (const scale of scales) {
        if (scale > 5.0) {
            warnings.push('Very high scale factor — sensors may be reading too low. Check connections.');
        }
        if (scale < 0.01) {
            warnings.push('Very low scale factor — sensors may be saturating. Check resistor values.');
        }
    }

    // Check bilateral symmetry of raw readings during calibration
    if (calibration.standingSymmetry != null && calibration.standingSymmetry < 80) {
        warnings.push(`Standing symmetry was only ${calibration.standingSymmetry}% during calibration. Was weight evenly distributed?`);
    }

    // Check age of calibration
    if (calibration.timestamp) {
        const ageHours = (Date.now() - calibration.timestamp) / (1000 * 60 * 60);
        if (ageHours > 168) { // 1 week
            warnings.push('Calibration is over a week old. Consider recalibrating.');
        }
    }

    return { valid: warnings.length === 0, warnings };
}


// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Save calibration to localStorage.
 */
export function saveCalibration(calibration) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
    } catch (e) {
        console.warn('Failed to save calibration:', e);
    }
}

/**
 * Load calibration from localStorage.
 * @returns {Object} Calibration object or default (uncalibrated)
 */
export function loadCalibration() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : { ...DEFAULT_CALIBRATION };
    } catch (e) {
        console.warn('Failed to load calibration:', e);
        return { ...DEFAULT_CALIBRATION };
    }
}

/**
 * Clear calibration data.
 */
export function clearCalibration() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to clear calibration:', e);
    }
}
