// Titration table: target INR 2.0–3.0
// Pick first row where row.max >= inr
const TITRATION = [
  { max: 1.49,     type: 'adjust',      pct: [+10, +20], label: 'Increase dose 10–20%' },
  { max: 1.99,     type: 'adjust',      pct: [+5,  +10], label: 'Increase dose 5–10%' },
  { max: 3.0,      type: 'adjust',      pct: [0,     0], label: 'Continue same dose' },
  { max: 3.99,     type: 'adjust',      pct: [-5,  -10], label: 'Decrease dose 5–10%' },
  { max: 4.99,     type: 'hold+adjust', holdDays: 1, pct: [-10, -10], label: 'Hold 1 day, then decrease 10%' },
  { max: 8.99,     type: 'guidance',    label: 'Hold 1–2 days + give Vitamin K 1 mg orally (no bleeding)' },
  { max: Infinity, type: 'guidance',    label: 'Give Vitamin K 5–10 mg orally (INR ≥ 9.0, no bleeding)' },
];

function lookupINR(inr) {
  return TITRATION.find(row => row.max >= inr) || TITRATION[TITRATION.length - 1];
}
