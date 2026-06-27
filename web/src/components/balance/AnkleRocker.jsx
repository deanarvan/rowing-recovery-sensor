/**
 * AnkleRocker — the marquee ankle-angle dial for the Achilles heel-raise game.
 *
 * A protractor (reusing AnkleComparison's polar style): neutral points straight up, plantarflexion
 * sweeps right (+), dorsiflexion left (−). Shows the live pitch needle, a plantarflexion target
 * band, a ghost marker at this rep's peak ROM, a faint best-ROM marker, and — during the eccentric
 * descent — a moving tempo guide that sweeps from the apex back to neutral over the target tempo
 * (the user keeps their needle on it). The outer ring flares amber→red on medial-lateral wobble.
 *
 * Props: { angle, phase, peakThisRep, best, targetRom, targetEccentricS, eccentricElapsedS,
 *          lateralTiltDeg, hasAngle }
 */

import React from 'react';
import { lateralBalanceColor } from './SideToSideLevel';

const CX = 160, CY = 186, R = 150;
const MAXA = 30;      // deg of ankle angle at the dial extremes
const SPREAD = 82;    // deg the needle sweeps either side of vertical
const D2R = Math.PI / 180;

const clampA = (a) => Math.max(-MAXA, Math.min(MAXA, a));
// Ankle angle (deg) → point on the dial at radius r
function pt(angleAnkle, r) {
    const na = (clampA(angleAnkle) / MAXA) * SPREAD;   // needle deflection
    const sa = (-90 + na) * D2R;                        // screen angle (y-down)
    return [CX + r * Math.cos(sa), CY + r * Math.sin(sa)];
}
const arcPath = (a0, a1, r) => {
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

const AnkleRocker = ({
    angle = 0, phase = 'REST', peakThisRep = 0, best = 0,
    targetRom = 20, targetEccentricS = 3, eccentricElapsedS = 0,
    lateralTiltDeg = 0, hasAngle = false,
}) => {
    const descending = phase === 'DESCEND';

    // Tempo guide: sweeps from the apex down to neutral over the target tempo
    const guideFrac = Math.min(1, targetEccentricS > 0 ? eccentricElapsedS / targetEccentricS : 1);
    const guideAngle = descending ? peakThisRep * (1 - guideFrac) : 0;
    // During the descent, red if the user is below the guide (dropping too fast)
    const tooFast = descending && angle < guideAngle - 3;
    const inTargetZone = angle >= targetRom;

    const needleColor = descending
        ? (tooFast ? '#ef4444' : '#22c55e')
        : (inTargetZone ? '#22c55e' : '#38bdf8');

    // Ring stays calm slate when level, flares with the lateral-balance scale on wobble
    const ringColor = lateralTiltDeg < 2 ? '#3a4a63' : lateralBalanceColor(lateralTiltDeg);
    const ringGlow = Math.min(0.9, lateralTiltDeg / 8);

    const ticks = [];
    for (let a = -MAXA; a <= MAXA; a += 5) ticks.push(a);

    const [nx, ny] = pt(angle, R - 22);
    const [px, py] = pt(peakThisRep, R - 26);
    const [gx, gy] = pt(guideAngle, R - 26);
    const [bx, by] = pt(best, R - 4);

    return (
        <div className="glass-panel" style={{ padding: 14, width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg viewBox="0 0 320 210" style={{ width: '100%', height: 'auto' }}>
                {/* Outer ring (tints with side-to-side balance) */}
                <path d={arcPath(-MAXA, MAXA, R)} fill="none" stroke={ringColor} strokeWidth="4"
                      strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${6 * ringGlow + 1}px ${ringColor})` }} />

                {/* Plantarflexion target band */}
                {targetRom < MAXA && (
                    <path d={arcPath(targetRom, MAXA, R - 11)} fill="none" stroke="#22c55e"
                          strokeWidth="7" strokeLinecap="round" opacity="0.45" />
                )}

                {/* Tick marks */}
                {ticks.map((a) => {
                    const [x0, y0] = pt(a, R - 7);
                    const [x1, y1] = pt(a, R);
                    const major = a === 0;
                    return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1}
                                 stroke={major ? '#94a3b8' : '#475569'} strokeWidth={major ? 2 : 1} />;
                })}

                {/* Best-ROM marker */}
                {best > 1 && <circle cx={bx} cy={by} r="3.5" fill="#f59e0b" opacity="0.9" />}

                {/* Peak-this-rep ghost needle */}
                {peakThisRep > 1 && (
                    <line x1={CX} y1={CY} x2={px} y2={py} stroke="#cbd5e1" strokeWidth="2"
                          strokeDasharray="4 4" opacity="0.5" />
                )}

                {/* Eccentric tempo guide needle */}
                {descending && (
                    <line x1={CX} y1={CY} x2={gx} y2={gy} stroke="#facc15" strokeWidth="3"
                          strokeLinecap="round" opacity="0.95" />
                )}

                {/* Live needle */}
                <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={needleColor} strokeWidth="5"
                      strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${needleColor})`, transition: 'stroke 0.15s' }} />
                <circle cx={CX} cy={CY} r="8" fill="#0f172a" stroke={needleColor} strokeWidth="3" />

                {/* Cardinal labels */}
                <text x="22" y="150" fill="#64748b" fontSize="11" fontWeight="700">DF</text>
                <text x="284" y="150" fill="#64748b" fontSize="11" fontWeight="700">PF</text>
                <text x={CX} y="26" fill="#64748b" fontSize="10" fontWeight="700" textAnchor="middle">0°</text>
            </svg>

            {/* Numeric readout + phase */}
            <div style={{ marginTop: -6, textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'monospace', color: needleColor, lineHeight: 1, transition: 'color 0.15s' }}>
                    {hasAngle ? `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°` : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {!hasAngle ? 'No board angle' :
                        descending ? (tooFast ? '⚠ Slow the descent' : '↓ Controlled descent') :
                        phase === 'ASCEND' ? '↑ Rising' :
                        inTargetZone ? 'On the toes' : 'Plantarflexion angle'}
                </div>
            </div>
        </div>
    );
};

export default AnkleRocker;
