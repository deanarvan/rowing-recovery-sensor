/**
 * Simulates a live rowing stroke cycle with noisy sensor data.
 * This mimics what would come from the ESP32 in real-time.
 */

// Stroke parameters
const STROKE_DURATION_MS = 2000; // 2 seconds per stroke (30 spm)

/**
 * Generates a single frame of simulated sensor data based on time.
 * @param {number} time - Current time in milliseconds (use Date.now() or animation frame time)
 * @param {number} flexionAbility - User's ankle flexion ability (0-100%)
 * @returns {Object} Simulated sensor readings
 */
export const generateSimulationFrame = (time, flexionAbility) => {
    // Calculate position in stroke cycle (0 to 1)
    const cyclePosition = (time % STROKE_DURATION_MS) / STROKE_DURATION_MS;

    // --- Force Curve Simulation ---
    // Drive phase: 0 to 0.4 (peak at 0.25)
    // Recovery phase: 0.4 to 1.0
    let force = 0;
    if (cyclePosition < 0.4) {
        // Drive phase - bell curve
        const driveProgress = cyclePosition / 0.4;
        const peakOffset = (1 - flexionAbility / 100) * 0.15; // Injured = delayed peak
        force = Math.pow(Math.sin((driveProgress - peakOffset) * Math.PI), 1.5);
        force = Math.max(0, force) * (60 + (flexionAbility / 100) * 40); // Scale by ability
    }

    // Add sensor noise (±5%)
    force += (Math.random() - 0.5) * 10;
    force = Math.max(0, force);

    // --- FSR Simulation (Heel vs Toe) ---
    // During drive: Start toe-heavy (catch), shift to heel-heavy (finish)
    let copPercent = 50; // Center of Pressure (0=heel, 100=toe)
    if (cyclePosition < 0.4) {
        const driveProgress = cyclePosition / 0.4;
        // Catch (0) = 70% toe, Finish (1) = 20% toe
        copPercent = 70 - (driveProgress * 50);
        // Injured person stays toe-heavy longer
        copPercent += (1 - flexionAbility / 100) * 20;
    } else {
        // Recovery: neutral
        copPercent = 50;
    }
    copPercent = Math.min(100, Math.max(0, copPercent + (Math.random() - 0.5) * 8));

    const heelForce = force * (1 - copPercent / 100);
    const toeForce = force * (copPercent / 100);

    // --- EMG Simulation (Calf activation) ---
    // Calf fires during drive, peaks at midpoint
    let calfEMG = 0;
    if (cyclePosition < 0.4) {
        const driveProgress = cyclePosition / 0.4;
        calfEMG = Math.sin(driveProgress * Math.PI) * (50 + flexionAbility * 0.5);
        // Injured = lower calf activation
        calfEMG *= 0.5 + (flexionAbility / 100) * 0.5;
    }
    // Add high-frequency EMG noise
    calfEMG += (Math.random() - 0.5) * 15;
    calfEMG = Math.max(0, calfEMG);

    // --- Ankle Angle Simulation ---
    // Catch: Max dorsiflexion (scaled by ability)
    // Finish: Plantarflexion
    let ankleAngle = 0;
    if (cyclePosition < 0.1) {
        // Catch compression
        ankleAngle = (flexionAbility / 100) * 20; // Max dorsiflexion based on ability
    } else if (cyclePosition < 0.4) {
        // Drive extension
        const driveProgress = (cyclePosition - 0.1) / 0.3;
        ankleAngle = (flexionAbility / 100) * 20 * (1 - driveProgress);
    } else {
        // Recovery: gradual return
        const recoveryProgress = (cyclePosition - 0.4) / 0.6;
        ankleAngle = (flexionAbility / 100) * 20 * recoveryProgress;
    }
    ankleAngle += (Math.random() - 0.5) * 2;

    return {
        timestamp: time,
        cyclePosition,
        force: Math.round(force * 10) / 10,
        heelForce: Math.round(heelForce * 10) / 10,
        toeForce: Math.round(toeForce * 10) / 10,
        copPercent: Math.round(copPercent),
        calfEMG: Math.round(calfEMG * 10) / 10,
        ankleAngle: Math.round(ankleAngle * 10) / 10,
    };
};
