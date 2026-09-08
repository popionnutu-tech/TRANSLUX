/**
 * Ecranul zilei — `Main.dc.html` (Chișinău) / `ZiuaBalti.dc.html` (Bălți), în ordinea
 * din mockup: antet, progres, rândul GPS, banner-ul de curățenie (doar Chișinău, când
 * lipsește setul turei), grila curselor, spațiu, «Poze curățenie» / textul de la Bălți.
 * Logica (încărcarea zilei, permisiunile, urmărirea, poarta de curățenie) e cea de dinainte.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ToastAndroid } from 'react-native';
import { ApiError, getDay, logout } from '../src/api';
import { cleaningGateFor, missingZones, slotForTime } from '../src/cleaning';
import { Banner, Body, Card, DayHeader, Footnote, Grid, GridCell, GpsRow, OutlineButton, PrimaryButton, ProgressBar, Question, Screen, Spacer } from '../src/components';
import { formatDayRo, localHHMM, pointLabel } from '../src/format';
import { CameraIcon } from '../src/icons';
import {
  flushPresenceQueue,
  getLastReading,
  getPermissionState,
  isWithinWindow,
  requestPresencePermissions,
  syncPresenceTracking,
  type LastReading,
  type PermissionState,
} from '../src/presence';
import { colors } from '../src/theme';
import type { DayResponse, DayTrip } from '../src/types';

function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

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
        setError(e.isOffline ? 'Fără internet. Trage în jos ca să reîncarci când revine semnalul.' : e.message);
      } else {
        setError('Ceva nu a mers. Trage în jos ca să reîncarci.');
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

  const now = new Date();
  const inWindow = !!day?.presenceWindow && isWithinWindow(localHHMM(now), day.presenceWindow);
  const cleaning = day ? cleaningBanner(day, now) : null;
  const kicker = `TRANSLUX · ${day?.point === 'BALTI' ? 'BĂLȚI' : 'CHIȘINĂU'}`;

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <DayHeader kicker={kicker} title={formatDayRo(day?.date ?? now)} right={day?.user.name ?? null} onPressRight={confirmLogout} />

      {error ? (
        <Card tone="danger">
          <Body color={colors.danger}>{error}</Body>
          <OutlineButton label={loading ? 'Se încarcă…' : 'Reîncarcă'} onPress={load} disabled={loading} tone="neutral" height={48} />
        </Card>
      ) : null}

      {loading && !day ? <ActivityIndicator size="large" color={colors.primary} /> : null}

      {day ? <ProgressBar done={done} total={day.trips.length} next={nextTrip?.departure_time ?? null} /> : null}

      {day && permission !== null && permission !== 'granted' ? (
        <Card tone="warning">
          <Question>Fără acces la locație în fundal</Question>
          <Body>
            Urmărirea locației în timpul turei e condiție de lucru. Deschide setările, alege «Permisiuni → Locație → Permite tot timpul», apoi revino în
            aplicație.
          </Body>
          <PrimaryButton label="Deschide setările" onPress={() => Linking.openSettings()} size="md" />
          <OutlineButton label="Cere permisiunea din nou" onPress={askPermission} tone="neutral" height={48} />
        </Card>
      ) : null}

      {day && permission === 'granted' ? (
        <>
          <PresenceRow tracking={tracking} inWindow={inWindow} last={last} window={day.presenceWindow} />

          {cleaning ? <Banner bold={cleaning.bold}>{cleaning.rest}</Banner> : null}

          <Grid>
            {day.trips.map((t) => (
              <GridCell key={t.id} label={t.departure_time} state={t.state} onPress={() => openTrip(t)} />
            ))}
          </Grid>
          {day.trips.length === 0 ? <Footnote>Nu există curse active pentru {pointLabel(day.point)}.</Footnote> : null}

          <Spacer />

          {day.point === 'CHISINAU' ? (
            <OutlineButton label="Poze curățenie" onPress={() => router.push('/cleaning')} icon={<CameraIcon size={24} color={colors.primary} />} />
          ) : (
            <Footnote>La Bălți se raportează doar numărul de pasageri. Locația pleacă automat.</Footnote>
          )}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Banner-ul galben din mockup: setul de curățenie al turei curente lipsește (doar Chișinău).
 * Până la 12:00 e vorba de setul de dimineață (obligatoriu înainte de prima cursă), după —
 * de setul de la 15:00 (obligatoriu înainte de cursa-poartă, 16:25).
 */
function cleaningBanner(day: DayResponse, now: Date): { bold: string; rest: string } | null {
  if (day.point !== 'CHISINAU') return null;
  const slot = slotForTime(now);
  if (missingZones(day.cleaning?.[slot] ?? []).length === 0) return null;
  if (slot === 'DIMINEATA') {
    const first = day.trips[0]?.departure_time;
    return { bold: 'Pozele de dimineață lipsesc.', rest: first ? `Sunt obligatorii înainte de cursa ${first}.` : 'Sunt obligatorii înainte de prima cursă.' };
  }
  const gate = day.cleaningGateTripTime;
  return { bold: 'Pozele de la 15:00 lipsesc.', rest: gate ? `Sunt obligatorii înainte de cursa ${gate}.` : 'Sunt obligatorii înainte de cursa de după-amiază.' };
}

/** Rândul GPS: verde în zonă, roșu în afara zonei, gri când urmărirea nu rulează. */
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
  const detail = window ? `Se urmărește pe toată tura, ${window.from}–${window.to}.` : null;
  if (!window) return <GpsRow state="off" title="Fără curse azi · GPS oprit" />;
  if (!inWindow) return <GpsRow state="off" title="În afara turei · GPS oprit" detail={detail} />;
  if (!tracking) return <GpsRow state="out" title="GPS oprit" detail={detail} />;
  if (last?.inZone === true) return <GpsRow state="in" title="În zona de lucru · GPS activ" detail={detail} />;
  if (last?.inZone === false) return <GpsRow state="out" title="În afara zonei · GPS activ" detail={detail} />;
  return <GpsRow state="off" title="GPS activ · se așteaptă prima citire" detail={detail} />;
}
