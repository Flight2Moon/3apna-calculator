#!/usr/bin/env python3
"""
Export the trained 3APNa GradientBoostingSurvivalAnalysis pipeline into a
browser-consumable model file.

Why this works
--------------
The model was fitted with ``max_depth=1``: every one of its 2,000 boosting
stages is a decision stump that splits on a single feature. A sum of such
stumps is exactly an additive model

    F(x) = c + sum_j  g_j(x_j)

where each g_j is a right-continuous step function. This script collapses the
ensemble into those five step functions, so the browser needs one binary
search per feature instead of 2,000 tree traversals - and the result is
numerically identical to ``pipeline.predict`` (verified to ~1e-14).

Survival is then recovered with the Breslow baseline:

    S(t | x) = exp( -H0(t) * exp(F(x)) )
    risk(t)  = 1 - S(t | x)

Environment
-----------
The stored pipeline was pickled with an older scikit-learn tree layout and
needs the pinned versions in ``requirements-lock.txt``:

    python -m venv .venv && . .venv/bin/activate
    pip install -r requirements-lock.txt
    python tools/export_model.py --model <path to gbsa_pipeline_c2_A.joblib>

Outputs ``model/model.json`` (data) and ``model/model.js`` (the same payload
assigned to ``window.APNA_MODEL``, so the page also works from ``file://``).
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np

FEATURES = ["albumin", "platelet", "afp", "sodium", "age"]

# Column name used inside the training pipeline, per feature above.
PIPELINE_COLUMNS = ["albumin", "platelet", "afp_re", "sodium", "age"]

HORIZONS = [
    {"key": "6M", "days": 180.0, "label": "6 months"},
    {"key": "12M", "days": 360.0, "label": "12 months"},
    {"key": "24M", "days": 720.0, "label": "24 months"},
]

# Risk cut-offs fixed during model development (06_risk_cutoff_KM).
# RO = rule-out boundary (Low | Intermediate), RI = rule-in boundary
# (Intermediate | High). Both are expressed on the risk = 1 - S(t) scale.
CUTOFFS = {
    "6M": {"ro": 0.0874168904467219, "ri": 0.174255131237629},
    "12M": {"ro": 0.133729803109187, "ri": 0.320634077470298},
    "24M": {"ro": 0.240333532080506, "ri": 0.430311459958283},
}

UNITS = {
    "albumin": "g/dL",
    "platelet": "x10^3/uL",
    "afp": "ng/mL",
    "sodium": "mEq/L",
    "age": "years",
}


def collapse_to_step_functions(gbsa, n_features: int):
    """Fold every depth-1 stump into one step function per feature."""
    learning_rate = float(gbsa.learning_rate)
    constant = 0.0
    per_feature: dict[int, list[tuple[float, float]]] = {j: [] for j in range(n_features)}

    for stage in gbsa.estimators_:
        for tree in stage:
            t = tree.tree_
            if t.node_count != 3 or t.feature[0] < 0:
                raise ValueError(
                    "Expected depth-1 stumps; found a tree with "
                    f"{t.node_count} nodes. This exporter only supports max_depth=1."
                )
            feature = int(t.feature[0])
            threshold = float(t.threshold[0])
            left = float(t.value[t.children_left[0]].ravel()[0])
            right = float(t.value[t.children_right[0]].ravel()[0])
            # sklearn sends x <= threshold left, x > threshold right.
            constant += learning_rate * left
            per_feature[feature].append((threshold, learning_rate * (right - left)))

    steps = []
    for j in range(n_features):
        ordered = sorted(per_feature[j])
        thresholds = [t for t, _ in ordered]
        deltas = np.cumsum([d for _, d in ordered]).tolist() if ordered else []
        steps.append({"thresholds": thresholds, "cumulative": deltas})
    return constant, steps


def score(constant: float, steps, x) -> float:
    """Reference implementation - mirrors the JavaScript exactly."""
    total = constant
    for j, value in enumerate(x):
        thresholds = steps[j]["thresholds"]
        idx = int(np.searchsorted(thresholds, value, side="left"))
        if idx > 0:
            total += steps[j]["cumulative"][idx - 1]
    return total


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="path to gbsa_pipeline_c2_A.joblib")
    ap.add_argument("--out", default="model", help="output directory (default: model)")
    ap.add_argument("--version", default="1.0.0")
    ap.add_argument(
        "--train-data",
        help="optional development-cohort workbook; adds min/p1/median/p99/max per "
             "feature so the page can flag out-of-range input. Only these five "
             "summary statistics are written - no patient-level data.",
    )
    ap.add_argument("--train-sheet", default="Train")
    args = ap.parse_args()

    model_path = Path(args.model)
    pipeline = joblib.load(model_path)
    pre = pipeline.named_steps["pre"]
    gbsa = pipeline.named_steps["gbsa"]

    if gbsa.max_depth != 1:
        raise SystemExit("This exporter requires max_depth=1.")
    if gbsa.loss != "coxph":
        raise SystemExit(f"Expected loss='coxph', found {gbsa.loss!r}.")

    imputer = pre.named_transformers_["num"].named_steps["imp"]
    medians = [float(v) for v in imputer.statistics_]

    constant, steps = collapse_to_step_functions(gbsa, len(FEATURES))

    hazard = gbsa._baseline_model.cum_baseline_hazard_
    baseline = {
        "times": [float(t) for t in hazard.x],
        "cumulative_hazard": [float(h) for h in hazard.y],
    }

    payload = {
        "schema": "apna-additive-survival/1",
        "version": args.version,
        "source_model": model_path.name,
        "source_sha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "hyperparameters": {
            "loss": gbsa.loss,
            "n_estimators": int(gbsa.n_estimators),
            "max_depth": int(gbsa.max_depth),
            "learning_rate": float(gbsa.learning_rate),
            "subsample": float(gbsa.subsample),
            "max_features": gbsa.max_features,
            "min_samples_leaf": int(gbsa.min_samples_leaf),
            "random_state": int(gbsa.random_state),
        },
        "features": FEATURES,
        "pipeline_columns": PIPELINE_COLUMNS,
        "units": UNITS,
        "intercept": constant,
        "steps": steps,
        "baseline_hazard": baseline,
        "horizons": HORIZONS,
        "cutoffs": CUTOFFS,
        "median_imputation": dict(zip(FEATURES, medians)),
    }

    if args.train_data:
        import pandas as pd

        frame = pd.read_excel(args.train_data, sheet_name=args.train_sheet)
        ranges = {}
        for name, column in zip(FEATURES, PIPELINE_COLUMNS):
            series = frame[column].dropna().astype(float)
            ranges[name] = {
                "min": float(series.min()),
                "p1": float(series.quantile(0.01)),
                "median": float(series.median()),
                "p99": float(series.quantile(0.99)),
                "max": float(series.max()),
            }
        payload["input_ranges"] = ranges
        payload["development_cohort_n"] = int(len(frame))

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (out_dir / "model.json").write_text(json_text + "\n", encoding="utf-8")
    (out_dir / "model.js").write_text(
        "/* Generated by tools/export_model.py - do not edit by hand. */\n"
        "window.APNA_MODEL = " + json_text + ";\n",
        encoding="utf-8",
    )

    # Self-check: the collapsed form must reproduce the original pipeline.
    import pandas as pd

    rng = np.random.default_rng(20260908)
    n = 5000
    sample = np.column_stack([
        rng.uniform(1.0, 5.5, n),
        rng.uniform(5, 750, n),
        10 ** rng.uniform(-1, 5.7, n),
        rng.uniform(100, 155, n),
        rng.uniform(18, 95, n),
    ])
    frame = pd.DataFrame(sample, columns=PIPELINE_COLUMNS)
    reference = gbsa.predict(pre.transform(frame))
    collapsed = np.array([score(constant, steps, row) for row in sample])
    worst = float(np.max(np.abs(reference - collapsed)))
    if worst > 1e-9:
        raise SystemExit(f"Collapsed model disagrees with the pipeline (max {worst:.3e}).")

    print(f"wrote {out_dir/'model.json'} and {out_dir/'model.js'}")
    print(f"  {len(FEATURES)} step functions, "
          f"{sum(len(s['thresholds']) for s in steps)} breakpoints total")
    print(f"  self-check vs pipeline.predict over {n} random inputs: "
          f"max |difference| = {worst:.3e}")


if __name__ == "__main__":
    main()
