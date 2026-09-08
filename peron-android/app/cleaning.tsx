/**
 * Pozele de curățenie (spec peron-app-android, S08): 3 zone (peron, pietoni «GARA»,
 * veceu), de două ori pe zi (DIMINEATA / ZIUA, aleasă după oră sau primită ca
 * parametru). Doar camera aplicației — galeria nu există. Pentru prima zonă neînchisă:
 * textul de cadru, «📷 Fă poza» → cameră pe tot ecranul → previzualizare «Trimite» /
 * «Refă» → verdictul modelului pe loc. La 3/3: «✔ Pozele de curățenie sunt complete».
 *
 * Parametri: `slot` (DIMINEATA | ZIUA) și `gate` (HH:MM) — de la poarta din day.tsx
 * sau de la 409 CLEANING_REQUIRED din ecranul de cursă.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, getDay, postCleaningPhoto } from '../src/api';
import type { Coords } from '../src/buildReport';
import { PhotoCamera, type CapturedPhoto } from '../src/camera';
import { CLEANING_ZONES, isCleaningSlot, mergeDone, MURDAR_WARNING, nextZone, SLOT_LABEL, slotForTime, ZONE_HINT, ZONE_LABEL } from '../src/cleaning';
import { BigButton, Body, Card, Muted, Screen, SectionTitle, Title } from '../src/components';
import { findLocation, hasForegroundPermission } from '../src/location';
import { colors, sizes } from '../src/theme';
import type { CleaningPhotoResponse, CleaningSlot, CleaningZone } from '../src/types';

interface ZoneResult {
  zone: CleaningZone;
  verdict: CleaningPhotoResponse['verdict'];
  problems: string[];
  description: string;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/day');
}

export default function CleaningScreen() {
  const params = useLocalSearchParams<{ slot?: string; gate?: string }>();
  const gateTime = typeof params.gate === 'string' && /^\d{2}:\d{2}$/.test(params.gate) ? params.gate : null;
  const [slot] = useState<CleaningSlot>(() => (isCleaningSlot(params.slot) ? params.slot : slotForTime(new Date())));

  const [done, setDone] = useState<CleaningZone[] | null>(null); // null = /day nu s-a încărcat încă
  const [loadError, setLoadError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [pending, setPending] = useState<CapturedPhoto | null>(null); // poză confirmată, netrimisă (fără internet)
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ZoneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const locationRef = useRef<Promise<Coords | null> | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await getDay();
      if (d.point !== 'CHISINAU') {
        setLoadError('Pozele de curățenie se fac doar la peronul din Chișinău.');
        return;
      }
      setDone(d.cleaning?.[slot] ?? []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // api.ts a trimis deja la login
      setLoadError(e instanceof ApiError && e.isOffline ? 'Fără internet. Revino când e semnal.' : 'Nu s-a putut încărca starea curățeniei.');
    }
  }, [slot]);

  useEffect(() => {
    load();
  }, [load]);

  // Locația pornește la deschiderea ecranului (aceeași funcție ca la cursă); la trimitere se ia ce e gata.
  useEffect(() => {
    let alive = true;
    locationRef.current = (async () => {
      if (!(await hasForegroundPermission())) return null;
      return new Promise<Coords | null>((resolve) => {
        let first = true;
        findLocation((c) => {
          if (alive) setCoords((prev) => c ?? prev);
          if (first) {
            first = false;
            resolve(c);
          }
        });
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const zone = done ? nextZone(done) : null;
  const complete = done !== null && zone === null;

  const submit = useCallback(
    async (photo: CapturedPhoto, forZone: CleaningZone) => {
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        const c = coords ?? (await locationRef.current) ?? null;
        const res = await postCleaningPhoto({ slot, zone: forZone, imageBase64: photo.base64, lat: c?.lat ?? null, lon: c?.lon ?? null });
        setPending(null);
        setResult({ zone: forZone, verdict: res.verdict, problems: res.problems ?? [], description: res.description ?? '' });
        // `zonesDone` de la server e sursa de adevăr; dacă a picat citirea lui, zona abia judecată (≠ ALT_LOC) e închisă oricum
        setDone((prev) => mergeDone(prev ?? [], res.zonesDone ?? [], res.verdict === 'ALT_LOC' ? [] : [forZone]));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        // poza rămâne pe ecran: «Trimite din nou» fără să o refacă
        setError(
          e instanceof ApiError && e.isOffline
            ? 'Fără internet. Poza rămâne aici — apasă «Trimite din nou» când revine semnalul.'
            : e instanceof ApiError
              ? e.message
              : 'Poza nu a putut fi trimisă.',
        );
      } finally {
        setSending(false);
      }
    },
    [coords, sending, slot],
  );

  function onCaptured(photo: CapturedPhoto) {
    if (!zone) return;
    setCamera(false);
    setResult(null);
    setPending(photo);
    submit(photo, zone);
  }

  function retake() {
    setPending(null);
    setError(null);
    setCamera(true);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Înapoi">
            <Text style={styles.back}>‹ Înapoi</Text>
          </Pressable>
          <Title>📷 Curățenie</Title>
        </View>
        <Muted>Tura: {SLOT_LABEL[slot]}</Muted>

        {gateTime ? (
          <Card tone="warning" style={{ paddingVertical: 10 }}>
            <Text style={styles.gateText}>Înainte de cursa {gateTime} trebuie pozele de curățenie</Text>
          </Card>
        ) : null}

        {loadError ? (
          <Card tone="danger">
            <Body>{loadError}</Body>
            <BigButton label="Reîncarcă" tone="neutral" onPress={load} />
          </Card>
        ) : null}

        {done === null && !loadError ? <ActivityIndicator size="large" color={colors.primary} /> : null}

        {done !== null ? (
          <Card>
            <SectionTitle>Zonele ({done.length}/3)</SectionTitle>
            {CLEANING_ZONES.map((z) => {
              const isDone = done.includes(z);
              const current = z === zone;
              return (
                <Text key={z} style={[styles.zoneRow, current ? styles.zoneCurrent : null]}>
                  {isDone ? '✅' : current ? '▶' : '⬜'} {ZONE_LABEL[z]}
                </Text>
              );
            })}
          </Card>
        ) : null}

        {result ? <ResultCard result={result} /> : null}

        {error ? (
          <Card tone="danger">
            <Body>{error}</Body>
          </Card>
        ) : null}

        {complete ? (
          <Card tone="success">
            <SectionTitle>✔ Pozele de curățenie sunt complete</SectionTitle>
            <Body>Setul «{SLOT_LABEL[slot]}» e închis pentru azi.</Body>
            <BigButton label="Înapoi" tone="success" onPress={goBack} big />
          </Card>
        ) : null}

        {zone && !complete ? (
          <Card tone="warning">
            <SectionTitle>
              Poza {CLEANING_ZONES.indexOf(zone) + 1}/3: {ZONE_LABEL[zone]}
            </SectionTitle>
            <Body>{ZONE_HINT[zone]}</Body>
            {sending ? (
              <View style={styles.analyzing}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Body>Se verifică poza…</Body>
              </View>
            ) : pending ? (
              <View style={styles.photoRow}>
                <Image source={{ uri: pending.uri }} style={styles.thumb} />
                <View style={{ flex: 1, gap: 8 }}>
                  <BigButton label="Trimite din nou" onPress={() => submit(pending, zone)} />
                  <BigButton label="Refă poza" tone="neutral" onPress={retake} />
                </View>
              </View>
            ) : (
              <BigButton label="📷 Fă poza" onPress={() => setCamera(true)} big />
            )}
          </Card>
        ) : null}
      </Screen>

      {camera && zone ? (
        <PhotoCamera
          title={`${ZONE_LABEL[zone]} (${CLEANING_ZONES.indexOf(zone) + 1}/3)`}
          hint={ZONE_HINT[zone]}
          confirm
          confirmLabel="Trimite"
          onCaptured={onCaptured}
          onCancel={() => setCamera(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Verdictul modelului pentru zona abia trimisă: verde (CURAT), roșu (MURDAR / ALT_LOC), galben (EROARE). */
