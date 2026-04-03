# Normative Biomechanical Reference Data for Bilateral Force-Sensing Insole Systems

*Source: Gemini Deep Research Report*
*Integrated: March 2026*

## Summary

Establishes the exact hardcodable reference baselines for healthy adults performing rowing, squat, and calf raise exercises. Covers peak force, CoP phase distribution, LSI targets, impulse baselines, and fatigue slopes.

## Peak Bilateral Ground Reaction Force

### Elite Rowing Baselines (100% capacity ceiling)

| Metric | Male | Female |
|--------|------|--------|
| Maximal peak force | 1350 N | 1020 N |
| Steady-state target (65%) | 877.5 N | 663.0 N |
| Per-foot target | 438.8 N | 331.5 N |

### Age-Scaled Per-Foot Targets (Biphasic Decline Model)

Pre-52 years: 0.15% decline per year from age 25 baseline
Post-52 years: 1.3% decline per year (accelerated sarcopenic decline)

Breakpoint discovered at exactly 52.0 years (362-person isokinetic study).

| Age Bracket | Sex | Max Peak (N) | Steady-State (N) | Per-Foot (N) |
|-------------|-----|-------------|------------------|-------------|
| 18-25 | Male | 1350.0 | 877.5 | 438.8 |
| 18-25 | Female | 1020.0 | 663.0 | 331.5 |
| 26-35 | Male | 1329.8 | 864.3 | 432.2 |
| 26-35 | Female | 1004.7 | 653.1 | 326.6 |
| 36-45 | Male | 1309.8 | 851.4 | 425.7 |
| 36-45 | Female | 989.4 | 643.1 | 321.6 |
| 46-60 | Male | 1194.6 | 776.5 | 388.3 |
| 46-60 | Female | 902.7 | 586.8 | 293.4 |

## Center of Pressure (CoP) Phase Distributions

### Rowing Drive Phase (3 sub-phases)

| Phase | Heel | Ball | Toe | Drive % |
|-------|------|------|-----|---------|
| Catch (start) | 0% | 85% | 15% | 0-15% |
| Mid-Drive | 30% | 60% | 10% | 15-60% |
| Finish | 60% | 40% | 0% | 60-100% |

### Squat Ascent (Sticking Point)

| Phase | Heel | Ball | Toe |
|-------|------|------|-----|
| Ascent | 80-85% | 15-20% | <5% |

Pressure values: Heel 144-181 kPa, Forefoot 28-33 kPa during deep squat.

### Calf Raise (Peak Concentric)

| Phase | Heel | Ball | Toe |
|-------|------|------|-----|
| Peak extension | 0% | 85-90% | 10-15% |

### Static Standing (Quiet)

| Condition | Hindfoot | Forefoot |
|-----------|----------|----------|
| Static | 55.6% (±18.8) | 45.2% (±19.5) |
| Dynamic | 44.1% | 55.9% (±13.4) |

### Age-Related CoP Shift
Older adults (46-60) naturally show ~5% anterior shift in resting CoP due to decreased ankle dorsiflexion ROM and increased connective tissue stiffness. Software must account for this to avoid false-positive pathological alerts.

## Limb Symmetry Index (LSI) Normative Values

### Healthy Baseline

| Metric | Value |
|--------|-------|
| Overall non-fatigued mean | 97.7% (SD: ±4.4%) |
| Female mean | 97.8% (SD: ±4.6%) |
| Male mean | 97.4% (SD: ±4.2%) |
| Acceptable floor (1 SD) | 93.3% |
| Hard clinical floor | 85.0% |

### Activity-Specific LSI Targets

| Activity | LSI Target | Notes |
|----------|-----------|-------|
| Rowing (steady-state) | 95.0% | Bilaterally constrained, 5-10% asymmetry under sprint |
| Squat (bilateral) | 93.0-95.0% | Slight shift to dominant leg at sticking point |
| Balance (standing) | 95.1% | Tightest: 4.9% mean difference (SD: ±3.7%) |
| General | 97.7% | Unimpaired baseline |

### Critical Finding: LSI Under Fatigue
- Healthy adults show **0% LSI degradation** under fatigue (97.7% → 98.8% — actually tightens)
- Central Governor Theory: CNS downregulates bilaterally to maintain balance
- **>5% LSI drift during session = pathological** (not normal fatigue)
- >6% asymmetric loading triggers dangerous core compensations

## Mechanical Impulse Baselines

### Per-Leg Drive Phase Impulse

| Sex | Impulse (Ns) | SD |
|-----|-------------|-----|
| Male | 185.3 | ±20.0 |
| Female | 136.5 | ±11.8 |

### Drive Phase Timing (1:2 drive:recovery ratio)

| Stroke Rate | Drive Time | Recovery Time | Cycle Time |
|-------------|-----------|---------------|------------|
| 20 SPM | 1.00s | 2.00s | 3.00s |
| 24 SPM | 0.70s | 1.80s | 2.50s |

- Integration window: 0.70-1.00s for impulse calculation
- Drive time <0.60s = "rushing the slide" technique error
- Minimum sampling rate: 100 Hz (200 Hz preferred for curve fidelity)

## Neuromuscular Fatigue Slopes

### Normal Force Degradation
- **1.0-1.5% per stroke** over 30-stroke maximal effort = normal
- >3% per stroke = severe deconditioning
- First 5-10 strokes: anaerobic burst settling to 65-70% steady-state

### EMG Fatigue Slopes (healthy adults)

| Muscle | Fatigue Slope Range |
|--------|-------------------|
| Rectus Femoris | -0.019 to -0.153 |
| Biceps Femoris | -0.044 to -0.091 |
| Gastrocnemius | -0.033 to -0.068 |

### Asymmetric Fatigue Slope = Primary Pathological Marker
If left leg impulse degrades at 2.0%/stroke while right degrades at 0.5%/stroke, this is the exact signal the bilateral insole system is designed to detect.

## Implementation Notes

- Peak force baselines and biphasic age scaling in `src/utils/injuryProfiles.js` NORMATIVE_BASELINES
- CoP phase tracking in `src/utils/injuryProfiles.js` COP_PHASE_TARGETS + analyzeStrokeCoPPhases()
- Per-activity LSI targets in `src/utils/injuryProfiles.js` LSI_TARGETS
- Impulse tracking in `src/utils/impulseTracking.js`
- Sensor calibration (FSR → Newtons) in `src/utils/sensorCalibration.js`
- Force degradation and asymmetric fatigue in `src/utils/impulseTracking.js` analyzeSessionImpulse()
