#!/usr/bin/env python3
"""
Balance Board Differential Analysis
Compares two subjects: Achilles recovery patient vs healthy control.
Generates an HTML report with embedded SVG charts.

Usage:
    python3 compare_subjects.py <patient_csv> <control_csv> [output.html]
"""

import csv
import statistics
import math
import sys
import os
from datetime import datetime

# ─── Data Loading ───────────────────────────────────────────────────────────

def load_session(filepath, min_total=1000):
    """Load a balance board CSV and compute per-sample metrics."""
    rows = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.startswith('#'):
                continue  # skip comment lines
            break
        f.seek(0)
        reader = csv.DictReader((line for line in f if not line.startswith('#')))
        for row in reader:
            fl = int(row['fl']); fr = int(row['fr'])
            rl = int(row['rl']); rr = int(row['rr'])
            total = fl + fr + rl + rr
            if total < min_total:
                continue
            left = fl + rl
            right = fr + rr
            rows.append({
                'elapsed': float(row['elapsed_s']),
                'fl': fl, 'fr': fr, 'rl': rl, 'rr': rr,
                'left': left, 'right': right, 'total': total,
                'left_pct': left / total * 100,
                'right_pct': right / total * 100,
                'bsi': abs(left - right) / total * 100,
                # A/P ratios: +1 = all forefoot, -1 = all heel
                'left_ap': (fl - rl) / left if left > 0 else 0,
                'right_ap': (fr - rr) / right if right > 0 else 0,
                # Per-foot forefoot %
                'left_forefoot_pct': fl / (fl + rl) * 100 if (fl + rl) > 0 else 50,
                'right_forefoot_pct': fr / (fr + rr) * 100 if (fr + rr) > 0 else 50,
            })
    return rows


