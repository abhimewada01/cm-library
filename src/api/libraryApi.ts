import type { ActiveLibraryOption, AdminDashboard, AdminExpense, AdminFee, AdminLibrary, AttendanceDay, AttendanceQr, AssistantResponse, AuthSession, LibraryApplication, LibraryApi, LibraryMember, NewAdminStudent, NewLibraryApplication, Notice, PendingLibraryStudent, PinResetRequest, RegisterStudent, StudentMembershipPass, StudentProfile, SubscriptionApproval, SubscriptionRecord } from './contracts';
import { apiRequest } from './httpTransport';
import { clearTokens, getRefreshToken, saveTokens } from './secureSession';

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
  getNotices() { return apiRequest<Notice[]>('students/notices'); }
  getStudentMembershipPass() { return apiRequest<StudentMembershipPass>('students/membership-pass'); }
  async recordQrAttendance(qrValue: string) { await apiRequest('attendance/scan', { method: 'POST', body: { qrValue } }); }
  updateProfile(input: Pick<StudentProfile, 'name' | 'mobile'>) { return apiRequest<StudentProfile>('students/me', { method: 'PATCH', body: input }); }
  async changePin(currentPin: string, nextPin: string) { await apiRequest('students/me/pin', { method: 'POST', body: { currentPin, nextPin } }); }
  submitLibraryApplication(input: NewLibraryApplication) { return apiRequest<{ applicationId: string; status: 'pending' }>('library-applications', { method: 'POST', authenticated: false, body: input }); }
  getPendingLibraryApplications() { return apiRequest<LibraryApplication[]>('super-admin/library-applications'); }
  async reviewLibraryApplication(id: string, review: { decision: 'approve'; subscription: SubscriptionApproval } | { decision: 'reject'; note?: string }) { await apiRequest(`super-admin/library-applications/${encodeURIComponent(id)}/review`, { method: 'POST', body: review }); }
  getPendingStudentRegistrations() { return apiRequest<PendingLibraryStudent[]>('admin/students/pending'); }
  getPendingLibraryStudents() { return this.getPendingStudentRegistrations(); }
  getSubscriptionHistory() { return apiRequest<SubscriptionRecord[]>('super-admin/subscriptions'); }
  getAdminAttendanceQr() { return apiRequest<AttendanceQr>('admin/attendance/qr'); }
  getPendingPinResets() { return apiRequest<PinResetRequest[]>('admin/pin-resets'); }
  async resetStudentPin(requestId: string, newPin: string) { await apiRequest(`admin/pin-resets/${encodeURIComponent(requestId)}/reset`, { method: 'POST', body: { newPin } }); }
  getAdminDashboard() { return apiRequest<AdminDashboard>('admin/dashboard'); }
  getAdminStudents(options: { status?: 'active'|'inactive'|'all'|'pending'; search?: string; sort?: 'name'|'seat'|'mobile'|'recent' } = {}) { const qs=new URLSearchParams(Object.entries(options).filter(([,v])=>v!==undefined) as [string,string][]).toString();return apiRequest<LibraryMember[]>(`admin/students${qs?`?${qs}`:''}`); }
  addAdminStudent(input: NewAdminStudent) { return apiRequest<StudentMembershipPass>('admin/students', { method: 'POST', body: input }); }
  getAdminFees(month: string) { return apiRequest<AdminFee[]>(`admin/fees?month=${encodeURIComponent(month)}`); }
  async recordAdminFee(input: { studentId: string; amount: number; feeMonth: string; note?: string }) { await apiRequest('admin/fees', { method: 'POST', body: input }); }
  getAdminExpenses(month: string) { return apiRequest<AdminExpense[]>(`admin/expenses?month=${encodeURIComponent(month)}`); }
  async addAdminExpense(input: { title: string; category: string; amount: number; note?: string }) { await apiRequest('admin/expenses', { method: 'POST', body: input }); }
  async createLibraryNotice(input: { title: string; message: string }) { await apiRequest('admin/notices', { method: 'POST', body: input }); }
  askLibraryAssistant(question: string) { return apiRequest<AssistantResponse>(`admin/assistant?question=${encodeURIComponent(question)}`); }
  downloadLibraryReport(month: string) { return apiRequest<string>(`admin/reports.csv?month=${encodeURIComponent(month)}`); }
  approveStudentRegistration(id: string, seatNumber: number, fee: number) { return apiRequest<StudentMembershipPass>(`admin/students/${encodeURIComponent(id)}/approve`, { method: 'POST', body: { seatNumber, fee } }); }
  async rejectStudentRegistration(id: string, note?: string) { await apiRequest(`admin/students/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { note } }); }
  getAdminLibrary() { return apiRequest<AdminLibrary>('admin/library'); }
  async logout() {
    const refreshToken = await getRefreshToken();
    try { await apiRequest('auth/logout', { method: 'POST', body: { refreshToken } }); } finally { await clearTokens(); }
  }
}

export const libraryApi: LibraryApi = new HttpLibraryApi();
