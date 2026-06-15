// Pure dose-suggestion engine. No DOM. See BUILD.md §3 and ADR 0001.

const MAX_DAILY_MG = 15;
const MAX_PER_STRENGTH = 3; // whole tablets per strength (each 0.5 step → 0..6 half-steps)

// Build sorted list of achievable daily doses from strengths.
// Each entry: { mg, pieces (total half-tablet pieces), halves, recipe }
function buildDailyDoses(strengths) {
  const map = new Map(); // mg -> best recipe

  // Generate half-tablet counts for each strength: 0, 0.5, 1, ..., MAX_PER_STRENGTH
  const steps = [];
  for (const s of strengths) {
    const opts = [];
    for (let h = 0; h <= MAX_PER_STRENGTH * 2; h++) {
      opts.push(h); // number of half-tablets
    }
    steps.push({ strength: s, opts });
  }

  function enumerate(idx, currentMg, currentPieces, currentHalves, currentRecipe) {
    if (currentMg > MAX_DAILY_MG) return;
    if (idx === steps.length) {
      if (currentMg === 0) return;
      const key = Math.round(currentMg * 100); // avoid float keys
      const existing = map.get(key);
      if (!existing || currentPieces < existing.pieces || (currentPieces === existing.pieces && currentHalves < existing.halves)) {
        map.set(key, { mg: currentMg, pieces: currentPieces, halves: currentHalves, recipe: currentRecipe.slice() });
      }
      return;
    }
    const { strength, opts } = steps[idx];
    for (const h of opts) {
      const addMg = h * 0.5 * strength;
      if (currentMg + addMg > MAX_DAILY_MG) break;
      const pieces = h; // each half-tablet = 1 piece
      const halves = h % 2; // odd half-count means one cut tablet
      enumerate(
        idx + 1,
        currentMg + addMg,
        currentPieces + pieces,
        currentHalves + halves,
        h > 0 ? [...currentRecipe, { strength, halfCount: h }] : currentRecipe
      );
    }
  }

  enumerate(0, 0, 0, 0, []);

  const list = Array.from(map.values()).sort((a, b) => a.mg - b.mg);
  return list;
}

function recipeText(recipe) {
  if (!recipe || recipe.length === 0) return '';
  return recipe.map(({ strength, halfCount }) => {
    const whole = Math.floor(halfCount / 2);
    const half = halfCount % 2;
    const parts = [];
    if (whole > 0) parts.push(`${whole}×${strength}mg`);
    if (half > 0) parts.push(`½×${strength}mg`);
    return parts.join('+');
  }).join(' + ');
}

// Spelled-out tablet composition for one day's dose, e.g.
// "1 × 2 mg + ½ × 3 mg" for a 3.5 mg day.
function composeText(recipe) {
  if (!recipe || recipe.length === 0) return '';
  return recipe.map(({ strength, halfCount }) => {
    const whole = Math.floor(halfCount / 2);
    const half = halfCount % 2;
    const parts = [];
    if (whole > 0) parts.push(`${whole} × ${strength} mg`);
    if (half > 0) parts.push(`½ × ${strength} mg`);
    return parts.join(' + ');
  }).join(' + ');
}

// Format a schedule as human text
function schedulePlan(v, vp, k, total) {
  // k days at vp, (7-k) days at v
  const lo = total - k;
  if (k === 0 || v === vp) {
    return `${v} mg every day`;
  }
  return `${v} mg × ${lo} days, ${vp} mg × ${k} days`;
}

function round2(n) { return Math.round(n * 100) / 100; }

