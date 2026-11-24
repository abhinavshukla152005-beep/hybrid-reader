// firebase-backend.js — Firebase AI Logic backend, loaded only when the user
// has created firebase-config.js. Verified against the official hybrid
// inference web guide (firebase.google.com/docs/ai-logic/hybrid/web/get-started).

import { initializeApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
import { firebaseConfig, cloudModelId } from "../firebase-config.js";

export async function createBackend() {
  const app = initializeApp(firebaseConfig);
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  return {
    cloudModelId: cloudModelId || "gemini-3.5-flash-lite",

    makeDeviceModel() {
      return getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
    },

    makeCloudModel() {
      return getGenerativeModel(ai, {
        mode: InferenceMode.ONLY_IN_CLOUD,
        model: cloudModelId || "gemini-3.5-flash-lite",
      });
    },

    async downloadDeviceModel(onProgress) {
      const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
      await model.initializeDeviceModel((fraction) => onProgress?.(fraction ?? 0));
    },
  };
}
