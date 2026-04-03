import { useState } from "react";

export interface AudioSettings {
  noiseSuppression: boolean;
  autoGainControl: boolean;
  echoCancellation: boolean;
  bitrate: 32 | 64 | 128;
}

const STORAGE_KEY = "cordis_audio_settings";

const DEFAULTS: AudioSettings = {
  noiseSuppression: false,
  autoGainControl: false,
  echoCancellation: true,
  bitrate: 128,
};

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function useAudioSettings() {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);

  const update = (partial: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return { settings, update };
}
