// UI wiring — screens, events, rendering
(function () {
  // --- Screen navigation ---
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // --- Settings ---
  // Warfarin tablet strengths available in Thailand: 1–5 mg.
  const AVAILABLE_STRENGTHS = [1, 2, 3, 4, 5];

  function renderPillPicker() {
    const el = document.getElementById('pill-picker');
    const selected = getStrengths() || [];
    el.innerHTML = '';
    AVAILABLE_STRENGTHS.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pill-option' + (selected.includes(s) ? ' selected' : '');
      btn.setAttribute('aria-pressed', selected.includes(s) ? 'true' : 'false');
      btn.innerHTML = `<span class="pill-icon">${s}</span><span class="pill-label">${s} mg</span>`;
      btn.onclick = () => {
        const cur = getStrengths() || [];
        const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
        saveStrengths(next.sort((a, b) => a - b));
        renderPillPicker();
        updateStrengthSlots();
      };
      el.appendChild(btn);
    });
  }

  function initSettings() {
    document.getElementById('save-settings').onclick = () => {
      if (!getStrengths() || getStrengths().length === 0) {
        alert('Please select at least one tablet strength.');
        return;
      }
      showScreen('main-screen');
    };
    renderPillPicker();
  }

  // --- Previous-dose helper ---
  let weeklyFromSlots = 0;

  function updateStrengthSlots() {
    const strengths = getStrengths() || [];
    const container = document.getElementById('dose-slots');
    container.innerHTML = '';
    strengths.forEach(s => {
      const row = document.createElement('div');
      row.className = 'slot-row';
      row.innerHTML = `<label>${s} mg</label>
        <input type="number" min="0" max="6" step="0.5" value="0" class="slot-input" data-strength="${s}">
        <span class="slot-unit">tablets</span>`;
      container.appendChild(row);
    });
    container.querySelectorAll('.slot-input').forEach(inp => {
      inp.addEventListener('input', calcSlotTotal);
    });
    calcSlotTotal();
  }

  function calcSlotTotal() {
    const inputs = document.querySelectorAll('.slot-input');
    let total = 0;
    inputs.forEach(inp => {
      const s = parseFloat(inp.dataset.strength);
      const count = parseFloat(inp.value) || 0;
      // round count to nearest 0.5
      const rounded = Math.round(count * 2) / 2;
      total += rounded * s;
    });
    weeklyFromSlots = Math.round(total * 100) / 100;
    document.getElementById('slot-total').textContent = weeklyFromSlots.toFixed(1) + ' mg/wk';
  }

  // --- Main screen ---
  let mode = 'table'; // 'table' | 'demand'
  let doseMethod = 'direct'; // 'direct' | 'slots'

  function initMain() {
    // Mode toggle
    document.getElementById('btn-table').onclick = () => setMode('table');
    document.getElementById('btn-demand').onclick = () => setMode('demand');

    // Dose method toggle
    document.getElementById('dose-method-direct').onchange = () => setDoseMethod('direct');
    document.getElementById('dose-method-slots').onchange = () => setDoseMethod('slots');

    document.getElementById('btn-settings').onclick = () => {
      renderPillPicker();
      showScreen('settings-screen');
    };
    document.getElementById('btn-calculator').onclick = () => showScreen('calc-screen');

    document.getElementById('btn-calculate').onclick = calculate;

    updateStrengthSlots();
  }

  function setMode(m) {
    mode = m;
    document.getElementById('btn-table').classList.toggle('active', m === 'table');
    document.getElementById('btn-demand').classList.toggle('active', m === 'demand');
    document.getElementById('table-inputs').classList.toggle('hidden', m !== 'table');
    document.getElementById('demand-inputs').classList.toggle('hidden', m !== 'demand');
  }

  function setDoseMethod(m) {
    doseMethod = m;
    document.getElementById('weekly-direct').classList.toggle('hidden', m !== 'direct');
    document.getElementById('weekly-slots').classList.toggle('hidden', m !== 'slots');
  }

  function getCurrentWeekly() {
    if (doseMethod === 'direct') {
      return parseFloat(document.getElementById('weekly-mg').value) || 0;
    }
    return weeklyFromSlots;
  }

  function calculate() {
    const strengths = getStrengths();
    if (!strengths || strengths.length === 0) {
      alert('Please set tablet strengths first.');
      showScreen('settings-screen');
      return;
    }

    const currentWeekly = getCurrentWeekly();
    if (!currentWeekly || currentWeekly <= 0) {
      alert('Please enter the current weekly dose.');
      return;
    }

    const majorBleeding = document.getElementById('major-bleeding')?.checked;

    let row, pctRange;
    if (majorBleeding) {
      renderGuidance('Give Vitamin K 10 mg IV + FFP (major bleeding)', currentWeekly, true);
      showScreen('results-screen');
      return;
    }

    if (mode === 'table') {
      const inr = parseFloat(document.getElementById('inr-input').value);
      if (isNaN(inr) || inr <= 0) {
        alert('Please enter a valid INR.');
        return;
      }
      row = lookupINR(inr);
      if (row.type === 'guidance') {
        renderGuidance(row.label, currentWeekly, false);
        showScreen('results-screen');
        return;
      }
      pctRange = row.pct;
      renderResults(strengths, currentWeekly, pctRange, row);
    } else {
      const pct = parseFloat(document.getElementById('demand-pct').value);
      if (isNaN(pct)) {
        alert('Please enter an adjustment percentage.');
        return;
      }
      pctRange = [pct, pct];
      renderResults(strengths, currentWeekly, pctRange, null);
    }

    showScreen('results-screen');
  }

  // --- Results ---
  function renderGuidance(text, currentWeekly, isMajorBleeding) {
    const el = document.getElementById('results-content');
    el.innerHTML = `
      <div class="guidance-box ${isMajorBleeding ? 'urgent' : ''}">
        <div class="guidance-label">${isMajorBleeding ? '⚠ Major Bleeding Protocol' : 'Clinical Guidance'}</div>
        <div class="guidance-text">${text}</div>
      </div>
      <div class="current-dose-info">Current weekly dose: <strong>${currentWeekly} mg/wk</strong></div>
      ${disclaimer()}
    `;
  }

  function renderResults(strengths, currentWeekly, pctRange, row) {
    const isHoldAdjust = row && row.type === 'hold+adjust';
    const suggestions = suggest(strengths, currentWeekly, pctRange);
    const el = document.getElementById('results-content');

    let html = '';

    if (isHoldAdjust) {
      html += `<div class="hold-banner">Hold today's dose, then start the schedule below.</div>`;
    }

    if (row) {
      html += `<div class="titration-label">${row.label}</div>`;
    } else {
      html += `<div class="titration-label">Demand: ${pctRange[0] >= 0 ? '+' : ''}${pctRange[0]}%</div>`;
    }

    html += `<div class="current-dose-info">Current: <strong>${currentWeekly} mg/wk</strong></div>`;

    const isContinue = pctRange[0] === 0 && pctRange[1] === 0;
    const allowNoChange = !!(row && row.allowNoChange);

    if (isContinue) {
      // In-range (INR 2.0–3.0): only the no-change option is appropriate.
      html += `<div class="no-change-note">INR is in range. No dose change required — continue current regimen.</div>`;
    }

    // Grace zone (INR 1.85–1.99 or 3.01–3.15): "no change" is offered as one
    // option alongside the adjustment suggestions.
    if (allowNoChange) {
      html += `
        <div class="suggestion-card no-change-option">
          <div class="option-tag">Option · no change</div>
          <div class="dose-lines">
            <div class="dose-line">
              <div class="dose-line-head"><span class="dose-mg">Continue current dose</span><span class="dose-days">7 days</span></div>
            </div>
          </div>
          <div class="stats">
            <span class="weekly-mg">${currentWeekly} mg/wk</span>
            <span class="achieved-pct">±0%</span>
          </div>
        </div>
      `;
    }

    if (suggestions.length === 0 && !isContinue && !allowNoChange) {
      html += `<div class="no-suggestions">No valid schedule found with available strengths.</div>`;
    } else {
      suggestions.forEach((s, i) => {
        const warnHigh = s.weeklyMg / 7 > 15;
        const warnLargeChange = Math.abs(s.achievedPct) > 35;
        const linesHtml = s.lines.map(line => {
          const compose = composeText(line.recipe);
          return `
            <div class="dose-line">
              <div class="dose-line-head"><span class="dose-mg">${line.mg} mg</span><span class="dose-days">${line.days} day${line.days > 1 ? 's' : ''}</span></div>
              ${compose ? `<div class="dose-compose">${compose}</div>` : ''}
            </div>`;
        }).join('');
        html += `
          <div class="suggestion-card ${!s.inGuideline ? 'out-of-guideline' : ''}">
            <div class="suggestion-rank">#${i + 1}</div>
            ${!s.inGuideline ? '<div class="guideline-flag">Outside guideline band</div>' : ''}
            ${warnHigh || warnLargeChange ? `<div class="sanity-warn">⚠ ${warnHigh ? 'Daily dose >15 mg. ' : ''}${warnLargeChange ? 'Large weekly change — check dose.' : ''}</div>` : ''}
            <div class="dose-lines">${linesHtml}</div>
            <div class="stats">
              <span class="weekly-mg">${s.weeklyMg} mg/wk</span>
              <span class="achieved-pct ${s.achievedPct > 0 ? 'pos' : s.achievedPct < 0 ? 'neg' : ''}">${s.achievedPct >= 0 ? '+' : ''}${s.achievedPct}%</span>
            </div>
          </div>
        `;
      });
    }

    html += disclaimer();
    el.innerHTML = html;
  }

  function disclaimer() {
    return `<div class="disclaimer">Decision-support aid only. The prescribing physician is responsible for the final dose.</div>`;
  }

  function initResults() {
    document.getElementById('btn-back').onclick = () => showScreen('main-screen');
    document.getElementById('btn-back-calc').onclick = () => showScreen('main-screen');
  }

  // --- Calculator ---
  function initCalc() {
    document.getElementById('calc-display').textContent = '0';
  }

  // --- Boot ---
  function boot() {
    initSettings();
    initMain();
    initResults();
    initCalc();

    const strengths = getStrengths();
    if (!strengths || strengths.length === 0) {
      showScreen('settings-screen');
    } else {
      showScreen('main-screen');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
