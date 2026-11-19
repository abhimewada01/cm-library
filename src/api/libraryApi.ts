import type { ActiveLibraryOption, AdminAttendanceRecord, AdminDashboard, AdminExpense, AdminFee, AdminLibrary, AttendanceDay, AttendanceQr, AttendanceScanResult, AssistantResponse, AuthSession, LibraryApplication, LibraryApi, LibraryMember, NewAdminStudent, NewLibraryApplication, Notice, PendingLibraryStudent, PinResetRequest, RegisterStudent, StudentFeeSummary, StudentMembershipPass, StudentProfile, SubscriptionApproval, SubscriptionRecord, SuperAdminLibrary, SuperAdminStudent, UserAlert, WhatsAppReminderResult } from './contracts';
import { apiRequest } from './httpTransport';
import { clearTokens, getRefreshToken, saveTokens } from './secureSession';
import { Platform } from 'react-native';
import { clearStoredPushToken, getStoredPushToken } from '../utils/pushTokenStorage';

class HttpLibraryApi implements LibraryApi {
  async login(identifier: string, pin: string, remember = true): Promise<AuthSession> {
    const session = await apiRequest<AuthSession>('auth/login', { method: 'POST', authenticated: false, body: { identifier, pin } });
    await saveTokens(session.accessToken, remember ? session.refreshToken : undefined);
    return session;
  }
  getActiveLibraries() { return apiRequest<ActiveLibraryOption[]>('libraries/active', { authenticated: false }); }
  async registerStudent(input: RegisterStudent) { await apiRequest('students/register', { method: 'POST', authenticated: false, body: input }); }
  async requestPinReset(mobile: string) { await apiRequest('auth/forgot-pin', { method: 'POST', authenticated: false, body: { mobile } }); }
  getStudentProfile() { return apiRequest<StudentProfile>('students/me'); }
  getAttendance(month: string) { return apiRequest<AttendanceDay[]>(`students/attendance?month=${encodeURIComponent(month)}`); }
  getStudentFeeSummary(month: string) { return apiRequest<StudentFeeSummary>(`students/fees?month=${encodeURIComponent(month)}`); }
  checkOutAttendance() { return apiRequest<AttendanceScanResult>('attendance/checkout', { method: 'POST' }); }
  getNotices() { return apiRequest<Notice[]>('students/notices'); }
  async registerPushToken(token: string, platform: 'android'|'ios'|'web') { await apiRequest('me/push-token', { method:'POST', body:{token,platform} }); }
  getAdminAlerts() { return apiRequest<UserAlert[]>('admin/alerts'); }
  getSuperAdminAlerts() { return apiRequest<UserAlert[]>('super-admin/alerts'); }
  async markAlertRead(id: string) { await apiRequest(`alerts/${encodeURIComponent(id)}/read`, { method:'PATCH' }); }
  getStudentMembershipPass() { return apiRequest<StudentMembershipPass>('students/membership-pass'); }
  recordQrAttendance(qrValue: string) { return apiRequest<AttendanceScanResult>('attendance/scan', { method: 'POST', body: { qrValue } }); }
  updateProfile(input: Pick<StudentProfile, 'name' | 'mobile'>) { return apiRequest<StudentProfile>('students/me', { method: 'PATCH', body: input }); }
  async changePin(currentPin: string, nextPin: string) { await apiRequest('students/me/pin', { method: 'POST', body: { currentPin, nextPin } }); }
  submitLibraryApplication(input: NewLibraryApplication) { return apiRequest<{ applicationId: string; status: 'pending' }>('library-applications', { method: 'POST', authenticated: false, body: input }); }
  getPendingLibraryApplications() { return apiRequest<LibraryApplication[]>('super-admin/library-applications'); }
  getSuperAdminLibraries() { return apiRequest<SuperAdminLibrary[]>('super-admin/libraries'); }
  getSuperAdminLibraryStudents(libraryId: string) { return apiRequest<SuperAdminStudent[]>(`super-admin/libraries/${encodeURIComponent(libraryId)}/students`); }
  async updateSuperAdminLibrarySeats(libraryId: string, seatCount: number) { await apiRequest(`super-admin/libraries/${encodeURIComponent(libraryId)}`, { method: 'PATCH', body: { seatCount } }); }
  async updateSuperAdminStudentFee(libraryId: string, studentId: string, monthlyFee: number) { await apiRequest(`super-admin/libraries/${encodeURIComponent(libraryId)}/students/${encodeURIComponent(studentId)}`, { method: 'PATCH', body: { monthlyFee } }); }
  async addSuperAdminSubscription(libraryId: string, input: SubscriptionApproval) { await apiRequest(`super-admin/libraries/${encodeURIComponent(libraryId)}/subscriptions`, { method: 'POST', body: input }); }
  async changeSuperAdminPassword(currentPassword: string, nextPassword: string) { await apiRequest('super-admin/me/password', { method: 'POST', body: { currentPassword, nextPassword } }); }
  async reviewLibraryApplication(id: string, review: { decision: 'approve'; subscription: SubscriptionApproval } | { decision: 'reject'; note?: string }) { await apiRequest(`super-admin/library-applications/${encodeURIComponent(id)}/review`, { method: 'POST', body: review }); }
  getPendingStudentRegistrations() { return apiRequest<PendingLibraryStudent[]>('admin/students/pending'); }
  getPendingLibraryStudents() { return this.getPendingStudentRegistrations(); }
  getSubscriptionHistory() { return apiRequest<SubscriptionRecord[]>('super-admin/subscriptions'); }
  getAdminAttendanceQr() { return apiRequest<AttendanceQr>('admin/attendance/qr'); }
  getAdminAttendance(date: string) { return apiRequest<AdminAttendanceRecord[]>(`admin/attendance?date=${encodeURIComponent(date)}`); }
  getPendingPinResets() { return apiRequest<PinResetRequest[]>('admin/pin-resets'); }
  async resetStudentPin(requestId: string, newPin: string) { await apiRequest(`admin/pin-resets/${encodeURIComponent(requestId)}/reset`, { method: 'POST', body: { newPin } }); }
  getAdminDashboard() { return apiRequest<AdminDashboard>('admin/dashboard'); }
  getAdminStudents(options: { status?: 'active'|'inactive'|'all'|'pending'; search?: string; sort?: 'name'|'seat'|'mobile'|'recent' } = {}) { const qs=new URLSearchParams(Object.entries(options).filter(([,v])=>v!==undefined) as [string,string][]).toString();return apiRequest<LibraryMember[]>(`admin/students${qs?`?${qs}`:''}`); }
  addAdminStudent(input: NewAdminStudent) { return apiRequest<StudentMembershipPass>('admin/students', { method: 'POST', body: input }); }
  getAdminFees(month: string) { return apiRequest<AdminFee[]>(`admin/fees?month=${encodeURIComponent(month)}`); }
  async recordAdminFee(input: { studentId: string; amount: number; feeMonth: string; note?: string }) { await apiRequest('admin/fees', { method: 'POST', body: input }); }
  async markAdminFeeUnpaid(studentId: string, feeMonth: string) { await apiRequest(`admin/fees/${encodeURIComponent(studentId)}/${encodeURIComponent(feeMonth)}`, { method: 'DELETE' }); }
  getAdminExpenses(month: string) { return apiRequest<AdminExpense[]>(`admin/expenses?month=${encodeURIComponent(month)}`); }
  async addAdminExpense(input: { title: string; category: string; amount: number; note?: string }) { await apiRequest('admin/expenses', { method: 'POST', body: input }); }
  async createLibraryNotice(input: { title: string; message: string }) { await apiRequest('admin/notices', { method: 'POST', body: input }); }
  sendFeeDueNotices(feeMonth: string) { return apiRequest<{ sent: number; feeMonth: string }>('admin/notices/fee-due', { method:'POST', body:{ feeMonth } }); }
  getWhatsAppStatus() { return apiRequest<{ configured: boolean }>('admin/whatsapp/status'); }
  sendWhatsAppFeeReminders(feeMonth: string) { return apiRequest<WhatsAppReminderResult>('admin/fees/whatsapp-reminders', { method:'POST', body:{ feeMonth } }); }
  askLibraryAssistant(question: string) { return apiRequest<AssistantResponse>(`admin/assistant?question=${encodeURIComponent(question)}`); }
  downloadLibraryReport(month: string) { return apiRequest<string>(`admin/reports.csv?month=${encodeURIComponent(month)}`); }
  approveStudentRegistration(id: string, seatNumber: number, fee: number) { return apiRequest<StudentMembershipPass>(`admin/students/${encodeURIComponent(id)}/approve`, { method: 'POST', body: { seatNumber, fee } }); }
  async rejectStudentRegistration(id: string, note?: string) { await apiRequest(`admin/students/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { note } }); }
  getAdminLibrary() { return apiRequest<AdminLibrary>('admin/library'); }
  async logout() {
    const refreshToken = await getRefreshToken();
    const pushToken = Platform.OS === 'web' ? null : await getStoredPushToken().catch(()=>null);
    try {
      if (pushToken) await apiRequest('me/push-token', { method:'DELETE', body:{token:pushToken} }).catch(()=>{});
      await apiRequest('auth/logout', { method: 'POST', body: { refreshToken } });
    } finally {
      if (pushToken) await clearStoredPushToken().catch(()=>{});
      await clearTokens();
    }
  }
}

export const libraryApi: LibraryApi = new HttpLibraryApi();
