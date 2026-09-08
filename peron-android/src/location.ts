/**
 * Locația curentă pentru raport și pentru pozele de curățenie (spec S07/S08):
 * `getCurrentPositionAsync` separat de urmărirea din fundal (presence.ts).
 * Citirea pornește la deschiderea ecranului, nu la «Trimite», și dă ce are după
 * maximum 15 s (ultima poziție cunoscută ≤ 2 min, altfel null). Serverul nu
 * penalizează precizia, doar distanța.
 */
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import type { Coords } from './buildReport';

export const LOCATION_TIMEOUT_MS = 15_000;
const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;

export function toCoords(loc: Location.LocationObject): Coords {
  return {
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    accuracyM: loc.coords.accuracy == null ? null : Math.max(0, Math.round(loc.coords.accuracy)),
  };
}

export async function hasForegroundPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Explicația de dinaintea re-cererii permisiunii (spec: «o re-cere la fiecare trimitere, cu explicație»). */
export function explainThenRequestPermission(what = 'raportul'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Locația lipsește',
      `Locația confirmă că ${what} e făcut la stație. Fără ea ${what} se trimite, dar se notează încălcare «locație». Permite accesul la locație la pasul următor.`,
      [
        { text: 'Trimit fără locație', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Permite',
          onPress: () => {
            Location.requestForegroundPermissionsAsync()
              .then((r) => resolve(r.granted))
              .catch(() => resolve(false));
          },
        },
      ],
      { cancelable: false },
    );
  });
}

/**
 * Citirea curentă cu precizie mare, cel mult 15 s; la expirare, ultima poziție cunoscută
 * (≤ 2 min), altfel null. Dacă citirea bună sosește după expirare, `onUpdate` o mai livrează o dată.
 */
export async function findLocation(onUpdate: (c: Coords | null) => void): Promise<void> {
  let settled = false;
  const timer = setTimeout(async () => {
    settled = true;
    let last: Location.LocationObject | null = null;
    try {
      last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    } catch {
      last = null;
    }
    onUpdate(last ? toCoords(last) : null);
  }, LOCATION_TIMEOUT_MS);
  try {
    const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    clearTimeout(timer);
    onUpdate(toCoords(cur));
  } catch {
    if (!settled) {
      clearTimeout(timer);
      onUpdate(null);
    }
  }
}

/** O singură citire, ca promisiune: prima valoare livrată de `findLocation` (poate fi null). */
export function readLocationOnce(): Promise<Coords | null> {
  return new Promise((resolve) => {
    let done = false;
    findLocation((c) => {
      if (done) return;
      done = true;
      resolve(c);
    });
  });
}
