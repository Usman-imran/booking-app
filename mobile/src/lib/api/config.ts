// Base URL of the backend API, including the /api prefix. Set via
// EXPO_PUBLIC_API_BASE_URL (see .env.example) - Expo inlines any
// EXPO_PUBLIC_* variable into the JS bundle at build/start time.
//
// There is no localhost fallback: on a physical device or emulator,
// "localhost" refers to the device itself, not the computer running the
// backend, so an unconfigured build would silently fail against a server
// that isn't there. Set the variable to your machine's LAN IP instead, e.g.
// http://192.168.1.20:5000/api (Android emulator: http://10.0.2.2:5000/api).
const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

if (!configuredBaseUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is not set. Copy mobile/.env.example to mobile/.env and point it at your backend, e.g. http://192.168.1.20:5000/api'
  );
}

export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');
