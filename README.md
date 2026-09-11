# 3APNa Survival Calculator

An online calculator for the 3APNa model: predicted overall survival at 6, 12 and
24 months after transarterial chemoembolisation (TACE) for hepatocellular
carcinoma, from five routine variables — **A**lbumin, **A**FP, **A**ge,
**P**latelet count and **Na** (sodium).

**Research use only. This is not a medical device.**

## What it is

A static web page. There is no server, no build step, no database and no
analytics, and the page makes **no network requests at all** — not even for
fonts. Everything — the model, the arithmetic, the chart — runs in the visitor's
browser, so entered values never leave the device and no third party learns that
the page was opened. That also means it renders identically offline, inside a
hospital network, and from an archived copy.

Open `index.html` in any browser, or serve the folder over GitHub Pages.

## Why the model fits in a web page

3APNa is a `GradientBoostingSurvivalAnalysis` with Cox partial-likelihood loss
and 2,000 boosting stages — normally an awkward thing to reimplement outside
Python. It was fitted with `max_depth=1`, so every stage is a stump that splits
on a single variable, and the whole ensemble is **exactly additive**:

```
F(x)     = intercept + g_albumin(x) + g_platelet(x) + g_AFP(x) + g_sodium(x) + g_age(x)
S(t | x) = exp( -H0(t) · exp(F(x)) )
risk(t)  = 1 - S(t | x)
```

`tools/export_model.py` collapses the 2,000 stumps into those five step
functions. Scoring is then one binary search per variable, and the browser
reproduces `pipeline.predict` to about 1e-14 — not an approximation, the same
model.

The same structure is why the page can show each variable's exact contribution
to the linear predictor instead of an attribution heuristic.

## Layout

```
index.html                        the calculator
assets/engine.js                  scoring — loaded by the page AND by the tests
assets/app.js                     user interface only
assets/style.css
model/model.json                  step functions, baseline hazard, cut-offs
model/model.js                    the same payload as window.APNA_MODEL
tools/export_model.py             .joblib  ->  model/
tools/verify.py                   .joblib  ->  tests/reference_predictions.csv
tests/verify.js                   JavaScript vs Python agreement check
tests/reference_predictions.csv   2,000 reference predictions (synthetic inputs)
tests/MANUAL_CHECKS.md            two-minute browser checklist before publishing
docs/MODEL_CARD.md
requirements-lock.txt             pinned versions needed to read the .joblib
robots.txt                        keeps the page out of search results for now
```

`model/`, `tests/reference_predictions.csv` and the page itself carry no
patient-level data. The only patient-derived numbers are five summary statistics
per variable (min, 1st percentile, median, 99th percentile, max) used to flag
out-of-range input.

## Verifying it

The agreement check needs only Node — no Python, no model file:

```bash
node tests/verify.js
```

```
3APNa engine check — 2000 reference patients from gbsa_pipeline_c2_A.joblib
  model version      1.0.0 (sha256 8225c163fe52eea3…)
  linear predictor   max |JS − Python| = 1.066e-14  (tolerance 1e-9)
  survival S(t)      max |JS − Python| = 3.164e-15  (tolerance 1e-9)
  tier monotonicity  ok — tier never improves as the horizon lengthens
PASSED
```

The last line checks a structural property rather than a number. One risk score
drives all three horizons through horizon-specific cut-offs, so it must be
impossible for a patient to be High at 6 months and Low at 24. The test sweeps
the linear predictor and confirms the tier never improves as the horizon
lengthens.

This proves the arithmetic, not the interface. The worst bug this page has had
was purely in the UI — typing into a field re-rendered it and dropped focus, so
no value longer than one character could be entered, while every number the
engine produced stayed correct. `tests/MANUAL_CHECKS.md` is the two-minute
browser pass that catches that class of failure; run it before publishing.

## Regenerating from the model object

Only needed when the model changes. The stored pipeline needs the pinned
environment described in `requirements-lock.txt`.

```bash
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements-lock.txt

python tools/export_model.py \
  --model /path/to/gbsa_pipeline_c2_A.joblib \
  --train-data /path/to/development_cohort.xlsx \
  --version 1.0.1

python tools/verify.py --model /path/to/gbsa_pipeline_c2_A.joblib --n 2000
node tests/verify.js
```

`--train-data` is optional; it only fills in the five summary statistics per
variable. `export_model.py` refuses to write if the collapsed step functions
disagree with `pipeline.predict`, so a bad export cannot reach the page.

Neither the `.joblib` nor the cohort workbook belongs in this repository.

## Publishing on GitHub Pages

1. Push this folder to a repository.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. The `.nojekyll` file is already present so Pages serves the directories as-is.

### Search visibility

While the study is unpublished the page carries `<meta name="robots"
content="noindex, nofollow">` and ships a `robots.txt` that disallows crawling.
Anyone with the link can still open it; it simply will not appear in search
results, so unpublished performance figures are not surfaced to people who were
not given the address. **Remove both when the paper is out** — the meta tag in
`index.html` and the `Disallow` line in `robots.txt`.

Note that this is a request crawlers honour, not access control. If the figures
must not be reachable at all, take the repository private instead.

For a citable, permanent link, connect the repository to Zenodo and cut a
release; cite that DOI in the paper rather than a bare GitHub URL. Domains move
— `breast.predict.nhs.uk` now redirects to `breast.predict.cam` — and a link
that dies takes the calculator with it.

## Before you publish

- [ ] Fill in the citation block in `index.html` (Validation tab) and `docs/MODEL_CARD.md`
- [ ] Confirm the model is final; a calculator that disagrees with the paper is worse than none
- [ ] Confirm your institution permits publishing the derived model coefficients
- [ ] Re-run `node tests/verify.js` and paste the output into the paper's supplement
- [ ] Check the risk-group cut-off provenance is documented (see the Model card)

## Licence

Add one before publishing. MIT for the code and CC BY 4.0 for the model
parameters is a common pairing for research calculators.

## Accessibility

Colour contrast, type sizes and hit targets are checked rather than assumed.
Every text tone clears WCAG AA (4.5:1) against its own surface in both light and
dark themes — 5.1:1 is the lightest tone used — and every control is at least
44 px tall. The tab strip implements the full ARIA tab pattern (arrow keys,
Home/End, roving tabindex), and the survival chart carries a `<title>` that
names the three predicted probabilities for screen readers.
