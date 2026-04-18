/**
 * CoPDisplay — large central CoP target with live trajectory trail.
 *
 * Props:
 *   cop          { x, y } current CoP position, -100 to +100
 *   trail        array of { x, y, age } points, age 0=newest 1=oldest
 *   size         px (default 460)
 *   showTrail    boolean (default true)
 *   overlay      optional ReactNode rendered inside the circle (for games)
 *   ringColor    optional override for ring color
 *   dotColor     optional override for dot color
 *   inactive     boolean — if true, dot is dimmed (no weight on board)
 */

import React from 'react';
import { motion } from 'framer-motion';

const CoPDisplay = ({
    cop,
    trail = [],
    size = 460,
    showTrail = true,
    overlay = null,
    ringColor = '#334155',
    dotColor = '#38bdf8',
    inactive = false,
}) => {
    const safeCop = cop || { x: 0, y: 0 };
    // Convert -100..100 to 0..100 for left/top positioning
    const toPct = (v) => (Math.max(-100, Math.min(100, v)) + 100) / 2;
    // Y axis: positive = toes (top of display), so invert
    const dotLeft = toPct(safeCop.x);
    const dotTop = toPct(-safeCop.y);

    // Build SVG trail path
    const trailPath = trail.length > 1
        ? trail.map((p, i) => {
            const px = toPct(p.x);
            const py = toPct(-p.y);
            return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
        }).join(' ')
        : '';

    return (
        <div style={{
            position: 'relative',
            width: size,
            height: size,
            background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)',
            borderRadius: '50%',
            border: `2px solid ${ringColor}`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: 'inset 0 0 40px rgba(56, 189, 248, 0.05)',
        }}>
            {/* Concentric reference rings */}
            <div style={{ position: 'absolute', width: '75%', height: '75%', borderRadius: '50%', border: `1px dashed ${ringColor}`, opacity: 0.6 }} />
            <div style={{ position: 'absolute', width: '50%', height: '50%', borderRadius: '50%', border: `1px dashed ${ringColor}`, opacity: 0.5 }} />
            <div style={{ position: 'absolute', width: '25%', height: '25%', borderRadius: '50%', border: `1.5px solid #22c55e`, opacity: 0.6 }} />

            {/* Crosshair */}
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: ringColor, opacity: 0.4 }} />
            <div style={{ position: 'absolute', width: '1px', height: '100%', background: ringColor, opacity: 0.4 }} />

            {/* Cardinal labels */}
            <div style={{ position: 'absolute', top: 10, fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.1em' }}>TOES</div>
            <div style={{ position: 'absolute', bottom: 10, fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.1em' }}>HEELS</div>
            <div style={{ position: 'absolute', left: 10, fontSize: 10, color: '#64748b', fontWeight: 700 }}>L</div>
            <div style={{ position: 'absolute', right: 10, fontSize: 10, color: '#64748b', fontWeight: 700 }}>R</div>

            {/* Overlay (games use this for targets, shapes, etc.) */}
            {overlay && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {overlay}
                </div>
            )}

            {/* Trail */}
            {showTrail && trail.length > 1 && (
                <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                >
                    <defs>
                        <linearGradient id="trailGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={dotColor} stopOpacity="0.8" />
                            <stop offset="100%" stopColor={dotColor} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path
                        d={trailPath}
                        fill="none"
                        stroke={dotColor}
                        strokeWidth="0.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.7}
                    />
                </svg>
            )}

            {/* Live CoP dot */}
            <motion.div
                animate={{ left: `${dotLeft}%`, top: `${dotTop}%` }}
                transition={{ type: 'spring', damping: 18, stiffness: 180 }}
                style={{
                    position: 'absolute',
                    width: 26,
                    height: 26,
                    background: dotColor,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 24px ${dotColor}, inset 0 0 10px rgba(255,255,255,0.5)`,
                    zIndex: 20,
                    opacity: inactive ? 0.2 : 1,
                }}
            />
        </div>
    );
};

export default CoPDisplay;
