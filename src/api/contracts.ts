/** Typed request and response contracts for the local CM Library API. */
export type StudentProfile = {
  id: string;
  name: string;
  mobile: string;
  seatNumber: string | number;
  libraryName: string;
  libraryAddress?: string;
};

export type AttendanceDay = {
  date: string;
  checkInAt?: string;
  checkOutAt?: string | null;
  durationMinutes?: number | null;
  durationSeconds?: number | null;
};

export type AdminAttendanceRecord = {
  id: string;
  name: string;
  mobile: string;
  seatNumber: number | null;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number;
};

export type AttendanceScanResult = {
  status: 'checked_in' | 'checked_out';
  checkInAt: string;
  checkOutAt?: string;
  durationSeconds?: number;
  durationMinutes?: number;
};

export type StudentFeeSummary = {
  month: string;
  monthlyFee: number;
  paidAmount: number;
  amountDue: number;
  paymentStatus: 'paid' | 'due';
  dueDate: null;
  libraryName: string;
  librarianMobile: string;
};

export type Notice = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

export type UserAlert = {
  id: string;
  kind: 'student_fee_due' | 'subscription_expired' | string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  pushStatus: 'pending' | 'sent' | 'failed' | 'no_device';
};

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  role: 'student' | 'library_admin' | 'super_admin';
  account: StudentProfile | LibraryAdminAccount | SuperAdminAccount;
};

export type LibraryAdminAccount = {
  id: string;
  name: string;
  username: string;
  mobile: string;
  libraryId: string;
  libraryStatus: 'pending' | 'active' | 'rejected';
};

export type SuperAdminAccount = { id: string; name: string; username: string };

export type RegisterStudent = {
  name: string;
  mobile: string;
  pin: string;
  libraryId: string;
};

export type LibraryApplicationStatus = 'pending' | 'approved' | 'rejected';

/** Submitted by a library admin. The password must only go to the backend over
 * HTTPS; the API must hash it and never return it in review responses. */
export type NewLibraryApplication = {
  adminName: string;
  adminMobile: string;
  adminUsername: string;
  adminPassword: string;
  libraryName: string;
  place: string;
  seatCount: number;
};

/** Safe fields shown to Super Admin during approval; never includes password. */
export type LibraryApplication = {
  id: string;
  adminName: string;
  adminMobile: string;
  adminUsername: string;
  libraryName: string;
  place: string;
  seatCount: number;
  status: LibraryApplicationStatus;
  submittedAt: string;
};

export type ActiveLibraryOption = { id: string; name: string; place: string };

export type SubscriptionApproval = {
  plan: string;
  amount: number;
  startsOn: string;
  endsOn: string;
  paymentStatus: 'paid' | 'pending';
};

export type StudentRegistrationRequest = {
  id: string;
  name: string;
  mobile: string;
  libraryId?: string;
  requestedAt: string;
};

export type StudentMembershipPass = {
  studentId: string;
  membershipCode: string;
  qrPayload: string;
  issuedAt: string;
  qrDataUrl?: string;
};

export type PendingLibraryStudent = { id: string; name: string; mobile: string; requestedAt: string };
export type AdminLibrary = { id: string; name: string; place: string; seatCount: number; status: string; subscription: SubscriptionApproval | null };
export type SubscriptionRecord = SubscriptionApproval & { id: string; libraryId: string; libraryName: string; place: string; createdAt: string };
export type SuperAdminLibrary = {
  id: string; publicCode: string; name: string; place: string; seatCount: number; status: LibraryApplicationStatus;
  adminName: string; adminUsername: string; adminMobile: string;
  activeMembers: number; pendingStudents: number; occupiedSeats: number; revenueThisMonth: number;
  subscription: SubscriptionApproval | null;
};
export type SuperAdminStudent = {
  id: string; name: string; mobile: string; status: 'pending'|'approved'|'rejected';
  memberStatus: 'pending'|'active'|'inactive'; seatNumber: number|null; monthlyFee: number; feePaid: number;
};
export type AttendanceQr = { libraryId: string; qrPayload: string; qrDataUrl: string };
export type PinResetRequest = { id: string; name: string; mobile: string; requestedAt: string };
export type AdminDashboard = {
  libraryId: string; publicCode: string; libraryName: string; place: string; seatCount: number;
  activeMembers: number; inactiveMembers: number; pendingStudents: number; occupiedSeats: number;
  availableSeats: number; revenueThisMonth: number; expensesThisMonth: number; netThisMonth: number;
  subscription: { plan: string; amount: number; startsOn: string; endsOn: string; paymentStatus: 'paid'|'pending' } | null;
};
export type LibraryMember = {
  id: string; name: string; mobile: string; seatNumber: number | null; monthlyFee: number;
  status: string; memberStatus: 'active'|'inactive'|'pending'; feePaid: number;
};
export type NewAdminStudent = { name: string; mobile: string; pin: string; seatNumber: number; fee: number };
export type AdminFee = { id: string; studentName: string; mobile: string; seatNumber: number; amount: number; feeMonth: string; paidOn: string; note: string };
export type WhatsAppReminderResult = { sent: number; failed: number; feeMonth: string };
export type AdminExpense = { id: string; title: string; category: string; amount: number; spentOn: string; note: string };
export type AssistantResponse = { question: string; answer: string; source: string; generatedAt: string };

