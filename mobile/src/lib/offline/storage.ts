import AsyncStorage from '@react-native-async-storage/async-storage';

// JSON-in-AsyncStorage, with every key scoped to one user. Each account is
// its own workspace on the server, so a phone shared by two bookers must
// never show one the other's catalogue - or, worse, sync one's queued
// orders under the other's token.
const PREFIX = 'orderBookingApp.offline';

export function userKey(userId: number | string, name: string) {
  return `${PREFIX}.${userId}.${name}`;
}

// Missing or unreadable (corrupt JSON) both come back as null: a cache
// that can't be read is simply a cache miss.
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    console.warn(`[offline] could not read ${key}:`, err);
    return null;
  }
}

// Unlike reads, write failures are thrown: for the order queue a failed
// write means an order that isn't actually saved, and the caller has to
// know.
export async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
