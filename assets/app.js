/* 3APNa Survival Calculator — user interface.
 *
 * All scoring lives in assets/engine.js, which tests/verify.js also loads, so
 * what is checked against Python is exactly what runs here. This file only
 * reads inputs, calls the engine and draws.
 */
(function () {
  'use strict';

  var M = window.APNA_MODEL;
  var E = window.APNAEngine;
  if (!M || !E) {
    document.getElementById('fields').textContent =
      'Model files failed to load. Check that model/model.js and assets/engine.js sit beside index.html.';
    return;
  }

  function partial(j, value) { return E.partial(M, j, value); }
  function survival(t, lp) { return E.survival(M, t, lp); }

  /* ------------------------------------------------------------------ data */

  var RANGE = M.input_ranges || {};
  var LOG_MIN = Math.log10(RANGE.afp ? RANGE.afp.min : 0.1);
  var LOG_MAX = Math.log10(RANGE.afp ? RANGE.afp.max : 482620);

  var FIELDS = [
    { key: 'albumin',  label: 'Albumin',  unit: 'g/dL',     step: 0.1, decimals: 2 },
    { key: 'platelet', label: 'Platelet', unit: '×10³/µL',  step: 1,   decimals: 0 },
    { key: 'afp',      label: 'AFP',      unit: 'ng/mL',    step: 0.1, decimals: 1, log: true },
    { key: 'sodium',   label: 'Sodium',   unit: 'mEq/L',    step: 1,   decimals: 0 },
    { key: 'age',      label: 'Age',      unit: 'years',    step: 1,   decimals: 0 }
  ];

  // Opening state: an illustrative patient, not a real one, so the page shows
  // what it does at rest. Marked EXAMPLE until the first edit; Reset restores it.
  var EXAMPLE = [3.6, 120, 25, 139, 66];

  function defaults() { return EXAMPLE.slice(); }

  function cohortMedians() {
    return FIELDS.map(function (f) {
      return RANGE[f.key] ? RANGE[f.key].median : M.median_imputation[f.key];
    });
  }

  var state = {
    values: defaults(),
    mode: 'type',
    albuminPerLitre: false,
    pristine: true
  };

  /* ------------------------------------------------------------ formatting */

  // Round to a sane number of digits without leaving trailing zeros.
  function fmt(value, decimals) {
    if (!isFinite(value)) return '—';
    return String(Number(value.toFixed(decimals == null ? 2 : decimals)));
  }

  function fmtAfp(value) {
    if (!isFinite(value)) return '—';
    if (value >= 100) return String(Math.round(value));
    if (value >= 10) return String(Number(value.toFixed(2)));
    return String(Number(value.toFixed(3)));
  }

  function displayValue(i) {
    var f = FIELDS[i], v = state.values[i];
    if (f.key === 'afp') return fmtAfp(v);
    if (f.key === 'albumin' && state.albuminPerLitre) return fmt(v * 10, 1);
    return fmt(v, f.decimals);
  }

  function displayUnit(i) {
    var f = FIELDS[i];
    if (f.key === 'albumin' && state.albuminPerLitre) return 'g/L';
    return f.unit;
  }

  function toNative(i, shown) {
    if (FIELDS[i].key === 'albumin' && state.albuminPerLitre) return shown / 10;
    return shown;
  }

  var svgNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    var node = document.createElementNS(svgNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  /* -------------------------------------------------------------- controls */

  var fieldsHost = document.getElementById('fields');

  function buildFields() {
    fieldsHost.innerHTML = '';
    FIELDS.forEach(function (f, i) {
      var wrap = document.createElement('div');
      wrap.className = 'field';

      var row = document.createElement('div');
      row.className = 'field__row';

      var name = document.createElement('div');
      name.className = 'field__name';
      var label = document.createElement('label');
      label.className = 'field__label';
      label.htmlFor = 'in-' + f.key;
      label.textContent = f.label;
      if (f.log) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'LOG';
        tag.style.marginLeft = '7px';
        label.appendChild(tag);
      }
      var unit = document.createElement('div');
      unit.className = 'field__unit';
      unit.textContent = RANGE[f.key]
        ? displayUnit(i) + ' · cohort ' + fmtRange(f, i)
        : displayUnit(i);
      name.appendChild(label);
      name.appendChild(unit);
      row.appendChild(name);

      if (state.mode === 'type') {
        var entry = document.createElement('div');
        entry.className = 'field__entry';
        var input = document.createElement('input');
        input.type = 'number';
        input.id = 'in-' + f.key;
        input.step = f.step;
        input.value = displayValue(i);
        input.inputMode = 'decimal';
        input.addEventListener('input', function () {
          state.pristine = false;
          var shown = parseFloat(input.value);
          if (isFinite(shown)) {
            state.values[i] = toNative(i, shown);
            render();
          } else {
            flagField(wrap, input, i, true);
            renderResults(null);
          }
        });
        var suffix = document.createElement('div');
        suffix.className = 'unit-suffix';
        suffix.textContent = displayUnit(i);
        entry.appendChild(input);
        entry.appendChild(suffix);
        row.appendChild(entry);
        wrap.appendChild(row);
        flagField(wrap, input, i, false);
      } else {
        var value = document.createElement('div');
        value.className = 'field__value';
        var strong = document.createElement('b');
        strong.id = 'out-' + f.key;
        strong.textContent = displayValue(i);
        var small = document.createElement('span');
        small.textContent = displayUnit(i);
        value.appendChild(strong);
        value.appendChild(small);
        row.appendChild(value);
        wrap.appendChild(row);

        var holder = document.createElement('div');
        holder.className = 'field__slider';
        var range = document.createElement('input');
        range.type = 'range';
        range.id = 'in-' + f.key;
        range.setAttribute('aria-label', f.label);
        var bounds = RANGE[f.key] || { min: 0, max: 100 };
        if (f.log) {
          range.min = 0; range.max = 1000; range.step = 1;
          range.value = Math.round((Math.log10(state.values[i]) - LOG_MIN) / (LOG_MAX - LOG_MIN) * 1000);
        } else {
          range.min = bounds.min; range.max = bounds.max; range.step = f.step;
          range.value = Math.min(Math.max(state.values[i], bounds.min), bounds.max);
        }
        range.addEventListener('input', function () {
          state.pristine = false;
          syncExampleChip();
          var raw = parseFloat(range.value);
          state.values[i] = f.log
            ? Math.pow(10, LOG_MIN + (raw / 1000) * (LOG_MAX - LOG_MIN))
            : raw;
          strong.textContent = displayValue(i);
          renderResults(compute());
        });
        holder.appendChild(range);
        var ticks = document.createElement('div');
        ticks.className = 'ticks';
        (f.log ? ['0.1', '10', '10³', '10⁵'] : [fmt(bounds.min, f.decimals), fmt(bounds.max, f.decimals)])
          .forEach(function (t) {
            var s = document.createElement('span');
            s.textContent = t;
            ticks.appendChild(s);
          });
        holder.appendChild(ticks);
        wrap.appendChild(holder);
      }

      fieldsHost.appendChild(wrap);
    });
  }

  function fmtRange(f, i) {
    var r = RANGE[f.key];
    if (!r) return '';
    if (f.key === 'afp') return fmtAfp(r.min) + '–' + fmtAfp(r.max);
    var lo = r.min, hi = r.max;
    if (f.key === 'albumin' && state.albuminPerLitre) { lo *= 10; hi *= 10; }
    return fmt(lo, f.decimals) + '–' + fmt(hi, f.decimals);
  }

  function flagField(wrap, input, i, invalid) {
    var old = wrap.querySelector('.warn');
    if (old) old.remove();
    input.classList.remove('is-out', 'is-bad');
    var f = FIELDS[i], r = RANGE[f.key], v = state.values[i];
    var message = null, bad = false;
    if (invalid) {
      message = 'Enter a number.'; bad = true;
    } else if (v <= 0 && f.key !== 'age') {
      message = f.label + ' must be greater than zero.'; bad = true;
    } else if (r && (v < r.min || v > r.max)) {
      message = 'Outside the development range (' + fmtRange(f, i) + ' ' + displayUnit(i) +
                '). The prediction is an extrapolation.';
    }
    if (!message) return;
    input.classList.add(bad ? 'is-bad' : 'is-out');
    var note = document.createElement('div');
    note.className = 'warn' + (bad ? ' warn--bad' : '');
    var icon = el('svg', { width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none',
                           stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' });
    icon.appendChild(el('path', { d: 'M12 3l9 16H3z' }));
    icon.appendChild(el('path', { d: 'M12 10v4M12 17h.01' }));
    note.appendChild(icon);
    var text = document.createElement('span');
    text.textContent = message;
    note.appendChild(text);
    wrap.appendChild(note);
  }

  /* --------------------------------------------------------------- results */

  function compute() {
    for (var i = 0; i < state.values.length; i++) {
      var v = state.values[i];
      if (!isFinite(v) || (v <= 0 && FIELDS[i].key !== 'age')) return null;
    }
    return E.predict(M, state.values);
  }

  var horizonsHost = document.getElementById('horizons');
  var stickyHost = document.getElementById('sticky');
  var contribHost = document.getElementById('contrib');
  var curve = document.getElementById('curve');

  function renderResults(result) {
    horizonsHost.innerHTML = '';
    stickyHost.innerHTML = '';
    contribHost.innerHTML = '';
    while (curve.lastChild) curve.removeChild(curve.lastChild);

    if (!result) {
      var msg = document.createElement('div');
      msg.className = 'card';
      msg.style.gridColumn = '1 / -1';
      msg.textContent = 'Enter all five values to see a prediction.';
      horizonsHost.appendChild(msg);
      return;
    }

    result.horizons.forEach(function (h) {
      var cut = M.cutoffs[h.key];
      var card = document.createElement('div');
      card.className = 'horizon';
      card.setAttribute('data-tier', h.tier);
      card.innerHTML =
        '<span class="card__label">' + h.label + ' · ' + h.days + ' d</span>' +
        '<div class="horizon__pct"><b>' + (h.survival * 100).toFixed(1) + '</b><span>%</span></div>' +
        '<div class="horizon__people">Of 100 similar patients, <b>' +
          Math.round(h.survival * 100) + '</b> alive</div>' +
        '<span class="tier" data-tier="' + h.tier + '"><i></i>' + h.tier + ' risk</span>' +
        '<div class="horizon__foot"><span>predicted risk ' + (h.risk * 100).toFixed(1) + '%</span>' +
          '<span>tier cut-offs ' + (cut.ro * 100).toFixed(1) + ' / ' + (cut.ri * 100).toFixed(1) + '%</span></div>';
      horizonsHost.appendChild(card);

      var cell = document.createElement('div');
      cell.className = 'stickybar__cell';
      cell.innerHTML =
        '<em>' + h.key + '</em>' +
        '<b>' + (h.survival * 100).toFixed(1) + '</b>' +
        '<span class="tier" data-tier="' + h.tier + '"><i></i>' + h.tier + '</span>';
      stickyHost.appendChild(cell);
    });

    drawCurve(result);
    drawContributions();
  }

  function drawCurve(result) {
    var W = 700, H = 232, L = 56, R = 660, T = 20, B = 200;
    var maxDay = 730;
    var x = function (t) { return L + (t / maxDay) * (R - L); };
    var y = function (s) { return T + (1 - s) * (B - T); };

    [0, 0.25, 0.5, 0.75, 1].forEach(function (frac) {
      var yy = y(frac);
      curve.appendChild(el('line', { x1: L, y1: yy, x2: R, y2: yy,
        stroke: frac === 0 ? 'var(--line-strong)' : 'var(--line-2)', 'stroke-width': 1 }));
      curve.appendChild(el('text', { x: L - 10, y: yy + 4, 'text-anchor': 'end',
        'font-family': 'var(--mono)', 'font-size': 10, fill: 'var(--faint)' },
        String(Math.round(frac * 100))));
    });

    var times = M.baseline_hazard.times.filter(function (t) { return t <= maxDay; });
    if (times[0] !== 0) times.unshift(0);
    if (times[times.length - 1] !== maxDay) times.push(maxDay);

    var d = '', prev = null;
    times.forEach(function (t, i) {
      var s = survival(t, result.lp);
      if (i === 0) { d = 'M ' + x(t).toFixed(2) + ' ' + y(s).toFixed(2); }
      else { d += ' L ' + x(t).toFixed(2) + ' ' + y(prev).toFixed(2) +
                  ' L ' + x(t).toFixed(2) + ' ' + y(s).toFixed(2); }
      prev = s;
    });

    curve.appendChild(el('path', { d: d + ' L ' + x(maxDay).toFixed(2) + ' ' + B + ' L ' + L + ' ' + B + ' Z',
      fill: 'var(--accent)', 'fill-opacity': '0.07', stroke: 'none' }));
    curve.appendChild(el('path', { d: d, fill: 'none', stroke: 'var(--accent)',
      'stroke-width': 2, 'stroke-linejoin': 'round' }));

    result.horizons.forEach(function (h) {
      var cx = x(h.days), cy = y(h.survival);
      var stroke = h.tier === 'Low' ? 'var(--low)' : h.tier === 'Intermediate' ? 'var(--mid)' : 'var(--high)';
      curve.appendChild(el('line', { x1: cx, y1: T, x2: cx, y2: B,
        stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      curve.appendChild(el('circle', { cx: cx, cy: cy, r: 5, fill: 'var(--surface)',
        stroke: stroke, 'stroke-width': 2.5 }));
      curve.appendChild(el('text', { x: cx, y: T - 6, 'text-anchor': 'middle',
        'font-family': 'var(--mono)', 'font-size': 11, 'font-weight': 500, fill: 'var(--ink)' },
        (h.survival * 100).toFixed(1) + '%'));
      curve.appendChild(el('text', { x: cx, y: B + 16, 'text-anchor': 'middle',
        'font-family': 'var(--mono)', 'font-size': 10, fill: 'var(--muted)' }, String(h.days)));
    });

    curve.appendChild(el('text', { x: L, y: B + 16, 'text-anchor': 'middle',
      'font-family': 'var(--mono)', 'font-size': 10, fill: 'var(--faint)' }, '0'));
    curve.appendChild(el('text', { x: R, y: B + 30, 'text-anchor': 'end',
      'font-family': 'var(--sans)', 'font-size': 10, fill: 'var(--faint)' }, 'days since treatment'));
    curve.appendChild(el('text', { x: L - 10, y: T - 8, 'text-anchor': 'end',
      'font-family': 'var(--sans)', 'font-size': 10, fill: 'var(--faint)' }, '%'));
  }

  function drawContributions() {
    var medians = cohortMedians();
    var rows = FIELDS.map(function (f, i) {
      return { field: f, index: i, delta: partial(i, state.values[i]) - partial(i, medians[i]) };
    });
    var scale = Math.max(0.05, Math.max.apply(null, rows.map(function (r) { return Math.abs(r.delta); })));
    rows.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    rows.forEach(function (r) {
      var width = (Math.abs(r.delta) / scale) * 46;
      var up = r.delta > 0;
      var row = document.createElement('div');
      row.className = 'contrib__row';
      row.innerHTML =
        '<div class="contrib__name">' + r.field.label +
          ' <span>' + displayValue(r.index) + '</span></div>' +
        '<div class="contrib__track"><div class="contrib__zero"></div>' +
          (Math.abs(r.delta) < 1e-12 ? '' :
            '<div class="contrib__bar contrib__bar--' + (up ? 'up' : 'down') +
            '" style="width:' + width.toFixed(2) + '%"></div>') +
        '</div>' +
        '<div class="contrib__val" style="color:' +
          (Math.abs(r.delta) < 1e-12 ? 'var(--faint)' : up ? 'var(--high-ink)' : 'var(--low-ink)') +
          '">' + (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta).toFixed(3) + '</div>';
      contribHost.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ shell */

  function syncExampleChip() {
    var chip = document.getElementById('example-chip');
    if (chip) chip.style.display = state.pristine ? '' : 'none';
  }

  function render() {
    buildFields();
    syncExampleChip();
    renderResults(compute());
  }

  document.getElementById('mode-type').addEventListener('click', function () { setMode('type'); });
  document.getElementById('mode-explore').addEventListener('click', function () { setMode('explore'); });

  function setMode(mode) {
    state.mode = mode;
    document.getElementById('mode-type').setAttribute('aria-pressed', String(mode === 'type'));
    document.getElementById('mode-explore').setAttribute('aria-pressed', String(mode === 'explore'));
    document.getElementById('mode-hint').textContent = mode === 'type'
      ? 'Type the measured values. Results update as you type.'
      : 'Drag to see how the prediction moves. Switch back to Enter values for exact figures.';
    render();
  }

  document.getElementById('reset').addEventListener('click', function () {
    state.values = defaults();
    state.pristine = true;
    render();
  });

  document.getElementById('unit-dl').addEventListener('click', function () { setAlbuminUnit(false); });
  document.getElementById('unit-l').addEventListener('click', function () { setAlbuminUnit(true); });

  function setAlbuminUnit(perLitre) {
    state.albuminPerLitre = perLitre;
    document.getElementById('unit-dl').setAttribute('aria-pressed', String(!perLitre));
    document.getElementById('unit-l').setAttribute('aria-pressed', String(perLitre));
    render();
  }

  var tabs = [
    { tab: 'tab-calculator', panel: 'panel-calculator' },
    { tab: 'tab-model', panel: 'panel-model' },
    { tab: 'tab-validation', panel: 'panel-validation' }
  ];
  tabs.forEach(function (entry) {
    document.getElementById(entry.tab).addEventListener('click', function () {
      tabs.forEach(function (other) {
        var selected = other === entry;
        document.getElementById(other.tab).setAttribute('aria-selected', String(selected));
        document.getElementById(other.panel).classList.toggle('hidden', !selected);
      });
    });
  });

  /* --------------------------------------------------------- static content */

  (function fillModelTab() {
    var h = M.hyperparameters;
    var rows = [
      ['Loss', h.loss],
      ['Boosting stages', h.n_estimators],
      ['Tree depth', h.max_depth + ' (decision stumps)'],
      ['Learning rate', h.learning_rate],
      ['Subsample', h.subsample],
      ['Max features', h.max_features],
      ['Min samples per leaf', h.min_samples_leaf],
      ['Random state', h.random_state],
      ['Missing-value handling', 'median imputation (training-set medians)'],
      ['Step-function breakpoints', M.steps.reduce(function (a, s) { return a + s.thresholds.length; }, 0)]
    ];
    var body = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('');
    document.getElementById('hyper').innerHTML =
      '<thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>' + body + '</tbody>';

    document.getElementById('provenance').textContent =
      'source model ' + M.source_model + ' · sha256 ' + M.source_sha256.slice(0, 16) + '…' +
      ' · export schema ' + M.schema;
    document.getElementById('model-version').textContent = 'v' + M.version;
    document.getElementById('footer-version').textContent = 'model v' + M.version;
  })();

  setAlbuminUnit(false);
  setMode('type');
})();
