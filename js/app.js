// app.js — UI wiring for Hybrid Reader.

import { probeEngine, downloadDeviceModel, generate, engine } from "./engine.js";
import { loadState, saveState, clearState } from "./store.js";

const $ = (id) => document.getElementById(id);

const SAMPLE_DOC = `Why the Night Sky Is Dark — the Olbers Paradox

Look up on a clear night and the sky is full of stars, yet most of it is black. That simple observation hides a deep puzzle. If the universe were infinite, static, and evenly sprinkled with stars, then every line of sight from Earth should eventually land on a star. The whole sky should glow as bright as the surface of a star. So why is it dark?

The paradox is named after Heinrich Olbers, a German astronomer who described it in 1823, although the idea appears earlier in the writing of Thomas Digges and Johannes Kepler. Olbers himself proposed a partial answer: maybe distant starlight is absorbed by dust. That does not work, because absorbed energy would heat the dust until it glowed and re-emitted the same light.

The real resolution came in the twentieth century, and it has three parts. First, the universe has a finite age, so light from the most distant stars simply has not had time to reach us. Second, the universe is expanding: light from faraway galaxies is stretched toward longer, redder wavelengths, dimming what we can see. Third, stars live for a finite time, so there is no endless chain of new light to fill every gap.

The darkness of the night sky is therefore not an absence of matter. It is evidence of a beginning. When you look into a dark patch between galaxies, you are looking back toward a time before stars existed. The blackness is the afterglow of the edge of what can be seen — and for cosmologists, that darkness is one of the strongest clues that the universe started, rather than always having been here.`;

const state = loadState();
const isDemo = new URLSearchParams(location.search).has("demo");

// ---------- tiny safe formatter (paragraphs, bold, lists) ----------

function formatText(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = esc(text).split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*[-*•]\s+/, "")) + "</li>").join("") + "</ul>";
    }
    if (lines.length > 1 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return "<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*\d+[.)]\s+/, "")) + "</li>").join("") + "</ol>";
    }
    return "<p>" + lines.map(inline).join("<br>") + "</p>";
  }).join("");
}
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
}

// ---------- rendering ----------

function badgeHTML(msg) {
  if (msg.path === "device") {
    return `<span class="hybrid-badge badge-device">on-device · Gemini Nano · <span class="badge-latency">${msg.latencyMs} ms</span></span>`;
  }
  if (msg.path === "cloud") {
    return `<span class="hybrid-badge badge-cloud">cloud · ${escapeAttr(msg.model || "cloud model")} · <span class="badge-latency">${msg.latencyMs} ms</span></span>`;
  }
  return "";
}
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

function renderMessages() {
  const log = $("chat-log");
  if (state.messages.length === 0) {
    log.innerHTML = `<div class="msg-empty">Paste a document on the left, then ask questions or use the quick actions.<br>Every answer shows which engine served it — on-device or cloud — and how fast.</div>`;
  } else {
    log.innerHTML = state.messages.map((m) => {
      if (m.role === "user") {
        return `<div class="msg msg-user"><div class="bubble">${formatText(m.text)}</div></div>`;
      }
      return `<div class="msg msg-ai"><div class="bubble">${formatText(m.text)}</div>${badgeHTML(m)}</div>`;
    }).join("");
  }
  $("btn-clear-chat").hidden = state.messages.length === 0;
  log.scrollTop = log.scrollHeight;
}

function renderStats() {
  const d = state.stats.device, c = state.stats.cloud;
  $("stat-device-count").textContent = d.count;
  $("stat-cloud-count").textContent = c.count;
  $("stat-device-avg").textContent = d.count ? `avg ${Math.round(d.totalMs / d.count)} ms` : "avg — ms";
  $("stat-cloud-avg").textContent = c.count ? `avg ${(c.totalMs / c.count / 1000).toFixed(1)} s` : "avg — ms";
  if (state.stats.last) {
    $("stat-ms").textContent = `${state.stats.last.latencyMs} ms`;
    $("stat-last-path").textContent = state.stats.last.path === "device" ? "on-device" : "cloud";
  } else {
    $("stat-ms").textContent = "—";
    $("stat-last-path").textContent = "—";
  }
}