function ResultCard({ result }: { result: ZoneResult }) {
  const label = ZONE_LABEL[result.zone];
  if (result.verdict === 'CURAT') {
    return (
      <Card tone="success">
        <SectionTitle>✅ {label}: curat</SectionTitle>
        {result.description ? <Body>{result.description}</Body> : null}
      </Card>
    );
  }
  if (result.verdict === 'MURDAR') {
    return (
      <Card tone="danger">
        <SectionTitle>🔴 {label}: MURDAR</SectionTitle>
        {result.problems.length > 0 ? result.problems.map((p, i) => <Body key={i}>• {p}</Body>) : result.description ? <Body>{result.description}</Body> : null}
        <Text style={styles.penalty}>{MURDAR_WARNING}</Text>
      </Card>
    );
  }
  if (result.verdict === 'ALT_LOC') {
    return (
      <Card tone="danger">
        <SectionTitle>❌ Poza nu pare din zona {label}</SectionTitle>
        {result.description ? <Body>{result.description}</Body> : null}
        <Body>Refă din locul corect: {ZONE_HINT[result.zone]}</Body>
      </Card>
    );
  }
  return (
    <Card tone="warning">
      <SectionTitle>⚠️ {label}: verificarea automată nu a mers</SectionTitle>
      <Body>Poza e salvată și va fi verificată de administrator.</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { fontSize: sizes.text + 2, fontWeight: '700', color: colors.primary, paddingVertical: 8 },
  gateText: { fontSize: sizes.text, fontWeight: '700', color: colors.warning },
  zoneRow: { fontSize: sizes.text, color: colors.text, paddingVertical: 4 },
  zoneCurrent: { fontWeight: '700' },
  analyzing: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  photoRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  thumb: { width: 110, height: 146, borderRadius: sizes.radius, backgroundColor: colors.locked },
  penalty: { fontSize: sizes.text, fontWeight: '700', color: colors.danger },
});
