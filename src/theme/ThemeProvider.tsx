import React, { createContext, useContext, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { buildTheme, FontKind, Theme } from './themes';
import { usePreferences } from '@/lib/preferences';

const FONT_FAMILY: Record<FontKind, string | undefined> = Platform.select({
  ios: { sans: undefined, serif: 'Georgia', rounded: 'Avenir Next', mono: 'Menlo', display: 'Didot' },
  android: { sans: undefined, serif: 'serif', rounded: 'sans-serif-medium', mono: 'monospace', display: 'serif' },
  default: { sans: undefined, serif: 'Georgia, serif', rounded: 'ui-rounded, system-ui', mono: 'ui-monospace, monospace', display: 'Georgia, serif' },
})!;

export const fontFamily = (k: FontKind) => FONT_FAMILY[k];

const Ctx = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const { prefs } = usePreferences();
  const theme = useMemo(() => {
    const mode = prefs.theme_mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : prefs.theme_mode;
    return buildTheme(prefs.theme_id, { mode, decor: prefs.decor_intensity, custom: prefs.custom_colors });
  }, [prefs.theme_id, prefs.theme_mode, prefs.decor_intensity, prefs.custom_colors, system]);
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
