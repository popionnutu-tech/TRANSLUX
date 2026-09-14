/**
 * Pozele de curățenie — `Curatenie.dc.html`, element cu element: antet «Curățenie · 15:00» /
 * «Deschiderea turei» + «N din 3/4 trimise», un card per zonă în ordinea PERON,
 * PIETONI, VECEU (închisă-curat, închisă-murdar, activă cu previzualizarea camerei și
 * «Fă poza», viitoare), textul de jos. Doar camera aplicației — galeria nu există.
 *
 * Dimineața (Ion, 14.09: «la început de smenă operatorul să fie fotografiat de șofer, să se
 * vadă că și el respectă uniforma») setul are un al patrulea pas, după zone: poza
 * OPERATORULUI, făcută de un șofer cu telefonul aplicației — POST /operator-photo, aceleași
 * criterii ca la șofer (uniformă, bărbierit, aspect), verdictul modelului e final. La
 * NO_PERSON / REFA_POZA apare mesajul serverului și «Refă poza». O dată pe zi: dacă /day
 * are `operatorCheck`, cardul e închis de la început.
 *
 * Parametri: `slot` (DIMINEATA | ZIUA) și `gate` (HH:MM) — de la poarta din day.tsx
 * sau de la 409 CLEANING_REQUIRED / OPERATOR_PHOTO_REQUIRED din ecranul de cursă. Logica
 * (src/cleaning.ts, camera, locația, API-ul) e cea de dinainte.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { ApiError, getDay, postCleaningPhoto, postOperatorPhoto } from '../src/api';
import type { Coords } from '../src/buildReport';
import { PhotoCamera, type CapturedPhoto } from '../src/camera';
import { CLEANING_ZONES, isCleaningSlot, mergeDone, nextZone, OPERATOR_FRAME_HINT, slotForTime, ZONE_HINT } from '../src/cleaning';
import { Body, Card, Footnote, Header, OutlineButton, PrimaryButton, Screen, Spacer } from '../src/components';
import { CameraIcon, CheckIcon, PersonIcon, ShutterIcon, XIcon } from '../src/icons';
import { findLocation, hasForegroundPermission } from '../src/location';
import { colors, radius, shadowCard, weight } from '../src/theme';
import type { CleaningPhotoResponse, CleaningSlot, CleaningZone, DayOperatorCheck, OperatorPhotoResponse } from '../src/types';

/** Numele zonelor și textele exact ca în mockup (ZONE_LABEL din src/cleaning.ts e cel din bot). */
const ZONE_TITLE: Record<CleaningZone, string> = { PERON: 'Peron', PIETONI: 'Zona pietoni', VECEU: 'Zona veceu' };
const SLOT_TITLE: Record<CleaningSlot, string> = { DIMINEATA: 'Deschiderea turei', ZIUA: 'Curățenie · 15:00' };
const OPERATOR_TITLE = 'Poza ta (operatorul)';
const CAMERA_ONLY = 'Poza se face doar cu camera aplicației.';
const PENALTY = 'Informația se stochează și va fi penalizată.';

interface ZoneResult {
  verdict: CleaningPhotoResponse['verdict'];
  problems: string[];
  description: string;
}

/** Verdictul pozei operatorului, în forma cardului închis (din sesiunea asta sau din /day). */
interface OperatorResult {
  verdict: 'OK' | 'EROARE';
  uniformOk: boolean | null;
  shavedOk: boolean | null;
  groomedOk: boolean | null;
  at: string | null; // HH:MM, doar când vine din /day
}

function fromDay(c: DayOperatorCheck): OperatorResult {
  return { verdict: 'OK', uniformOk: c.uniformOk, shavedOk: c.shavedOk, groomedOk: c.groomedOk, at: c.at };
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/day');
}

/** Ce lipsește din verdictul operatorului: «fără uniformă, nebărbierit». Gol = totul în regulă. */
export function operatorProblems(r: Pick<OperatorResult, 'uniformOk' | 'shavedOk' | 'groomedOk'>): string[] {
  const out: string[] = [];
  if (r.uniformOk === false) out.push('fără uniformă');
  if (r.shavedOk === false) out.push('nebărbierit');
  if (r.groomedOk === false) out.push('aspect neîngrijit');
  return out;
}

