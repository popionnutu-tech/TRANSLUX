/**
 * Ecranul de cursă — `Cursa.dc.html` (Chișinău) / `CursaBalti.dc.html` (Bălți), element cu
 * element. La Chișinău cursa se fixează în două etape (Ion, 09.09: «operatorul de peron nu
 * dovedește la sfârșit să facă poza»):
 * - pasul 1 «Pregătire», când mașina e la peron: Șofer și auto (nume, placă mono,
 *   Confirm/Schimbă), Poza șoferului (miniatură 104×128, trei verdicte fixe ale modelului —
 *   uniformă, bărbierit, aspect — verzi/roșii, fără atingere; «Refă poza»), Verificări,
 *   rândul GPS, «Pregătit, aștept plecarea». Ciorna se salvează pe telefon
 *   (src/tripDraft.ts, `trip:draft:<date>:<tripId>`) și supraviețuiește închiderii aplicației;
 * - pasul 2 «Plecare»: rezumatul pregătirii într-un rând, Pasageri mare (ca la Bălți, cu
 *   butoanele rapide), «Microbuzul a fost absent», GPS luat din nou, «Trimite raportul»,
 *   link «Modifică pregătirea». O cursă deschisă cu ciornă pornește direct la pasul 2.
 * «Absent» se trimite din oricare pas, fără poză și fără ciornă. La server pleacă un singur
 * POST /report, la pasul 2, cu același corp ca înainte (bodyFromDraft = buildReportBody).
 * Verdictul e al modelului (Ion, 08.09: «aplicația fixează, operatorul doar face poza»):
 * la `REFA_POZA` / `NO_PERSON` apare mesajul serverului și «Refă poza».
 * Poza șoferului e o dată pe zi (Ion, 09.09): dacă /day are `driverChecks[driverId]`, cardul
 * arată verdictele de azi + «Poză făcută azi la HH:MM», «Pregătit» merge fără poză nouă, iar
 * «Refă poza» rămâne opțional; `driverCheckId` din /day pleacă în ciornă și în raport.
 * La Bălți nu există etape: Pasageri cu butoanele rapide, «Absent» / «Microbuzul full», GPS, Trimite, text.
 * «N-am fost la cursă» (Vitalie, 09.09): sub antet, cât timp cursa `next` n-are ciornă (nu s-a
 * apăsat «Pregătit») — confirmare, POST /skip, înapoi la zi. Fără cifră, poze sau GPS.
 *
 * Logica (src/buildReport.ts, camera, locația, apelurile API) e cea de dinainte — aici
 * doar prezentarea și trecerea între pași.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, getDay, postDriverPhoto, postReport, postSkip, postVehicle } from '../../src/api';
import {
  blockingReason,
  buildReportBody,
  clampPassengers,
  climateKindFor,
  initialState,
  isTodayPhoto,
  LATE_THRESHOLD_MIN,
  minutesLate,
  missionDoneText,
  needsQuality,
  openReclamaFor,
  photoForDriver,
  plateOf,
  preparationReason,
  QUICK_PASSENGERS,
  todayCheckFor,
  tripContext,
  withPhoto,
  type Coords,
  type DriverPhotoState,
  type TripContext,
  type TripFormState,
} from '../../src/buildReport';
import { bodyFromDraft, clearDraft, clearOtherDays, draftFromState, draftSummary, formFromDraft, loadDraft, saveDraft, type TripDraft } from '../../src/tripDraft';
import { DRIVER_FRAME_HINT, PhotoCamera, type CapturedPhoto } from '../../src/camera';
import { Body, Card, Footnote, GpsRow, Header, Label, Option, OptionRow, OutlineButton, Pill, PrimaryButton, Question, Screen, Spacer, type GpsState } from '../../src/components';
import { haversineDistance } from '../../src/format';
import { CameraIcon, CheckIcon, PersonIcon, XIcon } from '../../src/icons';
import { explainThenRequestPermission, findLocation, hasForegroundPermission } from '../../src/location';
import { colors, font, radius, weight } from '../../src/theme';
import type { CleaningRequiredDetails, DayResponse, DayTrip } from '../../src/types';

/** Cursa și Curățenia au 24 jos în mockup (ziua are 20). */
const SCREEN_PADDING = { bottom: 24 };

// ── Lista derulantă (șoferi / auto) — stare fără mockup, în stilul opțiunilor ────

interface PickItem {
  id: string;
  label: string;
}

