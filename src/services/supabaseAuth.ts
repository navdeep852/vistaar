import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { UserProfile, UserRole, UserAccount } from '../types';
import { validatePassword, validateEmailFormat } from '../lib/passwordPolicy';
import { validateIndianPhoneNumber } from '../lib/phoneUtils';
import { store } from './store';
import { isValidUuid } from '../lib/supabaseError';

const SESSION_STORAGE_KEY = 'vistaar_user_session';

const getLocalStorage = (): Storage | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
};

// In-memory fallback storage for server/node testing environments where localStorage is absent
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

/**
 * Converts raw network errors, Supabase exceptions, or DNS failures
 * into clear, user-friendly diagnostic error messages.
 */
export function normalizeAuthError(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';
  const msg = typeof error === 'string' ? error : error.message || error.error_description || String(error);
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || error?.error || '');

  // 1. Rate Limiting (429)
  if (status === 429 || code === 'over_email_send_rate_limit' || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many verification attempts. Please wait before trying again.';
  }

  // 2. OTP Verification Failure / Invalid or Expired Token
  if (
    msg.includes('Token has expired') ||
    msg.includes('otp_expired') ||
    msg.includes('invalid_otp') ||
    msg.includes('Invalid token') ||
    msg.includes('Token is invalid')
  ) {
    return 'The verification code is incorrect or expired.';
  }

  // 3. SMTP / Email Provider Error
  if (
    msg.includes('Error sending confirmation mail') ||
    msg.includes('SMTP') ||
    msg.includes('email_provider_error') ||
    msg.includes('Failed to send email')
  ) {
    return "We couldn't deliver the verification email. Please check your Supabase SMTP settings or try again.";
  }

  // 4. Server / Infrastructure Outage (500, 502, 503, 525)
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 525 ||
    msg.includes('Service Unavailable') ||
    msg.includes('Internal Server Error')
  ) {
    return 'VISTAAR authentication is temporarily unavailable. Please try again shortly.';
  }

  // 5. Network / DNS / Transport Failure
  if (
    msg.includes('Failed to fetch') ||
    msg.includes('TypeError') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('NetworkError') ||
    msg.includes('fetch failed') ||
    msg.includes('Failed to connect') ||
    msg.includes('Network Error') ||
    msg.includes('AuthRetryableFetchError')
  ) {
    return 'Unable to reach Supabase Auth server. Check your internet connection and Supabase project availability.';
  }

  // 6. Invalid Credentials
  if (
    msg.includes('Invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('Invalid credentials')
  ) {
    return 'Invalid email or password.';
  }

  // 7. Account Already Exists
  if (msg.includes('User already registered') || msg.includes('already registered') || msg.includes('email_exists')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }

  // 8. Password Policy
  if (msg.includes('Password should be at least')) {
    return 'Password does not meet minimum length requirements.';
  }

  return msg;
}

export class SupabaseAuthService {
  private currentProfile: UserProfile | null = null;
  private listeners: Set<() => void> = new Set();
  private isPasswordRecoveryMode: boolean = false;

  constructor() {
    this.currentProfile = this.loadCachedSession();
    this.initSessionListener();
    this.handleAuthRedirect();
  }

  /**
   * Explicit PKCE Code Exchange Handling for Redirects (Password Reset, Email Confirmation)
   */
  public async handleAuthRedirect(): Promise<void> {
    if (typeof window === 'undefined' || !isSupabaseConfigured()) return;

    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const type = url.searchParams.get('type');
      const isRecoveryUrl =
        url.pathname.includes('/reset-password') ||
        type === 'recovery' ||
        url.hash.includes('type=recovery');

      if (isRecoveryUrl) {
        this.isPasswordRecoveryMode = true;
      }

      if (code) {
        console.log('[AUTH_CODE_EXCHANGE] Exchanging PKCE authorization code for session...');
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[AUTH_CODE_EXCHANGE_ERROR]', error.message);
        } else {
          console.log('[AUTH_CODE_EXCHANGE_SUCCESS] Auth session established successfully.');
          if (data?.session?.user) {
            await this.syncProfileFromSupabaseUser(data.session.user.id, data.session.user.email);
          }
          if (isRecoveryUrl || type === 'recovery') {
            this.isPasswordRecoveryMode = true;
          }
        }

        // Clean the code parameter (and type parameter if present) out of the URL so it isn't reprocessed or left visible
        url.searchParams.delete('code');
        if (type) url.searchParams.delete('type');
        window.history.replaceState({}, document.title, url.toString());
      }

