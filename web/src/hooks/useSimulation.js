import { useState, useEffect, useCallback, useRef } from 'react';
import { generateLiveDataPoint } from '../utils/physics';

/**
 * Custom hook for simulating live rowing data.
 * 
 * @param {number} flexion - Current ankle flexion value
 * @param {object} options - Configuration options
 * @returns {object} Simulation state and controls
 */
export const useSimulation = (flexion, options = {}) => {
    const {
        strokeDurationMs = 2000,  // Full stroke takes 2 seconds
        recoveryDurationMs = 1500, // Recovery phase between strokes
        noiseLevel = 4,
        pointsPerStroke = 100,
        maxCumulativeStrokes = 10, // How many strokes to show in cumulative view
        cumulativeResetMs = 20000, // Reset cumulative view every 20 seconds
        rollingAverageWindow = 5   // Number of strokes for rolling average
    } = options;

    const [isRunning, setIsRunning] = useState(false);
    const [liveData, setLiveData] = useState([]);
    const [cumulativeData, setCumulativeData] = useState([]); // Time-series across strokes
    const [currentPosition, setCurrentPosition] = useState(0);
    const [strokePhase, setStrokePhase] = useState('idle'); // 'drive', 'recovery', 'idle'
    const [strokeCount, setStrokeCount] = useState(0);
    const [strokeRate, setStrokeRate] = useState(0); // strokes per minute
    const [strokePeaks, setStrokePeaks] = useState([]); // Peak force for each stroke
    const [rollingAverage, setRollingAverage] = useState(0); // Rolling avg of last N peaks

    const animationRef = useRef(null);
    const lastTimeRef = useRef(null);
    const strokeStartTimeRef = useRef(null);
    const lastStrokeCountRef = useRef(0);
    const cumulativeResetRef = useRef(null);
    const currentStrokePeakRef = useRef(0);

    // Calculate stroke rate based on durations
    useEffect(() => {
        const totalCycleMs = strokeDurationMs + recoveryDurationMs;
        const rate = (60 * 1000) / totalCycleMs;
        setStrokeRate(Math.round(rate * 10) / 10);
    }, [strokeDurationMs, recoveryDurationMs]);

    // Calculate rolling average when strokePeaks changes
    useEffect(() => {
        if (strokePeaks.length === 0) {
            setRollingAverage(0);
            return;
        }
        const recentPeaks = strokePeaks.slice(-rollingAverageWindow);
        const avg = recentPeaks.reduce((sum, p) => sum + p, 0) / recentPeaks.length;
        setRollingAverage(Math.round(avg * 10) / 10);
    }, [strokePeaks, rollingAverageWindow]);

    const animate = useCallback((timestamp) => {
        if (!lastTimeRef.current) {
            lastTimeRef.current = timestamp;
            strokeStartTimeRef.current = timestamp;
            cumulativeResetRef.current = timestamp;
        }

        const elapsed = timestamp - strokeStartTimeRef.current;
        const totalCycleMs = strokeDurationMs + recoveryDurationMs;
        const cyclePosition = elapsed % totalCycleMs;
        const currentCycle = Math.floor(elapsed / totalCycleMs);

        // Track stroke completion and record peak
        if (currentCycle > lastStrokeCountRef.current) {
            // Store the peak from the completed stroke
            if (currentStrokePeakRef.current > 0) {
                setStrokePeaks(prev => {
                    const updated = [...prev, currentStrokePeakRef.current];
                    // Keep last 20 peaks for history
                    if (updated.length > 20) {
                        return updated.slice(-20);
                    }
                    return updated;
                });
            }
            currentStrokePeakRef.current = 0;
            lastStrokeCountRef.current = currentCycle;
            setStrokeCount(currentCycle);
        }

        // Calculate time since start for the cumulative view (Issue #9)
        const cumulativeTimeS = elapsed / 1000;

        if (cyclePosition < strokeDurationMs) {
            // Drive phase
            const progress = (cyclePosition / strokeDurationMs) * 100;
            setCurrentPosition(progress);
            setStrokePhase('drive');

            // Generate new data point
            const newPoint = generateLiveDataPoint(progress, flexion, noiseLevel);

            // Track peak force for this stroke
            if (newPoint.actual > currentStrokePeakRef.current) {
                currentStrokePeakRef.current = newPoint.actual;
            }

            // Add time dimension for cumulative view (relative to last reset)
            const cumulativePoint = {
                ...newPoint,
                time: cumulativeTimeS,
                strokeNum: currentCycle + 1,
                phase: 'drive'
            };

            // Update single-stroke view
            setLiveData(prev => {
                const updated = [...prev, newPoint];
                if (updated.length > pointsPerStroke) {
                    return updated.slice(-pointsPerStroke);
                }
                return updated;
            });

            // Update cumulative view (keeps more data for CSV export)
            setCumulativeData(prev => {
                const updated = [...prev, cumulativePoint];
                // Keep up to 5000 points (~5 mins at 15Hz) to match hardware mode (Issue #9)
                if (updated.length > 5000) {
                    return updated.slice(-5000);
                }
                return updated;
            });
        } else {
            // Recovery phase
            setStrokePhase('recovery');
            setCurrentPosition(0);

            // Add recovery points to cumulative (flat line at 0)
            const recoveryPoint = {
                position: 0,
                actual: 0,
                ideal: 0,
                time: cumulativeTimeS,
                strokeNum: currentCycle + 1,
                phase: 'recovery'
            };

            setCumulativeData(prev => {
                // Only add recovery point every ~100ms to avoid too many points
                const lastPoint = prev[prev.length - 1];
                if (!lastPoint || (cumulativeTimeS - lastPoint.time) > 0.1) {
                    const updated = [...prev, recoveryPoint];
                    if (updated.length > 5000) {
                        return updated.slice(-5000);
                    }
                    return updated;
                }
                return prev;
            });

            // Clear single-stroke data during recovery
            const recoveryProgress = (cyclePosition - strokeDurationMs) / recoveryDurationMs;
            if (recoveryProgress < 0.1) {
                setLiveData([]);
            }
        }

        animationRef.current = requestAnimationFrame(animate);
    }, [flexion, noiseLevel, strokeDurationMs, recoveryDurationMs, pointsPerStroke, maxCumulativeStrokes, cumulativeResetMs]);

    const start = useCallback(() => {
        if (!isRunning) {
            setIsRunning(true);
            setStrokeCount(0);
            setLiveData([]);
            setCumulativeData([]);
            setStrokePeaks([]);
            setRollingAverage(0);
            currentStrokePeakRef.current = 0;
            lastTimeRef.current = null;
            strokeStartTimeRef.current = null;
            cumulativeResetRef.current = null;
            lastStrokeCountRef.current = 0;
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [isRunning, animate]);

    const stop = useCallback(() => {
        setIsRunning(false);
        setStrokePhase('idle');
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
    }, []);

    const toggle = useCallback(() => {
        if (isRunning) {
            stop();
        } else {
            start();
        }
    }, [isRunning, start, stop]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    // Restart animation when flexion changes while running
    useEffect(() => {
        if (isRunning && animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [flexion, isRunning, animate]);

    return {
        isRunning,
        liveData,
        cumulativeData,
        currentPosition,
        strokePhase,
        strokeCount,
        strokeRate,
        strokePeaks,
        rollingAverage,
        start,
        stop,
        toggle
    };
};

export default useSimulation;