// Core suggestion engine (pure)
// strengths: number[]
// currentWeekly: number (mg/wk)
// pctRange: [low, high] percentage adjustment (e.g. [+10, +20] or [0, 0])
// Returns array of up to 3 suggestion objects
function suggest(strengths, currentWeekly, pctRange) {
  if (!strengths || strengths.length === 0 || !currentWeekly || currentWeekly <= 0) return [];

  const [plo, phi] = pctRange;

  // Step 1: target bands
  const strictLow  = currentWeekly * (1 + plo / 100);
  const strictHigh = currentWeekly * (1 + phi / 100);
  const widenLow   = currentWeekly * (1 + (plo - 5) / 100);
  const widenHigh  = currentWeekly * (1 + (phi + 5) / 100);

  // When pct is [0,0]: restating current schedule — bands collapse to currentWeekly ±5pp
  // widenLow/High still ±5 pp from 0 => ±5% of current. That's fine per spec.

  // Step 2: achievable daily doses
  const D = buildDailyDoses(strengths);
  if (D.length === 0) return [];

  // Step 3: enumerate flat + two-adjacent schedules
  const candidates = [];
  const midPct = (plo + phi) / 2;

  for (let i = 0; i < D.length; i++) {
    const { mg: v, pieces: vPieces, halves: vHalves, recipe: vRecipe } = D[i];

    // Flat: 7 days at v
    const flatWeekly = round2(7 * v);
    const flatAchievedPct = round2((flatWeekly / currentWeekly - 1) * 100);
    const inStrictFlat = flatWeekly >= strictLow - 1e-9 && flatWeekly <= strictHigh + 1e-9;
    const inWidenFlat  = flatWeekly >= widenLow  - 1e-9 && flatWeekly <= widenHigh  + 1e-9;
    candidates.push({
      weekly: flatWeekly,
      achievedPct: flatAchievedPct,
      spread: 0,
      levels: 1,
      pillScore: 7 * vPieces,
      halfScore: 7 * vHalves,
      inStrict: inStrictFlat,
      inWiden: inWidenFlat,
      dailyPlan: schedulePlan(v, v, 0, 7),
      perDayRecipe: recipeText(vRecipe),
      lines: [{ mg: v, days: 7, recipe: vRecipe }],
      distToMid: Math.abs(flatAchievedPct - midPct),
      distToStrict: inStrictFlat ? 0 : Math.min(Math.abs(flatWeekly - strictLow), Math.abs(flatWeekly - strictHigh)),
    });

    // Two-adjacent: k days at D[i+1], (7-k) at D[i]
    if (i + 1 < D.length) {
      const { mg: vp, pieces: vpPieces, halves: vpHalves, recipe: vpRecipe } = D[i + 1];
      const spread = round2(vp - v);
      for (let k = 1; k <= 6; k++) {
        const weekly = round2((7 - k) * v + k * vp);
        const achievedPct = round2((weekly / currentWeekly - 1) * 100);
        const inStrict = weekly >= strictLow - 1e-9 && weekly <= strictHigh + 1e-9;
        const inWiden  = weekly >= widenLow  - 1e-9 && weekly <= widenHigh  + 1e-9;
        // pillScore: (7-k) days low recipe + k days high recipe
        const pillScore = (7 - k) * vPieces + k * vpPieces;
        const halfScore = (7 - k) * vHalves + k * vpHalves;
        candidates.push({
          weekly,
          achievedPct,
          spread,
          levels: 2,
          pillScore,
          halfScore,
          inStrict,
          inWiden,
          dailyPlan: schedulePlan(v, vp, k, 7),
          perDayRecipe: `${recipeText(vRecipe) || v + 'mg'} / ${recipeText(vpRecipe) || vp + 'mg'}`,
          lines: [
            { mg: v,  days: 7 - k, recipe: vRecipe },
            { mg: vp, days: k,     recipe: vpRecipe },
          ],
          distToMid: Math.abs(achievedPct - midPct),
          distToStrict: inStrict ? 0 : Math.min(Math.abs(weekly - strictLow), Math.abs(weekly - strictHigh)),
          kHigh: k,
          vLow: v,
          vHigh: vp,
        });
      }
    }
  }

  // Step 3b: enforce direction. An "increase" must raise the weekly dose, a
  // "decrease" must lower it, and a "continue" ([0,0]) must keep it identical.
  // This guarantees a same-dose (0% change) schedule is never offered for a
  // genuine adjustment — the no-change option is added separately in the UI.
  const dir = plo > 0 ? 1 : phi < 0 ? -1 : 0;
  const directional = candidates.filter(c => {
    if (dir > 0) return c.weekly > currentWeekly + 1e-9;
    if (dir < 0) return c.weekly < currentWeekly - 1e-9;
    return Math.abs(c.weekly - currentWeekly) < 1e-9;
  });

  // Step 4: rank and pick top 3
  const strictCands = directional.filter(c => c.inStrict);
  const widenCands  = directional.filter(c => c.inWiden && !c.inStrict);
  const bestStrictSpread = strictCands.length > 0
    ? Math.min(...strictCands.map(c => c.spread))
    : Infinity;

  let eligible;
  if (strictCands.length > 0) {
    const extraWiden = widenCands.filter(c => c.spread < bestStrictSpread);
    eligible = [...strictCands, ...extraWiden.map(c => ({ ...c, outOfGuideline: true }))];
  } else if (widenCands.length > 0) {
    eligible = widenCands.map(c => ({ ...c, outOfGuideline: true }));
  } else {
    // Fallback: closest to band overall (still direction-constrained)
    eligible = directional
      .filter(c => c.weekly > 0)
      .sort((a, b) => a.distToStrict - b.distToStrict)
      .slice(0, 10)
      .map(c => ({ ...c, outOfGuideline: true }));
  }

  // Sort
  eligible.sort((a, b) => {
    if (a.spread !== b.spread) return a.spread - b.spread;
    if (a.levels !== b.levels) return a.levels - b.levels;
    if (a.pillScore !== b.pillScore) return a.pillScore - b.pillScore;
    if (a.halfScore !== b.halfScore) return a.halfScore - b.halfScore;
    return a.distToMid - b.distToMid;
  });

  // Dedupe identical dailyPlan
  const seen = new Set();
  const deduped = [];
  for (const c of eligible) {
    if (!seen.has(c.dailyPlan)) {
      seen.add(c.dailyPlan);
      deduped.push(c);
    }
    if (deduped.length === 3) break;
  }

  return deduped.map(c => ({
    dailyPlan: c.dailyPlan,
    perDayRecipe: c.perDayRecipe,
    lines: c.lines,
    weeklyMg: c.weekly,
    achievedPct: c.achievedPct,
    inGuideline: !c.outOfGuideline,
    spread: c.spread,
    levels: c.levels,
  }));
}