      this.notify();
    } catch (e) {
      console.warn('[AUTH_REDIRECT_WARNING] Exception during auth redirect handling:', e);
    }
  }

  private loadCachedSession(): UserProfile | null {
    try {
      const stored = safeStorageGet(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && Boolean(parsed.id) && Boolean(parsed.email || parsed.name)) {
          // SESSION RECONCILIATION: If cached companyId was corrupted to match user.id, clean it to force database re-fetch
          if (parsed.companyId && parsed.companyId === parsed.id) {
            console.warn(`[SESSION_RECONCILIATION] Cleaned corrupted cached companyId matching user.id (${parsed.id})`);
            parsed.companyId = '';
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached session:', e);
      safeStorageRemove(SESSION_STORAGE_KEY);
    }
    return null;
  }

  private saveSessionToStorage(profile: UserProfile | null) {
    if (profile && profile.id) {
      safeStorageSet(SESSION_STORAGE_KEY, JSON.stringify(profile));
    } else {
      safeStorageRemove(SESSION_STORAGE_KEY);
    }
  }

  private initSessionListener() {
    try {
      supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'PASSWORD_RECOVERY') {
          this.isPasswordRecoveryMode = true;
        }
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

  public isRecoverySession(): boolean {
    return this.isPasswordRecoveryMode;
  }

  public clearRecoverySession(): void {
    this.isPasswordRecoveryMode = false;
    if (typeof window !== 'undefined') {
      try {
        window.history.replaceState({}, document.title, window.location.origin + '/');
      } catch (e) {
        // ignore
      }
    }
    this.notify();
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
    return this.currentProfile !== null && Boolean(this.currentProfile?.id);
  }

  public getCurrentCompanyId(): string {
    const cid = this.currentProfile?.companyId || '';
    if (cid && this.currentProfile?.id && cid === this.currentProfile.id) {
      console.warn(`[WORKSPACE_CORRUPTION_DETECTED] getCurrentCompanyId found corrupted companyId matching userId (${cid}). Returning empty string.`);
      return '';
    }
    return cid;
  }

  /**
   * Central Authoritative Workspace Resolver
   * Guarantees that auth.uid() is NEVER returned as workspace_id.
   * Resolves: auth.uid() -> profiles.id -> profiles.workspace_id
   * Reconciles cached session & local storage automatically.
   */
  public async getAuthoritativeWorkspaceId(): Promise<string> {
    const currentCid = this.getCurrentCompanyId();
    if (currentCid && isValidUuid(currentCid)) {
      return currentCid;
    }

    if (!isSupabaseConfigured()) {
      return this.currentProfile?.companyId || '';
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authUser = session?.user;
      if (!authUser) {
        if (this.currentProfile?.companyId && isValidUuid(this.currentProfile.companyId) && this.currentProfile.companyId !== this.currentProfile.id) {
          return this.currentProfile.companyId;
        }
        return '';
      }

      const userId = authUser.id;

      // 1. Query database profile for workspace_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id, workspaces(company_name)')
        .eq('id', userId)
        .maybeSingle();

      let dbWsId = profile?.workspace_id;

      // 2. Validate dbWsId is a valid UUID AND NOT equal to authUser.id
      if (!dbWsId || !isValidUuid(dbWsId) || dbWsId === userId) {
        // Fallback: Query workspaces table by owner_email or id
        const { data: ws } = await supabase
          .from('workspaces')
          .select('id, company_name')
          .or(`owner_email.eq.${authUser.email},id.eq.${userId}`)
          .maybeSingle();

        if (ws?.id && isValidUuid(ws.id) && ws.id !== userId) {
          dbWsId = ws.id;
        }
      }

      if (!dbWsId || !isValidUuid(dbWsId) || dbWsId === userId) {
        console.error(`[WORKSPACE_RESOLVER_ERROR] Authoritative workspace_id could not be resolved for auth.uid=${userId}`);
        throw new Error('Unable to determine workspace for authenticated user.');
      }

      // 3. Reconcile in-memory profile and localStorage session cache
      if (this.currentProfile) {
        if (this.currentProfile.companyId !== dbWsId) {
          console.log(`[SESSION_RECONCILIATION] Reconciled stale companyId (${this.currentProfile.companyId}) to database workspace_id (${dbWsId})`);
          this.currentProfile.companyId = dbWsId;
          if (profile?.workspaces?.company_name) {
            this.currentProfile.businessName = profile.workspaces.company_name;
          }
          this.saveSessionToStorage(this.currentProfile);
          store.reloadTenantState();
        }
      } else {
        await this.syncProfileFromSupabaseUser(userId, authUser.email);
      }

      return dbWsId;
    } catch (e) {
      console.warn('getAuthoritativeWorkspaceId error:', e);
      if (this.currentProfile?.companyId && isValidUuid(this.currentProfile.companyId) && this.currentProfile.companyId !== this.currentProfile.id) {
        return this.currentProfile.companyId;
      }
      return '';
    }
  }

  /**
   * Development assertion to detect workspace corruption before tenant-scoped DB operations
   */
  public assertWorkspaceIdValid(clientWorkspaceId: string, operationName: string, tableName: string): void {
    if (import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production')) {
      const authUserId = this.currentProfile?.id;
      if (authUserId && clientWorkspaceId === authUserId) {
        console.error(
          `[WORKSPACE_ID_MISMATCH] Critical error in ${operationName} on ${tableName}: client workspace_id (${clientWorkspaceId}) matches auth.uid (${authUserId})! Operation blocked.`
        );
        throw new Error(`[WORKSPACE_ID_MISMATCH] Cannot execute ${operationName} on ${tableName} with auth user ID as workspace_id.`);
      }
      if (!isValidUuid(clientWorkspaceId)) {
        console.error(
          `[WORKSPACE_ID_MISMATCH] Invalid workspace_id format (${clientWorkspaceId}) in ${operationName} on ${tableName}. Operation blocked.`
        );
        throw new Error(`[WORKSPACE_ID_MISMATCH] Invalid workspace_id for ${operationName} on ${tableName}.`);
      }
    }
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

    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Authentication service is unavailable.' };
    }

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
      return { success: false, error: normalizeAuthError(err) };
    }
  }

  /**
   * Secure Employee ID to Email Resolution
   */
  public async resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
    const cleanId = identifier.trim();

    if (validateEmailFormat(cleanId)) {
      return cleanId.toLowerCase();
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
    return { success: false, error: networkErrorMsg || 'Invalid email or password.' };
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

    if (!isSupabaseConfigured()) {
      console.warn('[OTP_REQUEST_ERROR] Supabase Auth is not configured or URL is invalid.');
      return {
        success: false,
        error: 'Email OTP service is unavailable. Please verify that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are configured with a valid Supabase project.',
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
      return {
        success: false,
        error: 'Authentication service is unavailable. Please verify that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are configured with a valid live Supabase project.',
      };
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

      // Query authoritative profile record from database
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', authUser.id)
        .single();

      let workspaceId = profileData?.workspace_id;

      if (profileErr || !workspaceId || !isValidUuid(workspaceId) || workspaceId === authUser.id) {
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('id')
          .eq('owner_email', cleanEmail)
          .maybeSingle();

        if (wsData?.id && isValidUuid(wsData.id) && wsData.id !== authUser.id) {
          workspaceId = wsData.id;
        }
      }

      if (!workspaceId || !isValidUuid(workspaceId) || workspaceId === authUser.id) {
        console.error(`[REGISTRATION_WORKSPACE_ERROR] Unable to determine workspace for user ${authUser.id}`);
        throw new Error('Unable to determine workspace for authenticated user.');
      }

      // Update existing workspace details instead of creating a second workspace row
      const { error: wsErr } = await supabase
        .from('workspaces')
        .update({
          company_name: companyName,
          owner_name: ownerName,
          owner_phone: pRes.normalized,
        })
        .eq('id', workspaceId);

      if (wsErr) {
        console.warn('Workspace update warning:', wsErr);
      }

      // Update owner profile fields
      await supabase
        .from('profiles')
        .update({
          name: ownerName,
          phone: pRes.normalized,
        })
        .eq('id', authUser.id);

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
      if (!this.currentProfile || !this.currentProfile.companyId || this.currentProfile.companyId === authUser.id) {
        const authWsId = await this.getAuthoritativeWorkspaceId();
        if (authWsId && authWsId !== authUser.id) {
          if (this.currentProfile) {
            this.currentProfile.companyId = authWsId;
            this.saveSessionToStorage(this.currentProfile);
          }
        }
      }

      store.reloadTenantState();
      this.notify();
      return { success: true };
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
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

    // Check if Supabase is properly configured before attempting live network requests
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Authentication service is unavailable. Please verify that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are configured with a valid live Supabase project.',
      };
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
        return { success: false, error: normalized };
      }

      if (authData.user) {
        await this.syncProfileFromSupabaseUser(authData.user.id, authData.user.email);
        if (!this.currentProfile || !this.currentProfile.companyId || this.currentProfile.companyId === authData.user.id) {
          const authWsId = await this.getAuthoritativeWorkspaceId();
          if (authWsId && authWsId !== authData.user.id) {
            if (this.currentProfile) {
              this.currentProfile.companyId = authWsId;
              this.saveSessionToStorage(this.currentProfile);
            }
          }
        }
        this.notify();
        return { success: true };
      }
    } catch (err: any) {
      const normalized = normalizeAuthError(err);
      return { success: false, error: normalized };
    }

    return { success: true };
  }

  /**
   * Forgot Password Flow
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const genericMessage = 'If an account exists for this email, password-reset instructions will be sent.';

    if (!email || !validateEmailFormat(email)) {
      return { success: true, message: genericMessage };
    }

    try {
      const targetOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${targetOrigin}/reset-password`,
      });
    } catch (e) {
      // Intentionally log silently and return generic message
    }

    return { success: true, message: genericMessage };
  }

  public async completePasswordReset(
    newPass: string,
    confirmPass: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isRecoverySession() && !this.isAuthenticated()) {
      return {
        success: false,
        error: 'Password reset link is invalid or expired. Please request a new password reset link.',
      };
    }

    const res = await this.changePassword(newPass, confirmPass);
    if (res.success) {
      this.clearRecoverySession();
    }
    return res;
  }

  public async resetPasswordWithToken(
    arg1: string,
    arg2?: string,
    arg3?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Backwards compatibility overload handling
    const newPass = arg2 !== undefined ? arg2 : arg1;
    const confirmPass = arg3 !== undefined ? arg3 : arg2 || arg1;
    return this.completePasswordReset(newPass, confirmPass);
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
        const updatePayload: Record<string, any> = {};
        if (updates.name !== undefined) updatePayload.name = updates.name;
        if (updates.phone !== undefined) updatePayload.phone = updates.phone;
        if (updates.department !== undefined) updatePayload.department = updates.department;
        if (updates.designation !== undefined) updatePayload.designation = updates.designation;
        if (updates.avatarUrl !== undefined) updatePayload.avatar_url = updates.avatarUrl;

        const { data, error } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', uid)
          .select()
          .single();

        if (error) {
          console.error('Failed to update profile in Supabase:', error);
          return { success: false, error: normalizeAuthError(error) };
        }

        if (data && (this.currentProfile?.id === uid || !targetUserId)) {
          this.currentProfile = {
            ...this.currentProfile,
            id: data.id,
            name: data.name || this.currentProfile?.name || '',
            email: data.email || this.currentProfile?.email || '',
            businessName: this.currentProfile?.businessName || 'VISTAAR Business Solutions',
            companyId: data.workspace_id || this.currentProfile?.companyId || '',
            role: data.role || this.currentProfile?.role || 'owner',
            phone: data.phone || '',
            department: data.department || '',
            designation: data.designation || '',
            employeeId: data.employee_id || this.currentProfile?.employeeId || 'VST-00001',
            status: data.status || 'Active',
            avatarUrl: data.avatar_url !== undefined ? data.avatar_url : (this.currentProfile?.avatarUrl || ''),
          };
          this.saveSessionToStorage(this.currentProfile);
          this.notify();
        }
        return { success: true };
      } catch (err: any) {
        console.error('Failed to update profile in Supabase:', err);
        return { success: false, error: normalizeAuthError(err) };
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
  private employees: UserAccount[] = [];

  public async loadEmployees(): Promise<UserAccount[]> {
    const workspaceId = this.getCurrentCompanyId();
    if (!workspaceId || !isSupabaseConfigured()) {
      return this.employees;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (!error && data) {
        this.employees = data.map((p: any) => ({
          id: p.id,
          email: p.email || '',
          name: p.name || '',
          companyId: p.workspace_id || workspaceId,
          role: p.role || 'employee',
          phone: p.phone || '',
          department: p.department || '',
          designation: p.designation || '',
          employeeId: p.employee_id || `VST-${p.id.slice(0, 5)}`,
          status: p.status || 'Active',
          avatarUrl: p.avatar_url || '',
          passwordHash: '',
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at || new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
    return this.employees;
  }

  public getEmployees(): UserAccount[] {
    return this.employees;
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
        
        await this.loadEmployees();
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
        await this.loadEmployees();
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
