/**
 * Camera aplicației (spec S07/S08): doar poze făcute pe loc, cu camera din spate,
 * pe tot ecranul — galeria nu există nicăieri în aplicație. Poza se comprimă la
 * 1280 px lățime, JPEG 0.8, și pleacă la server ca base64.
 *
 * Aspect după mockup-ul TRANSLUX: fundal `#2a2426`, titlul și hint-ul de cadru sus,
 * declanșator 72 alb cu inel, «Renunță» la stânga; în previzualizare «Refă» / «Trimite».
 *
 * `PhotoCamera` e folosită de ecranul de cursă (poza șoferului, trimisă imediat) și
 * de ecranul de curățenie (`confirm`: previzualizare cu «Trimite» / «Refă»).
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, OutlineButton, PrimaryButton } from './components';
import { colors, weight } from './theme';

export const PHOTO_MAX_WIDTH = 1280;
export const PHOTO_JPEG_QUALITY = 0.8;

/**
 * Cadrul cerut la poza șoferului — copiat literal din apps/bot/src/services/driverCheck.ts
 * (`DRIVER_FRAME_HINT`; aplicația nu importă din bot). Modelul refuză poza (`REFA_POZA`)
 * dacă nu se văd încălțămintea și capul.
 */
export const DRIVER_FRAME_HINT = 'Șoferul din față, întreg: să se vadă încălțămintea și capul';

export interface CapturedPhoto {
  uri: string;
  base64: string;
}

/** Declanșează, redimensionează la 1280 px lățime și dă JPEG 0.8 ca base64. */
export async function takeCompressedPhoto(camera: CameraView): Promise<CapturedPhoto | null> {
  // base64 cerut și de la cameră: dacă micșorarea pică (Samsung A05, 09.09 — «Poza nu a reușit»),
  // poza pleacă așa cum e, mai mare, dar pleacă.
  const pic = await camera.takePictureAsync({ quality: 0.8, base64: true, skipProcessing: false });
  if (!pic) return null;
  try {
    const ctx = ImageManipulator.manipulate(pic.uri);
    if (pic.width > PHOTO_MAX_WIDTH) ctx.resize({ width: PHOTO_MAX_WIDTH });
    const rendered = await ctx.renderAsync();
    const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY, base64: true });
    if (out.base64) return { uri: out.uri, base64: out.base64 };
  } catch (e) {
    console.warn('[camera] micșorarea a picat, trimit originalul:', e instanceof Error ? e.message : e);
  }
  if (pic.base64) return { uri: pic.uri, base64: pic.base64 };
  return null;
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
  // Dimensiune medie cerută direct camerei (≈1280–1920 px lățime): poza iese mică de la
  // început, micșorarea devine opțională, iar originalul de rezervă nu depășește limita
  // serverului nici pe telefoane cu 50 MP (Samsung A05, 09.09).
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  async function onReady() {
    setReady(true);
    try {
      const sizes = (await cameraRef.current?.getAvailablePictureSizesAsync()) ?? [];
      const parsed = sizes
        .map((sz) => ({ sz, w: Number(sz.split('x')[0]), h: Number(sz.split('x')[1]) }))
        .filter((x) => Number.isFinite(x.w) && Number.isFinite(x.h));
      const pick = parsed
        .filter((x) => Math.max(x.w, x.h) >= 1024 && Math.max(x.w, x.h) <= 2048)
        .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))[0];
      if (pick) setPictureSize(pick.sz);
    } catch (e) {
      console.warn('[camera] getAvailablePictureSizesAsync a picat:', e instanceof Error ? e.message : e);
    }
  }
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
      if (!photo) Alert.alert('Poza nu a reușit', 'Camera nu a dat nicio imagine. Încearcă din nou.');
      else if (confirm) setPreview(photo);
      else onCaptured(photo);
    } catch (e) {
      // motivul e afișat ca să-l putem citi de pe telefon (Ion, 09.09: «să vedem motivele»)
      Alert.alert('Poza nu a reușit', `Încearcă din nou.\n\nMotiv: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const canShoot = !!permission?.granted && ready && !busy;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        {preview ? (
          <Image source={{ uri: preview.uri }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel="Previzualizarea pozei" />
        ) : permission?.granted ? (
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" pictureSize={pictureSize} onCameraReady={onReady} />
        ) : (
          <View style={styles.denied}>
            <Body>Aplicația are nevoie de cameră ca să facă poza pe loc.</Body>
            <PrimaryButton label="Permite camera" size="md" shadow={false} onPress={() => requestPermission()} />
          </View>
        )}
        {preview ? (
          <View style={styles.bar}>
            <OutlineButton label="Refă" tone="neutral" height={64} fontSize={19} fontWeight={700} borderRadius={12} onPress={() => setPreview(null)} style={styles.barButton} />
            <PrimaryButton label={confirmLabel} onPress={() => onCaptured(preview)} style={[styles.barButton, { flexGrow: 2 }]} />
          </View>
        ) : (
          <View style={styles.shutterBar}>
            <Pressable onPress={onCancel} disabled={busy} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.cancelText}>Renunță</Text>
            </Pressable>
            <Pressable
              onPress={shoot}
              disabled={!canShoot}
              accessibilityRole="button"
              accessibilityLabel="Fotografiază"
              style={({ pressed }) => [styles.shutter, { opacity: !canShoot && !busy ? 0.45 : pressed ? 0.8 : 1 }]}
            >
              <View style={styles.shutterInner}>{busy ? <ActivityIndicator color={colors.camera} /> : null}</View>
            </Pressable>
            <View style={styles.cancel} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.camera },
  top: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  title: { fontSize: 17, ...weight(700), color: colors.primaryText },
  hint: { fontSize: 14, ...weight(400), color: colors.cameraText, lineHeight: 20 },
  denied: { flex: 1, justifyContent: 'center', padding: 16, gap: 14, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', gap: 10, padding: 16 },
  barButton: { flexGrow: 1, flexBasis: 0 },
  shutterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, paddingHorizontal: 24 },
  cancel: { width: 88, height: 44, justifyContent: 'center' },
  cancelText: { fontSize: 16, ...weight(600), color: colors.primaryText },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.primaryText, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primaryText, alignItems: 'center', justifyContent: 'center' },
});
