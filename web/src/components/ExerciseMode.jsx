import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Timer, Square, Activity, Footprints, TrendingUp, Target, AlertTriangle } from 'lucide-react';

const EXERCISE_MODES = [
  {
    id: 'bilateral_stance',
    name: 'Bilateral Stance',
    description: 'Stand naturally for 30 seconds. Measures weight distribution and CoP sway.',
    duration: 30,
    folder: 'Bilateral_Stance',
    icon: Footprints,
    color: '#38bdf8',
  },
  {
    id: 'heel_rise_fatigue',
    name: 'Heel Rise Fatigue',
    description: '2×10s heel rise holds → BSI assessment. Measures fatigue-induced asymmetry shift.',
    folder: 'Heel_Rise_Fatigue',
    icon: TrendingUp,
    color: '#818cf8',
    phases: [
      { name: 'Hold 1', duration: 10, instruction: 'Rise up on both toes — HOLD', recording: true, type: 'hold' },
      { name: 'Rest', duration: 5, instruction: 'Lower heels — rest flat', recording: false, type: 'rest' },
      { name: 'Hold 2', duration: 10, instruction: 'Rise up again — HOLD', recording: true, type: 'hold' },
      { name: 'Settle', duration: 3, instruction: 'Lower heels — stand still', recording: false, type: 'settle' },
      { name: 'BSI Check', duration: 10, instruction: 'Stand still — measuring post-fatigue BSI', recording: true, type: 'bsi_check' },
    ],
    get duration() { return this.phases.reduce((s, p) => s + p.duration, 0); },
  },
  {
    id: 'squats',
    name: 'Squats',
    description: 'Perform squats for 60 seconds. Measures bilateral symmetry through movement.',
    duration: 60,
    folder: 'Squats',
    icon: Activity,
    color: '#f472b6',
  },
];

