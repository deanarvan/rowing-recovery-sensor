# Rehabilitation Phase Timelines and Return-to-Sport Criteria in Orthopedic Surgery

*Source: Gemini Deep Research Report*
*Integrated: March 2026*

## Summary

Comprehensive analysis of rehabilitation phase timelines, progression criteria, functional benchmarks, composite scoring systems, and return-to-sport (RTS) clearance thresholds across Achilles, ACL, and patellofemoral surgeries. Establishes that time-based milestones alone are insufficient — criterion-based progression with objective functional testing is required.

## Achilles Tendon Repair Protocol

### Phase Timeline

| Phase | Time Post-Op | Objectives | Key Restrictions |
|-------|-------------|------------|------------------|
| I: Immediate Post-Op | 0-3 weeks | Wound protection, minimize effusion, DVT prevention | NWB, splint/boot in PF, no active PF or passive DF |
| II: Early Rehab | 2-6 weeks | Controlled progressive loading | WBAT in CAM boot with heel wedges, active DF to neutral only (knee at 90°) |
| III: Intermediate | 6-12 weeks | Normalize gait, improve single-leg PF strength | Wean from boot, double→single leg heel raises, avoid passive DF with knee extended |
| IV: Late Rehab | 12-24 weeks | Full symmetrical ROM, plyometric initiation | Double→single leg jumps, pogo jumps, interval running |
| V: Advanced RTS | 24+ weeks | Unrestricted sport | Contingent on passing objective criteria |

### RTS Clearance Benchmarks

| Domain | Test | Threshold |
|--------|------|-----------|
| Muscular Endurance | Single-Leg Heel Rise | 25 reps, height within 20% of uninvolved, >90% LSI total work |
| Peak Strength | Isokinetic Dynamometry | <10% PF asymmetry at 0° DF, <25% at 20° PF, >90% LSI |
| Power (Slow SSC) | Single-Leg CMJ | <10-20% asymmetry in peak height and concentric impulse |
| Reactive Strength | Drop Vertical Jump | RSI >0.5, <10% asymmetry |

### Re-Injury Rates
- Operative: 1.5-2.3% re-rupture
- Non-operative: 3.9-5.5% re-rupture
- Failure to achieve 90% LSI → chronic end-range PF weakness → elevated contralateral Achilles rupture risk

## ACL Reconstruction Protocol

### Phase Timeline

| Phase | Time Post-Op | Objectives | Key Restrictions |
|-------|-------------|------------|------------------|
| I: Early Post-Op | 0-4 weeks | Full passive extension, control effusion, quad activation | No loaded OKC extension 0-45° for 8 weeks |
| II-III: Intermediate | 4-12 weeks | CKC exercises, proprioception, progressive resistance | Graft at structural nadir (revascularization) |
| IV-V: Advanced | 3-6 months | Plyometrics, multi-planar dynamics, interval running | Requires quiet joint, symmetrical ROM, quad LSI >80% |
| VI: RTS Progression | 6+ months | Sport-specific agility, cutting, reactive tasks | Criterion-based testing battery required |

### LSI Threshold Evolution
- Traditional: LSI ≥90% (high false-negative rate for reinjury)
- Advanced: LSI ≥95% for athletic clearance
- EPIC: ≥90% EPIC level (sensitivity 0.818 vs LSI 0.273)

### Critical Time-Based Data
- **RTS before 9 months: 7× higher re-tear rate**
- **Each month delayed (up to 9mo): 51% reduction in reinjury rate**
- 9 months + passing criteria: 5.6% reinjury rate
- 9 months + failing criteria: 38.2% reinjury rate
- **Conclusion: Minimum 9-month temporal floor + exhaustive functional testing**

### RTS Testing Battery

1. **Isokinetic Dynamometry:** Peak torque at 60°/s and 300°/s, rate of torque development (RTD)
2. **Hop Tests:** Single hop, triple hop, crossover hop, 6m timed hop (all >90% LSI)
3. **Movement Quality:** LESS score, Tuck Jump Assessment (dynamic valgus, weight distribution)
4. **Psychological:** ACL-RSI scale >65 (scores <60 predict lower RTS rates)

## Patellofemoral Surgery Protocol