/** Adapter implemented by src/api/libraryApi.ts against server/index.mjs. */
export interface LibraryApi {
  login(identifier: string, pin: string, remember?: boolean): Promise<AuthSession>;
  getActiveLibraries(): Promise<ActiveLibraryOption[]>;
  registerStudent(input: RegisterStudent): Promise<void>;
  requestPinReset(mobile: string): Promise<void>;
  getStudentProfile(): Promise<StudentProfile>;
  getAttendance(month: string): Promise<AttendanceDay[]>;
  getStudentFeeSummary(month: string): Promise<StudentFeeSummary>;
  checkOutAttendance(): Promise<AttendanceScanResult>;
  getNotices(): Promise<Notice[]>;
  registerPushToken(token: string, platform: 'android'|'ios'|'web'): Promise<void>;
  getAdminAlerts(): Promise<UserAlert[]>;
  getSuperAdminAlerts(): Promise<UserAlert[]>;
  markAlertRead(id: string): Promise<void>;
  getStudentMembershipPass(): Promise<StudentMembershipPass>;
  recordQrAttendance(qrValue: string): Promise<AttendanceScanResult>;
  updateProfile(input: Pick<StudentProfile, 'name' | 'mobile'>): Promise<StudentProfile>;
  changePin(currentPin: string, nextPin: string): Promise<void>;
  submitLibraryApplication(input: NewLibraryApplication): Promise<{ applicationId: string; status: 'pending' }>;
  getPendingLibraryApplications(): Promise<LibraryApplication[]>;
  getSuperAdminLibraries(): Promise<SuperAdminLibrary[]>;
  getSuperAdminLibraryStudents(libraryId: string): Promise<SuperAdminStudent[]>;
  updateSuperAdminLibrarySeats(libraryId: string, seatCount: number): Promise<void>;
  updateSuperAdminStudentFee(libraryId: string, studentId: string, monthlyFee: number): Promise<void>;
  addSuperAdminSubscription(libraryId: string, input: SubscriptionApproval): Promise<void>;
  changeSuperAdminPassword(currentPassword: string, nextPassword: string): Promise<void>;
  /** Approval activates the library/admin login and records the subscription. */
  reviewLibraryApplication(
    id: string,
    review: { decision: 'approve'; subscription: SubscriptionApproval } | { decision: 'reject'; note?: string },
  ): Promise<void>;
  getPendingStudentRegistrations(): Promise<StudentRegistrationRequest[]>;
  approveStudentRegistration(id: string, seatNumber: number, fee: number): Promise<StudentMembershipPass>;
  rejectStudentRegistration(id: string, note?: string): Promise<void>;
  logout(): Promise<void>;
  getAdminLibrary(): Promise<AdminLibrary>;
  getPendingLibraryStudents(): Promise<PendingLibraryStudent[]>;
  getSubscriptionHistory(): Promise<SubscriptionRecord[]>;
  getAdminAttendanceQr(): Promise<AttendanceQr>;
  getAdminAttendance(date: string): Promise<AdminAttendanceRecord[]>;
  getPendingPinResets(): Promise<PinResetRequest[]>;
  resetStudentPin(requestId: string, newPin: string): Promise<void>;
  getAdminDashboard(): Promise<AdminDashboard>;
  getAdminStudents(options?: { status?: 'active'|'inactive'|'all'|'pending'; search?: string; sort?: 'name'|'seat'|'mobile'|'recent' }): Promise<LibraryMember[]>;
  addAdminStudent(input: NewAdminStudent): Promise<StudentMembershipPass>;
  getAdminFees(month: string): Promise<AdminFee[]>;
  recordAdminFee(input: { studentId: string; amount: number; feeMonth: string; note?: string }): Promise<void>;
  markAdminFeeUnpaid(studentId: string, feeMonth: string): Promise<void>;
  getAdminExpenses(month: string): Promise<AdminExpense[]>;
  addAdminExpense(input: { title: string; category: string; amount: number; note?: string }): Promise<void>;
  createLibraryNotice(input: { title: string; message: string }): Promise<void>;
  sendFeeDueNotices(feeMonth: string): Promise<{ sent: number; feeMonth: string }>;
  getWhatsAppStatus(): Promise<{ configured: boolean }>;
  sendWhatsAppFeeReminders(feeMonth: string): Promise<WhatsAppReminderResult>;
  askLibraryAssistant(question: string): Promise<AssistantResponse>;
  downloadLibraryReport(month: string): Promise<string>;
}

