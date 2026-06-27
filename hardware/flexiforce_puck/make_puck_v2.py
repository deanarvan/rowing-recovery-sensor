#!/usr/bin/env python3
"""
make_puck_v2.py — FlexiForce A301 puck, 4-UP PRINT PLATE (B-rep / CadQuery)

Same puck as v1, four copies in a 2x2 grid so you print a full set in one go.
Bodies are SEPARATE (no connecting tabs) so there's nothing to clean off the
functional faces — a slicer brim across the ~GAP spacing holds them during the
print, then peels off. Load path per body is unchanged: pure axial compression.

Output: STL (print) + STEP.  Verify-every-build guard updated for 4 disjoint solids.
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
SENSOR_AREA_DIA = 9.53   # A301 active sensing-area diameter (mm) — REFERENCE
PUCK_DIA        = 8.0    # puck outer diameter (mm)
PUCK_H          = 3.0    # puck height / standoff (mm)
CHAMFER         = 0.5    # rim chamfer (mm)
GAP             = 5.0    # edge-to-edge gap between pucks (mm) — room for a shared brim
NX, NY          = 2, 2   # grid = 4 pucks

HERE   = os.path.dirname(os.path.abspath(__file__))
OUT_STL  = os.path.join(HERE, "flexiforce_puck_4up_v2.stl")
OUT_STEP = os.path.join(HERE, "flexiforce_puck_4up_v2.step")
OUT_PNG  = os.path.join(HERE, "flexiforce_puck_4up_v2_render.png")

# ───────────────────────── BUILD (2x2 array, separate bodies) ──────────────────
pitch = PUCK_DIA + GAP                                   # center-to-center
xs = [(i - (NX - 1) / 2.0) * pitch for i in range(NX)]
ys = [(j - (NY - 1) / 2.0) * pitch for j in range(NY)]
positions = [(x, y) for x in xs for y in ys]

plate = (
    cq.Workplane("XY")
    .pushPoints(positions)
    .circle(PUCK_DIA / 2.0)
    .extrude(PUCK_H)
    .edges("%CIRCLE")          # all 8 circular rims across the 4 bodies
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
plate_x = (NX - 1) * pitch + PUCK_DIA
plate_y = (NY - 1) * pitch + PUCK_DIA
DENS = {"PLA": 1.24, "PETG": 1.27, "PAHT-CF": 1.20}

checks = [
    ("watertight",              bool(m.is_watertight),            True),
    ("body count == 4",         len(bodies),                      n_expect),
    ("euler (4 solids = 4x2)",  int(m.euler_number),              2 * n_expect),
    ("plate X extent",          round(float(ext[0]), 2),          round(plate_x, 2)),
    ("plate Y extent",          round(float(ext[1]), 2),          round(plate_y, 2)),
    ("bbox Z ~= PUCK_H",        round(float(ext[2]), 2),          PUCK_H),
    ("layout symmetric x~0",    round(float(com[0]), 3),          0.0),
    ("layout symmetric y~0",    round(float(com[1]), 3),          0.0),
    ("top/bot symmetric z",     round(float(com[2]), 2),          round(PUCK_H/2, 2)),
    ("per-body vol matches v1", round(single_vol, 4),             0.1447),
]
ok = True
print("\n===== VERIFY (puck 4-up v2) =====")
for name, got, want in checks:
    passed = (got == want) if not isinstance(want, float) else (abs(got - want) <= 0.02 + 0.01*abs(want))
    ok = ok and passed
    print(f"  [{'PASS' if passed else 'FAIL'}] {name:24} got={got!r:>10}  want~={want!r}")
print("  ---")
print(f"  4 pucks, 2x2 @ {pitch:.0f} mm pitch ({GAP:.0f} mm gap)  →  plate {plate_x:.0f} x {plate_y:.0f} mm")
print(f"  total volume = {vol_cm3:.4f} cm^3   set mass: " + "  ".join(f"{k} {vol_cm3*d:.2f} g" for k, d in DENS.items()))
if not ok:
    print("\n  *** VERIFY FAILED — not writing render ***"); sys.exit(1)
print("  ALL CHECKS PASS\n")

# ───────────────────────── SHOW (iso + top-view layout) ────────────────────────
fig = plt.figure(figsize=(11, 5))

ax = fig.add_subplot(121, projection="3d")
ax.add_collection3d(Poly3DCollection(m.triangles, facecolor="#a855f7",
                                     edgecolor="k", linewidths=0.1, alpha=0.95))
Rx = plate_x / 2 + 1; RyZ = PUCK_H + 2
ax.set_xlim(-Rx, Rx); ax.set_ylim(-Rx, Rx); ax.set_zlim(0, RyZ)
ax.set_box_aspect((1, 1, RyZ / (2 * Rx)))
ax.view_init(elev=26, azim=40)
ax.set_title("FlexiForce puck — 4-up plate", fontsize=11)
ax.set_xlabel("x (mm)"); ax.set_ylabel("y (mm)"); ax.set_zlabel("z")

ax2 = fig.add_subplot(122)
for (x, y) in positions:
    ax2.add_patch(plt.Circle((x, y), PUCK_DIA/2, facecolor="#a855f7", alpha=0.3, edgecolor="#7e22ce", lw=2))
    ax2.add_patch(plt.Circle((x, y), (PUCK_DIA-2*CHAMFER)/2, facecolor="none", edgecolor="#7e22ce", lw=0.8, ls=":"))
# plate outline
hx, hy = plate_x/2, plate_y/2
ax2.add_patch(plt.Rectangle((-hx, -hy), plate_x, plate_y, fill=False, edgecolor="#94a3b8", ls="--"))
ax2.annotate("", xy=(xs[0], ys[0]), xytext=(xs[1], ys[0]), arrowprops=dict(arrowstyle="<->", color="k"))
ax2.text((xs[0]+xs[1])/2, ys[0]+0.6, f"{pitch:.0f} mm pitch", ha="center", fontsize=9)
ax2.text(0, hy+1.0, f"plate {plate_x:.0f} x {plate_y:.0f} mm", ha="center", fontsize=9)
ax2.text(0, 0, "4×  8 mm OD\n3 mm tall", ha="center", va="center", fontsize=8, color="#334155")
ax2.set_xlim(-hx-3, hx+3); ax2.set_ylim(-hy-3, hy+3)
ax2.set_aspect("equal"); ax2.set_title("top view — print layout", fontsize=11)
ax2.set_xlabel("x (mm)"); ax2.set_ylabel("y (mm)"); ax2.grid(alpha=0.25)

plt.tight_layout()
plt.savefig(OUT_PNG, dpi=130)
print(f"wrote: {os.path.basename(OUT_STL)}, {os.path.basename(OUT_STEP)}, {os.path.basename(OUT_PNG)}")