### Procedure-Specific Timelines

| Procedure | Indication | Key Timeline | RTS |
|-----------|-----------|-------------|-----|
| Lateral Retinacular Release | Lateral patellar tilt | WBAT weeks 2-4, plyometrics weeks 10-12 | 12-16 weeks |
| Isolated MPFL Reconstruction | Recurrent dislocation | Full WB by 6 weeks, full ROM by 6 weeks | 16-24 weeks |
| MPFL + TTO | Severe bony malalignment | NWB/PWB for 6 weeks, bracing in extension | 16-24+ weeks |

### RTS Criteria
- Quadriceps LSI >90%
- Y-Balance Test composite >95%
- Hop test LSI >85%
- <50% of pre-adolescents achieve 90% LSI at time of clearance

### Re-Dislocation Rates
- Early MPFL reconstruction: 7%
- Conservative rehab alone: 30%
- Isolated MPFL repair: 41%

## Composite Scoring Systems

### Melbourne ACL Rehabilitation Guide 2.0 (100-point scale)

| Domain | Weight | Metrics |
|--------|--------|---------|
| A: Stability/Swelling/ROM | 10 pts | Stroke test, pivot shift, prone hang, heel-to-buttock |
| B: Subjective | 20 pts | IKDC + ACL-RSI (requires >90% for max points) |
| C: TSK-11 | Pass/Fail | Tampa Scale of Kinesiophobia |
| D: Functional Testing | 50 pts | SEBT, balance, 4 hop tests LSI, single leg rise |
| E: General Fitness | Pass/Fail | Cardiovascular baselines |
| F: Fatigued State Testing | 20 pts | Re-test 4 hop tests under metabolic exhaustion |

**Key:** Max points (10/10) require dominant leg LSI 97-105%, non-dominant 95-103%. Over-compensation (>110%) penalized.

### Other Scoring Systems
- **Composite Score of Readiness (CSR):** Aggregates z-scores from Y-Balance, FMS, Tuck Jump
- **ATRS (Achilles):** 0-100 PROM, MCID = 14 points
- **BPII (Patellofemoral):** 0-100 instability-specific scale, concurrent validity with Kujala score

## Technology Integration

### Remote Therapeutic Monitoring (RTM)
- Platforms: Limber Health, PatientIQ, SaRA Health
- Continuous PROM collection (KOOS, IKDC, ATRS) to EHR
- Predictive analytics: graph individual recovery vs phenotypic cohort
- Intercept deviations, pain exacerbations, titrate loading in real-time

### Force Plate Systems (VALD ForceDecks)
- 1000 Hz sampling rate
- Jump height via impulse-momentum equation
- Interlimb asymmetry in eccentric deceleration, concentric impulse, landing absorption
- Prevents premature clearance via hidden asymmetric load distribution

### Markerless Motion Capture
- Orthelligent VISION: AI-driven kinematic tracking, 'FIT Index' (visual LSI)
- MyJump app: ICC >0.95 for jump height, contact time, RSI

## Key Implementation Implications

1. **Phase transition logic must be criterion-based, not purely time-based**
   - Time serves as a minimum floor (e.g., 9 months for ACL, 24 weeks for Achilles)
   - Functional criteria (LSI, CRS, hop tests) gate the actual transition
   - Both must be satisfied simultaneously

2. **Phase thresholds should be injury-specific:**
   - ACL: LSI ≥95% for advanced clearance, EPIC ≥90%
   - Achilles: >90% LSI total work, <10% PF asymmetry
   - Patellofemoral: Quad LSI >90%, Y-Balance >95%

3. **Psychological readiness is a parallel domain:**
   - ACL-RSI >65 required alongside physical criteria
   - Fear of reinjury alters motor control under competitive stress

4. **Fatigued-state testing is critical:**
   - Melbourne Guide allocates 20% of score to fatigued re-testing
   - Hop test symmetry must be maintained under metabolic exhaustion
   - This maps directly to our biphasic fatigue model

5. **Composite scoring (0-100) validates our CRS approach:**
   - Our Composite Recovery Score parallels Melbourne Guide structure
   - Sub-domain weighting per rehab phase is clinically supported
   - Penalizing over-compensation (>110% LSI) is research-backed
