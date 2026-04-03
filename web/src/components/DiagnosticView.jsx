import React, { useState, useEffect, useRef } from 'react';
import { Settings, Cable, Activity, AlertCircle, CheckCircle, Usb, Upload } from 'lucide-react';

const DiagnosticView = ({ instantaneousData, balanceBoard, balanceBoardCSVRef }) => {
    // ─── Tab state ────────────────────────────────────────────────────────────
    const [diagMode, setDiagMode] = useState('ble');

    // ─── BLE insole data ──────────────────────────────────────────────────────
    const bleData = instantaneousData || {
        leftRaw: { heel: 0, ball: 0, toe: 0 },
        rightRaw: { heel: 0, ball: 0, toe: 0 }
    };

    const MAX_RAW_VALUE = 26000;

    // ─── Baseline Recording (shared) ──────────────────────────────────────────
    const [isRecording, setIsRecording] = useState(false);
    const [baselineStats, setBaselineStats] = useState(null);
    const baselinePointsRef = useRef([]);

    // ─── USB raw sensor history (for sparklines) ─────────────────────────────
    const [usbHistory, setUsbHistory] = useState({ fl: [], fr: [], rl: [], rr: [] });
    const histLen = 120; // ~6 seconds at 20Hz

    // ─── Peak hold for USB sensors ───────────────────────────────────────────
    const [peaks, setPeaks] = useState({ fl: 0, fr: 0, rl: 0, rr: 0 });
    const peakTimeouts = useRef({});

    // Track USB raw values for history + peaks
    useEffect(() => {
        if (diagMode !== 'usb' || !balanceBoard?.instantaneousData?.raw) return;
        const raw = balanceBoard.instantaneousData.raw;

        setUsbHistory(prev => {
            const next = {};
            for (const k of ['fl', 'fr', 'rl', 'rr']) {
                const arr = [...prev[k], raw[k]];
                next[k] = arr.length > histLen ? arr.slice(-histLen) : arr;
            }
            return next;
        });

        // Update peaks (hold for 3 seconds then decay)
        setPeaks(prev => {
            const next = { ...prev };
            for (const k of ['fl', 'fr', 'rl', 'rr']) {
                if (raw[k] > prev[k]) {
                    next[k] = raw[k];
                    // Reset decay timer
                    if (peakTimeouts.current[k]) clearTimeout(peakTimeouts.current[k]);
                    peakTimeouts.current[k] = setTimeout(() => {
                        setPeaks(p => ({ ...p, [k]: 0 }));
                    }, 3000);
                }
            }
            return next;
        });
    }, [diagMode, balanceBoard?.instantaneousData]);

    // BLE baseline recording
    useEffect(() => {
        if (isRecording && diagMode === 'ble' && bleData && bleData.leftRaw.heel !== undefined) {
            baselinePointsRef.current.push({ ...bleData });
        }
    }, [bleData, isRecording, diagMode]);

    // USB baseline recording
    useEffect(() => {
        if (isRecording && diagMode === 'usb' && balanceBoard?.instantaneousData?.raw) {
            baselinePointsRef.current.push({ ...balanceBoard.instantaneousData.raw });
        }
    }, [balanceBoard?.instantaneousData, isRecording, diagMode]);

    const startRecording = () => {
        setIsRecording(true);
        setBaselineStats(null);
        baselinePointsRef.current = [];

        setTimeout(() => {
            setIsRecording(false);
            if (diagMode === 'ble') {
                calculateBleBaseline(baselinePointsRef.current);
            } else {
                calculateUsbBaseline(baselinePointsRef.current);
            }
        }, 2000);
    };

    const calculateBleBaseline = (points) => {
        if (points.length === 0) return;
        const channels = [
            { id: 'lh', path: ['leftRaw', 'heel'] },
            { id: 'lb', path: ['leftRaw', 'ball'] },
            { id: 'lt', path: ['leftRaw', 'toe'] },
            { id: 'rh', path: ['rightRaw', 'heel'] },
            { id: 'rb', path: ['rightRaw', 'ball'] },
            { id: 'rt', path: ['rightRaw', 'toe'] }
        ];
        const stats = {};
        channels.forEach(ch => {
            const vals = points.map(p => p[ch.path[0]][ch.path[1]]);
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
            const variance = vals.reduce((sum, v) => sum + Math.pow(v - Math.round(mean), 2), 0) / vals.length;
            const std = Math.sqrt(variance);
            let status = 'ok';
            if (max < 50) status = 'dead';
            else if (max - min < 50 && mean > 1000) status = 'stuck';
            stats[ch.id] = { min, max, mean: Math.round(mean), std: Math.round(std * 10) / 10, status };
        });
        setBaselineStats(stats);
    };

    const calculateUsbBaseline = (points) => {
        if (points.length === 0) return;
        const stats = {};
        for (const k of ['fl', 'fr', 'rl', 'rr']) {
            const vals = points.map(p => p[k] || 0);
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
            const variance = vals.reduce((sum, v) => sum + Math.pow(v - Math.round(mean), 2), 0) / vals.length;
            const std = Math.sqrt(variance);
            let status = 'ok';
            if (max < 50) status = 'dead';
            else if (max - min < 50 && mean > 1000) status = 'stuck';
            stats[k] = { min, max, mean: Math.round(mean), std: Math.round(std * 10) / 10, status };
        }
        setBaselineStats(stats);
    };

    const clearPeaks = () => setPeaks({ fl: 0, fr: 0, rl: 0, rr: 0 });

    // ─── Shared SensorBar ────────────────────────────────────────────────────
    const SensorBar = ({ label, value, color, statId, peak }) => {
        const pct = Math.max(0, Math.min(100, (value / MAX_RAW_VALUE) * 100));
        const peakPct = peak ? Math.max(0, Math.min(100, (peak / MAX_RAW_VALUE) * 100)) : 0;
        const stat = baselineStats ? baselineStats[statId] : null;

        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold' }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                        {value.toLocaleString()} raw
                        {peak > 0 && <span style={{ color: '#fbbf24', marginLeft: '8px' }}>peak {peak.toLocaleString()}</span>}
                    </span>
                </div>
                <div style={{ height: '14px', width: '100%', background: '#1e293b', borderRadius: '7px', overflow: 'hidden', position: 'relative' }}>
                    {/* Peak marker */}
                    {peakPct > 0 && (
                        <div style={{
                            position: 'absolute', left: `${peakPct}%`, top: 0, bottom: 0,
                            width: '2px', background: '#fbbf24', zIndex: 2, transform: 'translateX(-1px)'
                        }} />
                    )}
                    <div
                        style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: color,
                            transition: 'width 80ms ease-out',
                            position: 'relative', zIndex: 1
                        }}
                    />
                </div>
                {stat && (
                    <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontSize: '11px', display: 'flex', gap: '12px', color: '#94a3b8', borderLeft: `2px solid ${stat.status === 'ok' ? '#4ade80' : stat.status === 'dead' ? '#ef4444' : '#f59e0b'}` }}>
                        <span style={{ minWidth: '70px', display: 'flex', alignItems: 'center' }}>
                            {stat.status === 'ok' ? <><CheckCircle size={10} style={{ color: '#4ade80', marginRight: '4px' }} /> OK</>
                                : stat.status === 'dead' ? <><AlertCircle size={10} style={{ color: '#ef4444', marginRight: '4px' }} /> DEAD</>
                                    : <><AlertCircle size={10} style={{ color: '#f59e0b', marginRight: '4px' }} /> STUCK</>}
                        </span>
                        <span>Min: {stat.min}</span>
                        <span>Max: {stat.max}</span>
                        <span>Mean: {stat.mean}</span>
                        <span>Std: {stat.std}</span>
                    </div>
                )}
            </div>
        );
    };

    // ─── Mini sparkline canvas ───────────────────────────────────────────────
    const Sparkline = ({ data, color, width = 200, height = 40 }) => {
        const canvasRef = useRef(null);

        useEffect(() => {
            const ctx = canvasRef.current?.getContext('2d');
            if (!ctx || data.length < 2) return;

            ctx.clearRect(0, 0, width, height);

            const max = Math.max(...data, 1);
            const step = width / (histLen - 1);

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            data.forEach((v, i) => {
                const x = (data.length - 1 - (data.length - 1 - i)) * step + (histLen - data.length) * step;
                const y = height - (v / max) * (height - 4) - 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }, [data, color, width, height]);

        return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', borderRadius: '4px', background: 'rgba(0,0,0,0.15)' }} />;
    };

    // ─── ADS channel info for USB mode ───────────────────────────────────────
    const usbChannels = [
        { key: 'fl', label: 'Front Left — ADS Right Board, Channel 0', color: '#4ade80', adsLabel: '0x49 Ch0', physical: 'Front Left sensor' },
        { key: 'fr', label: 'Front Right — ADS Left Board, Channel 0', color: '#38bdf8', adsLabel: '0x48 Ch0', physical: 'Front Right sensor' },
        { key: 'rl', label: 'Rear Left — ADS Left Board, Channel 1', color: '#22c55e', adsLabel: '0x48 Ch1', physical: 'Rear Left sensor' },
        { key: 'rr', label: 'Rear Right — ADS Right Board, Channel 1', color: '#818cf8', adsLabel: '0x49 Ch1', physical: 'Rear Right sensor' },
    ];

    // Get raw USB values (unmapped — straight from firmware)
    const usbRaw = balanceBoard?.instantaneousData?.raw || { fl: 0, fr: 0, rl: 0, rr: 0 };
    const usbConnected = balanceBoard?.isConnected || balanceBoard?.isReplaying;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Mode Tabs */}
            {balanceBoard && (
                <div style={{ display: 'flex', background: '#1e293b', borderRadius: '8px', padding: '4px', alignSelf: 'flex-start' }}>
                    <button
                        onClick={() => { setDiagMode('usb'); setBaselineStats(null); }}
                        style={{
                            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: diagMode === 'usb' ? '#818cf8' : 'transparent',
                            color: diagMode === 'usb' ? '#0f172a' : '#94a3b8',
                            fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <Usb size={14} /> USB Balance Board
                    </button>
                    <button
                        onClick={() => { setDiagMode('ble'); setBaselineStats(null); }}
                        style={{
                            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: diagMode === 'ble' ? '#818cf8' : 'transparent',
                            color: diagMode === 'ble' ? '#0f172a' : '#94a3b8',
                            fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <Cable size={14} /> BLE Insole (6ch)
                    </button>
                </div>
            )}

            {/* ═══════════ USB BALANCE BOARD MODE ═══════════ */}
            {diagMode === 'usb' && balanceBoard && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                        <Usb size={20} style={{ color: '#818cf8' }} /> USB Raw Sensor Observer
                    </h3>
                    <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                        Press each FSR one at a time. Watch which channel responds to identify physical sensor positions.
                        Values shown are <strong style={{ color: '#e2e8f0' }}>raw ADS readings before any remap</strong> — straight from the firmware.
                    </p>

                    {/* Connection controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        {!usbConnected && (
                            <button
                                onClick={balanceBoard.connect}
                                style={{
                                    padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                                    color: '#fff', fontWeight: 700, fontSize: '12px',
                                    boxShadow: '0 2px 12px rgba(129, 140, 248, 0.3)'
                                }}
                            >
                                <Usb size={14} /> CONNECT
                            </button>
                        )}

                        {balanceBoard.isConnected && (
                            <button
                                onClick={balanceBoard.disconnect}
                                style={{
                                    padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: '#475569', color: '#fff', fontWeight: 700, fontSize: '12px'
                                }}
                            >
                                DISCONNECT
                            </button>
                        )}

                        {!usbConnected && (
                            <label style={{
                                padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: '#1e293b', color: '#94a3b8', fontWeight: 600, fontSize: '12px'
                            }}>
                                <Upload size={14} /> LOAD CSV
                                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                            if (balanceBoardCSVRef) balanceBoardCSVRef.current = reader.result;
                                            balanceBoard.loadCSV(reader.result);
                                        };
                                        reader.readAsText(file);
                                    }
                                }} />
                            </label>
                        )}

                        {/* Status dot */}
                        <div style={{ fontSize: '12px', color: usbConnected ? '#4ade80' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: balanceBoard.isConnected ? '#4ade80' : balanceBoard.isReplaying ? '#818cf8' : '#475569',
                                boxShadow: balanceBoard.isConnected ? '0 0 8px #4ade80' : 'none'
                            }} />
                            {balanceBoard.status === 'connected' && 'Live — USB Serial'}
                            {balanceBoard.status === 'replaying' && `Replaying — ${Math.round(balanceBoard.replayProgress * 100)}%`}
                            {balanceBoard.status === 'disconnected' && 'Not connected'}
                            {balanceBoard.status === 'error' && `Error: ${balanceBoard.errorMsg}`}
                        </div>

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                            <button
                                onClick={clearPeaks}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155',
                                    background: 'transparent', color: '#94a3b8', fontSize: '11px', cursor: 'pointer'
                                }}
                            >
                                RESET PEAKS
                            </button>
                            <button
                                onClick={startRecording}
                                disabled={isRecording || !usbConnected}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', border: '1px solid #38bdf8',
                                    background: isRecording ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                    color: '#e2e8f0', fontWeight: 600, fontSize: '11px',
                                    cursor: isRecording || !usbConnected ? 'default' : 'pointer',
                                    opacity: !usbConnected ? 0.4 : 1,
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <Activity size={12} style={{ color: '#38bdf8' }} />
                                {isRecording ? 'RECORDING...' : '2s BASELINE'}
                            </button>
                        </div>
                    </div>

                    {/* 4-channel grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {usbChannels.map(ch => {
                            const val = usbRaw[ch.key] || 0;
                            const isActive = val > 500;
                            return (
                                <div key={ch.key} style={{
                                    background: isActive ? `rgba(${ch.key.startsWith('f') ? '74, 222, 128' : '129, 140, 248'}, 0.08)` : 'rgba(0,0,0,0.15)',
                                    padding: '16px', borderRadius: '10px',
                                    border: `1px solid ${isActive ? ch.color + '66' : '#1e293b'}`,
                                    transition: 'border-color 150ms, background 150ms'
                                }}>
                                    {/* Channel header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <div>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: ch.color }}>
                                                {({ fl: 'Front Left', fr: 'Front Right', rl: 'Rear Left', rr: 'Rear Right' })[ch.key]}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>{ch.adsLabel}</span>
                                        </div>
                                        <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: isActive ? '#e2e8f0' : '#475569' }}>
                                            {val.toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#475569', marginBottom: '6px' }}>
                                        Wired to: <span style={{ color: '#94a3b8' }}>{ch.physical}</span>
                                    </div>

                                    {/* Bar */}
                                    <SensorBar
                                        label={ch.label}
                                        value={val}
                                        color={ch.color}
                                        statId={ch.key}
                                        peak={peaks[ch.key]}
                                    />

                                    {/* Sparkline */}
                                    <Sparkline data={usbHistory[ch.key]} color={ch.color} width={280} height={36} />
                                </div>
                            );
                        })}
                    </div>

                    {/* Current sensor map display */}
                    {balanceBoard.sensorMap && (
                        <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', fontSize: '12px', color: '#64748b' }}>
                            <strong style={{ color: '#94a3b8' }}>Active Sensor Map: </strong>
                            {Object.entries(balanceBoard.sensorMap).map(([phys, csv]) => {
                                const names = { fl: 'Front Left', fr: 'Front Right', rl: 'Rear Left', rr: 'Rear Right' };
                                return (
                                    <span key={phys} style={{ marginRight: '16px' }}>
                                        {names[phys]} ← <span style={{ color: '#e2e8f0' }}>{names[csv] || csv}</span>
                                    </span>
                                );
                            })}
                            <span style={{ color: '#475569' }}> (change in Balance Board tab → Sensor Map)</span>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════ BLE INSOLE MODE (original) ═══════════ */}
            {diagMode === 'ble' && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                        <Settings size={20} style={{ color: '#94a3b8' }} /> Sensor Hardware Diagnostics
                    </h3>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                        <p style={{ margin: '0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, maxWidth: '600px' }}>
                            Press on each FSR independently. Use this screen to verify which wire corresponds to which physical sensor location so you can label them before mounting them to the footpads.
                        </p>
                        <button
                            onClick={startRecording}
                            disabled={isRecording}
                            style={{
                                padding: '8px 16px', borderRadius: '6px', border: '1px solid #38bdf8',
                                background: isRecording ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                color: '#e2e8f0', fontWeight: 600, fontSize: '11px', cursor: isRecording ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                minWidth: '180px', justifyContent: 'center'
                            }}>
                            <Activity size={14} style={{ color: '#38bdf8' }} />
                            {isRecording ? 'RECORDING DATA...' : 'RECORD 2s BASELINE'}
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                        {/* Left Channels */}
                        <div style={{ background: 'rgba(74, 222, 128, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                            <h4 style={{ margin: '0 0 20px 0', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Cable size={16} /> Left ADS1115 (0x48)
                            </h4>
                            <SensorBar label="Left Toe — Top (Channel 0)" statId="lt" value={bleData.leftRaw.toe} color="#4ade80" />
                            <SensorBar label="Left Ball — Middle (Channel 1)" statId="lb" value={bleData.leftRaw.ball} color="#22c55e" />
                            <SensorBar label="Left Heel — Bottom (Channel 2)" statId="lh" value={bleData.leftRaw.heel} color="#16a34a" />
                        </div>

                        {/* Right Channels */}
                        <div style={{ background: 'rgba(168, 85, 247, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                            <h4 style={{ margin: '0 0 20px 0', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Cable size={16} /> Right ADS1115 (0x49)
                            </h4>
                            <SensorBar label="Right Toe — Top (Channel 0)" statId="rt" value={bleData.rightRaw.toe} color="#c084fc" />
                            <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                    <AlertCircle size={14} style={{ color: '#ef4444' }} />
                                    <span style={{ fontWeight: 'bold', color: '#fca5a5' }}>Right Ball — Channel 1</span>
                                    <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600, background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                                        DISABLED — A0/A1 shorted on PCB
                                    </span>
                                </div>
                            </div>
                            <SensorBar label="Right Heel — Bottom (Channel 2)" statId="rh" value={bleData.rightRaw.heel} color="#9333ea" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiagnosticView;