def compute_metrics(rows):
    """Compute summary metrics from a session."""
    if not rows:
        return {}

    n = len(rows)
    duration = rows[-1]['elapsed'] - rows[0]['elapsed']

    bsi_vals = [r['bsi'] for r in rows]
    left_pcts = [r['left_pct'] for r in rows]
    right_pcts = [r['right_pct'] for r in rows]

    # Sensor coefficient of variation (stability)
    def cv(key):
        vals = [r[key] for r in rows if r[key] > 100]
        if len(vals) < 10:
            return 0
        return statistics.stdev(vals) / statistics.mean(vals) * 100

    # Saturation check
    saturated = sum(1 for r in rows if r['fl'] > 16000 and r['fr'] > 16000 and r['rl'] > 16000 and r['rr'] > 16000)

    # Dominance
    left_dominant = sum(1 for r in rows if r['left_pct'] > 50)

    # A/P
    left_ap_vals = [r['left_ap'] for r in rows]
    right_ap_vals = [r['right_ap'] for r in rows]
    left_ff = [r['left_forefoot_pct'] for r in rows]
    right_ff = [r['right_forefoot_pct'] for r in rows]

    # CoP sway: compute 2D path from ML (left_pct) and AP (front_pct) positions
    cop_deltas = []
    # Also compute front_pct per row for AP axis
    for r in rows:
        r['front_pct'] = (r['fl'] + r['fr']) / r['total'] * 100 if r['total'] > 0 else 50

    for i in range(1, len(rows)):
        dml = rows[i]['left_pct'] - rows[i-1]['left_pct']
        dap = rows[i]['front_pct'] - rows[i-1]['front_pct']
        dt = rows[i]['elapsed'] - rows[i-1]['elapsed']
        if dt > 0:
            dist = math.sqrt(dml**2 + dap**2)
            cop_deltas.append(dist / dt)  # 2D velocity in %/s

    # CoP Translation: distance between two furthest CoP positions
    ml_vals = [r['left_pct'] for r in rows]
    ap_vals = [r['front_pct'] for r in rows]
    ml_range = max(ml_vals) - min(ml_vals)
    ap_range = max(ap_vals) - min(ap_vals)
    cop_translation = math.sqrt(ml_range**2 + ap_range**2)

    # CoP Ellipse Area: 95% confidence ellipse
    # Area = π * χ²(2, 0.95) * sqrt(det(Σ)) where Σ is 2x2 covariance matrix
    CHI2_95_2DOF = 5.991
    mean_ml = statistics.mean(ml_vals)
    mean_ap = statistics.mean(ap_vals)
    var_ml = statistics.variance(ml_vals) if n > 1 else 0
    var_ap = statistics.variance(ap_vals) if n > 1 else 0
    cov_ml_ap = sum((ml - mean_ml) * (ap - mean_ap) for ml, ap in zip(ml_vals, ap_vals)) / (n - 1) if n > 1 else 0
    det_cov = var_ml * var_ap - cov_ml_ap**2
    cop_ellipse_area = math.pi * CHI2_95_2DOF * math.sqrt(max(det_cov, 0))

    # Time-windowed BSI (10-second windows)
    windows = []
    win_dur = 10.0
    t_start = rows[0]['elapsed']
    t_end = rows[-1]['elapsed']
    t = t_start
    while t + win_dur <= t_end:
        chunk = [r for r in rows if t <= r['elapsed'] < t + win_dur]
        if chunk:
            windows.append({
                't_start': t,
                't_end': t + win_dur,
                'bsi': statistics.mean([c['bsi'] for c in chunk]),
                'left_pct': statistics.mean([c['left_pct'] for c in chunk]),
            })
        t += win_dur

    # Thirds analysis
    third = n // 3
    thirds = []
    for i in range(3):
        chunk = rows[i*third:(i+1)*third]
        thirds.append({
            'bsi': statistics.mean([c['bsi'] for c in chunk]),
            'left_pct': statistics.mean([c['left_pct'] for c in chunk]),
        })

    return {
        'n_samples': n,
        'duration': duration,
        'bsi_mean': statistics.mean(bsi_vals),
        'bsi_median': statistics.median(bsi_vals),
        'bsi_stdev': statistics.stdev(bsi_vals) if n > 1 else 0,
        'bsi_max': max(bsi_vals),
        'left_pct_mean': statistics.mean(left_pcts),
        'right_pct_mean': statistics.mean(right_pcts),
        'left_dominant_pct': left_dominant / n * 100,
        'cv_fl': cv('fl'), 'cv_fr': cv('fr'),
        'cv_rl': cv('rl'), 'cv_rr': cv('rr'),
        'saturated_pct': saturated / n * 100,
        'left_ap_mean': statistics.mean(left_ap_vals),
        'right_ap_mean': statistics.mean(right_ap_vals),
        'left_forefoot_mean': statistics.mean(left_ff),
        'right_forefoot_mean': statistics.mean(right_ff),
        'cop_velocity_mean': statistics.mean(cop_deltas) if cop_deltas else 0,
        'cop_velocity_stdev': statistics.stdev(cop_deltas) if len(cop_deltas) > 1 else 0,
        'cop_translation': cop_translation,
        'cop_ellipse_area': cop_ellipse_area,
        'windows': windows,
        'thirds': thirds,
        'bsi_values': bsi_vals,
        'left_pct_values': left_pcts,
        'rows': rows,
    }


# ─── SVG Chart Generation ──────────────────────────────────────────────────

