/** Haptic feedback that never throws (web, devices without a vibration motor, reduced-motion). */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const ok = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (p: () => Promise<void>) => { if (ok) p().catch(() => {}); };

export const haptic = {
  tap: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
