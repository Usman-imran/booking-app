import Constants from 'expo-constants';

// Base URL of the backend API, including the /api prefix.
//
// Resolution order:
//  1. EXPO_PUBLIC_API_BASE_URL (see .env.example) - Expo inlines any
//     EXPO_PUBLIC_* variable into the JS bundle at build/start time. Set it
//     when the backend is NOT on the machine running Metro.
//  2. The Expo dev server's hostUri - the LAN IP the device already reaches
//     Metro on. In development the backend usually runs on that same
//     machine, and this follows it across network changes (Wi-Fi <-> hotspot)
//     with no config edits.
//  3. localhost - last resort for builds with no dev server. On a device this
//     refers to the device itself and will not reach the backend, so it is
//     logged as a warning.
//
// Nothing here throws: this module is evaluated while the root layout loads,
// and a throw there takes the whole app down before anything renders.
const DEFAULT_PORT = 5000;
const DEFAULT_PATH = '/api';

function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured;

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) {
    const derived = `http://${host}:${DEFAULT_PORT}${DEFAULT_PATH}`;
    console.log(`API base URL derived from the Expo dev server: ${derived}`);
    return derived;
  }

  const fallback = `http://localhost:${DEFAULT_PORT}${DEFAULT_PATH}`;
  console.warn(
    `EXPO_PUBLIC_API_BASE_URL is not set and no dev server host is available; falling back to ${fallback}. ` +
      'Set it in mobile/.env and restart with `npx expo start -c`.'
  );
  return fallback;
}

export const API_BASE_URL = resolveBaseUrl().replace(/\/+$/, '');
