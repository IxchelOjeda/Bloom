/**
 * react-native-web's Alert.alert is a no-op, which would silently swallow confirmations
 * ("Delete?", "Also log as expense?") and validation messages on web. Map them to browser
 * dialogs: each non-cancel button is offered in order; the first one confirmed runs.
 */
import { Alert, AlertButton, Platform } from 'react-native';

export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = (buttons ?? []).filter((b) => b.style !== 'cancel' && b.text !== 'Cancel');
    if (actions.length === 0) { window.alert(text); buttons?.[0]?.onPress?.(); return; }
    if (actions.length === 1 && (buttons ?? []).length === 1) { window.alert(text); actions[0].onPress?.(); return; }
    for (const b of actions) {
      if (window.confirm(`${text}\n\n→ ${b.text}?`)) { b.onPress?.(); return; }
    }
    (buttons ?? []).find((b) => b.style === 'cancel')?.onPress?.();
  };
}
