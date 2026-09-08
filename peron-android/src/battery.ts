/**
 * Ghidul de baterie (spec peron-app-tracking-always, S01). Expo n-are API pentru lista
 * albă de optimizare a bateriei, deci starea e doar «operatorul a apăsat Am făcut»
 * (`battery:done` în AsyncStorage). Scoaterea de la optimizare contează dublu: Android
 * nu mai omoară serviciul, iar pe Android 12+ lasă aplicația să pornească serviciul în
 * prim-plan din fundal (task-ul de re-armare).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

export const BATTERY_DONE_KEY = 'battery:done';
const APP_PACKAGE = Constants.expoConfig?.android?.package ?? 'md.translux.peron';

export async function isBatteryDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BATTERY_DONE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markBatteryDone(): Promise<void> {
  await AsyncStorage.setItem(BATTERY_DONE_KEY, '1');
}

/**
 * Deschide dialogul «Permite aplicației să ruleze în fundal?» pentru pachetul nostru
 * (cere REQUEST_IGNORE_BATTERY_OPTIMIZATIONS din app.json). Dacă intent-ul nu e
 * disponibil, lista de optimizare a bateriei; în ultimă instanță setările aplicației.
 */
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    await Linking.openSettings();
    return;
  }
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, { data: `package:${APP_PACKAGE}` });
    return;
  } catch (e) {
    console.warn('[battery] REQUEST_IGNORE_BATTERY_OPTIMIZATIONS indisponibil:', e);
  }
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    return;
  } catch (e) {
    console.warn('[battery] IGNORE_BATTERY_OPTIMIZATION_SETTINGS indisponibil:', e);
  }
  await Linking.openSettings();
}
