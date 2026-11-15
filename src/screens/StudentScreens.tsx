import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BookOpen, CalendarDays, Check, ChevronRight, CircleHelp, Clock3, Info, LockKeyhole, LogOut, Phone, QrCode, ScanLine, ShieldCheck, UserRound } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Button, Dialog, Divider, Portal, Surface, Text, TextInput } from 'react-native-paper';
import { RootStackParamList, StudentTabParamList } from '../navigation/types';
import { AttendanceDay, Notice, StudentMembershipPass, StudentProfile } from '../api/contracts';
import { commonStyles, palette } from '../theme';
import { clearTokens } from '../api/secureSession';
import { libraryApi } from '../api/libraryApi';

type HomeProps = BottomTabScreenProps<StudentTabParamList, 'Home'>;
type ScanProps = BottomTabScreenProps<StudentTabParamList, 'Scan'>;
type ProfileProps = BottomTabScreenProps<StudentTabParamList, 'Profile'>;

export type StudentDashboardData = {
  profile: StudentProfile | null;
  attendance: AttendanceDay[];
  notices: Notice[];
};

function todayGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text variant="headlineMedium" style={styles.title}>{title}</Text>
      {!!subtitle && <Text variant="bodyMedium" style={styles.muted}>{subtitle}</Text>}
    </View>
  );
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={styles.infoText}>
        <Text variant="labelMedium" style={styles.muted}>{label}</Text>
        <Text variant="titleMedium" style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

