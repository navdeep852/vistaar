import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, UserRole, UserAccount } from '../types';
import { validatePassword, validateEmailFormat } from '../lib/passwordPolicy';
import { validateIndianPhoneNumber } from '../lib/phoneUtils';
import { store } from './store';

const SESSION_STORAGE_KEY = 'vistaar_user_session';
const REGISTERED_USERS_KEY = 'vistaar_local_users_db';

const getLocalStorage = (): Storage | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
};

// In-memory fallback database for server/node testing environments where localStorage is absent
const inMemoryStorage: Record<string, string> = {};

const safeStorageGet = (key: string): string | null => {
  const ls = getLocalStorage();
  if (ls) {
    return ls.getItem(key);
  }
  return inMemoryStorage[key] || null;
};

const safeStorageSet = (key: string, value: string): void => {
  const ls = getLocalStorage();
  if (ls) {
    ls.setItem(key, value);
  }
  inMemoryStorage[key] = value;
};

const safeStorageRemove = (key: string): void => {
  const ls = getLocalStorage();
  if (ls) {
    ls.removeItem(key);
  }
  delete inMemoryStorage[key];
};

const DEMO_PROFILES: Record<string, UserProfile> = {
  'admin@vistaar.com': {
    id: '37baecfb-88c2-476a-a4d2-62a3b2e88494',
    companyId: '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    employeeId: 'VST-00001',
    name: 'Rajesh Kumar',
    email: 'admin@vistaar.com',
    phone: '+91 98765 43210',
    department: 'Management',
    designation: 'Managing Director / Owner',
    role: 'owner',
    status: 'Active',
    businessName: 'VISTAAR Business Solutions',
    mustChangePassword: false,
    avatarUrl: '',
  },
  'priya@vistaar.com': {
    id: '8f11c75b-9d41-4e76-8809-7a56bf5c8d10',
    companyId: '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    employeeId: 'VST-00002',
    name: 'Priya Sharma',
    email: 'priya@vistaar.com',
    phone: '+91 98765 11223',
    department: 'Sales & Billing',
    designation: 'Senior Billing Specialist',
    role: 'admin',
    status: 'Active',
    businessName: 'VISTAAR Business Solutions',
    mustChangePassword: false,
    avatarUrl: '',
  },
};

/**
 * Converts raw network errors, Supabase exceptions, or DNS failures
 * into clear, user-friendly diagnostic error messages.
 */
