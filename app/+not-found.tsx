import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QL } from '@/constants/Colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <View style={styles.container}>
        <MaterialCommunityIcons name="compass-off-outline" size={40} color={QL.MUTED} />
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>
        <Text style={styles.subtitle}>The page you&apos;re looking for may have moved.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 6,
    backgroundColor: QL.BG,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: QL.TXT,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 13,
    color: QL.MUTED,
    marginBottom: 8,
  },
  link: {
    marginTop: 15,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: QL.GOLD,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    color: QL.BG,
  },
});