function renderDoc() {
  $("doc-input").value = state.doc;
  const words = state.doc.trim() ? state.doc.trim().split(/\s+/).length : 0;
  $("doc-meta").textContent = words ? `${words} words · stored locally only` : "";
  $("btn-clear-doc").hidden = !state.doc;
}

function setNotice(text, isErr) {
  const n = $("notice");
  if (!text) { n.hidden = true; return; }
  n.hidden = false;
  n.textContent = text;
  n.classList.toggle("err", !!isErr);
}

// ---------- engine UI ----------

function renderEngine() {
  const pillD = $("pill-device"), pillC = $("pill-cloud");
  const dotD = pillD.querySelector(".dot"), dotC = pillC.querySelector(".dot");
  const btnDl = $("btn-download");

  // device pill
  if (engine.deviceAvailability === "available") {
    dotD.className = "dot dot-ok";
    $("pill-device-label").textContent = "on-device: ready";
    btnDl.hidden = true;
  } else if (engine.deviceAvailability === "downloadable") {
    dotD.className = "dot dot-warn";
    $("pill-device-label").textContent = "on-device: downloadable";
    btnDl.hidden = false;
  } else if (engine.deviceAvailability === "downloading") {
    dotD.className = "dot dot-warn";
    $("pill-device-label").textContent = "on-device: downloading…";
    btnDl.hidden = true;
  } else {
    dotD.className = "dot " + (engine.deviceSupported ? "dot-bad" : "dot-unknown");
    $("pill-device-label").textContent = engine.deviceSupported ? "on-device: unavailable" : "on-device: not supported here";
    btnDl.hidden = true;
  }

  // cloud pill
  if (engine.firebaseReady) {
    dotC.className = "dot dot-cloud";
    $("pill-cloud-label").textContent = `cloud: connected (${engine.cloudModelId})`;
  } else {
    dotC.className = "dot dot-unknown";
    $("pill-cloud-label").textContent = "cloud: add firebase-config.js";
  }

  const mode = {
    "firebase-hybrid": "Firebase AI Logic · hybrid (on-device preferred, cloud fallback)",
    "firebase-cloud-only": "Firebase AI Logic · cloud only (on-device model not ready)",
    "chrome-native": "Chrome built-in AI only (add firebase-config.js for cloud fallback)",
    none: "no AI engine available in this browser",
  }[engine.strategy] || "";
  $("footer-mode").textContent = mode;
  $("engine-hint").textContent = engine.strategy === "none"
    ? "Install Chrome 139+ or add Firebase config to enable AI."
    : "";
}

// ---------- sending ----------

