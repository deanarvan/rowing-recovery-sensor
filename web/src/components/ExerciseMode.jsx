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

const ExerciseMode = ({ balanceBoard, liveSensors, onExportSession }) => {
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

  // Accept data from either USB balance board or BLE sensors
  const isAnyConnected = balanceBoard.isConnected || balanceBoard.isReplaying || (liveSensors && liveSensors.isConnected);
  const data = balanceBoard.isConnected || balanceBoard.isReplaying
    ? balanceBoard.instantaneousData
    : (liveSensors && liveSensors.isConnected ? liveSensors.instantaneousData : balanceBoard.instantaneousData);
  const left = data?.leftForce || 0;
  const right = data?.rightForce || 0;
  const total = left + right;
  const leftPct = total > 0 ? (left / total) * 100 : 50;
  const rightPct = total > 0 ? (right / total) * 100 : 50;
  const currentBSI = total > 0 ? Math.abs(left - right) / total * 100 : 0;
  const dominantSide = left > right ? 'LEFT' : right > left ? 'RIGHT' : 'EVEN';

  // Compute front/back percentage for AP axis
  // USB balance board: raw.fl/fr (front) vs raw.rl/rr (rear)
  // BLE insoles: toe+ball (front) vs heel (rear)
  const raw = data?.raw || {};
  let frontForce, rearForce;
  if (raw.fl !== undefined || raw.fr !== undefined) {
    frontForce = (raw.fl || 0) + (raw.fr || 0);
    rearForce = (raw.rl || 0) + (raw.rr || 0);
  } else if (data?.leftRaw || data?.rightRaw) {
    const lr = data.leftRaw || {};
    const rr = data.rightRaw || {};
    frontForce = (lr.toe || 0) + (lr.ball || 0) + (rr.toe || 0) + (rr.ball || 0);
    rearForce = (lr.heel || 0) + (rr.heel || 0);
  } else {
    frontForce = 0;
    rearForce = 0;
  }
  const frontPct = total > 0 ? (frontForce / (frontForce + rearForce || 1)) * 100 : 50;

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

  // BSI value for display
  const displayBSI = exerciseState === 'complete' ? (sessionAvgBSI ?? 0) : currentBSI;
  const displayColor = bsiColor(displayBSI);

  // SVG ring gauge helper
  const bsiRingPct = Math.min(displayBSI / 25, 1); // 25% = full ring
  const ringRadius = 38;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - bsiRingPct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

      {/* ─── BSI Gauge + L/R + Exercise Cards — all in one row ─── */}
      {(isAnyConnected || exerciseState !== 'idle') && (
        <div className="glass-panel" style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          {/* BSI Ring Gauge */}
          <div style={{ position: 'relative', width: '90px', height: '90px', flexShrink: 0 }}>
            <svg width="90" height="90" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r={ringRadius} fill="none" stroke="#1e293b" strokeWidth="6" />
              <circle cx="45" cy="45" r={ringRadius} fill="none" stroke={displayColor} strokeWidth="6"
                strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                strokeLinecap="round" transform="rotate(-90 45 45)"
                style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }} />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 900, fontFamily: 'monospace', color: displayColor, lineHeight: 1 }}>
                {displayBSI.toFixed(1)}%
              </div>
              <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px', textTransform: 'uppercase' }}>
                {exerciseState === 'complete' ? 'Avg BSI' : (total > 20 ? dominantSide : 'BSI')}
              </div>
            </div>
          </div>

          {/* L / R percentages */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: '#4ade80', fontWeight: 700, width: '14px' }}>L</span>
              <span style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'monospace', color: '#4ade80' }}>
                {(exerciseState === 'complete' ? sessionAvgLeftPct : leftPct)?.toFixed(1) ?? '—'}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: '#a855f7', fontWeight: 700, width: '14px' }}>R</span>
              <span style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'monospace', color: '#a855f7' }}>
                {(exerciseState === 'complete' ? sessionAvgRightPct : rightPct)?.toFixed(1) ?? '—'}%
              </span>
            </div>
            {exerciseState === 'recording' && total > 20 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, width: '14px' }}>AP</span>
                <span style={{
                  fontSize: '14px', fontWeight: 800, fontFamily: 'monospace',
                  color: frontPct < POSTERIOR_SHIFT_THRESHOLD ? '#ef4444' : '#64748b',
                }}>{frontPct.toFixed(0)}%</span>
              </div>
            )}
          </div>

          {/* Color legend — compact vertical dots */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', fontSize: '9px', color: '#64748b', flexShrink: 0 }}>
            <div><span style={{ color: '#4ade80' }}>●</span> &lt;10%</div>
            <div><span style={{ color: '#fbbf24' }}>●</span> 10–15%</div>
            <div><span style={{ color: '#ef4444' }}>●</span> &gt;15%</div>
          </div>
        </div>
      )}

      {/* ─── Posterior Shift Alert ─── compact banner */}
      {exerciseState === 'recording' && posteriorShiftAlert && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '6px 12px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ color: '#f87171', fontWeight: 600 }}>
            Posterior shift — front {frontPct.toFixed(0)}% (thresh {POSTERIOR_SHIFT_THRESHOLD}%) — shift weight forward
          </span>
        </motion.div>
      )}

      {/* ─── Mode Selection Cards ─── compact strip */}
      {(exerciseState === 'idle' || exerciseState === 'complete') && (
        <div style={{ display: 'flex', gap: '8px' }}>
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
                  if (!isAnyConnected) return;
                  startExercise(mode);
                }}
                disabled={!isAnyConnected}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: isSelected ? `2px solid ${mode.color}` : '1px solid #334155',
                  background: isSelected ? `${mode.color}15` : 'rgba(30, 41, 59, 0.5)',
                  cursor: isAnyConnected ? 'pointer' : 'not-allowed',
                  opacity: isAnyConnected ? 1 : 0.4,
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={18} style={{ color: mode.color, marginBottom: '4px' }} />
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0' }}>{mode.name}</div>
                <div style={{ fontSize: '10px', color: mode.color, fontWeight: 600, marginTop: '3px' }}>
                  {totalDuration}s
                  {mode.phases && <span style={{ color: '#64748b' }}> · {mode.phases.length}ph</span>}
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
          padding: '24px', background: 'rgba(15, 23, 42, 0.9)', borderRadius: '12px',
          border: '1px solid #334155',
        }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
            Get Ready — {selectedMode?.name}
          </div>
          {isPhased && (
            <div style={{ fontSize: '10px', color: selectedMode?.color, marginBottom: '2px' }}>
              First: {selectedMode.phases[0].instruction}
            </div>
          )}
          <motion.div
            key={countdownValue}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: '64px', fontWeight: 900, color: selectedMode?.color, fontFamily: 'monospace' }}
          >
            {countdownValue}
          </motion.div>
          <button onClick={stopExercise} style={{
            marginTop: '8px', padding: '6px 16px', borderRadius: '8px', border: '1px solid #475569',
            background: 'transparent', color: '#94a3b8', fontSize: '11px', cursor: 'pointer'
          }}>
            Cancel
          </button>
        </div>
      )}

      {/* ─── Recording Timer Bar ─── */}
      {exerciseState === 'recording' && selectedMode && (
        <div className="glass-panel" style={{ padding: '8px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: currentPhase && !currentPhase.recording ? '#fbbf24' : '#ef4444',
                animation: 'pulse-red 1.5s infinite',
              }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>
                {selectedMode.name}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                {sampleCount}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '24px', fontWeight: 900, fontFamily: 'monospace',
                color: timeRemaining <= 5 ? '#ef4444' : selectedMode.color,
              }}>
                {isPhased ? phaseTimeRemaining : timeRemaining}s
              </span>
              <button onClick={stopExercise} style={{
                padding: '5px 12px', borderRadius: '6px', border: 'none',
                background: 'linear-gradient(135deg, #64748b, #475569)',
                color: '#fff', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Square size={12} /> STOP
              </button>
            </div>
          </div>

          {/* Phase instruction — inline compact */}
          {isPhased && currentPhase && (
            <div style={{
              padding: '5px 10px', marginBottom: '6px', borderRadius: '6px',
              background: currentPhase.recording ? `${selectedMode.color}20` : 'rgba(251, 191, 36, 0.1)',
              border: `1px solid ${currentPhase.recording ? selectedMode.color : '#fbbf2480'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px',
            }}>
              <div>
                <span style={{ fontWeight: 700, color: currentPhase.recording ? selectedMode.color : '#fbbf24' }}>
                  {currentPhase.name}
                </span>
                <span style={{ color: '#94a3b8', marginLeft: '8px' }}>{currentPhase.instruction}</span>
              </div>
              <span style={{ color: '#64748b', fontSize: '10px' }}>
                {currentPhaseIndex + 1}/{selectedMode.phases.length}
              </span>
            </div>
          )}

          {/* Phase progress dots */}
          {isPhased && (
            <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
              {selectedMode.phases.map((phase, idx) => {
                const phaseTotal = selectedMode.phases.reduce((s, p) => s + p.duration, 0);
                const widthPct = (phase.duration / phaseTotal) * 100;
                let bg = '#1e293b';
                if (idx < currentPhaseIndex) bg = selectedMode.color;
                else if (idx === currentPhaseIndex) bg = phase.recording ? selectedMode.color : '#fbbf24';
                return (
                  <div key={idx} style={{
                    height: '4px', width: `${widthPct}%`, borderRadius: '2px',
                    background: bg, opacity: idx <= currentPhaseIndex ? 1 : 0.3,
                    transition: 'all 0.3s ease',
                  }} />
                );
              })}
            </div>
          )}

          {/* Overall progress bar */}
          {!isPhased && (
            <div style={{ height: '3px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
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
        <div className="glass-panel" style={{ padding: '10px 14px', border: `1px solid ${selectedMode?.color || '#334155'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
              Complete — {selectedMode?.name}
            </span>
            <button onClick={resetExercise} style={{
              padding: '5px 12px', borderRadius: '6px', border: '1px solid #475569',
              background: 'transparent', color: '#e2e8f0', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
            }}>
              NEW
            </button>
          </div>

          {/* Row 1: Core metrics — compact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: bsiColor(sessionAvgBSI) }}>
                {sessionAvgBSI.toFixed(1)}%
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>BSI</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: '#4ade80' }}>
                {sessionAvgLeftPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>Left</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: '#a855f7' }}>
                {sessionAvgRightPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>Right</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: '#e2e8f0' }}>
                {sampleCount}
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>Samples</div>
            </div>
          </div>

          {/* Row 2: CoP metrics — compact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '6px' }}>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#38bdf8' }}>
                {sessionCoPVelocity !== null ? sessionCoPVelocity.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>CoP Vel (%/s)</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#f472b6' }}>
                {sessionCoPTranslation !== null ? sessionCoPTranslation.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>CoP Trans (%)</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#fbbf24' }}>
                {sessionCoPEllipseArea !== null ? sessionCoPEllipseArea.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>Ellipse (%²)</div>
            </div>
          </div>

          {/* Row 3: Fatigue Protocol Results */}
          {isPhased && fatigueHoldBSI !== null && fatigueBsiCheckBSI !== null && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 600 }}>
                Fatigue Response
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px', border: '1px solid #818cf830' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: bsiColor(fatigueHoldBSI) }}>
                    {fatigueHoldBSI.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>Holds</div>
                </div>
                <div style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px', border: '1px solid #818cf830' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: bsiColor(fatigueBsiCheckBSI) }}>
                    {fatigueBsiCheckBSI.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>Post-Fat</div>
                </div>
                <div style={{
                  textAlign: 'center', padding: '6px', borderRadius: '6px',
                  background: fatigueBsiDelta > 5 ? 'rgba(239, 68, 68, 0.1)' : fatigueBsiDelta > 2 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)',
                  border: `1px solid ${fatigueBsiDelta > 5 ? '#ef444480' : fatigueBsiDelta > 2 ? '#fbbf2480' : '#4ade8080'}`,
                }}>
                  <div style={{
                    fontSize: '14px', fontWeight: 800, fontFamily: 'monospace',
                    color: fatigueBsiDelta > 5 ? '#ef4444' : fatigueBsiDelta > 2 ? '#fbbf24' : '#4ade80',
                  }}>
                    {fatigueBsiDelta > 0 ? '+' : ''}{fatigueBsiDelta.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>Delta</div>
                </div>
              </div>

              {fatigueHoldFrontPct !== null && fatigueBsiCheckFrontPct !== null && (
                <div style={{
                  marginTop: '4px', padding: '4px 10px', borderRadius: '6px',
                  background: '#0f172a', border: '1px solid #1e293b',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px',
                }}>
                  <span style={{ color: '#94a3b8' }}>
                    A/P: <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{fatigueHoldFrontPct.toFixed(0)}%</span>
                    → <span style={{
                      color: fatigueBsiCheckFrontPct < POSTERIOR_SHIFT_THRESHOLD ? '#ef4444' : '#e2e8f0',
                      fontFamily: 'monospace',
                    }}>{fatigueBsiCheckFrontPct.toFixed(0)}%</span>
                  </span>
                  {fatigueBsiCheckFrontPct < fatigueHoldFrontPct - 3 && (
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>post. shift</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '6px', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>
            Saved to Balance_Board_2/{selectedMode?.folder}/
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseMode;
