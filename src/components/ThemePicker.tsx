import React from 'react';
import { Pressable, View } from 'react-native';
import { buildTheme, THEMES } from '@/theme/themes';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './ui';

/** Live mini-previews: each tile is rendered with that theme's real tokens. */
export function ThemePicker({ value, mode, onChange }: { value: string; mode: 'light' | 'dark'; onChange: (id: string) => void }) {
  const cur = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {THEMES.map((def) => {
        const t = buildTheme(def.id, { mode, decor: 2 });
        const selected = value === def.id;
        return (
          <Pressable key={def.id} onPress={() => onChange(def.id)} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={def.name}
            style={{ flexBasis: '47%', flexGrow: 1, borderRadius: t.radius.md, padding: 10, gap: 6, backgroundColor: t.colors.bg,
              borderWidth: selected ? 3 : 1, borderColor: selected ? cur.colors.primary : t.colors.border }}>
            <View style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.sm, padding: 8, gap: 5 }}>
              <Txt size={13} weight="700" color={t.colors.text} numberOfLines={1}>{def.name} {t.ornaments[0] ?? ''}</Txt>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: t.colors.progressTrack }}>
                <View style={{ width: '62%', height: 5, borderRadius: 3, backgroundColor: t.colors.primary }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[t.colors.primary, t.colors.secondary, t.colors.accent].map((c) => <View key={c} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c }} />)}
              </View>
            </View>
            <Txt size={11} color={t.colors.textMuted} numberOfLines={1}>{def.blurb}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