def svg_bar_comparison(title, labels, patient_vals, control_vals, unit='%',
                       width=500, height=220, colors=('#ef4444', '#3b82f6'),
                       thresholds=None):
    """Generate an SVG grouped bar chart comparing two subjects."""
    n = len(labels)
    margin = {'top': 40, 'right': 20, 'bottom': 50, 'left': 55}
    cw = width - margin['left'] - margin['right']
    ch = height - margin['top'] - margin['bottom']

    all_vals = patient_vals + control_vals
    max_val = max(abs(v) for v in all_vals) * 1.15 if all_vals else 1

    bar_group_w = cw / n
    bar_w = bar_group_w * 0.35

    svg = f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="font-family:Inter,system-ui,sans-serif;background:#0f172a;border-radius:8px;">\n'

    # Title
    svg += f'<text x="{width/2}" y="24" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="700">{title}</text>\n'

    # Axis
    svg += f'<line x1="{margin["left"]}" y1="{margin["top"]}" x2="{margin["left"]}" y2="{margin["top"]+ch}" stroke="#334155" stroke-width="1"/>\n'
    svg += f'<line x1="{margin["left"]}" y1="{margin["top"]+ch}" x2="{margin["left"]+cw}" y2="{margin["top"]+ch}" stroke="#334155" stroke-width="1"/>\n'

    # Grid lines
    for i in range(5):
        y = margin['top'] + ch - (i / 4) * ch
        val = (i / 4) * max_val
        svg += f'<line x1="{margin["left"]}" y1="{y}" x2="{margin["left"]+cw}" y2="{y}" stroke="#1e293b" stroke-width="0.5"/>\n'
        svg += f'<text x="{margin["left"]-8}" y="{y+4}" text-anchor="end" fill="#64748b" font-size="9">{val:.1f}</text>\n'

    # Threshold lines
    if thresholds:
        for thr_val, thr_color, thr_label in thresholds:
            if thr_val <= max_val:
                y = margin['top'] + ch - (thr_val / max_val) * ch
                svg += f'<line x1="{margin["left"]}" y1="{y}" x2="{margin["left"]+cw}" y2="{y}" stroke="{thr_color}" stroke-width="1" stroke-dasharray="4 3"/>\n'
                svg += f'<text x="{margin["left"]+cw+2}" y="{y+3}" fill="{thr_color}" font-size="8">{thr_label}</text>\n'

    # Bars
    for i in range(n):
        x_center = margin['left'] + (i + 0.5) * bar_group_w
        # Patient bar
        bh_p = (patient_vals[i] / max_val) * ch
        x_p = x_center - bar_w - 2
        y_p = margin['top'] + ch - bh_p
        svg += f'<rect x="{x_p}" y="{y_p}" width="{bar_w}" height="{bh_p}" fill="{colors[0]}" rx="2" opacity="0.85"/>\n'
        svg += f'<text x="{x_p + bar_w/2}" y="{y_p - 4}" text-anchor="middle" fill="{colors[0]}" font-size="9" font-weight="700">{patient_vals[i]:.1f}</text>\n'
        # Control bar
        bh_c = (control_vals[i] / max_val) * ch
        x_c = x_center + 2
        y_c = margin['top'] + ch - bh_c
        svg += f'<rect x="{x_c}" y="{y_c}" width="{bar_w}" height="{bh_c}" fill="{colors[1]}" rx="2" opacity="0.85"/>\n'
        svg += f'<text x="{x_c + bar_w/2}" y="{y_c - 4}" text-anchor="middle" fill="{colors[1]}" font-size="9" font-weight="700">{control_vals[i]:.1f}</text>\n'
        # Label
        svg += f'<text x="{x_center}" y="{margin["top"]+ch+14}" text-anchor="middle" fill="#94a3b8" font-size="9">{labels[i]}</text>\n'

    # Legend
    lx = margin['left'] + 10
    ly = margin['top'] + ch + 32
    svg += f'<rect x="{lx}" y="{ly}" width="10" height="10" fill="{colors[0]}" rx="2"/>\n'
    svg += f'<text x="{lx+14}" y="{ly+9}" fill="#e2e8f0" font-size="9">Patient (12mo post-op)</text>\n'
    svg += f'<rect x="{lx+160}" y="{ly}" width="10" height="10" fill="{colors[1]}" rx="2"/>\n'
    svg += f'<text x="{lx+174}" y="{ly+9}" fill="#e2e8f0" font-size="9">Control (healthy)</text>\n'

    svg += '</svg>'
    return svg


