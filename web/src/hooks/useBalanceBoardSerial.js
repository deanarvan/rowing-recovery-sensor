/**
 * useBalanceBoardSerial — Web Serial API hook for the 4-sensor balance board.
 *
 * Connects to the ESP32-S3 over USB serial, parses the firmware's human-readable
 * output, and converts it to the format BalanceBoardView expects.
 *
 * Also supports CSV file replay for previously recorded sessions.
 *
 * Sensor mapping (configurable via setSensorMap):
 *   CSV columns: fl, fr, rl, rr
 *   Physical positions: front-left, front-right, rear-left, rear-right
 *   → leftForce  = FL + RL    (left foot total)
 *   → rightForce = FR + RR    (right foot total)
 *   → leftRaw    = { heel: RL, ball: FL, toe: 0 }
 *   → rightRaw   = { heel: RR, ball: FR, toe: 0 }
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const BAUD_RATE = 115200;

// Parse a firmware data line like: "  5290    14      16      13      | 99.5  0.5   | 0.99   0.04"
function parseDataLine(line) {
  const nums = line.match(/[-+]?\d+\.?\d*/g);
  if (!nums || nums.length < 8) return null;
  return {
    fl: parseFloat(nums[0]),
    fr: parseFloat(nums[1]),
    rl: parseFloat(nums[2]),
    rr: parseFloat(nums[3]),
    left_pct: parseFloat(nums[4]),
    right_pct: parseFloat(nums[5]),
    left_ap: parseFloat(nums[6]),
    right_ap: parseFloat(nums[7]),
  };
}

// Convert 4-sensor data to BalanceBoardView's expected format
function toInstantaneousData(raw, sensorMap) {
  // Apply sensor remapping
  const mapped = {
    fl: raw[sensorMap.fl] || 0,
    fr: raw[sensorMap.fr] || 0,
    rl: raw[sensorMap.rl] || 0,
    rr: raw[sensorMap.rr] || 0,
  };

  const leftForce = mapped.fl + mapped.rl;
  const rightForce = mapped.fr + mapped.rr;

  return {
    leftForce,
    rightForce,
    leftRaw: { heel: mapped.rl, ball: mapped.fl, toe: 0 },
    rightRaw: { heel: mapped.rr, ball: mapped.fr, toe: 0 },
    // Extra fields for balance board specific charts
    raw: mapped,
    total: leftForce + rightForce,
  };
}

// Parse a CSV file into an array of data points
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 10) continue;
    rows.push({
      timestamp: cols[0],
      elapsed: parseFloat(cols[1]),
      fl: parseFloat(cols[2]),
      fr: parseFloat(cols[3]),
      rl: parseFloat(cols[4]),
      rr: parseFloat(cols[5]),
      left_pct: parseFloat(cols[6]),
      right_pct: parseFloat(cols[7]),
      left_ap: parseFloat(cols[8]),
      right_ap: parseFloat(cols[9]),
    });
  }
  return rows;
}

