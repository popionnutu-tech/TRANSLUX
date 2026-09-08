/**
 * Ecranul de cursă — `Cursa.dc.html` (Chișinău) / `CursaBalti.dc.html` (Bălți), element cu
 * element: antet cu pastila de întârziere, Pasageri (−/cifră/+ și «Microbuzul a fost
 * absent»), Șofer și auto (nume, placă mono, Confirm/Schimbă), Poza șoferului (miniatură
 * 104×128, trei verdicte fixe ale modelului — uniformă, bărbierit, aspect — verzi/roșii,
 * fără atingere; «Refă poza»), Verificări, rândul GPS, «Trimite raportul».
 * Verdictul e al modelului (Ion, 08.09: «aplicația fixează, operatorul doar face poza»):
 * la `REFA_POZA` / `NO_PERSON` apare mesajul serverului și «Refă poza».
 * La Bălți: Pasageri cu butoanele rapide, «Absent» / «Microbuzul full», GPS, Trimite, text.
 *
 * Logica (src/buildReport.ts, camera, locația, apelurile API) e cea de dinainte — aici
 * doar prezentarea.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, getDay, postDriverPhoto, postReport, postVehicle } from '../../src/api';
import {
  blockingReason,
  buildReportBody,
  clampPassengers,
  climateKindFor,
  initialState,
  LATE_THRESHOLD_MIN,
  minutesLate,
  missionDoneText,
  needsQuality,
  openReclamaFor,
  plateOf,
  QUICK_PASSENGERS,
  tripContext,
  withPhoto,
  type Coords,
  type DriverPhotoState,
  type TripContext,
  type TripFormState,
} from '../../src/buildReport';
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
  noneLabel: string;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const data: PickItem[] = [{ id: '', label: noneLabel }, ...items];
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
const RETAKE_FALLBACK = `Refă poza. ${DRIVER_FRAME_HINT}.`;

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
  const [error, setError] = useState<ScreenError | null>(null);
  const [now, setNow] = useState(() => new Date());

  const trip: DayTrip | null = useMemo(() => day?.trips.find((t) => t.id === tripId) ?? null, [day, tripId]);
  const ctx: TripContext | null = useMemo(() => {
    if (!day) return null;
    return { ...tripContext(day, tripId), vehicles };
  }, [day, tripId, vehicles]);

  // /day → cursa; doar cursa `next` se raportează (serverul refuză oricum cu 409)
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
          setLoadError(t.state === 'done' ? `Cursa ${t.departure_time} e deja raportată.` : next ? `Completează mai întâi ora ${next.departure_time}.` : 'Cursa e blocată.');
          return;
        }
        setDay(d);
        setVehicles(d.vehicles);
        setForm(initialState(tripContext(d, tripId)));
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

  // Locația pornește la montare, fără nicio acțiune a operatorului
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!(await hasForegroundPermission())) {
        if (alive) setSearching(false);
        return;
      }
      await findLocation((c) => {
        if (!alive) return;
        setCoords((prev) => c ?? prev);
        setSearching(false);
      });
    })();
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      alive = false;
      clearInterval(tick);
    };
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

  // ── Șofer / auto ──
  function chooseDriver(driverId: string | null) {
    setPicker(null);
    if (!form || driverId === form.driverId) return;
    // poza e legată de șoferul ales — alt șofer = altă poză
    const hadPhoto = !!form.photo || !!pending;
    setPending(null);
    setRejected(null);
    setPhotoError(hadPhoto ? 'Șoferul s-a schimbat — refă poza șoferului.' : null);
    setForm((f) => (f ? withPhoto({ ...f, driverId }, null) : f));
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
      const body = buildReportBody(ctx, form, c);
      const res = await postReport(body);
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
  if (!day || !trip || !ctx || !form) {
    return (
      <Screen padding={SCREEN_PADDING}>
        <Header title="Cursa" onBack={back} />
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  const balti = ctx.point === 'BALTI';
  const late = minutesLate(now, trip.departure_time);
  const distanceM = coords ? haversineDistance(coords.lat, coords.lon, day.station.lat, day.station.lon) : null;
  const quality = needsQuality(ctx, form);
  const reason = blockingReason(ctx, form);
  const assignment = ctx.assignment;
  const showPickers = changing || !assignment;
  const driverName = !balti ? day.drivers.find((d) => d.id === form.driverId)?.name ?? (assignment && assignment.driver_id === form.driverId ? assignment.driver_name : null) : null;
  const plate = plateOf(ctx, form.vehicleId);
  const openTask = openReclamaFor(ctx, form.vehicleId);
  const climateKind = climateKindFor(ctx, form.vehicleId);
  const counting = form.status === 'OK';
  const thumbUri = form.photo?.uri ?? pending?.uri ?? rejected?.uri ?? null;

  const gps: { state: GpsState; text: string } = searching
    ? { state: 'off', text: 'se caută locația…' }
    : distanceM === null
      ? { state: 'out', text: 'fără locație · raportul pleacă fără GPS' }
      : distanceM <= day.station.radiusM
        ? { state: 'in', text: `la ${Math.round(distanceM)} m de stație · locație confirmată automat` }
        : { state: 'out', text: `la ${Math.round(distanceM)} m de stație · în afara zonei stației` };

  const toggleStatus = (s: 'ABSENT' | 'FULL') => update({ status: form.status === s ? 'OK' : s });

  return (
    <>
      <Screen padding={SCREEN_PADDING}>
        <Header title={`Cursa ${trip.departure_time}`} subtitle={balti ? trip.route_name : null} onBack={back} right={late > LATE_THRESHOLD_MIN ? <Pill>întârziere {late} min</Pill> : null} />

        {/* Pasageri */}
        <Card>
          <Label>Pasageri</Label>
          <View style={styles.counter}>
            <CounterButton label="−" balti={balti} disabled={!counting} onPress={() => update({ passengers: clampPassengers((form.passengers ?? 0) - 1) })} />
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
              style={[styles.counterField, balti ? styles.counterFieldBalti : null, counting ? null : styles.dimmed]}
              accessibilityLabel="Numărul de pasageri"
            />
            <CounterButton label="+" balti={balti} disabled={!counting} onPress={() => update({ passengers: clampPassengers((form.passengers ?? 0) + 1) })} />
          </View>
          {balti ? (
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
          ) : (
            <View style={styles.statusRow}>
              <OutlineButton label="Microbuzul a fost absent" tone="neutral" height={48} color={colors.muted} selected={form.status === 'ABSENT'} selectedTone="danger" onPress={() => toggleStatus('ABSENT')} style={styles.grow} />
              {day.allowFull ? <OutlineButton label="Microbuzul full" tone="neutral" height={48} color={colors.muted} selected={form.status === 'FULL'} onPress={() => toggleStatus('FULL')} style={styles.grow} /> : null}
            </View>
          )}
        </Card>

        {balti ? (
          <View style={styles.statusRow}>
            <OutlineButton label="Absent" tone="neutral" height={56} fontSize={16} fontWeight={700} borderRadius={radius.button} selected={form.status === 'ABSENT'} selectedTone="danger" onPress={() => toggleStatus('ABSENT')} style={styles.grow} />
            {day.allowFull ? (
              <OutlineButton label="Microbuzul full" tone="neutral" height={56} fontSize={16} fontWeight={700} borderRadius={radius.button} selected={form.status === 'FULL'} onPress={() => toggleStatus('FULL')} style={styles.grow} />
            ) : null}
          </View>
        ) : null}

        {/* Șofer și auto */}
        {quality ? (
          <Card>
            <Label>{assignment && !changing ? 'Șofer și auto · din repartizare' : 'Șofer și auto'}</Label>
            <View style={{ gap: 4 }}>
              <Text style={styles.driverName}>{driverName ?? 'Fără șofer'}</Text>
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

        {/* Poza șoferului */}
        {quality ? (
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
                  <Text style={styles.photoNote}>{form.photo.verdict === 'EROARE' ? 'Modelul nu a putut judeca poza — raportul pleacă fără verdicte. Poți reface poza.' : 'Verdict automat din poză. Nu se poate schimba.'}</Text>
                ) : (
                  <View style={styles.grow} />
                )}
                <OutlineButton label="Refă poza" tone="neutral" height={44} onPress={retakePhoto} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Verificări */}
        {quality ? (
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

        <PrimaryButton label={sending ? 'Se trimite…' : 'Trimite raportul'} onPress={send} disabled={!!reason || sending || analyzing} />
        {reason ? <Footnote>{reason}</Footnote> : null}

        {balti ? (
          <>
            <Spacer />
            <Footnote>Fără șofer, auto sau verificări: la Bălți se numără doar pasagerii. Două atingeri per cursă.</Footnote>
          </>
        ) : null}
      </Screen>

      {camera ? <PhotoCamera title="Poza șoferului" hint={DRIVER_FRAME_HINT} onCaptured={onCaptured} onCancel={() => setCamera(false)} /> : null}
      {picker === 'driver' ? (
        <PickerModal
          title="Șoferul"
          items={day.drivers.map((d) => ({ id: d.id, label: d.name }))}
          selectedId={form.driverId}
          noneLabel="Fără șofer"
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

/** «−» / «+»: 64 lat (72 la Bălți), bordură 2 `#ddd9d5`, rază 12, cifra 30 / 700 `#333` (34 la Bălți). */
function CounterButton({ label, balti, disabled, onPress }: { label: string; balti: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Un pasager în plus' : 'Un pasager în minus'}
      style={({ pressed }) => [styles.counterButton, balti ? styles.counterButtonBalti : null, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.counterButtonText, balti ? styles.counterButtonTextBalti : null]}>{label}</Text>
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
  counterButtonBalti: { width: 72 },
  counterButtonText: { fontSize: 30, ...weight(700), color: colors.textSoft },
  counterButtonTextBalti: { fontSize: 34 },
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
  counterFieldBalti: { height: 96, fontSize: 52 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: { flexGrow: 1, flexBasis: 0, height: 52, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderRadius: radius.option, alignItems: 'center', justifyContent: 'center' },
  quickSelected: { backgroundColor: colors.selectedBg, borderColor: colors.selectedBorder },
  quickText: { fontSize: 18, ...weight(700), color: colors.textSoft },
  quickTextSelected: { color: colors.selectedText },
  statusRow: { flexDirection: 'row', gap: 10 },

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