function PickerModal({
  title,
  items,
  selectedId,
  noneLabel,
  onSelect,
  onClose,
  footer,
}: {
  title: string;
  items: PickItem[];
  selectedId: string | null;
  noneLabel?: string | null; // lipsă = fără opțiunea «fără» (Ion, 09.09: șoferul e obligatoriu)
  onSelect: (id: string | null) => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const data: PickItem[] = noneLabel ? [{ id: '', label: noneLabel }, ...items] : items;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen scroll={false} padding={SCREEN_PADDING}>
        <Header title={title} onBack={onClose} />
        <FlatList
          style={{ flex: 1 }}
          data={data}
          keyExtractor={(i) => i.id || '__none__'}
          contentContainerStyle={{ gap: 8 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Option label={item.label} selected={(item.id || null) === selectedId} onPress={() => onSelect(item.id || null)} style={styles.pickRow} />}
          ListFooterComponent={footer ? <View style={{ paddingTop: 14 }}>{footer}</View> : null}
        />
      </Screen>
    </Modal>
  );
}

// ── Ecranul ───────────────────────────────────────────────────────────────────

/** Când serverul nu trimite `message` la refacere (client nou pe server vechi). */
const RETAKE_FALLBACK = `Refă poza. ${DRIVER_FRAME_HINT}`;

type ScreenError = { message: string; cleaning?: CleaningRequiredDetails };

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === 'string' ? id : '';

  const [day, setDay] = useState<DayResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<DayResponse['vehicles']>([]);
  const [form, setForm] = useState<TripFormState | null>(null);
  const [changing, setChanging] = useState(false); // «Schimbă» apăsat
  const [picker, setPicker] = useState<'driver' | 'vehicle' | null>(null);
  const [newPlate, setNewPlate] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [camera, setCamera] = useState(false);
  const [pending, setPending] = useState<CapturedPhoto | null>(null); // poză făcută, încă nejudecată de server
  const [rejected, setRejected] = useState<{ uri: string; message: string } | null>(null); // NO_PERSON / REFA_POZA: poza + de ce
  const [analyzing, setAnalyzing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [searching, setSearching] = useState(true);
  const [sending, setSending] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<ScreenError | null>(null);
  const [now, setNow] = useState(() => new Date());
  /** Pasul (doar Chișinău): 1 = pregătirea, 2 = plecarea. null până se știe dacă există ciornă. */
  const [step, setStep] = useState<1 | 2 | null>(null);
  const [draft, setDraft] = useState<TripDraft | null>(null);

  const trip: DayTrip | null = useMemo(() => day?.trips.find((t) => t.id === tripId) ?? null, [day, tripId]);
  const ctx: TripContext | null = useMemo(() => {
    if (!day) return null;
    return { ...tripContext(day, tripId), vehicles };
  }, [day, tripId, vehicles]);

  // /day → cursa; doar cursa `next` se raportează (serverul refuză oricum cu 409).
  // Cu ciornă salvată pentru azi, ecranul pornește la pasul 2 cu formularul refăcut din ea.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getDay();
        if (!alive) return;
        const t = d.trips.find((x) => x.id === tripId);
        if (!t) {
          setLoadError('Cursa nu mai există în ziua de azi.');
          return;
        }
        if (t.state !== 'next') {
          const next = d.trips.find((x) => x.state === 'next');
          setLoadError(
            t.state === 'done'
              ? `Cursa ${t.departure_time} e deja raportată.`
              : t.state === 'skipped'
                ? `Cursa ${t.departure_time}: ai marcat că n-ai fost la ea.`
                : next
                  ? `Completează mai întâi ora ${next.departure_time}.`
                  : 'Cursa e blocată.',
          );
          return;
        }
        const c = tripContext(d, tripId);
        const saved = d.point === 'CHISINAU' ? await loadDraft(AsyncStorage, d.date, tripId) : null;
        if (!alive) return;
        setDay(d);
        setVehicles(d.vehicles);
        if (saved) {
          const a = c.assignment;
          setDraft(saved);
          setForm(formFromDraft(saved));
          setChanging(!!a && (a.driver_id !== saved.driverId || (a.vehicle_id ?? null) !== saved.vehicleId));
          setStep(2);
        } else {
          setForm(initialState(c));
          setStep(1);
        }
        clearOtherDays(AsyncStorage, d.date).catch(() => undefined);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) return; // api.ts a trimis deja la login
        setLoadError(e instanceof ApiError && e.isOffline ? 'Fără internet. Revino când e semnal.' : 'Nu s-a putut încărca cursa.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [tripId]);

  // Locația pornește fără nicio acțiune a operatorului: la pasul 1 și din nou la plecare
  // (pasul 2) — raportul pleacă cu poziția de acum, nu cu cea de la pregătire.
  useEffect(() => {
    if (step === null) return;
    let alive = true;
    (async () => {
      if (!(await hasForegroundPermission())) {
        if (alive) setSearching(false);
        return;
      }
      if (alive) setSearching(true);
      await findLocation((c) => {
        if (!alive) return;
        setCoords((prev) => c ?? prev);
        setSearching(false);
      });
    })();
    return () => {
      alive = false;
    };
  }, [step]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const update = useCallback((patch: Partial<TripFormState>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }, []);

  // ── Poza șoferului ──
  const analyze = useCallback(
    async (photo: CapturedPhoto, driverId: string | null) => {
      if (!ctx) return;
      setAnalyzing(true);
      setPhotoError(null);
      try {
        const res = await postDriverPhoto({ tripId: ctx.tripId, driverId, imageBase64: photo.base64, lat: coords?.lat ?? null, lon: coords?.lon ?? null });
        // Poza trebuie refăcută (nimeni în cadru / nu se văd încălțămintea și capul): serverul n-a scris nimic.
        if (res.code || res.verdict === 'NO_PERSON' || res.verdict === 'REFA_POZA' || !res.driverCheckId) {
          setPending(null);
          setRejected({ uri: photo.uri, message: res.message?.trim() || RETAKE_FALLBACK });
          return;
        }
        const state: DriverPhotoState = {
          driverCheckId: res.driverCheckId,
          uri: photo.uri,
          verdict: res.verdict,
          uniformOk: res.uniformOk,
          shavedOk: res.shavedOk,
          groomedOk: res.groomedOk,
          description: res.description,
        };
        setPending(null);
        setRejected(null);
        setForm((f) => (f ? withPhoto(f, state) : f));
      } catch (e) {
        // poza rămâne pe ecran: «Trimite din nou poza» fără să o refacă
        if (e instanceof ApiError && e.status === 401) return;
        setPhotoError(e instanceof ApiError && e.isOffline ? 'Fără internet. Poza rămâne aici — apasă «Trimite din nou poza» când revine semnalul.' : e instanceof ApiError ? e.message : 'Poza nu a putut fi trimisă.');
      } finally {
        setAnalyzing(false);
      }
    },
    [ctx, coords],
  );

  function onCaptured(photo: CapturedPhoto) {
    setCamera(false);
    setRejected(null);
    setPending(photo);
    if (form) analyze(photo, form.driverId);
  }

  function retakePhoto() {
    setPending(null);
    setRejected(null);
    setPhotoError(null);
    setForm((f) => (f ? withPhoto(f, null) : f));
    setCamera(true);
  }

  /** «Renunță» în cameră: dacă șoferul are poza de azi și n-a rămas nimic pe card, ea revine — refacerea e opțională. */
  function cancelCamera() {
    setCamera(false);
    if (!ctx) return;
    setForm((f) => (f && !f.photo && !pending && !rejected ? withPhoto(f, photoForDriver(ctx, f.driverId)) : f));
  }

  // ── Șofer / auto ──
  function chooseDriver(driverId: string | null) {
    setPicker(null);
    if (!form || !ctx || driverId === form.driverId) return;
    // poza e legată de șoferul ales — alt șofer = altă poză (sau poza lui de azi, dacă există)
    const todayPhoto = photoForDriver(ctx, driverId);
    const hadPhoto = !!form.photo || !!pending;
    setPending(null);
    setRejected(null);
    setPhotoError(hadPhoto && !todayPhoto ? 'Șoferul s-a schimbat — refă poza șoferului.' : null);
    setForm((f) => (f ? withPhoto({ ...f, driverId }, todayPhoto) : f));
  }

  function chooseVehicle(vehicleId: string | null) {
    setPicker(null);
    update({ vehicleId, reclama: 'ok', repair: null, climate: 'works' });
  }

  /** «Confirm»: înapoi la repartizarea din /day (după «Schimbă»). */
  function confirmAssignment() {
    const a = ctx?.assignment;
    if (!a) return;
    setChanging(false);
    chooseVehicle(a.vehicle_id);
    chooseDriver(a.driver_id);
  }

  async function addVehicle() {
    const plate = newPlate.trim().toUpperCase().replace(/\s/g, '');
    if (plate.length < 4 || addingVehicle) return;
    setAddingVehicle(true);
    try {
      const res = await postVehicle(plate);
      setVehicles((list) => (list.some((v) => v.id === res.id) ? list : [...list, { id: res.id, plate: res.plate_number }]));
      setNewPlate('');
      chooseVehicle(res.id);
    } catch (e) {
      Alert.alert('Auto', e instanceof ApiError ? e.message : 'Nu s-a putut adăuga mașina.');
    } finally {
      setAddingVehicle(false);
    }
  }

  // ── Pasul 1 → 2: «Pregătit, aștept plecarea» — ciorna pe telefon, nimic la server ──
  async function prepare() {
    if (!ctx || !form || !day || sending) return;
    const d = draftFromState(ctx, form, new Date());
    if (!d) return;
    try {
      await saveDraft(AsyncStorage, day.date, ctx.tripId, d);
    } catch (e) {
      // fără spațiu / stocare stricată: pasul 2 merge oricum, doar că nu supraviețuiește închiderii
      console.warn('[trip] ciorna nu s-a salvat:', e);
    }
    setDraft(d);
    setError(null);
    setStep(2);
  }

  /** «Modifică pregătirea»: înapoi la pasul 1 cu formularul de acum (refăcut din ciornă la deschidere). */
  function editPreparation() {
    setError(null);
    setStep(1);
  }

  // ── «N-am fost la cursă» — fără cifră, poze sau GPS; doar cât timp nu există ciornă ──
  function confirmSkip() {
    if (!ctx || !day || !trip || sending || skipping) return;
    Alert.alert('N-am fost la cursă', `Marchezi cursa ${trip.departure_time} ca nefăcută de tine? Nu se cere cifră, nici poze.`, [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Da, n-am fost', style: 'destructive', onPress: () => skip() },
    ]);
  }

  async function skip() {
    if (!ctx || !day || !trip) return;
    setSkipping(true);
    setError(null);
    try {
      await postSkip(ctx.tripId);
      await clearDraft(AsyncStorage, day.date, ctx.tripId).catch(() => undefined);
      router.replace('/day');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // api.ts a trimis la login
      if (e instanceof ApiError && (e.code === 'NOT_NEXT' || e.code === 'ALREADY_REPORTED' || e.code === 'ALREADY_SKIPPED' || e.code === 'DAY_OFF')) {
        // grila de pe server s-a schimbat între timp — ziua e adevărul
        Alert.alert('Cursa nu poate fi marcată', e.message, [{ text: 'OK', onPress: () => router.replace('/day') }], { cancelable: false });
        return;
      }
      setError({ message: e instanceof ApiError ? (e.isOffline ? 'Fără internet. Încearcă din nou când revine semnalul.' : e.message) : 'Ceva nu a mers. Încearcă din nou.' });
    } finally {
      setSkipping(false);
    }
  }

  // ── Trimite ──
  async function send() {
    if (!ctx || !form || !day || !trip || sending) return;
    setError(null);
    setSending(true);
    try {
      let c = coords;
      if (!c) {
        // re-cerem permisiunea cu explicație; dacă o dă, mai încercăm o citire (≤ 15 s)
        const granted = (await hasForegroundPermission()) || (await explainThenRequestPermission());
        if (granted) {
          setSearching(true);
          await new Promise<void>((resolve) => {
            findLocation((got) => {
              if (got) c = got;
              resolve();
            });
          });
          setSearching(false);
          if (c) setCoords(c);
        }
      }
      // La pasul 2 corpul vine din ciornă + cifră + GPS-ul de acum (identic cu buildReportBody
      // pentru aceeași stare — tripDraft.test.ts). Absent / Full / Bălți / fără ciornă: ca înainte.
      const body = step === 2 && draft && form.status === 'OK' && form.passengers !== null ? bodyFromDraft(ctx.tripId, draft, form.passengers, c) : buildReportBody(ctx, form, c);
      const res = await postReport(body);
      await clearDraft(AsyncStorage, day.date, ctx.tripId).catch(() => undefined);
      const text = res.allDone ? `${res.summary}\n\n${missionDoneText(day.trips.length)}` : res.summary;
      Alert.alert('Raport trimis', text, [{ text: 'OK', onPress: () => router.replace('/day') }], { cancelable: false });
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setError({ message: 'Ceva nu a mers. Apasă din nou «Trimite raportul».' });
      } else if (e.status === 401) {
        return; // api.ts a trimis la login
      } else if (e.isOffline) {
        setError({ message: 'Fără internet. Datele rămân aici, apasă din nou când revine semnalul.' });
      } else if (e.code === 'CLEANING_REQUIRED') {
        const details = e.details as Partial<CleaningRequiredDetails>;
        setError({
          message: `Înainte de cursa ${trip.departure_time} trebuie pozele de curățenie${details.missing?.length ? ` (${details.missing.join(', ')})` : ''}.`,
          cleaning: { slot: details.slot ?? 'DIMINEATA', missing: details.missing ?? [] },
        });
      } else if (e.code === 'NOT_NEXT' || e.code === 'ALREADY_REPORTED') {
        // cursa e deja în bază — ciorna ei nu mai folosește nimănui
        if (e.code === 'ALREADY_REPORTED') await clearDraft(AsyncStorage, day.date, ctx.tripId).catch(() => undefined);
        Alert.alert('Cursa nu poate fi raportată', e.message, [{ text: 'OK', onPress: () => router.replace('/day') }], { cancelable: false });
      } else {
        setError({ message: e.message });
      }
    } finally {
      setSending(false);
    }
  }

  // ── Randare ──
  const back = () => router.replace('/day');

  if (loadError) {
    return (
      <Screen padding={SCREEN_PADDING}>
        <Header title="Cursa" onBack={back} />
        <Card tone="warning">
          <Body>{loadError}</Body>
        </Card>
        <PrimaryButton label="Înapoi la ziua de azi" onPress={back} size="md" />
      </Screen>
    );
  }
  if (!day || !trip || !ctx || !form || step === null) {
    return (
      <Screen padding={SCREEN_PADDING}>
        <Header title="Cursa" onBack={back} />
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  const balti = ctx.point === 'BALTI';
  const preparing = !balti && step === 1; // pasul 1: șofer, poză, verificări — fără cifră
  const departing = !balti && step === 2; // pasul 2: cifra + Trimite
  const late = minutesLate(now, trip.departure_time);
  const distanceM = coords ? haversineDistance(coords.lat, coords.lon, day.station.lat, day.station.lon) : null;
  const quality = needsQuality(ctx, form);
  const prepReason = preparationReason(ctx, form);
  const reason = blockingReason(ctx, form);
  const assignment = ctx.assignment;
  const showPickers = changing || !assignment;
  const driverName = !balti ? day.drivers.find((d) => d.id === form.driverId)?.name ?? (assignment && assignment.driver_id === form.driverId ? assignment.driver_name : null) : null;
  const plate = plateOf(ctx, form.vehicleId);
  const openTask = openReclamaFor(ctx, form.vehicleId);
  const climateKind = climateKindFor(ctx, form.vehicleId);
  const counting = form.status === 'OK';
  const bigCounter = balti || departing; // câmp 96 / cifra 52 / butoanele rapide, ca la Bălți
  const thumbUri = form.photo?.uri || pending?.uri || rejected?.uri || null;
  const summary = departing && draft ? draftSummary(draft, { driverName, plate }) : null;
  // poza de azi din /day (o dată pe zi per șofer): fără miniatură locală, verdictele așa cum le ține DB-ul
  const todayCheck = todayCheckFor(ctx, form.driverId);
  const reusedPhoto = !!form.photo && isTodayPhoto(ctx, form);

  const gps: { state: GpsState; text: string } = searching
    ? { state: 'off', text: 'se caută locația…' }
    : distanceM === null
      ? { state: 'out', text: 'fără locație · raportul pleacă fără GPS' }
      : distanceM <= day.station.radiusM
        ? { state: 'in', text: `la ${Math.round(distanceM)} m de stație · locație confirmată automat` }
        : { state: 'out', text: `la ${Math.round(distanceM)} m de stație · în afara zonei stației` };

  const toggleStatus = (s: 'ABSENT' | 'FULL') => update({ status: form.status === s ? 'OK' : s });

  /** «Microbuzul a fost absent» / «Microbuzul full» (Chișinău) — în cardul Pasageri sau singur la pasul 1. */
  const statusRow = (
    <View style={styles.statusRow}>
      <OutlineButton label="Microbuzul a fost absent" tone="neutral" height={48} color={colors.muted} selected={form.status === 'ABSENT'} selectedTone="danger" onPress={() => toggleStatus('ABSENT')} style={styles.grow} />
      {day.allowFull ? <OutlineButton label="Microbuzul full" tone="neutral" height={48} color={colors.muted} selected={form.status === 'FULL'} onPress={() => toggleStatus('FULL')} style={styles.grow} /> : null}
    </View>
  );

  return (
    <>
      <Screen padding={SCREEN_PADDING}>
        <Header title={`Cursa ${trip.departure_time}`} subtitle={balti ? trip.route_name : null} onBack={back} right={late > LATE_THRESHOLD_MIN ? <Pill>întârziere {late} min</Pill> : null} />

        {/* «N-am fost la cursă» — doar cât timp nu există ciornă (pregătirea făcută = operatorul a fost) */}
        {!draft ? <OutlineButton label={skipping ? 'Se marchează…' : 'N-am fost la cursă'} tone="neutral" height={52} color={colors.faint} onPress={confirmSkip} disabled={skipping || sending} /> : null}

        {/* Pasul 2: rezumatul pregătirii într-un rând + «Modifică pregătirea» */}
        {departing ? (
          <Card>
            <Label>Pregătire</Label>
            {summary ? <Body>{summary}</Body> : null}
            <Pressable onPress={editPreparation} accessibilityRole="link" hitSlop={6} style={styles.linkRow}>
              <Text style={styles.link}>Modifică pregătirea ›</Text>
            </Pressable>
          </Card>
        ) : null}

        {/* Pasageri — la Bălți și la plecare; pregătirea nu cere cifra, doar «Absent» */}
        {preparing ? (
          statusRow
        ) : (
          <Card>
            <Label>Pasageri</Label>
            <View style={styles.counter}>
              <CounterButton label="−" big={bigCounter} disabled={!counting} onPress={() => update({ passengers: clampPassengers((form.passengers ?? 0) - 1) })} />
              <TextInput
                value={form.passengers === null ? '' : String(form.passengers)}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '');
                  update({ passengers: digits === '' ? null : clampPassengers(Number(digits)) });
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={colors.border}
                editable={counting}
                style={[styles.counterField, bigCounter ? styles.counterFieldBig : null, counting ? null : styles.dimmed]}
                accessibilityLabel="Numărul de pasageri"
              />
              <CounterButton label="+" big={bigCounter} disabled={!counting} onPress={() => update({ passengers: clampPassengers((form.passengers ?? 0) + 1) })} />
            </View>
            {bigCounter ? (
              <View style={styles.quickRow}>
                {QUICK_PASSENGERS.map((n) => {
                  const selected = counting && form.passengers === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => update({ passengers: n })}
                      disabled={!counting}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [styles.quick, selected ? styles.quickSelected : null, { opacity: !counting ? 0.45 : pressed ? 0.7 : 1 }]}
                    >
                      <Text style={[styles.quickText, selected ? styles.quickTextSelected : null]}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {balti ? null : statusRow}
          </Card>
        )}

        {balti ? (
          <View style={styles.statusRow}>
            <OutlineButton label="Absent" tone="neutral" height={56} fontSize={16} fontWeight={700} borderRadius={radius.button} selected={form.status === 'ABSENT'} selectedTone="danger" onPress={() => toggleStatus('ABSENT')} style={styles.grow} />
            {day.allowFull ? (
              <OutlineButton label="Microbuzul full" tone="neutral" height={56} fontSize={16} fontWeight={700} borderRadius={radius.button} selected={form.status === 'FULL'} onPress={() => toggleStatus('FULL')} style={styles.grow} />
            ) : null}
          </View>
        ) : null}

        {/* Șofer și auto — doar la pregătire */}
        {quality && preparing ? (
          <Card>
            <Label>{assignment && !changing ? 'Șofer și auto · din repartizare' : 'Șofer și auto'}</Label>
            <View style={{ gap: 4 }}>
              <Text style={styles.driverName}>{driverName ?? 'Alege șoferul'}</Text>
              <Text style={styles.plate}>{plate ?? 'Fără auto'}</Text>
            </View>
            {assignment ? (
              <OptionRow>
                <Option label="Confirm" selected={!changing} onPress={confirmAssignment} />
                <Option label="Schimbă" selected={changing} onPress={() => setChanging(true)} />
              </OptionRow>
            ) : null}
            {showPickers ? (
              <View style={{ gap: 8 }}>
                <OutlineButton label="Alege șoferul" tone="neutral" height={48} onPress={() => setPicker('driver')} />
                <OutlineButton label="Alege auto" tone="neutral" height={48} onPress={() => setPicker('vehicle')} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Poza șoferului — doar la pregătire */}
        {quality && preparing ? (
          <Card>
            <Label>Poza șoferului · verdict automat</Label>
            <View style={styles.photoRow}>
              <View style={styles.thumb}>{thumbUri ? <Image source={{ uri: thumbUri }} style={styles.thumbImage} accessibilityLabel="Poza șoferului" /> : <PersonIcon />}</View>
              <View style={styles.photoSide}>
                {analyzing ? (
                  <View style={styles.analyzing}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.analyzingText}>Se analizează poza…</Text>
                  </View>
                ) : form.photo && reusedPhoto ? (
                  <>
                    {/* DB-ul ține bărbierit && aspect într-un singur câmp — un singur verdict pentru amândouă */}
                    <VerdictRow label="Uniformă" value={form.photo.uniformOk} />
                    <VerdictRow label="Bărbierit și aspect" value={form.photo.groomedOk} />
                  </>
                ) : form.photo ? (
                  <>
                    <VerdictRow label="Uniformă" value={form.photo.uniformOk} />
                    <VerdictRow label="Bărbierit" value={form.photo.shavedOk} />
                    <VerdictRow label="Aspect îngrijit" value={form.photo.groomedOk} />
                  </>
                ) : pending ? (
                  <PrimaryButton label="Trimite din nou poza" size="md" shadow={false} onPress={() => analyze(pending, form.driverId)} />
                ) : (
                  <PrimaryButton label={rejected ? 'Refă poza' : 'Fă poza'} size="md" shadow={false} icon={<CameraIcon color={colors.primaryText} />} onPress={() => setCamera(true)} />
                )}
              </View>
            </View>
            {rejected && !analyzing ? <Body color={colors.danger}>{rejected.message}</Body> : null}
            {photoError ? <Body color={colors.danger}>{photoError}</Body> : null}
            {(form.photo || pending) && !analyzing ? (
              <View style={styles.photoFooter}>
                {form.photo ? (
                  <Text style={styles.photoNote}>
                    {reusedPhoto && todayCheck
                      ? `Poză făcută azi la ${todayCheck.at} — valabilă la toate cursele lui de azi. Poți reface poza.`
                      : form.photo.verdict === 'EROARE'
                        ? 'Modelul nu a putut judeca poza — raportul pleacă fără verdicte. Poți reface poza.'
                        : 'Verdict automat din poză. Nu se poate schimba.'}
                  </Text>
                ) : (
                  <View style={styles.grow} />
                )}
                <OutlineButton label="Refă poza" tone="neutral" height={44} onPress={retakePhoto} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Verificări — doar la pregătire */}
        {quality && preparing ? (
          <Card>
            <Label>Verificări · totul e bifat OK, schimbă doar ce nu e</Label>

            <Question>Ajută la încărcat?</Question>
            <OptionRow>
              <Option label="Da" selected={form.loadingHelpOk} onPress={() => update({ loadingHelpOk: true })} />
              <Option label="Nu" selected={!form.loadingHelpOk} onPress={() => update({ loadingHelpOk: false })} />
            </OptionRow>

            <Question>Auto exterior curat?</Question>
            <OptionRow>
              <Option label="Da" selected={form.autoCurat} onPress={() => update({ autoCurat: true })} />
              <Option label="Nu" selected={!form.autoCurat} onPress={() => update({ autoCurat: false })} />
            </OptionRow>

            {form.vehicleId ? (
              <>
                <Question>Reclamă</Question>
                <View style={{ gap: 8 }}>
                  <OptionRow>
                    <Option label="Totul OK" selected={form.reclama === 'ok'} onPress={() => update({ reclama: 'ok' })} />
                    <Option label="Doar autobuz" selected={form.reclama === 'bus'} onPress={() => update({ reclama: 'bus', repair: null })} />
                  </OptionRow>
                  <OptionRow>
                    <Option label="Doar panou rută" selected={form.reclama === 'panou_ruta'} onPress={() => update({ reclama: 'panou_ruta', repair: null })} />
                    <Option label="Ambele" selected={form.reclama === 'ambele'} onPress={() => update({ reclama: 'ambele', repair: null })} />
                  </OptionRow>
                </View>
                {form.reclama === 'ok' && openTask ? (
                  <Card tone="warning">
                    <Body bold="Era marcat defect:">{openTask.description.replace(/\.\s*$/, '')}. A fost reparat?</Body>
                    <OptionRow>
                      <Option label="Da, reparat" selected={form.repair === 'da'} onPress={() => update({ repair: 'da' })} />
                      <Option label="Nu, încă defect" selected={form.repair === 'nu'} onPress={() => update({ repair: 'nu' })} />
                    </OptionRow>
                  </Card>
                ) : null}
              </>
            ) : null}

            {climateKind ? (
              <>
                <Question>Clima în salon</Question>
                <OptionRow>
                  <Option label="Funcționează" selected={form.climate === 'works'} onPress={() => update({ climate: 'works' })} />
                  <Option label="Stricat" selected={form.climate === 'broken'} onPress={() => update({ climate: 'broken' })} />
                  <Option label="Nu are" selected={form.climate === 'none'} onPress={() => update({ climate: 'none' })} />
                </OptionRow>
                <Footnote align="left">Vara întreabă de aerul condiționat, din noiembrie de căldură. O dată pe lună pentru fiecare auto; în restul anului rândul nu apare.</Footnote>
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Locația — fără niciun buton, pleacă singură */}
        <GpsRow state={gps.state} title={gps.text} />

        {error ? (
          <Card tone="danger">
            <Body color={colors.danger}>{error.message}</Body>
            {error.cleaning ? (
              <PrimaryButton label="Poze curățenie" size="md" shadow={false} icon={<CameraIcon color={colors.primaryText} />} onPress={() => router.push(`/cleaning?slot=${error.cleaning?.slot ?? ''}&gate=${trip.departure_time}`)} />
            ) : null}
          </Card>
        ) : null}

        {preparing && counting ? (
          <>
            <PrimaryButton label="Pregătit, aștept plecarea" onPress={prepare} disabled={!!prepReason || analyzing} />
            {prepReason ? <Footnote>{prepReason}</Footnote> : <Footnote>Cifra de pasageri o introduci la plecare.</Footnote>}
          </>
        ) : (
          <>
            <PrimaryButton label={sending ? 'Se trimite…' : 'Trimite raportul'} onPress={send} disabled={!!reason || sending || analyzing} />
            {reason ? <Footnote>{reason}</Footnote> : null}
          </>
        )}

        {balti ? (
          <>
            <Spacer />
            <Footnote>Fără șofer, auto sau verificări: la Bălți se numără doar pasagerii. Două atingeri per cursă.</Footnote>
          </>
        ) : null}
      </Screen>

      {camera ? <PhotoCamera title="Poza șoferului" hint={DRIVER_FRAME_HINT} onCaptured={onCaptured} onCancel={cancelCamera} /> : null}
      {picker === 'driver' ? (
        <PickerModal
          title="Șoferul"
          items={day.drivers.map((d) => ({ id: d.id, label: d.name }))}
          selectedId={form.driverId}
          onSelect={chooseDriver}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === 'vehicle' ? (
        <PickerModal
          title="Auto"
          items={vehicles.map((v) => ({ id: v.id, label: v.plate }))}
          selectedId={form.vehicleId}
          noneLabel="Fără auto"
          onSelect={chooseVehicle}
          onClose={() => setPicker(null)}
          footer={
            <Card>
              <Label>Adaugă auto</Label>
              <TextInput
                value={newPlate}
                onChangeText={setNewPlate}
                placeholder="ex. LYY 735"
                placeholderTextColor={colors.border}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.plateInput}
                accessibilityLabel="Numărul de înmatriculare"
                onSubmitEditing={addVehicle}
                editable={!addingVehicle}
              />
              <PrimaryButton label={addingVehicle ? 'Se adaugă…' : 'Adaugă'} size="md" shadow={false} onPress={addVehicle} disabled={newPlate.trim().length < 4 || addingVehicle} />
            </Card>
          }
        />
      ) : null}
    </>
  );
}

/** «−» / «+»: 64 lat (72 la Bălți și la plecare), bordură 2 `#ddd9d5`, rază 12, cifra 30 / 700 `#333` (34 la mare). */
function CounterButton({ label, big, disabled, onPress }: { label: string; big: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Un pasager în plus' : 'Un pasager în minus'}
      style={({ pressed }) => [styles.counterButton, big ? styles.counterButtonBig : null, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.counterButtonText, big ? styles.counterButtonTextBig : null]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Verdictul modelului, ca text fix: verde «Uniformă: da» (`#e8f3ea` / `#16a34a` / `#1f6b34`,
 * bifă), roșu «Uniformă: nu» (`#fbe9ec` / `#e4a3ad` / `#b91c1c`, X); necunoscut (modelul
 * n-a putut judeca) = bordură neutră. Nu se poate atinge — operatorul nu schimbă verdictul.
 */
function VerdictRow({ label, value }: { label: string; value: boolean | null }) {
  const box = value === true ? styles.verdictYes : value === false ? styles.verdictNo : styles.verdictUnknown;
  const color = value === true ? colors.selectedText : value === false ? colors.danger : colors.textSoft;
  const text = value === true ? 'da' : value === false ? 'nu' : 'necunoscut';
  return (
    <View accessibilityRole="text" accessibilityLabel={`${label}: ${text}`} style={[styles.verdict, box]}>
      {value === true ? <CheckIcon /> : value === false ? <XIcon /> : null}
      <Text style={[styles.verdictText, { color }]}>
        {label}: {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1, flexBasis: 0 },
  dimmed: { opacity: 0.45 },

  counter: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  counterButton: { width: 64, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  counterButtonBig: { width: 72 },
  counterButtonText: { fontSize: 30, ...weight(700), color: colors.textSoft },
  counterButtonTextBig: { fontSize: 34 },
  counterField: {
    flexGrow: 1,
    flexBasis: 0,
    height: 72,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.button,
    textAlign: 'center',
    fontSize: 40,
    ...weight(800),
    color: colors.text,
    padding: 0,
  },
  counterFieldBig: { height: 96, fontSize: 52 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: { flexGrow: 1, flexBasis: 0, height: 52, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderRadius: radius.option, alignItems: 'center', justifyContent: 'center' },
  quickSelected: { backgroundColor: colors.selectedBg, borderColor: colors.selectedBorder },
  quickText: { fontSize: 18, ...weight(700), color: colors.textSoft },
  quickTextSelected: { color: colors.selectedText },
  statusRow: { flexDirection: 'row', gap: 10 },

  linkRow: { alignSelf: 'flex-start' },
  link: { fontSize: 15, ...weight(700), color: colors.primary },

  driverName: { fontSize: 20, ...weight(700), color: colors.text },
  plate: { fontSize: 17, fontFamily: font.mono, fontWeight: '600', color: colors.muted, letterSpacing: 1 },

  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  thumb: { width: 104, height: 128, backgroundColor: colors.camera, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  thumbImage: { width: 104, height: 128 },
  photoSide: { flexGrow: 1, flexBasis: 0, gap: 8, justifyContent: 'center' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderWidth: 2, borderRadius: radius.option, paddingVertical: 4, paddingHorizontal: 12 },
  verdictYes: { backgroundColor: colors.selectedBg, borderColor: colors.selectedBorder },
  verdictNo: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  verdictUnknown: { backgroundColor: colors.card, borderColor: colors.border },
  verdictText: { fontSize: 15, ...weight(700), flexShrink: 1 },
  analyzing: { alignItems: 'center', gap: 8 },
  analyzingText: { fontSize: 14, ...weight(600), color: colors.muted },
  photoFooter: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  photoNote: { fontSize: 14, ...weight(400), color: colors.faint, lineHeight: 20, flexGrow: 1, flexShrink: 1 },

  pickRow: { flexGrow: 0, flexBasis: 'auto' },
  plateInput: {
    height: 60,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.button,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: font.mono,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.text,
  },
});