def svg_bsi_timeline(title, patient_windows, control_windows, width=600, height=200):
    """SVG line chart of BSI over time for both subjects."""
    margin = {'top': 35, 'right': 20, 'bottom': 45, 'left': 50}
    cw = width - margin['left'] - margin['right']
    ch = height - margin['top'] - margin['bottom']

    all_bsi = [w['bsi'] for w in patient_windows] + [w['bsi'] for w in control_windows]
    max_bsi = max(all_bsi) * 1.15 if all_bsi else 10
    max_bsi = max(max_bsi, 16)  # Ensure threshold lines visible

    max_t = max(
        max((w['t_end'] for w in patient_windows), default=0),
        max((w['t_end'] for w in control_windows), default=0)
    )

    def x_pos(t):
        return margin['left'] + (t / max_t) * cw if max_t > 0 else margin['left']

    def y_pos(bsi):
        return margin['top'] + ch - (bsi / max_bsi) * ch

    svg = f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="font-family:Inter,system-ui,sans-serif;background:#0f172a;border-radius:8px;">\n'
    svg += f'<text x="{width/2}" y="22" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="700">{title}</text>\n'

    # Grid
    for i in range(5):
        y = margin['top'] + (i / 4) * ch
        val = max_bsi * (1 - i / 4)
        svg += f'<line x1="{margin["left"]}" y1="{y}" x2="{margin["left"]+cw}" y2="{y}" stroke="#1e293b" stroke-width="0.5"/>\n'
        svg += f'<text x="{margin["left"]-6}" y="{y+3}" text-anchor="end" fill="#64748b" font-size="8">{val:.0f}%</text>\n'

    # Threshold lines
    for thr, color, label in [(10, '#4ade80', '10% RTS'), (15, '#fbbf24', '15%')]:
        if thr < max_bsi:
            y = y_pos(thr)
            svg += f'<line x1="{margin["left"]}" y1="{y}" x2="{margin["left"]+cw}" y2="{y}" stroke="{color}" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>\n'
            svg += f'<text x="{margin["left"]+cw+3}" y="{y+3}" fill="{color}" font-size="7">{label}</text>\n'

    # Patient line
    if patient_windows:
        points = ' '.join(f'{x_pos((w["t_start"]+w["t_end"])/2)},{y_pos(w["bsi"])}' for w in patient_windows)
        svg += f'<polyline points="{points}" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round"/>\n'
        for w in patient_windows:
            cx = x_pos((w['t_start'] + w['t_end']) / 2)
            cy = y_pos(w['bsi'])
            svg += f'<circle cx="{cx}" cy="{cy}" r="3" fill="#ef4444"/>\n'

    # Control line
    if control_windows:
        points = ' '.join(f'{x_pos((w["t_start"]+w["t_end"])/2)},{y_pos(w["bsi"])}' for w in control_windows)
        svg += f'<polyline points="{points}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round"/>\n'
        for w in control_windows:
            cx = x_pos((w['t_start'] + w['t_end']) / 2)
            cy = y_pos(w['bsi'])
            svg += f'<circle cx="{cx}" cy="{cy}" r="3" fill="#3b82f6"/>\n'

    # X axis labels
    svg += f'<text x="{width/2}" y="{height-5}" text-anchor="middle" fill="#64748b" font-size="9">Time (seconds)</text>\n'
    for t in range(0, int(max_t) + 1, 10):
        x = x_pos(t)
        svg += f'<text x="{x}" y="{margin["top"]+ch+14}" text-anchor="middle" fill="#64748b" font-size="8">{t}s</text>\n'

    # Legend
    lx = margin['left'] + 10
    ly = margin['top'] + ch + 28
    svg += f'<line x1="{lx}" y1="{ly}" x2="{lx+12}" y2="{ly}" stroke="#ef4444" stroke-width="2"/>\n'
    svg += f'<text x="{lx+16}" y="{ly+3}" fill="#e2e8f0" font-size="9">Patient</text>\n'
    svg += f'<line x1="{lx+80}" y1="{ly}" x2="{lx+92}" y2="{ly}" stroke="#3b82f6" stroke-width="2"/>\n'
    svg += f'<text x="{lx+96}" y="{ly+3}" fill="#e2e8f0" font-size="9">Control</text>\n'

    svg += '</svg>'
    return svg


def svg_dominance_donut(title, left_pct, color_left='#4ade80', color_right='#a855f7', size=160):
    """SVG donut chart showing L/R dominance %."""
    cx, cy = size / 2, size / 2
    r = size * 0.35
    stroke_w = size * 0.12

    # Arc path for left %
    angle = left_pct / 100 * 360
    large = 1 if angle > 180 else 0
    rad = math.radians(angle - 90)
    x1, y1 = cx, cy - r  # Start at top
    x2 = cx + r * math.cos(rad)
    y2 = cy + r * math.sin(rad)

    circumference = 2 * math.pi * r

    svg = f'<svg viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg" style="font-family:Inter,system-ui,sans-serif;">\n'
    # Background ring
    svg += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color_right}" stroke-width="{stroke_w}" opacity="0.7"/>\n'
    # Left % arc
    dash = circumference * left_pct / 100
    svg += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color_left}" stroke-width="{stroke_w}" stroke-dasharray="{dash} {circumference}" transform="rotate(-90 {cx} {cy})" opacity="0.85"/>\n'
    # Center text
    svg += f'<text x="{cx}" y="{cy-6}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="700">{title}</text>\n'
    svg += f'<text x="{cx}" y="{cy+10}" text-anchor="middle" fill="{color_left}" font-size="10">L {left_pct:.0f}%</text>\n'
    svg += f'<text x="{cx}" y="{cy+22}" text-anchor="middle" fill="{color_right}" font-size="10">R {100-left_pct:.0f}%</text>\n'
    svg += '</svg>'
    return svg


