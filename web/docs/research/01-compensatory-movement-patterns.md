# Biomechanical Compensatory Movement Patterns and Force Signatures Across Major Lower Extremity Injuries

*Source: Gemini Deep Research Report*
*Integrated: March 2026*

## Summary

This report covers compensatory biomechanical patterns and force signatures detectable via bilateral force-sensing insoles across three injury types (Achilles, ACL, Patellofemoral) plus fatigue-related deterioration.

## Key Clinical Thresholds Used in Implementation

All thresholds below are scaled +20% safety margin from clinical values for FSR sensor noise tolerance.

### Achilles Tendon Repair

| Pattern | Clinical Threshold | Implementation Threshold (scaled +20%) |
|---------|-------------------|----------------------------------------|
| Toe-walking | CoP ≥1.0 at initial contact | CoP ≥1.2 |
| Push-off avoidance (F1/F2) | F1/F2 ratio >1.10 | F1/F2 >1.32 |
| Heel guarding | CoP <0.5 | CoP <0.6 |
| Spike-and-fade | Rapid -dF/dt within 1-2 sec | Shape difference >0.48 |

### ACL Reconstruction

| Pattern | Clinical Threshold | Implementation Threshold (scaled +20%) |
|---------|-------------------|----------------------------------------|
| Quad avoidance (ILR) | ILR <85% of healthy | ILR <82% |
| Stiff-knee gait | Midstance GRF flattening | Shape difference >0.42 |
| Temporal drive delay | Δt >50ms | Δt >60ms |

### Patellofemoral Procedure

| Pattern | Clinical Threshold | Implementation Threshold (scaled +20%) |
|---------|-------------------|----------------------------------------|
| Lateral weight shift | >15% bilateral asymmetry | >18% SI |
| RFD asymmetry | >15% in first 50-75ms | >18% RFD asymmetry |
| Eccentric avoidance | >50% temporal elongation | Shape diff >0.42 + CoP asym >0.2 |

### Biphasic Fatigue Deterioration

The research identifies two distinct phases of fatigue-related compensation:

**Phase 1 — Protective Adaptation:**
- Subtle CoP shifts (injured foot changes loading pattern)
- Slight asymmetry drift (1–5% SI increase from baseline)
- Force output mostly maintained
- SampEn begins rising (subtle loss of motor precision)

**Phase 2 — Mechanical Failure:**
- Sharp asymmetry spike (>10% SI increase from baseline)
- Force output drops significantly
- SampEn rises significantly (>40% above baseline window)
- CoP shifts become large and erratic

**Key finding:** Distal-to-proximal load shifting under fatigue. In Achilles patients, force shifts from toe/ball toward heel as the calf fatigues. Signal entropy (SampEn) serves as a reliable fatigue biomarker — rising SampEn indicates loss of motor control precision.

## Implementation Notes

- All patterns implemented in `src/utils/injuryProfiles.js` (v2.0)
- Biphasic fatigue model in `src/utils/fatigueAnalysis.js`
- SampEn calculation uses m=2, r=0.2×SD template matching
- Each pattern has dual messages: patient coaching cue + clinician technical alert
- Feedback mode toggleable mid-session via `FEEDBACK_MODE.PATIENT` / `FEEDBACK_MODE.CLINICIAN`
- LSI fatigue drift >5% flagged as pathological (healthy adults maintain 0% drift)
