import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type { UserAlert } from '../api/contracts';

export async function showUnseenAlertNotifications(role: 'library_admin'|'super_admin', alerts: UserAlert[]) {
  const channelId='library-alerts';
  for(const alert of alerts){
    if(alert.readAt)continue;
    const key=`cm-library.local-alert.${role}.${alert.id}`;
    try{
      if(await SecureStore.getItemAsync(key))continue;
      await Notifications.scheduleNotificationAsync({content:{title:alert.title,body:alert.body,data:{alertId:alert.id,kind:alert.kind},sound:'default',...(role==='library_admin'?{channelId}:{})},trigger:null});
      await SecureStore.setItemAsync(key,'shown');
    }catch(error){console.warn('Could not show local alert notification:',error);}
  }
}
