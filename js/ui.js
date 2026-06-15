// UI wiring — screens, events, rendering
(function () {
  // --- Screen navigation ---
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // --- Settings ---
  function renderStrengthTags(strengths) {
    const el = document.getElementById('strength-tags');
    el.innerHTML = '';
    (strengths || []).forEach(s => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = s + ' mg';
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.setAttribute('aria-label', 'Remove ' + s + ' mg');
      rm.onclick = () => {
        const cur = getStrengths() || [];
        saveStrengths(cur.filter(x => x !== s));
        renderStrengthTags(getStrengths());
        updateStrengthSlots();
      };
      tag.appendChild(rm);
      el.appendChild(tag);
    });
  }

  function initSettings() {
    const inp = document.getElementById('strength-input');
    document.getElementById('add-strength').onclick = () => {
      const val = parseFloat(inp.value);
      if (!val || val <= 0) { inp.focus(); return; }
      const cur = getStrengths() || [];
      if (!cur.includes(val)) {
        saveStrengths([...cur, val].sort((a, b) => a - b));
        renderStrengthTags(getStrengths());
        updateStrengthSlots();
      }
      inp.value = '';
      inp.focus();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('add-strength').click(); });
    document.getElementById('save-settings').onclick = () => {
      if (!getStrengths() || getStrengths().length === 0) {
        alert('Please add at least one tablet strength.');
        return;
      }
      showScreen('main-screen');
    };
    renderStrengthTags(getStrengths());
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
      renderStrengthTags(getStrengths());
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

    if (pctRange[0] === 0 && pctRange[1] === 0) {
      // Restate current
      html += `<div class="no-change-note">No dose change required. Continue current regimen.</div>`;
    }

    if (suggestions.length === 0) {
      html += `<div class="no-suggestions">No valid schedule found with available strengths.</div>`;
    } else {
      suggestions.forEach((s, i) => {
        const warnHigh = s.weeklyMg / 7 > 15;
        const warnLargeChange = Math.abs(s.achievedPct) > 35;
        html += `
          <div class="suggestion-card ${!s.inGuideline ? 'out-of-guideline' : ''}">
            <div class="suggestion-rank">#${i + 1}</div>
            ${!s.inGuideline ? '<div class="guideline-flag">Outside guideline band</div>' : ''}
            ${warnHigh || warnLargeChange ? `<div class="sanity-warn">⚠ ${warnHigh ? 'Daily dose >15 mg. ' : ''}${warnLargeChange ? 'Large weekly change — check dose.' : ''}</div>` : ''}
            <div class="daily-plan">${s.dailyPlan}</div>
            <div class="recipe">${s.perDayRecipe}</div>
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
