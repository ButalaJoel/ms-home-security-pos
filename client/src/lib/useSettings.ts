import { useEffect, useState } from "react";
import { apiJson } from "./http";
import type { Settings } from "./documents";

let cached: Settings | null = null;
let pending: Promise<Settings> | null = null;

/** Loads business settings once and shares them between pages. */
export function loadSettings(force = false): Promise<Settings> {
  if (cached && !force) return Promise.resolve(cached);
  if (!pending || force) {
    pending = apiJson<{ settings: Settings }>("/api/settings")
      .then((payload) => {
        cached = payload.settings ?? {};
        return cached;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(cached ?? {});
  useEffect(() => {
    let active = true;
    loadSettings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
