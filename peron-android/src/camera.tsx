/**
 * Camera aplicației (spec S07/S08): doar poze făcute pe loc, cu camera din spate,
 * pe tot ecranul — galeria nu există nicăieri în aplicație. Poza se comprimă la
 * 1280 px lățime, JPEG 0.8, și pleacă la server ca base64.
 *
 * `PhotoCamera` e folosită de ecranul de cursă (poza șoferului, trimisă imediat) și
 * de ecranul de curățenie (`confirm`: previzualizare cu «Trimite» / «Refă»).
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton, Body } from './components';
import { colors, sizes } from './theme';

export const PHOTO_MAX_WIDTH = 1280;
export const PHOTO_JPEG_QUALITY = 0.8;

export interface CapturedPhoto {
  uri: string;
  base64: string;
}

/** Declanșează, redimensionează la 1280 px lățime și dă JPEG 0.8 ca base64. */
export async function takeCompressedPhoto(camera: CameraView): Promise<CapturedPhoto | null> {
  const pic = await camera.takePictureAsync({ quality: 0.9 });
  if (!pic) return null;
  const ctx = ImageManipulator.manipulate(pic.uri);
  if (pic.width > PHOTO_MAX_WIDTH) ctx.resize({ width: PHOTO_MAX_WIDTH });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY, base64: true });
  if (!out.base64) return null;
  return { uri: out.uri, base64: out.base64 };
}

export function PhotoCamera({
  title,
  hint,
  confirm = false,
  confirmLabel = 'Trimite',
  onCaptured,
  onCancel,
}: {
  title: string;
  /** Textul de cadru (ex. ZONE_HINT la curățenie), afișat peste cameră. */
  hint?: string;
  /** Cu previzualizare: după declanșare apar «Refă» și «Trimite»; fără — poza pleacă imediat. */
  confirm?: boolean;
  confirmLabel?: string;
  onCaptured: (p: CapturedPhoto) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CapturedPhoto | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  async function shoot() {
    if (!cameraRef.current || busy || !ready) return;
    setBusy(true);
    try {
      const photo = await takeCompressedPhoto(cameraRef.current);
      if (!photo) Alert.alert('Poza nu a reușit', 'Încearcă din nou.');
      else if (confirm) setPreview(photo);
      else onCaptured(photo);
    } catch {
      Alert.alert('Poza nu a reușit', 'Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>{title}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {preview ? (
          <Image source={{ uri: preview.uri }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel="Previzualizarea pozei" />
        ) : permission?.granted ? (
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
        ) : (
          <View style={styles.denied}>
            <Body>Aplicația are nevoie de cameră ca să facă poza pe loc.</Body>
            <BigButton label="Permite camera" onPress={() => requestPermission()} />
          </View>
        )}
        {preview ? (
          <View style={styles.bar}>
            <BigButton label="Refă" tone="neutral" onPress={() => setPreview(null)} style={{ flex: 1 }} />
            <BigButton label={confirmLabel} tone="success" onPress={() => onCaptured(preview)} big style={{ flex: 2 }} />
          </View>
        ) : (
          <View style={styles.bar}>
            <BigButton label="Renunță" tone="neutral" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
            <BigButton
              label={busy ? 'Se procesează…' : '📷 Fotografiază'}
              onPress={shoot}
              disabled={!permission?.granted || !ready || busy}
              big
              style={{ flex: 2 }}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  title: { fontSize: sizes.text + 2, fontWeight: '700', color: '#fff', paddingHorizontal: sizes.padding, paddingTop: sizes.padding, paddingBottom: 4 },
  hint: { fontSize: sizes.textSmall, color: '#e5e7eb', paddingHorizontal: sizes.padding, paddingBottom: 8 },
  denied: { flex: 1, justifyContent: 'center', padding: sizes.padding, gap: sizes.gap, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', gap: 8, padding: sizes.padding, backgroundColor: '#000' },
});
