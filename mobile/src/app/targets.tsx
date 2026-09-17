import { Stack } from 'expo-router';

import { TargetsScreen } from '@/screens/TargetsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Targets' }} />
      <TargetsScreen />
    </>
  );
}