export function HomeScreen({ route }: HomeProps) {
  const data = route.params as unknown as StudentDashboardData | undefined;
  const [profile, setProfile] = useState<StudentProfile | null>(data?.profile ?? null);
  const [attendance, setAttendance] = useState<AttendanceDay[]>(data?.attendance ?? []);
  const [notices, setNotices] = useState<Notice[]>(data?.notices ?? []);
  useEffect(() => { void Promise.all([libraryApi.getStudentProfile(), libraryApi.getAttendance(new Date().toISOString().slice(0,7)), libraryApi.getNotices()]).then(([p,a,n])=>{setProfile(p);setAttendance(a);setNotices(n);}).catch(()=>{}); }, []);
  const date = new Date();

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content}>
      <View style={styles.greetingRow}>
        <View style={styles.greetingCopy}>
          <Text variant="headlineSmall" style={styles.greeting}>{todayGreeting()}{profile?.name ? `, ${profile.name}` : ''}</Text>
          <Text variant="bodyMedium" style={styles.muted}>Your study space is ready.</Text>
        </View>
        <View style={styles.dateIcon}><CalendarDays color={palette.primary} size={20} /></View>
      </View>
      <Text variant="bodySmall" style={styles.dateText}>{formatDate(date)}</Text>

      <Surface elevation={0} style={styles.profileCard}>
        <View style={styles.cardTitleRow}>
          <View style={styles.studentAvatar}><UserRound color={palette.primary} size={22} /></View>
          <View style={styles.profileHeading}>
            <Text variant="titleMedium" style={styles.value}>Student profile</Text>
            <Text variant="bodySmall" style={styles.muted}>{profile?.libraryName ?? 'Library details appear after sign-in'}</Text>
          </View>
        </View>
        {profile ? (
          <>
            <Divider style={styles.divider} />
            <InfoCard icon={<UserRound color={palette.primary} size={18} />} label="Student" value={profile.name} />
            <InfoCard icon={<Phone color={palette.primary} size={18} />} label="Mobile" value={profile.mobile} />
            <InfoCard icon={<BookOpen color={palette.primary} size={18} />} label="Seat" value={String(profile.seatNumber)} />
          </>
        ) : (
          <Text variant="bodyMedium" style={styles.emptyText}>Your name, mobile number and assigned seat will appear here after your account connects.</Text>
        )}
      </Surface>

      <Surface elevation={0} style={styles.statusCard}>
        <View style={styles.cardTitleRow}>
          <View style={styles.statusGlyph}><Check color={palette.success} size={18} /></View>
          <View style={styles.profileHeading}>
            <Text variant="titleMedium" style={styles.value}>Today’s status</Text>
            <Text variant="bodySmall" style={styles.muted}>{profile?.libraryAddress ?? 'Check in at your library when you arrive.'}</Text>
          </View>
        </View>
        <View style={styles.notCheckedPill}><Clock3 color={palette.primary} size={14} /><Text variant="labelMedium" style={styles.pillText}>Attendance status loads from your account</Text></View>
      </Surface>

      <Surface elevation={0} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <CalendarDays color={palette.primary} size={20} />
          <Text variant="titleMedium" style={[styles.value, { flex: 1 }]}>Attendance this month</Text>
          <Text variant="headlineSmall" style={styles.attendanceCount}>{attendance.length}</Text>
        </View>
        <Text variant="bodySmall" style={styles.muted}>{date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        {attendance.length ? (
          <View style={styles.daysRow}>
            {attendance.slice(0, 14).map((day) => (
              <View key={day.date} style={styles.dayPill} accessibilityLabel={day.date} />
            ))}
          </View>
        ) : (
          <View style={styles.attendanceEmpty}>
            <Text variant="bodySmall" style={styles.muted}>Attendance history appears after your account connects.</Text>
          </View>
        )}
      </Surface>

      <Surface elevation={0} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Info color={palette.primary} size={20} />
          <Text variant="titleMedium" style={styles.value}>Library notices</Text>
        </View>
        {notices.length ? notices.map((notice) => (
          <View key={notice.id} style={styles.noticeRow}>
            <Text variant="titleSmall" style={styles.value}>{notice.title}</Text>
            <Text variant="bodySmall" style={styles.muted}>{notice.message}</Text>
          </View>
        )) : <Text variant="bodySmall" style={styles.emptyText}>No notices to show yet.</Text>}
      </Surface>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

export function ScanScreen(_props: ScanProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);

  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(data);
    void libraryApi.recordQrAttendance(data).then(()=>Alert.alert('Attendance recorded','Your check-in or check-out was saved.')).catch((e)=>Alert.alert('QR not accepted',e.message,[{text:'Scan again',onPress:()=>setScanned(null)},{text:'Close',style:'cancel'}]));
  };

  if (!permission) {
    return <View style={styles.center}><Text style={styles.muted}>Checking camera permission…</Text></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <View style={styles.scanIcon}><ScanLine color={palette.primary} size={28} /></View>
        <Text variant="headlineSmall" style={styles.title}>Scan library QR</Text>
        <Text variant="bodyMedium" style={[styles.muted, styles.scanDescription]}>Allow camera access to scan your library’s attendance code.</Text>
        <Button mode="contained" onPress={requestPermission} style={styles.scanButton}>Allow camera</Button>
      </View>
    );
  }

  return (
    <View style={styles.scanScreen}>
      <View style={styles.scanHeader}>
        <Text variant="headlineSmall" style={styles.title}>Scan library QR</Text>
        <Text variant="bodyMedium" style={styles.muted}>Place the code inside the frame to check in or out.</Text>
      </View>
      <View style={styles.cameraFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleScan}
        />
        <View pointerEvents="none" style={styles.scanOverlay}>
          <View style={styles.scanCorners} />
        </View>
      </View>
      <Text variant="bodySmall" style={[styles.muted, styles.scanHint]}>Camera access is used only to read the QR code.</Text>
      {scanned && <Button mode="outlined" onPress={() => setScanned(null)} textColor={palette.primary}>Scan again</Button>}
    </View>
  );
}

function ProfileRow({ icon, title, subtitle, onPress }: { icon: ReactNode; title: string; subtitle?: string; onPress?: () => void }) {
  return (
    <Button
      mode="text"
      onPress={onPress ?? (() => Alert.alert(title, 'This option is not available yet.'))}
      contentStyle={styles.profileRowContent}
      style={styles.profileRow}
      textColor={palette.text}
      accessibilityLabel={title}
    >
      <View style={styles.profileRowInner}>
        <View style={styles.rowIcon}>{icon}</View>
        <View style={styles.profileRowText}>
          <Text variant="titleSmall" style={styles.value}>{title}</Text>
          {!!subtitle && <Text variant="bodySmall" style={styles.muted}>{subtitle}</Text>}
        </View>
        <ChevronRight size={18} color={palette.muted} />
      </View>
    </Button>
  );
}

