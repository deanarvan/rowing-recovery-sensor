import React, { useState, useEffect, useRef } from 'react';
import LiveForceCurve from './components/LiveForceCurve';
import BalanceBoardView from './components/BalanceBoardView';
import ExerciseMode from './components/ExerciseMode';
import DiagnosticView from './components/DiagnosticView';
import CumulativeStrokeView from './components/CumulativeStrokeView';
import CoPTrajectory from './components/CoPTrajectory';
import RecoveryDashboard from './components/RecoveryDashboard';
import RecoveryScoreGauge from './components/RecoveryScoreGauge';
import { useSimulation } from './hooks/useSimulation';
import { useForceData } from './hooks/useForceData';
import { useStrokeAnalysis } from './hooks/useStrokeAnalysis';
import { useIntervalTraining } from './hooks/useIntervalTraining';
import { useBalanceBoardSerial } from './hooks/useBalanceBoardSerial';
import { exportDataToCSV } from './utils/physics';
import { generateSessionPDF, autoExportCSV, autoExportBalanceBoardCSV, exportExerciseSessionCSV } from './utils/sessionReport';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, BarChart, Bar, ResponsiveContainer, Legend } from 'recharts';
import { Play, Pause, Zap, Timer, Hash, Bluetooth, Download, Target, AlertTriangle, Activity, FolderOpen, Usb, Upload, Settings2 } from 'lucide-react';

const EMPTY_ARR = []; // Stable empty array reference — prevents re-render loops from new [] on each render

