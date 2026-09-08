/**
 * «Ultimul pas» (spec peron-app-tracking-always, S01): după permisiunile de locație,
 * operatorul scoate aplicația de la optimizarea bateriei — altfel Android o poate opri
 * în fundal și seara apar goluri «fără semnal». Apare o singură dată, la login; din
 * ecranul zilei se redeschide din rândul de reamintire, până la «Am făcut».
 * Aceeași așezare ca ecranul de conectare (mockup TRANSLUX); fără rând GPS.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { markBatteryDone, openBatterySettings } from '../src/battery';
import { Body, Card, Footnote, OutlineButton, PrimaryButton, Question, Screen, Spacer } from '../src/components';
import { colors, weight } from '../src/theme';

export default function Battery() {
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      await openBatterySettings();
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    await markBatteryDone();
    if (router.canGoBack()) router.back();
    else router.replace('/day');
  }

  return (
    <Screen padding={{ top: 96, side: 24, bottom: 40 }} gap={40}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>TRANSLUX</Text>
        <Text style={styles.brandSub}>Peron</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ultimul pas</Text>
        <Text style={styles.sectionText}>
          Telefonul trebuie să lase aplicația să ruleze în fundal. Altfel oprește urmărirea când ecranul e stins, iar seara apar goluri «fără semnal».
        </Text>
        <Card>
          <Question>Ce ai de făcut</Question>
          <Body bold="1.">Apasă «Deschide setările».</Body>
          <Body bold="2.">În fereastra telefonului alege «Permite» (sau «Fără restricții»).</Body>
          <Body bold="3.">Revino aici și apasă «Am făcut».</Body>
        </Card>
      </View>

      <View style={styles.buttons}>
        <PrimaryButton label={busy ? 'Se deschide…' : 'Deschide setările'} onPress={open} disabled={busy} size="md" />
        <OutlineButton label="Am făcut" onPress={done} />
      </View>

      <Spacer />
      <Footnote>Pe Xiaomi, Huawei sau Samsung mai poate fi nevoie de «Autostart» sau «Fără restricții» din setările telefonului. Pașii sunt în ghidul de instalare.</Footnote>
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

  buttons: { gap: 12 },
});
