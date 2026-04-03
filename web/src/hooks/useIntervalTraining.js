import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Manages interval training state, including timers, phases, and fatigue onset monitoring.
 */
export function useIntervalTraining() {
    const [config, setConfig] = useState({
        enabled: false,
        workDuration: 30,      // Default 30s work
        restDuration: 30,      // Default 30s rest
        fatigueThreshold: 40,  // SI > 40% left-dominant triggers fatigue
        consecutiveStrokes: 3  // Number of fatigued strokes before forced rest
    });

    const [state, setState] = useState({
        phase: 'idle', // 'idle' | 'work' | 'rest'
        timeRemaining: 0,
        currentInterval: 1,
        intervalsCompleted: []
    });

    // We use refs for audio/timers so they can be accessed inside effects reliably
    const timerRef = useRef(null);
    const audioCtxRef = useRef(null);

    // Track strokes dynamically within the current interval
    const currentIntervalStrokesRef = useRef([]);
    const fatiguedStrokeCountRef = useRef(0);

    // --- Audio Helpers ---
    const playTone = useCallback((type) => {
        try {
            if (!audioCtxRef.current) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtxRef.current = new AudioContext();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'start') {
                // High double beep
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            } else if (type === 'warning') {
                // Short mid beep
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            } else if (type === 'rest') {
                // Low descending tone
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.5);
            }
        } catch (e) {
            console.warn("AudioContext tone failed:", e);
        }
    }, []);

    // --- Core Timer Logic ---
    useEffect(() => {
        if (!config.enabled || state.phase === 'idle') {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setState(prev => {
                if (prev.timeRemaining <= 1) {
                    // Transition phase
                    if (prev.phase === 'work') {
                        playTone('rest');
                        return transitionToRest(prev, false); // Natural rest, not fatigue-forced
                    } else if (prev.phase === 'rest') {
                        playTone('start');
                        return transitionToWork(prev);
                    }
                }
                return { ...prev, timeRemaining: prev.timeRemaining - 1 };
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [config.enabled, state.phase, playTone]);

    // --- Phase Transitions ---
    const transitionToRest = (prevState, isFatigueTriggered) => {
        const strokes = currentIntervalStrokesRef.current;
        const workElapsed = config.workDuration - prevState.timeRemaining;

        // Calculate interval summary
        let avgSI = 0;
        let onsetStroke = null;

        if (strokes.length > 0) {
            avgSI = strokes.reduce((sum, s) => sum + (s.symmetryIndex || 0), 0) / strokes.length;
            const onsetIdx = strokes.findIndex(s => s.symmetryIndex > 50);
            if (onsetIdx !== -1) onsetStroke = onsetIdx + 1;
        }

        // Add to completed intervals
        const newInterval = {
            intervalNumber: prevState.currentInterval,
            duration: workElapsed,
            isFatigueTriggered,
            strokeCount: strokes.length,
            avgSI,
            fatigueOnsetStroke: onsetStroke,
            startRightPeak: strokes.length > 0 ? strokes[0].rightPeak : null,
            endRightPeak: strokes.length > 0 ? strokes[strokes.length - 1].rightPeak : null,
        };

        const nextCompleted = [...prevState.intervalsCompleted, newInterval];

        // Reset tracking vars
        currentIntervalStrokesRef.current = [];
        fatiguedStrokeCountRef.current = 0;

        return {
            ...prevState,
            phase: 'rest',
            timeRemaining: config.restDuration,
            intervalsCompleted: nextCompleted
        };
    };

    const transitionToWork = (prevState) => {
        currentIntervalStrokesRef.current = [];
        fatiguedStrokeCountRef.current = 0;
        return {
            ...prevState,
            phase: 'work',
            timeRemaining: config.workDuration,
            currentInterval: prevState.currentInterval + 1
        };
    };

    // --- API Exposed to Components ---
    const startIntervals = () => {
        if (!config.enabled) return;
        playTone('start');
        currentIntervalStrokesRef.current = [];
        fatiguedStrokeCountRef.current = 0;
        setState({
            phase: 'work',
            timeRemaining: config.workDuration,
            currentInterval: 1,
            intervalsCompleted: []
        });
    };

    const stopIntervals = () => {
        setState({
            phase: 'idle',
            timeRemaining: 0,
            currentInterval: 1,
            intervalsCompleted: state.intervalsCompleted // Keep history summary
        });
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const toggleConfig = () => {
        setConfig(c => ({ ...c, enabled: !c.enabled }));
        if (state.phase !== 'idle') stopIntervals();
    };

    // Feed real-time strokes into this function from useStrokeAnalysis
    const processIntervalStroke = (strokeSummary) => {
        if (!config.enabled || state.phase !== 'work') return;

        currentIntervalStrokesRef.current.push(strokeSummary);

        // Check against fatigue threshold
        const si = strokeSummary.symmetryIndex || 0;
        if (si > config.fatigueThreshold) {
            fatiguedStrokeCountRef.current++;

            if (fatiguedStrokeCountRef.current >= config.consecutiveStrokes) {
                // Force early rest
                playTone('rest');
                setState(prev => transitionToRest(prev, true));
            } else {
                // Warning tone
                playTone('warning');
            }
        } else {
            // Recovered before forced rest
            fatiguedStrokeCountRef.current = 0;
        }
    };

    return {
        intervalConfig: config,
        intervalState: state,
        fatiguedStrokeCount: fatiguedStrokeCountRef.current,
        setConfig,
        startIntervals,
        stopIntervals,
        toggleConfig,
        processIntervalStroke
    };
}
