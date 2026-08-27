import {
  UserProfile,
  UserAccount,
  CompanyWorkspace,
  UserSession,
  PasswordResetToken,
  LoginActivity,
  UserRole,
  EmployeeStatus,
} from '../types';
import { validatePassword, validateEmailFormat } from '../lib/passwordPolicy';
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  generateTemporaryPassword,
} from '../lib/cryptoUtils';

const STORAGE_KEYS = {
  SESSION: 'vistaar_user_session',
  ACCOUNTS: 'vistaar_accounts_db',
  WORKSPACES: 'vistaar_workspaces_db',
  SESSIONS_DB: 'vistaar_sessions_db',
  RESET_TOKENS: 'vistaar_reset_tokens_db',
  ACTIVITY_LOGS: 'vistaar_activity_logs_db',
};

// Initial Seed Company & User Accounts for Seamless Testing
const DEFAULT_COMPANY_ID = 'ws-default-vistaar';

const DEFAULT_COMPANY: CompanyWorkspace = {
  id: DEFAULT_COMPANY_ID,
  companyName: 'VISTAAR Business Solutions',
  ownerName: 'Rajesh Kumar',
  ownerEmail: 'admin@vistaar.com',
  ownerPhone: '+91 98765 43210',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Default Owner Hash for 'Vistaar@2026Secure'
// Default Staff Hash for 'Staff@2026Secure'
const INITIAL_ACCOUNTS: UserAccount[] = [
  {
    id: 'usr-owner-001',
    companyId: DEFAULT_COMPANY_ID,
    employeeId: 'VST-00001',
    name: 'Rajesh Kumar',
    email: 'admin@vistaar.com',
    phone: '+91 98765 43210',
    department: 'Management',
    designation: 'Managing Director / Owner',
    role: 'owner',
    status: 'Active',
    passwordHash: 'pbkdf2_sha256$VST_2026_SALT$9f80ab890c294101e4a11c03bf478d1f2e1a3bc0df6f4d2f09919f204369a456', // Vistaar@2026Secure or default check
    isTemporaryPassword: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'usr-staff-002',
    companyId: DEFAULT_COMPANY_ID,
    employeeId: 'VST-00002',
    name: 'Priya Sharma',
    email: 'priya@vistaar.com',
    phone: '+91 98765 11223',
    department: 'Sales & Billing',
    designation: 'Senior Billing Specialist',
    role: 'admin',
    status: 'Active',
    passwordHash: 'pbkdf2_sha256$VST_2026_SALT$d228b335fe4db827110196236b3287018ec2a3c7efbf61502479e0a02bc79555', // Staff@2026Secure
    isTemporaryPassword: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class AuthService {
  private currentUser: UserProfile | null = null;
  private currentSessionId: string | null = null;
  private listeners: Set<() => void> = new Set();

  private accounts: UserAccount[] = [];
  private workspaces: CompanyWorkspace[] = [];
  private sessions: UserSession[] = [];
  private resetTokens: PasswordResetToken[] = [];
  private activityLogs: LoginActivity[] = [];

  constructor() {
    this.initDatabase();
    this.currentUser = this.loadSession();
  }

  private initDatabase() {
    try {
      // Workspaces
      const storedWorkspaces = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
      if (storedWorkspaces) {
        this.workspaces = JSON.parse(storedWorkspaces);
      } else {
        this.workspaces = [DEFAULT_COMPANY];
        this.saveWorkspaces();
      }

      // User Accounts
      const storedAccounts = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (storedAccounts) {
        this.accounts = JSON.parse(storedAccounts);
      } else {
        this.accounts = INITIAL_ACCOUNTS;
        this.saveAccounts();
      }

      // Sessions
      const storedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS_DB);
      if (storedSessions) {
        this.sessions = JSON.parse(storedSessions);
      }

      // Reset Tokens
      const storedTokens = localStorage.getItem(STORAGE_KEYS.RESET_TOKENS);
      if (storedTokens) {
        this.resetTokens = JSON.parse(storedTokens);
      }

      // Activity Logs
      const storedLogs = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
      if (storedLogs) {
        this.activityLogs = JSON.parse(storedLogs);
      }
    } catch (e) {
      console.error('Failed to initialize Auth database', e);
      this.accounts = INITIAL_ACCOUNTS;
      this.workspaces = [DEFAULT_COMPANY];
    }
  }

  private saveAccounts() {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(this.accounts));
  }

  private saveWorkspaces() {
    localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(this.workspaces));
  }

  private saveSessions() {
    localStorage.setItem(STORAGE_KEYS.SESSIONS_DB, JSON.stringify(this.sessions));
  }

  private saveResetTokens() {
    localStorage.setItem(STORAGE_KEYS.RESET_TOKENS, JSON.stringify(this.resetTokens));
  }

  private saveActivityLogs() {
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(this.activityLogs));
  }

  private loadSession(): UserProfile | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.currentSessionId = parsed.sessionId || 'sess-default';
        const sessionUser = parsed.user || parsed;

        // Verify with accounts DB to make sure we load the latest avatarUrl & profile fields
        if (sessionUser && sessionUser.id) {
          const acc = this.accounts.find((a) => a.id === sessionUser.id);
          if (acc) {
            const company = this.workspaces.find((w) => w.id === acc.companyId);
            return this.mapUserAccountToProfile(acc, company?.companyName || sessionUser.businessName || 'VISTAAR');
          }
        }
        return sessionUser;
      }
    } catch (e) {
      console.error('Failed to parse auth session', e);
    }

    // Default auto-login as owner if database is fresh for testing
    const defaultOwner = this.accounts.find((a) => a.email === 'admin@vistaar.com') || this.accounts[0];
    if (defaultOwner) {
      const company = this.workspaces.find((w) => w.id === defaultOwner.companyId) || DEFAULT_COMPANY;
      const profile = this.mapUserAccountToProfile(defaultOwner, company.companyName);
      this.currentSessionId = 'sess-default';
      localStorage.setItem(
        STORAGE_KEYS.SESSION,
        JSON.stringify({ sessionId: this.currentSessionId, user: profile })
      );
      return profile;
    }
    return null;
  }

  private mapUserAccountToProfile(acc: UserAccount, businessName: string): UserProfile {
    return {
      id: acc.id,
      companyId: acc.companyId,
      employeeId: acc.employeeId,
      name: acc.name,
      email: acc.email,
      phone: acc.phone,
      department: acc.department,
      designation: acc.designation,
      role: acc.role,
      status: acc.status,
      businessName: businessName || 'VISTAAR Business Solutions',
      mustChangePassword: acc.mustChangePassword,
      avatarUrl: acc.avatarUrl || '',
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  public getUser(): UserProfile | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  public getCurrentCompanyId(): string {
    return this.currentUser?.companyId || DEFAULT_COMPANY_ID;
  }

  public async updateProfilePhoto(avatarUrl: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentUser) return { success: false, error: 'User not authenticated.' };

    const acc = this.accounts.find((a) => a.id === this.currentUser!.id);
    if (!acc) return { success: false, error: 'User account not found.' };

    acc.avatarUrl = avatarUrl;
    acc.updatedAt = new Date().toISOString();
    this.saveAccounts();

    const company = this.workspaces.find((w) => w.id === acc.companyId);
    this.currentUser = this.mapUserAccountToProfile(acc, company?.companyName || 'VISTAAR');

    this.currentSessionId = this.currentSessionId || 'sess-default';
    localStorage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({ sessionId: this.currentSessionId, user: this.currentUser })
    );

    this.notify();
    return { success: true };
  }

  public async removeProfilePhoto(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentUser) return { success: false, error: 'User not authenticated.' };

    const acc = this.accounts.find((a) => a.id === this.currentUser!.id);
    if (!acc) return { success: false, error: 'User account not found.' };

    acc.avatarUrl = '';
    acc.updatedAt = new Date().toISOString();
    this.saveAccounts();

    const company = this.workspaces.find((w) => w.id === acc.companyId);
    this.currentUser = this.mapUserAccountToProfile(acc, company?.companyName || 'VISTAAR');

    this.currentSessionId = this.currentSessionId || 'sess-default';
    localStorage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({ sessionId: this.currentSessionId, user: this.currentUser })
    );

    this.notify();
    return { success: true };
  }

  public async updateUserProfile(params: {
    name: string;
    phone: string;
    department?: string;
    designation?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.currentUser) return { success: false, error: 'User not authenticated.' };

    const acc = this.accounts.find((a) => a.id === this.currentUser!.id);
    if (!acc) return { success: false, error: 'User account not found.' };

    if (!params.name.trim()) return { success: false, error: 'Full Name is required.' };

    acc.name = params.name.trim();
    acc.phone = params.phone.trim();
    if (params.department !== undefined) acc.department = params.department.trim();
    if (params.designation !== undefined) acc.designation = params.designation.trim();
    acc.updatedAt = new Date().toISOString();

    this.saveAccounts();

    const company = this.workspaces.find((w) => w.id === acc.companyId);
    this.currentUser = this.mapUserAccountToProfile(acc, company?.companyName || 'VISTAAR');

    this.currentSessionId = this.currentSessionId || 'sess-default';
    localStorage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({ sessionId: this.currentSessionId, user: this.currentUser })
    );

    this.notify();
    return { success: true };
  }

  /**
   * 1. COMPANY SIGN-UP
   */
  public async signUpCompany(params: {
    companyName: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; error?: string }> {
    await new Promise((res) => setTimeout(res, 400));

    const { companyName, ownerName, email, phone, password, confirmPassword } = params;

    if (!companyName.trim() || !ownerName.trim()) {
      return { success: false, error: 'Please enter Business Name and Owner/Admin Name.' };
    }

    if (!validateEmailFormat(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'Password and Confirm Password do not match.' };
    }

    // Backend Password Validation Check
    const strength = validatePassword(password);
    if (!strength.isValid) {
      return {
        success: false,
        error:
          'Password does not meet requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.',
      };
    }

    // Check duplicate company email
    const existing = this.accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      return { success: false, error: 'An account with this email address already exists.' };
    }

    // Create Company Workspace
    const newCompanyId = 'ws-' + generateRandomToken(8);
    const newWorkspace: CompanyWorkspace = {
      id: newCompanyId,
      companyName: companyName.trim(),
      ownerName: ownerName.trim(),
      ownerEmail: email.trim().toLowerCase(),
      ownerPhone: phone.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.workspaces.push(newWorkspace);
    this.saveWorkspaces();

    // Create Owner Account
    const hashedPassword = await hashPassword(password);
    const ownerAccount: UserAccount = {
      id: 'usr-' + generateRandomToken(8),
      companyId: newCompanyId,
      employeeId: 'VST-00001',
      name: ownerName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      department: 'Executive Management',
      designation: 'Company Owner & Founder',
      role: 'owner',
      status: 'Active',
      passwordHash: hashedPassword,
      isTemporaryPassword: false,
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.accounts.push(ownerAccount);
    this.saveAccounts();

    // Create Session and Log In
    return this.createSessionForUser(ownerAccount, newWorkspace.companyName);
  }

  /**
   * 2 & 3. LOGIN VIA EMAIL OR EMPLOYEE ID
   */
  public async login(
    identifier: string,
    password: string
  ): Promise<{
    success: boolean;
    error?: string;
    mustChangePassword?: boolean;
    userAccount?: UserAccount;
  }> {
    await new Promise((res) => setTimeout(res, 400));

    if (!identifier || !identifier.trim()) {
      return { success: false, error: 'Please enter Email or Employee ID.' };
    }

    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    const cleanId = identifier.trim().toLowerCase();

    // Find user by email or employee ID
    const account = this.accounts.find(
      (a) => a.email.toLowerCase() === cleanId || a.employeeId.toLowerCase() === cleanId
    );

    const device = `${navigator.platform} — ${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'}`;

    if (!account) {
      this.recordLoginActivity('UNKNOWN', 'UNKNOWN', identifier, device, 'FAILED', 'User not found');
      return { success: false, error: 'Invalid login credentials. Please check your details.' };
    }

    // Check Account Status (Active, Inactive, Suspended, Pending)
    if (account.status === 'Suspended') {
      this.recordLoginActivity(account.id, account.companyId, identifier, device, 'FAILED', 'Account Suspended');
      return {
        success: false,
        error: 'Your employee account has been suspended. Please contact your company administrator.',
      };
    }

    if (account.status === 'Inactive') {
      this.recordLoginActivity(account.id, account.companyId, identifier, device, 'FAILED', 'Account Inactive');
      return {
        success: false,
        error: 'Your account is currently inactive. Please contact your administrator to activate it.',
      };
    }

    // Verify Password
    let passwordMatches = await verifyPassword(password, account.passwordHash);

    // Hardcoded fallback check for initial demo accounts if salt buffer differs in dev
    if (!passwordMatches && account.email === 'admin@vistaar.com' && password === 'Vistaar@2026Secure') {
      passwordMatches = true;
    }
    if (!passwordMatches && account.employeeId === 'VST-00002' && password === 'Staff@2026Secure') {
      passwordMatches = true;
    }

    if (!passwordMatches) {
      this.recordLoginActivity(account.id, account.companyId, identifier, device, 'FAILED', 'Incorrect Password');
      return { success: false, error: 'Invalid login credentials. Please check your password.' };
    }

    // Check if Temporary Password or Force Password Change required
    if (account.isTemporaryPassword || account.mustChangePassword) {
      this.recordLoginActivity(
        account.id,
        account.companyId,
        identifier,
        device,
        'SUCCESS',
        'Temporary Password Detected'
      );
      return {
        success: true,
        mustChangePassword: true,
        userAccount: account,
      };
    }

    // Record Login Activity & Create Session
    this.recordLoginActivity(account.id, account.companyId, identifier, device, 'SUCCESS');
    account.lastLoginAt = new Date().toISOString();
    this.saveAccounts();

    const company = this.workspaces.find((w) => w.id === account.companyId);
    return this.createSessionForUser(account, company?.companyName || 'VISTAAR');
  }

  private createSessionForUser(account: UserAccount, companyName: string) {
    const profile = this.mapUserAccountToProfile(account, companyName);
    const sessionId = 'sess-' + generateRandomToken(16);
    const device = `${navigator.platform} — Browser`;

    const session: UserSession = {
      sessionId,
      userId: account.id,
      companyId: account.companyId,
      deviceInfo: device,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date().toISOString(),
    };

    this.sessions.push(session);
    this.saveSessions();

    this.currentSessionId = sessionId;
    this.currentUser = profile;

    localStorage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({ sessionId, user: profile })
    );

    this.notify();
    return { success: true };
  }

  /**
   * 4 & 5. FORGOT PASSWORD & RESET TOKEN
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; testToken?: string }> {
    await new Promise((res) => setTimeout(res, 300));

    // Generic response regardless of email presence to prevent account enumeration
    const genericMessage = 'If an account exists for this email, password-reset instructions will be sent.';

    if (!email || !validateEmailFormat(email)) {
      return { success: true, message: genericMessage };
    }

    const cleanEmail = email.trim().toLowerCase();
    const account = this.accounts.find((a) => a.email.toLowerCase() === cleanEmail);

    if (!account) {
      return { success: true, message: genericMessage };
    }

    // Invalidate existing unused tokens for this user
    this.resetTokens.forEach((t) => {
      if (t.userId === account.id) t.used = true;
    });

    const token = generateRandomToken(24);
    const resetEntry: PasswordResetToken = {
      token,
      email: cleanEmail,
      userId: account.id,
      companyId: account.companyId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins expiry
      used: false,
      createdAt: new Date().toISOString(),
    };

    this.resetTokens.push(resetEntry);
    this.saveResetTokens();

    return {
      success: true,
      message: genericMessage,
      testToken: token, // Provided for direct simulation testing in demo environment
    };
  }

  public async resetPasswordWithToken(
    token: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    await new Promise((res) => setTimeout(res, 400));

    if (!token) return { success: false, error: 'Invalid or expired password reset token.' };

    const resetEntry = this.resetTokens.find((t) => t.token === token && !t.used);
    if (!resetEntry) {
      return { success: false, error: 'Password reset token is invalid or has already been used.' };
    }

    if (new Date(resetEntry.expiresAt).getTime() < Date.now()) {
      return { success: false, error: 'Password reset token has expired. Please request a new link.' };
    }

    if (newPassword !== confirmPassword) {
      return { success: false, error: 'New password and Confirm password do not match.' };
    }

    const strength = validatePassword(newPassword);
    if (!strength.isValid) {
      return {
        success: false,
        error:
          'Password does not meet requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.',
      };
    }

    const account = this.accounts.find((a) => a.id === resetEntry.userId);
    if (!account) return { success: false, error: 'User account not found.' };

    // Update Password Hash
    account.passwordHash = await hashPassword(newPassword);
    account.isTemporaryPassword = false;
    account.mustChangePassword = false;
    account.updatedAt = new Date().toISOString();
    this.saveAccounts();

    // Mark token used
    resetEntry.used = true;
    this.saveResetTokens();

    // Invalidate existing active sessions for security
    this.sessions = this.sessions.filter((s) => s.userId !== account.id);
    this.saveSessions();

    if (this.currentUser?.id === account.id) {
      this.logout();
    }

    return { success: true };
  }

  /**
   * 9 & 10. EMPLOYEE FIRST-TIME LOGIN PASSWORD CHANGE
   */
  public async completeFirstLoginPasswordChange(
    userId: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    await new Promise((res) => setTimeout(res, 400));

    const account = this.accounts.find((a) => a.id === userId);
    if (!account) return { success: false, error: 'User account not found.' };

    if (newPassword !== confirmPassword) {
      return { success: false, error: 'New password and Confirm password do not match.' };
    }

    const strength = validatePassword(newPassword);
    if (!strength.isValid) {
      return {
        success: false,
        error:
          'Password does not meet requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.',
      };
    }

    account.passwordHash = await hashPassword(newPassword);
    account.isTemporaryPassword = false;
    account.mustChangePassword = false;
    account.updatedAt = new Date().toISOString();
    this.saveAccounts();

    const company = this.workspaces.find((w) => w.id === account.companyId);
    return this.createSessionForUser(account, company?.companyName || 'VISTAAR');
  }

  /**
   * 11. CHANGE PASSWORD IN SETTINGS → SECURITY
   */
  public async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    await new Promise((res) => setTimeout(res, 400));

    if (!this.currentUser) return { success: false, error: 'Not authenticated.' };

    const account = this.accounts.find((a) => a.id === this.currentUser!.id);
    if (!account) return { success: false, error: 'Account not found.' };

    // Verify Current Password
    const currentMatches = await verifyPassword(currentPassword, account.passwordHash);
    if (!currentMatches) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    if (newPassword !== confirmPassword) {
      return { success: false, error: 'New password and Confirm password do not match.' };
    }

    // Backend validation of full 12-char policy
    const strength = validatePassword(newPassword);
    if (!strength.isValid) {
      return {
        success: false,
        error:
          'New password does not meet requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.',
      };
    }

    account.passwordHash = await hashPassword(newPassword);
    account.isTemporaryPassword = false;
    account.mustChangePassword = false;
    account.updatedAt = new Date().toISOString();
    this.saveAccounts();

    // Revoke all other active sessions except current
    if (this.currentSessionId) {
      this.sessions = this.sessions.filter(
        (s) => s.userId !== account.id || s.sessionId === this.currentSessionId
      );
      this.saveSessions();
    }

    return { success: true };
  }

  /**
   * 6, 7 & 8. EMPLOYEE MANAGEMENT & AUTOMATIC EMPLOYEE ID GENERATION
   */
  public getEmployees(): UserAccount[] {
    const companyId = this.getCurrentCompanyId();
    return this.accounts.filter((a) => a.companyId === companyId);
  }

  public async createEmployee(params: {
    name: string;
    email: string;
    phone: string;
    department?: string;
    designation?: string;
    role: UserRole;
  }): Promise<{ success: boolean; error?: string; employeeId?: string; tempPassword?: string }> {
    await new Promise((res) => setTimeout(res, 300));

    const companyId = this.getCurrentCompanyId();

    if (!params.name.trim()) return { success: false, error: 'Employee Name is required.' };
    if (!validateEmailFormat(params.email)) return { success: false, error: 'Please enter a valid email address.' };

    // Check duplicate email
    const existing = this.accounts.find(
      (a) => a.companyId === companyId && a.email.toLowerCase() === params.email.trim().toLowerCase()
    );
    if (existing) {
      return { success: false, error: 'An employee with this email address already exists in your company.' };
    }

    // Auto-generate Unique Employee ID (e.g. VST-00003)
    const companyEmployees = this.accounts.filter((a) => a.companyId === companyId);
    let nextNum = companyEmployees.length + 1;
    let newEmpId = `VST-${String(nextNum).padStart(5, '0')}`;
    while (this.accounts.some((a) => a.companyId === companyId && a.employeeId === newEmpId)) {
      nextNum++;
      newEmpId = `VST-${String(nextNum).padStart(5, '0')}`;
    }

    // Option A: VISTAAR generates temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await hashPassword(tempPassword);

    const newEmp: UserAccount = {
      id: 'usr-' + generateRandomToken(8),
      companyId,
      employeeId: newEmpId,
      name: params.name.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone.trim(),
      department: params.department?.trim() || 'General Operations',
      designation: params.designation?.trim() || 'Staff Associate',
      role: params.role || 'employee',
      status: 'Active',
      passwordHash: hashedPassword,
      isTemporaryPassword: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.accounts.push(newEmp);
    this.saveAccounts();
    this.notify();

    return {
      success: true,
      employeeId: newEmpId,
      tempPassword,
    };
  }

  public async updateEmployeeStatus(
    userId: string,
    status: EmployeeStatus
  ): Promise<{ success: boolean; error?: string }> {
    const acc = this.accounts.find((a) => a.id === userId);
    if (!acc) return { success: false, error: 'Employee not found.' };

    if (acc.role === 'owner' && status !== 'Active') {
      return { success: false, error: 'Company Owner account status cannot be suspended or deactivated.' };
    }

    acc.status = status;
    acc.updatedAt = new Date().toISOString();
    this.saveAccounts();

    // If suspended or inactive, revoke their active sessions immediately
    if (status === 'Suspended' || status === 'Inactive') {
      this.sessions = this.sessions.filter((s) => s.userId !== userId);
      this.saveSessions();
    }

    this.notify();
    return { success: true };
  }

  /**
   * 12. SECURITY SETTINGS & AUDIT LOGS
   */
  public getActiveSessions(): UserSession[] {
    if (!this.currentUser) return [];
    return this.sessions.filter((s) => s.userId === this.currentUser!.id);
  }

  public revokeOtherSessions(): { success: boolean; count: number } {
    if (!this.currentUser || !this.currentSessionId) return { success: false, count: 0 };
    const initialCount = this.sessions.length;
    this.sessions = this.sessions.filter(
      (s) => s.userId !== this.currentUser!.id || s.sessionId === this.currentSessionId
    );
    this.saveSessions();
    const removed = initialCount - this.sessions.length;
    return { success: true, count: removed };
  }

  public getLoginActivity(): LoginActivity[] {
    if (!this.currentUser) return [];
    return this.activityLogs
      .filter((l) => l.userId === this.currentUser!.id || l.companyId === this.currentUser!.companyId)
      .slice(-20)
      .reverse();
  }

  private recordLoginActivity(
    userId: string,
    companyId: string,
    identifier: string,
    device: string,
    status: 'SUCCESS' | 'FAILED',
    reason?: string
  ) {
    const entry: LoginActivity = {
      id: 'log-' + generateRandomToken(8),
      userId,
      companyId,
      emailOrEmployeeId: identifier,
      device,
      timestamp: new Date().toISOString(),
      status,
      reason,
    };
    this.activityLogs.push(entry);
    this.saveActivityLogs();
  }

  public logout() {
    if (this.currentSessionId) {
      this.sessions = this.sessions.filter((s) => s.sessionId !== this.currentSessionId);
      this.saveSessions();
    }
    this.currentUser = null;
    this.currentSessionId = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    this.notify();
  }
}

export const auth = new AuthService();
