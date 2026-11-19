import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Image, Linking, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Brightness from 'expo-brightness';
import { BookOpen, CalendarDays, Check, ChevronRight, Clock3, Languages, LockKeyhole, LogOut, MessageCircle, Moon, Phone, QrCode, ScanLine, Sun, UserRound, Bell, CircleAlert, RefreshCw } from 'lucide-react-native';
import { Button, Dialog, Divider, Portal, Surface, Text, TextInput } from 'react-native-paper';
import { libraryApi } from '../api/libraryApi';
import type { AttendanceDay, Notice, StudentFeeSummary, StudentMembershipPass, StudentProfile } from '../api/contracts';
import { clearTokens } from '../api/secureSession';
import type { RootStackParamList, StudentTabParamList } from '../navigation/types';
import { useAppPreferences, useStudentCopy } from '../preferences/AppPreferences';
import { getUnreadNoticeCount, markNoticesSeen } from '../utils/noticeReadState';

type HomeProps = BottomTabScreenProps<StudentTabParamList, 'Home'>;
type ScanProps = BottomTabScreenProps<StudentTabParamList, 'Scan'>;
type ProfileProps = BottomTabScreenProps<StudentTabParamList, 'Profile'>;
type NoticesProps = BottomTabScreenProps<StudentTabParamList, 'Notices'>;
type OverdueProps = BottomTabScreenProps<StudentTabParamList, 'Overdue'>;

function monthKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function formatTime(value?: string | null) { return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
function formatRupees(value: number) { return `₹${Math.max(0, Number(value) || 0).toLocaleString('en-IN')}`; }
function useScreenStyles() {
  const { colors } = useAppPreferences();
  return useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 28, gap: 16 },
    heading: { gap: 5, marginBottom: 2 }, title: { color: colors.text, fontWeight: '800' }, body: { color: colors.text, fontSize: 16, lineHeight: 24 }, muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, grow: { flex: 1, minWidth: 0 },
    eyebrow: { color: colors.muted, fontSize: 14, fontWeight: '600' }, primaryButton: { minHeight: 54, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.primary }, outlineButton: { minHeight: 50, borderRadius: 15, justifyContent: 'center', borderColor: colors.border },
    badge: { backgroundColor: colors.softAccent, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 30, alignSelf: 'flex-start', maxWidth: '100%' }, badgeText: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
    iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softAccent }, avatar: { width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softAccent },
    line: { height: 1, backgroundColor: colors.border }, dayCell: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', margin: 2 }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20 }, success: { color: colors.success, fontSize: 14 }, empty: { alignItems: 'center', padding: 24, gap: 10 }, camera: { height: 380, borderRadius: 24, overflow: 'hidden', backgroundColor: '#181412' }, scanFrame: { position: 'absolute', top: '20%', left: '12%', right: '12%', bottom: '20%', borderWidth: 3, borderColor: colors.accent, borderRadius: 24 },
    rowButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, qr: { width: 176, height: 176, backgroundColor: '#FFFFFF', borderRadius: 12 }, center: { alignItems: 'center', gap: 12 }, number: { color: colors.text, fontSize: 30, fontWeight: '800' },
  }), [colors]);
}

function Heading({ title, subtitle, styles }: { title: string; subtitle: string; styles: ReturnType<typeof useScreenStyles> }) {
  return <View style={styles.heading}><Text variant="headlineMedium" style={styles.title}>{title}</Text><Text style={styles.muted}>{subtitle}</Text></View>;
}
function ErrorLine({ text, onRetry, styles }: { text: string; onRetry: () => void; styles: ReturnType<typeof useScreenStyles> }) {
  return <View style={styles.row}><Text style={[styles.error, styles.grow]}>{text}</Text><Button compact onPress={onRetry} accessibilityLabel="Retry">Retry</Button></View>;
}
function InfoRow({ icon, label, value, styles }: { icon: ReactNode; label: string; value: string; styles: ReturnType<typeof useScreenStyles> }) {
  return <View style={styles.row}><View style={styles.iconBox}>{icon}</View><View style={styles.grow}><Text style={styles.muted}>{label}</Text><Text style={[styles.body, { fontWeight: '700' }]}>{value}</Text></View></View>;
}

