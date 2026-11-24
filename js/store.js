// store.js — persistence in localStorage. No backend, no accounts.

const KEY = "hybrid-reader:v1";

const initial = {
  doc: "",
  messages: [], // {role:'user'|'ai', text, path?, latencyMs?, model?}
  stats: { device: { count: 0, totalMs: 0 }, cloud: { count: 0, totalMs: 0 }, last: null },
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(initial);
    const parsed = JSON.parse(raw);
    return {
      doc: typeof parsed.doc === "string" ? parsed.doc : "",
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      stats: { ...structuredClone(initial.stats), ...(parsed.stats || {}) },
    };
  } catch {
    return structuredClone(initial);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      doc: state.doc,
      messages: state.messages.slice(-100),
      stats: state.stats,
    }));
  } catch {
    // storage full or blocked — app keeps working in memory
  }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch {}
}
