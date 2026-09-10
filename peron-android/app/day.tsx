/**
 * Ecranul zilei — `Main.dc.html` (Chișinău) / `ZiuaBalti.dc.html` (Bălți), în ordinea
 * din mockup: antet, progres, banner-ul de curățenie (doar Chișinău, când lipsește setul
 * turei), grila curselor, spațiu, «Poze curățenie» / textul de la Bălți. Fără rând GPS
 * (Ion, 08.09): urmărirea merge în fundal, fără indicator pe ecran.
 * Cât timp operatorul n-a confirmat «Ultimul pas» (bateria), sub progres stă un rând de
 * reamintire cu link spre ecranul de baterie.
 * Cursa `next` cu pregătirea salvată pe telefon (src/tripDraft.ts) arată o bifă albă în
 * colț și «Urmează 07:35 · pregătită»; atingerea deschide ecranul de cursă direct la pasul 2.
 * «N-am fost la cursă» (Vitalie, 09.09: Aurel vine la 07:30 și nu poate raporta 06:55): sub
 * grilă, pentru cursa `next`, un buton de contur gri care deschide cardul cu cifra de
 * pasageri (src/SkipCard.tsx) → POST /skip → /day din nou. Cifra e obligatorie și aici
 * (Ion, 10.09); cursa sărită rămâne în grilă, gri, cu cifra sub oră. Fără poze sau GPS.
 * Zi fără operator (`dayOff`, vineri la Chișinău): textul serverului + grila, iar pentru
 * cursa `next` cardul cu cifra stă mereu deschis — și vinerea cifrele se pun (Ion, 10.09);
 * `presenceWindow` e null, deci `syncPresenceTracking` oprește urmărirea dacă rula.
 * Logica (încărcarea zilei, permisiunile, urmărirea, poarta de curățenie) e cea de dinainte.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ToastAndroid } from 'react-native';
import { ApiError, getDay } from '../src/api';
import { registerRearm } from '../src/backgroundRearm';
import { isBatteryDone } from '../src/battery';
import { cleaningGateFor, missingZones, slotForTime } from '../src/cleaning';
import { Banner, Body, Card, DayHeader, Footnote, Grid, GridCell, OutlineButton, PrimaryButton, ProgressBar, Question, Screen, Spacer } from '../src/components';
import { formatDayRo, pointLabel } from '../src/format';
import { CameraIcon } from '../src/icons';
import { flushPresenceQueue, getPermissionState, requestPresencePermissions, syncPresenceTracking, type PermissionState } from '../src/presence';
import { logout } from '../src/session';
import { SkipCard } from '../src/SkipCard';
import { colors } from '../src/theme';
import { clearDraft, clearOtherDays, loadDraft } from '../src/tripDraft';
import type { DayResponse, DayTrip, SkipResponse } from '../src/types';

function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

/** Cifra de sub oră în celula sărită: «12 pas.», «absent», «full». */
function skippedNote(trip: Pick<DayTrip, 'passengers'>): string {
  if (trip.passengers === null) return 'absent';
  if (trip.passengers === -1) return 'full';
  return `${trip.passengers} pas.`;
}

