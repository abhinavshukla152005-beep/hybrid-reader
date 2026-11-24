// engine.js — the single adapter every AI call in this app goes through.
//
// Two backends, one interface:
//   1. Firebase AI Logic (hybrid: Chrome built-in Gemini Nano on-device,
//      cloud Gemini model as fallback). Used when firebase-config.js exists.
//   2. Chrome's native LanguageModel Prompt API (no config needed).
//      Used when firebase-config.js is absent but the browser supports
//      built-in AI.
//
// If neither is usable, generate() throws a friendly error — never a crash.

const CLOUD_MODEL_DEFAULT = "gemini-3.5-flash-lite";

export const engine = {
  // 'checking' | 'ready' | 'no-support'
  status: "checking",
  // Chrome built-in AI availability: 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'unsupported'
  deviceAvailability: "unsupported",
  deviceSupported: false,
  // firebase backend loaded + initialized
  firebaseReady: false,
  // which strategy will generate() use: 'firebase-hybrid' | 'chrome-native' | 'none'
  strategy: "none",
  cloudModelId: CLOUD_MODEL_DEFAULT,
  _nativeSession: null,
  _fb: null, // { makeDeviceModel, makeCloudModel, downloadDeviceModel }
};

function friendlyErr(msg) {
  const e = new Error(msg);
  e.friendly = true;
  return e;
}

export async function probeEngine() {
  // 1. Chrome built-in AI (works with or without Firebase).
  if ("LanguageModel" in self) {
    engine.deviceSupported = true;
    try {
      const a = await LanguageModel.availability();
      // spec returns 'unavailable' | 'downloadable' | 'downloading' | 'available'
      engine.deviceAvailability = a === "available" || a === "downloadable" || a === "downloading" ? a : "unavailable";
    } catch {
      engine.deviceAvailability = "unavailable";
    }
  }

  // 2. Firebase AI Logic backend (only if the user has added firebase-config.js).
  engine._fb = await loadFirebaseBackend();

  if (engine._fb) {
    engine.firebaseReady = true;
    engine.cloudModelId = engine._fb.cloudModelId || CLOUD_MODEL_DEFAULT;
    engine.strategy =
      engine.deviceAvailability === "available" || engine.deviceAvailability === "downloadable"
        ? "firebase-hybrid"
        : "firebase-cloud-only";
  } else if (engine.deviceAvailability === "available" || engine.deviceAvailability === "downloadable") {
    engine.strategy = "chrome-native";
  } else {
    engine.strategy = "none";
  }

  engine.status = engine.strategy === "none" ? "no-support" : "ready";
  return engine;
}

async function loadFirebaseBackend() {
  try {
    const mod = await import("../firebase-config.js");
    if (!mod.firebaseConfig) return null; // stub or empty config
    const fb = await import("./firebase-backend.js");
    return await fb.createBackend();
  } catch (err) {
    console.warn("Firebase AI Logic backend unavailable:", err?.message || err);
    return null;
  }
}

// Starts the Gemini Nano download. Calls onProgress(0..1). Resolves when ready.
export async function downloadDeviceModel(onProgress) {
  if (engine._fb) {
    await engine._fb.downloadDeviceModel((p) => onProgress?.(p));
    engine.deviceAvailability = "available";
    return;
  }
  if (engine.deviceSupported) {
    engine._nativeSession = await LanguageModel.create({
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          onProgress?.(e.loaded || 0);
        });
      },
    });
    engine.deviceAvailability = "available";
    return;
  }
  throw friendlyErr("This browser does not support the on-device model.");
}

export async function generate(userPrompt, docText) {
  const fullPrompt = docText && docText.trim()
    ? `Read the following document, then answer. Stay grounded in the text and say so if the answer is not in it.\n\n--- DOCUMENT ---\n${docText.trim()}\n--- END DOCUMENT ---\n\nQuestion / task: ${userPrompt}`
    : userPrompt;

  // Path attribution is explicit, not guessed: we only call the on-device
  // model when Chrome reports it as ready, so the serving path is known.
  const deviceReady = engine.deviceAvailability === "available";

  if (engine._fb) {
    if (deviceReady) {
      const model = engine._fb.makeDeviceModel();
      const t0 = performance.now();
      const result = await model.generateContent(fullPrompt);
      const latencyMs = Math.round(performance.now() - t0);
      return {
        text: result.response.text(),
        path: "device",
        latencyMs,
        model: "Gemini Nano (on-device)",
      };
    }
    const model = engine._fb.makeCloudModel();
    const t0 = performance.now();
    const result = await model.generateContent(fullPrompt);
    const latencyMs = Math.round(performance.now() - t0);
    return {
      text: result.response.text(),
      path: "cloud",
      latencyMs,
      model: engine.cloudModelId,
    };
  }

  if (deviceReady) {
    if (!engine._nativeSession) {
      engine._nativeSession = await LanguageModel.create();
    }
    const t0 = performance.now();
    const text = await engine._nativeSession.prompt(fullPrompt);
    const latencyMs = Math.round(performance.now() - t0);
    return { text, path: "device", latencyMs, model: "Gemini Nano (on-device)" };
  }

  throw friendlyErr(
    "No AI path is available right now. In Chrome, click “Download on-device model”, or add a Firebase config to enable the cloud fallback."
  );
}
