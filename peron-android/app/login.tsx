import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, link, setToken } from '../src/api';
import { BigButton, Body, Card, Muted, Screen, Title } from '../src/components';
import { requestPresencePermissions } from '../src/presence';
import { colors, sizes } from '../src/theme';

const CODE_RE = /^\d{6}$/;

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
      router.replace('/day');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <Title>TRANSLUX Peron</Title>
        <Body>Introdu codul de 6 cifre primit de la administrator.</Body>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/\D/g, '').slice(0, 6));
            setError(null);
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          placeholder="000000"
          placeholderTextColor={colors.border}
          style={styles.input}
          accessibilityLabel="Cod de conectare"
          onSubmitEditing={connect}
          editable={!busy}
        />
        {error ? (
          <Card tone="danger">
            <Text style={styles.error}>{error}</Text>
          </Card>
        ) : null}
        <BigButton label={busy ? 'Se conectează…' : 'Conectează'} onPress={connect} disabled={!valid || busy} big />
        <View style={{ height: sizes.gap }} />
        <Muted>Codul se generează în admin → Utilizatori → «📱 Cod aplicație» și e valabil 24 de ore, o singură dată.</Muted>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: sizes.radius,
    paddingVertical: 16,
    backgroundColor: colors.card,
  },
  error: { fontSize: sizes.text, color: colors.danger, fontWeight: '600' },
});