export default function Day() {
  const [day, setDay] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [batteryDone, setBatteryDone] = useState(true);
  /** Cursa `next` are ciornă de pregătire salvată azi (Chișinău). */
  const [prepared, setPrepared] = useState(false);
  /** Cardul «N-am fost la cursă» e deschis pentru cursa cu acest id (doar `next`). */
  const [skipFor, setSkipFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDay();
      setDay(d);
      const perm = await getPermissionState();
      setPermission(perm);
      // urmărirea se (re)armează singură (planul zilei → AsyncStorage → serviciul persistent);
      // pe ecran nu există indicator GPS. La zi liberă fereastra e null → serviciul se oprește.
      await syncPresenceTracking(d);
      registerRearm().catch((e) => console.warn('[day] re-armarea din fundal nu s-a înregistrat:', e));
      flushPresenceQueue().catch(() => undefined);
      setBatteryDone(await isBatteryDone());
      const next = d.trips.find((t) => t.state === 'next');
      setPrepared(d.point === 'CHISINAU' && !!next && (await loadDraft(AsyncStorage, d.date, next.id)) !== null);
      clearOtherDays(AsyncStorage, d.date).catch(() => undefined);
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
  // Progresul numără cursele închise: raportate sau sărite cu cifra.
  const done = day?.trips.filter((t) => t.state === 'done' || t.state === 'skipped').length ?? 0;
  /** Cardul cu cifra: vinerea mereu, altfel după apăsarea butonului; doar pentru cursa `next`. */
  const skipOpen = !!day && !!nextTrip && (day.dayOff || skipFor === nextTrip.id);

  function openTrip(trip: DayTrip) {
    // Vinerea nu există ecranul cursei (poze, GPS): cifra se pune în cardul de sub grilă.
    if (day?.dayOff && (trip.state === 'next' || trip.state === 'locked')) {
      toast(trip.state === 'next' ? `Pune cifra cursei ${trip.departure_time} în cardul de mai jos` : nextTrip ? `Completează mai întâi ora ${nextTrip.departure_time}` : 'Cursa e blocată');
      return;
    }
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
    } else if (trip.state === 'skipped') {
      toast(`Cursa ${trip.departure_time}: n-ai fost la ea · ${skippedNote(trip)}`);
    } else {
      toast(`Cursa ${trip.departure_time} e deja raportată`);
    }
  }

  /** Cifra a intrat: toast cu rezumatul serverului, ciorna cursei nu mai folosește, ziua se reîncarcă. */
  async function skipSaved(d: DayResponse, trip: DayTrip, res: SkipResponse) {
    setSkipFor(null);
    await clearDraft(AsyncStorage, d.date, trip.id).catch(() => undefined);
    toast(res.allDone ? `${res.summary} · toate cursele sunt închise` : res.summary);
    load();
  }

  /** 400 / 409 de la server: grila de pe server e adevărul — se spune și se reîncarcă. */
  function skipConflict(message: string) {
    setSkipFor(null);
    Alert.alert('Cursa nu a putut fi marcată', message);
    load();
  }

  function confirmLogout() {
    Alert.alert('Deconectare', 'Vei avea nevoie de un cod nou de la administrator ca să te conectezi din nou.', [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Deconectează', style: 'destructive', onPress: () => logout() },
    ]);
  }

  const now = new Date();
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

      {day && !day.dayOff ? <ProgressBar done={done} total={day.trips.length} next={nextTrip ? `${nextTrip.departure_time}${prepared ? ' · pregătită' : ''}` : null} /> : null}

      {day && !day.dayOff && permission !== null && permission !== 'granted' ? (
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

      {day?.dayOff ? (
        <>
          <Card>
            <Question>{day.dayOffText ?? 'Zi fără operator'}</Question>
            <Body>Azi nu se fac poze și locația nu se urmărește. Cifra de pasageri se pune totuși la fiecare cursă, luată de la șofer.</Body>
          </Card>
          <ProgressBar done={done} total={day.trips.length} next={nextTrip ? nextTrip.departure_time : null} />
          <Grid>
            {day.trips.map((t) => (
              <GridCell key={t.id} label={t.departure_time} state={t.state} note={t.state === 'skipped' ? skippedNote(t) : null} onPress={() => openTrip(t)} />
            ))}
          </Grid>
          {nextTrip ? (
            <SkipCard key={nextTrip.id} trip={nextTrip} dayOff onSaved={(res) => skipSaved(day, nextTrip, res)} onConflict={skipConflict} onCancel={null} />
          ) : (
            <Footnote>Toate cursele de azi au cifra. Trage în jos ca să reîncarci ziua.</Footnote>
          )}
        </>
      ) : null}

      {day && !day.dayOff && permission === 'granted' ? (
        <>
          {!batteryDone ? (
            <Pressable onPress={() => router.push('/battery')} accessibilityRole="link" hitSlop={6}>
              <Body bold="Optimizarea bateriei:" color={colors.textSoft}>
                verifică setările ›
              </Body>
            </Pressable>
          ) : null}

          {cleaning ? <Banner bold={cleaning.bold}>{cleaning.rest}</Banner> : null}

          <Grid>
            {day.trips.map((t) => (
              <GridCell
                key={t.id}
                label={t.departure_time}
                state={t.state}
                prepared={t.state === 'next' && prepared}
                note={t.state === 'skipped' ? skippedNote(t) : null}
                onPress={() => openTrip(t)}
              />
            ))}
          </Grid>
          {day.trips.length === 0 ? <Footnote>Nu există curse active pentru {pointLabel(day.point)}.</Footnote> : null}

          {nextTrip && skipOpen ? (
            <SkipCard key={nextTrip.id} trip={nextTrip} dayOff={false} onSaved={(res) => skipSaved(day, nextTrip, res)} onConflict={skipConflict} onCancel={() => setSkipFor(null)} />
          ) : nextTrip ? (
            <OutlineButton label="N-am fost la cursă" tone="neutral" height={52} color={colors.faint} onPress={() => setSkipFor(nextTrip.id)} />
          ) : null}

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
 * Până la 12:00 e vorba de setul de dimineață (obligatoriu înaintea primei curse raportate), după —
 * de setul de la 15:00 (obligatoriu înainte de cursa-poartă, 16:25).
 */
function cleaningBanner(day: DayResponse, now: Date): { bold: string; rest: string } | null {
  if (day.point !== 'CHISINAU') return null;
  const slot = slotForTime(now);
  if (missingZones(day.cleaning?.[slot] ?? []).length === 0) return null;
  if (slot === 'DIMINEATA') {
    // poarta e la prima cursă raportată efectiv (cursele sărite nu contează) — adică la `next` cât timp nu e nicio `done`
    const first = day.trips.some((t) => t.state === 'done') ? null : day.trips.find((t) => t.state === 'next')?.departure_time;
    return { bold: 'Pozele de dimineață lipsesc.', rest: first ? `Sunt obligatorii înainte de cursa ${first}.` : 'Sunt obligatorii înainte de prima cursă raportată.' };
  }
  const gate = day.cleaningGateTripTime;
  return { bold: 'Pozele de la 15:00 lipsesc.', rest: gate ? `Sunt obligatorii înainte de cursa ${gate}.` : 'Sunt obligatorii înainte de cursa de după-amiază.' };
}
