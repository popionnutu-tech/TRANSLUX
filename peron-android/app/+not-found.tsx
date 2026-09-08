import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton, Screen, Title, Muted } from '../src/components';
import { sizes } from '../src/theme';

export default function NotFound() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Screen>
        <Title>Ecran indisponibil</Title>
        <Muted>Ecranul acesta nu există în versiunea instalată a aplicației.</Muted>
        <View style={{ height: sizes.gap }} />
        <BigButton label="Înapoi la ziua de azi" onPress={() => router.replace('/day')} />
      </Screen>
    </SafeAreaView>
  );
}
