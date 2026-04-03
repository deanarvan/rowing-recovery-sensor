import { useState, useRef, useEffect } from 'react';

const SERVICE_UUID = "4fafc201-1fb5-459e-8bcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

export const useForceData = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    // Rowing Mode State
    const [liveData, setLiveData] = useState([]);
    const [cumulativeData, setCumulativeData] = useState([]);

    // Balance Board State (Always updates, no thresholds)
    const [instantaneousData, setInstantaneousData] = useState({
        leftForce: 0, rightForce: 0,
        leftRaw: { heel: 0, ball: 0, toe: 0 },
        rightRaw: { heel: 0, ball: 0, toe: 0 }
    });
    const [strokePhase, setStrokePhase] = useState('idle');
    const [strokeCount, setStrokeCount] = useState(0);
    const [strokeRate, setStrokeRate] = useState(0);
    const [strokePeaks, setStrokePeaks] = useState([]);
    const [rollingAverage, setRollingAverage] = useState(0);
    const [sensorWarnings, setSensorWarnings] = useState([]);
    const bleFilteredCountRef = useRef(0);

    const deviceRef = useRef(null);
    const characteristicRef = useRef(null);

    // Stroke detection state
    const isDrivingRef = useRef(false);
    const strokeStartTimeRef = useRef(0);
    const lastStrokeTimeRef = useRef(null);
    const rawDataBufferRef = useRef([]);

    // Peak/Trough Detection
    const peakDetectorRef = useRef({
        state: 'seeking_trough',
        currentMax: 0,
        currentMin: Infinity,
        lastPeakValue: 0,
        lastTroughValue: 0,
        samplesSinceTransition: 0
    });
    const currentDriveDataRef = useRef([]);
    const currentPeakRef = useRef(0);
    const cumulativeStartTimeRef = useRef(Date.now());
    const blePacketCountRef = useRef(0);

    // --- Batched accumulation ---
    const cumulativeBufferRef = useRef([]);
    const syncCounterRef = useRef(0);
    const lastLiveClearRef = useRef(true);

    // ★ CRITICAL: Mutable mirror of ALL session data — never goes through React state.
    // This is the ONLY source of truth for export on disconnect.
    const allSessionDataRef = useRef([]);

    // Smoothing state
    const smoothedDataRef = useRef({
        lh: 0, lb: 0, lt: 0,
        rh: 0, rb: 0, rt: 0
    });
    const tareOffsetsRef = useRef({
        lh: 0, lb: 0, lt: 0,
        rh: 0, rb: 0, rt: 0
    });

    // Sensor health tracking
    const healthRef = useRef({
        lh: { vals: [], status: 'ok' }, lb: { vals: [], status: 'ok' }, lt: { vals: [], status: 'ok' },
        rh: { vals: [], status: 'ok' }, rb: { vals: [], status: 'ok' }, rt: { vals: [], status: 'ok' }
    });

    const SMOOTHING_FACTOR = 0.3;

    // Peak/Trough Detection Parameters
    const DROP_PCT = 0.30;
    const RISE_PCT = 0.30;
    const MIN_FORCE = 30;
    const MIN_SAMPLES = 5;

    // ★ External disconnect callback — set by App.jsx, called directly from BLE event
    const onDisconnectCallbackRef = useRef(null);

    const handleDisconnect = () => {
        console.log("[BLE] Disconnected. allSessionDataRef has %d points", allSessionDataRef.current.length);

        // ★ Fire export callback FIRST, synchronously, with the full mutable array.
        // No React state, no effects, no batching — just a direct function call.
        if (onDisconnectCallbackRef.current && allSessionDataRef.current.length > 0) {
            console.log("[BLE] Firing export callback with %d points", allSessionDataRef.current.length);
            try {
                // Pass a copy so the caller owns the data even after we clear
                onDisconnectCallbackRef.current(allSessionDataRef.current.slice());
            } catch (err) {
                console.error("[BLE] Export callback error:", err);
            }
        }

        // Flush remaining buffer to React state (for UI review after disconnect)
        if (cumulativeBufferRef.current.length > 0) {
            setCumulativeData(prev => {
                const combined = prev.concat(cumulativeBufferRef.current);
                cumulativeBufferRef.current = [];
                if (combined.length > 10000) return combined.slice(-10000);
                return combined;
            });
        }

        // Clear session data for next run
        allSessionDataRef.current = [];

        setIsConnected(false);
        setStrokePhase('idle');
    };

    const tareSensors = () => {
        tareOffsetsRef.current = {
            lh: smoothedDataRef.current.lh,
            lb: smoothedDataRef.current.lb,
            lt: smoothedDataRef.current.lt,
            rh: smoothedDataRef.current.rh,
            rb: smoothedDataRef.current.rb,
            rt: smoothedDataRef.current.rt
        };
        console.log("Sensors tared to:", tareOffsetsRef.current);
    };

    const connect = async () => {
        if (!navigator.bluetooth) {
            alert("Web Bluetooth is not supported in this browser. Please use Chrome or Edge.");
            return;
        }

        try {
            setIsConnecting(true);

            // ★ Clear session data for fresh start
            allSessionDataRef.current = [];

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'Rowing_S' }],
                optionalServices: [SERVICE_UUID]
            });

            device.addEventListener('gattserverdisconnected', handleDisconnect);
            deviceRef.current = device;

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

            characteristicRef.current = characteristic;

            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);

            setIsConnected(true);
            setIsConnecting(false);
            setStrokePhase('recovery');
        } catch (error) {
            console.error("Bluetooth connection failed:", error);
            setIsConnecting(false);
        }
    };

    const disconnect = () => {
        if (deviceRef.current && deviceRef.current.gatt.connected) {
            deviceRef.current.gatt.disconnect();
        }
    };

    const handleCharacteristicValueChanged = (event) => {
        const value = event.target.value;

        const raw_lh = value.getUint16(0, true);
        const raw_lb = value.getUint16(2, true);
        const raw_lt = value.getUint16(4, true);

        const raw_rh = value.getUint16(6, true);
        const raw_rb = value.getUint16(8, true);
        const raw_rt = value.getUint16(10, true);

        const rawValues = { lh: raw_lh, lb: raw_lb, lt: raw_lt, rh: raw_rh, rb: raw_rb, rt: raw_rt };
        const activeWarnings = [];

        const packetNum = blePacketCountRef.current++;
        if (packetNum % 500 === 0 || packetNum < 3) {
            console.log(`[BLE Pkt #${packetNum}] RAW:`, JSON.stringify(rawValues));
        }

        // Filter out partial Bluetooth reads
        const zeroCount = Object.values(rawValues).filter(v => v === 0).length;
        if (zeroCount >= 5) {
            bleFilteredCountRef.current++;
            return;
        }

        // Sensor health tracking
        Object.keys(rawValues).forEach(key => {
            const h = healthRef.current[key];
            h.vals.push(rawValues[key]);
            if (h.vals.length > 100) h.vals.shift();

            if (h.vals.length === 100) {
                const activeCount = h.vals.filter(v => v > 50).length;
                const activePct = activeCount / 100;

                if (activePct < 0.05) {
                    h.status = 'dead';
                    activeWarnings.push(`Sensor ${key.toUpperCase()} is DEAD (<5% active). Excluding from CoP.`);
                } else if (activePct < 0.50) {
                    h.status = 'intermittent';
                    activeWarnings.push(`Sensor ${key.toUpperCase()} is INTERMITTENT (${Math.round(activePct * 100)}% active).`);
                } else {
                    const max = Math.max(...h.vals);
                    const min = Math.min(...h.vals);
                    if (max - min < 50 && max > 1000) {
                        h.status = 'stuck';
                        activeWarnings.push(`Sensor ${key.toUpperCase()} is STUCK at ~${max}. Recalibrate or replace.`);
                    } else {
                        h.status = 'ok';
                    }
                }
            }
        });

        if (packetNum % 20 === 0) {
            setSensorWarnings(activeWarnings);
        }

        // EMA smoothing
        smoothedDataRef.current.lh = healthRef.current.lh.status === 'ok' ? (raw_lh * SMOOTHING_FACTOR) + (smoothedDataRef.current.lh * (1 - SMOOTHING_FACTOR)) : 0;
        smoothedDataRef.current.lb = healthRef.current.lb.status === 'ok' ? (raw_lb * SMOOTHING_FACTOR) + (smoothedDataRef.current.lb * (1 - SMOOTHING_FACTOR)) : 0;
        smoothedDataRef.current.lt = healthRef.current.lt.status === 'ok' ? (raw_lt * SMOOTHING_FACTOR) + (smoothedDataRef.current.lt * (1 - SMOOTHING_FACTOR)) : 0;
        smoothedDataRef.current.rh = healthRef.current.rh.status === 'ok' ? (raw_rh * SMOOTHING_FACTOR) + (smoothedDataRef.current.rh * (1 - SMOOTHING_FACTOR)) : 0;
        smoothedDataRef.current.rb = healthRef.current.rb.status === 'ok' ? (raw_rb * SMOOTHING_FACTOR) + (smoothedDataRef.current.rb * (1 - SMOOTHING_FACTOR)) : 0;
        smoothedDataRef.current.rt = healthRef.current.rt.status === 'ok' ? (raw_rt * SMOOTHING_FACTOR) + (smoothedDataRef.current.rt * (1 - SMOOTHING_FACTOR)) : 0;

        const left_heel = Math.max(0, Math.round(smoothedDataRef.current.lh - tareOffsetsRef.current.lh));
        const left_ball = Math.max(0, Math.round(smoothedDataRef.current.lb - tareOffsetsRef.current.lb));
        const left_toe = Math.max(0, Math.round(smoothedDataRef.current.lt - tareOffsetsRef.current.lt));

        const right_heel = Math.max(0, Math.round(smoothedDataRef.current.rh - tareOffsetsRef.current.rh));
        const right_ball = Math.max(0, Math.round(smoothedDataRef.current.rb - tareOffsetsRef.current.rb));
        const right_toe = Math.max(0, Math.round(smoothedDataRef.current.rt - tareOffsetsRef.current.rt));

        const rawLeftTotal = left_heel + left_ball + left_toe;
        const rawRightTotal = right_heel + right_ball + right_toe;

        const SCALE_FACTOR = 0.005;

        const leftTotal = Math.round(rawLeftTotal * SCALE_FACTOR);
        const rightTotal = Math.round(rawRightTotal * SCALE_FACTOR);
        const combinedTotal = leftTotal + rightTotal;

        const now = Date.now();
        let cumulativeTimeS = (now - cumulativeStartTimeRef.current) / 1000;

        // ===== PEAK/TROUGH STROKE DETECTION =====
        const detector = peakDetectorRef.current;
        detector.samplesSinceTransition++;
        let phaseTransitioned = false;

        if (detector.state === 'seeking_peak') {
            if (combinedTotal > detector.currentMax) {
                detector.currentMax = combinedTotal;
            }
            const dropPct = detector.currentMax > 0
                ? (detector.currentMax - combinedTotal) / detector.currentMax
                : 0;
            if (dropPct > DROP_PCT && detector.currentMax > MIN_FORCE && detector.samplesSinceTransition > MIN_SAMPLES) {
                detector.lastPeakValue = detector.currentMax;
                detector.state = 'seeking_trough';
                detector.currentMin = combinedTotal;
                detector.samplesSinceTransition = 0;

                isDrivingRef.current = false;
                phaseTransitioned = true;
                setStrokePhase('recovery');

                if (currentPeakRef.current > 0) {
                    setStrokePeaks(prev => {
                        const updated = [...prev, currentPeakRef.current];
                        if (updated.length > 20) return updated.slice(-20);
                        return updated;
                    });
                }
                currentPeakRef.current = 0;
            }
        } else {
            if (combinedTotal < detector.currentMin) {
                detector.currentMin = combinedTotal;
            }
            const risePct = detector.currentMin > 0
                ? (combinedTotal - detector.currentMin) / detector.currentMin
                : (combinedTotal > MIN_FORCE ? 1 : 0);
            if (risePct > RISE_PCT && detector.samplesSinceTransition > MIN_SAMPLES) {
                detector.lastTroughValue = detector.currentMin;
                detector.state = 'seeking_peak';
                detector.currentMax = combinedTotal;
                detector.samplesSinceTransition = 0;

                isDrivingRef.current = true;
                phaseTransitioned = true;
                setStrokePhase('drive');
                setStrokeCount(c => c + 1);

                if (strokeStartTimeRef.current > 0) {
                    const durationMs = now - strokeStartTimeRef.current;
                    const spm = Math.round(60000 / durationMs);
                    if (spm > 5 && spm < 60) {
                        setStrokeRate(spm);
                    }
                }

                lastStrokeTimeRef.current = now;
                strokeStartTimeRef.current = now;
            }
        }

        // Safety Fallback
        if (isDrivingRef.current && currentDriveDataRef.current.length > 250) {
            console.warn('Safety trigger: Drive phase exceeded 16s. Forcing reset.');
            isDrivingRef.current = false;
            phaseTransitioned = true;
            setStrokePhase('recovery');
            currentDriveDataRef.current = [];
            setLiveData([]);
            detector.state = 'seeking_trough';
            detector.currentMin = combinedTotal;
            detector.samplesSinceTransition = 0;
        }

        if (isDrivingRef.current && combinedTotal > currentPeakRef.current) {
            currentPeakRef.current = combinedTotal;
        }

        const progressTime = isDrivingRef.current ? now - strokeStartTimeRef.current : 0;
        const normalizedPosition = isDrivingRef.current ? Math.min(100, (progressTime / 1200) * 100) : 0;

        const point = {
            time: cumulativeTimeS,
            position: normalizedPosition,
            actual: combinedTotal,
            leftForce: leftTotal,
            rightForce: rightTotal,
            leftHeel: Math.round(left_heel * SCALE_FACTOR),
            leftBall: Math.round(left_ball * SCALE_FACTOR),
            leftToe: Math.round(left_toe * SCALE_FACTOR),
            rightHeel: Math.round(right_heel * SCALE_FACTOR),
            rightBall: Math.round(right_ball * SCALE_FACTOR),
            rightToe: Math.round(right_toe * SCALE_FACTOR),
            leftRaw: { heel: left_heel, ball: left_ball, toe: left_toe },
            rightRaw: { heel: right_heel, ball: right_ball, toe: right_toe },
            phase: isDrivingRef.current ? 'drive' : 'recovery'
        };

        // Always update instantaneous data for Balance Board mode
        setInstantaneousData(point);

        // ★ Push to mutable session mirror — this NEVER misses a point
        allSessionDataRef.current.push(point);

        // --- Batched accumulation for React state ---
        cumulativeBufferRef.current.push(point);
        syncCounterRef.current++;

        if (isDrivingRef.current) {
            currentDriveDataRef.current.push(point);
            lastLiveClearRef.current = false;
        }

        const shouldFlush = syncCounterRef.current % 3 === 0 || phaseTransitioned;
        if (shouldFlush && cumulativeBufferRef.current.length > 0) {
            setCumulativeData(prev => {
                const combined = prev.concat(cumulativeBufferRef.current);
                cumulativeBufferRef.current = [];
                if (combined.length > 10000) return combined.slice(-10000);
                return combined;
            });
        }

        if (isDrivingRef.current) {
            setLiveData(currentDriveDataRef.current.slice());
        } else if (!lastLiveClearRef.current) {
            setLiveData([]);
            lastLiveClearRef.current = true;
        }
    };

    // Calculate rolling average when strokePeaks changes
    useEffect(() => {
        if (strokePeaks.length === 0) {
            setRollingAverage(0);
            return;
        }
        const recent = strokePeaks.slice(-5);
        const avg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
        setRollingAverage(Math.round(avg * 10) / 10);
    }, [strokePeaks]);

    // Allow App.jsx to register a disconnect callback
    const setOnDisconnect = (cb) => { onDisconnectCallbackRef.current = cb; };

    return {
        isConnected,
        isConnecting,
        connect,
        disconnect,
        tareSensors,
        setOnDisconnect,
        liveData,
        cumulativeData,
        instantaneousData,
        strokePhase,
        strokeCount,
        strokeRate,
        strokePeaks,
        rollingAverage,
        sensorWarnings,
        blePacketCount: blePacketCountRef.current,
        bleFilteredCount: bleFilteredCountRef.current
    };
};

export default useForceData;
