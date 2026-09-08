import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, getDay, logout } from '../src/api';
import { cleaningGateFor } from '../src/cleaning';
import { BigButton, Body, Card, Muted, Screen, Title } from '../src/components';
import { formatDateRo, localHHMM, pointLabel } from '../src/format';
import {
  flushPresenceQueue,
  getLastReading,
  getPermissionState,
  isTracking,
  isWithinWindow,
  requestPresencePermissions,
  syncPresenceTracking,
  type LastReading,
  type PermissionState,
} from '../src/presence';
import { colors, sizes } from '../src/theme';
import type { DayResponse, DayTrip } from '../src/types';

function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

const STATE_ICON: Record<DayTrip['state'], string> = { done: '✅', next: '▶', locked: '🔒' };

export default function Day() {
  const [day, setDay] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [tracking, setTracking] = useState(false);
  const [last, setLast] = useState<LastReading | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDay();
      setDay(d);
      const perm = await getPermissionState();
      setPermission(perm);
      const on = await syncPresenceTracking({ date: d.date, window: d.presenceWindow, station: d.station });
      setTracking(on);
      setLast(await getLastReading());
      flushPresenceQueue().catch(() => undefined);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) return; // api.ts a trimis deja la login
        setError(e.isOffline ? 'Fără internet. Apasă «Reîncarcă» când revine semnalul.' : e.message);
      } else {
        setError('Ceva nu a mers. Apasă «Reîncarcă».');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function askPermission() {
    const p = await requestPresencePermissions();
    setPermission(p);
    if (p === 'granted') load();
  }

  const nextTrip = day?.trips.find((t) => t.state === 'next') ?? null;
  const done = day?.trips.filter((t) => t.state === 'done').length ?? 0;

  function openTrip(trip: DayTrip) {
    if (trip.state === 'next') {
      // Poarta de curățenie (S08): prima cursă cere setul DIMINEATA, 16:25 setul ZIUA. Serverul verifică oricum.
      const gate = day ? cleaningGateFor(day, trip.id) : null;
      if (gate) {
        router.push(`/cleaning?slot=${gate.slot}&gate=${trip.departure_time}`);
        return;
      }
      router.push(`/trip/${trip.id}`);
    } else if (trip.state === 'locked') {
      toast(nextTrip ? `Completează mai întâi ora ${nextTrip.departure_time}` : 'Cursa e blocată');
    } else {
      toast(`Cursa ${trip.departure_time} e deja raportată`);
    }
  }

  function confirmLogout() {
    Alert.alert('Deconectare', 'Vei avea nevoie de un cod nou de la administrator ca să te conectezi din nou.', [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Deconectează', style: 'destructive', onPress: () => logout() },
    ]);
  }

  const inWindow = !!day?.presenceWindow && isWithinWindow(localHHMM(new Date()), day.presenceWindow);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        {day ? (
          <Title>
            ⚔ {formatDateRo(day.date)} — {pointLabel(day.point)} · Completate {done}/{day.trips.length}
          </Title>
        ) : (
          <Title>⚔ Ziua de azi</Title>
        )}

        {error ? (
          <Card tone="danger">
            <Body>{error}</Body>
          </Card>
        ) : null}

        {loading && !day ? <ActivityIndicator size="large" color={colors.primary} /> : null}

        {day && permission !== null && permission !== 'granted' ? (
          <Card tone="warning">
            <Text style={styles.cardTitle}>Fără acces la locație în fundal</Text>
            <Body>
              Urmărirea locației în timpul turei e condiție de lucru. Deschide setările, alege «Permisiuni → Locație → Permite tot timpul», apoi
              revino în aplicație.
            </Body>
            <BigButton label="Deschide setările" onPress={() => Linking.openSettings()} />
            <BigButton label="Cere permisiunea din nou" tone="neutral" onPress={askPermission} />
          </Card>
        ) : null}

        {day && permission === 'granted' ? (
          <>
            <PresenceRow tracking={tracking} inWindow={inWindow} last={last} window={day.presenceWindow} />
            <View style={styles.grid}>
              {day.trips.map((t) => (
                <TripCell key={t.id} trip={t} onPress={() => openTrip(t)} />
              ))}
            </View>
            {day.trips.length === 0 ? <Muted>Nu există curse active pentru {pointLabel(day.point)}.</Muted> : null}
            {day.point === 'CHISINAU' ? <BigButton label="📷 Poze curățenie" onPress={() => router.push('/cleaning')} big /> : null}
          </>
        ) : null}

        <BigButton label={loading ? 'Se încarcă…' : 'Reîncarcă'} tone="neutral" onPress={load} disabled={loading} />
        <View style={{ flexGrow: 1 }} />
        <Pressable onPress={confirmLogout} style={{ paddingVertical: 8 }}>
          <Muted>{day?.user.name ? `Conectat ca ${day.user.name} · ` : ''}Deconectează</Muted>
        </Pressable>
      </Screen>
    </SafeAreaView>
  );
}

function PresenceRow({
  tracking,
  inWindow,
  last,
  window,
}: {
  tracking: boolean;
  inWindow: boolean;
  last: LastReading | null;
  window: DayResponse['presenceWindow'];
}) {
  let text: string;
  let tone: 'neutral' | 'success' | 'warning' | 'danger';
  if (!window) {
    text = 'Fără curse azi · GPS oprit';
    tone = 'neutral';
  } else if (!inWindow) {
    text = `În afara turei (${window.from}–${window.to}) · GPS oprit`;
    tone = 'neutral';
  } else if (!tracking) {
    text = 'GPS oprit';
    tone = 'danger';
  } else if (last?.inZone === true) {
    text = 'În zona de lucru · GPS activ';
    tone = 'success';
  } else if (last?.inZone === false) {
    text = 'În afara zonei · GPS activ';
    tone = 'warning';
  } else {
    text = 'GPS activ · se așteaptă prima citire';
    tone = 'neutral';
  }
  return (
    <Card tone={tone} style={{ paddingVertical: 10 }}>
      <Text style={styles.presence}>📍 {text}</Text>
      {last && inWindow && tracking ? <Muted>Ultima citire {localHHMM(new Date(last.at))}</Muted> : null}
    </Card>
  );
}

function TripCell({ trip, onPress }: { trip: DayTrip; onPress: () => void }) {
  const bg = trip.state === 'done' ? colors.successBg : trip.state === 'next' ? colors.primary : colors.locked;
  const fg = trip.state === 'next' ? colors.primaryText : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Cursa ${trip.departure_time}`}
      style={({ pressed }) => [styles.cell, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[styles.cellIcon, { color: fg }]}>{STATE_ICON[trip.state]}</Text>
      <Text style={[styles.cellTime, { color: fg }]}>{trip.departure_time}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: sizes.text + 2, fontWeight: '700', color: colors.text },
  presence: { fontSize: sizes.text, fontWeight: '600', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '23%',
    minHeight: 76,
    borderRadius: sizes.radius,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellIcon: { fontSize: 20 },
  cellTime: { fontSize: sizes.text, fontWeight: '700' },
});
