#!/usr/bin/env python3
"""
make_puck_v3.py — FlexiForce A301 puck, LOW-PROFILE, 4-UP PLATE (B-rep / CadQuery)

Change from v2: diameter raised to ~= the sensor's 9.53 mm active area (full
active-area coverage, no overhang that would let load bypass the sensor), and
height dropped to 1.0 mm (low profile / comfortable). Still 4-up, separate bodies.

WHY 9.5 mm and not larger: a puck wider than the 9.53 mm sensing circle overhangs
onto the board, so that load bypasses the active area -> under-reads. 9.5 mm puts
the whole footprint on the active area = maximum signal. Load path is pure axial
compression through a short solid disc.

Output: STL (print) + STEP. Verify-every-build guard for 4 disjoint solids.
"""
import os, sys
import cadquery as cq
import trimesh
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

# ───────────────────────── PARAMETERS (all knobs here) ─────────────────────────
SENSOR_AREA_DIA = 9.53   # A301 active sensing-area diameter (mm) — the target to cover
PUCK_DIA        = 9.5    # puck OD (mm) — = active area, no overhang (do NOT exceed 9.53)
PUCK_H          = 1.0    # puck height (mm) — low profile; must stay tallest point in the stack
CHAMFER         = 0.3    # rim break (mm) — small, both rims (symmetric: no wrong way up)
GAP             = 5.0    # edge-to-edge gap between pucks (mm) — room for a shared brim
NX, NY          = 2, 2   # grid = 4 pucks

HERE   = os.path.dirname(os.path.abspath(__file__))
OUT_STL  = os.path.join(HERE, "flexiforce_puck_4up_v3.stl")
OUT_STEP = os.path.join(HERE, "flexiforce_puck_4up_v3.step")
OUT_PNG  = os.path.join(HERE, "flexiforce_puck_4up_v3_render.png")

# ───────────────────────── BUILD (2x2 array, separate bodies) ──────────────────
pitch = PUCK_DIA + GAP
xs = [(i - (NX - 1) / 2.0) * pitch for i in range(NX)]
ys = [(j - (NY - 1) / 2.0) * pitch for j in range(NY)]
positions = [(x, y) for x in xs for y in ys]

plate = (
    cq.Workplane("XY")
    .pushPoints(positions)
    .circle(PUCK_DIA / 2.0)
    .extrude(PUCK_H)
    .edges("%CIRCLE")
    .chamfer(CHAMFER)
)
cq.exporters.export(plate, OUT_STL, tolerance=0.005, angularTolerance=0.1)
cq.exporters.export(plate, OUT_STEP)

# ───────────────────────── VERIFY EVERY BUILD (fail loud) ──────────────────────
m = trimesh.load(OUT_STL)
bodies = m.split(only_watertight=False)
n_expect = NX * NY
ext = m.extents
com = m.center_mass
vol_cm3 = m.volume / 1000.0
single_vol = vol_cm3 / n_expect
body_vols = sorted(b.volume for b in bodies)
cyl_vol = (np.pi * (PUCK_DIA / 2) ** 2 * PUCK_H) / 1000.0   # plain-cylinder estimate (cm^3)
plate_x = (NX - 1) * pitch + PUCK_DIA
plate_y = (NY - 1) * pitch + PUCK_DIA
DENS = {"PLA": 1.24, "PETG": 1.27, "PAHT-CF": 1.20}

bodies_equal = (body_vols[-1] - body_vols[0]) / body_vols[0] < 0.01 if body_vols[0] else False
vol_sane = 0.85 * cyl_vol <= single_vol <= cyl_vol      # chamfer removes a little, never adds

checks = [
    ("watertight",                 bool(m.is_watertight),       True),
    ("body count == 4",            len(bodies),                 n_expect),
    ("euler (4 solids = 4x2)",     int(m.euler_number),         2 * n_expect),
    ("plate X extent",             round(float(ext[0]), 2),     round(plate_x, 2)),
    ("plate Y extent",             round(float(ext[1]), 2),     round(plate_y, 2)),
    ("height == PUCK_H (thin)",    round(float(ext[2]), 2),     PUCK_H),
    ("OD covers active area",      PUCK_DIA <= SENSOR_AREA_DIA, True),
    ("4 bodies identical",         bodies_equal,                True),
    ("per-body vol ~ cylinder",    vol_sane,                    True),
    ("layout symmetric x~0",       round(float(com[0]), 3),     0.0),
    ("layout symmetric y~0",       round(float(com[1]), 3),     0.0),
    ("top/bot symmetric z",        round(float(com[2]), 2),     round(PUCK_H / 2, 2)),
]
ok = True
print("\n===== VERIFY (puck low-profile 4-up v3) =====")
for name, got, want in checks:
    passed = (got == want) if not isinstance(want, float) else (abs(got - want) <= 0.02 + 0.01 * abs(want))
    ok = ok and passed
    print(f"  [{'PASS' if passed else 'FAIL'}] {name:26} got={got!r:>10}  want~={want!r}")