export function HomeScreen({ navigation }: HomeProps) {
  const styles = useScreenStyles(); const copy = useStudentCopy(); const { colors } = useAppPreferences();
  const [profile, setProfile] = useState<StudentProfile | null>(null); const [days, setDays] = useState<AttendanceDay[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [open, setOpen] = useState<AttendanceDay | null>(null); const [statusKnown, setStatusKnown] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [p, a] = await Promise.all([libraryApi.getStudentProfile(), libraryApi.getAttendance(monthKey())]); setProfile(p); setDays(a); setOpen(a.find(x => !x.checkOutAt) ?? null); setStatusKnown(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your library details.'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const checkedDates = new Set(days.map(d => d.date.slice(0, 10)));
  const now = new Date(); const offset = new Date(now.getFullYear(), now.getMonth(), 1).getDay(); const max = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const streakCursor = new Date(); const todayKey = `${streakCursor.getFullYear()}-${String(streakCursor.getMonth()+1).padStart(2,'0')}-${String(streakCursor.getDate()).padStart(2,'0')}`;
  if (!checkedDates.has(todayKey)) streakCursor.setDate(streakCursor.getDate()-1);
  let streak = 0; for (let d = streakCursor; checkedDates.has(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); d.setDate(d.getDate()-1)) streak++;
  const cta = open ? copy.checkOut : copy.scanIn;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.between}><View style={styles.grow}><Text variant="headlineSmall" style={styles.title}>{copy.greeting}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</Text><Text style={styles.muted}>{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</Text></View><Button compact mode="text" onPress={() => navigation.navigate('Profile')} icon={() => <UserRound size={20} color={colors.primary} />} accessibilityLabel="Open profile">Profile</Button></View>
    {error ? <Surface style={styles.card}><ErrorLine text={error} onRetry={() => void load()} styles={styles} /></Surface> : null}
    <Surface elevation={0} style={[styles.card, { borderColor: open ? colors.success : colors.border }]}>
      <View style={styles.between}><View style={styles.row}><View style={[styles.iconBox,{backgroundColor:open?colors.successBg:colors.softAccent}]}>{open ? <Check size={22} color={colors.success}/> : <Clock3 size={22} color={colors.muted}/>}</View><View style={styles.grow}><Text variant="titleLarge" style={styles.title}>{loading ? 'Loading status…' : statusKnown ? open ? copy.checkedIn : copy.notCheckedIn : 'Attendance status unavailable'}</Text><Text style={styles.muted}>{open ? `Since ${formatTime(open.checkInAt)}` : statusKnown ? 'Scan the library code when you arrive.' : 'Reconnect to check your current attendance.'}</Text></View></View></View>
      {open ? <View style={styles.between}><Text style={styles.eyebrow}>TIME IN LIBRARY</Text><LiveDuration startedAt={open.checkInAt} color={colors.success} /></View> : null}
      {open?<Text style={[styles.body,{fontWeight:'700',color:colors.success}]}>To sign out, open Scan and tap “Check out now”. No second QR scan is needed.</Text>:null}
      <Button mode="contained" icon={() => open?<LogOut color={colors.primaryText} size={21}/>:<ScanLine color={colors.primaryText} size={21}/>} style={styles.primaryButton} contentStyle={{minHeight:52}} onPress={() => navigation.navigate('Scan')}>{open?'Go to sign out':cta}</Button>
      {profile ? <View style={styles.row}><View style={styles.badge}><Text style={styles.badgeText}>Seat {profile.seatNumber}</Text></View><Text style={[styles.muted,styles.grow]}>{profile.libraryName}</Text></View> : null}
    </Surface>
    <Surface elevation={0} style={styles.card}>
      <View style={styles.between}><View><Text variant="titleMedium" style={styles.title}>{copy.attendance}</Text><Text style={styles.muted}>{now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Text></View><View style={styles.center}><Text style={[styles.number,{fontSize:24}]}>{checkedDates.size}</Text><Text style={styles.muted}>{copy.days}</Text></View></View>
      <View style={styles.calendarGrid}>{Array.from({length:offset},(_,i)=><View key={`blank-${i}`} style={styles.dayCell}/>)}{Array.from({length:max},(_,i)=>{const day=i+1;const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const attended=checkedDates.has(date);return <View key={date} accessibilityLabel={`${day}${attended?', attended':''}`} style={[styles.dayCell,{backgroundColor:attended?colors.successBg:colors.background,borderWidth:1,borderColor:attended?colors.success:colors.border}]}><Text style={{fontSize:14,color:attended?colors.success:colors.text,fontWeight:attended?'700':'500'}}>{day}</Text></View>;})}</View>
      <View style={styles.between}><View style={styles.row}><View style={{width:12,height:12,borderRadius:4,backgroundColor:colors.successBg,borderColor:colors.success,borderWidth:1}}/><Text style={styles.muted}>Attended</Text><View style={{width:12,height:12,borderRadius:4,backgroundColor:colors.background,borderColor:colors.border,borderWidth:1}}/><Text style={styles.muted}>No visit</Text></View><Text style={[styles.badgeText,{color:colors.success}]}>{streak} {copy.streak}</Text></View>
    </Surface>
    <Button mode="outlined" icon={() => <Bell size={19} color={colors.primary}/>} style={styles.outlineButton} onPress={() => navigation.navigate('Notices')}>{copy.notices}</Button>
  </ScrollView>;
}

function LiveDuration({ startedAt, color }: { startedAt?: string; color: string }) {
  const [seconds,setSeconds]=useState(()=>Math.max(0,Math.floor((Date.now()-Date.parse(startedAt||''))/1000)));
  useEffect(()=>{const timer=setInterval(()=>setSeconds(Math.max(0,Math.floor((Date.now()-Date.parse(startedAt||''))/1000))),1000);return()=>clearInterval(timer);},[startedAt]);
  const h=String(Math.floor(seconds/3600)).padStart(2,'0'),m=String(Math.floor(seconds%3600/60)).padStart(2,'0'),s=String(seconds%60).padStart(2,'0');
  return <Text style={{fontSize:20,fontWeight:'800',color,fontVariant:['tabular-nums']}}>{h}:{m}:{s}</Text>;
}

export function ScanScreen({ navigation }: ScanProps) {
  const styles=useScreenStyles();const {colors}=useAppPreferences();const [permission,requestPermission]=useCameraPermissions();const [busy,setBusy]=useState(false);const [open,setOpen]=useState<AttendanceDay|null>(null);const [error,setError]=useState('');const [done,setDone]=useState('');
  const load=useCallback(async()=>{try{const a=await libraryApi.getAttendance(monthKey());setOpen(a.find(x=>!x.checkOutAt)??null);}catch{}},[]);useFocusEffect(useCallback(()=>{void load();},[load]));
  const checkout=async()=>{setBusy(true);setError('');try{await libraryApi.checkOutAttendance();setDone('You have checked out.');await load();navigation.navigate('Home');}catch(e){setError(e instanceof Error?e.message:'Could not check out.');}finally{setBusy(false);}};
  const scan=async(data:string)=>{if(busy)return;setBusy(true);setError('');try{const result=await libraryApi.recordQrAttendance(data);setDone(result.status==='checked_in'?'You are checked in.':'You have checked out.');await load();}catch(e){setError(e instanceof Error?e.message:'This library QR could not be read.');}finally{setBusy(false);}};
  if(!permission)return <View style={[styles.screen,styles.empty]}><Text style={styles.body}>Checking camera access…</Text></View>;
  if(open)return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Heading title="You’re checked in" subtitle={`Since ${formatTime(open.checkInAt)} · Your timer keeps running until checkout.`} styles={styles}/><Surface style={styles.card}><View style={styles.center}><Clock3 size={36} color={colors.success}/><LiveDuration startedAt={open.checkInAt} color={colors.success}/><Text style={styles.muted}>Time in library</Text></View></Surface>{error?<Text style={styles.error}>{error}</Text>:null}<Text style={[styles.body,{fontWeight:'700'}]}>To sign out, tap the button below. You do not need to scan the QR again.</Text><Button loading={busy} disabled={busy} mode="contained" style={styles.primaryButton} contentStyle={{minHeight:54}} icon={()=><LogOut color={colors.primaryText} size={21}/>} onPress={()=>void checkout()}>Check out now · Sign out</Button></ScrollView>;
  if(done)return <View style={[styles.screen,styles.content]}><View style={styles.empty}><View style={[styles.iconBox,{backgroundColor:colors.successBg}]}><Check size={28} color={colors.success}/></View><Text variant="headlineSmall" style={styles.title}>{done}</Text><Text style={styles.muted}>Your attendance has been saved.</Text></View><Button mode="contained" style={styles.primaryButton} onPress={()=>navigation.navigate('Home')}>Back to Home</Button></View>;
  if(!permission.granted)return <View style={[styles.screen,styles.content]}><Heading title="Scan library QR" subtitle="Allow camera access once to check in when you arrive." styles={styles}/><View style={styles.empty}><ScanLine size={42} color={colors.primary}/><Text style={styles.body}>Your camera is used only to read the library attendance code.</Text></View><Button mode="contained" style={styles.primaryButton} contentStyle={{minHeight:52}} onPress={()=>void requestPermission()}>Allow camera</Button>{error?<Text style={styles.error}>{error}</Text>:null}</View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Heading title="Scan library QR" subtitle="Place the library’s permanent code inside the frame to check in." styles={styles}/><View style={styles.camera}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={busy?undefined:({data})=>void scan(data)}/><View pointerEvents="none" style={styles.scanFrame}/></View>{busy?<Text style={styles.muted}>Saving attendance…</Text>:null}{error?<Text style={styles.error}>{error}</Text>:null}{done?<Text style={styles.success}>{done}</Text>:null}<Button mode="outlined" style={styles.outlineButton} onPress={()=>navigation.navigate('Home')}>Back to Home</Button></ScrollView>;
}

function AccountRow({ icon, title, subtitle, onPress, styles, danger=false }: { icon:ReactNode;title:string;subtitle?:string;onPress:()=>void;styles:ReturnType<typeof useScreenStyles>;danger?:boolean }) {
  const {colors}=useAppPreferences();return <Button mode="text" onPress={onPress} style={{paddingHorizontal:0}} contentStyle={styles.rowButton} accessibilityRole="button"><View style={styles.iconBox}>{icon}</View><View style={styles.grow}><Text style={{fontSize:16,fontWeight:'700',color:danger?colors.danger:colors.text}}>{title}</Text>{subtitle?<Text style={styles.muted}>{subtitle}</Text>:null}</View><ChevronRight size={20} color={colors.muted}/></Button>;
}
export function ProfileScreen({navigation}:ProfileProps) {
  const styles=useScreenStyles();const copy=useStudentCopy();const {colors,mode,setMode,language,setLanguage}=useAppPreferences();const {width}=useWindowDimensions();const [student,setStudent]=useState<StudentProfile|null>(null);const [pass,setPass]=useState<StudentMembershipPass|null>(null);const [error,setError]=useState('');const [pinOpen,setPinOpen]=useState(false);const [currentPin,setCurrentPin]=useState('');const [newPin,setNewPin]=useState('');const [pinBusy,setPinBusy]=useState(false);const [fullQR,setFullQR]=useState(false);const [oldBrightness,setOldBrightness]=useState<number|null>(null);
  const load=useCallback(async()=>{setError('');try{const [p,q]=await Promise.all([libraryApi.getStudentProfile(),libraryApi.getStudentMembershipPass()]);setStudent(p);setPass(q);}catch(e){setError(e instanceof Error?e.message:'Could not load profile.');}},[]);useFocusEffect(useCallback(()=>{void load();},[load]));
  const showQR=async()=>{setFullQR(true);try{const b=await Brightness.getSystemBrightnessAsync();setOldBrightness(b);await Brightness.setSystemBrightnessAsync(1);}catch{}};const hideQR=async()=>{setFullQR(false);if(oldBrightness!==null)try{await Brightness.setSystemBrightnessAsync(oldBrightness);}catch{}setOldBrightness(null);};
  const logout=()=>Alert.alert('Log out?','You can sign in again any time.',[{text:'Cancel',style:'cancel'},{text:'Log out',style:'destructive',onPress:()=>{void libraryApi.logout().catch(()=>clearTokens()).finally(()=>navigation.getParent<NavigationProp<RootStackParamList>>()?.reset({index:0,routes:[{name:'Login'}]}));}}]);
  const changePin=async()=>{if(newPin.length<4){Alert.alert('PIN too short','Choose a PIN with at least 4 characters.');return;}setPinBusy(true);try{await libraryApi.changePin(currentPin,newPin);setPinOpen(false);setCurrentPin('');setNewPin('');Alert.alert('PIN changed','Your new PIN is ready to use.');}catch(e){Alert.alert('Could not change PIN',e instanceof Error?e.message:'Try again.');}finally{setPinBusy(false);}};
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Heading title={copy.profileTitle} subtitle="Your account, membership pass and preferences." styles={styles}/>{error?<Surface style={styles.card}><ErrorLine text={error} onRetry={()=>void load()} styles={styles}/></Surface>:null}
    <Surface style={styles.card}><View style={styles.center}><View style={styles.avatar}><UserRound size={32} color={colors.primary}/></View><Text variant="headlineSmall" style={styles.title}>{student?.name??'Student'}</Text><Text style={styles.muted}>{student?.libraryName??'CM Library'}</Text></View><View style={styles.line}/>{student?<><InfoRow styles={styles} icon={<Phone size={20} color={colors.primary}/>} label="Mobile number" value={student.mobile}/><InfoRow styles={styles} icon={<BookOpen size={20} color={colors.primary}/>} label="Seat number" value={String(student.seatNumber)}/></>:<Text style={styles.muted}>Loading account details…</Text>}</Surface>
    <Surface style={styles.card}><View style={styles.row}><QrCode size={22} color={colors.primary}/><View style={styles.grow}><Text variant="titleMedium" style={styles.title}>{copy.membership}</Text><Text style={styles.muted}>{pass?.membershipCode??'Your approved membership pass'}</Text></View></View><View style={styles.center}>{pass?.qrDataUrl?<Image source={{uri:pass.qrDataUrl}} style={styles.qr} accessibilityLabel="Membership QR code"/>:<Text style={styles.muted}>Membership QR will appear after approval.</Text>}<Button mode="outlined" style={styles.outlineButton} onPress={()=>void showQR()} disabled={!pass?.qrDataUrl}>Show full screen</Button></View></Surface>
    <Text variant="titleLarge" style={styles.title}>Account</Text><Surface style={styles.card}>
      <AccountRow styles={styles} icon={<CircleAlert size={20} color={colors.primary}/>} title={copy.overdueTitle} subtitle="View fee amount and due date" onPress={()=>navigation.navigate('Overdue')}/><Divider/>
      <AccountRow styles={styles} icon={<LockKeyhole size={20} color={colors.primary}/>} title="Change PIN" subtitle="Update your sign-in PIN" onPress={()=>setPinOpen(true)}/><Divider/>
      <AccountRow styles={styles} icon={<Bell size={20} color={colors.primary}/>} title={copy.notifications} subtitle="Library notices" onPress={()=>navigation.navigate('Notices')}/><Divider/>
      <AccountRow styles={styles} icon={<Languages size={20} color={colors.primary}/>} title={copy.language} subtitle={language==='en'?'English':'हिन्दी'} onPress={()=>setLanguage(language==='en'?'hi':'en')}/><Divider/>
      <AccountRow styles={styles} icon={mode==='dark'?<Moon size={20} color={colors.primary}/>:<Sun size={20} color={colors.primary}/>} title="Appearance" subtitle={mode==='dark'?'Dark mode':mode==='light'?'Light mode':'System setting'} onPress={()=>setMode(mode==='light'?'dark':mode==='dark'?'system':'light')}/><Divider/>
      <AccountRow styles={styles} icon={<LogOut size={20} color={colors.danger}/>} title="Log out" danger onPress={logout}/>
    </Surface>
    <Portal><Dialog visible={pinOpen} onDismiss={()=>setPinOpen(false)}><Dialog.Title>Change PIN</Dialog.Title><Dialog.Content><TextInput mode="outlined" label="Current PIN" secureTextEntry value={currentPin} onChangeText={setCurrentPin} style={{marginBottom:12}}/><TextInput mode="outlined" label="New PIN (4+ characters)" secureTextEntry value={newPin} onChangeText={setNewPin}/></Dialog.Content><Dialog.Actions><Button onPress={()=>setPinOpen(false)}>Cancel</Button><Button loading={pinBusy} onPress={()=>void changePin()}>Save PIN</Button></Dialog.Actions></Dialog></Portal>
    <Modal visible={fullQR} animationType="fade" statusBarTranslucent onRequestClose={()=>void hideQR()}><View style={[styles.screen,{justifyContent:'center',padding:24}]}><View style={[styles.between,{position:'absolute',top:24,left:20,right:20}]}><Text variant="titleLarge" style={styles.title}>Membership QR pass</Text><Button onPress={()=>void hideQR()}>Close</Button></View><View style={styles.center}>{pass?.qrDataUrl?<Image source={{uri:pass.qrDataUrl}} style={[styles.qr,{width:Math.min(260,width-48),height:Math.min(260,width-48)}]}/>:null}<Text variant="titleMedium" style={styles.title}>{student?.name}</Text><Text style={styles.muted}>{pass?.membershipCode}</Text><Text style={styles.muted}>Show this code at your library.</Text></View></View></Modal>
  </ScrollView>;
}

export function OverdueScreen({}:OverdueProps) {
  const styles=useScreenStyles();const copy=useStudentCopy();const {colors}=useAppPreferences();const [fee,setFee]=useState<StudentFeeSummary|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{setFee(await libraryApi.getStudentFeeSummary(monthKey()));}catch(e){setError(e instanceof Error?e.message:'Could not load your fee details.');}finally{setLoading(false);}},[]);useFocusEffect(useCallback(()=>{void load();},[load]));
  const contact=()=>fee?.librarianMobile?void Linking.openURL(`tel:${fee.librarianMobile}`):Alert.alert('Contact librarian','Ask your librarian for payment details.');
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Heading title={copy.overdueTitle} subtitle="See your fee status for this month." styles={styles}/>{error?<Surface style={styles.card}><ErrorLine text={error} onRetry={()=>void load()} styles={styles}/></Surface>:null}<Surface style={styles.card}><Text style={styles.eyebrow}>{fee?.libraryName??'Library fee'}</Text><Text variant="displaySmall" style={[styles.number,{color:fee?.amountDue?colors.warning:colors.success}]}>{loading?'…':formatRupees(fee?.amountDue??0)}</Text><Text variant="titleMedium" style={styles.title}>{loading?'Loading fee status…':fee?.paymentStatus==='paid'?'No payment due':'Amount due'}</Text><Text style={styles.muted}>Monthly fee {formatRupees(fee?.monthlyFee??0)} · Paid {formatRupees(fee?.paidAmount??0)}</Text><View style={styles.line}/><View style={styles.row}><CalendarDays size={20} color={colors.primary}/><Text style={styles.body}>Due date: {fee?.dueDate??'Ask your librarian'}</Text></View><Button mode="contained" icon={()=><MessageCircle color={colors.primaryText} size={20}/>} style={styles.primaryButton} contentStyle={{minHeight:52}} onPress={contact}>{copy.contact}</Button><Text style={styles.muted}>Payments are recorded by your librarian. This screen does not charge your account.</Text></Surface></ScrollView>;
}

export function NoticesScreen({}:NoticesProps) {
  const styles=useScreenStyles();const copy=useStudentCopy();const {colors}=useAppPreferences();const [notices,setNotices]=useState<Notice[]>([]);const [unread,setUnread]=useState(0);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const [list,p]=await Promise.all([libraryApi.getNotices(),libraryApi.getStudentProfile()]);setNotices(list);setUnread(await getUnreadNoticeCount(p.id,list));await markNoticesSeen(p.id,list);setUnread(0);}catch(e){setError(e instanceof Error?e.message:'Could not load notices.');}finally{setLoading(false);}},[]);useFocusEffect(useCallback(()=>{void load();},[load]));
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Heading title={copy.notices} subtitle={unread?`${unread} new ${unread===1?'notice':'notices'}`:'Updates from your library.'} styles={styles}/>{error?<Surface style={styles.card}><ErrorLine text={error} onRetry={()=>void load()} styles={styles}/></Surface>:null}{loading?<Surface style={styles.card}><Text style={styles.muted}>Loading notices…</Text><View style={[styles.line,{height:12,borderRadius:8}]}/><View style={[styles.line,{height:12,width:'72%',borderRadius:8}]}/></Surface>:notices.length?notices.map(n=><Surface key={n.id} style={styles.card}><View style={styles.row}><Bell size={20} color={colors.primary}/><Text variant="titleMedium" style={[styles.title,styles.grow]}>{n.title}</Text></View><Text style={styles.body}>{n.message}</Text><Text style={styles.muted}>{new Date(n.createdAt).toLocaleDateString()}</Text></Surface>):<Surface style={styles.card}><View style={styles.empty}><View style={styles.iconBox}><Bell size={24} color={colors.primary}/></View><Text variant="titleMedium" style={styles.title}>{copy.noNotices}</Text><Text style={styles.muted}>When your library shares an update, it will show here.</Text></View></Surface>}</ScrollView>;
}
