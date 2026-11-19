import { BookOpenCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppPreferences } from '../preferences/AppPreferences';
import { palette } from '../theme';

export function Brand({ themed = false }: { themed?: boolean }) {
  const { colors: preferenceColors } = useAppPreferences();
  const colors = themed ? preferenceColors : palette;
  return (
    <View style={styles.row}>
      <View style={[styles.mark,{ backgroundColor: colors.softAccent, borderColor: colors.border }]}>
        <BookOpenCheck color={colors.primary} size={23} strokeWidth={2.2} />
      </View>
      <View>
        <Text variant="titleLarge" style={[styles.name,{ color: colors.text }]}>CM Library</Text>
        <Text variant="labelSmall" style={[styles.subtitle,{ color: colors.muted }]}>Library Management System</Text>
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
    borderWidth: 1,
  },
  name: { fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { marginTop: 1, letterSpacing: 0.15 },
});
