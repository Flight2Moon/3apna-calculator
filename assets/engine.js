/* 3APNa scoring engine — no DOM, no globals beyond the export.
 *
 * The browser loads this file directly and so does tests/verify.js, so the
 * numbers checked against Python are produced by the very code that runs for
 * a user. Do not duplicate this logic anywhere else.
 *
 * Model form: the fitted GradientBoostingSurvivalAnalysis used depth-1 stumps,
 * so it is exactly additive and collapses into one step function per variable.
 *
 *   F(x)     = intercept + Σ_j g_j(x_j)
 *   S(t | x) = exp( -H0(t) · exp(F(x)) )
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.APNAEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Count of entries strictly below x.
     sklearn routes x <= threshold left, so a stump fires only when x > threshold. */
  function lowerBound(sorted, x) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /* Count of entries at or below t. */
  function upperBound(sorted, t) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] <= t) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /* One variable's contribution to the linear predictor. */
  function partial(model, index, value) {
    var step = model.steps[index];
    var i = lowerBound(step.thresholds, value);
    return i > 0 ? step.cumulative[i - 1] : 0;
  }

  /* F(x). Term order matches tools/export_model.py:score so the floating-point
     result is bit-comparable with the Python reference. */
  function score(model, values) {
    var total = model.intercept;
    for (var j = 0; j < model.features.length; j++) {
      total += partial(model, j, values[j]);
    }
    return total;
  }

  function baselineHazard(model, t) {
    var i = upperBound(model.baseline_hazard.times, t);
    return i > 0 ? model.baseline_hazard.cumulative_hazard[i - 1] : 0;
  }

  function survival(model, t, linearPredictor) {
    return Math.exp(-baselineHazard(model, t) * Math.exp(linearPredictor));
  }

  function tier(model, risk, horizonKey) {
    var cut = model.cutoffs[horizonKey];
    if (risk < cut.ro) return 'Low';
    if (risk < cut.ri) return 'Intermediate';
    return 'High';
  }

  /* Everything a caller needs for one patient. */
  function predict(model, values) {
    var lp = score(model, values);
    return {
      lp: lp,
      horizons: model.horizons.map(function (h) {
        var s = survival(model, h.days, lp);
        return {
          key: h.key,
          label: h.label,
          days: h.days,
          survival: s,
          risk: 1 - s,
          tier: tier(model, 1 - s, h.key)
        };
      })
    };
  }

  return {
    lowerBound: lowerBound,
    upperBound: upperBound,
    partial: partial,
    score: score,
    baselineHazard: baselineHazard,
    survival: survival,
    tier: tier,
    predict: predict
  };
}));
