export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPin: undefined;
  LibraryApplication: undefined;
  SuperAdminApprovals: { name: string };
  LibraryAdminDashboard: { name: string };
  LibraryAssistant: { name: string };
  StudentTabs: undefined;
};

export type StudentTabParamList = {
  Home: undefined;
  Notices: undefined;
  Scan: undefined;
  Overdue: undefined;
  Profile: undefined;
};

export type LibraryAdminTabParamList = {
  Dashboard: undefined;
  Attendance: undefined;
  SeatMap: undefined;
  Members: { status?: 'active'|'inactive'|'all'|'pending' } | undefined;
  Fees: undefined;
  Reports: undefined;
};