export function ProfileScreen({ route, navigation }: ProfileProps) {
  const data = route.params as unknown as StudentDashboardData | undefined;
  const [student, setStudent] = useState<StudentProfile | null>(data?.profile ?? null);
  const [pass, setPass] = useState<StudentMembershipPass | null>(null);
  const [pinDialog,setPinDialog]=useState(false);
  const [currentPin,setCurrentPin]=useState('');
  const [nextPin,setNextPin]=useState('');
  const [pinError,setPinError]=useState('');
  const [pinBusy,setPinBusy]=useState(false);
  useEffect(() => { void Promise.all([libraryApi.getStudentProfile(),libraryApi.getStudentMembershipPass()]).then(([p,m])=>{setStudent(p);setPass(m);}).catch(()=>{}); }, []);
  const logout = () => Alert.alert('Log out of CM Library?', 'You will need to sign in again to view your library account.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Log out',
      style: 'destructive',
      onPress: () => {
        void libraryApi.logout().catch(()=>clearTokens()).finally(() => {
          navigation.getParent<NavigationProp<RootStackParamList>>()?.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        });
      },
    },
  ]);

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Your profile" subtitle="Your student account and library details." />
      <Surface elevation={0} style={styles.studentCard}>
        <View style={styles.studentAvatarLarge}><UserRound color={palette.primary} size={28} /></View>
        <Text variant="titleLarge" style={styles.value}>{student?.name ?? 'Student details unavailable'}</Text>
        <Text variant="bodyMedium" style={styles.muted}>{student?.libraryName ?? 'CM Library'}</Text>
        <Divider style={styles.divider} />
        {student ? (
          <View style={styles.profileFacts}>
            <InfoCard icon={<UserRound color={palette.primary} size={18} />} label="Mobile number" value={student.mobile} />
            <InfoCard icon={<BookOpen color={palette.primary} size={18} />} label="Seat number" value={String(student.seatNumber)} />
          </View>
        ) : (
          <Text variant="bodySmall" style={styles.emptyText}>Your profile details load securely after sign-in.</Text>
        )}
      </Surface>

      <Surface elevation={0} style={styles.passCard}>
        {pass?.qrDataUrl ? <Image source={{uri:pass.qrDataUrl}} style={{width:76,height:76,borderRadius:8}} accessibilityLabel="Membership QR code" /> : <View style={styles.passIcon}><QrCode color={palette.primary} size={23} /></View>}
        <View style={styles.profileHeading}>
          <Text variant="titleMedium" style={styles.value}>Membership QR pass</Text>
          <Text variant="bodySmall" style={styles.muted}>{pass ? `Membership ${pass.membershipCode}` : 'Your QR pass appears after the library admin approves your account.'}</Text>
        </View>
      </Surface>

      <Text variant="titleMedium" style={styles.sectionHeading}>Account</Text>
      <Surface elevation={0} style={styles.card}>
        <ProfileRow icon={<CalendarDays color={palette.primary} size={19} />} title="Overdue details" subtitle="Review fees and due dates" />
        <Divider />
        <ProfileRow icon={<LockKeyhole color={palette.primary} size={19} />} title="Change PIN" subtitle="Keep your account secure" onPress={()=>{setPinError('');setPinDialog(true);}} />
        <Divider />
      </Surface>

      <Text variant="titleMedium" style={styles.sectionHeading}>Help & information</Text>
      <Surface elevation={0} style={styles.card}>
        <ProfileRow icon={<ShieldCheck color={palette.primary} size={19} />} title="Privacy policy" />
        <Divider />
        <ProfileRow icon={<Info color={palette.primary} size={19} />} title="About CM Library" subtitle="Library Management System" />
        <Divider />
        <ProfileRow icon={<CircleHelp color={palette.primary} size={19} />} title="Support" subtitle="Contact your library admin" />
      </Surface>
      <Button
        mode="outlined"
        textColor={palette.danger}
        icon={({ size, color }) => <LogOut size={size} color={color} />}
        onPress={logout}
        style={styles.signOutButton}
        contentStyle={styles.buttonContent}
      >
        Log out
      </Button>
      <Portal><Dialog visible={pinDialog} onDismiss={()=>setPinDialog(false)}><Dialog.Title>Change your PIN</Dialog.Title><Dialog.Content><TextInput mode="outlined" label="Current PIN" value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" style={{marginBottom:12}}/><TextInput mode="outlined" label="New PIN (4+ characters)" value={nextPin} onChangeText={setNextPin} secureTextEntry keyboardType="number-pad"/>{!!pinError&&<Text style={{color:palette.danger,marginTop:8}}>{pinError}</Text>}</Dialog.Content><Dialog.Actions><Button onPress={()=>setPinDialog(false)}>Cancel</Button><Button loading={pinBusy} disabled={pinBusy} onPress={()=>{if(nextPin.length<4){setPinError('New PIN must have at least 4 characters.');return;}setPinBusy(true);libraryApi.changePin(currentPin,nextPin).then(()=>{setPinDialog(false);setCurrentPin('');setNextPin('');Alert.alert('PIN updated','Use your new PIN next time you sign in.');}).catch(e=>setPinError(e.message)).finally(()=>setPinBusy(false));}}>Update PIN</Button></Dialog.Actions></Dialog></Portal>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { ...commonStyles.content, gap: 16 },
  screenHeader: { gap: 5, marginBottom: 4 },
  title: { color: palette.text, fontWeight: '800', letterSpacing: -0.6 },
  muted: { color: palette.muted, lineHeight: 21 },
  value: { color: palette.text, fontWeight: '700' },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  greetingCopy: { flex: 1 },
  greeting: { color: palette.text, fontWeight: '800', letterSpacing: -0.6 },
  dateIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.lightPink, alignItems: 'center', justifyContent: 'center' },
  dateText: { color: palette.muted, marginTop: -10, marginBottom: 2 },
  profileCard: { ...commonStyles.card, padding: 18, gap: 14, backgroundColor: palette.surfacePink },
  card: { ...commonStyles.card, gap: 12 },
  statusCard: { ...commonStyles.card, gap: 14, backgroundColor: '#FFFDFC' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileHeading: { flex: 1, gap: 2 },
  studentAvatar: { height: 42, width: 42, borderRadius: 14, backgroundColor: palette.lightPink, alignItems: 'center', justifyContent: 'center' },
  studentAvatarLarge: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lightPink },
  divider: { backgroundColor: palette.border, marginVertical: 2 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { height: 36, width: 36, borderRadius: 12, backgroundColor: palette.lightPink, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, gap: 1 },
  emptyText: { color: palette.muted, lineHeight: 21 },
  statusGlyph: { height: 36, width: 36, borderRadius: 12, backgroundColor: '#E8F6F0', alignItems: 'center', justifyContent: 'center' },
  notCheckedPill: { alignSelf: 'flex-start', borderRadius: 30, backgroundColor: palette.lightPink, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8 },
  pillText: { color: palette.primary, fontSize: 11 },
  attendanceCount: { color: palette.text, fontWeight: '800' },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 10 },
  dayPill: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.accent },
  attendanceEmpty: { minHeight: 88, alignItems: 'center', justifyContent: 'center' },
  noticeRow: { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  bottomSpace: { height: 20 },
  center: { flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', padding: 28 },
  scanIcon: { height: 64, width: 64, borderRadius: 20, backgroundColor: palette.lightPink, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  scanDescription: { textAlign: 'center', marginTop: 8, marginBottom: 18, maxWidth: 300 },
  scanButton: { backgroundColor: palette.primary },
  scanScreen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 28 },
  scanHeader: { gap: 5, marginBottom: 18 },
  cameraFrame: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#181210', minHeight: 360 },
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  scanCorners: { width: 246, height: 246, borderWidth: 3, borderColor: palette.accent, borderRadius: 28, backgroundColor: 'transparent' },
  scanHint: { textAlign: 'center', paddingVertical: 14 },
  sectionHeading: { color: palette.text, fontWeight: '800', marginTop: 4 },
  studentCard: { ...commonStyles.card, alignItems: 'center', gap: 8 },
  passCard: { ...commonStyles.card, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: palette.surfacePink },
  passIcon: { height: 44, width: 44, borderRadius: 15, backgroundColor: palette.lightPink, alignItems: 'center', justifyContent: 'center' },
  profileFacts: { width: '100%', gap: 14 },
  profileRow: { borderRadius: 12, marginHorizontal: -4 },
  profileRowContent: { minHeight: 64, justifyContent: 'flex-start' },
  profileRowInner: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12 },
  rowIcon: { width: 36, alignItems: 'center' },
  profileRowText: { flex: 1, alignItems: 'flex-start' },
  signOutButton: { borderColor: '#E8C4CB', borderRadius: 14, marginTop: 2 },
  buttonContent: { minHeight: 46 },
});