def svg_radar(title, labels, patient_vals, control_vals, max_vals, width=320, height=320):
    """SVG radar/spider chart for multi-metric comparison."""
    cx, cy = width / 2, height / 2 + 10
    r = min(width, height) * 0.32
    n = len(labels)

    def polar(i, val, max_v):
        angle = math.radians(360 / n * i - 90)
        frac = min(val / max_v, 1.0) if max_v > 0 else 0
        x = cx + r * frac * math.cos(angle)
        y = cy + r * frac * math.sin(angle)
        return x, y

    svg = f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="font-family:Inter,system-ui,sans-serif;background:#0f172a;border-radius:8px;">\n'
    svg += f'<text x="{width/2}" y="22" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="700">{title}</text>\n'

    # Grid rings
    for ring in [0.25, 0.5, 0.75, 1.0]:
        points = ' '.join(f'{cx + r * ring * math.cos(math.radians(360/n*i - 90))},{cy + r * ring * math.sin(math.radians(360/n*i - 90))}' for i in range(n))
        svg += f'<polygon points="{points}" fill="none" stroke="#1e293b" stroke-width="0.5"/>\n'

    # Axes + labels
    for i in range(n):
        angle = math.radians(360 / n * i - 90)
        x_end = cx + r * 1.15 * math.cos(angle)
        y_end = cy + r * 1.15 * math.sin(angle)
        x_ax = cx + r * math.cos(angle)
        y_ax = cy + r * math.sin(angle)
        svg += f'<line x1="{cx}" y1="{cy}" x2="{x_ax}" y2="{y_ax}" stroke="#334155" stroke-width="0.5"/>\n'
        anchor = 'middle'
        if x_end < cx - 10: anchor = 'end'
        elif x_end > cx + 10: anchor = 'start'
        svg += f'<text x="{x_end}" y="{y_end+4}" text-anchor="{anchor}" fill="#94a3b8" font-size="8">{labels[i]}</text>\n'

    # Patient polygon
    p_points = ' '.join(f'{polar(i, patient_vals[i], max_vals[i])[0]},{polar(i, patient_vals[i], max_vals[i])[1]}' for i in range(n))
    svg += f'<polygon points="{p_points}" fill="rgba(239,68,68,0.15)" stroke="#ef4444" stroke-width="1.5"/>\n'

    # Control polygon
    c_points = ' '.join(f'{polar(i, control_vals[i], max_vals[i])[0]},{polar(i, control_vals[i], max_vals[i])[1]}' for i in range(n))
    svg += f'<polygon points="{c_points}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="1.5"/>\n'

    # Legend
    svg += f'<rect x="10" y="{height-22}" width="8" height="8" fill="#ef4444" rx="2"/>\n'
    svg += f'<text x="22" y="{height-14}" fill="#e2e8f0" font-size="9">Patient</text>\n'
    svg += f'<rect x="80" y="{height-22}" width="8" height="8" fill="#3b82f6" rx="2"/>\n'
    svg += f'<text x="92" y="{height-14}" fill="#e2e8f0" font-size="9">Control</text>\n'

    svg += '</svg>'
    return svg


# ─── HTML Report Generation ────────────────────────────────────────────────

