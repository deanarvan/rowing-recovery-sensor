/**
 * SideToSideLevel — live medial-lateral balance feedback (a spirit level).
 *
 * Driven by the IMU roll (board side-to-side tilt). Centre = level (green); leaning left or right
 * pushes the bubble toward the edges and the colour ramps green → amber → red, so "bad side-to-side
 * balance" lights up instantly in the user's vision during a controlled single-leg eccentric.
 *
 * Props: { rollDeg, lateralTiltDeg }  (degrees; rollDeg signed +right / -left)
 */

import React from 'react';

const LVL_OK = 2;     // deg — within this is "level" (green)
const LVL_WARN = 5;   // deg — at/above this is full red
const MAX_TILT = 8;   // deg — full-scale deflection of the bubble

// Maps |roll| (deg) to a colour along green → amber → red. Exported so AnkleRocker can tint its
// ring with the same scale (single source of truth for the lateral-balance gradient).
export function lateralBalanceColor(absDeg) {
    if (absDeg <= LVL_OK) return '#22c55e';
    const t = Math.min(1, (absDeg - LVL_OK) / (LVL_WARN - LVL_OK));
    const hue = 142 * (1 - t); // 142 = green → 0 = red, passing through amber
    return `hsl(${hue}, 80%, 50%)`;
}

const SideToSideLevel = ({ rollDeg = 0, lateralTiltDeg = 0 }) => {
    const clamped = Math.max(-MAX_TILT, Math.min(MAX_TILT, rollDeg || 0));
    const bubbleLeftPct = 50 + (clamped / MAX_TILT) * 50; // 0..100
    const color = lateralBalanceColor(lateralTiltDeg);
    const level = lateralTiltDeg <= LVL_OK;
    const side = rollDeg > 0 ? 'RIGHT' : 'LEFT';

    return (
        <div style={{ width: '100%', maxWidth: 420 }}>
            {/* Header: label + state pill */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Side-to-side balance</span>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '2px 9px', borderRadius: 999,
                    background: `${color}22`, border: `1px solid ${color}`,
                    color, fontSize: 11, fontWeight: 800, fontFamily: 'monospace',
                    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                }}>
                    {level ? 'LEVEL ✓' : `${side} ${lateralTiltDeg.toFixed(1)}°`}
                </span>
            </div>

            {/* Gradient track */}
            <div style={{
                position: 'relative',
                height: 22,
                borderRadius: 11,
                background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 28%, #22c55e 50%, #f59e0b 72%, #ef4444 100%)',
                border: '1px solid rgba(51, 65, 85, 0.7)',
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.4)',
            }}>
                {/* Centre (level) zone marker */}
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.55)', transform: 'translateX(-50%)' }} />
                {/* Dim the whole track when level so the bubble reads cleanly, brighten as it tilts */}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(2, 6, 23, 0.35)' }} />

                {/* Live bubble */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${bubbleLeftPct}%`,
                    width: 18, height: 18,
                    borderRadius: '50%',
                    background: color,
                    border: '2px solid rgba(255,255,255,0.85)',
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 14px ${color}`,
                    transition: 'left 0.1s ease-out, background 0.15s, box-shadow 0.15s',
                }} />
            </div>

            {/* End labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em' }}>
                <span>◀ LEFT</span>
                <span>LEVEL</span>
                <span>RIGHT ▶</span>
            </div>
        </div>
    );
};

export default SideToSideLevel;
