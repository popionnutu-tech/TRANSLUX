import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getToken } from '../src/api';
import { colors } from '../src/theme';

/** Punctul de intrare: cu token → ziua, fără → login. */
export default function Index() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getToken().then((t) => {
      if (alive) setHasToken(!!t);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (hasToken === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <Redirect href={hasToken ? '/day' : '/login'} />;
}
