const STORE_KEY = 'warfarin_strengths';

function getStrengths() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map(Number).filter(n => n > 0).sort((a, b) => a - b);
  } catch {
    return null;
  }
}

function saveStrengths(arr) {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
}
