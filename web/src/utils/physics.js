/**
 * Generates data points for the rowing force curve based on ankle flexion.
 * 
 * @param {number} flexion - Value between 0 (stiff/injured) and 100 (healthy/full range).
 * @returns {Array} Array of objects { position: number, actual: number, ideal: number }
 */
export const generateCurveData = (flexion) => {
    const points = [];
    const steps = 100;

    // Normalize flexion to 0.0 - 1.0
    const f = flexion / 100;

    // Model Parameters
    // Ideal stroke: Starts at 0, peaks around 40-50%, ends at 100%
    // Injured stroke (Low flexion): 
    // - Starts later (catch is compromised)
    // - Effective stroke length is shorter
    // - Peak might be lower or shifted

    const startDelay = (1 - f) * 20; // Up to 20% delay in effective force application
    const peakAmplitude = 100; // Ideal peak force
    const actualPeak = 60 + (40 * f); // Range from 60 to 100 based on flexion

    for (let i = 0; i <= steps; i++) {
        const x = i; // Position in stroke (0-100%)

        // Ideal Curve: Parabola / Sine wave approximation
        // y = sin(x * PI / 100) * peak
        let idealY = 0;
        if (x >= 0 && x <= 100) {
            idealY = Math.sin((x / 100) * Math.PI) * peakAmplitude;
            // Shaping it a bit more like a bell curve (squaring sine)
            idealY = Math.pow(Math.sin((x / 100) * Math.PI), 1.5) * peakAmplitude;
        }

        // Actual Curve
        let actualY = 0;
        // Effective stroke starts at startDelay
        if (x > startDelay) {
            // Re-map x to a 0-100 range for the actual stroke duration
            const remainingLength = 100 - startDelay;
            const progress = (x - startDelay) / remainingLength;

            if (progress <= 1) {
                // Skewed sine wave
                // If flexion is low, the curve is less symmetric, maybe steeper rise then drop
                // But for simplicity, let's keep it smooth but shorter and smaller
                actualY = Math.pow(Math.sin(progress * Math.PI), 1.5) * actualPeak;
            }
        }

        points.push({
            position: x,
            ideal: Math.max(0, idealY),
            actual: Math.max(0, actualY),
        });
    }

    return points;
};

/**
 * Calculates the integral (Area Under Curve) for the actual stroke.
 * Simple trapezoidal rule or sum.
 */
export const calculateIntegral = (data) => {
    return data.reduce((sum, point) => sum + point.actual, 0);
};

/**
 * Calculates a symmetry score (0-100%).
 * 100% = Peak is exactly in the middle of the duration.
 */
export const calculateSymmetry = (data, flexion) => {
    // Find index of peak
    let maxVal = 0;
    let maxIndex = 0;
    let startIndex = -1;
    let endIndex = 0;

    data.forEach((p, i) => {
        if (p.actual > 0) {
            if (startIndex === -1) startIndex = i;
            endIndex = i;
        }
        if (p.actual > maxVal) {
            maxVal = p.actual;
            maxIndex = i;
        }
    });

    if (maxVal === 0) return 0;

    const strokeLength = endIndex - startIndex;
    const peakRelativePos = maxIndex - startIndex;
    const midPoint = strokeLength / 2;

    // Deviation from midpoint
    const deviation = Math.abs(midPoint - peakRelativePos);

    // Score relies on deviation. 0 deviation = 100%.
    // Max deviation is roughly strokeLength/2.
    const symmetry = Math.max(0, 100 - (deviation / (strokeLength / 2)) * 100);

    return symmetry;
};

/**
 * Generates trend data for the entire range of flexion (0-100).
 * Returns array of { flexion: number, output: number }
 */
export const generateTrendData = () => {
    const data = [];
    for (let f = 0; f <= 100; f += 2) { // Step by 2 to keep it light
        const curve = generateCurveData(f);
        const output = calculateIntegral(curve);
        data.push({
            flexion: f,
            output: Math.round(output)
        });
    }
    return data;
};

/**
 * Adds Gaussian noise to a value.
 * Uses Box-Muller transform.
 */
const gaussianNoise = (mean = 0, stdDev = 1) => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
};

/**
 * Generates a single noisy data point for live simulation.
 * @param {number} position - Current position in stroke (0-100)
 * @param {number} flexion - Ankle flexion value (0-100)
 * @param {number} noiseLevel - Standard deviation of noise (default 3)
 * @returns {object} { position, actual, ideal, noise }
 */
