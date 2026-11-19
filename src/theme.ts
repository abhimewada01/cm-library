import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export const lightPalette = {
  background: '#FFF9F6',
  primary: '#5A321F',
  primaryText: '#FFFFFF',
  accent: '#B83272',
  accentBright: '#EC4899',
  lightPink: '#FCE7F3',
  softAccent: '#FCE7F3',
  text: '#35251F',
  muted: '#6D5A51',
  border: '#E8DAD3',
  surface: '#FFFFFF',
  surfacePink: '#FFF1F7',
  success: '#216B52',
  successBg: '#E8F4EE',
  warning: '#7B4A08',
  warningBg: '#FFF3D8',
  danger: '#A1253B',
  disabled: '#84766F',
  tabInactive: '#6E5B52',
} as const;

export const darkPalette = {
  background: '#171210',
  primary: '#E9AFCB',
  primaryText: '#29151F',
  accent: '#F09BC1',
  accentBright: '#FF70B4',
  lightPink: '#35212D',
  softAccent: '#35212D',
  text: '#FFF8F4',
  muted: '#D4C3BA',
  border: '#4A3931',
  surface: '#211A17',
  surfacePink: '#2B1E25',
  success: '#75D4AF',
  successBg: '#1D342C',
  warning: '#F2C678',
  warningBg: '#392E1D',
  danger: '#FF9AA7',
  disabled: '#B1A39C',
  tabInactive: '#C4B4AC',
} as const;

export type Palette = { [K in keyof typeof lightPalette]: string };

/** Backwards-compatible light colors for the existing auth and admin screens. */
export const palette = lightPalette;

export function buildPaperTheme(isDark: boolean) {
  const colors = isDark ? darkPalette : lightPalette;
  const base = isDark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      onPrimary: colors.primaryText,
      secondary: colors.accent,
      onSecondary: colors.primaryText,
      background: colors.background,
      surface: colors.surface,
      onSurface: colors.text,
      onBackground: colors.text,
      outline: colors.border,
      error: colors.danger,
    },
  };
}

export const paperTheme = buildPaperTheme(false);

export const commonStyles = {
  screen: { flex: 1, backgroundColor: lightPalette.background } as const,
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 } as const,
  card: {
    backgroundColor: lightPalette.surface,
    borderRadius: 16,
    borderColor: lightPalette.border,
    borderWidth: 1,
    padding: 18,
  } as const,
};
