import { NavigationContainer, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Bell, CircleAlert, Home, ScanLine, UserRound } from 'lucide-react-native';
import { StatusBar, View } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { Brand } from './src/components/Brand';
import { LoginScreen, RegisterScreen, ForgotPinScreen, LibraryApplicationScreen, SuperAdminApprovalsScreen } from './src/screens/AuthScreens';
import { LibraryAdminDashboard, LibraryAssistantScreen } from './src/screens/AdminScreens';
import { HomeScreen, ProfileScreen, ScanScreen, NoticesScreen, OverdueScreen } from './src/screens/StudentScreens';
import { RootStackParamList, StudentTabParamList } from './src/navigation/types';
import { buildPaperTheme, lightPalette } from './src/theme';
import { AppPreferencesProvider, useAppPreferences } from './src/preferences/AppPreferences';
import { useStudentCopy } from './src/preferences/AppPreferences';
import { libraryApi } from './src/api/libraryApi';
import { getUnreadNoticeCount } from './src/utils/noticeReadState';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<StudentTabParamList>();

function StudentTabs() {
  const { colors, isDark } = useAppPreferences();
  const copy = useStudentCopy();
  const insets = useSafeAreaInsets();
  const [noticeCount, setNoticeCount] = useState(0);
  useEffect(() => { void Promise.all([libraryApi.getStudentProfile(), libraryApi.getNotices()]).then(async ([profile, notices]) => setNoticeCount(await getUnreadNoticeCount(profile.id, notices))).catch(() => {}); }, []);
  return <PaperProvider theme={buildPaperTheme(isDark)}><StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} /><Tabs.Navigator initialRouteName="Home" screenOptions={({ route }) => ({
    headerTitle: () => <Brand themed />,
    headerTitleAlign: 'left',
    headerStyle: { backgroundColor: colors.background, height: 76 },
    headerTitleContainerStyle: { left: 20 },
    headerShadowVisible: false,
    headerTransparent: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { height: 64 + Math.max(8, insets.bottom), paddingTop: 6, paddingBottom: Math.max(8, insets.bottom), backgroundColor: colors.surface, borderTopColor: colors.border },
    tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
    tabBarIcon: ({ color, size, focused }) => {
      const iconSize = Math.min(size, 22);
      const icon = route.name === 'Home' ? <Home color={color} size={iconSize} />
        : route.name === 'Notices' ? <Bell color={color} size={iconSize} />
        : route.name === 'Scan' ? <ScanLine color={focused ? colors.primaryText : color} size={iconSize} />
        : route.name === 'Overdue' ? <CircleAlert color={color} size={iconSize} />
        : <UserRound color={color} size={iconSize} />;
      return route.name === 'Scan'
        ? <View style={{ width: 52, height: 52, borderRadius: 18, marginTop: -16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 4, borderColor: colors.surface }}>{icon}</View>
        : icon;
    },
  })}>
    <Tabs.Screen name="Home" component={HomeScreen} options={{ title: copy.home }} />
    <Tabs.Screen name="Notices" component={NoticesScreen} options={{ title: copy.notices, tabBarBadge: noticeCount || undefined, tabBarBadgeStyle: { backgroundColor: colors.accent, color: '#FFFFFF' } }} listeners={{ tabPress: () => setNoticeCount(0) }} />
    <Tabs.Screen name="Scan" component={ScanScreen} options={{ title: copy.scan }} />
    <Tabs.Screen name="Overdue" component={OverdueScreen} options={{ title: copy.overdue }} />
    <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: copy.profile }} />
  </Tabs.Navigator></PaperProvider>;
}

function AppNavigator() {
  const colors = lightPalette;
  const paperTheme = buildPaperTheme(false);
  const navBase = NavigationDefaultTheme;
  const navTheme = { ...navBase, colors: { ...navBase.colors, background: colors.background, card: colors.surface, primary: colors.primary, text: colors.text, border: colors.border } };
  return <PaperProvider theme={paperTheme}>
    <NavigationContainer theme={navTheme}>
      <StatusBar barStyle="dark-content" />
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPin" component={ForgotPinScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="LibraryApplication" component={LibraryApplicationScreen} />
        <Stack.Screen name="SuperAdminApprovals" component={SuperAdminApprovalsScreen} />
        <Stack.Screen name="LibraryAdminDashboard" component={LibraryAdminDashboard} />
        <Stack.Screen name="LibraryAssistant" component={LibraryAssistantScreen} />
        <Stack.Screen name="StudentTabs" component={StudentTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  </PaperProvider>;
}

export default function App() {
  return <SafeAreaProvider><AppPreferencesProvider><AppNavigator /></AppPreferencesProvider></SafeAreaProvider>;
}