export default function CleaningScreen() {
  const params = useLocalSearchParams<{ slot?: string; gate?: string }>();
  const gateTime = typeof params.gate === 'string' && /^\d{2}:\d{2}$/.test(params.gate) ? params.gate : null;
  const [slot] = useState<CleaningSlot>(() => (isCleaningSlot(params.slot) ? params.slot : slotForTime(new Date())));
  const withOperator = slot === 'DIMINEATA';

  const [done, setDone] = useState<CleaningZone[] | null>(null); // null = /day nu s-a încărcat încă
  const [operator, setOperator] = useState<OperatorResult | null>(null); // poza operatorului de azi (din /day sau din sesiune)
  const [loadError, setLoadError] = useState<string | null>(null);
  const [camera, setCamera] = useState<'zone' | 'operator' | null>(null);
  const [pending, setPending] = useState<CapturedPhoto | null>(null); // poză confirmată, netrimisă (fără internet)
  const [shot, setShot] = useState<{ zone: CleaningZone | 'OPERATOR'; photo: CapturedPhoto } | null>(null); // ultima poză, pentru previzualizare
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Partial<Record<CleaningZone, ZoneResult>>>({}); // verdictele primite în sesiunea asta
  const [error, setError] = useState<string | null>(null);
  const [retake, setRetake] = useState<string | null>(null); // NO_PERSON / REFA_POZA la poza operatorului: de ce
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
      if (d.operatorCheck) setOperator((prev) => prev ?? fromDay(d.operatorCheck!));
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
  const zonesComplete = done !== null && zone === null;
  // pasul operatorului e activ după zone; complet = zonele + (dimineața) poza operatorului
  const operatorActive = withOperator && zonesComplete && operator === null;
  const complete = zonesComplete && (!withOperator || operator !== null);

  const submitZone = useCallback(
    async (photo: CapturedPhoto, forZone: CleaningZone) => {
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        const c = coords ?? (await locationRef.current) ?? null;
        const res = await postCleaningPhoto({ slot, zone: forZone, imageBase64: photo.base64, lat: c?.lat ?? null, lon: c?.lon ?? null });
        setPending(null);
        setResults((r) => ({ ...r, [forZone]: { verdict: res.verdict, problems: res.problems ?? [], description: res.description ?? '' } }));
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

  const submitOperator = useCallback(
    async (photo: CapturedPhoto) => {
      if (sending) return;
      setSending(true);
      setError(null);
      setRetake(null);
      try {
        const c = coords ?? (await locationRef.current) ?? null;
        const res: OperatorPhotoResponse = await postOperatorPhoto({ imageBase64: photo.base64, lat: c?.lat ?? null, lon: c?.lon ?? null });
        setPending(null);
        // Poza trebuie refăcută (nimeni în cadru / nu se văd încălțămintea și capul): serverul n-a scris nimic.
        if (res.code || res.verdict === 'NO_PERSON' || res.verdict === 'REFA_POZA' || !res.operatorCheckId) {
          setRetake(res.message?.trim() || `Refă poza. ${OPERATOR_FRAME_HINT}`);
          return;
        }
        setOperator({ verdict: res.verdict === 'EROARE' ? 'EROARE' : 'OK', uniformOk: res.uniformOk, shavedOk: res.shavedOk, groomedOk: res.groomedOk, at: null });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
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
    [coords, sending],
  );

  function onCaptured(photo: CapturedPhoto) {
    const which = camera;
    setCamera(null);
    setError(null);
    if (which === 'operator') {
      setShot({ zone: 'OPERATOR', photo });
      setPending(photo);
      submitOperator(photo);
      return;
    }
    if (!zone) return;
    setResults((r) => (r[zone] ? { ...r, [zone]: undefined } : r));
    setShot({ zone, photo });
    setPending(photo);
    submitZone(photo, zone);
  }

  function retakeZone() {
    setPending(null);
    setError(null);
    setCamera('zone');
  }

  function retakeOperator() {
    setPending(null);
    setError(null);
    setRetake(null);
    setCamera('operator');
  }

  const total = withOperator ? 4 : 3;
  const sent = (done?.length ?? 0) + (withOperator && operator ? 1 : 0);
  const subtitle = `${sent} din ${total} ${withOperator ? 'pași trimiși' : 'zone trimise'}${gateTime ? ` · înainte de cursa ${gateTime}` : ''}`;
  const anyDirty = CLEANING_ZONES.some((z) => results[z]?.verdict === 'MURDAR');
  const operatorBad = operator ? operatorProblems(operator) : [];

  return (
    <>
      <Screen padding={{ bottom: 24 }}>
        <Header title={SLOT_TITLE[slot]} titleSize={24} subtitle={subtitle} onBack={goBack} />

        {loadError ? (
          <Card tone="danger">
            <Body color={colors.danger}>{loadError}</Body>
            <OutlineButton label="Reîncarcă" tone="neutral" height={48} onPress={load} />
          </Card>
        ) : null}

        {done === null && !loadError ? <ActivityIndicator size="large" color={colors.primary} /> : null}

        {done !== null
          ? CLEANING_ZONES.map((z) => {
              if (done.includes(z)) return <ClosedZone key={z} zone={z} result={results[z] ?? null} />;
              if (z === zone) {
                return (
                  <ActiveZone
                    key={z}
                    zone={z}
                    photo={shot?.zone === z ? shot.photo : null}
                    rejected={results[z]?.verdict === 'ALT_LOC'}
                    error={error}
                    sending={sending}
                    pending={pending}
                    onShoot={() => setCamera('zone')}
                    onResend={() => pending && submitZone(pending, z)}
                    onRetake={retakeZone}
                  />
                );
              }
              return <FutureZone key={z} zone={z} />;
            })
          : null}

        {done !== null && withOperator ? (
          operator ? (
            <ClosedOperator result={operator} />
          ) : operatorActive ? (
            <ActiveOperator
              photo={shot?.zone === 'OPERATOR' ? shot.photo : null}
              retake={retake}
              error={error}
              sending={sending}
              pending={pending}
              onShoot={() => setCamera('operator')}
              onResend={() => pending && submitOperator(pending)}
              onRetake={retakeOperator}
            />
          ) : (
            <FutureOperator />
          )
        ) : null}

        {complete ? (
          <Card tone={anyDirty || operatorBad.length > 0 ? 'danger' : 'success'}>
            <Text style={styles.summaryTitle}>{withOperator ? 'Rezumat deschidere' : 'Rezumat curățenie'}</Text>
            {CLEANING_ZONES.map((z) => {
              const r = results[z];
              const dirty = r?.verdict === 'MURDAR';
              const line = !r
                ? 'trimisă mai devreme'
                : r.verdict === 'CURAT'
                  ? 'curat'
                  : dirty
                    ? `MURDAR — ${r.problems.length > 0 ? r.problems.join('; ') : r.description || 'vezi mai sus'}`
                    : 'trimisă, verificarea automată nu a mers';
              return (
                <Text key={z} style={[styles.summaryLine, dirty ? styles.summaryDirty : styles.summaryClean]}>
                  <Text style={styles.summaryZone}>{ZONE_TITLE[z]}: </Text>
                  {line}
                </Text>
              );
            })}
            {withOperator && operator ? (
              <Text style={[styles.summaryLine, operatorBad.length > 0 ? styles.summaryDirty : styles.summaryClean]}>
                <Text style={styles.summaryZone}>Tu: </Text>
                {operator.verdict === 'EROARE' ? 'poza trimisă, verificarea automată nu a mers' : operatorBad.length > 0 ? operatorBad.join(', ') : 'uniformă, bărbierit, aspect în regulă'}
                {operator.at ? ` (${operator.at})` : ''}
              </Text>
            ) : null}
            {anyDirty || operatorBad.length > 0 ? (
              <Text style={styles.summaryPenalty}>{PENALTY}</Text>
            ) : (
              <Body color={colors.doneText}>{withOperator ? 'Totul e în regulă. Deschiderea turei e completă.' : 'Toate zonele sunt curate. Pozele de curățenie sunt complete.'}</Body>
            )}
            <PrimaryButton label="Am înțeles, înapoi la ziua de azi" size="md" shadow={false} onPress={goBack} />
          </Card>
        ) : null}

        <Spacer />
        <Footnote>Pozele se păstrează 30 de zile. Verdictul intră în raportul de seară al administratorului.</Footnote>
      </Screen>

      {camera === 'zone' && zone ? <PhotoCamera title={ZONE_TITLE[zone]} hint={ZONE_HINT[zone]} confirm confirmLabel="Trimite" onCaptured={onCaptured} onCancel={() => setCamera(null)} /> : null}
      {camera === 'operator' ? <PhotoCamera title={OPERATOR_TITLE} hint={OPERATOR_FRAME_HINT} confirm confirmLabel="Trimite" onCaptured={onCaptured} onCancel={() => setCamera(null)} /> : null}
    </>
  );
}

// ── Cardurile zonelor ─────────────────────────────────────────────────────────

/**
 * Zonă închisă. Curat: bordură 2 `#b7dcc1`, cerc 40 `#e8f3ea` cu bifă, «Curat · descriere»
 * 14 / 600 verde. Murdar: bordură `#e4a3ad`, cerc roz cu X, «MURDAR», lista cu «·» (15 `#333`,
 * la 52 de la stânga), caseta roz cu textul de penalizare. Zonele închise înainte de
 * sesiunea asta (din /day) n-au verdict în aplicație — se arată «Trimisă».
 */
function ClosedZone({ zone, result }: { zone: CleaningZone; result: ZoneResult | null }) {
  const title = ZONE_TITLE[zone];
  if (result?.verdict === 'MURDAR') {
    return (
      <View style={styles.dirtyCard}>
        <View style={styles.zoneRow}>
          <View style={[styles.circle, { backgroundColor: colors.dangerBg }]}>
            <XIcon size={22} />
          </View>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={styles.zoneTitle}>{title}</Text>
            <Text style={styles.dirtyLabel}>MURDAR</Text>
          </View>
        </View>
        {result.problems.length > 0 ? (
          <View style={styles.problems}>
            {result.problems.map((p, i) => (
              <Text key={i} style={styles.problem}>
                · {p}
              </Text>
            ))}
          </View>
        ) : result.description ? (
          <View style={styles.problems}>
            <Text style={styles.problem}>· {result.description}</Text>
          </View>
        ) : null}
        <View style={styles.penalty}>
          <Text style={styles.penaltyText}>{PENALTY}</Text>
        </View>
      </View>
    );
  }
  const clean = result?.verdict === 'CURAT';
  const detail = clean
    ? `Curat${result.description ? ` · ${result.description}` : ''}`
    : result?.verdict === 'EROARE'
      ? 'Trimisă · verificarea automată nu a mers, o vede administratorul'
      : 'Trimisă';
  return (
    <View style={styles.cleanCard}>
      <View style={[styles.circle, { backgroundColor: colors.doneBg }]}>
        <CheckIcon size={22} />
      </View>
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text style={styles.zoneTitle}>{title}</Text>
        <Text style={[styles.cleanDetail, clean ? null : { color: colors.muted }]}>{detail}</Text>
      </View>
    </View>
  );
}

/**
 * Zona activă: bordură 2 bordo, umbră, cerc punctat, numele 20 / 800, hint-ul 15 `#666`,
 * previzualizarea 200 înaltă pe `#2a2426` (ultima poză sau camera cu «imaginea camerei»),
 * «Fă poza» 64 cu declanșator. Când poza nu a plecat: «Trimite din nou» + «Refă poza».
 */
function ActiveZone({
  zone,
  photo,
  rejected,
  error,
  sending,
  pending,
  onShoot,
  onResend,
  onRetake,
}: {
  zone: CleaningZone;
  photo: CapturedPhoto | null;
  rejected: boolean;
  error: string | null;
  sending: boolean;
  pending: CapturedPhoto | null;
  onShoot: () => void;
  onResend: () => void;
  onRetake: () => void;
}) {
  const title = ZONE_TITLE[zone];
  return (
    <ActiveCard
      title={title}
      hint={`${ZONE_HINT[zone]} ${CAMERA_ONLY}`}
      photo={photo}
      notice={rejected ? `Poza nu pare din zona ${title}. Refă din locul corect.` : null}
      error={error}
      sending={sending}
      pending={pending}
      onShoot={onShoot}
      onResend={onResend}
      onRetake={onRetake}
    />
  );
}

/** Zonă viitoare: ca cea activă, fără cameră și fără umbră. */
function FutureZone({ zone }: { zone: CleaningZone }) {
  return <FutureCard title={ZONE_TITLE[zone]} hint={`${ZONE_HINT[zone]} ${CAMERA_ONLY}`} />;
}

// ── Pasul operatorului (dimineața) ────────────────────────────────────────────

/** Poza operatorului e făcută: verde când totul e în regulă, roz cu lista abaterilor altfel. */
function ClosedOperator({ result }: { result: OperatorResult }) {
  const bad = operatorProblems(result);
  if (result.verdict === 'OK' && bad.length > 0) {
    return (
      <View style={styles.dirtyCard}>
        <View style={styles.zoneRow}>
          <View style={[styles.circle, { backgroundColor: colors.dangerBg }]}>
            <XIcon size={22} />
          </View>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={styles.zoneTitle}>{OPERATOR_TITLE}</Text>
            <Text style={styles.dirtyLabel}>NU E ÎN REGULĂ{result.at ? ` · ${result.at}` : ''}</Text>
          </View>
        </View>
        <View style={styles.problems}>
          {bad.map((p, i) => (
            <Text key={i} style={styles.problem}>
              · {p}
            </Text>
          ))}
        </View>
        <View style={styles.penalty}>
          <Text style={styles.penaltyText}>{PENALTY}</Text>
        </View>
      </View>
    );
  }
  const detail = result.verdict === 'EROARE' ? 'Trimisă · verificarea automată nu a mers, o vede administratorul' : `În regulă · uniformă, bărbierit, aspect${result.at ? ` · ${result.at}` : ''}`;
  return (
    <View style={styles.cleanCard}>
      <View style={[styles.circle, { backgroundColor: colors.doneBg }]}>
        <CheckIcon size={22} />
      </View>
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text style={styles.zoneTitle}>{OPERATOR_TITLE}</Text>
        <Text style={[styles.cleanDetail, result.verdict === 'OK' ? null : { color: colors.muted }]}>{detail}</Text>
      </View>
    </View>
  );
}

function ActiveOperator({
  photo,
  retake,
  error,
  sending,
  pending,
  onShoot,
  onResend,
  onRetake,
}: {
  photo: CapturedPhoto | null;
  retake: string | null;
  error: string | null;
  sending: boolean;
  pending: CapturedPhoto | null;
  onShoot: () => void;
  onResend: () => void;
  onRetake: () => void;
}) {
  return (
    <ActiveCard
      title={OPERATOR_TITLE}
      hint={`${OPERATOR_FRAME_HINT} ${CAMERA_ONLY}`}
      photo={photo}
      notice={retake}
      error={error}
      sending={sending}
      pending={pending}
      // poza refuzată de model: butonul principal e «Refă poza», nu «Fă poza»
      shootLabel={retake ? 'Refă poza' : 'Fă poza'}
      onShoot={onShoot}
      onResend={onResend}
      onRetake={onRetake}
      icon={<PersonIcon size={44} strokeWidth={1.8} />}
    />
  );
}

function FutureOperator() {
  return <FutureCard title={OPERATOR_TITLE} hint={`După zone. ${OPERATOR_FRAME_HINT} ${CAMERA_ONLY}`} />;
}

// ── Cardurile comune (zonă sau operator) ──────────────────────────────────────

function ActiveCard({
  title,
  hint,
  photo,
  notice,
  error,
  sending,
  pending,
  shootLabel = 'Fă poza',
  onShoot,
  onResend,
  onRetake,
  icon,
}: {
  title: string;
  hint: string;
  photo: CapturedPhoto | null;
  notice: string | null;
  error: string | null;
  sending: boolean;
  pending: CapturedPhoto | null;
  shootLabel?: string;
  onShoot: () => void;
  onResend: () => void;
  onRetake: () => void;
  icon?: ReactNode;
}) {
  return (
    <View style={[styles.activeCard, shadowCard]}>
      <View style={styles.zoneRow}>
        <View style={styles.dashedCircle} />
        <Text style={styles.activeTitle}>{title}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.preview}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover" accessibilityLabel={`Poza pentru ${title}`} />
        ) : (
          <>
            {icon ?? <CameraIcon size={44} color={colors.primaryText} strokeWidth={1.8} />}
            <Text style={styles.previewText}>imaginea camerei</Text>
          </>
        )}
      </View>
      {notice ? <Body color={colors.danger}>{notice}</Body> : null}
      {error ? <Body color={colors.danger}>{error}</Body> : null}
      {sending ? (
        <PrimaryButton label="Se verifică poza…" shadow={false} disabled onPress={() => undefined} />
      ) : pending ? (
        <>
          <PrimaryButton label="Trimite din nou" shadow={false} onPress={onResend} />
          <OutlineButton label="Refă poza" tone="neutral" height={48} onPress={onRetake} />
        </>
      ) : (
        <PrimaryButton label={shootLabel} shadow={false} icon={<ShutterIcon />} onPress={onShoot} />
      )}
    </View>
  );
}

function FutureCard({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.activeCard}>
      <View style={styles.zoneRow}>
        <View style={styles.dashedCircle} />
        <Text style={styles.activeTitle}>{title}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cleanCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.card, borderWidth: 2, borderColor: colors.doneBorder, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 },
  dirtyCard: { gap: 12, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.dangerBorder, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 },
  activeCard: { gap: 14, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.primary, borderRadius: radius.card, padding: 16 },

  zoneRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dashedCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, flexShrink: 0 },
  zoneTitle: { fontSize: 18, ...weight(700), color: colors.text },
  activeTitle: { fontSize: 20, ...weight(800), color: colors.text, flexShrink: 1 },
  cleanDetail: { fontSize: 14, ...weight(600), color: colors.doneText },
  dirtyLabel: { fontSize: 14, ...weight(700), color: colors.danger },

  problems: { gap: 6, paddingLeft: 52 },
  problem: { fontSize: 15, ...weight(400), color: colors.textSoft, lineHeight: 21 },
  penalty: { marginLeft: 52, backgroundColor: colors.pinkBg, borderRadius: radius.option, paddingVertical: 10, paddingHorizontal: 12 },
  penaltyText: { fontSize: 14, ...weight(700), color: colors.primaryDark, lineHeight: 20 },

  // Rezumatul de la final (Ion, 08.09: «să spună lui unde e curat și ce e murdar»)
  summaryTitle: { fontSize: 17, ...weight(800), color: colors.text },
  summaryLine: { fontSize: 15, ...weight(600), lineHeight: 22 },
  summaryZone: { ...weight(800), color: colors.text },
  summaryClean: { color: colors.doneText },
  summaryDirty: { color: colors.danger },
  summaryPenalty: { fontSize: 14, ...weight(700), color: colors.primaryDark, lineHeight: 20 },

  hint: { fontSize: 15, ...weight(400), color: colors.muted, lineHeight: 22 },
  preview: { height: 200, backgroundColor: colors.camera, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  previewImage: { width: '100%', height: 200 },
  previewText: { fontSize: 13, ...weight(400), color: colors.cameraText },
});
