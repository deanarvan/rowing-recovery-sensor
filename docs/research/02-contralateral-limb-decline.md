# Estimated Pre-Injury Capacity (EPIC) and Bilateral Limb Dynamics: Contralateral Decline Post-Surgery

*Source: Gemini Deep Research Report*
*Integrated: March 2026*

## Summary

Comprehensive analysis of how the "healthy" contralateral limb declines post-surgery, rendering standard LSI metrics dangerously misleading. Establishes the mathematical framework for the Bilateral Adjustment Factor (BAF) to correct for this decline.

## Core Finding

The contralateral (healthy) limb is NOT a static baseline. It undergoes 10-20% absolute strength decline post-surgery due to:
1. Systemic disuse atrophy (cessation of high-impact sport)
2. Altered gait mechanics and compensatory overloading
3. Neural cross-education (bilateral cortical inhibition)

## Contralateral Decline Timeline

### ACL Reconstruction (Quadriceps)

| Phase | Time Post-Op | Contralateral Trajectory | Dmax |
|-------|-------------|-------------------------|------|
| Acute/Subacute | 0-3 months | Measurable weakness vs controls; loss of high-end RFD | ~5% |
| Intermediate | 3-6 months | Stagnation; only 2-4% gain while operative limb gains 14-25% | 10-12% |
| Late-Stage | 6-12 months | 23.1% of patients lose >10%; paradoxically most likely to pass LSI | ~15% |
| Chronic | 12-24+ months | Stabilization at depressed baseline (10-15% below pre-injury) | 15-20% |

### Achilles Tendon Repair (Plantarflexors)

| Phase | Time Post-Op | Contralateral Trajectory | Dmax |
|-------|-------------|-------------------------|------|
| Immediate | 0-6 weeks | Rapid volumetric atrophy; loss of eccentric conditioning | ~4% |
| Intermediate | 6-12 weeks | Diminished end-range plantarflexion; profound stamina loss | ~8% |
| Late-Stage | 12-24 weeks | Peak strength stunted; failure to reach pre-injury MVC | 12-15% |
| Chronic | 24+ weeks | Structural plateau; 10-30% global reduction | 12-18% |

## EPIC Research (Wellsandt et al. 2017, JOSPT)

### Study Design
- 70 athletes with acute unilateral ACL injuries
- Pre-operative baseline on uninvolved limb → 6-month post-op comparison
- Standard LSI: (involved at 6mo) / (uninvolved at 6mo) × 100
- EPIC Level: (involved at 6mo) / (uninvolved pre-op) × 100

### Key Statistics
- 57.1% (40/70) passed standard LSI ≥90%
- Only 28.6% (20/70) passed EPIC ≥90%
- **60% of LSI passers failed EPIC** (24 of 40)
- 71.4% of total cohort failed true pre-injury capacity

### Reinjury Prediction
- 11 athletes suffered second ACL injury within 2 years
- 72.7% (8/11) of reinjured had PASSED standard LSI ≥90%
- 81.8% (9/11) of reinjured had FAILED EPIC ≥90%
- **EPIC sensitivity: 0.818** vs **LSI sensitivity: 0.273**

## BAF Mathematical Model

### Exponential Decay Saturation Model

```
S_contra(t) = S_baseline × (1 - Dmax × (1 - e^(-k×t)))

BAF(t) = 1 / (1 - Dmax × (1 - e^(-k×t)))
```

Where:
- `S_baseline` = true pre-injury peak strength
- `Dmax` = maximum theoretical deficit (decimal)
- `k` = biological decay rate constant
- `t` = months post-injury

### Implemented Values

| Injury Type | Dmax | k | BAF at 6mo | BAF at 12mo |
|-------------|------|---|------------|-------------|
| ACL | 0.175 | 0.35 | 1.181 | 1.208 |
| Achilles | 0.15 | 0.30 | 1.143 | 1.171 |
| Patellofemoral | 0.12 | 0.28 | 1.108 | 1.131 |

### Clinical Example
Patient at 6 months post-ACLR, contralateral leg measures 2.0 Nm/kg:
- BAF ≈ 1.136
- Estimated pre-injury baseline: 2.0 × 1.136 = 2.27 Nm/kg
- Operative limb must reach 2.04 Nm/kg (90% of 2.27) for safe RTS

## Non-Linear Decline Phases

1. **Phase 1 (0-3mo):** Acute plateau/hyper-compensation. Maintains slow concentric strength but loses high-end RFD.
2. **Phase 2 (3-6mo):** Detraining drop. Profound general detraining as acute reliance on healthy leg diminishes.
3. **Phase 3 (6-12mo):** Critical convergence. Steepest relative decline. >23% of ACL patients lose >10% contralateral strength.
4. **Phase 4 (12+mo):** Depressed plateau. Stabilizes at 10-15% below pre-injury peak. Remains there until unrestricted sport resumes.

## Implementation Notes

- Dual BAF system in `src/utils/epicBaseline.js` (v2.0):
  - Priority 1: Session-derived BAF (measured from Tier 2 early capture sessions)
  - Priority 2: Time-based exponential decay model (when no early sessions available)
- Dmax values configurable per patient (defaults from research)
- Phase-specific Dmax lookup tables per injury type
- Dual LSI display: standard + EPIC side-by-side with divergence indicator
- Research note from Wellsandt et al. embedded for UI tooltips
