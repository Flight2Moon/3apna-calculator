# Model card — 3APNa

## Intended use

Estimates overall survival at 6, 12 and 24 months for patients with
hepatocellular carcinoma treated with transarterial chemoembolisation (TACE),
and assigns a Low / Intermediate / High risk tier at each horizon.

For research and educational use. It is not a medical device, does not diagnose
or determine treatment, and does not replace clinical judgement.

**Out of scope:** patients not treated with TACE, other tumour types, and use as
a sole basis for any clinical decision.

## Inputs

| Variable | Unit | Development range (min–max) | 1st–99th pct | Median |
|---|---|---|---|---|
| Albumin | g/dL | 1.3 – 5.1 | 2.2 – 4.9 | 3.9 |
| Platelet | ×10³/µL | 11 – 679 | 34.7 – 419.6 | 135 |
| AFP | ng/mL | 0.1 – 482,620 | 1.2 – 108,605 | 17.35 |
| Sodium | mEq/L | 106 – 149 | 127 – 146 | 139 |
| Age | years | 23 – 91 | 37.7 – 87 | 64 |

Platelet count is numerically identical in ×10³/µL and ×10⁹/L; AFP is identical
in ng/mL and µg/L. Albumin reported in g/L must be divided by 10 — the
calculator offers that conversion.

Missing values are imputed with the training-set median. The calculator requires
all five, so imputation only matters when the model is used programmatically.

## Model

| | |
|---|---|
| Algorithm | `sksurv.ensemble.GradientBoostingSurvivalAnalysis` |
| Loss | `coxph` (Cox partial likelihood) |
| Boosting stages | 2,000 |
| Tree depth | 1 (decision stumps) |
| Learning rate | 0.02 |
| Subsample | 0.6 |
| Max features | 0.3 |
| Min samples per leaf | 10 |
| Random state | 42 |
| Tuning objective | C-index at 6 months, 5-fold CV on the training set |
| Baseline hazard | Breslow estimator on the development cohort |

Because the depth is 1, the ensemble is exactly additive and collapses into five
single-variable step functions (394 / 414 / 397 / 376 / 419 breakpoints for
albumin / platelet / AFP / sodium / age). The published calculator evaluates
that collapsed form; agreement with `pipeline.predict` is ~1e-14.

## Data

| Cohort | n | Note |
|---|---|---|
| Development (train) | 1,172 | 80 % split of the internal cohort |
| Internal test | 294 | 147 deaths; not used for tuning |
| External validation | 353 | independent two-centre cohort |

## Performance

AUROC for survival status at each horizon, excluding patients censored before
the horizon.

| Horizon | Internal AUROC (95% CI) | Events | External AUROC | Events |
|---|---|---|---|---|
| 6 months | 0.867 (0.809–0.925) | 18 | 0.857 | 15 |
| 12 months | 0.819 (0.759–0.877) | 47 | 0.827 | 35 |
| 24 months | 0.751 (0.686–0.810) | 93 | 0.781 | 72 |

Harrell's C-index, internal test set: **0.689**.

## Risk groups

`RO` is the Low | Intermediate boundary (a rule-out threshold, favouring
sensitivity); `RI` is the Intermediate | High boundary (a rule-in threshold,
favouring specificity). Both are on the risk = 1 − S(t) scale and were fixed
during model development.

| Horizon | RO | Sens | NPV | RI | Spec | Low / Int / High |
|---|---|---|---|---|---|---|
| 6 months | 0.0874 | 0.889 | 0.990 | 0.1743 | 0.908 | 67 / 22 / 11 % |
| 12 months | 0.1337 | 0.915 | 0.968 | 0.3206 | 0.904 | 43 / 42 / 15 % |
| 24 months | 0.2403 | 0.849 | 0.851 | 0.4303 | 0.868 | 34 / 40 / 26 % |

Operating characteristics are from the internal test set with early censoring
excluded.

> **To confirm before publication.** The derivation rule for these six values is
> not recorded in the analysis package that produced them — the notebook applies
> them as fixed constants. The 6-month RO coincides with the Youden threshold
> (0.087417); the 12- and 24-month RO values do not (Youden gives 0.1867 and
> 0.3285). Document how each boundary was chosen, or reviewers will ask.

Tier assignment is monotone: because a single risk score drives all three
horizons and the implied thresholds on the linear predictor decrease with the
horizon (RO +0.326 → −0.145 → −0.254; RI +1.064 → +0.846 → +0.462), a patient's
tier can never improve as the horizon lengthens. `tests/verify.js` asserts this.

## Limitations

- Predictions are averages over patients sharing the same five values, not
  statements about an individual.
- Absolute probabilities inherit the development cohort's baseline hazard. A
  population with different survival needs recalibration; discrimination
  transfers more readily than calibration.
- Youden thresholds reported in the source analysis were computed on the test
  set, which is optimistic. The risk-group boundaries above were fixed
  separately.
- Values outside the development range are extrapolation. The calculator flags
  them and still returns a number.
- AFP spans six orders of magnitude; its step function is dense at the low end
  and sparse above ~10⁵ ng/mL, where few patients contributed.

## Provenance

Exported from `gbsa_pipeline_c2_A.joblib` by `tools/export_model.py`. The source
model's SHA-256 is recorded in `model/model.json` and shown in the calculator's
Model tab, so a published page can always be traced to the exact fitted object.

## Citation

```
[AUTHORS]. [TITLE]. [JOURNAL]. [YEAR];[VOLUME]:[PAGES]. doi:[DOI]
```

Fill this in once the paper has a DOI, and archive a release (for example via
Zenodo) so the calculator has its own citable, permanent identifier.
