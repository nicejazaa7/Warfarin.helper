// Mini 4-function calculator — completely independent of dosing logic

(function () {
  let calcExpr = '';

  function calcInput(val) {
    if (val === 'C') { calcExpr = ''; }
    else if (val === '⌫') { calcExpr = calcExpr.slice(0, -1); }
    else if (val === '=') {
      try {
        // Only allow digits, operators, decimal, parentheses
        if (/^[0-9+\-×÷().%\s]+$/.test(calcExpr)) {
          const safe = calcExpr.replace(/×/g, '*').replace(/÷/g, '/');
          // eslint-disable-next-line no-new-func
          const result = Function('"use strict"; return (' + safe + ')')();
          calcExpr = isFinite(result) ? String(parseFloat(result.toFixed(8))) : 'Error';
        } else {
          calcExpr = 'Error';
        }
      } catch {
        calcExpr = 'Error';
      }
    } else {
      if (calcExpr === 'Error') calcExpr = '';
      calcExpr += val;
    }
    const disp = document.getElementById('calc-display');
    if (disp) disp.textContent = calcExpr || '0';
  }

  window.calcInput = calcInput;
})();
