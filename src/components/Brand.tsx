import { BookOpenCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { palette } from '../theme';

export function Brand() {
  return (
    <View style={styles.row}>
      <View style={styles.mark}>
        <BookOpenCheck color={palette.primary} size={23} strokeWidth={2.2} />
      </View>
      <View>
        <Text variant="titleLarge" style={styles.name}>CM Library</Text>
        <Text variant="labelSmall" style={styles.subtitle}>Library Management System</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: {
    height: 48,
    width: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.lightPink,
    borderWidth: 1,
    borderColor: '#F6CCE0',
  },
  name: { color: palette.text, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: palette.muted, marginTop: 1, letterSpacing: 0.15 },
});
