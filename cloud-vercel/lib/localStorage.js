"use client";

const KEYS = {
  stores: "nikko_cloud_stores",
  settings: "nikko_cloud_settings",
};

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
    localStorage.setItem(KEYS.stores, JSON.stringify(stores));
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
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  } catch {}
}
