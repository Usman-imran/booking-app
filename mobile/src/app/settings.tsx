import { Stack } from 'expo-router';

import { SettingsScreen } from '@/screens/SettingsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Settings' }} />
      <SettingsScreen />
    </>
  );
}
