#!/usr/bin/env python3
"""
Achilles Tendon Recovery — Longitudinal PT Analysis
Patient: Right Achilles tear, 13 months post-op (surgery ~2025-03-05)
Analyzes 86+ CSV files across multiple hardware epochs.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec
import seaborn as sns
from scipy.signal import find_peaks
from pathlib import Path
from datetime import date, datetime
import re
import warnings
warnings.filterwarnings('ignore')

# ─── Configuration ──────────────────────────────────────────────────────────

BODY_WEIGHT_KG = 84.0
BODY_WEIGHT_N = BODY_WEIGHT_KG * 9.81  # ~823.8 N
SURGERY_DATE = date(2025, 3, 5)
CURRENT_DATE = date(2026, 4, 1)
INJURED_SIDE = 'right'
MONTHS_POST_OP = (CURRENT_DATE - SURGERY_DATE).days / 30.44

HARDWARE_EPOCHS = [
    ('Breadboard',    date(2026, 3, 1),  date(2026, 3, 8),  '#FFE0B2'),
    ('Balance Board', date(2026, 3, 14), date(2026, 3, 18), '#C8E6C9'),
    ('PCB v1',        date(2026, 3, 23), date(2026, 3, 28), '#BBDEFB'),
    ('PCB v2',        date(2026, 4, 1),  date(2026, 4, 2),  '#E1BEE7'),
]

BENCHMARKS = {
    'lsi_return_sport': 90,
    'lsi_general_activity': 80,
    'lsi_red_flag': 70,
    'asymmetry_red_flag': 10,
    'bw_running': 1.5,
    'bw_sport': 2.5,
}

DATA_DIRS = [
    Path.home() / 'Downloads',
    Path.home() / 'Desktop' / 'ForceOverTime',
    Path.home() / 'Desktop' / 'Claude Projects' / 'Balance_Board_2',
]

OUTPUT_DIR = Path.home() / 'Desktop' / 'Claude Projects' / 'achilles_analysis_output'
OUTPUT_DIR.mkdir(exist_ok=True)

sns.set_theme(style='whitegrid', font_scale=1.1)
COLORS = {'left': '#2196F3', 'right': '#F44336', 'total': '#4CAF50',
           'benchmark': '#FF9800', 'red_flag': '#D32F2F'}

# ─── File Discovery ─────────────────────────────────────────────────────────

def extract_date_from_filename(path):
    m = re.search(r'(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})', path.name)
    if m:
        return datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y-%m-%d %H-%M")
    m = re.search(r'(\d{4}-\d{2}-\d{2})', path.name)
    if m:
        return datetime.strptime(m.group(1), "%Y-%m-%d")
    return None

def detect_format(path):
    try:
        with open(path, 'r') as f:
            line1 = f.readline().strip()
            line2 = f.readline().strip() if line1.startswith('#') else line1
        if 'Time(s)' in line1 and 'L_Heel' in line1:
            return 'force_over_time'
        if line1.startswith('#') and 'Exercise' in line1:
            return 'balance_board_exercise'
        if 'elapsed_s' in line1 and 'fl' in line1:
            return 'balance_board_raw'
        if 'elapsed_s' in line2 and 'fl' in line2:
            return 'balance_board_exercise'
    except Exception:
        pass
    return None

def get_exercise_type(path):
    name = path.name.lower()
    if 'bilateral_stance' in name:
        return 'bilateral_stance'
    if 'heel_rise_fatigue' in name or 'heel_rise_hold' in name:
        return 'heel_rise'
    if 'squat' in name:
        return 'squats'
    if 'control' in name:
        return 'control'
    if 'balanceboard' in name:
        return 'full_session'
    if 'forceovertime' in name:
        return 'force_plate'
    return 'unknown'

def get_hardware_epoch(dt):
    d = dt.date() if isinstance(dt, datetime) else dt
    for name, start, end, _ in HARDWARE_EPOCHS:
        if start <= d <= end:
            return name
    return 'Unknown'

def discover_files():
    files = []
    seen = set()
    for base in DATA_DIRS:
        if not base.exists():
            continue
        for p in sorted(base.rglob('*.csv')):
            fmt = detect_format(p)
            if fmt is None:
                continue
            dt = extract_date_from_filename(p)
            if dt is None:
                continue
            key = (p.name, dt.date())
            if key in seen:
                continue
            seen.add(key)
            files.append({
                'path': p,
                'datetime': dt,
                'date': dt.date(),
                'format': fmt,
                'exercise': get_exercise_type(p),
                'epoch': get_hardware_epoch(dt),
            })
    files.sort(key=lambda x: x['datetime'])
    return files

# ─── Data Loaders ───────────────────────────────────────────────────────────

def load_force_over_time(path):
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    required = ['Total_Force_N', 'Left_Force_N', 'Right_Force_N']
    for col in required:
        if col not in df.columns:
            return None
    df['Total_Force_N'] = pd.to_numeric(df['Total_Force_N'], errors='coerce')
    df['Left_Force_N'] = pd.to_numeric(df['Left_Force_N'], errors='coerce')
    df['Right_Force_N'] = pd.to_numeric(df['Right_Force_N'], errors='coerce')
    df.dropna(subset=required, inplace=True)
    # Filter out zero-only rows
    df = df[df['Total_Force_N'] > 10].copy()
    if len(df) < 5:
        return None
    total = df['Total_Force_N']
    df['left_pct'] = np.where(total > 0, df['Left_Force_N'] / total * 100, 50)
    df['right_pct'] = np.where(total > 0, df['Right_Force_N'] / total * 100, 50)
    df['asymmetry'] = (df['left_pct'] - df['right_pct']).abs()
    return df

def parse_bb_header(path):
    meta = {}
    with open(path, 'r') as f:
        line = f.readline().strip()
    if line.startswith('#'):
        for part in line[1:].split('|'):
            part = part.strip()
            if ':' in part:
                k, v = part.split(':', 1)
                k, v = k.strip(), v.strip()
                if k == 'Exercise':
                    meta['exercise'] = v
                elif k == 'Avg BSI':
                    meta['avg_bsi'] = float(v.replace('%', ''))
                elif k == 'CoP Velocity':
                    meta['cop_velocity'] = float(v.replace('%/s', '').strip())
                elif k == 'CoP Ellipse Area':
                    meta['cop_ellipse'] = float(v.replace('%', '').replace('\u00b2', '').strip())
                elif k == 'Samples':
                    meta['samples'] = int(v)
    return meta

def load_balance_board(path):
    meta = parse_bb_header(path)
    df = pd.read_csv(path, comment='#')
    df.columns = df.columns.str.strip()
    for col in ['fl', 'fr', 'rl', 'rr']:
        if col not in df.columns:
            return None, meta
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
    df['total'] = df['fl'] + df['fr'] + df['rl'] + df['rr']
    df = df[df['total'] > 1000].copy()
    if len(df) < 5:
        return None, meta
    if 'left_force' not in df.columns:
        df['left_force'] = df['fl'] + df['rl']
        df['right_force'] = df['fr'] + df['rr']
    else:
        df['left_force'] = pd.to_numeric(df['left_force'], errors='coerce').fillna(df['fl'] + df['rl'])
        df['right_force'] = pd.to_numeric(df['right_force'], errors='coerce').fillna(df['fr'] + df['rr'])
    if 'left_pct' not in df.columns:
        df['left_pct'] = df['left_force'] / df['total'] * 100
        df['right_pct'] = df['right_force'] / df['total'] * 100
    else:
        df['left_pct'] = pd.to_numeric(df['left_pct'], errors='coerce')
        df['right_pct'] = pd.to_numeric(df['right_pct'], errors='coerce')
    if 'bsi' not in df.columns:
        df['bsi'] = (df['left_force'] - df['right_force']).abs() / df['total'] * 100
    else:
        df['bsi'] = pd.to_numeric(df['bsi'], errors='coerce')
    df['asymmetry'] = (df['left_pct'] - df['right_pct']).abs()
    return df, meta

# ─── Metric Extraction ──────────────────────────────────────────────────────

def extract_fot_metrics(df, rec):
    m = {
        'date': rec['date'],
        'datetime': rec['datetime'],
        'epoch': rec['epoch'],
        'data_type': 'force_plate',
        'exercise': rec['exercise'],
        'n_samples': len(df),
    }
    # Peak forces
    m['peak_total_N'] = df['Total_Force_N'].max()
    m['peak_left_N'] = df['Left_Force_N'].max()
    m['peak_right_N'] = df['Right_Force_N'].max()
    # Filter to BILATERAL portions only (both sides contributing >15% of total)
    bilateral = df[(df['right_pct'] > 15) & (df['left_pct'] > 15)]
    if len(bilateral) < 5:
        bilateral = df  # fallback to all data
    # Mean forces from bilateral top 10% for stable peak estimate
    top = bilateral.nlargest(max(1, len(bilateral)//10), 'Total_Force_N')
    m['mean_top_left_N'] = top['Left_Force_N'].mean()
    m['mean_top_right_N'] = top['Right_Force_N'].mean()
    m['mean_top_total_N'] = top['Total_Force_N'].mean()
    m['bilateral_samples_pct'] = len(bilateral) / len(df) * 100
    # LSI: injured (right) / uninvolved (left) — from bilateral portions only
    if m['mean_top_left_N'] > 0:
        m['lsi'] = m['mean_top_right_N'] / m['mean_top_left_N'] * 100
    else:
        m['lsi'] = np.nan
    # Asymmetry from bilateral top-force region
    m['mean_left_pct'] = top['left_pct'].mean()
    m['mean_right_pct'] = top['right_pct'].mean()
    m['mean_asymmetry'] = top['asymmetry'].mean()
    # BW normalization
    m['peak_right_bw'] = m['peak_right_N'] / BODY_WEIGHT_N
    m['peak_total_bw'] = m['peak_total_N'] / BODY_WEIGHT_N
    # Sensor health
    sensor_cols = ['L_Heel', 'L_Ball', 'L_Toe', 'R_Heel', 'R_Ball', 'R_Toe']
    m['dead_sensors'] = []
    for col in sensor_cols:
        if col in df.columns:
            vals = pd.to_numeric(df[col], errors='coerce')
            if (vals == 0).mean() > 0.9:
                m['dead_sensors'].append(col)
    # Rep count from phase transitions
    if 'Phase' in df.columns:
        phases = df['Phase'].astype(str)
        transitions = (phases == 'drive') & (phases.shift(1) != 'drive')
        m['rep_count'] = transitions.sum()
    else:
        m['rep_count'] = 0
    return m

def extract_bb_metrics(df, meta, rec):
    m = {
        'date': rec['date'],
        'datetime': rec['datetime'],
        'epoch': rec['epoch'],
        'data_type': 'balance_board',
        'exercise': rec['exercise'],
        'n_samples': len(df),
    }
    m['mean_left_pct'] = df['left_pct'].mean()
    m['mean_right_pct'] = df['right_pct'].mean()
    m['mean_bsi'] = df['bsi'].mean()
    m['std_bsi'] = df['bsi'].std()
    m['mean_asymmetry'] = df['asymmetry'].mean()
    # LSI from weight distribution: right/left
    # Only compute if both sides have meaningful weight (>10% each)
    if m['mean_left_pct'] > 10 and m['mean_right_pct'] > 10:
        m['lsi'] = m['mean_right_pct'] / m['mean_left_pct'] * 100
    else:
        m['lsi'] = np.nan
    # Header metrics
    m['cop_velocity'] = meta.get('cop_velocity', np.nan)
    m['cop_ellipse'] = meta.get('cop_ellipse', np.nan)
    # Force plate metrics not applicable
    m['peak_total_N'] = np.nan
    m['peak_left_N'] = np.nan
    m['peak_right_N'] = np.nan
    m['peak_right_bw'] = np.nan
    m['peak_total_bw'] = np.nan
    m['dead_sensors'] = []
    m['rep_count'] = 0
    # Phase-specific BSI for heel rise fatigue
    if 'phase' in df.columns:
        phase_bsi = df.groupby('phase')['bsi'].agg(['mean', 'std', 'count'])
        m['phase_bsi'] = phase_bsi.to_dict('index')
    else:
        m['phase_bsi'] = {}
    return m

# ─── Analysis Pipeline ──────────────────────────────────────────────────────

def process_all_files(files):
    metrics = []
    bb_sessions = []  # (df, meta, rec) for detailed plots
    fot_sessions = []
    for rec in files:
        try:
            if rec['format'] == 'force_over_time':
                df = load_force_over_time(rec['path'])
                if df is None:
                    continue
                m = extract_fot_metrics(df, rec)
                metrics.append(m)
                fot_sessions.append((df, rec))
            else:
                df, meta = load_balance_board(rec['path'])
                if df is None:
                    continue
                m = extract_bb_metrics(df, meta, rec)
                metrics.append(m)
                bb_sessions.append((df, meta, rec))
        except Exception as e:
            print(f"  SKIP {rec['path'].name}: {e}")
    return pd.DataFrame(metrics), bb_sessions, fot_sessions

# ─── Clinical Assessment ────────────────────────────────────────────────────

def assess_clinical(timeline):
    findings = []
    latest_fot = timeline[timeline['data_type'] == 'force_plate']
    latest_bb = timeline[timeline['data_type'] == 'balance_board']

    # Latest force plate session
    if len(latest_fot) > 0:
        last = latest_fot.iloc[-1]
        lsi = last.get('lsi', np.nan)
        if not np.isnan(lsi):
            if lsi >= 90:
                findings.append(('GREEN', f'Force plate LSI = {lsi:.1f}% (return-to-sport range)'))
            elif lsi >= 80:
                findings.append(('YELLOW', f'Force plate LSI = {lsi:.1f}% (general activity range, below sport threshold)'))
            elif lsi >= 70:
                findings.append(('YELLOW', f'Force plate LSI = {lsi:.1f}% (lower end of expected range at 13mo)'))
            else:
                findings.append(('RED', f'Force plate LSI = {lsi:.1f}% (below expected range for 13mo post-op)'))
        asym = last.get('mean_asymmetry', np.nan)
        if not np.isnan(asym):
            if asym > 10:
                findings.append(('RED', f'Force plate asymmetry = {asym:.1f}% (exceeds 10% red flag)'))
            else:
                findings.append(('GREEN', f'Force plate asymmetry = {asym:.1f}% (within acceptable range)'))
        pbw = last.get('peak_right_bw', np.nan)
        if not np.isnan(pbw):
            if pbw >= 1.5:
                findings.append(('GREEN', f'Peak injured-side force = {pbw:.2f}x BW (running readiness met)'))
            elif pbw >= 1.0:
                findings.append(('YELLOW', f'Peak injured-side force = {pbw:.2f}x BW (below 1.5x running threshold)'))
            else:
                findings.append(('RED', f'Peak injured-side force = {pbw:.2f}x BW (significantly below running threshold)'))
        dead = last.get('dead_sensors', [])
        if dead:
            findings.append(('YELLOW', f'Dead sensors detected: {", ".join(dead)} — right-side force may be underreported'))

    # Latest balance board session
    if len(latest_bb) > 0:
        last_bb = latest_bb.iloc[-1]
        bsi = last_bb.get('mean_bsi', np.nan)
        if not np.isnan(bsi):
            if bsi < 5:
                findings.append(('GREEN', f'Balance board BSI = {bsi:.1f}% (excellent symmetry)'))
            elif bsi < 10:
                findings.append(('YELLOW', f'Balance board BSI = {bsi:.1f}% (mild asymmetry)'))
            else:
                findings.append(('RED', f'Balance board BSI = {bsi:.1f}% (significant asymmetry)'))

    # Trend analysis
    fot_with_lsi = latest_fot.dropna(subset=['lsi'])
    if len(fot_with_lsi) >= 3:
        recent = fot_with_lsi.tail(5)['lsi']
        early = fot_with_lsi.head(5)['lsi']
        diff = recent.mean() - early.mean()
        if diff > 5:
            findings.append(('GREEN', f'LSI trend: improving (+{diff:.1f}% from early to recent sessions)'))
        elif diff > -5:
            findings.append(('YELLOW', f'LSI trend: stable ({diff:+.1f}% from early to recent sessions)'))
        else:
            findings.append(('RED', f'LSI trend: declining ({diff:+.1f}% from early to recent sessions)'))

    return findings

# ─── Visualizations ─────────────────────────────────────────────────────────

def add_epoch_shading(ax, ymin=None, ymax=None):
    if ymin is None:
        ymin, ymax = ax.get_ylim()
    for name, start, end, color in HARDWARE_EPOCHS:
        ax.axvspan(mdates.date2num(datetime.combine(start, datetime.min.time())),
                   mdates.date2num(datetime.combine(end, datetime.max.time())),
                   alpha=0.15, color=color, label=name)

def add_benchmark_lines(ax, benchmarks):
    for val, label, color, style in benchmarks:
        ax.axhline(y=val, color=color, linestyle=style, alpha=0.7, linewidth=1.5)
        ax.text(ax.get_xlim()[1], val, f' {label}', va='center', fontsize=8,
                color=color, fontweight='bold')

def plot_lsi_timeline(timeline, outdir):
    fig, ax = plt.subplots(figsize=(14, 6))
    fot = timeline[timeline['data_type'] == 'force_plate'].dropna(subset=['lsi'])
    bb = timeline[timeline['data_type'] == 'balance_board'].dropna(subset=['lsi'])

    if len(fot) > 0:
        dates_fot = [mdates.date2num(datetime.combine(d, datetime.min.time())) for d in fot['date']]
        ax.scatter(dates_fot, fot['lsi'], c=COLORS['right'], s=60, zorder=5,
                   label='Force Plate LSI', edgecolors='white', linewidth=0.5)
        if len(fot) > 1:
            ax.plot(dates_fot, fot['lsi'], c=COLORS['right'], alpha=0.4, linewidth=1)

    if len(bb) > 0:
        dates_bb = [mdates.date2num(datetime.combine(d, datetime.min.time())) for d in bb['date']]
        ax.scatter(dates_bb, bb['lsi'], c=COLORS['left'], s=60, zorder=5, marker='D',
                   label='Balance Board LSI', edgecolors='white', linewidth=0.5)
        if len(bb) > 1:
            ax.plot(dates_bb, bb['lsi'], c=COLORS['left'], alpha=0.4, linewidth=1)

    add_epoch_shading(ax)
    # Benchmark zones
    ax.axhspan(90, 110, alpha=0.08, color='green')
    ax.axhspan(80, 90, alpha=0.06, color='yellow')
    ax.axhspan(0, 70, alpha=0.06, color='red')
    ax.axhline(y=90, color='green', linestyle='--', alpha=0.6, linewidth=1)
    ax.axhline(y=80, color='orange', linestyle='--', alpha=0.6, linewidth=1)
    ax.axhline(y=70, color='red', linestyle='--', alpha=0.6, linewidth=1)
    ax.text(ax.get_xlim()[0], 91, ' Return to Sport (90%)', fontsize=8, color='green')
    ax.text(ax.get_xlim()[0], 81, ' General Activity (80%)', fontsize=8, color='orange')
    ax.text(ax.get_xlim()[0], 71, ' Red Flag (<70%)', fontsize=8, color='red')

    ax.set_ylabel('Limb Symmetry Index (%)\n(Injured Right / Uninvolved Left)')
    ax.set_title(f'Achilles Recovery: LSI Over Time — {MONTHS_POST_OP:.0f} Months Post-Op',
                 fontsize=14, fontweight='bold')
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=1))
    fig.autofmt_xdate()
    ax.legend(loc='lower right', framealpha=0.9)
    ax.set_ylim(0, 120)
    plt.tight_layout()
    fig.savefig(outdir / 'lsi_timeline.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_asymmetry_timeline(timeline, outdir):
    fig, ax = plt.subplots(figsize=(14, 6))
    valid = timeline.dropna(subset=['mean_asymmetry'])
    if len(valid) == 0:
        plt.close()
        return

    for dtype, marker, label in [('force_plate', 'o', 'Force Plate'),
                                  ('balance_board', 'D', 'Balance Board')]:
        sub = valid[valid['data_type'] == dtype]
        if len(sub) > 0:
            dates = [mdates.date2num(datetime.combine(d, datetime.min.time())) for d in sub['date']]
            ax.scatter(dates, sub['mean_asymmetry'], s=60, marker=marker, label=label,
                       edgecolors='white', linewidth=0.5, zorder=5)
            if len(sub) > 1:
                ax.plot(dates, sub['mean_asymmetry'], alpha=0.3, linewidth=1)

    add_epoch_shading(ax)
    ax.axhline(y=10, color=COLORS['red_flag'], linestyle='--', linewidth=1.5, alpha=0.7)
    ax.text(ax.get_xlim()[0], 10.5, ' 10% Red Flag Threshold', fontsize=8, color=COLORS['red_flag'])

    ax.set_ylabel('Bilateral Asymmetry (%)\n|Left% - Right%|')
    ax.set_title('L/R Force Asymmetry Over Time', fontsize=14, fontweight='bold')
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    fig.autofmt_xdate()
    ax.legend(loc='upper right', framealpha=0.9)
    ax.set_ylim(0, None)
    plt.tight_layout()
    fig.savefig(outdir / 'asymmetry_timeline.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_peak_force_timeline(timeline, outdir):
    fig, ax1 = plt.subplots(figsize=(14, 6))
    fot = timeline[timeline['data_type'] == 'force_plate'].dropna(subset=['peak_right_N'])
    if len(fot) == 0:
        plt.close()
        return

    dates = [mdates.date2num(datetime.combine(d, datetime.min.time())) for d in fot['date']]

    ax1.scatter(dates, fot['peak_right_N'], c=COLORS['right'], s=60, label='Right (Injured)',
                edgecolors='white', linewidth=0.5, zorder=5)
    ax1.scatter(dates, fot['peak_left_N'], c=COLORS['left'], s=60, label='Left (Uninvolved)',
                edgecolors='white', linewidth=0.5, zorder=5)
    if len(fot) > 1:
        ax1.plot(dates, fot['peak_right_N'], c=COLORS['right'], alpha=0.3)
        ax1.plot(dates, fot['peak_left_N'], c=COLORS['left'], alpha=0.3)

    add_epoch_shading(ax1)

    # BW reference lines
    for mult, label in [(1.0, '1.0x BW'), (1.5, '1.5x BW (Running)'), (2.0, '2.0x BW')]:
        ax1.axhline(y=BODY_WEIGHT_N * mult, color='gray', linestyle=':', alpha=0.5)
        ax1.text(ax1.get_xlim()[0], BODY_WEIGHT_N * mult + 10, f' {label}', fontsize=8, color='gray')

    ax1.set_ylabel('Peak Force (N)')
    ax1.set_title('Peak Force: Injured vs Uninvolved Side', fontsize=14, fontweight='bold')

    # Secondary y-axis for BW multiple
    ax2 = ax1.twinx()
    ax2.set_ylim(ax1.get_ylim()[0] / BODY_WEIGHT_N, ax1.get_ylim()[1] / BODY_WEIGHT_N)
    ax2.set_ylabel('x Body Weight')

    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    fig.autofmt_xdate()
    ax1.legend(loc='upper left', framealpha=0.9)
    plt.tight_layout()
    fig.savefig(outdir / 'peak_force_timeline.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_bsi_timeline(timeline, outdir):
    fig, ax = plt.subplots(figsize=(14, 6))
    bb = timeline[timeline['data_type'] == 'balance_board'].dropna(subset=['mean_bsi'])
    if len(bb) == 0:
        plt.close()
        return

    exercise_colors = {'bilateral_stance': '#2196F3', 'heel_rise': '#F44336',
                       'squats': '#4CAF50', 'full_session': '#9C27B0', 'control': '#FF9800'}

    for ex in bb['exercise'].unique():
        sub = bb[bb['exercise'] == ex]
        dates = [mdates.date2num(datetime.combine(d, datetime.min.time())) for d in sub['date']]
        c = exercise_colors.get(ex, 'gray')
        ax.scatter(dates, sub['mean_bsi'], c=c, s=80, label=ex.replace('_', ' ').title(),
                   edgecolors='white', linewidth=0.5, zorder=5)
        if 'std_bsi' in sub.columns:
            ax.errorbar(dates, sub['mean_bsi'], yerr=sub['std_bsi'], fmt='none',
                        ecolor=c, alpha=0.3, capsize=3)

    add_epoch_shading(ax)
    ax.axhline(y=5, color='green', linestyle='--', alpha=0.5, linewidth=1)
    ax.axhline(y=10, color=COLORS['red_flag'], linestyle='--', alpha=0.5, linewidth=1)
    ax.text(ax.get_xlim()[0], 5.3, ' <5% Excellent', fontsize=8, color='green')
    ax.text(ax.get_xlim()[0], 10.3, ' >10% Significant', fontsize=8, color=COLORS['red_flag'])

    ax.set_ylabel('Balance Symmetry Index (BSI %)')
    ax.set_title('Balance Board: BSI Over Time by Exercise', fontsize=14, fontweight='bold')
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    fig.autofmt_xdate()
    ax.legend(loc='upper right', framealpha=0.9)
    ax.set_ylim(0, None)
    plt.tight_layout()
    fig.savefig(outdir / 'bsi_timeline.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_bilateral_stance_detail(bb_sessions, outdir):
    stance_sessions = [(df, meta, rec) for df, meta, rec in bb_sessions
                       if rec['exercise'] in ('bilateral_stance', 'full_session', 'control')]
    if not stance_sessions:
        return
    n = min(len(stance_sessions), 6)
    fig, axes = plt.subplots(min(n, 3), max(1, (n+2)//3), figsize=(14, 4*min(n, 3)),
                              squeeze=False)
    axes = axes.flatten()
    for i, (df, meta, rec) in enumerate(stance_sessions[:n]):
        ax = axes[i]
        if 'elapsed_s' in df.columns:
            x = df['elapsed_s']
        else:
            x = range(len(df))
        ax.plot(x, df['left_pct'], color=COLORS['left'], alpha=0.7, label='Left (Uninvolved)')
        ax.plot(x, df['right_pct'], color=COLORS['right'], alpha=0.7, label='Right (Injured)')
        ax.axhline(y=50, color='gray', linestyle='-', alpha=0.3)
        ax.axhspan(45, 55, alpha=0.05, color='green')
        ax.set_title(f"{rec['date']} — {rec['exercise'].replace('_', ' ').title()}", fontsize=10)
        ax.set_ylabel('Weight %')
        ax.set_ylim(30, 70)
        if i == 0:
            ax.legend(fontsize=8)
    for j in range(i+1, len(axes)):
        axes[j].set_visible(False)
    fig.suptitle('Bilateral Stance: Weight Distribution Over Time', fontsize=14, fontweight='bold')
    plt.tight_layout()
    fig.savefig(outdir / 'bilateral_stance_detail.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_heel_rise_fatigue(bb_sessions, outdir):
    hr_sessions = [(df, meta, rec) for df, meta, rec in bb_sessions
                   if 'heel_rise' in rec['exercise']]
    if not hr_sessions:
        return
    fig, ax = plt.subplots(figsize=(12, 6))
    for df, meta, rec in hr_sessions:
        if 'phase' in df.columns:
            phase_bsi = df.groupby('phase')['bsi'].mean()
            phases = [p for p in phase_bsi.index if 'Hold' in str(p) or 'main' in str(p)]
            if phases:
                ax.plot(range(len(phases)), [phase_bsi[p] for p in phases],
                        marker='o', label=str(rec['date']))
    ax.set_xlabel('Hold Phase')
    ax.set_ylabel('Mean BSI (%)')
    ax.set_title('Heel Rise Fatigue: BSI Across Hold Phases', fontsize=14, fontweight='bold')
    ax.legend(fontsize=9)
    ax.axhline(y=10, color=COLORS['red_flag'], linestyle='--', alpha=0.5)
    plt.tight_layout()
    fig.savefig(outdir / 'heel_rise_fatigue.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_sensor_health(timeline, outdir):
    fot = timeline[timeline['data_type'] == 'force_plate'].copy()
    if len(fot) == 0:
        return
    sensors = ['L_Heel', 'L_Ball', 'L_Toe', 'R_Heel', 'R_Ball', 'R_Toe']
    grid = np.zeros((len(fot), len(sensors)))
    for i, (_, row) in enumerate(fot.iterrows()):
        dead = row.get('dead_sensors', [])
        if isinstance(dead, list):
            for j, s in enumerate(sensors):
                grid[i, j] = 1 if s in dead else 0

    fig, ax = plt.subplots(figsize=(10, max(4, len(fot)*0.3)))
    cmap = plt.cm.colors.ListedColormap(['#4CAF50', '#F44336'])
    im = ax.imshow(grid, aspect='auto', cmap=cmap, interpolation='nearest')
    ax.set_xticks(range(len(sensors)))
    ax.set_xticklabels(sensors, rotation=45, ha='right')
    date_labels = [str(d) for d in fot['date']]
    ax.set_yticks(range(len(date_labels)))
    ax.set_yticklabels(date_labels, fontsize=7)
    ax.set_title('Sensor Health Dashboard (Green=OK, Red=Dead)', fontsize=14, fontweight='bold')
    plt.tight_layout()
    fig.savefig(outdir / 'sensor_health.png', dpi=150, bbox_inches='tight')
    plt.close()

def plot_latest_session(fot_sessions, timeline, outdir):
    if not fot_sessions:
        return
    df, rec = fot_sessions[-1]
    fig = plt.figure(figsize=(16, 10))
    gs = GridSpec(2, 2, figure=fig, hspace=0.35, wspace=0.3)

    # Panel A: Force curves over time
    ax1 = fig.add_subplot(gs[0, :])
    t = df['Time(s)'] - df['Time(s)'].iloc[0]
    ax1.plot(t, df['Left_Force_N'], color=COLORS['left'], alpha=0.8, label='Left (Uninvolved)')
    ax1.plot(t, df['Right_Force_N'], color=COLORS['right'], alpha=0.8, label='Right (Injured)')
    ax1.plot(t, df['Total_Force_N'], color=COLORS['total'], alpha=0.5, label='Total', linewidth=0.8)
    ax1.set_xlabel('Time (s)')
    ax1.set_ylabel('Force (N)')
    ax1.set_title(f'Latest Session: {rec["date"]} — Force Curves', fontsize=12, fontweight='bold')
    ax1.legend(fontsize=9)
    ax1.axhline(y=BODY_WEIGHT_N, color='gray', linestyle=':', alpha=0.4)
    ax1.text(t.iloc[-1], BODY_WEIGHT_N, ' 1x BW', fontsize=8, color='gray')

    # Panel B: Sensor distribution at peak
    ax2 = fig.add_subplot(gs[1, 0])
    sensor_cols = ['L_Heel', 'L_Ball', 'L_Toe', 'R_Heel', 'R_Ball', 'R_Toe']
    peak_idx = df['Total_Force_N'].idxmax()
    peak_vals = []
    peak_labels = []
    peak_colors = []
    for col in sensor_cols:
        if col in df.columns:
            v = pd.to_numeric(df.loc[peak_idx, col], errors='coerce')
            peak_vals.append(v if not np.isnan(v) else 0)
        else:
            peak_vals.append(0)
        peak_labels.append(col)
        peak_colors.append(COLORS['left'] if col.startswith('L') else COLORS['right'])
    bars = ax2.bar(peak_labels, peak_vals, color=peak_colors, alpha=0.8, edgecolor='white')
    for bar, val in zip(bars, peak_vals):
        if val == 0:
            bar.set_hatch('///')
            bar.set_edgecolor('red')
    ax2.set_ylabel('Scaled Units')
    ax2.set_title('Sensor Distribution at Peak Force', fontsize=11)
    ax2.tick_params(axis='x', rotation=45)

    # Panel C: LSI gauge
    ax3 = fig.add_subplot(gs[1, 1])
    fot_metrics = timeline[timeline['data_type'] == 'force_plate'].dropna(subset=['lsi'])
    if len(fot_metrics) > 0:
        latest_lsi = fot_metrics.iloc[-1]['lsi']
        # Horizontal bar gauge
        ax3.barh(['LSI'], [latest_lsi], color=COLORS['right'] if latest_lsi < 70 else
                 (COLORS['benchmark'] if latest_lsi < 80 else
                  ('gold' if latest_lsi < 90 else COLORS['total'])),
                 height=0.5, alpha=0.8)
        ax3.axvline(x=90, color='green', linestyle='--', linewidth=2, label='Sport (90%)')
        ax3.axvline(x=80, color='orange', linestyle='--', linewidth=2, label='Activity (80%)')
        ax3.axvline(x=70, color='red', linestyle='--', linewidth=2, label='Red Flag (70%)')
        ax3.set_xlim(0, 110)
        ax3.set_xlabel('LSI (%)')
        ax3.set_title(f'Current LSI: {latest_lsi:.1f}%', fontsize=11, fontweight='bold')
        ax3.legend(fontsize=8, loc='upper left')
    else:
        ax3.text(0.5, 0.5, 'No LSI data', ha='center', va='center', transform=ax3.transAxes)

    fig.suptitle(f'Latest Session Summary — {MONTHS_POST_OP:.0f} Months Post-Op Right Achilles Repair',
                 fontsize=14, fontweight='bold', y=1.01)
    fig.savefig(outdir / 'latest_session_summary.png', dpi=150, bbox_inches='tight')
    plt.close()

# ─── Console Report ─────────────────────────────────────────────────────────

def print_report(timeline, findings):
    w = 70
    print('=' * w)
    print('ACHILLES TENDON RECOVERY — PT ANALYSIS REPORT'.center(w))
    print('=' * w)
    print(f'\n  Patient:          Right Achilles repair')
    print(f'  Surgery date:     {SURGERY_DATE}')
    print(f'  Months post-op:   {MONTHS_POST_OP:.1f}')
    print(f'  Body weight:      {BODY_WEIGHT_KG} kg ({BODY_WEIGHT_KG*2.205:.0f} lbs)')
    print(f'  Analysis date:    {CURRENT_DATE}')

    print(f'\n{"─"*w}')
    print('  DATA INVENTORY')
    print(f'{"─"*w}')
    print(f'  Total sessions:   {len(timeline)}')
    for dt in ['force_plate', 'balance_board']:
        sub = timeline[timeline['data_type'] == dt]
        if len(sub) > 0:
            print(f'  {dt:18s} {len(sub):3d} sessions  ({sub["date"].min()} to {sub["date"].max()})')
    for epoch in timeline['epoch'].unique():
        n = len(timeline[timeline['epoch'] == epoch])
        print(f'    {epoch:16s} {n:3d} sessions')

    print(f'\n{"─"*w}')
    print('  LATEST METRICS')
    print(f'{"─"*w}')
    fot = timeline[timeline['data_type'] == 'force_plate']
    if len(fot) > 0:
        last = fot.iloc[-1]
        print(f'  Latest force plate session: {last["date"]}')
        print(f'    Peak total force:    {last.get("peak_total_N", 0):8.1f} N ({last.get("peak_total_bw", 0):.2f}x BW)')
        print(f'    Peak left (uninv):   {last.get("peak_left_N", 0):8.1f} N')
        print(f'    Peak right (inj):    {last.get("peak_right_N", 0):8.1f} N ({last.get("peak_right_bw", 0):.2f}x BW)')
        print(f'    LSI (R/L):           {last.get("lsi", 0):8.1f}%')
        print(f'    Mean asymmetry:      {last.get("mean_asymmetry", 0):8.1f}%')
        print(f'    L/R split:           {last.get("mean_left_pct", 0):.1f}% / {last.get("mean_right_pct", 0):.1f}%')
        bilateral_pct = last.get('bilateral_samples_pct', 100)
        if bilateral_pct < 100:
            print(f'    Bilateral portion:   {bilateral_pct:.0f}% of session (LSI from bilateral only)')
        dead = last.get('dead_sensors', [])
        if dead:
            print(f'    Dead sensors:        {", ".join(dead)}')

    bb = timeline[timeline['data_type'] == 'balance_board']
    if len(bb) > 0:
        last_bb = bb.iloc[-1]
        print(f'\n  Latest balance board session: {last_bb["date"]}')
        print(f'    Exercise:            {last_bb["exercise"]}')
        print(f'    Mean BSI:            {last_bb.get("mean_bsi", 0):8.1f}%')
        print(f'    L/R split:           {last_bb.get("mean_left_pct", 0):.1f}% / {last_bb.get("mean_right_pct", 0):.1f}%')

    print(f'\n{"─"*w}')
    print('  CLINICAL ASSESSMENT')
    print(f'{"─"*w}')
    for severity, msg in findings:
        icon = {'GREEN': '+', 'YELLOW': '~', 'RED': '!'}[severity]
        print(f'  [{icon}] {msg}')

    print(f'\n{"─"*w}')
    print('  CONTEXT: EXPECTED AT 13 MONTHS POST-OP')
    print(f'{"─"*w}')
    print('  Literature benchmarks for Achilles tendon repair:')
    print('    - LSI 70-90% is typical range (10-30% deficit persists)')
    print('    - >90% LSI needed for return to sport')
    print('    - >80% LSI for safe general activity')
    print('    - <70% LSI is a red flag requiring PT attention')
    print('    - Bilateral stance asymmetry should be <10%')
    print('    - 1.5x BW peak force = running readiness')
    print('    - Passive recovery largely plateaus at 12mo; active rehab critical')
    print('    - 37% of patients still have significant deficits at 12 months')

    # Sensor health warning
    all_dead = set()
    for _, row in fot.iterrows():
        ds = row.get('dead_sensors', [])
        if isinstance(ds, list):
            all_dead.update(ds)
    if all_dead:
        print(f'\n{"─"*w}')
        print('  SENSOR WARNINGS')
        print(f'{"─"*w}')
        print(f'  Sensors with frequent failures: {", ".join(sorted(all_dead))}')
        if 'R_Ball' in all_dead:
            print('  NOTE: R_Ball (injured foot ball sensor) dead in recent sessions.')
            print('  Right-side force is underreported by ~1 sensor worth of data.')
            print('  True LSI may be HIGHER than calculated. Consider repair/replacement.')

    print(f'\n{"="*w}')
    print(f'  Plots saved to: {OUTPUT_DIR}')
    print(f'{"="*w}\n')

# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    print('\nDiscovering data files...')
    files = discover_files()
    print(f'Found {len(files)} session files')
    for f in files[:5]:
        print(f'  {f["date"]} | {f["format"]:25s} | {f["exercise"]:20s} | {f["epoch"]}')
    if len(files) > 5:
        print(f'  ... and {len(files)-5} more')

    print('\nProcessing sessions...')
    timeline, bb_sessions, fot_sessions = process_all_files(files)
    print(f'Successfully processed {len(timeline)} sessions')

    if len(timeline) == 0:
        print('ERROR: No valid sessions found. Check file paths.')
        return

    print('\nRunning clinical assessment...')
    findings = assess_clinical(timeline)

    print('\nGenerating visualizations...')
    plot_lsi_timeline(timeline, OUTPUT_DIR)
    print('  [1/8] LSI timeline')
    plot_asymmetry_timeline(timeline, OUTPUT_DIR)
    print('  [2/8] Asymmetry timeline')
    plot_peak_force_timeline(timeline, OUTPUT_DIR)
    print('  [3/8] Peak force timeline')
    plot_bsi_timeline(timeline, OUTPUT_DIR)
    print('  [4/8] BSI timeline')
    plot_bilateral_stance_detail(bb_sessions, OUTPUT_DIR)
    print('  [5/8] Bilateral stance detail')
    plot_heel_rise_fatigue(bb_sessions, OUTPUT_DIR)
    print('  [6/8] Heel rise fatigue')
    plot_sensor_health(timeline, OUTPUT_DIR)
    print('  [7/8] Sensor health dashboard')
    plot_latest_session(fot_sessions, timeline, OUTPUT_DIR)
    print('  [8/8] Latest session summary')

    print_report(timeline, findings)

if __name__ == '__main__':
    main()
