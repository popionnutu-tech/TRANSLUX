/**
 * Ecranul de cursă (spec peron-app-android, S07): totul pe un singur ecran cu scroll.
 * Chișinău: antet + întârziere, pasageri / Absent, șofer și auto, poza șoferului cu
 * verdictele propuse de model, verificările manuale (toate OK implicit), locația luată
 * singură, «Trimite». Bălți: doar pasageri, Absent / Microbuzul full, locație, Trimite.
 * Logica pură (starea → corpul cererii, validarea) e în src/buildReport.ts.
 *
 * Camera e scrisă aici (DriverCamera + takeCompressedPhoto); S08 o mută în src/camera.ts
 * și o refolosește la curățenie.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, getDay, postDriverPhoto, postReport, postVehicle } from '../../src/api';
import {
  blockingReason,
  buildReportBody,
  clampPassengers,
  climateKindFor,
  initialState,
  LATE_THRESHOLD_MIN,
  locationLabel,
  MAX_PASSENGERS,
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
  type ReclamaChoice,
  type RepairAnswer,
  type TripContext,
  type TripFormState,
} from '../../src/buildReport';
import { BigButton, Body, Card, Muted, OptionGroup, Screen, SectionTitle, Title, YES_NO, type Option } from '../../src/components';
import { haversineDistance } from '../../src/format';
import { colors, sizes } from '../../src/theme';
import type { CleaningRequiredDetails, ClimateStatus, DayResponse, DayTrip } from '../../src/types';

const LOCATION_TIMEOUT_MS = 15_000;
const PHOTO_MAX_WIDTH = 1280;
const PHOTO_JPEG_QUALITY = 0.8;

// ── Locația (getCurrentPositionAsync, separat de urmărirea din fundal) ────────

function toCoords(loc: Location.LocationObject): Coords {
  return {
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    accuracyM: loc.coords.accuracy == null ? null : Math.max(0, Math.round(loc.coords.accuracy)),
  };
}

async function hasForegroundPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Explicația de dinaintea re-cererii permisiunii (spec: «o re-cere la fiecare trimitere, cu explicație»). */
function explainThenRequestPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Locația lipsește',
      'Locația confirmă că raportul e făcut la stație. Fără ea raportul se trimite, dar se notează încălcare «locație». Permite accesul la locație la pasul următor.',
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
async function findLocation(onUpdate: (c: Coords | null) => void): Promise<void> {
  let settled = false;
  const timer = setTimeout(async () => {
    settled = true;
    let last: Location.LocationObject | null = null;
    try {
      last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
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

// ── Camera + comprimare (1280 px lățime, JPEG 0.8) ────────────────────────────

export interface CapturedPhoto {
  uri: string;
  base64: string;
}

async function takeCompressedPhoto(camera: CameraView): Promise<CapturedPhoto | null> {
  const pic = await camera.takePictureAsync({ quality: 0.9 });
  if (!pic) return null;
  const ctx = ImageManipulator.manipulate(pic.uri);
  if (pic.width > PHOTO_MAX_WIDTH) ctx.resize({ width: PHOTO_MAX_WIDTH });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY, base64: true });
  if (!out.base64) return null;
  return { uri: out.uri, base64: out.base64 };
}

/** Camera pe tot ecranul, doar spate, doar poză făcută pe loc — galeria nu există. */
function DriverCamera({ title, onCaptured, onCancel }: { title: string; onCaptured: (p: CapturedPhoto) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  async function shoot() {
    if (!cameraRef.current || busy || !ready) return;
    setBusy(true);
    try {
      const photo = await takeCompressedPhoto(cameraRef.current);
      if (photo) onCaptured(photo);
      else Alert.alert('Poza nu a reușit', 'Încearcă din nou.');
    } catch {
      Alert.alert('Poza nu a reușit', 'Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.cameraScreen}>
        <Text style={styles.cameraTitle}>{title}</Text>
        {permission?.granted ? (
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
        ) : (
          <View style={styles.cameraDenied}>
            <Body>Aplicația are nevoie de cameră ca să facă poza pe loc.</Body>
            <BigButton label="Permite camera" onPress={() => requestPermission()} />
          </View>
        )}
        <View style={styles.cameraBar}>
          <BigButton label="Renunță" tone="neutral" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
          <BigButton
            label={busy ? 'Se procesează…' : '📷 Fotografiază'}
            onPress={shoot}
            disabled={!permission?.granted || !ready || busy}
            big
            style={{ flex: 2 }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Lista derulantă (șoferi / auto) ───────────────────────────────────────────

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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.pickerHeader}>
          <Title>{title}</Title>
          <BigButton label="Închide" tone="neutral" onPress={onClose} />
        </View>
        <FlatList
          data={data}
          keyExtractor={(i) => i.id || '__none__'}
          contentContainerStyle={{ padding: sizes.padding, gap: 8 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = (item.id || null) === selectedId;
            return (
              <Pressable
                onPress={() => onSelect(item.id || null)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.pickRow, selected ? styles.pickRowSelected : null, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.pickText, selected ? { color: colors.primaryText } : null]}>{item.label}</Text>
              </Pressable>
            );
          }}
          ListFooterComponent={footer ? <View style={{ paddingTop: sizes.gap }}>{footer}</View> : null}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ── Ecranul ───────────────────────────────────────────────────────────────────

type ScreenError = { message: string; cleaning?: CleaningRequiredDetails };

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === 'string' ? id : '';

  const [day, setDay] = useState<DayResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<DayResponse['vehicles']>([]);
  const [form, setForm] = useState<TripFormState | null>(null);
  const [changing, setChanging] = useState(false); // «✏️ Schimbă» apăsat
  const [picker, setPicker] = useState<'driver' | 'vehicle' | null>(null);
  const [newPlate, setNewPlate] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [camera, setCamera] = useState(false);
  const [pending, setPending] = useState<CapturedPhoto | null>(null); // poză făcută, încă nejudecată de server
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
        if (res.verdict === 'NO_PERSON' || !res.driverCheckId) {
          setPending(null);
          setPhotoError('Nu se vede șoferul, refă poza.');
          return;
        }
        const state: DriverPhotoState = {
          driverCheckId: res.driverCheckId,
          uri: photo.uri,
          verdict: res.verdict,
          modelUniformOk: res.uniformOk,
          modelGroomedOk: res.groomedOk,
          description: res.description,
        };
        setPending(null);
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
    setPending(photo);
    if (form) analyze(photo, form.driverId);
  }

  function retakePhoto() {
    setPending(null);
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
    setPhotoError(hadPhoto ? 'Șoferul s-a schimbat — refă poza șoferului.' : null);
    setForm((f) => (f ? withPhoto({ ...f, driverId }, null) : f));
  }

  function chooseVehicle(vehicleId: string | null) {
    setPicker(null);
    update({ vehicleId, reclama: 'ok', repair: null, climate: 'works' });
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
        setError({ message: 'Ceva nu a mers. Apasă din nou «Trimite».' });
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
  if (loadError) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Title>Cursa</Title>
          <Card tone="warning">
            <Body>{loadError}</Body>
          </Card>
          <BigButton label="Înapoi la ziua de azi" onPress={() => router.replace('/day')} />
        </Screen>
      </SafeAreaView>
    );
  }
  if (!day || !trip || !ctx || !form) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Title>Cursa</Title>
          <ActivityIndicator size="large" color={colors.primary} />
        </Screen>
      </SafeAreaView>
    );
  }

  const late = minutesLate(now, trip.departure_time);
  const distanceM = coords ? haversineDistance(coords.lat, coords.lon, day.station.lat, day.station.lon) : null;
  const quality = needsQuality(ctx, form);
  const reason = blockingReason(ctx, form);
  const assignment = ctx.assignment;
  const showPickers = changing || !assignment;
  const driverName = ctx.point === 'CHISINAU' ? day.drivers.find((d) => d.id === form.driverId)?.name ?? (assignment && assignment.driver_id === form.driverId ? assignment.driver_name : null) : null;
  const plate = plateOf(ctx, form.vehicleId);
  const openTask = openReclamaFor(ctx, form.vehicleId);
  const climateKind = climateKindFor(ctx, form.vehicleId);

  const statusOptions: Option<'OK' | 'ABSENT' | 'FULL'>[] = [
    { key: 'ABSENT', label: 'Absent', tone: 'danger' },
    ...(day.allowFull ? [{ key: 'FULL' as const, label: 'Microbuzul full', tone: 'primary' as const }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/day')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Înapoi la ziua de azi">
            <Text style={styles.back}>‹ Ziua</Text>
          </Pressable>
          <Title>Cursa {trip.departure_time}</Title>
        </View>
        <Muted>{trip.route_name}</Muted>
        {late > LATE_THRESHOLD_MIN ? (
          <Card tone="warning" style={{ paddingVertical: 10 }}>
            <Text style={styles.lateText}>⏱ Întârziere: {late} min — se va nota</Text>
          </Card>
        ) : null}

        {/* Pasageri / Absent / Full */}
        {form.status === 'OK' ? (
          <Card>
            <SectionTitle>Pasageri</SectionTitle>
            <View style={styles.counterRow}>
              <BigButton label="−" tone="neutral" onPress={() => update({ passengers: clampPassengers((form.passengers ?? 0) - 1) })} style={styles.counterBtn} big />
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
                style={styles.counterInput}
                accessibilityLabel="Numărul de pasageri"
              />
              <BigButton label="+" tone="neutral" onPress={() => update({ passengers: clampPassengers((form.passengers ?? 0) + 1) })} style={styles.counterBtn} big />
            </View>
            <View style={styles.quickRow}>
              {QUICK_PASSENGERS.map((n) => (
                <BigButton key={n} label={String(n)} tone={form.passengers === n ? 'primary' : 'neutral'} onPress={() => update({ passengers: n })} style={styles.quickBtn} />
              ))}
            </View>
            <Muted>0–{MAX_PASSENGERS} pasageri</Muted>
            <OptionGroup options={statusOptions} value={null} onChange={(s) => update({ status: s })} />
          </Card>
        ) : (
          <Card tone={form.status === 'ABSENT' ? 'danger' : 'success'}>
            <SectionTitle>{form.status === 'ABSENT' ? 'Cursa marcată «Absent»' : 'Microbuzul full'}</SectionTitle>
            <Body>{form.status === 'ABSENT' ? 'Se trimite fără pasageri, șofer, auto sau poză.' : 'Se trimite ca microbuz complet, fără număr de pasageri.'}</Body>
            <BigButton label="Renunță — completez normal" tone="neutral" onPress={() => update({ status: 'OK' })} />
          </Card>
        )}

        {/* Șofer și auto */}
        {quality ? (
          <Card>
            <SectionTitle>Șofer și auto</SectionTitle>
            {assignment && !changing ? (
              <>
                <Body>
                  👤 {driverName ?? assignment.driver_name} · 🚌 {plate ?? 'fără auto'}
                </Body>
                <OptionGroup
                  options={[
                    { key: 'ok', label: '✅ OK', tone: 'success' },
                    { key: 'change', label: '✏️ Schimbă' },
                  ]}
                  value="ok"
                  onChange={(k) => {
                    if (k === 'change') setChanging(true);
                  }}
                />
              </>
            ) : null}
            {showPickers ? (
              <>
                <BigButton label={`👤 ${driverName ?? 'Fără șofer'} ▾`} tone="neutral" onPress={() => setPicker('driver')} />
                <BigButton label={`🚌 ${plate ?? 'Fără auto'} ▾`} tone="neutral" onPress={() => setPicker('vehicle')} />
                {assignment ? (
                  <BigButton
                    label="Înapoi la repartizare"
                    tone="neutral"
                    onPress={() => {
                      setChanging(false);
                      chooseVehicle(assignment.vehicle_id);
                      chooseDriver(assignment.driver_id);
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Poza șoferului */}
        {quality ? (
          <Card tone={form.photo ? 'neutral' : 'warning'}>
            <SectionTitle>Poza șoferului</SectionTitle>
            {analyzing ? (
              <View style={styles.analyzing}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Body>Se analizează poza…</Body>
              </View>
            ) : null}
            {photoError ? (
              <Text style={styles.photoError}>{photoError}</Text>
            ) : null}
            {!analyzing && pending && !form.photo ? (
              <View style={styles.photoRow}>
                <Image source={{ uri: pending.uri }} style={styles.thumb} />
                <View style={{ flex: 1, gap: 8 }}>
                  <BigButton label="Trimite din nou poza" onPress={() => analyze(pending, form.driverId)} />
                  <BigButton label="Refă poza" tone="neutral" onPress={retakePhoto} />
                </View>
              </View>
            ) : null}
            {!analyzing && !pending && !form.photo ? (
              <BigButton label="📷 Fă poza șoferului" onPress={() => setCamera(true)} big />
            ) : null}
            {form.photo && !analyzing ? (
              <>
                <View style={styles.photoRow}>
                  <Image source={{ uri: form.photo.uri }} style={styles.thumb} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <VerdictButton label="Uniformă" value={form.uniformOk} onToggle={() => update({ uniformOk: form.uniformOk === true ? false : true })} />
                    <VerdictButton label="Aspect îngrijit" value={form.exteriorOk} onToggle={() => update({ exteriorOk: form.exteriorOk === true ? false : true })} />
                  </View>
                </View>
                {form.photo.verdict === 'EROARE' ? (
                  <Muted>Modelul nu a putut judeca poza — bifează tu verdictele.</Muted>
                ) : (
                  <Muted>Propunerea modelului: atinge un verdict ca să-l corectezi.{form.photo.description ? ` ${form.photo.description}` : ''}</Muted>
                )}
                <BigButton label="Refă poza" tone="neutral" onPress={retakePhoto} />
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Calitate */}
        {quality ? (
          <Card>
            <SectionTitle>Verificări</SectionTitle>
            <OptionGroup label="Ajută la încărcat" options={YES_NO} value={form.loadingHelpOk ? 'yes' : 'no'} onChange={(k) => update({ loadingHelpOk: k === 'yes' })} />
            <OptionGroup label="Auto exterior curat" options={YES_NO} value={form.autoCurat ? 'yes' : 'no'} onChange={(k) => update({ autoCurat: k === 'yes' })} />
            {form.vehicleId ? (
              <OptionGroup<ReclamaChoice>
                label="Reclamă"
                options={[
                  { key: 'ok', label: 'Totul OK', tone: 'success' },
                  { key: 'bus', label: 'Doar autobuz', tone: 'danger' },
                  { key: 'panou_ruta', label: 'Doar panou rută', tone: 'danger' },
                  { key: 'ambele', label: 'Ambele', tone: 'danger' },
                ]}
                value={form.reclama}
                onChange={(k) => update({ reclama: k, repair: k === 'ok' ? form.repair : null })}
              />
            ) : null}
            {form.vehicleId && form.reclama === 'ok' && openTask ? (
              <Card tone="warning">
                <Body>🔧 Era marcat defect: {openTask.description}</Body>
                {openTask.lastComment ? <Muted>💬 Comentariu: {openTask.lastComment}</Muted> : null}
                <OptionGroup<RepairAnswer>
                  label="A fost reparat?"
                  options={[
                    { key: 'da', label: 'Da, reparat', tone: 'success' },
                    { key: 'nu', label: 'Nu, încă defect', tone: 'danger' },
                  ]}
                  value={form.repair}
                  onChange={(k) => update({ repair: k })}
                />
                {form.repair === 'nu' ? <Muted>Alege mai sus ce e defect: autobuz, panou rută sau ambele.</Muted> : null}
              </Card>
            ) : null}
            {climateKind ? (
              <OptionGroup<ClimateStatus>
                label={climateKind === 'ac' ? '❄️ Aerul condiționat' : '🔥 Căldura'}
                options={[
                  { key: 'works', label: 'Lucrează', tone: 'success' },
                  { key: 'broken', label: 'Stricat', tone: 'danger' },
                  { key: 'none', label: 'Nu are' },
                ]}
                value={form.climate}
                onChange={(k) => update({ climate: k })}
              />
            ) : null}
          </Card>
        ) : null}

        {/* Locația — fără niciun buton, pleacă singură */}
        <Card tone={searching ? 'neutral' : distanceM === null ? 'danger' : distanceM <= day.station.radiusM ? 'success' : 'warning'} style={{ paddingVertical: 10 }}>
          <Text style={styles.locText}>{locationLabel(distanceM, searching)}</Text>
          {coords?.accuracyM != null && !searching ? <Muted>precizie ±{coords.accuracyM} m</Muted> : null}
        </Card>

        {error ? (
          <Card tone="danger">
            <Body>{error.message}</Body>
            {error.cleaning ? <BigButton label="📷 Poze curățenie" onPress={() => router.push('/cleaning')} /> : null}
          </Card>
        ) : null}

        <BigButton label={sending ? 'Se trimite…' : 'Trimite'} onPress={send} disabled={!!reason || sending || analyzing} big tone="success" />
        {reason ? <Muted>{reason}</Muted> : null}
      </Screen>

      {camera ? <DriverCamera title="Poza șoferului" onCaptured={onCaptured} onCancel={() => setCamera(false)} /> : null}
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
              <SectionTitle>+ Adaugă auto</SectionTitle>
              <TextInput
                value={newPlate}
                onChangeText={setNewPlate}
                placeholder="ex. 998TCP"
                placeholderTextColor={colors.border}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.plateInput}
                accessibilityLabel="Numărul de înmatriculare"
                onSubmitEditing={addVehicle}
                editable={!addingVehicle}
              />
              <BigButton label={addingVehicle ? 'Se adaugă…' : 'Adaugă'} onPress={addVehicle} disabled={newPlate.trim().length < 4 || addingVehicle} />
            </Card>
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

/** «Uniformă: da» verde / «nu» roșie / «necunoscut» gri; atingerea răstoarnă verdictul. */
function VerdictButton({ label, value, onToggle }: { label: string; value: boolean | null; onToggle: () => void }) {
  const bg = value === true ? colors.success : value === false ? colors.danger : colors.locked;
  const fg = value === null ? colors.text : colors.primaryText;
  const text = value === true ? 'da' : value === false ? 'nu' : 'necunoscut';
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}. Atinge ca să schimbi`}
      style={({ pressed }) => [styles.verdict, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[styles.verdictText, { color: fg }]}>
        {label}: {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { fontSize: sizes.text + 2, fontWeight: '700', color: colors.primary, paddingVertical: 8 },
  lateText: { fontSize: sizes.text, fontWeight: '700', color: colors.warning },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterBtn: { width: 72 },
  counterInput: {
    flex: 1,
    fontSize: 44,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: sizes.radius,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: { flex: 1, paddingHorizontal: 4 },
  analyzing: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  photoError: { fontSize: sizes.text, fontWeight: '600', color: colors.danger },
  photoRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  thumb: { width: 110, height: 146, borderRadius: sizes.radius, backgroundColor: colors.locked },
  verdict: { flex: 1, borderRadius: sizes.radius, alignItems: 'center', justifyContent: 'center', minHeight: sizes.buttonHeight, paddingHorizontal: 8 },
  verdictText: { fontSize: sizes.text, fontWeight: '700', textAlign: 'center' },
  locText: { fontSize: sizes.text, fontWeight: '600', color: colors.text },
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraTitle: { fontSize: sizes.text + 2, fontWeight: '700', color: '#fff', padding: sizes.padding },
  cameraDenied: { flex: 1, justifyContent: 'center', padding: sizes.padding, gap: sizes.gap, backgroundColor: colors.bg },
  cameraBar: { flexDirection: 'row', gap: 8, padding: sizes.padding, backgroundColor: '#000' },
  pickerHeader: { padding: sizes.padding, gap: sizes.gap },
  pickRow: { minHeight: sizes.buttonHeight, borderRadius: sizes.radius, backgroundColor: colors.card, justifyContent: 'center', paddingHorizontal: sizes.padding },
  pickRowSelected: { backgroundColor: colors.primary },
  pickText: { fontSize: sizes.text + 2, fontWeight: '600', color: colors.text },
  plateInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: sizes.radius,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
});
