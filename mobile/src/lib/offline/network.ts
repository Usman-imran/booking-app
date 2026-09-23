import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

// One app-wide view of connectivity, fed by a single NetInfo subscription.
//
// "Online" is deliberately optimistic: unknown (null) counts as online, and
// only an explicit false from NetInfo counts as offline. A false "offline"
// would queue an order that could have gone straight through; a false
// "online" costs one failed request, which is caught (NetworkError) and
// queued anyway. So the cheap mistake is the one to lean towards.
function toOnline(state: NetInfoState) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

let online = true;
const listeners = new Set<(online: boolean) => void>();

NetInfo.addEventListener((state) => {
  const next = toOnline(state);
  if (next === online) return;
  online = next;
  listeners.forEach((listener) => listener(next));
});

export function isOnline() {
  return online;
}

// Called with the new value on every change. Returns the unsubscribe.
export function subscribeToNetwork(listener: (online: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsOnline() {
  return useSyncExternalStore(subscribeToNetwork, isOnline);
}