function App() {
  const [ankleFlexion, setAnkleFlexion] = useState(65);
  const [activityMode, setActivityMode] = useState('Recovery'); // 'Rowing', 'Balance_Board', 'Diagnostic', 'Recovery'
  const [livePlotMode, setLivePlotMode] = useState('total'); // 'total', 'heel', 'ball', 'toe'
  const [lastSession, setLastSession] = useState(null); // Snapshot of data for Review Mode
  const [injuredSide, setInjuredSide] = useState('right'); // Which leg is injured
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [saveDirectoryHandle, setSaveDirectoryHandle] = useState(null);
  const saveDirectoryRef = useRef(null); // Ref mirror to avoid stale closures in effects

  // Simulation hook for Demo Mode
  const simulation = useSimulation(ankleFlexion, {
    strokeDurationMs: 2000,
    recoveryDurationMs: 1200,
    noiseLevel: 5,
    maxCumulativeStrokes: 8,
    cumulativeResetMs: 20000,
    rollingAverageWindow: 5
  });

  // Live Hardware Data
  const liveSensors = useForceData();

  // Interval Training Data
  const intervalProps = useIntervalTraining();

  // Balance Board USB Serial
  const balanceBoard = useBalanceBoardSerial();
  const balanceBoardCSVRef = useRef(null); // Store loaded CSV text for seek

  // Handle new connection logic (Clear old session review)
  const handleConnect = () => {
    setLastSession(null);
    liveSensors.connect();
  };

  const isLiveSession = liveSensors.isConnected || simulation.isRunning;
  const hasReviewData = !isLiveSession && lastSession !== null;
  const showCharts = isLiveSession || hasReviewData;

  const activeSource = isLiveSession
    ? (liveSensors.isConnected ? liveSensors : simulation)
    : (lastSession || {}); // Fallback to empty object to prevent destructure crash

  const {
    liveData,
    cumulativeData,
    currentPosition,
    strokePhase,
    strokeCount,
    strokeRate,
    strokePeaks,
    rollingAverage,
    sensorWarnings
  } = activeSource;

  // Default fallbacks for safety during render — use module-level constant for stable reference
  const safeCumulativeData = cumulativeData || EMPTY_ARR;
  const safeLiveData = liveData || EMPTY_ARR;

  const handleDisconnect = () => {
    liveSensors.disconnect();
  };

  // ★ Register BLE disconnect callback — fires DIRECTLY from the BLE gattserverdisconnected event.
  // The callback receives the full session data from a mutable ref (allSessionDataRef),
  // completely bypassing React state, effects, and batching. This is the PRIMARY export path.
  useEffect(() => {
    liveSensors.setOnDisconnect((fullData) => {
      if (!fullData || fullData.length === 0) {
        console.log('[AutoExport] No data to export on disconnect');
        return;
      }
      const timestamp = Date.now();
      const dirHandle = saveDirectoryRef.current;
      console.log('[AutoExport] ★ Exporting %d points to folder: %s', fullData.length, dirHandle?.name || 'NONE (will use browser download)');

      // Save for UI review
      setLastSession({
        cumulativeData: fullData,
        strokeCount: 0, // not available synchronously, but data is what matters
        strokeRate: 0,
        strokePeaks: [],
        rollingAverage: 0,
        liveData: [],
        timestamp
      });

      // ★ Export CSV — this is the critical call
      autoExportCSV(fullData, timestamp, dirHandle);

      // Export PDF
      const snap = strokeSnapshotRef.current;
      generateSessionPDF({
        cumulativeData: fullData,
        strokeCount: fullData.filter((p, i, a) => i > 0 && p.phase === 'drive' && a[i-1].phase === 'recovery').length,
        strokeRate: 0,
        rollingAverage: 0,
        completedStrokes: snap.completedStrokes,
        recoveryScore: snap.recoveryScore,
        fatigueData: snap.fatigueData,
        injuredSide,
        intervalState: intervalProps.intervalState
      }, timestamp, dirHandle);
    });
  }, []); // Register once on mount — callback reads refs (not state) so never stale

  // Stroke analysis for recovery metrics
  const strokeAnalysis = useStrokeAnalysis(safeCumulativeData, strokePhase, strokeCount, intervalProps.processIntervalStroke);

  // Ref snapshot: keeps the last non-empty stroke analysis so the disconnect
  // useEffect can read valid data even after React re-renders with empty inputs.
  const strokeSnapshotRef = useRef({ completedStrokes: [], recoveryScore: null, fatigueData: null });
  useEffect(() => {
    if (strokeAnalysis.completedStrokes && strokeAnalysis.completedStrokes.length > 0) {
      strokeSnapshotRef.current = {
        completedStrokes: strokeAnalysis.completedStrokes,
        recoveryScore: strokeAnalysis.recoveryScore,
        fatigueData: strokeAnalysis.fatigueData,
      };
    }
  }, [strokeAnalysis.completedStrokes, strokeAnalysis.recoveryScore, strokeAnalysis.fatigueData]);

  const handleDownloadPDF = async (sourceData = safeCumulativeData, sourceStats = activeSource) => {
    setIsGeneratingPDF(true);
    await generateSessionPDF({
      cumulativeData: sourceData,
      strokeCount: sourceStats.strokeCount,
      strokeRate: sourceStats.strokeRate,
      rollingAverage: sourceStats.rollingAverage,
      completedStrokes: strokeAnalysis.completedStrokes,
      recoveryScore: strokeAnalysis.recoveryScore,
      fatigueData: strokeAnalysis.fatigueData,
      injuredSide,
      intervalState: intervalProps.intervalState
    }, Date.now(), saveDirectoryRef.current);
    setIsGeneratingPDF(false);
  };

  const handleSetSaveFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setSaveDirectoryHandle(handle);
      saveDirectoryRef.current = handle;
      console.log('Save folder set to:', handle.name);
    } catch (err) {
      console.log('User cancelled folder picker');
    }
  };

  // Hardware auto-export is handled by the BLE disconnect callback above (not an effect).

  // Simulation stop: export when demo ends and there's data
  useEffect(() => {
    if (!simulation.isRunning && simulation.cumulativeData.length > 0) {
      const timestamp = Date.now();
      const dirHandle = saveDirectoryRef.current; // always fresh
      console.log('[AutoExport] Sim stop — data=%d pts, folder=%s', simulation.cumulativeData.length, dirHandle?.name || 'NONE');
      setLastSession({
        cumulativeData: simulation.cumulativeData,
        strokeCount: simulation.strokeCount,
        strokeRate: simulation.strokeRate,
        strokePeaks: simulation.strokePeaks,
        rollingAverage: simulation.rollingAverage,
        liveData: simulation.liveData,
        timestamp
      });

      autoExportCSV(simulation.cumulativeData, timestamp, dirHandle);
      const snap = strokeSnapshotRef.current;
      generateSessionPDF({
        cumulativeData: simulation.cumulativeData,
        strokeCount: simulation.strokeCount,
        strokeRate: simulation.strokeRate,
        rollingAverage: simulation.rollingAverage,
        completedStrokes: snap.completedStrokes,
        recoveryScore: snap.recoveryScore,
        fatigueData: snap.fatigueData,
        injuredSide,
        intervalState: intervalProps.intervalState
      }, timestamp, dirHandle);
    }
  }, [simulation.isRunning]);

  return (
    <div style={{ minHeight: '100vh', width: '100%', padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '28px', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              Rowing Recovery Analysis
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
              Achilles tendon recovery × Ankle flexion × Force curve
            </p>
          </div>
          {/* Header Controls */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Set Save Folder */}
            <button
              onClick={handleSetSaveFolder}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid #334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: saveDirectoryHandle ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: saveDirectoryHandle ? '#22c55e' : '#f87171',
                fontWeight: 700,
                fontSize: '13px',
                transition: 'all 0.2s ease',
                borderColor: saveDirectoryHandle ? '#22c55e' : '#ef4444',
                boxShadow: saveDirectoryHandle ? 'none' : '0 0 8px rgba(239, 68, 68, 0.25)',
                animation: saveDirectoryHandle ? 'none' : 'pulse-red 2s infinite'
              }}
              title={saveDirectoryHandle ? `Saving to: ${saveDirectoryHandle.name}` : 'Choose folder for auto-exports'}
            >
              <FolderOpen size={16} />
              {saveDirectoryHandle ? saveDirectoryHandle.name.toUpperCase() : 'SET FOLDER'}
            </button>

            {/* Save Session Button */}
            {(safeCumulativeData.length > 0 || activeSource.isRunning) && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => autoExportCSV(safeCumulativeData, Date.now(), saveDirectoryRef.current)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    color: '#e2e8f0',
                    fontWeight: 700,
                    fontSize: '13px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Download size={16} /> DOWNLOAD CSV
                </button>
                <button
                  onClick={() => handleDownloadPDF()}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    color: '#e2e8f0',
                    fontWeight: 700,
                    fontSize: '13px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Download size={16} /> DOWNLOAD PDF
                </button>
              </div>
            )}

            {/* Connect Sensors Button */}
            <button
              onClick={liveSensors.isConnected ? handleDisconnect : handleConnect}
              disabled={liveSensors.isConnecting}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                cursor: liveSensors.isConnecting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: liveSensors.isConnected
                  ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                  : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
                boxShadow: liveSensors.isConnected
                  ? '0 4px 20px rgba(239, 68, 68, 0.4)'
                  : '0 4px 20px rgba(59, 130, 246, 0.4)',
                transition: 'all 0.2s ease',
                opacity: liveSensors.isConnecting ? 0.7 : 1
              }}
            >
              <Bluetooth size={16} />
              {liveSensors.isConnecting ? 'CONNECTING...' : liveSensors.isConnected ? 'DISCONNECT SENSORS' : 'CONNECT ESP32'}
            </button>

            {/* Tare Button */}
            {liveSensors.isConnected && (
              <button
                onClick={liveSensors.tareSensors}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'transparent',
                  color: '#e2e8f0',
                  fontWeight: 700,
                  fontSize: '13px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Target size={16} /> TARE SENSORS
              </button>
            )}

            {/* Demo Mode Toggle */}
            {!liveSensors.isConnected && (
              <button
                onClick={simulation.toggle}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: simulation.isRunning
                    ? 'linear-gradient(135deg, #64748b, #475569)'
                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '13px',
                  boxShadow: simulation.isRunning
                    ? 'none'
                    : '0 4px 20px rgba(34, 197, 94, 0.4)',
                  transition: 'all 0.2s ease'
                }}
              >
                {simulation.isRunning ? <Pause size={16} /> : <Play size={16} />}
                {simulation.isRunning ? 'STOP DEMO' : 'START DEMO'}
              </button>
            )}

            {/* App Mode Toggle (Rowing vs Balance Board) */}
            <div style={{ display: 'flex', background: '#1e293b', padding: '4px', borderRadius: '8px', marginRight: '8px' }}>
              <button
                onClick={() => setActivityMode('Rowing')}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: activityMode === 'Rowing' ? '#38bdf8' : 'transparent',
                  color: activityMode === 'Rowing' ? '#0f172a' : '#94a3b8',
                  fontWeight: 600, fontSize: '13px'
                }}
              >
                ROWING
              </button>
              <button
                onClick={() => setActivityMode('Balance_Board')}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: activityMode === 'Balance_Board' ? '#818cf8' : 'transparent',
                  color: activityMode === 'Balance_Board' ? '#0f172a' : '#94a3b8',
                  fontWeight: 600, fontSize: '13px'
                }}
              >
                BALANCE BOARD
              </button>
              <button
                onClick={() => setActivityMode('Diagnostic')}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: activityMode === 'Diagnostic' ? '#4ade80' : 'transparent',
                  color: activityMode === 'Diagnostic' ? '#0f172a' : '#94a3b8',
                  fontWeight: 600, fontSize: '13px'
                }}
              >
                DIAGNOSTICS
              </button>
              <button
                onClick={() => setActivityMode('Recovery')}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: activityMode === 'Recovery' ? '#f472b6' : 'transparent',
                  color: activityMode === 'Recovery' ? '#0f172a' : '#94a3b8',
                  fontWeight: 600, fontSize: '13px'
                }}
              >
                RECOVERY
              </button>
            </div>

            {/* Injured Side Toggle */}
            <div style={{ display: 'flex', background: '#1e293b', padding: '3px', borderRadius: '6px', gap: '2px' }}>
              <button
                onClick={() => setInjuredSide('left')}
                style={{
                  padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: injuredSide === 'left' ? '#f87171' : 'transparent',
                  color: injuredSide === 'left' ? '#fff' : '#64748b',
                  fontWeight: 600, fontSize: '10px'
                }}
              >
                L INJ
              </button>
              <button
                onClick={() => setInjuredSide('right')}
                style={{
                  padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: injuredSide === 'right' ? '#f87171' : 'transparent',
                  color: injuredSide === 'right' ? '#fff' : '#64748b',
                  fontWeight: 600, fontSize: '10px'
                }}
              >
                R INJ
              </button>
            </div>


          </div>
        </div>
      </header>

      {/* Sensor Warnings Banner */}
      {sensorWarnings && sensorWarnings.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {Array.from(new Set(sensorWarnings)).map((warning, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5', fontSize: '13px', fontWeight: 'bold' }}>
              <AlertTriangle size={16} />
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* BLE Diagnostic Banner — visible when hardware is connected */}
      {liveSensors.isConnected && (
        <div style={{
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <span style={{ color: '#38bdf8' }}>
            📡 BLE Packets: <strong>{liveSensors.blePacketCount || 0}</strong>
          </span>
          <span style={{ color: liveSensors.bleFilteredCount > 0 ? '#fbbf24' : '#4ade80' }}>
            Filtered: <strong>{liveSensors.bleFilteredCount || 0}</strong>
            {liveSensors.blePacketCount > 0 &&
              ` (${Math.round((liveSensors.bleFilteredCount / liveSensors.blePacketCount) * 100)}%)`
            }
          </span>
          <span style={{ color: '#94a3b8' }}>
            Processed: <strong>{(liveSensors.blePacketCount || 0) - (liveSensors.bleFilteredCount || 0)}</strong>
          </span>
        </div>
      )}

      {/* BALANCE BOARD MODE */}
      {activityMode === 'Balance_Board' && (
        <section style={{ marginBottom: '12px' }}>
          {/* Balance Board Connection Controls — compact */}
          <div className="glass-panel" style={{ padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {!balanceBoard.isConnected && !balanceBoard.isReplaying && (
              <button
                onClick={balanceBoard.connect}
                style={{
                  padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                  color: '#fff', fontWeight: 700, fontSize: '11px',
                  boxShadow: '0 2px 12px rgba(129, 140, 248, 0.3)'
                }}
              >
                <Usb size={14} /> CONNECT USB
              </button>
            )}

            {balanceBoard.isConnected && (
              <button
                onClick={async () => {
                  const history = [...(balanceBoard.sessionHistory || [])];
                  await balanceBoard.disconnect();
                  if (history.length > 5) {
                    autoExportBalanceBoardCSV(history, Date.now(), saveDirectoryRef.current);
                  }
                }}
                style={{
                  padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'linear-gradient(135deg, #64748b, #475569)',
                  color: '#fff', fontWeight: 700, fontSize: '11px'
                }}
              >
                <Usb size={14} /> DISCONNECT
              </button>
            )}

            {!balanceBoard.isConnected && !balanceBoard.isReplaying && (
              <label style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#1e293b', color: '#94a3b8', fontWeight: 600, fontSize: '11px'
              }}>
                <Upload size={14} /> LOAD CSV
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      balanceBoardCSVRef.current = reader.result;
                      balanceBoard.loadCSV(reader.result);
                    };
                    reader.readAsText(file);
                  }
                }} />
              </label>
            )}

            <div style={{ fontSize: '10px', color: balanceBoard.isConnected ? '#4ade80' : balanceBoard.isReplaying ? '#818cf8' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: balanceBoard.isConnected ? '#4ade80' : balanceBoard.isReplaying ? '#818cf8' : '#475569',
                boxShadow: balanceBoard.isConnected ? '0 0 6px #4ade80' : 'none'
              }} />
              {balanceBoard.status === 'connected' && 'Live — USB'}
              {balanceBoard.status === 'replaying' && `CSV — ${Math.round(balanceBoard.replayProgress * 100)}%`}
              {balanceBoard.status === 'connecting' && 'Connecting...'}
              {balanceBoard.status === 'disconnected' && balanceBoard.sessionHistory.length > 0 && `${balanceBoard.sessionHistory.length} samples`}
              {balanceBoard.status === 'disconnected' && balanceBoard.sessionHistory.length === 0 && 'No board'}
              {balanceBoard.status === 'error' && `Error: ${balanceBoard.errorMsg}`}
            </div>

            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              <details style={{ position: 'relative' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '10px', listStyle: 'none' }}>
                  <Settings2 size={12} /> Map
                </summary>
                <div style={{
                  position: 'absolute', right: 0, top: '100%', background: '#1e293b', border: '1px solid #334155',
                  borderRadius: '8px', padding: '10px', zIndex: 50, minWidth: '180px', marginTop: '4px'
                }}>
                  {['fl', 'fr', 'rl', 'rr'].map(csvCol => {
                    const names = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' };
                    return (
                      <div key={csvCol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                        <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{names[csvCol]} →</span>
                        <select
                          value={balanceBoard.sensorMap[csvCol]}
                          onChange={(e) => balanceBoard.setSensorMap(prev => ({ ...prev, [csvCol]: e.target.value }))}
                          style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', padding: '2px 4px', fontSize: '10px' }}
                        >
                          <option value="fl">FL</option>
                          <option value="fr">FR</option>
                          <option value="rl">RL</option>
                          <option value="rr">RR</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>

          {/* Exercise Mode — BSI gauge + exercise cards */}
          <ExerciseMode
            balanceBoard={balanceBoard}
            liveSensors={liveSensors}
            onExportSession={(folder, data, bsiData, copTrace) => {
              exportExerciseSessionCSV(folder, data, bsiData, copTrace, Date.now(), saveDirectoryRef.current);
            }}
          />

          {/* Foot panels + CoP target */}
          <div style={{ marginTop: '8px' }}>
            <BalanceBoardView
              instantaneousData={
                (balanceBoard.isConnected || balanceBoard.isReplaying || balanceBoard.sessionHistory.length > 0)
                  ? balanceBoard.instantaneousData
                  : activeSource.instantaneousData
              }
            />
          </div>

          {/* Balance History — compact */}
          {balanceBoard.sessionHistory.length > 5 && (
            <div className="glass-panel" style={{ padding: '8px 12px', marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>Balance History</div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={balanceBoard.sessionHistory.slice(-200)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="elapsed" tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={v => typeof v === 'number' ? v.toFixed(0) + 's' : ''} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} width={30} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', fontSize: '10px' }} />
                  <Line type="monotone" dataKey="leftForce" stroke="#4ade80" dot={false} strokeWidth={1.5} name="L" />
                  <Line type="monotone" dataKey="rightForce" stroke="#a855f7" dot={false} strokeWidth={1.5} name="R" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {/* DIAGNOSTIC MODE */}
      {activityMode === 'Diagnostic' && (
        <section style={{ marginBottom: '24px' }}>
          <DiagnosticView
            instantaneousData={activeSource.instantaneousData}
            balanceBoard={balanceBoard}
            balanceBoardCSVRef={balanceBoardCSVRef}
          />
        </section>
      )}

      {/* ROWING MODE */}
      {activityMode === 'Rowing' && (
        <>
          {/* Live/Review Simulation Section (shown when demo is running or reviewing old data) */}
          {showCharts && (
            <section style={{ marginBottom: '24px' }}>
              {/* Review Mode Banner */}
              {hasReviewData && (
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '14px', fontWeight: 'bold' }}>
                    <Timer size={18} />
                    Reviewing Last Session ({new Date(lastSession.timestamp).toLocaleTimeString()}) - {lastSession.strokeCount} Strokes
                  </div>
                  <button
                    onClick={() => setLastSession(null)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #475569', background: 'transparent', color: '#e2e8f0', fontSize: '12px', cursor: 'pointer' }}
                  >
                    CLEAR SESSION
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
                {/* Live Force Curve Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', background: '#1e293b', padding: '4px', borderRadius: '8px', alignSelf: 'flex-start' }}>
                    <button onClick={() => setLivePlotMode('total')} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: livePlotMode === 'total' ? '#38bdf8' : 'transparent', color: livePlotMode === 'total' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: '11px' }}>TOTAL</button>
                    <button onClick={() => setLivePlotMode('heel')} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: livePlotMode === 'heel' ? '#38bdf8' : 'transparent', color: livePlotMode === 'heel' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: '11px' }}>HEEL</button>
                    <button onClick={() => setLivePlotMode('ball')} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: livePlotMode === 'ball' ? '#38bdf8' : 'transparent', color: livePlotMode === 'ball' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: '11px' }}>BALL</button>
                    <button onClick={() => setLivePlotMode('toe')} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: livePlotMode === 'toe' ? '#38bdf8' : 'transparent', color: livePlotMode === 'toe' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: '11px' }}>TOE</button>
                  </div>
                  <LiveForceCurve
                    data={safeLiveData.length > 0 ? safeLiveData : safeCumulativeData.slice(-100)}
                    strokePhase={strokePhase}
                    currentPosition={currentPosition}
                    plotMode={livePlotMode}
                  />
                </div>
                {/* Live Stats Panel */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Session Stats
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Hash size={20} style={{ color: '#818cf8' }} />
                      <div>
                        <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{strokeCount}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Strokes</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Timer size={20} style={{ color: '#4ade80' }} />
                      <div>
                        <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{strokeRate}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>SPM (Strokes/Min)</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Zap size={20} style={{ color: '#f59e0b' }} />
                      <div>
                        <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{rollingAverage}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Avg Peak Force</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', padding: '12px', background: '#1e293b', borderRadius: '8px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
                    {hasReviewData ? (
                      <>
                        <strong style={{ color: '#38bdf8' }}>📊 Session Review Mode</strong><br />
                        Viewing static data from your previous disconnect. Click 'Clear Session' or Start Demo/Connect to begin a new session.
                      </>
                    ) : liveSensors.isConnected ? (
                      <>
                        <strong style={{ color: '#38bdf8' }}>📡 Live Hardware Mode</strong><br />
                        Streaming Web Bluetooth data from ESP32. Processing total force at {strokeRate} SPM.
                      </>
                    ) : (
                      <>
                        <strong style={{ color: '#e2e8f0' }}>🎮 Demo Mode</strong><br />
                        Simulating sensor data with Gaussian noise. Adjust the flexion slider to see how ankle recovery affects the force curve in real-time.
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Cumulative Pattern + CoP Trajectory Row — always show when data exists */}
              {safeCumulativeData.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <CumulativeStrokeView
                    data={safeCumulativeData}
                    strokeCount={strokeCount}
                    rollingAverage={rollingAverage}
                    strokePeaks={strokePeaks}
                  />
                  <CoPTrajectory data={safeCumulativeData} strokeCount={strokeCount} ankleFlexion={ankleFlexion} />
                </div>
              )}

              {/* Recovery Metrics Strip — key rehab charts visible in rowing mode */}
              {strokeAnalysis.completedStrokes.length >= 2 && (
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  {/* Recovery Score Gauge */}
                  <div className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <RecoveryScoreGauge score={strokeAnalysis.recoveryScore} size={130} />
                    <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recovery Score</p>
                  </div>

                  {/* Symmetry Index Trend */}
                  <div className="glass-panel" style={{ padding: '12px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Symmetry Index (per stroke)
                    </h4>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={strokeAnalysis.completedStrokes.map(s => ({ stroke: s.strokeNumber, si: s.symmetryIndex }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="stroke" tick={{ fontSize: 9, fill: '#64748b' }} />
                        <YAxis domain={[-100, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
                        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                        <ReferenceLine y={10} stroke="rgba(34,197,94,0.3)" strokeDasharray="2 2" label={{ value: '+10%', fontSize: 8, fill: '#4ade80' }} />
                        <ReferenceLine y={-10} stroke="rgba(34,197,94,0.3)" strokeDasharray="2 2" label={{ value: '-10%', fontSize: 8, fill: '#4ade80' }} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} formatter={(v) => [`${v.toFixed(1)}%`, 'SI']} />
                        <Line type="monotone" dataKey="si" stroke="#818cf8" strokeWidth={2} dot={{ r: 2, fill: '#818cf8' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Impulse Ratio (Left vs Right work) */}
                  <div className="glass-panel" style={{ padding: '12px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Impulse per Stroke (L vs R)
                    </h4>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={strokeAnalysis.completedStrokes.map(s => ({ stroke: s.strokeNumber, left: s.leftImpulse, right: s.rightImpulse }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="stroke" tick={{ fontSize: 9, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} />
                        <Bar dataKey="left" fill="#38bdf8" name="Left" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="right" fill="#f472b6" name="Right" radius={[2, 2, 0, 0]} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Empty State when not running and no review data */}
          {!showCharts && (
            <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', border: '1px dashed #475569', marginBottom: '24px' }}>
              <Zap size={48} style={{ color: '#64748b', marginBottom: '16px' }} />
              <h2 style={{ color: '#e2e8f0', margin: '0 0 8px 0' }}>Ready for Session</h2>
              <p style={{ color: '#94a3b8', margin: '0', maxWidth: '400px', textAlign: 'center', lineHeight: '1.5' }}>Connect the ESP32 hardware via Bluetooth or start the Demo Mode to begin recording and analyzing live rowing metrics.</p>
            </section>
          )}
        </>
      )}

      {/* RECOVERY MODE */}
      {activityMode === 'Recovery' && (
        <section style={{ marginBottom: '24px' }}>
          <RecoveryDashboard
            strokePhase={strokePhase}
            strokeCount={strokeCount}
            strokeRate={strokeRate}
            completedStrokes={strokeAnalysis.completedStrokes}
            recoveryScore={strokeAnalysis.recoveryScore}
            fatigueData={strokeAnalysis.fatigueData}
            injuredSide={injuredSide}
            strokePeaks={strokePeaks}
            intervalProps={intervalProps}
            cumulativeDataLength={safeCumulativeData.length}
          />
        </section>
      )}


      {/* Footer */}
      <footer style={{ marginTop: '32px', textAlign: 'center', color: '#475569', fontSize: '12px' }}>
        © 2026 Rowing Recovery Visualizer
      </footer>
    </div>
  );
}

export default App;
