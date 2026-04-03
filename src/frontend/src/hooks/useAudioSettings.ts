import { useEffect, useState } from "react";

export interface AudioSettings {
  noiseSuppression: boolean;
  autoGainControl: boolean;
  echoCancellation: boolean;
  bitrate: 32 | 64 | 128;
  theme: "discord" | "skype";
}

const STORAGE_KEY = "cordis_audio_settings";

const DEFAULTS: AudioSettings = {
  noiseSuppression: false,
  autoGainControl: false,
  echoCancellation: true,
  bitrate: 128,
  theme: "discord",
};

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

function applyTheme(theme: AudioSettings["theme"]) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useAudioSettings() {
  const [settings, setSettings] = useState<AudioSettings>(() => {
    const loaded = loadSettings();
    applyTheme(loaded.theme);
    return loaded;
  });

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const update = (partial: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { settings, update };
}