def generate_report(patient_file, control_file, output_file='comparison_report.html'):
    """Generate full HTML comparison report."""

    print(f"Loading patient data: {patient_file}")
    p_rows = load_session(patient_file)
    p = compute_metrics(p_rows)

    print(f"Loading control data: {control_file}")
    c_rows = load_session(control_file)
    c = compute_metrics(c_rows)

    print(f"Patient: {p['n_samples']} samples, {p['duration']:.1f}s")
    print(f"Control: {c['n_samples']} samples, {c['duration']:.1f}s")

    # ── Generate charts ──

    # 1. BSI comparison bars
    bsi_bars = svg_bar_comparison(
        'Bilateral Symmetry Index',
        ['Mean BSI', 'Median BSI', 'StDev BSI', 'Max BSI'],
        [p['bsi_mean'], p['bsi_median'], p['bsi_stdev'], p['bsi_max']],
        [c['bsi_mean'], c['bsi_median'], c['bsi_stdev'], c['bsi_max']],
        thresholds=[(10, '#4ade80', '10% RTS'), (15, '#fbbf24', '15%')],
    )

    # 2. Sensor stability (CV%)
    stability_bars = svg_bar_comparison(
        'Sensor Stability (Coefficient of Variation — lower = more stable)',
        ['Left Toe', 'Right Toe', 'Left Heel', 'Right Heel'],
        [p['cv_fl'], p['cv_fr'], p['cv_rl'], p['cv_rr']],
        [c['cv_fl'], c['cv_fr'], c['cv_rl'], c['cv_rr']],
        unit='CV%',
    )

    # 3. BSI timeline
    bsi_timeline = svg_bsi_timeline(
        'BSI Over Time (10-second windows)',
        p.get('windows', []),
        c.get('windows', []),
    )

    # 4. Dominance donuts
    p_donut = svg_dominance_donut('Patient', p['left_dominant_pct'])
    c_donut = svg_dominance_donut('Control', c['left_dominant_pct'])

    # 5. A/P loading comparison
    ap_bars = svg_bar_comparison(
        'Forefoot Loading (% — higher = more weight on toes)',
        ['Left Foot', 'Right Foot'],
        [p['left_forefoot_mean'], p['right_forefoot_mean']],
        [c['left_forefoot_mean'], c['right_forefoot_mean']],
        width=350,
    )

    # 6. Radar chart (now includes CoP Translation and Ellipse Area)
    radar_labels = ['BSI', 'R Toe CV', 'R Heel CV', 'CoP Velocity', 'CoP Translation', 'Ellipse Area']
    p_radar = [p['bsi_mean'], p['cv_fr'], p['cv_rr'], p['cop_velocity_mean'], p['cop_translation'], p['cop_ellipse_area']]
    c_radar = [c['bsi_mean'], c['cv_fr'], c['cv_rr'], c['cop_velocity_mean'], c['cop_translation'], c['cop_ellipse_area']]
    max_radar = [max(pv, cv) * 1.3 or 1 for pv, cv in zip(p_radar, c_radar)]
    radar = svg_radar('Multi-Metric Comparison', radar_labels, p_radar, c_radar, max_radar)

    # ── Build metric cards ──
    def metric_card(label, p_val, c_val, fmt='.1f', unit='%', better='lower'):
        p_str = f'{p_val:{fmt}}{unit}'
        c_str = f'{c_val:{fmt}}{unit}'
        diff = p_val - c_val
        if better == 'lower':
            color = '#4ade80' if diff <= 0 else '#ef4444'
        else:
            color = '#4ade80' if diff >= 0 else '#ef4444'
        diff_str = f'{diff:+{fmt}}{unit}'
        return f'''
        <div style="background:#1e293b;border-radius:8px;padding:14px;text-align:center;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">{label}</div>
            <div style="display:flex;justify-content:space-around;gap:8px;">
                <div>
                    <div style="font-size:20px;font-weight:800;font-family:monospace;color:#ef4444;">{p_str}</div>
                    <div style="font-size:9px;color:#64748b;">Patient</div>
                </div>
                <div>
                    <div style="font-size:20px;font-weight:800;font-family:monospace;color:#3b82f6;">{c_str}</div>
                    <div style="font-size:9px;color:#64748b;">Control</div>
                </div>
            </div>
            <div style="margin-top:8px;font-size:11px;font-weight:700;color:{color};">Delta: {diff_str}</div>
        </div>'''

    now = datetime.now()

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Balance Board — Patient vs Control Comparison</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ background: #0f172a; color: #e2e8f0; font-family: Inter, system-ui, -apple-system, sans-serif; padding: 24px; max-width: 1100px; margin: 0 auto; }}
    h1 {{ font-size: 24px; background: linear-gradient(to right, #ef4444, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px; }}
    h2 {{ font-size: 16px; color: #94a3b8; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #1e293b; }}
    .subtitle {{ color: #64748b; font-size: 13px; margin-bottom: 24px; }}
    .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }}
    .grid-3 {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }}
    .grid-4 {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }}
    .chart-panel {{ background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 4px; }}
    .donut-row {{ display: flex; justify-content: center; gap: 40px; align-items: center; margin: 16px 0; }}
    .insight {{ background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 14px 18px; margin: 12px 0; font-size: 13px; line-height: 1.6; color: #cbd5e1; }}
    .insight strong {{ color: #38bdf8; }}
    .warn {{ background: rgba(251, 191, 36, 0.08); border-color: rgba(251, 191, 36, 0.2); }}
    .warn strong {{ color: #fbbf24; }}
    footer {{ margin-top: 32px; text-align: center; color: #475569; font-size: 11px; padding-top: 16px; border-top: 1px solid #1e293b; }}
</style>
</head>
<body>

<h1>Balance Board Differential Analysis</h1>
<div class="subtitle">
    Patient (12-month post-op Achilles, right leg) vs Healthy Control (marathon runner)
    &mdash; {now.strftime('%B %d, %Y')}
</div>

<div class="insight warn">
    <strong>Sensor saturation note:</strong> Both sessions recorded with 10k&Omega; pull-up resistors.
    Patient saturation: {p['saturated_pct']:.0f}% of samples. Control saturation: {c['saturated_pct']:.0f}% of samples.
    All metrics should be re-evaluated after 100k&Omega; resistor upgrade for more accurate dynamic range.
</div>

<h2>Key Metrics at a Glance</h2>
<div class="grid-4">
    {metric_card('Mean BSI', p['bsi_mean'], c['bsi_mean'])}
    {metric_card('CoP Velocity', p['cop_velocity_mean'], c['cop_velocity_mean'], fmt='.2f', unit=' %/s')}
    {metric_card('CoP Translation', p['cop_translation'], c['cop_translation'], fmt='.2f', unit='%')}
    {metric_card('Right Heel CV', p['cv_rr'], c['cv_rr'])}
</div>
<div class="grid-4" style="margin-top:-4px;">
    {metric_card('CoP Ellipse Area', p['cop_ellipse_area'], c['cop_ellipse_area'], fmt='.1f', unit=' %²')}
    {metric_card('L/R Split (Left%)', p['left_pct_mean'], c['left_pct_mean'], better='closer')}
    {metric_card('Right Toe CV', p['cv_fr'], c['cv_fr'])}
    {metric_card('Left Heel CV', p['cv_rl'], c['cv_rl'])}
</div>

<h2>Bilateral Symmetry Index</h2>
<div class="grid-2">
    <div class="chart-panel">{bsi_bars}</div>
    <div class="chart-panel">{bsi_timeline}</div>
</div>

<div class="insight">
    <strong>BSI interpretation:</strong> Values below 10% are considered acceptable for return to sport.
    The patient's mean BSI of {p['bsi_mean']:.1f}% vs control's {c['bsi_mean']:.1f}% shows
    {'minimal difference — though sensor saturation may be masking true asymmetry.' if abs(p['bsi_mean'] - c['bsi_mean']) < 3 else 'a measurable deficit that warrants continued monitoring.'}
</div>

<h2>Weight Distribution Dominance</h2>
<div class="donut-row">
    {p_donut}
    <div style="text-align:center;color:#64748b;font-size:12px;max-width:200px;line-height:1.5;">
        Left-dominant % of time.<br>
        Patient: {p['left_dominant_pct']:.0f}% &bull; Control: {c['left_dominant_pct']:.0f}%<br>
        <span style="font-size:10px;">Higher left dominance in the patient may indicate right (injured) leg offloading.</span>
    </div>
    {c_donut}
</div>

<h2>Sensor Stability (Neuromuscular Control)</h2>
<div class="grid-2">
    <div class="chart-panel">{stability_bars}</div>
    <div class="chart-panel">{radar}</div>
</div>

<div class="insight">
    <strong>Stability interpretation:</strong> Higher coefficient of variation = more force fluctuation = less neuromuscular control.
    The patient's right heel CV ({p['cv_rr']:.1f}%) vs control's ({c['cv_rr']:.1f}%) is the key metric here —
    the right calf complex (gastrocnemius + repaired Achilles) drives heel loading stability.
</div>

<h2>CoP Sway Analysis (VALD-aligned metrics)</h2>
<div class="grid-2">
    <div class="chart-panel" style="padding:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            {metric_card('CoP Translation', p['cop_translation'], c['cop_translation'], fmt='.2f', unit='%')}
            {metric_card('CoP Ellipse Area', p['cop_ellipse_area'], c['cop_ellipse_area'], fmt='.1f', unit=' %²')}
        </div>
    </div>
    <div class="insight" style="display:flex;align-items:center;">
        <div>
            <strong>CoP Translation</strong> measures the diagonal distance between furthest sway points —
            larger values = more postural excursion. <strong>Ellipse Area</strong> is the 95% confidence ellipse
            around the center of pressure trace — it captures both medial-lateral and anterior-posterior sway.
            The VALD peroneal nerve case study found a 2.6x ellipse area difference in a patient whose traditional
            balance time was equal bilaterally. Patient: {p['cop_ellipse_area']:.1f} %² vs Control: {c['cop_ellipse_area']:.1f} %²
            (ratio: {p['cop_ellipse_area']/c['cop_ellipse_area']:.1f}x).
        </div>
    </div>
</div>

<h2>Anterior / Posterior Loading Pattern</h2>
<div class="grid-2">
    <div class="chart-panel">{ap_bars}</div>
    <div style="display:flex;flex-direction:column;justify-content:center;">
        <div class="insight" style="margin:0;">
            <strong>A/P interpretation:</strong> Post-Achilles patients often shift to forefoot-dominant loading
            on the injured side to reduce tendon stress. The right foot forefoot loading is
            {p['right_forefoot_mean']:.1f}% (patient) vs {c['right_forefoot_mean']:.1f}% (control).
            {'This elevated forefoot loading is consistent with Achilles protection.' if p['right_forefoot_mean'] > c['right_forefoot_mean'] + 2 else 'These values are comparable.'}
        </div>
    </div>
</div>

<h2>Session Progression (Thirds Analysis)</h2>
<div class="grid-2">
    <div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr style="color:#94a3b8;text-transform:uppercase;font-size:10px;">
                <th style="padding:8px;text-align:left;">Period</th>
                <th style="padding:8px;">Patient BSI</th>
                <th style="padding:8px;">Control BSI</th>
                <th style="padding:8px;">Patient L%</th>
                <th style="padding:8px;">Control L%</th>
            </tr>
            {''.join(f"""
            <tr style="border-top:1px solid #1e293b;">
                <td style="padding:8px;color:#cbd5e1;">{['First Third','Middle Third','Last Third'][i]}</td>
                <td style="padding:8px;text-align:center;color:#ef4444;font-family:monospace;">{p['thirds'][i]['bsi']:.1f}%</td>
                <td style="padding:8px;text-align:center;color:#3b82f6;font-family:monospace;">{c['thirds'][i]['bsi']:.1f}%</td>
                <td style="padding:8px;text-align:center;color:#ef4444;font-family:monospace;">{p['thirds'][i]['left_pct']:.1f}%</td>
                <td style="padding:8px;text-align:center;color:#3b82f6;font-family:monospace;">{c['thirds'][i]['left_pct']:.1f}%</td>
            </tr>""" for i in range(3))}
        </table>
    </div>
    <div class="insight" style="display:flex;align-items:center;">
        <div>
            <strong>Fatigue pattern:</strong> Watch for BSI increasing over time — this suggests
            the injured side fatigues faster and offloads to the healthy leg.
            Patient early→late BSI trend: {p['thirds'][0]['bsi']:.1f}% → {p['thirds'][2]['bsi']:.1f}%.
            Control trend: {c['thirds'][0]['bsi']:.1f}% → {c['thirds'][2]['bsi']:.1f}%.
        </div>
    </div>
</div>

<footer>
    Generated by Balance Board Differential Analysis &mdash; Rowing Recovery System &mdash; {now.strftime('%Y-%m-%d %H:%M')}
</footer>

</body>
</html>'''

    with open(output_file, 'w') as f:
        f.write(html)

    print(f"\n✅ Report saved: {output_file}")
    return output_file


# ─── CLI Entry Point ────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 compare_subjects.py <patient_csv> <control_csv> [output.html]")
        print("  patient_csv: Balance board CSV from Achilles recovery patient")
        print("  control_csv: Balance board CSV from healthy control subject")
        sys.exit(1)

    patient_file = sys.argv[1]
    control_file = sys.argv[2]
    output_file = sys.argv[3] if len(sys.argv) > 3 else 'comparison_report.html'

    generate_report(patient_file, control_file, output_file)
