import { MD3LightTheme } from 'react-native-paper';

export const palette = {
  background: '#FFFFFF',
  primary: '#5A321F',
  accent: '#EC4899',
  lightPink: '#FCE7F3',
  text: '#35251F',
  muted: '#806F68',
  border: '#EFE5E1',
  surface: '#FFFDFC',
  surfacePink: '#FFF6FA',
  success: '#26856B',
  danger: '#B4233A',
};

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: palette.background,
    secondary: palette.accent,
    onSecondary: palette.background,
    background: palette.background,
    surface: palette.background,
    onSurface: palette.text,
    onBackground: palette.text,
    outline: palette.border,
    error: palette.danger,
  },
};

export const commonStyles = {
  screen: { flex: 1, backgroundColor: palette.background } as const,
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 } as const,
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderColor: palette.border,
    borderWidth: 1,
    padding: 18,
  } as const,
};
