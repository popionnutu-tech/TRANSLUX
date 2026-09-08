/**
 * Ecranul de conectare — `docs/design/peron-android/Login.dc.html`, element cu element.
 * Codul se tastează într-un TextInput invizibil întins peste cele 6 casete; casetele
 * doar desenează cifrele și cursorul.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, link, setToken } from '../src/api';
import { registerRearm } from '../src/backgroundRearm';
import { isBatteryDone } from '../src/battery';
import { Body, Card, Footnote, PrimaryButton, Screen, Spacer } from '../src/components';
import { PinIcon } from '../src/icons';
import { requestPresencePermissions } from '../src/presence';
import { colors, radius, weight } from '../src/theme';

const CODE_RE = /^\d{6}$/;
const CODE_LENGTH = 6;

/** Explicația de dinaintea cererii de permisiune — Android arată apoi dialogul sistemului. */
function explainLocation(): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(
      'Locația',
      'Locația confirmă că raportul e făcut la stație. Aplicația urmărește locația doar în timpul turei, ca administratorul să știe că ești în zona de lucru. La următorul pas alege «Permite tot timpul».',
      [{ text: 'Am înțeles', onPress: () => resolve() }],
      { cancelable: false, onDismiss: () => resolve() },
    );
  });
}

export default function Login() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInput>(null);

  const valid = CODE_RE.test(code);

  async function connect() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const deviceLabel = `${Constants.deviceName ?? 'Android'} · ${Platform.OS} ${Platform.Version}`;
      const res = await link(code, deviceLabel);
      await setToken(res.token);
      await explainLocation();
      await requestPresencePermissions();
      // Re-armarea din fundal (15 min, supraviețuiește închiderii și repornirii) — o dată, la login.
      await registerRearm().catch((e) => console.warn('[login] re-armarea din fundal nu s-a înregistrat:', e));
      // «Ultimul pas» (bateria) o singură dată; apoi direct ziua.
      router.replace((await isBatteryDone()) ? '/day' : '/battery');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setError('Cod greșit sau expirat');
        else if (e.isOffline) setError('Fără internet. Încearcă din nou când revine semnalul.');
        else if (e.code === 'NO_API_URL') setError('Aplicația nu are adresa serverului (EXPO_PUBLIC_API_URL).');
        else setError(e.message);
      } else {
        setError('Ceva nu a mers. Încearcă din nou.');
      }
    } finally {
      setBusy(false);
    }
  }

  const version = Constants.expoConfig?.version ?? '1.0';
  const deviceName = Constants.deviceName;

  return (
    <Screen padding={{ top: 96, side: 24, bottom: 40 }} gap={40}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>TRANSLUX</Text>
        <Text style={styles.brandSub}>Peron</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cod de conectare</Text>
        <Text style={styles.sectionText}>Șase cifre, de la administrator. Codul e valabil 24 de ore și se folosește o singură dată.</Text>
        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Cod de conectare" style={styles.boxes}>
          {Array.from({ length: CODE_LENGTH }, (_, i) => {
            const digit = code[i];
            const current = !busy && i === code.length;
            const active = digit !== undefined || current;
            return (
              <View key={i} style={[styles.box, { borderColor: active ? colors.primary : colors.border }]}>
                {digit !== undefined ? <Text style={styles.digit}>{digit}</Text> : current ? <View style={styles.cursor} /> : null}
              </View>
            );
          })}
          <TextInput
            ref={input}
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
            caretHidden
            editable={!busy}
            onSubmitEditing={connect}
            style={styles.hiddenInput}
            accessibilityLabel="Cod de conectare"
          />
        </Pressable>
        {error ? (
          <Card tone="danger">
            <Body color={colors.danger}>{error}</Body>
          </Card>
        ) : null}
      </View>

      <PrimaryButton label={busy ? 'Se conectează…' : 'Conectează'} onPress={connect} disabled={!valid || busy} size="md" />

      <View style={styles.permissions}>
        <PinIcon size={24} color={colors.primary} strokeWidth={2} />
        <Text style={styles.permissionsText}>
          După conectare, aplicația cere acces la locație și la cameră. Locația confirmă că raportul e făcut la stație; camera face pozele de curățenie.
        </Text>
      </View>

      <Spacer />
      <Footnote>{deviceName ? `Telefon: ${deviceName} · versiunea ${version}` : `versiunea ${version}`}</Footnote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { gap: 6, alignItems: 'flex-start' },
  wordmark: { fontSize: 34, ...weight(800), letterSpacing: 3, color: colors.primary, lineHeight: 34 },
  brandSub: { fontSize: 18, ...weight(600), color: colors.muted },

  section: { gap: 14 },
  sectionTitle: { fontSize: 20, ...weight(700), color: colors.text },
  sectionText: { fontSize: 16, ...weight(400), color: colors.muted, lineHeight: 23 },

  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, height: 64, backgroundColor: colors.card, borderWidth: 2, borderRadius: radius.option, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 30, ...weight(700), color: colors.text },
  cursor: { width: 3, height: 34, backgroundColor: colors.primary, borderRadius: 2 },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, fontSize: 30 },

  permissions: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.button, paddingVertical: 14, paddingHorizontal: 16 },
  permissionsText: { fontSize: 15, ...weight(400), color: colors.textSoft, lineHeight: 22, flexShrink: 1 },
});
