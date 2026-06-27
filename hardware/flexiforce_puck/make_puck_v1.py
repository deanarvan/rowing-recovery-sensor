#!/usr/bin/env python3
"""
make_puck_v1.py — FlexiForce A301 load-concentrator puck (B-rep / CadQuery)

A rigid disc that sits on the FlexiForce A301's 9.53 mm sensing area and routes
the balance-board / top-plate load THROUGH it, concentrating force on the active
zone. Without it, load spreads across the flat sensor and the A301 under-reads
badly (the ~600-1200 raw-count standing reads we saw).

Load path: top plate --(axial compression)--> puck top face --> puck body -->
puck bottom face --> A301 sensing area. Pure axial compression along +Z.

Output: STL (print) + STEP (edit/CNC).  Verify-every-build guard below.
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
SENSOR_AREA_DIA = 9.53   # A301 active sensing-area diameter (mm) — REFERENCE, not built
PUCK_DIA        = 8.0    # puck outer diameter (mm); < sensing area so load stays on-area
PUCK_H          = 3.0    # puck height / standoff (mm); must exceed all else in the stack
CHAMFER         = 0.5    # rim chamfer (mm); flat faces become PUCK_DIA - 2*CHAMFER

HERE   = os.path.dirname(os.path.abspath(__file__))
OUT_STL  = os.path.join(HERE, "flexiforce_puck_v1.stl")
OUT_STEP = os.path.join(HERE, "flexiforce_puck_v1.step")
OUT_PNG  = os.path.join(HERE, "flexiforce_puck_v1_render.png")

# ───────────────────────── BUILD (revolve/feature B-rep) ───────────────────────
puck = (
    cq.Workplane("XY")
    .circle(PUCK_DIA / 2.0)
    .extrude(PUCK_H)
    .edges("%CIRCLE")          # the two circular rims only (skips the cylinder seam)
    .chamfer(CHAMFER)
)
cq.exporters.export(puck, OUT_STL, tolerance=0.005, angularTolerance=0.1)
cq.exporters.export(puck, OUT_STEP)

# ───────────────────────── VERIFY EVERY BUILD (fail loud) ──────────────────────
m = trimesh.load(OUT_STL)
flat_dia = PUCK_DIA - 2 * CHAMFER
ext = m.extents
com = m.center_mass
vol_cm3 = m.volume / 1000.0
DENS = {"PLA": 1.24, "PETG": 1.27, "PAHT-CF": 1.20}  # g/cm^3

checks = [
    ("watertight",            bool(m.is_watertight),                     True),
    ("single body",           len(m.split(only_watertight=False)),       1),
    ("euler (plain solid)",   int(m.euler_number),                       2),
    ("bbox X ~= PUCK_DIA",    round(float(ext[0]), 2),                   PUCK_DIA),
    ("bbox Y ~= PUCK_DIA",    round(float(ext[1]), 2),                   PUCK_DIA),
    ("bbox Z ~= PUCK_H",      round(float(ext[2]), 2),                   PUCK_H),
    ("axisymmetric: COM x~0", round(float(com[0]), 3),                   0.0),
    ("axisymmetric: COM y~0", round(float(com[1]), 3),                   0.0),
    ("top/bot symmetric z",   round(float(com[2]), 2),                   round(PUCK_H/2, 2)),
]
ok = True
print("\n===== VERIFY (puck v1) =====")
for name, got, want in checks:
    passed = (got == want) if not isinstance(want, float) else (abs(got - want) <= 0.02 + 0.01*abs(want))
    ok = ok and passed
    print(f"  [{'PASS' if passed else 'FAIL'}] {name:24} got={got!r:>10}  want~={want!r}")
print("  ---")
print(f"  OD={PUCK_DIA} mm  H={PUCK_H} mm  flat-contact dia={flat_dia} mm  chamfer={CHAMFER} mm")
print(f"  coverage of {SENSOR_AREA_DIA} mm sensing area:  OD {100*PUCK_DIA/SENSOR_AREA_DIA:.0f}%   flat {100*flat_dia/SENSOR_AREA_DIA:.0f}%")
print(f"  volume = {vol_cm3:.4f} cm^3   mass: " + "  ".join(f"{k} {vol_cm3*d:.3f} g" for k, d in DENS.items()))
print(f"  -> mass of 4 pucks (PETG): {4*vol_cm3*DENS['PETG']:.2f} g")
if not ok:
    print("\n  *** VERIFY FAILED — not writing render ***")
    sys.exit(1)
print("  ALL CHECKS PASS\n")

# ───────────────────────── SHOW (render + dimensioned section) ─────────────────
fig = plt.figure(figsize=(11, 5))

# (1) isometric mesh
ax = fig.add_subplot(121, projection="3d")
ax.add_collection3d(Poly3DCollection(m.triangles, facecolor="#a855f7",
                                     edgecolor="k", linewidths=0.15, alpha=0.95))
R = PUCK_DIA / 2 + 1
ax.set_xlim(-R, R); ax.set_ylim(-R, R); ax.set_zlim(0, PUCK_H + 2)
ax.set_box_aspect((1, 1, (PUCK_H + 2) / (2 * R)))
ax.view_init(elev=22, azim=35)
ax.set_title("FlexiForce puck v1 — isometric", fontsize=11)
ax.set_xlabel("x (mm)"); ax.set_ylabel("y (mm)"); ax.set_zlabel("z (mm)")

# (2) dimensioned cross-section (full, mirrored) + sensing-area reference
ax2 = fig.add_subplot(122)
hr = PUCK_DIA / 2.0
prof = [(hr - CHAMFER, 0), (hr, CHAMFER), (hr, PUCK_H - CHAMFER),
        (hr - CHAMFER, PUCK_H), (-(hr - CHAMFER), PUCK_H), (-hr, PUCK_H - CHAMFER),
        (-hr, CHAMFER), (-(hr - CHAMFER), 0), (hr - CHAMFER, 0)]
xs = [p[0] for p in prof]; zs = [p[1] for p in prof]
ax2.fill(xs, zs, facecolor="#a855f7", alpha=0.25, edgecolor="#7e22ce", linewidth=2)
# sensing-area footprint (dashed) under the puck
ax2.plot([-SENSOR_AREA_DIA/2, SENSOR_AREA_DIA/2], [-0.4, -0.4], color="#ef4444", lw=2)
ax2.text(0, -0.85, f"A301 sensing area  {SENSOR_AREA_DIA} mm", color="#ef4444",
         ha="center", va="top", fontsize=8)
# dims
ax2.annotate("", xy=(-hr, PUCK_H + 0.8), xytext=(hr, PUCK_H + 0.8),
             arrowprops=dict(arrowstyle="<->", color="k"))
ax2.text(0, PUCK_H + 1.0, f"OD {PUCK_DIA} mm", ha="center", fontsize=9)
ax2.annotate("", xy=(hr + 0.9, 0), xytext=(hr + 0.9, PUCK_H),
             arrowprops=dict(arrowstyle="<->", color="k"))
ax2.text(hr + 1.1, PUCK_H/2, f"H {PUCK_H} mm", va="center", fontsize=9, rotation=90)
ax2.text(0, PUCK_H/2, f"flat contact\n{flat_dia} mm\n+ {CHAMFER} mm chamfer",
         ha="center", va="center", fontsize=8, color="#334155")
ax2.set_xlim(-SENSOR_AREA_DIA/2 - 1, hr + 3)
ax2.set_ylim(-1.6, PUCK_H + 2)
ax2.set_aspect("equal"); ax2.set_title("cross-section + sensor footprint", fontsize=11)
ax2.set_xlabel("radius (mm)"); ax2.set_ylabel("z (mm)")
ax2.grid(alpha=0.25)

plt.tight_layout()
plt.savefig(OUT_PNG, dpi=130)
print(f"wrote: {os.path.basename(OUT_STL)}, {os.path.basename(OUT_STEP)}, {os.path.basename(OUT_PNG)}")