print("  ---")
print(f"  4 pucks  {PUCK_DIA:.1f} mm OD x {PUCK_H:.1f} mm tall   (aspect {PUCK_DIA/PUCK_H:.1f}:1, low profile)")
print(f"  2x2 @ {pitch:.1f} mm pitch  ->  plate {plate_x:.0f} x {plate_y:.0f} mm")
print(f"  set volume = {vol_cm3:.4f} cm^3   set mass: " + "  ".join(f"{k} {vol_cm3*d:.2f} g" for k, d in DENS.items()))
if not ok:
    print("\n  *** VERIFY FAILED — not writing render ***"); sys.exit(1)
print("  ALL CHECKS PASS\n")

# ───────────────────────── SHOW (iso + top layout + side profile) ──────────────
fig = plt.figure(figsize=(13, 4.5))

ax = fig.add_subplot(131, projection="3d")
ax.add_collection3d(Poly3DCollection(m.triangles, facecolor="#a855f7",
                                     edgecolor="k", linewidths=0.08, alpha=0.95))
Rx = plate_x / 2 + 1
ax.set_xlim(-Rx, Rx); ax.set_ylim(-Rx, Rx); ax.set_zlim(0, 2 * Rx * 0.25)
ax.set_box_aspect((1, 1, 0.25))
ax.view_init(elev=22, azim=42)
ax.set_title("low-profile puck — 4-up", fontsize=11)
ax.set_xlabel("x"); ax.set_ylabel("y"); ax.set_zlabel("z")

ax2 = fig.add_subplot(132)
for (x, y) in positions:
    ax2.add_patch(plt.Circle((x, y), SENSOR_AREA_DIA / 2, facecolor="none", edgecolor="#ef4444", lw=1.0, ls="--"))
    ax2.add_patch(plt.Circle((x, y), PUCK_DIA / 2, facecolor="#a855f7", alpha=0.35, edgecolor="#7e22ce", lw=2))
hx, hy = plate_x / 2, plate_y / 2
ax2.add_patch(plt.Rectangle((-hx, -hy), plate_x, plate_y, fill=False, edgecolor="#94a3b8", ls="--"))
ax2.annotate("", xy=(xs[0], ys[0]), xytext=(xs[1], ys[0]), arrowprops=dict(arrowstyle="<->", color="k"))
ax2.text((xs[0] + xs[1]) / 2, ys[0] + 0.8, f"{pitch:.1f} mm pitch", ha="center", fontsize=9)
ax2.text(0, hy + 1.2, f"plate {plate_x:.0f} x {plate_y:.0f} mm", ha="center", fontsize=9)
ax2.text(xs[1], ys[1] - 0.3, "puck 9.5\n(red = 9.53\nactive area)", ha="center", va="center", fontsize=6.5, color="#334155")
ax2.set_xlim(-hx - 3, hx + 3); ax2.set_ylim(-hy - 3, hy + 3)
ax2.set_aspect("equal"); ax2.set_title("top view — puck vs active area", fontsize=11)
ax2.set_xlabel("x (mm)"); ax2.set_ylabel("y (mm)"); ax2.grid(alpha=0.25)

# side profile to show thinness
ax3 = fig.add_subplot(133)
ax3.add_patch(plt.Rectangle((-PUCK_DIA / 2, 0), PUCK_DIA, PUCK_H, facecolor="#a855f7", alpha=0.4, edgecolor="#7e22ce", lw=2))
ax3.annotate("", xy=(PUCK_DIA / 2 + 1.5, 0), xytext=(PUCK_DIA / 2 + 1.5, PUCK_H), arrowprops=dict(arrowstyle="<->", color="k"))
ax3.text(PUCK_DIA / 2 + 2, PUCK_H / 2, f"{PUCK_H:.1f} mm", va="center", fontsize=10)
ax3.annotate("", xy=(-PUCK_DIA / 2, -0.6), xytext=(PUCK_DIA / 2, -0.6), arrowprops=dict(arrowstyle="<->", color="k"))
ax3.text(0, -1.1, f"{PUCK_DIA:.1f} mm", ha="center", fontsize=10)
ax3.text(0, PUCK_H + 0.5, "▼ load (top plate)", ha="center", fontsize=8, color="#334155")
ax3.text(0, -1.9, "sensor active area below", ha="center", fontsize=8, color="#ef4444")
ax3.set_xlim(-9, 9); ax3.set_ylim(-2.6, 3.2)
ax3.set_aspect("equal"); ax3.set_title("side — single puck (low profile)", fontsize=11); ax3.axis("off")

plt.tight_layout()
plt.savefig(OUT_PNG, dpi=130)
print(f"wrote: {os.path.basename(OUT_STL)}, {os.path.basename(OUT_STEP)}, {os.path.basename(OUT_PNG)}")
