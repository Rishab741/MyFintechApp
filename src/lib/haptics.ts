import * as Haptics from 'expo-haptics';

/**
 * Shared haptic feedback vocabulary for the app — a small, named set of
 * feelings ("tap", "success", ...) instead of every screen picking its own
 * ImpactFeedbackStyle. Keeps interaction feel consistent across screens, and
 * centralizes the try/catch (some Android devices/emulators have no haptic
 * engine and throw rather than no-op).
 */
export const haptics = {
  /** Light tap — primary buttons, tab/segment switches, toggles. */
  tap() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Firmer tap — a value crossing a threshold while scrubbing a chart. */
  tick() {
    Haptics.selectionAsync().catch(() => {});
  },
  /** Completed action — brokerage connected, position saved, sign-up done. */
  success() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** Failed action — form error, failed connection, validation block. */
  warning() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
