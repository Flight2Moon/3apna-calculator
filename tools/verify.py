#!/usr/bin/env python3
"""
Produce reference predictions from the ORIGINAL scikit-survival pipeline.

These are the numbers ``tests/verify.js`` holds the browser engine to. Run this
in the pinned environment (see requirements-lock.txt), commit the CSV, and the
JavaScript check then runs anywhere Node is available - no Python, no model
object, no patient data.

    python tools/verify.py --model <gbsa_pipeline_c2_A.joblib> --n 2000

Inputs are drawn at random across (and deliberately beyond) the development
range, so the comparison also covers extrapolation and the ends of every step
function. No real patient data is involved.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

PIPELINE_COLUMNS = ["albumin", "platelet", "afp_re", "sodium", "age"]
HORIZONS = [180.0, 360.0, 720.0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default="tests/reference_predictions.csv")
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=20260908)
    args = ap.parse_args()

    pipeline = joblib.load(args.model)
    pre = pipeline.named_steps["pre"]
    gbsa = pipeline.named_steps["gbsa"]
    hazard = gbsa._baseline_model.cum_baseline_hazard_

    def h0(t: float) -> float:
        return float(hazard.y[np.searchsorted(hazard.x, t, side="right") - 1])

    rng = np.random.default_rng(args.seed)
    n = args.n
    # Wider than the development range on purpose: the harness must cover
    # values below the first breakpoint and above the last one.
    sample = np.column_stack([
        rng.uniform(0.8, 6.0, n),          # albumin  g/dL
        rng.uniform(1, 800, n),            # platelet x10^3/uL
        10 ** rng.uniform(-1.3, 5.9, n),   # AFP      ng/mL
        rng.uniform(95, 160, n),           # sodium   mEq/L
        rng.uniform(15, 100, n),           # age      years
    ])

    frame = pd.DataFrame(sample, columns=PIPELINE_COLUMNS)
    linear = gbsa.predict(pre.transform(frame))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["albumin", "platelet", "afp", "sodium", "age", "lp", "s180", "s360", "s720"]
        )
        for row, lp in zip(sample, linear):
            survivals = [np.exp(-h0(t) * np.exp(lp)) for t in HORIZONS]
            writer.writerow(
                [repr(float(v)) for v in row]
                + [repr(float(lp))]
                + [repr(float(s)) for s in survivals]
            )

    print(f"wrote {out_path} — {n} reference predictions from {Path(args.model).name}")


if __name__ == "__main__":
    main()
