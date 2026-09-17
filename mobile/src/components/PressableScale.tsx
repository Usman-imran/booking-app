import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

// Pressable with the touch feedback every tappable card and button in the
// app shares: a slight dim + shrink while pressed. Kept as one component so
// the feel stays consistent instead of each screen inventing its own.
export function PressableScale({ style, children, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [style, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      {children}
    </Pressable>
  );
}
