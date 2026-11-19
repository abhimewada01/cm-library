import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { darkPalette, lightPalette } from '../theme';
import type { Palette } from '../theme';

export type AppearanceMode = 'light' | 'dark' | 'system';
export type AppLanguage = 'en' | 'hi';
type AppPreferencesValue = {
  mode: AppearanceMode;
  language: AppLanguage;
  isDark: boolean;
  colors: Palette;
  setMode: (mode: AppearanceMode) => void;
  setLanguage: (language: AppLanguage) => void;
};

const PreferencesContext = createContext<AppPreferencesValue | null>(null);
const MODE_KEY = 'cm-library.appearance';
const LANGUAGE_KEY = 'cm-library.language';

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeValue] = useState<AppearanceMode>('system');
  const [language, setLanguageValue] = useState<AppLanguage>('en');

  useEffect(() => {
    void Promise.all([SecureStore.getItemAsync(MODE_KEY), SecureStore.getItemAsync(LANGUAGE_KEY)]).then(([savedMode, savedLanguage]) => {
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') setModeValue(savedMode);
      if (savedLanguage === 'en' || savedLanguage === 'hi') setLanguageValue(savedLanguage);
    }).catch(() => {});
  }, []);

  const setMode = useCallback((next: AppearanceMode) => {
    setModeValue(next);
    void SecureStore.setItemAsync(MODE_KEY, next).catch(() => {});
  }, []);
  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageValue(next);
    void SecureStore.setItemAsync(LANGUAGE_KEY, next).catch(() => {});
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const value = useMemo(() => ({ mode, language, isDark, colors: isDark ? darkPalette : lightPalette, setMode, setLanguage }), [mode, language, isDark, setMode, setLanguage]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('AppPreferencesProvider is missing.');
  return value;
}

export function useStudentCopy() {
  const { language } = useAppPreferences();
  return useMemo(() => language === 'hi' ? {
    home: 'होम', scan: 'स्कैन', profile: 'प्रोफ़ाइल', notices: 'सूचनाएँ', overdue: 'बकाया शुल्क',
    greeting: 'नमस्ते', scanIn: 'लाइब्रेरी में आने के लिए स्कैन करें', checkOut: 'अभी चेक आउट करें',
    checkedIn: 'आप लाइब्रेरी में हैं', notCheckedIn: 'अभी चेक इन नहीं किया', attendance: 'इस महीने की उपस्थिति',
    days: 'दिन', streak: 'लगातार दिन', noNotices: 'अभी कोई नई सूचना नहीं है।',
    profileTitle: 'आपकी प्रोफ़ाइल', membership: 'सदस्यता QR पास', overdueTitle: 'बकाया शुल्क', contact: 'लाइब्रेरियन से संपर्क करें',
    loading: 'लोड हो रहा है…', retry: 'फिर कोशिश करें', language: 'भाषा', darkMode: 'डार्क मोड', notifications: 'सूचनाएँ',
  } : {
    home: 'Home', scan: 'Scan', profile: 'Profile', notices: 'Notices', overdue: 'Overdue',
    greeting: 'Hello', scanIn: 'Scan to check in', checkOut: 'Check out now',
    checkedIn: 'You’re checked in', notCheckedIn: 'Not checked in', attendance: 'Attendance this month',
    days: 'days', streak: 'day streak', noNotices: 'No new notices right now.',
    profileTitle: 'Your profile', membership: 'Membership QR pass', overdueTitle: 'Overdue details', contact: 'Contact librarian',
    loading: 'Loading…', retry: 'Try again', language: 'Language', darkMode: 'Dark mode', notifications: 'Notifications',
  }, [language]);
}