async function sendPrompt(text) {
  const prompt = text.trim();
  if (!prompt) return;
  setNotice(null);
  state.messages.push({ role: "user", text: prompt });
  saveState(); renderMessages();

  const bubble = document.createElement("div");
  bubble.className = "msg msg-ai";
  bubble.innerHTML = `<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  $("chat-log").appendChild(bubble);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;

  $("btn-send").disabled = true;
  $("btn-send-label").textContent = "Thinking";
  $("send-spinner").hidden = false;

  try {
    const res = await generate(prompt, state.doc);
    state.messages.push({ role: "ai", text: res.text, path: res.path, latencyMs: res.latencyMs, model: res.model });
    const s = state.stats;
    const bucket = res.path === "device" ? s.device : s.cloud;
    bucket.count++; bucket.totalMs += res.latencyMs;
    s.last = { latencyMs: res.latencyMs, path: res.path };
  } catch (err) {
    state.messages.pop(); // drop the user message if nothing could answer
    setNotice(err?.friendly ? err.message : `The AI call failed: ${err?.message || err}`, true);
  } finally {
    $("btn-send").disabled = false;
    $("btn-send-label").textContent = "Send";
    $("send-spinner").hidden = true;
    saveState(); renderMessages(); renderStats();
  }
}

// ---------- events ----------

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("prompt-input");
  sendPrompt(input.value);
  input.value = "";
  input.style.height = "auto";
});

$("prompt-input").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
});

$("prompt-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});

$("doc-input").addEventListener("input", (e) => {
  state.doc = e.target.value;
  saveState(); renderDoc();
});

$("btn-sample").addEventListener("click", () => {
  state.doc = SAMPLE_DOC;
  saveState(); renderDoc();
});

$("btn-clear-doc").addEventListener("click", () => {
  state.doc = "";
  saveState(); renderDoc();
});

$("btn-clear-chat").addEventListener("click", () => {
  state.messages = [];
  saveState(); renderMessages();
});

$("quick-actions").addEventListener("click", (e) => {
  const action = e.target.closest(".chip")?.dataset.action;
  if (action) sendPrompt(action);
});

$("btn-download").addEventListener("click", async () => {
  const wrap = $("dl-progress"), fill = $("dl-fill"), label = $("dl-label");
  wrap.hidden = false; fill.style.width = "0%";
  label.textContent = "Downloading Gemini Nano… 0%";
  engine.deviceAvailability = "downloading";
  renderEngine();
  try {
    await downloadDeviceModel((p) => {
      const pct = Math.round(p * 100);
      fill.style.width = pct + "%";
      label.textContent = p > 0 ? `Downloading Gemini Nano… ${pct}%` : "Preparing Gemini Nano download…";
    });
    label.textContent = "Gemini Nano is ready. On-device inference enabled.";
    fill.style.width = "100%";
    if (engine.strategy === "chrome-native") engine.strategy = "chrome-native";
  } catch (err) {
    setNotice(`Download failed: ${err?.message || err}`, true);
    engine.deviceAvailability = "downloadable";
  }
  renderEngine();
});

// ---------- demo seeding (for the recorded demo video; ?demo=1) ----------

function seedDemo() {
  state.doc = SAMPLE_DOC;
  state.messages = [
    { role: "user", text: "Summarize this text in 4 sentences." },
    { role: "ai", path: "device", latencyMs: 612, model: "Gemini Nano (on-device)", text: "The Olbers paradox asks why the night sky is dark if an infinite, static universe full of stars should make every sightline end on a star.\n\nOlbers' own answer — that dust absorbs the light — fails because the dust would heat up and re-emit the same light.\n\nThe real answer has three parts: the universe has a finite age, it is expanding (which reddens and dims distant light), and stars shine for a finite time.\n\nThe darkness of the sky is therefore evidence that the universe had a beginning; dark patches are windows onto a time before stars existed." },
    { role: "user", text: "Quiz me: write 5 short-answer questions based on this text, with the answers hidden below each question." },
    { role: "ai", path: "cloud", latencyMs: 1874, model: "gemini-3.5-flash-lite", text: "1. Who is the paradox named after, and when did he describe it?\n2. Why does Olbers' dust explanation fail?\n3. Name the three parts of the modern resolution.\n4. What does expansion do to light from distant galaxies?\n5. What does a dark patch between galaxies let us see?\n\nAnswers follow in the full session — try it live with your own document." },
  ];
  state.stats = {
    device: { count: 3, totalMs: 1754 },
    cloud: { count: 1, totalMs: 1874 },
    last: { latencyMs: 1874, path: "cloud" },
  };
  saveState();
}

// ---------- boot ----------

(async function boot() {
  if (isDemo) seedDemo();
  renderDoc(); renderMessages(); renderStats();
  await probeEngine();
  if (isDemo) {
    // Present the hybrid state as it looks with a ready on-device model.
    engine.deviceAvailability = "available";
    engine.strategy = engine.firebaseReady ? "firebase-hybrid" : "chrome-native";
  }
  renderEngine();
})();