const ExerciseMode = ({ balanceBoard, onExportSession }) => {
  const [selectedMode, setSelectedMode] = useState(null);
  const [exerciseState, setExerciseState] = useState('idle');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [sessionAvgBSI, setSessionAvgBSI] = useState(null);
  const [sessionAvgLeftPct, setSessionAvgLeftPct] = useState(null);
  const [sessionAvgRightPct, setSessionAvgRightPct] = useState(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [sessionCoPVelocity, setSessionCoPVelocity] = useState(null);
  const [sessionCoPTranslation, setSessionCoPTranslation] = useState(null);
  const [sessionCoPEllipseArea, setSessionCoPEllipseArea] = useState(null);

  // Phase tracking for multi-phase modes (heel rise fatigue)
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [phaseTimeRemaining, setPhaseTimeRemaining] = useState(0);
  const [posteriorShiftAlert, setPosteriorShiftAlert] = useState(false);

  // Fatigue protocol results
  const [fatigueHoldBSI, setFatigueHoldBSI] = useState(null);
  const [fatigueBsiCheckBSI, setFatigueBsiCheckBSI] = useState(null);
  const [fatigueBsiDelta, setFatigueBsiDelta] = useState(null);
  const [fatigueHoldFrontPct, setFatigueHoldFrontPct] = useState(null);
  const [fatigueBsiCheckFrontPct, setFatigueBsiCheckFrontPct] = useState(null);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const exerciseDataRef = useRef([]);
  const bsiAccumRef = useRef([]);
  const copTraceRef = useRef([]);
  const exerciseStateRef = useRef('idle');
  const exerciseStartTimeRef = useRef(null);
  const currentPhaseRef = useRef(0);

  // Phase-specific BSI accumulators for fatigue protocol
  const holdBsiRef = useRef([]);
  const bsiCheckBsiRef = useRef([]);
  const holdFrontPctRef = useRef([]);
  const bsiCheckFrontPctRef = useRef([]);

  // Compute real-time values from balance board data
  const data = balanceBoard.instantaneousData;
  const left = data?.leftForce || 0;
  const right = data?.rightForce || 0;
  const total = left + right;
  const leftPct = total > 0 ? (left / total) * 100 : 50;
  const rightPct = total > 0 ? (right / total) * 100 : 50;
  const currentBSI = total > 0 ? Math.abs(left - right) / total * 100 : 0;
  const dominantSide = left > right ? 'LEFT' : right > left ? 'RIGHT' : 'EVEN';

  // Compute front/back percentage for AP axis
  const raw = data?.raw || {};
  const frontForce = (raw.fl || 0) + (raw.fr || 0);
  const rearForce = (raw.rl || 0) + (raw.rr || 0);
  const frontPct = total > 0 ? (frontForce / total) * 100 : 50;

  // Posterior shift alert threshold (below 40% = significant posterior shift)
  const POSTERIOR_SHIFT_THRESHOLD = 40;

  // Accumulate data during recording
  useEffect(() => {
    if (exerciseStateRef.current !== 'recording') return;
    if (!data || total <= 20) return;

    const elapsed = (Date.now() - (exerciseStartTimeRef.current || Date.now())) / 1000;
    const mode = selectedMode;
    const phaseIdx = currentPhaseRef.current;
    const phase = mode?.phases ? mode.phases[phaseIdx] : null;

    // For phased modes, only record data during recording phases
    if (phase && !phase.recording) return;

    const phaseName = phase ? phase.name : 'main';
    const phaseType = phase ? phase.type : 'main';

    exerciseDataRef.current.push({
      ...data,
      elapsed,
      phase: phaseName,
      phaseType,
    });
    bsiAccumRef.current.push({ bsi: currentBSI, leftPct, rightPct });
    copTraceRef.current.push({ ml: leftPct, ap: frontPct, t: elapsed });
    setSampleCount(exerciseDataRef.current.length);

    // Phase-specific BSI accumulation for fatigue protocol
    if (phaseType === 'hold') {
      holdBsiRef.current.push({ bsi: currentBSI, leftPct, rightPct });
      holdFrontPctRef.current.push(frontPct);
    } else if (phaseType === 'bsi_check') {
      bsiCheckBsiRef.current.push({ bsi: currentBSI, leftPct, rightPct });
      bsiCheckFrontPctRef.current.push(frontPct);
    }

    // Check for posterior shift alert (live during all exercises)
    if (frontPct < POSTERIOR_SHIFT_THRESHOLD && total > 20) {
      setPosteriorShiftAlert(true);
    } else {
      setPosteriorShiftAlert(false);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishExercise = useCallback((mode) => {
    exerciseStateRef.current = 'complete';
    setExerciseState('complete');
    setPosteriorShiftAlert(false);

    const bsiValues = bsiAccumRef.current;
    if (bsiValues.length > 0) {
      const avgBSI = bsiValues.reduce((s, v) => s + v.bsi, 0) / bsiValues.length;
      const avgLeft = bsiValues.reduce((s, v) => s + v.leftPct, 0) / bsiValues.length;
      const avgRight = bsiValues.reduce((s, v) => s + v.rightPct, 0) / bsiValues.length;
      setSessionAvgBSI(avgBSI);
      setSessionAvgLeftPct(avgLeft);
      setSessionAvgRightPct(avgRight);
    }

    // Compute CoP metrics from trace
    const trace = copTraceRef.current;
    if (trace.length > 2) {
      let velocitySum = 0;
      let velocityCount = 0;
      for (let i = 1; i < trace.length; i++) {
        const dt = trace[i].t - trace[i - 1].t;
        if (dt > 0) {
          const dml = trace[i].ml - trace[i - 1].ml;
          const dap = trace[i].ap - trace[i - 1].ap;
          const dist = Math.sqrt(dml * dml + dap * dap);
          velocitySum += dist / dt;
          velocityCount++;
        }
      }
      setSessionCoPVelocity(velocityCount > 0 ? velocitySum / velocityCount : 0);

      let mlMin = Infinity, mlMax = -Infinity, apMin = Infinity, apMax = -Infinity;
      for (const pt of trace) {
        if (pt.ml < mlMin) mlMin = pt.ml;
        if (pt.ml > mlMax) mlMax = pt.ml;
        if (pt.ap < apMin) apMin = pt.ap;
        if (pt.ap > apMax) apMax = pt.ap;
      }
      const mlRange = mlMax - mlMin;
      const apRange = apMax - apMin;
      setSessionCoPTranslation(Math.sqrt(mlRange * mlRange + apRange * apRange));

      const n = trace.length;
      const meanML = trace.reduce((s, p) => s + p.ml, 0) / n;
      const meanAP = trace.reduce((s, p) => s + p.ap, 0) / n;
      let varML = 0, varAP = 0, covMLAP = 0;
      for (const pt of trace) {
        const dml = pt.ml - meanML;
        const dap = pt.ap - meanAP;
        varML += dml * dml;
        varAP += dap * dap;
        covMLAP += dml * dap;
      }
      varML /= (n - 1);
      varAP /= (n - 1);
      covMLAP /= (n - 1);
      const det = varML * varAP - covMLAP * covMLAP;
      const CHI2_95_2DOF = 5.991;
      const ellipseArea = Math.PI * CHI2_95_2DOF * Math.sqrt(Math.max(det, 0));
      setSessionCoPEllipseArea(ellipseArea);
    }

    // Fatigue protocol: compute hold vs BSI check comparison
    if (mode.phases) {
      const holdData = holdBsiRef.current;
      const checkData = bsiCheckBsiRef.current;
      if (holdData.length > 0 && checkData.length > 0) {
        const holdAvg = holdData.reduce((s, v) => s + v.bsi, 0) / holdData.length;
        const checkAvg = checkData.reduce((s, v) => s + v.bsi, 0) / checkData.length;
        setFatigueHoldBSI(holdAvg);
        setFatigueBsiCheckBSI(checkAvg);
        setFatigueBsiDelta(checkAvg - holdAvg);
      }
      // Front pct comparison
      const holdFront = holdFrontPctRef.current;
      const checkFront = bsiCheckFrontPctRef.current;
      if (holdFront.length > 0 && checkFront.length > 0) {
        setFatigueHoldFrontPct(holdFront.reduce((s, v) => s + v, 0) / holdFront.length);
        setFatigueBsiCheckFrontPct(checkFront.reduce((s, v) => s + v, 0) / checkFront.length);
      }
    }

    // Export data
    if (onExportSession && exerciseDataRef.current.length > 5) {
      onExportSession(mode.folder, exerciseDataRef.current, bsiValues, copTraceRef.current);
    }
  }, [onExportSession]);

  const startExercise = useCallback((mode) => {
    setSelectedMode(mode);
    setExerciseState('countdown');
    exerciseStateRef.current = 'countdown';
    setCountdownValue(3);
    exerciseDataRef.current = [];
    bsiAccumRef.current = [];
    copTraceRef.current = [];
    holdBsiRef.current = [];
    bsiCheckBsiRef.current = [];
    holdFrontPctRef.current = [];
    bsiCheckFrontPctRef.current = [];
    setSampleCount(0);
    setSessionAvgBSI(null);
    setSessionAvgLeftPct(null);
    setSessionAvgRightPct(null);
    setSessionCoPVelocity(null);
    setSessionCoPTranslation(null);
    setSessionCoPEllipseArea(null);
    setFatigueHoldBSI(null);
    setFatigueBsiCheckBSI(null);
    setFatigueBsiDelta(null);
    setFatigueHoldFrontPct(null);
    setFatigueBsiCheckFrontPct(null);
    setCurrentPhaseIndex(0);
    currentPhaseRef.current = 0;
    setPosteriorShiftAlert(false);

    let count = 3;
    countdownRef.current = setInterval(() => {
      count--;
      setCountdownValue(count);
      if (count <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        exerciseStateRef.current = 'recording';
        setExerciseState('recording');
        exerciseStartTimeRef.current = Date.now();

        if (mode.phases) {
          // Multi-phase mode: iterate through phases
          let phaseIdx = 0;
          currentPhaseRef.current = 0;
          setCurrentPhaseIndex(0);
          let phaseRemaining = mode.phases[0].duration;
          setPhaseTimeRemaining(phaseRemaining);
          const totalDuration = mode.phases.reduce((s, p) => s + p.duration, 0);
          setTimeRemaining(totalDuration);

          timerRef.current = setInterval(() => {
            phaseRemaining--;
            setPhaseTimeRemaining(phaseRemaining);
            setTimeRemaining(prev => Math.max(0, prev - 1));

            if (phaseRemaining <= 0) {
              phaseIdx++;
              if (phaseIdx >= mode.phases.length) {
                clearInterval(timerRef.current);
                timerRef.current = null;
                finishExercise(mode);
                return;
              }
              currentPhaseRef.current = phaseIdx;
              setCurrentPhaseIndex(phaseIdx);
              phaseRemaining = mode.phases[phaseIdx].duration;
              setPhaseTimeRemaining(phaseRemaining);
            }
          }, 1000);
        } else {
          // Simple single-phase mode
          let remaining = mode.duration;
          setTimeRemaining(remaining);

          timerRef.current = setInterval(() => {
            remaining--;
            setTimeRemaining(remaining);
            if (remaining <= 0) {
              clearInterval(timerRef.current);
              timerRef.current = null;
              finishExercise(mode);
            }
          }, 1000);
        }
      }
    }, 1000);
  }, [finishExercise]);

  const stopExercise = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (selectedMode && exerciseStateRef.current === 'recording') {
      finishExercise(selectedMode);
    } else {
      exerciseStateRef.current = 'idle';
      setExerciseState('idle');
    }
  }, [selectedMode, finishExercise]);

  const resetExercise = () => {
    exerciseStateRef.current = 'idle';
    setExerciseState('idle');
    setSelectedMode(null);
    setSessionAvgBSI(null);
    setSessionAvgLeftPct(null);
    setSessionAvgRightPct(null);
    setSessionCoPVelocity(null);
    setSessionCoPTranslation(null);
    setSessionCoPEllipseArea(null);
    setFatigueHoldBSI(null);
    setFatigueBsiCheckBSI(null);
    setFatigueBsiDelta(null);
    setFatigueHoldFrontPct(null);
    setFatigueBsiCheckFrontPct(null);
    setSampleCount(0);
    setCurrentPhaseIndex(0);
    currentPhaseRef.current = 0;
    setPosteriorShiftAlert(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // BSI color thresholds
  const bsiColor = (val) => {
    if (val < 10) return '#4ade80';
    if (val < 15) return '#fbbf24';
    return '#ef4444';
  };

  // Current phase info for display
  const currentPhase = selectedMode?.phases ? selectedMode.phases[currentPhaseIndex] : null;
  const isPhased = !!selectedMode?.phases;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ─── BSI Display ─── */}
      {(balanceBoard.isConnected || exerciseState !== 'idle') && (
        <div className="glass-panel" style={{
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div style={{ textAlign: 'center', flex: '1 1 200px', minWidth: '200px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
              Bilateral Symmetry Index
            </div>
            <div style={{
              fontSize: '56px',
              fontWeight: 900,
              fontFamily: 'monospace',
              color: exerciseState === 'complete'
                ? bsiColor(sessionAvgBSI || 0)
                : bsiColor(currentBSI),
              lineHeight: 1,
            }}>
              {exerciseState === 'complete'
                ? (sessionAvgBSI !== null ? sessionAvgBSI.toFixed(1) : '—')
                : currentBSI.toFixed(1)
              }%
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              {exerciseState === 'complete'
                ? 'Session Average'
                : (total > 20 ? `Bias: ${dominantSide}` : 'Step on board')
              }
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px', flex: '0 0 auto' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Left</div>
              <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'monospace', color: '#4ade80' }}>
                {exerciseState === 'complete'
                  ? (sessionAvgLeftPct !== null ? sessionAvgLeftPct.toFixed(1) : '—')
                  : leftPct.toFixed(1)
                }%
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Right</div>
              <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'monospace', color: '#a855f7' }}>
                {exerciseState === 'complete'
                  ? (sessionAvgRightPct !== null ? sessionAvgRightPct.toFixed(1) : '—')
                  : rightPct.toFixed(1)
                }%
              </div>
            </div>
          </div>

          {/* A/P indicator (live) */}
          {exerciseState === 'recording' && total > 20 && (
            <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Front</div>
              <div style={{
                fontSize: '24px', fontWeight: 800, fontFamily: 'monospace',
                color: frontPct < POSTERIOR_SHIFT_THRESHOLD ? '#ef4444' : '#64748b',
              }}>
                {frontPct.toFixed(1)}%
              </div>
            </div>
          )}

          <div style={{ textAlign: 'right', fontSize: '10px', color: '#64748b', lineHeight: 1.6, flex: '0 0 auto' }}>
            <div><span style={{ color: '#4ade80' }}>●</span> &lt;10% — Return to sport</div>
            <div><span style={{ color: '#fbbf24' }}>●</span> 10–15% — Acceptable</div>
            <div><span style={{ color: '#ef4444' }}>●</span> &gt;15% — Needs work</div>
          </div>
        </div>
      )}

      {/* ─── Posterior Shift Alert ─── Live during recording */}
      {exerciseState === 'recording' && posteriorShiftAlert && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '12px 20px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>
              Posterior Weight Shift Detected
            </div>
            <div style={{ fontSize: '11px', color: '#f87171', marginTop: '2px' }}>
              Front load {frontPct.toFixed(1)}% (threshold: {POSTERIOR_SHIFT_THRESHOLD}%) — possible Achilles compensation pattern. Try shifting weight forward.
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Mode Selection Cards ─── */}
      {(exerciseState === 'idle' || exerciseState === 'complete') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          {EXERCISE_MODES.map(mode => {
            const Icon = mode.icon;
            const isSelected = selectedMode?.id === mode.id;
            const totalDuration = mode.phases
              ? mode.phases.reduce((s, p) => s + p.duration, 0)
              : mode.duration;
            return (
              <button
                key={mode.id}
                onClick={() => {
                  if (!balanceBoard.isConnected) return;
                  startExercise(mode);
                }}
                disabled={!balanceBoard.isConnected}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: isSelected ? `2px solid ${mode.color}` : '1px solid #334155',
                  background: isSelected ? `${mode.color}15` : 'rgba(30, 41, 59, 0.5)',
                  cursor: balanceBoard.isConnected ? 'pointer' : 'not-allowed',
                  opacity: balanceBoard.isConnected ? 1 : 0.4,
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Icon size={20} style={{ color: mode.color }} />
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>{mode.name}</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                  {mode.description}
                </p>
                <div style={{ marginTop: '10px', fontSize: '12px', color: mode.color, fontWeight: 600 }}>
                  <Timer size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  {totalDuration}s
                  {mode.phases && (
                    <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '6px' }}>
                      ({mode.phases.length} phases)
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Countdown Overlay ─── */}
      {exerciseState === 'countdown' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px', background: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px',
          border: '1px solid #334155',
        }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
            Get Ready — {selectedMode?.name}
          </div>
          {isPhased && (
            <div style={{ fontSize: '11px', color: selectedMode?.color, marginBottom: '4px' }}>
              First: {selectedMode.phases[0].instruction}
            </div>
          )}
          <motion.div
            key={countdownValue}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: '96px', fontWeight: 900, color: selectedMode?.color, fontFamily: 'monospace' }}
          >
            {countdownValue}
          </motion.div>
          <button onClick={stopExercise} style={{
            marginTop: '16px', padding: '8px 20px', borderRadius: '8px', border: '1px solid #475569',
            background: 'transparent', color: '#94a3b8', fontSize: '12px', cursor: 'pointer'
          }}>
            Cancel
          </button>
        </div>
      )}

      {/* ─── Recording Timer Bar ─── */}
      {exerciseState === 'recording' && selectedMode && (
        <div className="glass-panel" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: currentPhase && !currentPhase.recording ? '#fbbf24' : '#ef4444',
                animation: 'pulse-red 1.5s infinite',
              }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>
                {selectedMode.name}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                {sampleCount} samples
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{
                fontSize: '36px', fontWeight: 900, fontFamily: 'monospace',
                color: timeRemaining <= 5 ? '#ef4444' : selectedMode.color,
              }}>
                {isPhased ? phaseTimeRemaining : timeRemaining}s
              </span>
              <button onClick={stopExercise} style={{
                padding: '8px 16px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #64748b, #475569)',
                color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <Square size={14} /> STOP
              </button>
            </div>
          </div>

          {/* Phase instruction banner for multi-phase modes */}
          {isPhased && currentPhase && (
            <div style={{
              padding: '10px 16px',
              marginBottom: '10px',
              borderRadius: '8px',
              background: currentPhase.recording
                ? `${selectedMode.color}20`
                : 'rgba(251, 191, 36, 0.1)',
              border: `1px solid ${currentPhase.recording ? selectedMode.color : '#fbbf2480'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <span style={{
                  fontSize: '13px', fontWeight: 700,
                  color: currentPhase.recording ? selectedMode.color : '#fbbf24',
                }}>
                  {currentPhase.name}
                </span>
                <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '12px' }}>
                  {currentPhase.instruction}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>
                Phase {currentPhaseIndex + 1}/{selectedMode.phases.length}
                {!currentPhase.recording && ' (not recording)'}
              </div>
            </div>
          )}

          {/* Phase progress dots */}
          {isPhased && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              {selectedMode.phases.map((phase, idx) => {
                const phaseTotal = selectedMode.phases.reduce((s, p) => s + p.duration, 0);
                const widthPct = (phase.duration / phaseTotal) * 100;
                let bg = '#1e293b';
                if (idx < currentPhaseIndex) bg = selectedMode.color;
                else if (idx === currentPhaseIndex) {
                  bg = phase.recording ? selectedMode.color : '#fbbf24';
                }
                return (
                  <div key={idx} style={{
                    height: '6px',
                    width: `${widthPct}%`,
                    borderRadius: '3px',
                    background: bg,
                    opacity: idx <= currentPhaseIndex ? 1 : 0.3,
                    transition: 'all 0.3s ease',
                  }} />
                );
              })}
            </div>
          )}

          {/* Overall progress bar (simple modes) */}
          {!isPhased && (
            <div style={{ height: '4px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${((selectedMode.duration - timeRemaining) / selectedMode.duration) * 100}%` }}
                transition={{ duration: 0.5, ease: 'linear' }}
                style={{ height: '100%', background: selectedMode.color, borderRadius: '2px' }}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── Session Complete Summary ─── */}
      {exerciseState === 'complete' && sessionAvgBSI !== null && (
        <div className="glass-panel" style={{ padding: '20px', border: `1px solid ${selectedMode?.color || '#334155'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#e2e8f0' }}>
              Session Complete — {selectedMode?.name}
            </h3>
            <button onClick={resetExercise} style={{
              padding: '8px 16px', borderRadius: '8px', border: '1px solid #475569',
              background: 'transparent', color: '#e2e8f0', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
            }}>
              NEW SESSION
            </button>
          </div>

          {/* Row 1: Core metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: bsiColor(sessionAvgBSI) }}>
                {sessionAvgBSI.toFixed(1)}%
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Avg BSI</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: '#4ade80' }}>
                {sessionAvgLeftPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Avg Left</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: '#a855f7' }}>
                {sessionAvgRightPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Avg Right</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: '#e2e8f0' }}>
                {sampleCount}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Samples</div>
            </div>
          </div>

          {/* Row 2: VALD-aligned CoP metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', color: '#38bdf8' }}>
                {sessionCoPVelocity !== null ? sessionCoPVelocity.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>CoP Velocity (%/s)</div>
              <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>postural correction speed</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', color: '#f472b6' }}>
                {sessionCoPTranslation !== null ? sessionCoPTranslation.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>CoP Translation (%)</div>
              <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>max sway range</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', color: '#fbbf24' }}>
                {sessionCoPEllipseArea !== null ? sessionCoPEllipseArea.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>CoP Ellipse Area (%²)</div>
              <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>95% confidence sway area</div>
            </div>
          </div>

          {/* Row 3: Fatigue Protocol Results (only for phased modes) */}
          {isPhased && fatigueHoldBSI !== null && fatigueBsiCheckBSI !== null && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', fontWeight: 600 }}>
                Fatigue Response Analysis
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ textAlign: 'center', padding: '14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #818cf830' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'monospace', color: bsiColor(fatigueHoldBSI) }}>
                    {fatigueHoldBSI.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>BSI During Holds</div>
                  <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>heel rise phase avg</div>
                </div>
                <div style={{ textAlign: 'center', padding: '14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #818cf830' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'monospace', color: bsiColor(fatigueBsiCheckBSI) }}>
                    {fatigueBsiCheckBSI.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>BSI Post-Fatigue</div>
                  <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>bilateral stance check</div>
                </div>
                <div style={{
                  textAlign: 'center', padding: '14px', borderRadius: '8px',
                  background: fatigueBsiDelta > 5 ? 'rgba(239, 68, 68, 0.1)' : fatigueBsiDelta > 2 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)',
                  border: `1px solid ${fatigueBsiDelta > 5 ? '#ef444480' : fatigueBsiDelta > 2 ? '#fbbf2480' : '#4ade8080'}`,
                }}>
                  <div style={{
                    fontSize: '22px', fontWeight: 800, fontFamily: 'monospace',
                    color: fatigueBsiDelta > 5 ? '#ef4444' : fatigueBsiDelta > 2 ? '#fbbf24' : '#4ade80',
                  }}>
                    {fatigueBsiDelta > 0 ? '+' : ''}{fatigueBsiDelta.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>BSI Delta</div>
                  <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                    {fatigueBsiDelta > 5 ? 'significant fatigue shift' : fatigueBsiDelta > 2 ? 'moderate fatigue shift' : 'minimal fatigue effect'}
                  </div>
                </div>
              </div>

              {/* Front pct comparison */}
              {fatigueHoldFrontPct !== null && fatigueBsiCheckFrontPct !== null && (
                <div style={{
                  marginTop: '10px', padding: '10px 16px', borderRadius: '8px',
                  background: '#0f172a', border: '1px solid #1e293b',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    A/P Shift: Hold avg <span style={{ color: '#e2e8f0', fontWeight: 700, fontFamily: 'monospace' }}>{fatigueHoldFrontPct.toFixed(1)}%</span> front
                    → Post-fatigue <span style={{
                      color: fatigueBsiCheckFrontPct < POSTERIOR_SHIFT_THRESHOLD ? '#ef4444' : '#e2e8f0',
                      fontWeight: 700, fontFamily: 'monospace',
                    }}>{fatigueBsiCheckFrontPct.toFixed(1)}%</span> front
                  </div>
                  {fatigueBsiCheckFrontPct < fatigueHoldFrontPct - 3 && (
                    <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                      ⚠ posterior shift under fatigue
                    </div>
                  )}
                </div>
              )}

              {/* Clinical interpretation */}
              <div style={{
                marginTop: '10px', padding: '10px 16px', borderRadius: '8px',
                background: 'rgba(30, 41, 59, 0.5)', fontSize: '11px', color: '#64748b', lineHeight: 1.5,
              }}>
                {fatigueBsiDelta > 5
                  ? 'VALD research (Sara et al. 2021): >20% peak force deficit post-endurance indicates abnormal fatigue response. Your BSI shift suggests the fatigued side is losing symmetry significantly — focus on endurance training for the weaker side.'
                  : fatigueBsiDelta > 2
                  ? 'Moderate fatigue-induced asymmetry shift detected. Monitor this across sessions — if the delta increases over time, endurance capacity on the weaker side may need targeted work.'
                  : 'Minimal fatigue effect on symmetry — good endurance capacity on both sides. The calf complex is maintaining force output under fatigue.'
                }
              </div>
            </div>
          )}

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
            Data saved to Balance_Board_2/{selectedMode?.folder}/
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseMode;
