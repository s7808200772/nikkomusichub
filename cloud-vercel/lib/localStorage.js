"use client";

// Dev-only preview fallback. Production must use Supabase so that the server
// API can read stores/settings and issue remote MQTT commands.
const KEYS = {
  stores: "nikko_cloud_stores",
  settings: "nikko_cloud_settings",
};

const SENSITIVE_SETTINGS_FIELDS = ["defaultMqttPassword", "webdavPassword"];
const SENSITIVE_STORE_FIELDS = ["mqttPassword"];

export function stripSensitiveSettings(settings) {
  if (!settings || typeof settings !== "object") return {};
  const copy = { ...settings };
  SENSITIVE_SETTINGS_FIELDS.forEach((k) => delete copy[k]);
  return copy;
}

export function stripSensitiveStores(stores) {
  if (!Array.isArray(stores)) return [];
  return stores.map((s) => {
    const copy = { ...s };
    SENSITIVE_STORE_FIELDS.forEach((k) => delete copy[k]);
    return copy;
  });
}

export function loadLocalStores() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.stores);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalStores(stores) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.stores, JSON.stringify(stripSensitiveStores(stores)));
  } catch {}
}

export function loadLocalSettings() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.settings);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.settings, JSON.stringify(stripSensitiveSettings(settings)));
  } catch {}
}
