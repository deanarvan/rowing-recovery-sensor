# Postural Stability and Balance Assessment: Biomechanical Metrics, Surgical Rehabilitation, and Clinical Thresholds

## Source
Gemini Deep Research Report #5 — Postural Stability and Balance Assessment

## Key Data Points for Implementation

### Normative CoP Metrics (Healthy Young Adults 18-30, Bipedal 30s Trial)

| Condition | Metric | Male Mean (SD) | Female Mean (SD) | Combined |
|-----------|--------|----------------|-------------------|----------|
| Eyes Open | 95% Ellipse Sway Area (mm²) | 130 (85) | 120 (78) | 125 (82) |
| Eyes Open | Mean CoP Velocity (mm/s) | 9.7 (2.1) | 9.5 (1.8) | 9.6 (2.0) |
| Eyes Open | Total Sway Path Length (mm) | 265 (120) | 235 (110) | 250 (116) |
| Eyes Closed | 95% Ellipse Sway Area (mm²) | 195 (135) | 155 (110) | 175 (125) |
| Eyes Closed | Mean CoP Velocity (mm/s) | 12.1 (3.2) | 11.2 (2.9) | 11.6 (3.1) |
| Eyes Closed | Total Sway Path Length (mm) | 360 (160) | 315 (140) | 337 (151) |

### Visual Deprivation Effect
- Eyes Closed → 30-50% increase in sway area, 15-25% increase in CoP velocity
- Exceeding these ratios = over-reliance on visual system (proprioceptive/vestibular deficit)

### Directional Sway
- AP sway > ML sway in normal bipedal stance (ankle strategy)
- Disproportionate ML increase in wide stance = hip abductor weakness / fall risk
- ML control via hip strategy + load/unload mechanism

### ACL Reconstruction Postural Effects
- ACLR limb shows LESS sway than healthy limb (1.82° ± 0.84° vs 2.07° ± 0.96°)
- This is MALADAPTIVE "stiffening strategy" (co-contraction), not superior balance
- True dynamic stability normalizes progressively to ~12 months
- Subtle deficits persist up to 24 months in multi-planar control

### Achilles Repair Postural Effects
- Increased sway velocity and path length on involved side
- Linear improvement trajectory up to 9 months
- Eccentric training correlates with sway area reduction
- RTS clearance: 9-12 months, contingent on AP sway resolution + >90% plantarflexion LSI
- Compensatory patterns (increased ankle dorsiflexion) may persist indefinitely

### Patellofemoral / MPFL Reconstruction
- Pre-op: large sway areas, elevated velocities (especially on foam)
- Postural normalization at ~374 ± 23 days (≈12 months)
- Strong correlation between sway improvement, IKDC scores, and TSK reduction

### Weight-Shifting Dynamics
- Anticipatory Postural Adjustment (APA): counter-directional CoP shift before weight transfer
- Healthy transition time: ~183ms median
- **3-second clinical threshold**: inability to shift + stabilize in <3s = severe impairment

### Bilateral Weight Distribution Thresholds
| Asymmetry | Ratio | Clinical Significance |
|-----------|-------|----------------------|
| 0-5% | 50/50 to 52.5/47.5 | Normal physiological variance |
| 5-11% | ~55/45 | Subclinical compensation ("gray zone"), 25% of active population |
| >11% | 56/44+ | Clinical impairment, requires intervention |
| 20% | 60/40 | Severe (hemiparesis-level), CNS midline remapping needed |

### Single-Leg Stance LSI Thresholds for RTS
| Asymmetry | LSI | Significance |
|-----------|-----|-------------|
| <10% | >90% | Gold standard RTS clearance |
| 10-15% | 85-90% | Incomplete rehab, heightened reinjury risk |
| >15% | <85% | Critical alert — profound neuromuscular inhibition |

### Key Clinical Insight
- Isokinetic strength LSI >90% does NOT guarantee postural stability LSI >90%
- Force plate testing unmasks deficits that strength testing misses
- Recommended sampling: 600-1000 Hz for micro-excursions

### Composite Balance Scoring (iBESS / CC-PSI)
- Traditional BESS: 0-10 error count, massive floor/ceiling effects, inter-rater bias
- CC-PSI: Sacral accelerometer + gyroscope at 100Hz
  - 3.5Hz low-pass Butterworth filter
  - Normalized Path Length → Z-score → 0-100 percentile
  - 34-68 = normal (within 1 SD)
  - 2.3-34 or 68-97.7 = 1-2 SD from mean
  - >97.7 = profound instability
  - <2.3 = elite postural control
  - Lower score = better balance (inverse scale)

### Stiffening Strategy Detection
- Post-ACLR: surgical limb shows LESS sway than healthy limb
- This is pathological co-contraction, not superior balance
- Must detect and flag this "too stable" pattern