export function normalizeAuthError(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';
  const msg = typeof error === 'string' ? error : error.message || error.error_description || String(error);

  if (
    msg.includes('Failed to fetch') ||
    msg.includes('TypeError') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('NetworkError') ||
    msg.includes('fetch failed') ||
    msg.includes('Failed to connect') ||
    msg.includes('Network Error')
  ) {
    return 'Unable to reach Supabase Auth server. Check your internet connection and Supabase project availability.';
  }

  if (
    msg.includes('Invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('Invalid credentials')
  ) {
    return 'Invalid email or password.';
  }

  if (msg.includes('User already registered') || msg.includes('already registered')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }

  if (msg.includes('Password should be at least')) {
    return 'Password does not meet minimum length requirements.';
  }

  return msg;
}

export class SupabaseAuthService {
  private currentProfile: UserProfile | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.currentProfile = this.loadCachedSession();
    this.initSessionListener();
  }

  private loadCachedSession(): UserProfile | null {
    try {
      const stored = safeStorageGet(SESSION_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse cached session:', e);
    }
    return null;
  }

  private saveSessionToStorage(profile: UserProfile | null) {
    if (profile) {
      safeStorageSet(SESSION_STORAGE_KEY, JSON.stringify(profile));
    } else {
      safeStorageRemove(SESSION_STORAGE_KEY);
    }
  }

  private initSessionListener() {
    try {
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          await this.syncProfileFromSupabaseUser(session.user.id, session.user.email);
        } else if (!this.currentProfile) {
          this.currentProfile = this.loadCachedSession();
        }
        this.notify();
      });
    } catch (e) {
      console.warn('Supabase auth listener initialization warning:', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getUser(): UserProfile | null {
    return this.currentProfile;
  }

  public isAuthenticated(): boolean {
    return this.currentProfile !== null;
  }

  public getCurrentCompanyId(): string {
    return this.currentProfile?.companyId || '';
  }

  public isOwner(): boolean {
    return this.currentProfile?.role === 'owner';
  }

  /**
   * Re-authenticates owner password before performing critical actions (e.g. Product Deletion)
   */
  public async verifyOwnerPassword(password: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentProfile) {
      return { success: false, error: 'User is not logged in.' };
    }

    if (!this.isOwner()) {
      return { success: false, error: 'Unauthorized: Product deletion is restricted to Business Owners only.' };
    }

    if (!password || !password.trim()) {
      return { success: false, error: 'Please enter your password to re-authenticate.' };
    }

    const email = this.currentProfile.email;

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return { success: false, error: 'Invalid owner password.' };
        }
        return { success: true };
      } catch (err: any) {
        console.warn('Supabase auth verify failed, attempting offline check:', err);
      }
    }

    // Local / Offline fallback verification
    if (email.toLowerCase() === 'admin@vistaar.com') {
      if (password === 'Vistaar@2026Secure') {
        return { success: true };
      }
      return { success: false, error: 'Invalid owner password.' };
    }

    try {
      const localDbStr = safeStorageGet(REGISTERED_USERS_KEY);
      if (localDbStr) {
        const localDb: any[] = JSON.parse(localDbStr);
        const match = localDb.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (match && match.password === password) {
          return { success: true };
        }
      }
    } catch (e) {
      // ignore
    }

    return { success: false, error: 'Invalid owner password.' };
  }

  /**
   * Secure Employee ID to Email Resolution
   */
  public async resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
    const cleanId = identifier.trim();

    if (validateEmailFormat(cleanId)) {
      return cleanId.toLowerCase();
    }

    // Check static demo mappings
    if (cleanId.toUpperCase() === 'VST-00001') return 'admin@vistaar.com';
    if (cleanId.toUpperCase() === 'VST-00002') return 'priya@vistaar.com';

    // Check local user database
    try {
      const localDbStr = safeStorageGet(REGISTERED_USERS_KEY);
      if (localDbStr) {
        const localDb: any[] = JSON.parse(localDbStr);
        const match = localDb.find((u) => u.employeeId?.toUpperCase() === cleanId.toUpperCase());
        if (match) return match.email.toLowerCase();
      }
    } catch (e) {
      // ignore
    }

    // Query public.profiles for employee_id match if Supabase configured
    if (isSupabaseConfigured()) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('email')
          .eq('employee_id', cleanId)
          .single();

        if (data && data.email) {
          return data.email.toLowerCase();
        }
      } catch (e) {
        console.warn('Employee ID lookup via Supabase failed:', e);
      }
    }

    return null;
  }

  /**
   * Login with Email or Employee ID via Supabase Auth
   */
  public async login(
    identifier: string,
    password: string
  ): Promise<{ success: boolean; error?: string; userProfile?: UserProfile; mustChangePassword?: boolean; userAccount?: any }> {
    if (!identifier || !identifier.trim()) {
      return { success: false, error: 'Please enter Email or Employee ID.' };
    }

    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    const email = await this.resolveEmailFromIdentifier(identifier);
    if (!email) {
      return { success: false, error: 'Invalid email or password.' };
    }

    // Check if Supabase is properly configured before making live Auth network calls
    if (!isSupabaseConfigured()) {
      return this.loginFallback(
        email,
        password,
        'Supabase configuration is missing or invalid. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.'
      );
    }

    // Attempt Supabase Auth first
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (
          error.status === 400 ||
          error.message?.includes('Invalid login credentials') ||
          error.message?.includes('invalid_credentials')
        ) {
          return { success: false, error: 'Invalid email or password.' };
        }

        const normalized = normalizeAuthError(error);
        if (normalized.includes('Unable to reach Supabase')) {
          return this.loginFallback(email, password, normalized);
        }
        return { success: false, error: normalized };
      }

      if (data.user) {
        await this.syncProfileFromSupabaseUser(data.user.id, data.user.email);
        this.saveSessionToStorage(this.currentProfile);
        store.reloadTenantState();
        this.notify();
        return {
          success: true,
          userProfile: this.currentProfile!,
          mustChangePassword: this.currentProfile?.mustChangePassword,
          userAccount: this.currentProfile,
        };
      }
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
      if (normalized.includes('Unable to reach Supabase')) {
        return this.loginFallback(email, password, normalized);
      }
      return { success: false, error: normalized };
    }

    return { success: false, error: 'Authentication failed.' };
  }

  private loginFallback(
    email: string,
    password: string,
    networkErrorMsg: string
  ): { success: boolean; error?: string; userProfile?: UserProfile; mustChangePassword?: boolean; userAccount?: any } {
    const cleanEmail = email.toLowerCase();

    // Check demo accounts
    if (cleanEmail === 'admin@vistaar.com') {
      if (password === 'Vistaar@2026Secure') {
        this.currentProfile = DEMO_PROFILES['admin@vistaar.com'];
        this.saveSessionToStorage(this.currentProfile);
        store.reloadTenantState();
        this.notify();
        return { success: true, userProfile: this.currentProfile || undefined };
      }
      return { success: false, error: 'Invalid login credentials. Incorrect password for admin@vistaar.com.' };
    }

    if (cleanEmail === 'priya@vistaar.com') {
      if (password === 'Staff@2026Secure') {
        this.currentProfile = DEMO_PROFILES['priya@vistaar.com'];
        this.saveSessionToStorage(this.currentProfile);
        store.reloadTenantState();
        this.notify();
        return { success: true, userProfile: this.currentProfile || undefined };
      }
      return { success: false, error: 'Invalid login credentials. Incorrect password for priya@vistaar.com.' };
    }

    // Check local registered accounts DB
    try {
      const localDbStr = safeStorageGet(REGISTERED_USERS_KEY);
      if (localDbStr) {
        const localDb: any[] = JSON.parse(localDbStr);
        const match = localDb.find((u) => u.email.toLowerCase() === cleanEmail);
        if (match) {
          if (match.password === password) {
            this.currentProfile = match.profile;
            this.saveSessionToStorage(this.currentProfile);
            store.reloadTenantState();
            this.notify();
            return { success: true, userProfile: this.currentProfile || undefined };
          }
          return { success: false, error: 'Invalid email or password.' };
        }
      }
    } catch (e) {
      // ignore
    }

    return { success: false, error: 'Invalid email or password.' };
  }

  /**
   * Sync profile from public.profiles linked to auth.users.id
   */
  private async syncProfileFromSupabaseUser(userId: string, email?: string) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, workspaces(company_name)')
        .eq('id', userId)
        .single();

      if (profile) {
        this.currentProfile = {
          id: profile.id,
          companyId: profile.workspace_id,
          employeeId: profile.employee_id,
          name: profile.name,
          email: profile.email || email || '',
          phone: profile.phone || '',
          department: profile.department || '',
          designation: profile.designation || '',
          role: profile.role as UserRole,
          status: profile.status,
          businessName: profile.workspaces?.company_name || 'VISTAAR Business Solutions',
          mustChangePassword: profile.must_change_password || false,
          avatarUrl: profile.avatar_url || '',
        };
        this.saveSessionToStorage(this.currentProfile);
      }
    } catch (e) {
      console.warn('Failed to sync profile from Supabase:', e);
    }
  }

  /**
   * Request Email OTP Verification for Signup
   */
  public async requestEmailOtp(email: string): Promise<{ success: boolean; error?: string; accountExists?: boolean }> {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !validateEmailFormat(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    // Demo email check
    if (cleanEmail === 'admin@vistaar.com' || cleanEmail === 'priya@vistaar.com') {
      return {
        success: false,
        error: 'An account already exists with this email address. Please sign in instead.',
        accountExists: true,
      };
    }

    // Check local registered DB
    try {
      const localDbStr = safeStorageGet(REGISTERED_USERS_KEY);
      if (localDbStr) {
        const localDb: any[] = JSON.parse(localDbStr);
        if (localDb.some((u) => u.email.toLowerCase() === cleanEmail)) {
          return {
            success: false,
            error: 'An account already exists with this email address. Please sign in instead.',
            accountExists: true,
          };
        }
      }
    } catch (e) {
      // ignore
    }

    if (!isSupabaseConfigured()) {
      console.warn('[OTP_REQUEST_ERROR] Supabase Auth is not configured or URL is invalid.');
      return {
        success: false,
        error: 'Email OTP service is unavailable. Please verify that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured with a valid Supabase project.',
      };
    }

    try {
      console.log(`[OTP_REQUEST_STARTED] Target Email: ${cleanEmail.replace(/^(.)(.*)(@.*)$/, '$1***$3')}`);
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingProfile) {
        console.warn('[OTP_REQUEST_ERROR] Account already exists for this email.');
        return {
          success: false,
          error: 'An account already exists with this email address. Please sign in instead.',
          accountExists: true,
        };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        const normalized = normalizeAuthError(error);
        console.error('[OTP_REQUEST_ERROR]', normalized);
        return { success: false, error: normalized };
      }

      console.log('[OTP_REQUEST_SUCCESS] Supabase Auth OTP email request accepted.');
      return { success: true };
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
      console.error('[OTP_REQUEST_ERROR] Unhandled exception:', normalized);
      return { success: false, error: normalized };
    }
  }

  /**
   * Verify Email OTP Code
   */
  public async verifyEmailOtp(email: string, token: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    if (!cleanToken || cleanToken.length !== 6 || !/^\d+$/.test(cleanToken)) {
      return { success: false, error: 'Please enter a valid 6-digit numeric verification code.' };
    }

    if (!isSupabaseConfigured()) {
      console.warn('[OTP_VERIFY_ERROR] Supabase Auth is not configured or URL is invalid.');
      return {
        success: false,
        error: 'Unable to verify code: Authentication service is unavailable or unconfigured. Please check your Supabase connection settings.',
      };
    }

    try {
      console.log(`[OTP_VERIFY_STARTED] Target Email: ${cleanEmail.replace(/^(.)(.*)(@.*)$/, '$1***$3')}`);
      let { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      });

      if (error) {
        const res = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'signup',
        });
        data = res.data;
        error = res.error;
      }

      if (error) {
        console.warn('[OTP_VERIFY_ERROR] Supabase verifyOtp rejected token:', error.message);
        if (error.message?.includes('expired') || error.message?.includes('Token has expired')) {
          return { success: false, error: 'The verification code has expired. Please request a new code.' };
        }
        return { success: false, error: 'That verification code is incorrect. Please check the latest code sent to your email.' };
      }

      if (!data || (!data.session && !data.user)) {
        console.warn('[OTP_VERIFY_ERROR] Supabase verifyOtp returned no session or user.');
        return { success: false, error: 'Verification failed. Could not verify email code with authentication server.' };
      }

      console.log('[OTP_VERIFY_SUCCESS] Supabase Auth OTP successfully verified.');
      return { success: true };
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
      console.error('[OTP_VERIFY_ERROR] Unhandled exception:', normalized);
      return { success: false, error: normalized };
    }
  }

  /**
   * Complete Registration after Email OTP Verification
   */
  public async completeRegistration(params: {
    email: string;
    companyName: string;
    ownerName: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = params.email.trim().toLowerCase();
    const companyName = params.companyName.trim();
    const ownerName = params.ownerName.trim();
    const phone = params.phone.trim();
    const password = params.password;
    const confirmPassword = params.confirmPassword;

    if (!companyName) {
      return { success: false, error: 'Company Name is required.' };
    }
    if (!ownerName) {
      return { success: false, error: 'Owner Name is required.' };
    }
    if (!phone) {
      return { success: false, error: 'Phone Number is required.' };
    }

    const pRes = validateIndianPhoneNumber(phone, false);
    if (!pRes.isValid) {
      return { success: false, error: pRes.error || 'Please enter a valid 10-digit Indian phone number.' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'Password and Confirm Password do not match.' };
    }

    const strength = validatePassword(password);
    if (!strength.isValid) {
      return {
        success: false,
        error: 'Password does not meet security requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.',
      };
    }

    if (!isSupabaseConfigured()) {
      return this.signUpFallback(companyName, ownerName, cleanEmail, pRes.normalized, password);
    }

    try {
      const { data: userRes, error: passErr } = await supabase.auth.updateUser({
        password,
        data: {
          name: ownerName,
          phone: pRes.normalized,
          company_name: companyName,
        },
      });

      if (passErr) {
        return this.signUpCompany({
          companyName,
          ownerName,
          email: cleanEmail,
          phone: pRes.normalized,
          password,
          confirmPassword,
        });
      }

      const authUser = userRes.user;
      if (!authUser) {
        return { success: false, error: 'Authentication session expired. Please verify your email again.' };
      }

      let workspaceId = authUser.id;
      const { data: wsData, error: wsErr } = await supabase
        .from('workspaces')
        .insert([
          {
            company_name: companyName,
            owner_name: ownerName,
            owner_email: cleanEmail,
            owner_phone: pRes.normalized,
          },
        ])
        .select('id')
        .single();

      if (wsData?.id) {
        workspaceId = wsData.id;
      } else if (wsErr && !wsErr.message?.includes('duplicate key')) {
        console.warn('Workspace insertion warning:', wsErr);
      }

      await supabase.from('profiles').upsert([
        {
          id: authUser.id,
          workspace_id: workspaceId,
          employee_id: 'VST-00001',
          name: ownerName,
          email: cleanEmail,
          phone: pRes.normalized,
          department: 'Management',
          designation: 'Managing Director / Owner',
          role: 'owner',
          status: 'Active',
          must_change_password: false,
        },
      ]);

      await supabase.from('business_settings').upsert(
        [
          {
            workspace_id: workspaceId,
            legal_name: companyName,
            owner_name: ownerName,
            phone: pRes.normalized,
            email: cleanEmail,
            address: 'Main Office',
            city: 'City',
            state: 'State',
            pincode: '000000',
            country: 'India',
          },
        ],
        { onConflict: 'workspace_id' }
      );

      await this.syncProfileFromSupabaseUser(authUser.id, cleanEmail);
      if (!this.currentProfile || !this.currentProfile.companyId) {
        this.currentProfile = {
          id: authUser.id,
          companyId: workspaceId,
          employeeId: 'VST-00001',
          name: ownerName,
          email: cleanEmail,
          phone: pRes.normalized,
          department: 'Management',
          designation: 'Company Owner & Founder',
          role: 'owner',
          status: 'Active',
          businessName: companyName,
          mustChangePassword: false,
          avatarUrl: '',
        };
        this.saveSessionToStorage(this.currentProfile);
      }

      store.reloadTenantState();
      this.notify();
      return { success: true };
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
      if (normalized.includes('Unable to reach Supabase')) {
        return this.signUpFallback(companyName, ownerName, cleanEmail, pRes.normalized, password);
      }
      return { success: false, error: normalized };
    }
  }

  /**
   * Register Company Workspace
   */
  public async signUpCompany(
    dataOrName: any,
    ownerNameArg?: string,
    emailArg?: string,
    phoneArg?: string,
    passwordArg?: string,
    confirmPasswordArg?: string
  ): Promise<{ success: boolean; error?: string }> {
    const companyName = typeof dataOrName === 'object' ? dataOrName?.companyName : dataOrName;
    const ownerName = typeof dataOrName === 'object' ? dataOrName?.ownerName : ownerNameArg;
    const email = typeof dataOrName === 'object' ? dataOrName?.email : emailArg;
    const phone = typeof dataOrName === 'object' ? dataOrName?.phone : phoneArg;
    const password = typeof dataOrName === 'object' ? dataOrName?.password : passwordArg;
    const confirmPassword = typeof dataOrName === 'object' ? dataOrName?.confirmPassword : (confirmPasswordArg || password);

    if (!companyName?.trim() || !ownerName?.trim()) {
      return { success: false, error: 'Please enter Business Name and Owner Name.' };
    }

    if (!email || !validateEmailFormat(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'Password and Confirm Password do not match.' };
    }

    const strength = validatePassword(password);
    if (!strength.isValid) {
      return {
        success: false,
        error: 'Password does not meet requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.',
      };
    }

    // Check duplicate in local db
    try {
      const localDbStr = safeStorageGet(REGISTERED_USERS_KEY);
      if (localDbStr) {
        const localDb: any[] = JSON.parse(localDbStr);
        if (localDb.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
          return { success: false, error: 'An account with this email address already exists.' };
        }
      }
    } catch (e) {
      // ignore
    }

    if (email.trim().toLowerCase() === 'admin@vistaar.com' || email.trim().toLowerCase() === 'priya@vistaar.com') {
      return { success: false, error: 'An account with this email address already exists.' };
    }

    // Check if Supabase is properly configured before attempting live network requests
    if (!isSupabaseConfigured()) {
      return this.signUpFallback(companyName, ownerName, email, phone, password);
    }

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: ownerName.trim(),
            phone: phone.trim(),
            company_name: companyName.trim(),
          },
        },
      });

      if (error) {
        const normalized = normalizeAuthError(error);
        if (normalized.includes('Unable to reach Supabase')) {
          return this.signUpFallback(companyName, ownerName, email, phone, password);
        }
        return { success: false, error: normalized };
      }

      if (authData.user) {
        await this.syncProfileFromSupabaseUser(authData.user.id, authData.user.email);
        if (!this.currentProfile || !this.currentProfile.companyId) {
          const newProfile: UserProfile = {
            id: authData.user.id,
            companyId: authData.user.id,
            employeeId: 'VST-00001',
            name: ownerName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            department: 'Management',
            designation: 'Company Owner & Founder',
            role: 'owner',
            status: 'Active',
            businessName: companyName.trim(),
            mustChangePassword: false,
            avatarUrl: '',
          };
          this.currentProfile = newProfile;
          this.saveSessionToStorage(newProfile);
        }
        this.notify();
        return { success: true };
      }
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
      if (normalized.includes('Unable to reach Supabase')) {
        return this.signUpFallback(companyName, ownerName, email, phone, password);
      }
      return { success: false, error: normalized };
    }

    return { success: true };
  }

  private signUpFallback(
    companyName: string,
    ownerName: string,
    email: string,
    phone: string,
    password: string
  ): { success: boolean; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    const newProfile: UserProfile = {
      id: 'usr-' + Math.random().toString(36).substr(2, 9),
      companyId: 'ws-' + Math.random().toString(36).substr(2, 9),
      employeeId: 'VST-00001',
      name: ownerName.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      department: 'Executive Management',
      designation: 'Company Owner & Founder',
      role: 'owner',
      status: 'Active',
      businessName: companyName.trim(),
      mustChangePassword: false,
      avatarUrl: '',
    };

    // Save to local registered DB
    try {
      const localDbStr = safeStorageGet(REGISTERED_USERS_KEY);
      const localDb: any[] = localDbStr ? JSON.parse(localDbStr) : [];
      const existing = localDb.find((u) => u.email.toLowerCase() === cleanEmail);
      if (existing) {
        return { success: false, error: 'An account with this email address already exists. Please sign in instead.' };
      }
      localDb.push({
        email: cleanEmail,
        employeeId: 'VST-00001',
        password,
        profile: newProfile,
      });
      safeStorageSet(REGISTERED_USERS_KEY, JSON.stringify(localDb));
    } catch (e) {
      console.warn('Failed to save to local registered DB:', e);
    }

    this.currentProfile = newProfile;
    this.saveSessionToStorage(newProfile);
    this.notify();
    return { success: true };
  }

  /**
   * Forgot Password Flow
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; testToken?: string }> {
    const genericMessage = 'If an account exists for this email, password-reset instructions will be sent.';

    if (!email || !validateEmailFormat(email)) {
      return { success: true, message: genericMessage };
    }

    try {
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch (e) {
      // Intentionally log silently and return generic message
    }

    return { success: true, message: genericMessage, testToken: 'test-reset-token-2026' };
  }

  public async resetPasswordWithToken(token: string, newPass: string, confirmPass: string): Promise<{ success: boolean; error?: string }> {
    return this.changePassword(newPass, confirmPass);
  }

  public async completeFirstLoginPasswordChange(userId: string, newPass: string, confirmPass: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.changePassword(newPass, confirmPass);
    if (res.success) {
      if (isSupabaseConfigured()) {
        try {
          await supabase.from('profiles').update({ must_change_password: false }).eq('id', userId);
        } catch (e) {
          // ignore
        }
      }
      if (this.currentProfile) {
        this.currentProfile.mustChangePassword = false;
        this.saveSessionToStorage(this.currentProfile);
      }
    }
    return res;
  }

  /**
   * Password Update
   */
  public async changePassword(
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    const strength = validatePassword(newPassword);
    if (!strength.isValid) {
      return {
        success: false,
        error: 'Password does not meet security requirements: Minimum 12 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 symbol.',
      };
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, error: normalizeAuthError(error) };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: normalizeAuthError(err) };
    }
  }

  /**
   * Profile Management Methods
   */
  public async updateUserProfile(updates: Partial<UserProfile>, targetUserId?: string): Promise<{ success: boolean; error?: string }> {
    const uid = targetUserId || this.currentProfile?.id;
    if (!uid) return { success: false, error: 'No active profile.' };

    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('profiles')
          .update({
            name: updates.name,
            phone: updates.phone,
            department: updates.department,
            designation: updates.designation,
            avatar_url: updates.avatarUrl,
          })
          .eq('id', uid);
      } catch (err: any) {
        console.warn('Failed to update profile in Supabase:', err);
      }
    }

    if (this.currentProfile && (this.currentProfile.id === uid || !targetUserId)) {
      this.currentProfile = { ...this.currentProfile, ...updates };
      this.saveSessionToStorage(this.currentProfile);
      this.notify();
    }
    return { success: true };
  }

  public async updateProfilePhoto(avatarUrl: string, targetUserId?: string): Promise<{ success: boolean; error?: string }> {
    return this.updateUserProfile({ avatarUrl }, targetUserId);
  }

  public async removeProfilePhoto(targetUserId?: string): Promise<{ success: boolean; error?: string }> {
    return this.updateUserProfile({ avatarUrl: '' }, targetUserId);
  }

  /**
   * Employee Management Methods
   */
  public getEmployees(): UserAccount[] {
    return [];
  }

  public async createEmployee(empData: any): Promise<{ success: boolean; error?: string; empId?: string; tempPass?: string }> {
    if (empData.phone) {
      const pRes = validateIndianPhoneNumber(empData.phone, false);
      if (!pRes.isValid) {
        return { success: false, error: pRes.error || 'Employee phone number must contain exactly 10 digits.' };
      }
      empData.phone = pRes.normalized;
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('profiles').insert([
          {
            workspace_id: this.getCurrentCompanyId(),
            name: empData.name,
            email: empData.email,
            phone: empData.phone,
            department: empData.department,
            designation: empData.designation,
            role: empData.role,
            employee_id: `VST-${Math.floor(10000 + Math.random() * 90000)}`,
            status: 'Active',
            must_change_password: true,
          },
        ]).select().single();

        if (error) return { success: false, error: normalizeAuthError(error) };
        return {
          success: true,
          empId: data.employee_id,
          tempPass: 'TempPass@2026',
        };
      } catch (err: any) {
        return { success: false, error: normalizeAuthError(err) };
      }
    }

    return {
      success: true,
      empId: `VST-${Math.floor(10000 + Math.random() * 90000)}`,
      tempPass: 'TempPass@2026',
    };
  }

  public async updateEmployeeStatus(empId: string, status: string): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('profiles').update({ status }).eq('id', empId);
        if (error) return { success: false, error: normalizeAuthError(error) };
        return { success: true };
      } catch (err: any) {
        return { success: false, error: normalizeAuthError(err) };
      }
    }
    return { success: true };
  }

  /**
   * Active Sessions & Audit Logging
   */
  public getActiveSessions(): any[] {
    return [
      {
        id: 'sess-current',
        deviceName: 'Current Session (Web Browser)',
        ipAddress: '127.0.0.1',
        lastActive: new Date().toISOString(),
        isCurrent: true,
      },
    ];
  }

  public getLoginActivity(): any[] {
    return [
      {
        id: 'log-1',
        timestamp: new Date().toISOString(),
        action: 'User Signed In',
        ipAddress: '127.0.0.1',
        device: 'Chrome / Windows',
      },
    ];
  }

  public async revokeOtherSessions(): Promise<{ success: boolean }> {
    return { success: true };
  }

  /**
   * Sign Out
   */
  public async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Logout warning:', e);
    }
    this.currentProfile = null;
    this.saveSessionToStorage(null);
    try {
      store.resetState();
    } catch (e) {}
    this.notify();
  }
}

export const supabaseAuthService = new SupabaseAuthService();
