import { NavigationContainer, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, ScanLine, UserRound } from 'lucide-react-native';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { Brand } from './src/components/Brand';
import { LoginScreen, RegisterScreen, ForgotPinScreen, LibraryApplicationScreen, SuperAdminApprovalsScreen } from './src/screens/AuthScreens';
import { LibraryAdminDashboard, LibraryAssistantScreen } from './src/screens/AdminScreens';
import { HomeScreen, ProfileScreen, ScanScreen } from './src/screens/StudentScreens';
import { RootStackParamList, StudentTabParamList } from './src/navigation/types';
import { paperTheme, palette } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<StudentTabParamList>();

function StudentTabs() {
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerTitle: () => <Brand />,
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: palette.background, height: 72 },
        headerTitleContainerStyle: { left: 20 },
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: '#9C8D87',
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: palette.background,
          borderTopColor: palette.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => {
          const iconSize = Math.min(size, 21);
          if (route.name === 'Home') return <Home color={color} size={iconSize} />;
          if (route.name === 'Scan') return <ScanLine color={color} size={iconSize} />;
          return <UserRound color={color} size={iconSize} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tabs.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <NavigationContainer theme={{
          ...NavigationDefaultTheme,
          colors: { ...NavigationDefaultTheme.colors, background: palette.background, card: palette.background, primary: palette.primary, text: palette.text, border: palette.border },
        }}>
          <StatusBar barStyle="dark-content" />
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
              animation: 'slide_from_right',
            }}
          >
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
      </PaperProvider>
    </SafeAreaProvider>
  );
}
