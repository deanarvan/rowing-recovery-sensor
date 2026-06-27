# FlexiForce A301 load-concentrator puck — HANDOFF

**CURRENT:** `make_puck_v3.py` → `flexiforce_puck_4up_v3.stl` (low-profile 4-up, PRINT THIS). Prior: v2 (8 mm×3 mm 4-up), v1 (single).
**Purpose:** rigid disc that routes the balance-board/top-plate load THROUGH it onto the
A301's 9.53 mm active sensing area. Without it the load spreads across the flat sensor and the
A301 under-reads (the ~600-1200 raw-count standing reads in the bring-up). Pure **axial
compression** along the puck axis (+Z); no bending/tension/shear in the intended rig.

## Versions
### v1 (CURRENT) — CadQuery B-rep, chamfered disc
- Params: `PUCK_DIA=8.0`, `PUCK_H=3.0`, `CHAMFER=0.5` (mm). Sensing-area ref `9.53`.
- Build: `circle → extrude → chamfer("%CIRCLE")`. Exports STL + STEP.
- Result (verify all PASS): watertight, single body, euler=2 (plain solid), bbox 8×8×3 mm,
  axisymmetric (COM x,y≈0), top/bottom symmetric (COM z=1.5).
- Numbers: flat contact dia **7.0 mm**; coverage of 9.53 mm area = **84% OD / 73% flat**;
  volume 0.145 cm³; mass **PLA 0.179 g / PETG 0.184 g / PAHT-CF 0.174 g**; 4 pucks ≈ 0.74 g.

### v2 (CURRENT for a set) — 4-up print plate
- `make_puck_v2.py`: same puck, 2×2 grid, `GAP=5` mm → 13 mm pitch, **21×21 mm plate**, 4 SEPARATE bodies.
- Verify all PASS: watertight, **body count 4**, euler **8** (4 disjoint solids), per-body vol = v1 (0.1447 cm³),
  layout symmetric (COM x,y≈0).
- Set mass: **PLA 0.72 g / PETG 0.74 g / PAHT-CF 0.69 g**. A slicer brim across the 5 mm gap holds the four
  during the print, then peels off — no connecting tabs, so nothing to clean off the functional faces.

### v3 (CURRENT) — low-profile, sensor-matched diameter
- `make_puck_v3.py`: **9.5 mm OD × 1.0 mm tall**, 4-up 2×2 @ 14.5 mm pitch → **24×24 mm plate**, CHAMFER 0.3.
- Diameter raised from 8→9.5 to **= the 9.53 mm active area** (full coverage, no overhang). Do NOT exceed 9.53:
  a wider puck overhangs onto the board and load bypasses the sensor (~⅓ reaches the active area at 16 mm) → under-reads.
- Height cut 3→1 mm (low profile, aspect 9.5:1). Symmetric top/bottom (no wrong way up).
- Verify all PASS incl. `OD covers active area` (PUCK_DIA ≤ 9.53) and `4 bodies identical`. Set mass **PETG 0.35 g**.
- **Open design note:** if the user stands *directly* on the pucks (no rigid top-plate), small hard discs are
  uncomfortable and the contact point wanders → poor CoP. Proper construction = rigid top-plate over the 4
  pucks; then the plate handles comfort and the puck stays at the optimal 9.5 mm. A top-plate STL is not yet built.

## HARD INVARIANTS
- `PUCK_DIA < SENSOR_AREA_DIA (9.53)` — puck MUST stay inside the active circle (off-area load = error).
- `PUCK_H` MUST exceed everything else between the sensor and the top plate, or load bypasses the puck.
- euler_number == 2 (plain solid, no holes). Axisymmetric; COM on the z-axis.

## GOTCHAS
- `.edges("%CIRCLE")` chamfers only the two rims, skipping the OCC cylinder seam edge (a LINE).
- Tiny footprint (7 mm flat) → use a **brim** so it doesn't pop off the bed.
- **PLA creeps under sustained bodyweight compression** — use PETG or PAHT-CF for real pucks; PLA only for a fit-check.
- Print **100% infill** (solid) — a load concentrator must not crush; sparse infill would collapse.

## PRINT ORIENTATION (recommended)
**Flat — disc on the bed, axis vertical (layers horizontal, perpendicular to the load).**
- Axial compression loads the layer stack in compression (layers pushed together) = the strong
  direction for FDM; interlayer adhesion (the weak axis) is irrelevant here.
- Both functional faces (top + bottom flats) print flat; no supports; best diameter/height accuracy; fast (3 mm).
- Put the **sensor-contact face UP** and enable **iron top surface** for the flattest contact (marginal — the
  part is nearly symmetric, so either face down is fine; the 0.5 mm chamfer mitigates elephant-foot on the bed face).
- **Flips the call only if** the top plate imparts real SHEAR to the pucks (sliding plate) — then on-edge layers
  would delaminate; stay flat but use PAHT-CF and/or bond the puck down.
- Kit: X2D, PAHT-CF (dried) or PETG, brim, 100% infill, no supports. 0.4 mm nozzle gives crisper chamfers than the
  PAHT-CF 0.6 mm nozzle on a part this small, but 0.6 mm works.

## START BY
Confirm `PUCK_H` matches the real sensor→top-plate gap (the one dimension tied to the assembly), then
`python3 make_puck_v3.py`. Print `flexiforce_puck_4up_v3.stl` (current set of 4). Keep `PUCK_DIA ≤ 9.53`
(active-area rule). Changed a knob? Re-run the script — the verify guard fails loud if the geometry breaks.
