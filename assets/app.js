/* 3APNa Survival Calculator — user interface.
 *
 * All scoring lives in assets/engine.js, which tests/verify.js also loads, so
 * what is checked against Python is exactly what runs here. This file only
 * reads inputs, calls the engine and draws.
 *
 * One rule governs the structure: TYPING MUST NEVER REBUILD A FIELD. An earlier
 * version re-rendered the whole input card on every `input` event, which
 * replaced the focused element and dropped focus after the first character —
 * you could not type "3.6" at all. Fields are rebuilt only on a deliberate
 * action (mode switch, unit switch, reset); keystrokes update state and
 * results only.
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
    invalid: [false, false, false, false, false],
    mode: 'type',
    albuminPerLitre: false,
    pristine: true
  };

  /* ------------------------------------------------------------ formatting */

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
    if (FIELDS[i].key === 'albumin' && state.albuminPerLitre) return 'g/L';
    return FIELDS[i].unit;
  }

  function toNative(i, shown) {
    if (FIELDS[i].key === 'albumin' && state.albuminPerLitre) return shown / 10;
    return shown;
  }

  function fmtRange(f, i) {
    var r = RANGE[f.key];
    if (!r) return '';
    if (f.key === 'afp') return fmtAfp(r.min) + '–' + fmtAfp(r.max);
    var lo = r.min, hi = r.max;
    if (f.key === 'albumin' && state.albuminPerLitre) { lo *= 10; hi *= 10; }
    return fmt(lo, f.decimals) + '–' + fmt(hi, f.decimals);
  }

  var svgNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    var node = document.createElementNS(svgNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(paths, size) {
    var svg = el('svg', { width: size || 13, height: size || 13, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
      'stroke-linecap': 'round', 'aria-hidden': 'true' });
    paths.forEach(function (d) { svg.appendChild(el('path', { d: d })); });
    return svg;
  }

  /* -------------------------------------------------------------- controls */

  var fieldsHost = document.getElementById('fields');

  function buildFields() {
    fieldsHost.innerHTML = '';
    FIELDS.forEach(function (f, i) { fieldsHost.appendChild(buildField(f, i)); });
  }

  function buildField(f, i) {
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
      input.autocomplete = 'off';

      // Update state and results only. Never re-render this element: doing so
      // steals focus mid-word and makes multi-character entry impossible.
      input.addEventListener('input', function () {
        markTouched();
        var shown = parseFloat(input.value);
        if (input.value.trim() === '' || !isFinite(shown)) {
          state.invalid[i] = true;
        } else {
          state.invalid[i] = false;
          state.values[i] = toNative(i, shown);
        }
        flagField(wrap, input, i);
        renderResults(compute());
      });

      // Leaving an empty or unparseable field restores the last good value,
      // so the calculator never sits in a half-entered state.
      input.addEventListener('blur', function () {
        if (state.invalid[i]) {
          state.invalid[i] = false;
          input.value = displayValue(i);
          flagField(wrap, input, i);
          renderResults(compute());
        }
      });

      var suffix = document.createElement('div');
      suffix.className = 'unit-suffix';
      suffix.textContent = displayUnit(i);
      entry.appendChild(input);
      entry.appendChild(suffix);
      row.appendChild(entry);
      wrap.appendChild(row);
      flagField(wrap, input, i);
      return wrap;
    }

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
    range.setAttribute('aria-label', f.label + ' (' + displayUnit(i) + ')');

    var bounds = RANGE[f.key] || { min: 0, max: 100 };
    var current = state.values[i];
    // Widen the track so a value entered outside the development range still
    // puts the handle where the number says it is. Clamping instead would show
    // the handle at the end while the readout said something else — and the
    // next drag would silently overwrite the entered value.
    var lo, hi, toValue, toPosition;
    if (f.log) {
      lo = Math.min(Math.log10(bounds.min), Math.log10(current));
      hi = Math.max(Math.log10(bounds.max), Math.log10(current));
      toValue = function (pos) { return Math.pow(10, lo + (pos / 1000) * (hi - lo)); };
      toPosition = function (v) { return Math.round((Math.log10(v) - lo) / (hi - lo) * 1000); };
      range.min = 0; range.max = 1000; range.step = 1;
    } else {
      lo = Math.min(bounds.min, current);
      hi = Math.max(bounds.max, current);
      toValue = function (pos) { return pos; };
      toPosition = function (v) { return v; };
      range.min = lo; range.max = hi; range.step = f.step;
    }
    range.value = toPosition(current);

    range.addEventListener('input', function () {
      markTouched();
      state.values[i] = toValue(parseFloat(range.value));
      state.invalid[i] = false;
      strong.textContent = displayValue(i);
      flagField(wrap, null, i);
      renderResults(compute());
    });

    holder.appendChild(range);
    var ticks = document.createElement('div');
    ticks.className = 'ticks';
    var tickLabels = f.log
      ? [fmtAfp(Math.pow(10, lo)), '10', '10³', fmtAfp(Math.pow(10, hi))]
      : [fmt(lo, f.decimals), fmt(hi, f.decimals)];
    tickLabels.forEach(function (t) {
      var s = document.createElement('span');
      s.textContent = t;
      ticks.appendChild(s);
    });
    holder.appendChild(ticks);
    wrap.appendChild(holder);
    flagField(wrap, null, i);
    return wrap;
  }

  function flagField(wrap, input, i) {
    var old = wrap.querySelector('.warn');
    if (old) old.remove();
    if (input) input.classList.remove('is-out', 'is-bad');

    var f = FIELDS[i], r = RANGE[f.key], v = state.values[i];
    var message = null, bad = false;
    if (state.invalid[i]) {
      message = 'Enter a number.'; bad = true;
    } else if (v <= 0 && f.key !== 'age') {
      message = f.label + ' must be greater than zero.'; bad = true;
    } else if (r && (v < r.min || v > r.max)) {
      message = 'Outside the development range (' + fmtRange(f, i) + ' ' + displayUnit(i) +
                '). The prediction is an extrapolation.';
    }
    if (!message) return;

    if (input) input.classList.add(bad ? 'is-bad' : 'is-out');
    var note = document.createElement('div');
    note.className = 'warn' + (bad ? ' warn--bad' : '');
    note.setAttribute('role', 'status');
    note.appendChild(icon(['M12 3l9 16H3z', 'M12 10v4M12 17h.01']));
    var text = document.createElement('span');
    text.textContent = message;
    note.appendChild(text);
    wrap.appendChild(note);
  }

  /* --------------------------------------------------------------- results */

  function compute() {
    for (var i = 0; i < state.values.length; i++) {
      if (state.invalid[i]) return null;
      var v = state.values[i];
      if (!isFinite(v) || (v <= 0 && FIELDS[i].key !== 'age')) return null;
    }
    return E.predict(M, state.values);
  }

  var horizonsHost = document.getElementById('horizons');
  var stickyHost = document.getElementById('sticky');
  var contribHost = document.getElementById('contrib');
  var curve = document.getElementById('curve');
  var curveTitle = curve.querySelector('title');

  function clearCurve() {
    while (curve.lastChild) curve.removeChild(curve.lastChild);
    // Put the accessible name back: removeChild above takes <title> with it,
    // which would leave the chart an unlabelled graphic for screen readers.
    if (curveTitle) curve.appendChild(curveTitle);
  }

  function renderResults(result) {
    horizonsHost.innerHTML = '';
    stickyHost.innerHTML = '';
    contribHost.innerHTML = '';
    clearCurve();

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
    var L = 56, R = 660, T = 20, B = 200, maxDay = 730;
    var x = function (t) { return L + (t / maxDay) * (R - L); };
    var y = function (s) { return T + (1 - s) * (B - T); };

    [0, 0.25, 0.5, 0.75, 1].forEach(function (frac) {
      var yy = y(frac);
      curve.appendChild(el('line', { x1: L, y1: yy, x2: R, y2: yy,
        stroke: frac === 0 ? 'var(--line-strong)' : 'var(--line-2)', 'stroke-width': 1 }));
      curve.appendChild(el('text', { x: L - 10, y: yy + 4, 'text-anchor': 'end',
        'font-family': 'var(--mono)', 'font-size': 11.5, fill: 'var(--faint)' },
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
      curve.appendChild(el('circle', { cx: cx, cy: cy, r: 5.5, fill: 'var(--surface)',
        stroke: stroke, 'stroke-width': 2.5 }));
      curve.appendChild(el('text', { x: cx, y: T - 6, 'text-anchor': 'middle',
        'font-family': 'var(--mono)', 'font-size': 12.5, 'font-weight': 500, fill: 'var(--ink)' },
        (h.survival * 100).toFixed(1) + '%'));
      curve.appendChild(el('text', { x: cx, y: B + 17, 'text-anchor': 'middle',
        'font-family': 'var(--mono)', 'font-size': 11.5, fill: 'var(--muted)' }, String(h.days)));
    });

    curve.appendChild(el('text', { x: L, y: B + 17, 'text-anchor': 'middle',
      'font-family': 'var(--mono)', 'font-size': 11.5, fill: 'var(--faint)' }, '0'));
    curve.appendChild(el('text', { x: R, y: B + 31, 'text-anchor': 'end',
      'font-family': 'var(--sans)', 'font-size': 11.5, fill: 'var(--faint)' }, 'days since treatment'));
    curve.appendChild(el('text', { x: L - 10, y: T - 8, 'text-anchor': 'end',
      'font-family': 'var(--sans)', 'font-size': 11.5, fill: 'var(--faint)' }, '%'));

    if (curveTitle) {
      curveTitle.textContent = 'Predicted survival: ' +
        result.horizons.map(function (h) {
          return (h.survival * 100).toFixed(1) + '% at ' + h.label + ' (' + h.tier + ' risk)';
        }).join(', ');
    }
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
      var zero = Math.abs(r.delta) < 1e-12;
      var row = document.createElement('div');
      row.className = 'contrib__row';
      row.innerHTML =
        '<div class="contrib__name">' + r.field.label +
          ' <span>' + displayValue(r.index) + '</span></div>' +
        '<div class="contrib__track"><div class="contrib__zero"></div>' +
          (zero ? '' :
            '<div class="contrib__bar contrib__bar--' + (up ? 'up' : 'down') +
            '" style="width:' + width.toFixed(2) + '%"></div>') +
        '</div>' +
        '<div class="contrib__val" style="color:' +
          (zero ? 'var(--faint)' : up ? 'var(--high-ink)' : 'var(--low-ink)') +
          '">' + (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta).toFixed(3) + '</div>';
      contribHost.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ shell */

  function markTouched() {
    if (!state.pristine) return;
    state.pristine = false;
    syncExampleChip();
  }

  function syncExampleChip() {
    var chip = document.getElementById('example-chip');
    if (chip) chip.hidden = !state.pristine;
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
    for (var i = 0; i < state.invalid.length; i++) state.invalid[i] = false;
    document.getElementById('mode-type').setAttribute('aria-pressed', String(mode === 'type'));
    document.getElementById('mode-explore').setAttribute('aria-pressed', String(mode === 'explore'));
    document.getElementById('mode-hint').textContent = mode === 'type'
      ? 'Type the measured values. Results update as you type.'
      : 'Drag to see how the prediction moves. Switch back to Enter values for exact figures.';
    render();
  }

  document.getElementById('reset').addEventListener('click', function () {
    state.values = defaults();
    for (var i = 0; i < state.invalid.length; i++) state.invalid[i] = false;
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

  /* Tabs: full ARIA tab pattern — arrow keys move, Home/End jump, and only the
     selected tab is in the tab order, as assistive technology expects once
     role="tablist" is declared. */
  var TABS = [
    { tab: 'tab-calculator', panel: 'panel-calculator' },
    { tab: 'tab-model', panel: 'panel-model' },
    { tab: 'tab-validation', panel: 'panel-validation' }
  ];

  function selectTab(index, focus) {
    TABS.forEach(function (entry, i) {
      var selected = i === index;
      var tab = document.getElementById(entry.tab);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(entry.panel).classList.toggle('hidden', !selected);
      if (selected && focus) tab.focus();
    });
  }

  TABS.forEach(function (entry, i) {
    var tab = document.getElementById(entry.tab);
    tab.addEventListener('click', function () { selectTab(i, false); });
    tab.addEventListener('keydown', function (event) {
      var next = null;
      if (event.key === 'ArrowRight') next = (i + 1) % TABS.length;
      else if (event.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = TABS.length - 1;
      if (next === null) return;
      event.preventDefault();
      selectTab(next, true);
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
    document.getElementById('hyper').innerHTML =
      '<thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</tbody>';

    document.getElementById('provenance').textContent =
      'source model ' + M.source_model + ' · sha256 ' + M.source_sha256.slice(0, 16) + '…' +
      ' · export schema ' + M.schema;
    var footer = document.getElementById('footer-version');
    if (footer) footer.textContent = 'model v' + M.version;
  })();

  selectTab(0, false);
  setAlbuminUnit(false);
  setMode('type');
})();
