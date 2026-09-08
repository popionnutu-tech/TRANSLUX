import { router } from 'expo-router';
import { Footnote, Header, PrimaryButton, Screen } from '../src/components';

export default function NotFound() {
  return (
    <Screen>
      <Header title="Ecran indisponibil" titleSize={24} />
      <Footnote align="left">Ecranul acesta nu există în versiunea instalată a aplicației.</Footnote>
      <PrimaryButton label="Înapoi la ziua de azi" size="md" onPress={() => router.replace('/day')} />
    </Screen>
  );
}