export const generateLiveDataPoint = (position, flexion, noiseLevel = 3, asymmetryBias = 0.3) => {
    const f = flexion / 100;
    const startDelay = (1 - f) * 20;
    const peakAmplitude = 100;
    const actualPeak = 60 + (40 * f);

    // Ideal curve
    let idealY = Math.pow(Math.sin((position / 100) * Math.PI), 1.5) * peakAmplitude;

    // Actual curve with delay
    let actualY = 0;
    if (position > startDelay) {
        const remainingLength = 100 - startDelay;
        const progress = (position - startDelay) / remainingLength;
        if (progress <= 1) {
            actualY = Math.pow(Math.sin(progress * Math.PI), 1.5) * actualPeak;
        }
    }

    // Add sensor noise
    const noise = gaussianNoise(0, noiseLevel);
    const noisyActual = Math.max(0, actualY + noise);

    // Bilateral split with asymmetry bias (injured right leg produces less force)
    const leftForce = noisyActual * (0.5 + asymmetryBias / 2) + gaussianNoise(0, 1);
    const rightForce = Math.max(0, noisyActual * (0.5 - asymmetryBias / 2) + gaussianNoise(0, 1));

    // Healthy left foot: normal heel→ball→toe progression through stroke
    const progress = position / 100; // 0 to 1
    const leftSensors = {
        heel: Math.max(0, leftForce * (0.55 - (progress * 0.35))),
        ball: Math.max(0, leftForce * (0.35 + (progress * 0.05))),
        toe: Math.max(0, leftForce * (0.10 + (progress * 0.30)))
    };

    // Injured right foot: toe-dominant compensation pattern
    // The Achilles can't generate normal push-off through the ball,
    // so load shifts excessively to the toe and lingers on the heel
    const rightSensors = {
        heel: Math.max(0, rightForce * (0.45 - (progress * 0.20))),
        ball: Math.max(0, rightForce * (0.15 + (progress * 0.05))),
        toe: Math.max(0, rightForce * (0.40 + (progress * 0.15)))
    };

    return {
        position,
        ideal: Math.max(0, idealY),
        actual: noisyActual,
        leftForce: Math.max(0, leftForce),
        rightForce: Math.max(0, rightForce),
        leftHeel: leftSensors.heel,
        leftBall: leftSensors.ball,
        leftToe: leftSensors.toe,
        rightHeel: rightSensors.heel,
        rightBall: rightSensors.ball,
        rightToe: rightSensors.toe,
        raw: actualY,
        noise: noise
    };
};

/**
 * Generates a full stroke with noise for replay/demo.
 * @param {number} flexion - Ankle flexion value
 * @param {number} noiseLevel - Noise standard deviation
 * @returns {Array} Array of noisy data points
 */
export const generateNoisyStroke = (flexion, noiseLevel = 4) => {
    const points = [];
    for (let i = 0; i <= 100; i++) {
        points.push(generateLiveDataPoint(i, flexion, noiseLevel));
    }
    return points;
};

/**
 * Exports an array of telemetry data to a downloadable CSV file.
 * @param {Array} data - The cumulativeData array containing telemetry objects.
 * @param {string} filename - The desired download filename.
 */
export const exportDataToCSV = (data, filename = 'rowing_session.csv') => {
    if (!data || data.length === 0) {
        alert("No data available to save.");
        return;
    }

    // Define CSV headers
    const headers = [
        'Timestamp(s)',
        'Phase',
        'Stroke_Position(%)',
        'Total_Force(Scal)',
        'Left_Force(Scal)',
        'Right_Force(Scal)',
        'L_Heel(Raw)', 'L_Ball(Raw)', 'L_Toe(Raw)',
        'R_Heel(Raw)', 'R_Ball(Raw)', 'R_Toe(Raw)'
    ];

    // Map data rows
    const rows = data.map(d => [
        d.time.toFixed(3),
        d.phase,
        d.position.toFixed(1),
        d.actual,
        d.leftForce,
        d.rightForce,
        d.leftRaw?.heel || 0, d.leftRaw?.ball || 0, d.leftRaw?.toe || 0,
        d.rightRaw?.heel || 0, d.rightRaw?.ball || 0, d.rightRaw?.toe || 0
    ]);

    // Build CSV string
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    // Create Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
