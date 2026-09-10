/**
 * Cardul «N-am fost la cursă» — cifra de pasageri e obligatorie și aici (Ion, 10.09:
 * «obligatoriu la rutele la care chiar nu a fost operatorul de introdus numărul de
 * pasageri, și la ziua când operatorul nu este»). Operatorul ia cifra de la șofer și
 * o pune; dacă microbuzul n-a venit, apasă «Microbuzul a fost absent». Fără poze, fără
 * GPS. POST /skip scrie cifra în raport și semnul «n-am fost»; părintele reîncarcă ziua.
 *
 * Același card în trei locuri: sub grilă (ziua), în ecranul cursei (deasupra pregătirii)
 * și în ziua fără operator (vinerea la Chișinău), unde e singurul mod de a închide cursa.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, postSkip } from './api';
import { clampPassengers, QUICK_PASSENGERS } from './buildReport';
import { Body, Card, Footnote, Label, OutlineButton, PrimaryButton, Question } from './components';
import { colors, radius, weight } from './theme';
import type { DayTrip, SkipResponse } from './types';

export function SkipCard({
  trip,
  dayOff,
  onSaved,
  onConflict,
  onCancel,
}: {
  trip: DayTrip;
  /** Zi fără operator: titlul e «Cursa HH:MM», nu «N-am fost la cursa HH:MM». */
  dayOff: boolean;
  onSaved: (res: SkipResponse) => void;
  /** 400 / 409 de la server (NOT_NEXT, ALREADY_*, cifră refuzată): grila de pe server e adevărul — părintele reîncarcă ziua. */
  onConflict: (message: string) => void;
  /** null = fără «Renunță» (vinerea cardul stă mereu deschis). */
  onCancel: (() => void) | null;
}) {
  const [passengers, setPassengers] = useState<number | null>(null);
  const [absent, setAbsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = !saving && (absent || passengers !== null);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postSkip(absent ? { tripId: trip.id, status: 'ABSENT', passengersCount: null } : { tripId: trip.id, status: 'OK', passengersCount: passengers });
      onSaved(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // api.ts a trimis la login
      if (e instanceof ApiError && e.isOffline) {
        setError('Fără internet. Cifra rămâne aici, apasă din nou când revine semnalul.');
      } else if (e instanceof ApiError) {
        onConflict(e.message);
      } else {
        setError('Ceva nu a mers. Apasă din nou «Salvează».');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Question>{dayOff ? `Cursa ${trip.departure_time}` : `N-am fost la cursa ${trip.departure_time}`}</Question>
      <Body>Cifra de pasageri se pune și așa — ia-o de la șofer. Fără poze, fără locație.</Body>

      <Label>Pasageri</Label>
      <View style={styles.counter}>
        <CounterButton label="−" disabled={absent} onPress={() => setPassengers(clampPassengers((passengers ?? 0) - 1))} />
        <TextInput
          value={passengers === null ? '' : String(passengers)}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '');
            setPassengers(digits === '' ? null : clampPassengers(Number(digits)));
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="0"
          placeholderTextColor={colors.border}
          editable={!absent}
          style={[styles.counterField, absent ? styles.dimmed : null]}
          accessibilityLabel="Numărul de pasageri spus de șofer"
        />
        <CounterButton label="+" disabled={absent} onPress={() => setPassengers(clampPassengers((passengers ?? 0) + 1))} />
      </View>
      <View style={styles.quickRow}>
        {QUICK_PASSENGERS.map((n) => {
          const selected = !absent && passengers === n;
          return (
            <Pressable
              key={n}
              onPress={() => setPassengers(n)}
              disabled={absent}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.quick, selected ? styles.quickSelected : null, { opacity: absent ? 0.45 : pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.quickText, selected ? styles.quickTextSelected : null]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>

      <OutlineButton
        label="Microbuzul a fost absent"
        tone="neutral"
        height={48}
        color={colors.muted}
        selected={absent}
        selectedTone="danger"
        onPress={() => setAbsent(!absent)}
      />

      {error ? <Footnote align="left">{error}</Footnote> : null}

      <PrimaryButton label={saving ? 'Se salvează…' : 'Salvează'} onPress={save} disabled={!canSave} size="md" />
      {onCancel ? <OutlineButton label="Renunță" tone="neutral" height={44} onPress={onCancel} disabled={saving} /> : null}
    </Card>
  );
}

/** «−» / «+»: ca în ecranul cursei — 64 lat, bordură 2 `#ddd9d5`, rază 12, cifra 30 / 700 `#333`. */
function CounterButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Un pasager în plus' : 'Un pasager în minus'}
      style={({ pressed }) => [styles.counterButton, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.counterButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.45 },
  counter: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  counterButton: { width: 64, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  counterButtonText: { fontSize: 30, ...weight(700), color: colors.textSoft },
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
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: { flexGrow: 1, flexBasis: 0, height: 52, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderRadius: radius.option, alignItems: 'center', justifyContent: 'center' },
  quickSelected: { backgroundColor: colors.selectedBg, borderColor: colors.selectedBorder },
  quickText: { fontSize: 18, ...weight(700), color: colors.textSoft },
  quickTextSelected: { color: colors.selectedText },
});
