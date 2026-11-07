/**
 * Design-system primitives. Every colour, radius and font comes from the active
 * theme, so switching aesthetics restyles the whole app — not just a wallpaper.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp,
  Switch, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontFamily, useTheme } from '@/theme/ThemeProvider';
import { useSyncStatus, syncNow, dismissFailed } from '@/lib/db';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ padding: padded ? 16 : 0, paddingBottom: 48, gap: 14 }}>
      <SyncBanner />
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : <View style={{ flex: 1 }}>{body}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SyncBanner() {
  const t = useTheme();
  const s = useSyncStatus();
  if (s.online && s.failed === 0) return null;
  const msg = !s.online
    ? `Offline — ${s.pending ? `${s.pending} change${s.pending > 1 ? 's' : ''} will sync when you're back` : 'showing saved data'}`
    : `${s.failed} change${s.failed > 1 ? 's' : ''} couldn't be saved`;
  return (
    <Pressable onPress={() => (s.failed ? dismissFailed() : syncNow())}
      style={{ backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.sm, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Ionicons name={s.online ? 'alert-circle-outline' : 'cloud-offline-outline'} size={16} color={t.colors.textMuted} />
      <Txt muted size={13} style={{ flex: 1 }}>{msg}{s.failed ? ' · tap to dismiss' : ''}</Txt>
    </Pressable>
  );
}

export function Txt({ children, size = 15, weight, muted, heading, color, style, numberOfLines }: {
  children: React.ReactNode; size?: number; weight?: TextStyle['fontWeight']; muted?: boolean; heading?: boolean;
  color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} maxFontSizeMultiplier={1.6}
      style={[{ color: color ?? (muted ? t.colors.textMuted : t.colors.text), fontSize: size, fontWeight: weight ?? (heading ? '600' : '400'),
        fontFamily: fontFamily(heading ? t.font.heading : t.font.body) }, style]}>
      {children}
    </Text>
  );
}

export function Title({ children, sub, right }: { children: React.ReactNode; sub?: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Txt heading size={28} weight="600">
          {children}{t.ornaments[0] ? <Txt size={20} color={t.colors.primary}>{'  ' + t.ornaments[0]}</Txt> : null}
        </Txt>
        {sub ? <Txt muted style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt heading size={17} style={{ flex: 1 }}>{title}</Txt>
        {action ? <Pressable hitSlop={10} onPress={action.onPress} accessibilityRole="button"><Txt color={t.colors.primary} weight="600">{action.label}</Txt></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'soft' | 'alt' }) {
  const t = useTheme();
  const bg = tone === 'soft' ? t.colors.primarySoft : tone === 'alt' ? t.colors.surfaceAlt : t.colors.surface;
  const base: ViewStyle = { backgroundColor: bg, borderRadius: t.radius.md, padding: 14, borderWidth: 1, borderColor: t.colors.border, gap: 8 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable>;
}

export function Button({ label, onPress, kind = 'primary', icon, loading, disabled, small }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; loading?: boolean; disabled?: boolean; small?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.colors.primary : kind === 'secondary' ? t.colors.primarySoft : kind === 'danger' ? t.colors.danger : 'transparent';
  const fg = kind === 'primary' ? t.colors.onPrimary : kind === 'danger' ? '#FFFFFF' : t.colors.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => ({ backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderRadius: t.radius.pill,
        paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 14 : 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 })}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Txt color={fg} weight="600" size={small ? 14 : 15}>{label}</Txt>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.primarySoft }}>
      <Ionicons name={icon} size={20} color={color ?? t.colors.primary} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: t.radius.pill, flexDirection: 'row', gap: 6, alignItems: 'center',
        backgroundColor: selected ? t.colors.primary : t.colors.surface, borderWidth: 1, borderColor: selected ? t.colors.primary : t.colors.border }}>
      {icon ? <Ionicons name={icon} size={14} color={selected ? t.colors.onPrimary : t.colors.textMuted} /> : null}
      <Txt size={13} color={selected ? t.colors.onPrimary : t.colors.text}>{label}</Txt>
    </Pressable>
  );
}

export function Row({ children, gap = 8, wrap, style }: { children: React.ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label ? <Txt size={13} muted>{label}</Txt> : null}
      <TextInput placeholderTextColor={t.colors.textMuted} accessibilityLabel={label}
        {...props}
        style={[{ backgroundColor: t.colors.surface, color: t.colors.text, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.sm,
          paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, minHeight: props.multiline ? 90 : 46, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]} />
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const t = useTheme();
  return (
    <Row>
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {hint ? <Txt size={12} muted>{hint}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.colors.primary, false: t.colors.border }} accessibilityLabel={label} />
    </Row>
  );
}

export function Progress({ value, height = 8 }: { value: number; height?: number }) {
  const t = useTheme();
  const v = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={{ height, backgroundColor: t.colors.progressTrack, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height, backgroundColor: t.colors.progressFill, borderRadius: height }} />
    </View>
  );
}

export function Check({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} hitSlop={10}
      accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={label}
      style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: t.colors.primary, backgroundColor: done ? t.colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {done ? <Ionicons name="checkmark" size={16} color={t.colors.onPrimary} /> : null}
    </Pressable>
  );
}

export function Empty({ icon = 'sparkles-outline', text, action }: { icon?: IconName; text: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <Card tone="alt" style={{ alignItems: 'center', paddingVertical: 22 }}>
      <Ionicons name={icon} size={26} color={t.colors.primary} />
      <Txt muted style={{ textAlign: 'center' }}>{text}</Txt>
      {action ? <Button small kind="secondary" label={action.label} onPress={action.onPress} /> : null}
    </Card>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: t.colors.bg, borderTopLeftRadius: t.radius.lg, borderTopRightRadius: t.radius.lg, maxHeight: '88%' }}>
          <Row style={{ padding: 16, paddingBottom: 6 }}>
            <Txt heading size={19} style={{ flex: 1 }}>{title}</Txt>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 12, paddingBottom: 40 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const t = useTheme();
  const c = tone === 'neutral' ? t.colors.textMuted : tone === 'primary' ? t.colors.primary : t.colors[tone];
  return (
    <View style={{ borderRadius: t.radius.pill, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: c }}>
      <Txt size={11} color={c} weight="600">{label}</Txt>
    </View>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <Txt size={12} muted>{label}</Txt>
      <Txt heading size={22}>{value}</Txt>
      {sub ? <Txt size={12} muted>{sub}</Txt> : null}
    </Card>
  );
}

export function NavTile({ icon, label, sub, onPress }: { icon: IconName; label: string; sub?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Card onPress={onPress} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={t.colors.primary} />
      </View>
      <Txt weight="600">{label}</Txt>
      {sub ? <Txt size={12} muted numberOfLines={2}>{sub}</Txt> : null}
    </Card>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <Row wrap>{options.map((o) => <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />)}</Row>;
}