export function useBalanceBoardSerial() {
  const [isConnected, setIsConnected] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [instantaneousData, setInstantaneousData] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [status, setStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'replaying', 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [sensorMap, setSensorMap] = useState({ fl: 'fl', fr: 'fr', rl: 'rl', rr: 'rr' });
  const [replayProgress, setReplayProgress] = useState(0); // 0-1

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const readLoopRef = useRef(false);
  const historyRef = useRef([]);
  const replayTimerRef = useRef(null);
  const startTimeRef = useRef(null);
  const sensorMapRef = useRef(sensorMap);

  // Keep ref in sync
  useEffect(() => { sensorMapRef.current = sensorMap; }, [sensorMap]);

  // Push a data point to both state and ref
  const pushDataPoint = useCallback((raw, elapsed) => {
    const inst = toInstantaneousData(raw, sensorMapRef.current);
    setInstantaneousData(inst);
    const point = { ...inst, elapsed, raw: { ...raw } };
    historyRef.current.push(point);
    // Batch update history state every 10 samples to avoid render thrashing
    if (historyRef.current.length % 10 === 0) {
      setSessionHistory([...historyRef.current]);
    }
  }, []);

  // ─── Web Serial Connect ──────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!('serial' in navigator)) {
      setStatus('error');
      setErrorMsg('Web Serial API not supported. Use Chrome or Edge.');
      return;
    }

    try {
      setStatus('connecting');
      setErrorMsg('');

      // Close any lingering port from a previous session
      if (portRef.current) {
        try { await portRef.current.close(); } catch (_) {}
        portRef.current = null;
      }

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      portRef.current = port;

      // Reset session
      historyRef.current = [];
      setSessionHistory([]);
      startTimeRef.current = Date.now();

      setIsConnected(true);
      setStatus('connected');

      // Start reading — use AbortController so we can cleanly kill the pipe on disconnect
      readLoopRef.current = true;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable, { signal: abortController.signal }).catch(() => {});
      const reader = decoder.readable.getReader();
      readerRef.current = reader;

      let buffer = '';

      const readLoop = async () => {
        try {
          while (readLoopRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              const parsed = parseDataLine(trimmed);
              if (parsed) {
                const elapsed = (Date.now() - startTimeRef.current) / 1000;
                pushDataPoint(parsed, elapsed);
              }
            }
          }
        } catch (err) {
          if (readLoopRef.current) {
            console.error('Serial read error:', err);
            setStatus('error');
            setErrorMsg(err.message);
          }
        }
      };

      readLoop();

    } catch (err) {
      if (err.name === 'NotFoundError') {
        setStatus('disconnected'); // User cancelled port picker
      } else {
        setStatus('error');
        setErrorMsg(err.message);
        console.error('Serial connect error:', err);
      }
    }
  }, [pushDataPoint]);

  // ─── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    readLoopRef.current = false;

    try {
      // 1. Abort the pipeTo stream first
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // 2. Cancel the reader
      if (readerRef.current) {
        try { await readerRef.current.cancel(); } catch (_) {}
        readerRef.current = null;
      }
      // 3. Small delay to let streams settle before closing port
      await new Promise(r => setTimeout(r, 100));
      // 4. Close the port
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (err) {
      console.warn('Disconnect cleanup:', err);
      // Force-clear refs even if close failed
      portRef.current = null;
      readerRef.current = null;
    }

    setIsConnected(false);
    setStatus('disconnected');
    // Final history update
    setSessionHistory([...historyRef.current]);
  }, []);

  // ─── CSV File Replay ───────────────────────────────────────────────────────
  const loadCSV = useCallback((text) => {
    const rows = parseCSV(text);
    if (rows.length === 0) return;

    // Stop any existing replay or connection
    if (isConnected) disconnect();
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);

    historyRef.current = [];
    setSessionHistory([]);
    setIsReplaying(true);
    setStatus('replaying');

    const duration = rows[rows.length - 1].elapsed - rows[0].elapsed;
    let frameIdx = 0;

    const tick = () => {
      if (frameIdx >= rows.length) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
        setIsReplaying(false);
        setStatus('disconnected');
        setSessionHistory([...historyRef.current]);
        setReplayProgress(1);
        return;
      }

      const row = rows[frameIdx];
      pushDataPoint(row, row.elapsed);
      setReplayProgress(frameIdx / (rows.length - 1));
      frameIdx++;
    };

    // Replay at ~40Hz (matching firmware output rate)
    replayTimerRef.current = setInterval(tick, 25);
  }, [isConnected, disconnect, pushDataPoint]);

  // Jump to a specific frame during replay (for scrubbing)
  const seekReplay = useCallback((csvText, progress) => {
    const rows = parseCSV(csvText);
    if (rows.length === 0) return;
    const idx = Math.floor(progress * (rows.length - 1));
    const row = rows[idx];
    if (row) {
      const inst = toInstantaneousData(row, sensorMapRef.current);
      setInstantaneousData(inst);
      setReplayProgress(progress);
    }
  }, []);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      readLoopRef.current = false;
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, []);

  return {
    // State
    isConnected,
    isReplaying,
    instantaneousData,
    sessionHistory,
    status,
    errorMsg,
    sensorMap,
    replayProgress,

    // Actions
    connect,
    disconnect,
    loadCSV,
    seekReplay,
    setSensorMap,
  };
}
