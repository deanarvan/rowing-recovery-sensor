import { useState, useEffect, useRef } from 'react';
import { buildStrokeSummary, calcFatigueSlope, calcRecoveryScore } from '../utils/recoveryMetrics';

/**
 * Hook that detects completed strokes from cumulative data and computes
 * bilateral asymmetry metrics.
 *
 * STRATEGY — "strokeCount-gated backward scan":
 *   Instead of tracking phase transitions incrementally across renders
 *   (fragile under React 18 batching + StrictMode), we wait for the
 *   parent's strokeCount to increase, then scan backward through
 *   cumulativeData to find the most recent COMPLETED drive segments
 *   (drive followed by recovery). This sidesteps all timing issues
 *   because both strokeCount and cumulativeData are committed in the
 *   same render.
 *
 * IMPORTANT: This hook must always call the same number of hooks
 * on every render to comply with React's Rules of Hooks.
 */
export function useStrokeAnalysis(cumulativeData, strokePhase, strokeCount) {
    const [completedStrokes, setCompletedStrokes] = useState([]);
    const [recoveryScore, setRecoveryScore] = useState(null);
    const [fatigueData, setFatigueData] = useState({ slope: 0, intercept: 1 });

    const processedCountRef = useRef(0);
    const hasDataRef = useRef(false);

    // --- Reset when session ends (data cleared) ---
    useEffect(() => {
        if (!cumulativeData || cumulativeData.length === 0) {
            if (hasDataRef.current) {
                console.log('[StrokeAnalysis] RESET — data cleared');
                hasDataRef.current = false;
                processedCountRef.current = 0;
                setCompletedStrokes([]);
                setRecoveryScore(null);
                setFatigueData({ slope: 0, intercept: 1 });
            }
        } else {
            hasDataRef.current = true;
        }
    }, [cumulativeData]);

    // --- Detect strokes when strokeCount increases ---
    useEffect(() => {
        // Nothing to do if strokeCount hasn't advanced past what we've processed
        if (strokeCount <= 0 || strokeCount <= processedCountRef.current) return;
        if (!cumulativeData || cumulativeData.length < 5) return;

        const strokesToFind = strokeCount - processedCountRef.current;
        const driveSegments = []; // collected in reverse order, reversed at end

        console.log('[StrokeAnalysis] strokeCount=%d, processed=%d, toFind=%d, dataLen=%d',
            strokeCount, processedCountRef.current, strokesToFind, cumulativeData.length);

        // ---- Backward scan: find completed drive segments ----
        // A "completed" drive = a contiguous run of phase:'drive' points
        // followed by at least one non-drive point (recovery/idle).
        let scanIdx = cumulativeData.length - 1;
        let found = 0;

        while (scanIdx >= 0 && found < strokesToFind) {
            const phase = cumulativeData[scanIdx].phase || strokePhase || 'idle';

            // If we're sitting on drive points, these belong to the
            // CURRENT (unfinished) stroke → skip them.
            if (phase === 'drive') {
                while (scanIdx >= 0 && (cumulativeData[scanIdx].phase || strokePhase || 'idle') === 'drive') {
                    scanIdx--;
                }
                continue; // re-enter the outer loop (now at recovery or beginning)
            }

            // We're at recovery/idle → skip backward through non-drive points
            while (scanIdx >= 0 && (cumulativeData[scanIdx].phase || strokePhase || 'idle') !== 'drive') {
                scanIdx--;
            }
            if (scanIdx < 0) break;

            // scanIdx now points to the LAST drive point of a completed stroke.
            const driveEnd = scanIdx + 1; // exclusive end index

            // Walk backward through the drive segment to find its start
            while (scanIdx >= 0 && (cumulativeData[scanIdx].phase || strokePhase || 'idle') === 'drive') {
                scanIdx--;
            }
            const driveStart = scanIdx + 1;

            const driveData = cumulativeData.slice(driveStart, driveEnd);

            console.log('[StrokeAnalysis] Found drive segment: [%d..%d) len=%d',
                driveStart, driveEnd, driveData.length);

            // Validate: minimum samples, minimum duration, has force data
            if (driveData.length >= 3) {
                const duration = driveData[driveData.length - 1].time - driveData[0].time;
                if (duration >= 0.3) {
                    const hasForce = driveData.some(s =>
                        (s.leftForce || 0) > 0 || (s.rightForce || 0) > 0
                    );
                    if (hasForce) {
                        driveSegments.push(driveData);
                        found++;
                        console.log('[StrokeAnalysis] ✓ Valid stroke segment #%d: dur=%.2f len=%d',
                            found, duration, driveData.length);
                    } else {
                        console.log('[StrokeAnalysis] ✗ No force data in segment [%d..%d)', driveStart, driveEnd);
                    }
                } else {
                    console.log('[StrokeAnalysis] ✗ Duration too short: %.2f', duration);
                }
            } else {
                console.log('[StrokeAnalysis] ✗ Too few samples: %d', driveData.length);
            }
        }

        if (driveSegments.length === 0) {
            console.log('[StrokeAnalysis] No valid segments found');
            return;
        }

        // Reverse so strokes are in chronological order (we scanned backward)
        driveSegments.reverse();

        // Build summaries
        const newSummaries = [];
        for (const driveData of driveSegments) {
            const num = processedCountRef.current + newSummaries.length + 1;
            const summary = buildStrokeSummary(num, driveData);
            if (summary) {
                console.log('[StrokeAnalysis] Built summary #%d: SI=%.1f IR=%.1f SD=%.3f',
                    num, summary.symmetryIndex, summary.impulseRatio, summary.shapeDifference);
                newSummaries.push(summary);
            }
        }

        if (newSummaries.length > 0) {
            processedCountRef.current = strokeCount;

            setCompletedStrokes(prev => {
                const updated = prev.concat(newSummaries);
                const trimmed = updated.length > 50 ? updated.slice(-50) : updated;

                // Compute aggregate metrics (in next microtask to avoid
                // setState-during-render in the updater function)
                if (trimmed.length >= 2) {
                    setTimeout(() => {
                        setFatigueData(calcFatigueSlope(trimmed));
                        setRecoveryScore(calcRecoveryScore(trimmed));
                    }, 0);
                }

                console.log('[StrokeAnalysis] completedStrokes now has %d entries', trimmed.length);
                return trimmed;
            });
        }
    }, [strokeCount, cumulativeData, strokePhase]);

    return {
        completedStrokes,
        recoveryScore,
        fatigueData
    };
}

export default useStrokeAnalysis;
