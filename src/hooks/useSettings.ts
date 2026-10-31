import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings, type LayoutSettings } from '../lib/settings';

/** Layout settings, restored from and persisted to localStorage. */
export function useSettings() {
  const [settings, setSettings] = useState<LayoutSettings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<LayoutSettings>) => {
    setSettings((prev) => sanitizeSettings({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(sanitizeSettings(DEFAULT_SETTINGS)), []);

  return { settings, update, reset };
}
