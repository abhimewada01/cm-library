import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { libraryApi } from '../api/libraryApi';
import { savePushToken } from './pushTokenStorage';

export type PushSetupResult = 'registered' | 'expo-go' | 'missing-project' | 'permission-denied' | 'unsupported';

export async function registerAdminPushNotifications(): Promise<PushSetupResult> {
  if (Platform.OS === 'web') return 'unsupported';
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'permission-denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('library-alerts', {
      name: 'Library alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#B83272',
    });
  }

  // Expo Go still supports local alerts, but not remote push on Android.
  if (Constants.appOwnership === 'expo') return 'expo-go';
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return 'missing-project';

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await libraryApi.registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
  await savePushToken(token.data);
  return 'registered';
}
