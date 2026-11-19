import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { BarChart3, BellRing, Building2, ChevronRight, ClipboardList, Download, Eye, EyeOff, Home, LogOut, UserRound } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Dialog, HelperText, Portal, Surface, Text, TextInput } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../components/Brand';
import { RootStackParamList } from '../navigation/types';
import { commonStyles, palette } from '../theme';
import { ActiveLibraryOption, LibraryApplication, SubscriptionRecord, SuperAdminLibrary, SuperAdminStudent, UserAlert } from '../api/contracts';
import { libraryApi } from '../api/libraryApi';
import { ActivityIndicator } from 'react-native-paper';
import { escapeHtml, exportHtmlAsPdf, printableDocument } from '../utils/pdfExport';
import { registerAdminPushNotifications } from '../utils/pushRegistration';

type LoginProps = NativeStackScreenProps<RootStackParamList, 'Login'>;
type RegisterProps = NativeStackScreenProps<RootStackParamList, 'Register'>;
type ForgotProps = NativeStackScreenProps<RootStackParamList, 'ForgotPin'>;

function Header({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.header}>
      <Text variant="headlineMedium" style={styles.heading}>{title}</Text>
      <Text variant="bodyMedium" style={styles.description}>{description}</Text>
    </View>
  );
}

function AuthLayout({ children }: PropsWithChildren) {
  return (
    <KeyboardAvoidingView
      style={commonStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Brand />
        {children}
        <Text variant="labelSmall" style={styles.footer}>Your Library. Your Learning Space.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function LoginScreen({ navigation }: LoginProps) {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !pin) {
      setError('Enter your username or mobile number and password or PIN.');
      return;
    }
    setLoading(true);
    try {
      const session = await libraryApi.login(identifier.trim(), pin, remember);
      if (session.role === 'library_admin' || session.role === 'super_admin') {
        void registerAdminPushNotifications().catch((pushError) => console.warn('Push registration is unavailable:', pushError));
      }
      if (session.role === 'student') navigation.replace('StudentTabs');
      else if (session.role === 'super_admin') navigation.replace('SuperAdminApprovals', { name: session.account.name });
      else navigation.replace('LibraryAdminDashboard', { name: session.account.name });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <Surface elevation={0} style={styles.formCard}>
        <Header title="Welcome back" description="Sign in to continue to your library." />
        <TextInput
          mode="outlined"
          label="Username or mobile number"
          value={identifier}
          onChangeText={(value) => { setIdentifier(value); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="next"
          outlineColor={palette.border}
          activeOutlineColor={palette.primary}
          style={styles.input}
        />
        <View style={styles.passwordWrap}>
          <TextInput
            mode="outlined"
            label="Password or PIN"
            value={pin}
            onChangeText={(value) => { setPin(value); setError(''); }}
            secureTextEntry={!visible}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submit}
            outlineColor={palette.border}
            activeOutlineColor={palette.primary}
            style={styles.input}
          />
          <Pressable
            onPress={() => setVisible((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={12}
            style={styles.eyeButton}
          >
            {visible ? <EyeOff size={19} color={palette.muted} /> : <Eye size={19} color={palette.muted} />}
          </Pressable>
        </View>
        <View style={styles.options}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: remember }}
            onPress={() => setRemember((value) => !value)}
            style={styles.remember}
          >
            <View style={[styles.checkbox, remember && styles.checkboxChecked]} />
            <Text variant="bodySmall" style={styles.mutedText}>Remember me</Text>
          </Pressable>
          <Button compact mode="text" textColor={palette.primary} onPress={() => navigation.navigate('ForgotPin')}>
            Forgot PIN?
          </Button>
        </View>
        {!!error && <HelperText type="error" visible style={styles.error}>{error}</HelperText>}
        <Button mode="contained" onPress={submit} loading={loading} disabled={loading} style={styles.primaryButton} contentStyle={styles.buttonContent}>
          Login
        </Button>
        <View style={styles.registerPrompt}>
          <Text variant="bodyMedium" style={styles.mutedText}>New student? </Text>
          <Button compact mode="text" textColor={palette.primary} onPress={() => navigation.navigate('Register')}>
            Register here
          </Button>
        </View>
        <View style={styles.adminPrompt}>
          <Text variant="bodySmall" style={styles.mutedText}>Library admin? </Text>
          <Button compact mode="text" textColor={palette.primary} onPress={() => navigation.navigate('LibraryApplication')}>
            Set up your library
          </Button>
        </View>
      </Surface>
    </AuthLayout>
  );
}

export function RegisterScreen({ navigation }: RegisterProps) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [libraries, setLibraries] = useState<ActiveLibraryOption[]>([]);
  const [libraryId, setLibraryId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { libraryApi.getActiveLibraries().then(setLibraries).catch((e) => setError(e.message)); }, []);
  const submit = async () => {
    if (!name.trim() || !mobile.trim() || !libraryId || pin.length < 4) {
      setError('Enter your name, mobile, library and a PIN with at least 4 characters.');
      return;
    }
    setLoading(true);
    try { await libraryApi.registerStudent({ name: name.trim(), mobile: mobile.trim(), pin, libraryId }); Alert.alert('Request submitted', 'Your student request is pending approval by the library admin.', [{ text: 'OK', onPress: () => navigation.goBack() }]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Registration failed.'); } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <Surface elevation={0} style={styles.formCard}>
        <Header title="Join your library" description="Create a student account to request access." />
        <TextInput mode="outlined" label="Full name" value={name} onChangeText={setName} autoCapitalize="words" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" autoComplete="tel" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <Text variant="labelLarge" style={styles.sectionTitle}>Choose an approved library</Text>
        {libraries.map((item) => <Button key={item.id} mode={libraryId === item.id ? 'contained' : 'outlined'} onPress={() => setLibraryId(item.id)} style={styles.input}>{item.name} · {item.place}</Button>)}
        {!libraries.length && <Text variant="bodySmall" style={styles.approvalHint}>No approved libraries are currently available.</Text>}
        <Text variant="bodySmall" style={styles.approvalHint}>Only Super Admin-approved libraries can accept student registrations.</Text>
        <TextInput mode="outlined" label="Create PIN" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        {!!error && <HelperText type="error" visible style={styles.error}>{error}</HelperText>}
        <Button mode="contained" onPress={submit} loading={loading} disabled={loading} style={styles.primaryButton} contentStyle={styles.buttonContent}>Request registration</Button>
        <Button mode="text" textColor={palette.primary} onPress={() => navigation.goBack()} style={styles.backButton}>Back to login</Button>
      </Surface>
    </AuthLayout>
  );
}

export function ForgotPinScreen({ navigation }: ForgotProps) {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!/^\+?[0-9]{8,15}$/.test(mobile.replace(/[\s()-]/g, ''))) {
      setError('Enter a valid registered mobile number.');
      return;
    }
    setLoading(true);
    try { await libraryApi.requestPinReset(mobile); Alert.alert('Request sent', 'If that mobile belongs to a student account, its library admin can now review the PIN reset request.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send reset request.'); } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <Surface elevation={0} style={styles.formCard}>
        <Header title="Reset your PIN" description="We’ll send a reset request to your library admin." />
        <TextInput mode="outlined" label="Registered mobile number" value={mobile} onChangeText={(value) => { setMobile(value); setError(''); }} keyboardType="phone-pad" autoComplete="tel" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        {!!error && <HelperText type="error" visible style={styles.error}>{error}</HelperText>}
        <Button mode="contained" onPress={submit} loading={loading} disabled={loading} style={styles.primaryButton} contentStyle={styles.buttonContent}>Send reset request</Button>
        <Button mode="text" textColor={palette.primary} onPress={() => navigation.goBack()} style={styles.backButton}>Back to login</Button>
      </Surface>
    </AuthLayout>
  );
}

type LibraryApplicationProps = NativeStackScreenProps<RootStackParamList, 'LibraryApplication'>;
type SuperAdminApprovalsProps = NativeStackScreenProps<RootStackParamList, 'SuperAdminApprovals'>;

export function LibraryApplicationScreen({ navigation }: LibraryApplicationProps) {
  const [adminName, setAdminName] = useState('');
  const [adminMobile, setAdminMobile] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [libraryName, setLibraryName] = useState('');
  const [place, setPlace] = useState('');
  const [seatCount, setSeatCount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!adminName.trim() || !adminMobile.trim() || !adminUsername.trim() || adminPassword.length < 8 ||
      !libraryName.trim() || !place.trim() || !/^\d+$/.test(seatCount) || Number(seatCount) < 1) {
      setError('Enter the admin login details, library name, place and a seat count above zero. Use a password with at least 8 characters.');
      return;
    }
    setLoading(true);
    try { await libraryApi.submitLibraryApplication({ adminName, adminMobile, adminUsername, adminPassword, libraryName, place, seatCount: Number(seatCount) }); Alert.alert('Application received', 'Your admin login and library are pending Super Admin approval. Use the username and password you created after approval.', [{ text: 'OK', onPress: () => navigation.goBack() }]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not submit application.'); } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <Surface elevation={0} style={styles.formCard}>
        <Header title="Set up your library" description="Create a library admin account and send the library details for Super Admin approval." />
        <Text variant="titleSmall" style={styles.sectionTitle}>Admin login</Text>
        <TextInput mode="outlined" label="Admin full name" value={adminName} onChangeText={setAdminName} autoCapitalize="words" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Admin mobile number" value={adminMobile} onChangeText={setAdminMobile} keyboardType="phone-pad" autoComplete="tel" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Admin username" value={adminUsername} onChangeText={setAdminUsername} autoCapitalize="none" autoCorrect={false} outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Create password (8+ characters)" value={adminPassword} onChangeText={setAdminPassword} secureTextEntry autoCapitalize="none" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <Text variant="titleSmall" style={styles.sectionTitle}>Library details</Text>
        <TextInput mode="outlined" label="Library name" value={libraryName} onChangeText={setLibraryName} autoCapitalize="words" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Place / full address" value={place} onChangeText={setPlace} autoCapitalize="words" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Total seats" value={seatCount} onChangeText={setSeatCount} keyboardType="number-pad" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        {!!error && <HelperText type="error" visible style={styles.error}>{error}</HelperText>}
        <Button mode="contained" onPress={submit} loading={loading} disabled={loading} style={styles.primaryButton} contentStyle={styles.buttonContent}>Submit for approval</Button>
        <Text variant="bodySmall" style={styles.approvalHint}>The library and admin login stay pending until Super Admin approval. After approval, students can register and the admin can manage seats and student requests.</Text>
        <Button mode="text" textColor={palette.primary} onPress={() => navigation.goBack()} style={styles.backButton}>Back to login</Button>
      </Surface>
    </AuthLayout>
  );
}

export function SuperAdminApprovalsScreen({ navigation, route }: SuperAdminApprovalsProps) {
  type AdminSection = 'home'|'libraries'|'requests'|'reports'|'profile';
  const insets=useSafeAreaInsets();
  const [applications, setApplications] = useState<LibraryApplication[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [libraries, setLibraries] = useState<SuperAdminLibrary[]>([]);
  const [section, setSection] = useState<AdminSection>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [rejectItem, setRejectItem] = useState<LibraryApplication|null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [selectedLibrary,setSelectedLibrary]=useState<SuperAdminLibrary|null>(null);
  const [libraryStudents,setLibraryStudents]=useState<SuperAdminStudent[]>([]);
  const [studentsLoading,setStudentsLoading]=useState(false);
  const [librarySaving,setLibrarySaving]=useState(false);
  const [libraryError,setLibraryError]=useState('');
  const [seatCountDraft,setSeatCountDraft]=useState('');
  const [subscriptionPlanDraft,setSubscriptionPlanDraft]=useState('Monthly');
  const [subscriptionAmountDraft,setSubscriptionAmountDraft]=useState('');
  const [subscriptionMonthsDraft,setSubscriptionMonthsDraft]=useState('1');
  const [subscriptionPaymentDraft,setSubscriptionPaymentDraft]=useState<'paid'|'pending'>('pending');
  const [editingStudentFee,setEditingStudentFee]=useState<string|null>(null);
  const [studentFeeDraft,setStudentFeeDraft]=useState('');
  const [passwordCurrent,setPasswordCurrent]=useState('');
  const [passwordNext,setPasswordNext]=useState('');
  const [passwordConfirm,setPasswordConfirm]=useState('');
  const [passwordError,setPasswordError]=useState('');
  const [passwordSuccess,setPasswordSuccess]=useState('');
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [plan, setPlan] = useState('Monthly');
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('1');
  const [paymentStatus, setPaymentStatus] = useState<'paid'|'pending'>('pending');
  const reload = () => { setLoading(true); Promise.all([libraryApi.getPendingLibraryApplications(),libraryApi.getSubscriptionHistory(),libraryApi.getSuperAdminLibraries(),libraryApi.getSuperAdminAlerts()]).then(([a,s,l,alertsData])=>{setApplications(a);setSubscriptions(s);setLibraries(l);setAlerts(alertsData);setError('');}).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(reload, []);
  const review = (item: LibraryApplication, decision: 'approve' | 'reject') => {
    if (decision === 'reject') { setRejectItem(item); return; }
    const value = Number(amount);
    const term=Number(months);
    if (!plan.trim() || !amount.trim() || !Number.isFinite(value) || value < 0 || !Number.isInteger(term) || term < 1 || term > 36) { setError('Enter a subscription plan, valid INR amount, and a 1–36 month term.'); return; }
    void libraryApi.reviewLibraryApplication(item.id, { decision: 'approve', subscription: { plan: plan.trim(), amount: value, startsOn: new Date().toISOString().slice(0,10), endsOn: new Date(new Date().setMonth(new Date().getMonth()+term)).toISOString().slice(0,10), paymentStatus } }).then(reload).catch((e) => setError(e.message));
  };
  const confirmReject=async()=>{if(!rejectItem)return;setRejectBusy(true);try{await libraryApi.reviewLibraryApplication(rejectItem.id,{decision:'reject'});setRejectItem(null);reload();}catch(e){setError(e instanceof Error?e.message:'Could not reject the library request.');}finally{setRejectBusy(false);}};
  const logout=async()=>{setLogoutBusy(true);try{await libraryApi.logout();}catch{}finally{setLogoutOpen(false);setLogoutBusy(false);navigation.reset({index:0,routes:[{name:'Login'}]});}};
  const openLibrary=(library:SuperAdminLibrary)=>{setSelectedLibrary(library);setSeatCountDraft(String(library.seatCount));setSubscriptionPlanDraft(library.subscription?.plan||'Monthly');setSubscriptionAmountDraft(String(library.subscription?.amount??''));setSubscriptionMonthsDraft('1');setSubscriptionPaymentDraft(library.subscription?.paymentStatus||'pending');setLibraryError('');setEditingStudentFee(null);setLibraryStudents([]);setStudentsLoading(true);libraryApi.getSuperAdminLibraryStudents(library.id).then(setLibraryStudents).catch(e=>setLibraryError(e instanceof Error?e.message:'Could not load this library students.')).finally(()=>setStudentsLoading(false));};
  const saveSeatCapacity=async()=>{if(!selectedLibrary)return;const seatCount=Number(seatCountDraft);if(!Number.isInteger(seatCount)||seatCount<1){setLibraryError('Enter a whole seat capacity greater than zero.');return;}setLibrarySaving(true);setLibraryError('');try{await libraryApi.updateSuperAdminLibrarySeats(selectedLibrary.id,seatCount);const updated={...selectedLibrary,seatCount};setSelectedLibrary(updated);setLibraries(rows=>rows.map(item=>item.id===updated.id?updated:item));}catch(e){setLibraryError(e instanceof Error?e.message:'Could not update seat capacity.');}finally{setLibrarySaving(false);}};
  const saveLibrarySubscription=async()=>{if(!selectedLibrary)return;const amountValue=Number(subscriptionAmountDraft),monthsValue=Number(subscriptionMonthsDraft);if(!subscriptionPlanDraft.trim()||!subscriptionAmountDraft.trim()||!Number.isFinite(amountValue)||amountValue<0||!Number.isInteger(monthsValue)||monthsValue<1||monthsValue>36){setLibraryError('Enter a plan, a valid fee and a term from 1 to 36 months.');return;}setLibrarySaving(true);setLibraryError('');const startsOn=new Date().toISOString().slice(0,10),end=new Date();end.setMonth(end.getMonth()+monthsValue);try{await libraryApi.addSuperAdminSubscription(selectedLibrary.id,{plan:subscriptionPlanDraft.trim(),amount:amountValue,startsOn,endsOn:end.toISOString().slice(0,10),paymentStatus:subscriptionPaymentDraft});const updated={...selectedLibrary,subscription:{plan:subscriptionPlanDraft.trim(),amount:amountValue,startsOn,endsOn:end.toISOString().slice(0,10),paymentStatus:subscriptionPaymentDraft}};setSelectedLibrary(updated);setLibraries(rows=>rows.map(item=>item.id===updated.id?updated:item));setSubscriptions(await libraryApi.getSubscriptionHistory());}catch(e){setLibraryError(e instanceof Error?e.message:'Could not update the subscription.');}finally{setLibrarySaving(false);}};
  const saveStudentFee=async(student:SuperAdminStudent)=>{if(!selectedLibrary)return;const monthlyFee=Number(studentFeeDraft);if(!studentFeeDraft.trim()||!Number.isFinite(monthlyFee)||monthlyFee<0){setLibraryError('Enter a valid monthly fee.');return;}setLibrarySaving(true);setLibraryError('');try{await libraryApi.updateSuperAdminStudentFee(selectedLibrary.id,student.id,monthlyFee);setLibraryStudents(rows=>rows.map(item=>item.id===student.id?{...item,monthlyFee}:item));setEditingStudentFee(null);}catch(e){setLibraryError(e instanceof Error?e.message:'Could not update student fee.');}finally{setLibrarySaving(false);}};
  const changePassword=async()=>{setPasswordError('');setPasswordSuccess('');if(!passwordCurrent||passwordNext.length<8){setPasswordError('Enter your current password and a new password with at least 8 characters.');return;}if(passwordNext!==passwordConfirm){setPasswordError('The new password and confirmation do not match.');return;}setPasswordBusy(true);try{await libraryApi.changeSuperAdminPassword(passwordCurrent,passwordNext);setPasswordCurrent('');setPasswordNext('');setPasswordConfirm('');setPasswordSuccess('Password updated. Your current session remains active.');}catch(e){setPasswordError(e instanceof Error?e.message:'Could not change your password.');}finally{setPasswordBusy(false);}};
  const feeRevenueThisMonth=libraries.reduce((sum,library)=>sum+library.revenueThisMonth,0);
  const paidSubscriptionRevenue=subscriptions.filter(item=>item.paymentStatus==='paid').reduce((sum,item)=>sum+item.amount,0);
  const activeLibraries=libraries.filter(library=>library.status==='approved').length;
  const exportReport=async()=>{
    const libraryRows=libraries.map(l=>`<tr><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.publicCode)}</td><td>${escapeHtml(l.status)}</td><td>${escapeHtml(l.place)}</td><td>${escapeHtml(l.adminName)} · ${escapeHtml(l.adminUsername)}</td><td>${l.seatCount}</td><td>${l.occupiedSeats}/${l.seatCount}</td><td>${l.activeMembers}</td><td>INR ${l.revenueThisMonth.toLocaleString('en-IN')}</td><td>${escapeHtml(l.subscription?.plan||'—')} · ${escapeHtml(l.subscription?.paymentStatus||'—')}</td></tr>`).join('');
    const body=`<div class="summary"><div class="metric"><small>All libraries</small><b>${libraries.length}</b></div><div class="metric"><small>Approved</small><b>${activeLibraries}</b></div><div class="metric"><small>Pending requests</small><b>${applications.length}</b></div><div class="metric"><small>Member fees this month</small><b>INR ${feeRevenueThisMonth.toLocaleString('en-IN')}</b></div><div class="metric"><small>Paid subscriptions recorded</small><b>INR ${paidSubscriptionRevenue.toLocaleString('en-IN')}</b></div></div><h2>Library portfolio (${libraries.length})</h2>${libraries.length?`<table><thead><tr><th>Library</th><th>ID</th><th>Status</th><th>Location</th><th>Administrator</th><th>Seats</th><th>Occupied</th><th>Members</th><th>Fees this month</th><th>Subscription</th></tr></thead><tbody>${libraryRows}</tbody></table>`:'<p class="empty">No library records.</p>'}<h2>Pending requests</h2><p>${applications.length} library application(s) awaiting review.</p><h2>Subscription history (${subscriptions.length})</h2>${subscriptions.length?`<table><thead><tr><th>Library</th><th>Plan</th><th>Amount</th><th>Status</th><th>Term</th></tr></thead><tbody>${subscriptions.map(s=>`<tr><td>${escapeHtml(s.libraryName)}</td><td>${escapeHtml(s.plan)}</td><td>INR ${s.amount.toLocaleString('en-IN')}</td><td>${escapeHtml(s.paymentStatus)}</td><td>${escapeHtml(s.startsOn)} to ${escapeHtml(s.endsOn)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">No subscription history.</p>'}`;
    try{await exportHtmlAsPdf(printableDocument('Super Admin platform report',`Libraries, subscriptions and revenue · ${new Date().toISOString().slice(0,10)}`,body),`cm-library-super-admin-${new Date().toISOString().slice(0,10)}.pdf`);}
    catch(e){setError(e instanceof Error?e.message:'Could not export PDF report.');}
  };
  const profileButton=(<Pressable accessibilityRole="button" accessibilityLabel="Open Super Admin profile" onPress={()=>setSection('profile')} style={styles.profileIcon}><UserRound size={20} color={palette.primary}/></Pressable>);
  const navItems:[AdminSection,string,typeof Home][]=[['home','Home',Home],['libraries','Libraries',Building2],['requests','Requests',ClipboardList],['reports','Reports',BarChart3],['profile','Profile',UserRound]];
  return (
    <SafeAreaView style={styles.adminSafe} edges={['top']}>
    <KeyboardAvoidingView style={styles.adminRoot} behavior={Platform.OS==='ios'?'padding':'height'}>
      <View style={styles.adminBrand}><Brand/></View>
      <ScrollView style={styles.adminBody} contentContainerStyle={styles.adminContent} keyboardShouldPersistTaps="handled">
        <Surface elevation={0} style={[styles.formCard,styles.adminCard]}>
          <View style={styles.adminTitleRow}><View style={{flex:1}}><Header title={`Good ${new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, ${route.params.name}`} description="Your library portfolio, subscriptions and revenue at a glance." /></View>{profileButton}</View>
          {!!error&&<HelperText type="error" visible>{error}</HelperText>}
          {loading&&<ActivityIndicator color={palette.primary}/>}
          {section==='home'&&<>
            <Text variant="titleMedium" style={styles.sectionTitle}>Platform overview</Text>
            <View style={styles.overviewGrid}>
              <Surface elevation={0} style={styles.overviewTile}><Text variant="bodySmall" style={styles.overviewLabel}>All libraries</Text><Text variant="headlineSmall" style={styles.overviewValue}>{libraries.length}</Text></Surface>
              <Surface elevation={0} style={styles.overviewTile}><Text variant="bodySmall" style={styles.overviewLabel}>Approved</Text><Text variant="headlineSmall" style={styles.overviewValue}>{activeLibraries}</Text></Surface>
              <Surface elevation={0} style={styles.overviewTile}><Text variant="bodySmall" style={styles.overviewLabel}>Pending requests</Text><Text variant="headlineSmall" style={styles.overviewValue}>{applications.length}</Text></Surface>
              <Surface elevation={0} style={styles.overviewTile}><Text variant="bodySmall" style={styles.overviewLabel}>Member fees · this month</Text><Text variant="titleLarge" style={styles.overviewValue}>₹{feeRevenueThisMonth.toLocaleString('en-IN')}</Text></Surface>
            </View>
            <Surface elevation={0} style={[styles.overviewTile,styles.overviewWide]}><Text variant="bodySmall" style={styles.overviewLabel}>Recorded paid subscriptions</Text><Text variant="titleLarge" style={styles.overviewValue}>₹{paidSubscriptionRevenue.toLocaleString('en-IN')}</Text></Surface>
            <Surface elevation={0} style={[styles.apiNotice,{marginTop:12}]}><View style={{flexDirection:'row',alignItems:'center',gap:9,marginBottom:8}}><BellRing size={20} color={palette.primary}/><Text variant="titleMedium" style={styles.overviewValue}>Subscription alerts · {alerts.filter(a=>!a.readAt).length} new</Text></View>{alerts.length?alerts.slice(0,6).map(alert=><View key={alert.id} style={{borderTopWidth:1,borderTopColor:palette.border,paddingTop:9,marginTop:6,gap:4}}><Text variant="titleSmall" style={styles.libraryName}>{alert.title}</Text><Text variant="bodyMedium" style={styles.libraryDetail}>{alert.body}</Text>{alert.pushStatus==='failed'&&<Text variant="bodySmall" style={styles.overviewLabel}>Phone push failed. This alert is still saved in the app.</Text>}<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text variant="bodySmall" style={styles.overviewLabel}>{new Date(alert.createdAt).toLocaleString()}</Text>{!alert.readAt&&<Button compact onPress={()=>void libraryApi.markAlertRead(alert.id).then(reload).catch(e=>setError(e.message))}>Mark read</Button>}</View></View>):<Text variant="bodyMedium" style={styles.libraryDetail}>No expired subscriptions need review.</Text>}{alerts.some(a=>a.pushStatus==='no_device')&&<Text variant="bodySmall" style={[styles.overviewLabel,{marginTop:8}]}>No push device is registered. Lock-screen push needs an installed Android build; Expo Go on Android does not support remote push.</Text>}</Surface>
            <View style={styles.sectionHeader}><Text variant="titleMedium" style={styles.sectionTitle}>Quick access</Text><Button compact onPress={reload} disabled={loading}>Refresh</Button></View>
            <View style={styles.quickGrid}><Button mode="outlined" icon={({size,color})=><Building2 size={size} color={color}/>} onPress={()=>setSection('libraries')} style={styles.quickButton}>Library profiles</Button><Button mode="outlined" icon={({size,color})=><ClipboardList size={size} color={color}/>} onPress={()=>setSection('requests')} style={styles.quickButton}>Review requests</Button><Button mode="outlined" icon={({size,color})=><BarChart3 size={size} color={color}/>} onPress={()=>setSection('reports')} style={styles.quickButton}>View reports</Button></View>
          </>}
          {section==='libraries'&&<>
            <View style={styles.sectionHeader}><View><Text variant="titleLarge" style={styles.overviewValue}>Library profiles</Text><Text variant="bodySmall" style={styles.overviewLabel}>{libraries.length} libraries across the platform</Text></View><Button compact onPress={reload} disabled={loading}>Refresh</Button></View>
            {libraries.map((library)=><Pressable key={library.id} accessibilityRole="button" accessibilityLabel={`Open ${library.name} details and students`} onPress={()=>openLibrary(library)}><Surface elevation={0} style={styles.libraryProfile}>
              <View style={styles.libraryTopRow}><View style={{flex:1,gap:3}}><Text variant="titleMedium" style={styles.libraryName}>{library.name}</Text><Text variant="bodySmall" style={styles.overviewLabel}>{library.publicCode} · {library.place}</Text></View><Text style={[styles.libraryStatus,library.status==='approved'?styles.approvedStatus:library.status==='pending'?styles.pendingStatus:styles.rejectedStatus]}>{library.status.toUpperCase()}</Text></View>
              <View style={styles.libraryDivider}/><Text variant="bodyMedium" style={styles.libraryDetail}>Administrator: {library.adminName}</Text><Text variant="bodyMedium" style={styles.libraryDetail}>Login: {library.adminUsername} · {library.adminMobile}</Text>
              <View style={styles.libraryStats}><Text variant="bodySmall" style={styles.overviewLabel}>{library.activeMembers} members</Text><Text variant="bodySmall" style={styles.overviewLabel}>{library.occupiedSeats}/{library.seatCount} seats</Text><Text variant="bodySmall" style={styles.overviewLabel}>Fees ₹{library.revenueThisMonth.toLocaleString('en-IN')}</Text></View>
              <View style={styles.libraryTapRow}><Text variant="bodySmall" style={styles.librarySubscription}>{library.subscription?`${library.subscription.plan} · ₹${library.subscription.amount.toLocaleString('en-IN')} · ${library.subscription.paymentStatus} · until ${library.subscription.endsOn}`:'No subscription record yet'}</Text><ChevronRight size={18} color={palette.primary}/></View>
              {library.pendingStudents>0&&<Text variant="bodySmall" style={styles.overviewLabel}>{library.pendingStudents} student request{library.pendingStudents===1?'':'s'} awaiting review</Text>}
            </Surface></Pressable>)}
            {!loading&&!libraries.length&&<Text variant="bodyMedium" style={styles.description}>No library profiles are available yet.</Text>}
          </>}
          {section==='requests'&&<>
            <Text variant="titleLarge" style={styles.overviewValue}>Library requests</Text><Text variant="bodySmall" style={styles.overviewLabel}>Review details and set a subscription before approval.</Text>
            <TextInput mode="outlined" label="Subscription plan" value={plan} onChangeText={setPlan} outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input}/>
            <TextInput mode="outlined" label="Subscription amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input}/>
            <TextInput mode="outlined" label="Subscription term (months)" value={months} onChangeText={setMonths} keyboardType="number-pad" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input}/>
            <View style={styles.paymentChoice}><Button mode={paymentStatus==='pending'?'contained':'outlined'} onPress={()=>setPaymentStatus('pending')}>Payment pending</Button><Button mode={paymentStatus==='paid'?'contained':'outlined'} onPress={()=>setPaymentStatus('paid')}>Paid</Button></View>
            {applications.length?applications.map((item)=><Surface key={item.id} elevation={0} style={styles.apiNotice}><View style={{flex:1,gap:6}}><Text variant="titleMedium" style={styles.libraryName}>{item.libraryName}</Text><Text variant="bodyMedium">{item.place} · {item.seatCount} seats</Text><Text variant="bodyMedium">Administrator: {item.adminName} · {item.adminMobile}</Text><Text variant="bodyMedium">Admin login: {item.adminUsername}</Text><View style={styles.requestButtons}><Button mode="contained" buttonColor={palette.primary} textColor="#FFFFFF" onPress={()=>review(item,'approve')}>Approve + subscription</Button><Button mode="outlined" textColor={palette.danger} onPress={()=>review(item,'reject')}>Reject</Button></View></View></Surface>):<Surface elevation={0} style={styles.emptyState}><Text variant="titleSmall" style={styles.overviewValue}>No pending requests</Text><Text variant="bodySmall" style={styles.overviewLabel}>New library applications will appear here.</Text></Surface>}
          </>}
          {section==='reports'&&<>
            <Text variant="titleLarge" style={styles.overviewValue}>Platform reports</Text><Text variant="bodySmall" style={styles.overviewLabel}>Live totals from library and subscription records.</Text>
            <View style={styles.overviewGrid}><Surface elevation={0} style={styles.overviewTile}><Text variant="bodySmall" style={styles.overviewLabel}>Member fees this month</Text><Text variant="titleLarge" style={styles.overviewValue}>₹{feeRevenueThisMonth.toLocaleString('en-IN')}</Text></Surface><Surface elevation={0} style={styles.overviewTile}><Text variant="bodySmall" style={styles.overviewLabel}>Paid subscriptions recorded</Text><Text variant="titleLarge" style={styles.overviewValue}>₹{paidSubscriptionRevenue.toLocaleString('en-IN')}</Text></Surface></View>
            <Button mode="contained" buttonColor={palette.primary} textColor="#FFFFFF" icon={({size,color})=><Download size={size} color={color}/>} onPress={()=>void exportReport()} style={styles.reportButton}>Download library report (PDF)</Button>
            <Text variant="titleMedium" style={styles.sectionTitle}>Subscription history ({subscriptions.length})</Text>
            {subscriptions.map((s)=><Surface key={s.id} elevation={0} style={styles.apiNotice}><View style={{flex:1,gap:3}}><Text variant="titleSmall">{s.libraryName} · {s.plan}</Text><Text>₹{s.amount.toLocaleString('en-IN')} · {s.paymentStatus} · {s.startsOn} to {s.endsOn}</Text><Text>{s.place}</Text></View></Surface>)}
          </>}
          {section==='profile'&&<>
            <View style={styles.profileHero}><View style={styles.profileAvatar}><UserRound color="#FFFFFF" size={28}/></View><Text variant="titleLarge" style={styles.overviewValue}>{route.params.name}</Text><Text variant="bodyMedium" style={styles.overviewLabel}>Super Admin · CM Library</Text></View>
            <Surface elevation={0} style={styles.profileInfo}><Text variant="bodySmall" style={styles.overviewLabel}>ACCESS</Text><Text variant="titleSmall" style={styles.overviewValue}>Platform administrator</Text><Text variant="bodyMedium" style={styles.libraryDetail}>Manage library approvals, subscriptions, profiles and platform reports.</Text></Surface>
            <Text variant="titleMedium" style={styles.sectionTitle}>Change password</Text>
            <TextInput mode="outlined" label="Current password" value={passwordCurrent} onChangeText={setPasswordCurrent} secureTextEntry style={styles.input}/>
            <TextInput mode="outlined" label="New password (8+ characters)" value={passwordNext} onChangeText={setPasswordNext} secureTextEntry style={styles.input}/>
            <TextInput mode="outlined" label="Confirm new password" value={passwordConfirm} onChangeText={setPasswordConfirm} secureTextEntry style={styles.input}/>
            {!!passwordError&&<HelperText type="error" visible>{passwordError}</HelperText>}{!!passwordSuccess&&<Text style={styles.passwordSuccess}>{passwordSuccess}</Text>}
            <Button mode="contained" buttonColor={palette.primary} textColor="#FFFFFF" loading={passwordBusy} disabled={passwordBusy} onPress={()=>void changePassword()} style={styles.reportButton}>Update password</Button>
            <Button mode="outlined" textColor={palette.primary} icon={({size,color})=><LogOut size={size} color={color}/>} onPress={()=>setLogoutOpen(true)} style={styles.logoutButton} contentStyle={styles.actionButtonContent}>Log out</Button>
          </>}
          <HelperText type="error" visible={!!error}>{error}</HelperText>
        </Surface>
        <Text variant="labelSmall" style={styles.footer}>Your Library. Your Learning Space.</Text>
      </ScrollView>
      <View style={[styles.adminTabBar,{paddingBottom:Math.max(6,insets.bottom),height:64+Math.max(6,insets.bottom)}]}>{navItems.map(([value,label,Icon])=><Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:section===value}} onPress={()=>setSection(value)} style={[styles.adminTab,section===value&&styles.adminTabActive]}><Icon size={18} color={section===value?palette.primary:palette.muted}/><Text numberOfLines={1} style={[styles.adminTabLabel,section===value&&styles.adminTabLabelActive]}>{label}</Text>{value==='requests'&&applications.length>0&&<View style={styles.requestDot}/>}</Pressable>)}</View>
      <Portal>
        <Dialog visible={!!selectedLibrary} onDismiss={()=>{if(!librarySaving)setSelectedLibrary(null);}} style={styles.libraryDialog}>
          <Dialog.Title>{selectedLibrary?.name||'Library details'}</Dialog.Title>
          <Dialog.ScrollArea style={styles.libraryDialogScroll}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.libraryDialogContent}>
            {selectedLibrary&&<>
              <Text variant="bodyMedium" style={styles.overviewLabel}>{selectedLibrary.publicCode} · {selectedLibrary.place}</Text>
              <Text variant="bodyMedium" style={styles.libraryDetail}>Admin: {selectedLibrary.adminName} · {selectedLibrary.adminUsername} · {selectedLibrary.adminMobile}</Text>
              <Text variant="titleSmall" style={styles.sectionTitle}>Seat capacity</Text>
              <View style={styles.editRow}><TextInput mode="outlined" label="Total seats" value={seatCountDraft} onChangeText={setSeatCountDraft} keyboardType="number-pad" style={[styles.input,styles.editInput]}/><Button mode="contained" buttonColor={palette.primary} textColor="#FFFFFF" loading={librarySaving} disabled={librarySaving} onPress={()=>void saveSeatCapacity()}>Save seats</Button></View>
              <Text variant="titleSmall" style={styles.sectionTitle}>Update subscription fee</Text>
              <TextInput mode="outlined" label="Plan" value={subscriptionPlanDraft} onChangeText={setSubscriptionPlanDraft} style={styles.input}/>
              <View style={styles.editRow}><TextInput mode="outlined" label="Fee (₹)" value={subscriptionAmountDraft} onChangeText={setSubscriptionAmountDraft} keyboardType="decimal-pad" style={[styles.input,styles.editInput]}/><TextInput mode="outlined" label="Term (months)" value={subscriptionMonthsDraft} onChangeText={setSubscriptionMonthsDraft} keyboardType="number-pad" style={[styles.input,styles.editInput]}/></View>
              <View style={styles.paymentChoice}><Button mode={subscriptionPaymentDraft==='pending'?'contained':'outlined'} onPress={()=>setSubscriptionPaymentDraft('pending')}>Pending</Button><Button mode={subscriptionPaymentDraft==='paid'?'contained':'outlined'} onPress={()=>setSubscriptionPaymentDraft('paid')}>Paid</Button></View>
              <Button mode="contained" buttonColor={palette.primary} textColor="#FFFFFF" loading={librarySaving} disabled={librarySaving} onPress={()=>void saveLibrarySubscription()}>Save subscription update</Button>
              <View style={styles.libraryDivider}/><Text variant="titleMedium" style={styles.overviewValue}>Students ({libraryStudents.length})</Text>
              {studentsLoading?<ActivityIndicator color={palette.primary}/>:libraryStudents.length?libraryStudents.map(student=><Surface key={student.id} elevation={0} style={styles.studentAdminRow}>
                <View style={styles.studentRowTop}><View style={{flex:1,gap:2}}><Text variant="titleSmall" style={styles.libraryName}>{student.name}</Text><Text variant="bodySmall" style={styles.overviewLabel}>{student.mobile} · Seat {student.seatNumber??'—'}</Text></View><Text style={[styles.libraryStatus,student.memberStatus==='active'?styles.approvedStatus:student.memberStatus==='pending'?styles.pendingStatus:styles.rejectedStatus]}>{student.memberStatus.toUpperCase()}</Text></View>
                <View style={styles.studentFeeRow}><Text variant="bodySmall" style={styles.overviewLabel}>Monthly fee ₹{student.monthlyFee.toLocaleString('en-IN')} · {student.memberStatus==='active'?(student.feePaid?'Paid this month':'Due this month'):student.memberStatus}</Text>{editingStudentFee===student.id?<View style={styles.studentFeeEditor}><TextInput mode="outlined" label="Monthly fee ₹" value={studentFeeDraft} onChangeText={setStudentFeeDraft} keyboardType="decimal-pad" style={[styles.input,styles.editInput]}/><Button compact loading={librarySaving} disabled={librarySaving} onPress={()=>void saveStudentFee(student)}>Save</Button><Button compact disabled={librarySaving} onPress={()=>setEditingStudentFee(null)}>Cancel</Button></View>:<Button compact onPress={()=>{setLibraryError('');setEditingStudentFee(student.id);setStudentFeeDraft(String(student.monthlyFee));}}>Edit fee</Button>}</View>
              </Surface>):<Text variant="bodyMedium" style={styles.overviewLabel}>No student accounts in this library yet.</Text>}
              {!!libraryError&&<HelperText type="error" visible>{libraryError}</HelperText>}
            </>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions><Button disabled={librarySaving} onPress={()=>setSelectedLibrary(null)}>Close</Button></Dialog.Actions>
        </Dialog>
        <Dialog visible={logoutOpen} onDismiss={()=>{if(!logoutBusy)setLogoutOpen(false);}}><Dialog.Title>Log out?</Dialog.Title><Dialog.Content><Text>You will need to sign in again to manage CM Library.</Text></Dialog.Content><Dialog.Actions><Button disabled={logoutBusy} onPress={()=>setLogoutOpen(false)}>Cancel</Button><Button buttonColor={palette.primary} textColor="#FFFFFF" loading={logoutBusy} disabled={logoutBusy} onPress={()=>void logout()}>Log out</Button></Dialog.Actions></Dialog>
        <Dialog visible={!!rejectItem} onDismiss={()=>{if(!rejectBusy)setRejectItem(null);}}><Dialog.Title>Reject library request?</Dialog.Title><Dialog.Content><Text>{rejectItem?`Reject ${rejectItem.libraryName}? This admin will not be able to sign in.`:''}</Text></Dialog.Content><Dialog.Actions><Button disabled={rejectBusy} onPress={()=>setRejectItem(null)}>Cancel</Button><Button textColor={palette.danger} loading={rejectBusy} disabled={rejectBusy} onPress={()=>void confirmReject()}>Reject request</Button></Dialog.Actions></Dialog>
      </Portal>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28, gap: 24 },
  formCard: { borderRadius: 24, borderWidth: 1, borderColor: palette.border, padding: 22, backgroundColor: palette.surface, shadowColor: palette.text, shadowOpacity: 0.05, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 2 },
  header: { marginBottom: 18, gap: 7 },
  heading: { color: palette.text, fontWeight: '800', letterSpacing: -0.8 },
  description: { color: palette.muted, lineHeight: 22 },
  input: { backgroundColor: palette.background, marginBottom: 14 },
  passwordWrap: { position: 'relative' },
  eyeButton: { position: 'absolute', right: 16, top: 20, zIndex: 2, padding: 4 },
  options: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -3, marginBottom: 8 },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  checkbox: { height: 18, width: 18, borderRadius: 5, borderWidth: 1.5, borderColor: '#BCA9A1' },
  checkboxChecked: { backgroundColor: palette.primary, borderColor: palette.primary },
  mutedText: { color: palette.muted },
  primaryButton: { backgroundColor: palette.primary, borderRadius: 14 },
  buttonContent: { minHeight: 48 },
  adminSafe: { flex: 1, backgroundColor: palette.background },
  adminRoot: { flex: 1, backgroundColor: palette.background },
  adminBrand: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  adminBody: { flex: 1 },
  adminContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 18, gap: 14 },
  adminCard: { width: '100%', maxWidth: 900, padding: 16, gap: 7 },
  adminTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  profileIcon: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfacePink, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  adminTabBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 2, paddingHorizontal: 4, paddingTop: 6, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: palette.border },
  adminTab: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative' },
  adminTabActive: { backgroundColor: palette.surfacePink },
  adminTabLabel: { color: palette.muted, fontSize: 9, fontWeight: '700' },
  adminTabLabelActive: { color: palette.primary },
  requestDot: { position: 'absolute', top: 4, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  quickButton: { flexGrow: 1, flexBasis: '45%', borderRadius: 12 },
  paymentChoice: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  requestButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  emptyState: { marginTop: 12, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfacePink, padding: 16, gap: 5 },
  reportButton: { borderRadius: 13, marginTop: 12 },
  profileHero: { alignItems: 'center', gap: 7, paddingVertical: 20 },
  profileAvatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  profileInfo: { width: '100%', borderRadius: 15, borderWidth: 1, borderColor: palette.border, padding: 15, gap: 7 },
  logoutButton: { borderRadius: 14, borderColor: palette.border, marginTop: 14 },
  actionButtonContent: { minHeight: 48 },
  passwordSuccess: { color: palette.success, fontWeight: '700', marginTop: 4 },
  libraryDialog: { backgroundColor: '#FFFFFF', width: '94%', maxWidth: 620, alignSelf: 'center' },
  libraryDialogScroll: { maxHeight: 560 },
  libraryDialogContent: { gap: 10, paddingBottom: 10 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  editInput: { flex: 1, minWidth: 130, marginBottom: 0 },
  studentAdminRow: { borderWidth: 1, borderColor: palette.border, borderRadius: 14, backgroundColor: '#FFFFFF', padding: 11, gap: 6 },
  studentRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  studentFeeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  studentFeeEditor: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', flexGrow: 1 },
  error: { marginBottom: 8 },
  registerPrompt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  adminPrompt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: -4 },
  sectionTitle: { color: palette.text, fontWeight: '800', marginTop: 5, marginBottom: 2 },
  approvalHint: { color: palette.muted, lineHeight: 19, marginTop: 12 },
  approvalFlow: { borderRadius: 16, backgroundColor: palette.surfacePink, padding: 16, gap: 10 },
  approvalStep: { color: palette.text, lineHeight: 22 },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  overviewTile: { flexGrow: 1, flexBasis: '44%', minWidth: 132, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: '#FFFFFF', padding: 13, gap: 5 },
  overviewWide: { flexBasis: '100%' },
  overviewLabel: { color: palette.muted },
  overviewValue: { color: palette.text, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  libraryProfile: { borderRadius: 17, borderWidth: 1, borderColor: palette.border, backgroundColor: '#FFFFFF', padding: 15, gap: 7, marginTop: 10 },
  libraryTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  libraryTapRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  libraryName: { color: palette.text, fontWeight: '800' },
  libraryStatus: { borderRadius: 9, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  approvedStatus: { backgroundColor: '#E8F4EC', color: palette.success },
  pendingStatus: { backgroundColor: '#FFF1D8', color: '#9B6414' },
  rejectedStatus: { backgroundColor: '#FCE8EA', color: palette.danger },
  libraryDivider: { height: 1, backgroundColor: palette.border, marginVertical: 3 },
  libraryDetail: { color: palette.text, lineHeight: 20 },
  libraryStats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, backgroundColor: palette.surfacePink, borderRadius: 11, padding: 10, marginTop: 3 },
  librarySubscription: { color: palette.primary, fontWeight: '700', lineHeight: 19, marginTop: 2 },
  backButton: { marginTop: 8 },
  apiNotice: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfacePink, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  apiNoticeText: { color: palette.text, flex: 1, lineHeight: 18 },
  footer: { color: palette.muted, textAlign: 'center', letterSpacing: 0.5 },
});
