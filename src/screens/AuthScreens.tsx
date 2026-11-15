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
import { Eye, EyeOff } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, HelperText, Surface, Text, TextInput } from 'react-native-paper';
import { Brand } from '../components/Brand';
import { RootStackParamList } from '../navigation/types';
import { commonStyles, palette } from '../theme';
import { ActiveLibraryOption, LibraryApplication, SubscriptionRecord } from '../api/contracts';
import { libraryApi } from '../api/libraryApi';
import { ActivityIndicator } from 'react-native-paper';

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
  const [applications, setApplications] = useState<LibraryApplication[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState('Monthly');
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('1');
  const [paymentStatus, setPaymentStatus] = useState<'paid'|'pending'>('pending');
  const reload = () => { setLoading(true); Promise.all([libraryApi.getPendingLibraryApplications(),libraryApi.getSubscriptionHistory()]).then(([a,s])=>{setApplications(a);setSubscriptions(s);}).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(reload, []);
  const review = (item: LibraryApplication, decision: 'approve' | 'reject') => {
    if (decision === 'reject') { Alert.alert('Reject application?', `Reject ${item.libraryName}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: () => void libraryApi.reviewLibraryApplication(item.id, { decision: 'reject' }).then(reload).catch((e) => setError(e.message)) }]); return; }
    const value = Number(amount);
    const term=Number(months);
    if (!plan.trim() || !amount.trim() || !Number.isFinite(value) || value < 0 || !Number.isInteger(term) || term < 1 || term > 36) { setError('Enter a subscription plan, valid INR amount, and a 1–36 month term.'); return; }
    void libraryApi.reviewLibraryApplication(item.id, { decision: 'approve', subscription: { plan: plan.trim(), amount: value, startsOn: new Date().toISOString().slice(0,10), endsOn: new Date(new Date().setMonth(new Date().getMonth()+term)).toISOString().slice(0,10), paymentStatus } }).then(reload).catch((e) => setError(e.message));
  };
  const logout=async()=>{await libraryApi.logout();navigation.replace('Login');};
  return (
    <AuthLayout>
      <Surface elevation={0} style={styles.formCard}>
        <Header title={`Good ${new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, ${route.params.name}`} description="Review libraries, subscriptions and student onboarding." />
        <View style={styles.approvalFlow}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Approval checklist</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>1. Confirm the admin account and contact number.</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>2. Review the library name, place and requested seats.</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>3. Set the subscription plan and record its payment status.</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>4. Approve or reject the request.</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>5. Only approved libraries can accept student registrations.</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>6. The library admin approves each student, assigns a seat, and the server issues that student’s membership QR.</Text>
          <Text variant="bodyMedium" style={styles.approvalStep}>7. The approved library and its admin login become active only after this review is saved.</Text>
        </View>
        <TextInput mode="outlined" label="Subscription plan" value={plan} onChangeText={setPlan} outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Subscription amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <TextInput mode="outlined" label="Subscription term (months)" value={months} onChangeText={setMonths} keyboardType="number-pad" outlineColor={palette.border} activeOutlineColor={palette.primary} style={styles.input} />
        <View style={{flexDirection:'row',gap:8}}><Button mode={paymentStatus==='pending'?'contained':'outlined'} onPress={()=>setPaymentStatus('pending')}>Payment pending</Button><Button mode={paymentStatus==='paid'?'contained':'outlined'} onPress={()=>setPaymentStatus('paid')}>Paid</Button></View>
        {!!error && <HelperText type="error" visible>{error}</HelperText>}
        {loading ? <ActivityIndicator /> : applications.length ? applications.map((item) => <Surface key={item.id} elevation={0} style={styles.apiNotice}><View style={{flex:1,gap:4}}><Text variant="titleSmall">{item.libraryName}</Text><Text>{item.place} · {item.seatCount} seats</Text><Text>{item.adminName} · {item.adminMobile}</Text><Text>Admin login: {item.adminUsername}</Text><View style={{flexDirection:'row',gap:8,marginTop:6}}><Button mode="contained" onPress={() => review(item,'approve')}>Approve + subscription</Button><Button mode="outlined" onPress={() => review(item,'reject')}>Reject</Button></View></View></Surface>) : <Text variant="bodyMedium">No pending applications.</Text>}
        <Text variant="titleMedium" style={styles.sectionTitle}>Subscription history ({subscriptions.length})</Text>
        {subscriptions.map((s)=><Surface key={s.id} elevation={0} style={styles.apiNotice}><View style={{flex:1,gap:3}}><Text variant="titleSmall">{s.libraryName} · {s.plan}</Text><Text>₹{s.amount} · {s.paymentStatus} · {s.startsOn} to {s.endsOn}</Text><Text>{s.place}</Text></View></Surface>)}
        <Button mode="outlined" onPress={logout} style={styles.primaryButton}>Log out</Button>
        <Button mode="text" textColor={palette.primary} onPress={() => navigation.goBack()} style={styles.backButton}>Back to login</Button>
      </Surface>
    </AuthLayout>
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
  error: { marginBottom: 8 },
  registerPrompt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  adminPrompt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: -4 },
  sectionTitle: { color: palette.text, fontWeight: '800', marginTop: 5, marginBottom: 2 },
  approvalHint: { color: palette.muted, lineHeight: 19, marginTop: 12 },
  approvalFlow: { borderRadius: 16, backgroundColor: palette.surfacePink, padding: 16, gap: 10 },
  approvalStep: { color: palette.text, lineHeight: 22 },
  backButton: { marginTop: 8 },
  apiNotice: { borderRadius: 14, backgroundColor: palette.lightPink, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  apiNoticeText: { color: palette.text, flex: 1, lineHeight: 18 },
  footer: { color: palette.muted, textAlign: 'center', letterSpacing: 0.5 },
});
