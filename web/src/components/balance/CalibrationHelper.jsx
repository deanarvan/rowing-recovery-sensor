/**
 * CalibrationHelper — live BNO055 calibration status + guided "calibration dance".
 *
 * Input: cal = { sys, gyro, accel, mag } each 0..3 (from instantaneousData.cal),
 * or null when the board/firmware doesn't put the cal byte on the BLE wire yet.
 *
 * For the balance board, GYRO + ACCEL drive tilt accuracy (roll/pitch from the
 * gravity vector); MAG only affects heading (yaw), which this app doesn't use.
 * BNO055 cal is volatile — it re-runs every power-up, so a quick pass per session.
 */
import React, { useState } from 'react';
import { Gauge, Check, ChevronDown, ChevronUp } from 'lucide-react';

const LEVEL_COLOR = ['#ef4444', '#f59e0b', '#eab308', '#4ade80']; // 0..3

const AXES = [
    { key: 'gyro', label: 'Gyro' },
    { key: 'accel', label: 'Accel' },
    { key: 'mag', label: 'Mag' },
    { key: 'sys', label: 'System' },
];

const STEPS = [
    { key: 'gyro', n: 1, title: 'Hold still', desc: 'Rest the board flat and motionless on the floor for ~3 s.' },
    { key: 'accel', n: 2, title: 'Six positions', desc: 'Lift the board and hold it still ~3 s in each of ~6 orientations — flat, each long edge down, nose up, nose down, upside-down.' },
    { key: 'mag', n: 3, title: 'Figure-8', desc: 'Sweep the board through a few big figure-8s in the air. Optional — only affects heading (yaw), not tilt.' },
];

const Seg = ({ level }) => (
    <div style={{ display: 'flex', gap: 2 }}>
        {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 11, height: 7, borderRadius: 2, background: i < level ? LEVEL_COLOR[level] : 'rgba(51,65,85,0.7)' }} />
        ))}
    </div>
);

const CalibrationHelper = ({ cal }) => {
    const [open, setOpen] = useState(false);
    const have = cal != null;
    const sys = have ? cal.sys : 0;
    const status = !have ? { txt: 'no data', col: '#64748b' }
        : sys >= 3 ? { txt: 'calibrated', col: '#4ade80' }
        : (cal.gyro || cal.accel || cal.mag) ? { txt: 'calibrating…', col: '#f59e0b' }
        : { txt: 'uncalibrated', col: '#ef4444' };
    // current focus = lowest still-uncalibrated axis, in gyro → accel → mag order
    const focus = !have ? null : cal.gyro < 3 ? 'gyro' : cal.accel < 3 ? 'accel' : cal.mag < 3 ? 'mag' : 'done';

    return (
        <div style={{
            maxWidth: 760, margin: '0 auto 12px', borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(15,23,42,0.6), rgba(2,6,23,0.5))',
            border: '1px solid rgba(51,65,85,0.6)',
        }}>
            <button onClick={() => setOpen((o) => !o)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer', color: '#e2e8f0',
            }}>
                <Gauge size={15} color="#38bdf8" />
                <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.4 }}>IMU CALIBRATION</span>
                <span style={{
                    fontSize: 11, fontWeight: 700, color: status.col, padding: '2px 8px', borderRadius: 6,
                    background: status.col + '22', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    {have && sys >= 3 && <Check size={12} />}{status.txt}{have && ` · sys ${sys}/3`}
                </span>
                <div style={{ flex: 1 }} />
                {open ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
            </button>

            {open && (
                <div style={{ padding: '0 14px 14px' }}>
                    {!have && (
                        <div style={{
                            fontSize: 11.5, color: '#94a3b8', background: 'rgba(245,158,11,0.1)',
                            border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 10px', marginBottom: 12,
                        }}>
                            No live calibration on the wire yet — connect the BFS board over BLE with the cal-enabled firmware flashed and these fill in live. The steps below still apply.
                        </div>
                    )}

                    {/* live gauges */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                        {AXES.map((a) => {
                            const lvl = have ? cal[a.key] : 0;
                            return (
                                <div key={a.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: have ? 1 : 0.45 }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>{a.label.toUpperCase()}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Seg level={lvl} />
                                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 800, color: LEVEL_COLOR[lvl] }}>{lvl}/3</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* guided steps */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {STEPS.map((s) => {
                            const done = have && cal[s.key] >= 3;
                            const active = focus === s.key;
                            const col = done ? '#4ade80' : active ? '#38bdf8' : '#475569';
                            return (
                                <div key={s.key} style={{
                                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8,
                                    background: active ? 'rgba(56,189,248,0.1)' : 'transparent',
                                    border: `1px solid ${active ? 'rgba(56,189,248,0.4)' : 'rgba(51,65,85,0.4)'}`,
                                }}>
                                    <div style={{
                                        flexShrink: 0, width: 20, height: 20, borderRadius: '50%', marginTop: 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: col + '22', color: col, fontSize: 11, fontWeight: 800,
                                    }}>
                                        {done ? <Check size={13} /> : s.n}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: done ? '#4ade80' : '#e2e8f0' }}>{s.title}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{s.desc}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {have && focus === 'done' && (
                        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={14} /> Fully calibrated — tilt readings are now trustworthy.
                        </div>
                    )}
                    <div style={{ marginTop: 10, fontSize: 10.5, color: '#64748b', lineHeight: 1.5 }}>
                        For the balance board, Gyro + Accel make tilt accurate; Mag only affects heading. Calibration isn't stored on the BNO055 — it re-runs each power-up, so a quick pass at the start of a session is enough.
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalibrationHelper;
