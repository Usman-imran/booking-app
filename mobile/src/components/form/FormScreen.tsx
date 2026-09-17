import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { colors, spacing } from '@/lib/theme';

type Props = ScrollViewProps & { children: React.ReactNode };

// Every form screen sits in this: the keyboard pushes the content up instead
// of covering the field being edited, taps on buttons go through while the
// keyboard is open, and the content scrolls when it is taller than the
// viewport. The header height is fed to KeyboardAvoidingView so iOS gets the
// offset right under a native-stack header.
export function FormScreen({ children, contentContainerStyle, ...rest }: Props) {
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        {...rest}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
});
