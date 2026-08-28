import React, { useState } from 'react';
import {
  Lock,
  Mail,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Building,
  User,
  Phone,
  CheckCircle2,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { supabaseAuthService as auth } from '../services/supabaseAuth';
import { showToast } from '../components/Toast';
import logoFullNameLight from '../assets/Vistaar_Logo_With_Name_Light.png';
import logoFullNameDark from '../assets/Vistaar_Logo_With_Name.png';
import { ThemeToggle } from '../components/ThemeToggle';

import { validatePassword } from '../lib/passwordPolicy';
import { Modal } from '../components/Modal';
import { UserAccount } from '../types';

export const PasswordRequirementsWidget: React.FC<{ password: string }> = ({ password }) => {
  const strength = validatePassword(password);
  return (
    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
        Password Requirements
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-medium">
        <div
          className={`flex items-center gap-1.5 ${
            strength.length
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <span className="w-4 text-center font-extrabold">{strength.length ? '✓' : '○'}</span> At least 12 characters
        </div>
        <div
          className={`flex items-center gap-1.5 ${
            strength.hasUppercase
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <span className="w-4 text-center font-extrabold">{strength.hasUppercase ? '✓' : '○'}</span> One uppercase letter
        </div>
        <div
          className={`flex items-center gap-1.5 ${
            strength.hasLowercase
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <span className="w-4 text-center font-extrabold">{strength.hasLowercase ? '✓' : '○'}</span> One lowercase letter
        </div>
        <div
          className={`flex items-center gap-1.5 ${
            strength.hasNumber
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <span className="w-4 text-center font-extrabold">{strength.hasNumber ? '✓' : '○'}</span> One number
        </div>
        <div
          className={`flex items-center gap-1.5 ${
            strength.hasSymbol
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <span className="w-4 text-center font-extrabold">{strength.hasSymbol ? '✓' : '○'}</span> One special character
        </div>
      </div>
    </div>
  );
};

interface LoginViewProps {
  onSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');

  // Sign In State
  const [identifier, setIdentifier] = useState('admin@vistaar.com');
  const [loginPassword, setLoginPassword] = useState('Vistaar@2026Secure');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign Up State
  const [signupCompany, setSignupCompany] = useState('');
  const [signupOwner, setSignupOwner] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupConfirmPass, setSignupConfirmPass] = useState('');

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [activeResetToken, setActiveResetToken] = useState<string | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetConfirmPass, setResetConfirmPass] = useState('');

  // First Login Force Password Change Modal State
  const [forceChangeModalOpen, setForceChangeModalOpen] = useState(false);
  const [pendingUserAccount, setPendingUserAccount] = useState<UserAccount | null>(null);
  const [forceNewPass, setForceNewPass] = useState('');
  const [forceConfirmPass, setForceConfirmPass] = useState('');

  // Sign In Handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await auth.login(identifier, loginPassword);
    setLoading(false);

    if (res.success) {
      if (res.mustChangePassword && res.userAccount) {
        setPendingUserAccount(res.userAccount);
        setForceChangeModalOpen(true);
        showToast('Temporary password detected. Please set your new permanent password.', 'info');
      } else {
        showToast('Welcome back to VISTAAR Business OS!', 'success');
        onSuccess();
      }
    } else {
      setError(res.error || 'Authentication failed.');
    }
  };

  // Company Sign Up Handler
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (signupPass !== signupConfirmPass) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    const strength = validatePassword(signupPass);
    if (!strength.isValid) {
      setError('Password must satisfy all requirements: min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol.');
      return;
    }

    setLoading(true);
    const res = await auth.signUpCompany({
      companyName: signupCompany,
      ownerName: signupOwner,
      email: signupEmail,
      phone: signupPhone,
      password: signupPass,
      confirmPassword: signupConfirmPass,
    });
    setLoading(false);

    if (res.success) {
      showToast('Company Workspace & Owner Account created successfully!', 'success');
      onSuccess();
    } else {
      setError(res.error || 'Failed to create company registration.');
    }
  };

  // Forgot Password Request Handler (Account Enumeration Protection)
  const handleRequestForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await auth.requestPasswordReset(forgotEmail);
    setLoading(false);

    setForgotMessage(res.message);
    if (res.testToken) {
      setActiveResetToken(res.testToken);
    }
  };

  // Execute Password Reset with Token
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResetToken) return;

    setError(null);
    setLoading(true);

    const res = await auth.resetPasswordWithToken(activeResetToken, resetNewPass, resetConfirmPass);
    setLoading(false);

    if (res.success) {
      showToast('Password reset successfully! Please log in with your new password.', 'success');
      setAuthMode('signin');
      setActiveResetToken(null);
      setForgotMessage(null);
      setLoginPassword('');
    } else {
      setError(res.error || 'Failed to reset password.');
    }
  };

  // Forced Employee First Login Password Change Handler
  const handleForcePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserAccount) return;

    setError(null);
    setLoading(true);

    const res = await auth.completeFirstLoginPasswordChange(
      pendingUserAccount.id,
      forceNewPass,
      forceConfirmPass
    );
    setLoading(false);

    if (res.success) {
      showToast('Permanent password updated! Welcome to VISTAAR.', 'success');
      setForceChangeModalOpen(false);
      onSuccess();
    } else {
      setError(res.error || 'Failed to update permanent password.');
    }
  };

  const handleQuickDemoLogin = (type: 'owner' | 'staff') => {
    if (type === 'owner') {
      setIdentifier('admin@vistaar.com');
      setLoginPassword('Vistaar@2026Secure');
    } else {
      setIdentifier('VST-00002');
      setLoginPassword('Staff@2026Secure');
    }
    setAuthMode('signin');
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-900 dark:text-white relative overflow-hidden transition-colors duration-200">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle variant="segmented" />
      </div>

      {/* Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <div className="mb-3">
          {/* Light Mode Logo (Dark Text) */}
          <img
            src={logoFullNameDark}
            alt="VISTAAR"
            className="h-20 sm:h-24 mx-auto object-contain drop-shadow-xl hover:scale-105 transition-transform duration-300 dark:hidden"
          />
          {/* Dark Mode Logo (Light Text) */}
          <img
            src={logoFullNameLight}
            alt="VISTAAR"
            className="h-20 sm:h-24 mx-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-300 hidden dark:block"
          />
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
          VISTAAR
        </h1>
        <p className="mt-1.5 text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 tracking-wide">
          Run Better. Grow Wider.
        </p>
        <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
          The Business OS for Growing Businesses
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md z-10">
        {/* Mode Selector Tabs */}
        <div className="flex bg-slate-200 dark:bg-slate-900 p-1.5 rounded-2xl mb-4 border border-slate-300 dark:border-slate-800 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => {
              setAuthMode('signin');
              setError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all ${
              authMode === 'signin'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('signup');
              setError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all ${
              authMode === 'signup'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            + Register Company
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-3xl sm:px-10 transition-colors duration-200">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* ==================== 1. SIGN IN FORM ==================== */}
          {authMode === 'signin' && (
            <form className="space-y-5" onSubmit={handleSignIn}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Work Email or Employee ID *
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-semibold"
                    placeholder="admin@company.com or VST-00001"
                  />
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                  Log in using your email address or assigned Employee ID (e.g. VST-00027)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Password *
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-slate-300 dark:border-slate-800 text-blue-600 focus:ring-blue-500 bg-slate-50 dark:bg-slate-950"
                  />
                  <span>Remember session</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('forgot');
                    setError(null);
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-bold"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In to VISTAAR</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ==================== 2. COMPANY SIGN UP FORM ==================== */}
          {authMode === 'signup' && (
            <form className="space-y-4" onSubmit={handleSignUp}>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Company / Business Name *
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    required
                    value={signupCompany}
                    onChange={(e) => setSignupCompany(e.target.value)}
                    placeholder="e.g. Vistaar Enterprises Pvt Ltd"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Owner / Admin Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    required
                    value={signupOwner}
                    onChange={(e) => setSignupOwner(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Work / Personal Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Admin Password *
                </label>
                <input
                  type="password"
                  required
                  value={signupPass}
                  onChange={(e) => setSignupPass(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>

              {/* LIVE PASSWORD REQUIREMENTS INDICATOR WIDGET */}
              <PasswordRequirementsWidget password={signupPass} />

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  value={signupConfirmPass}
                  onChange={(e) => setSignupConfirmPass(e.target.value)}
                  placeholder="Repeat admin password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Company Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ==================== 3. FORGOT PASSWORD FORM ==================== */}
          {authMode === 'forgot' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span>Password Recovery Assistant</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter your registered work email address below to receive password reset instructions.
                </p>
              </div>

              {forgotMessage && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Instructions Dispatched</span>
                  </div>
                  <p>{forgotMessage}</p>
                </div>
              )}

              {!activeResetToken ? (
                <form onSubmit={handleRequestForgot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Registered Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20"
                  >
                    Send Password Reset Instructions
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setError(null);
                    }}
                    className="w-full text-center text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white block mt-2"
                  >
                    ← Back to Sign In
                  </button>
                </form>
              ) : (
                /* RESET NEW PASSWORD FORM (TRIGGERED BY TOKEN) */
                <form onSubmit={handleExecuteReset} className="space-y-4 pt-2">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-900 dark:text-blue-200">
                    <span className="font-bold block">Secure Reset Token Verified</span>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                      Create your new permanent password below.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      New Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={resetNewPass}
                      onChange={(e) => setResetNewPass(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <PasswordRequirementsWidget password={resetNewPass} />

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Confirm New Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={resetConfirmPass}
                      onChange={(e) => setResetConfirmPass(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
                  >
                    Confirm & Update Password
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Quick Demo Access Bar */}
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Quick Demo Access:</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('owner')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
              >
                Owner Demo (admin@vistaar.com)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('staff')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
              >
                Employee Demo (VST-00002)
              </button>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span>256-Bit SSL Encrypted VISTAAR Secure Business OS</span>
        </p>
      </div>

      {/* ==================== FORCED EMPLOYEE FIRST LOGIN PASSWORD CHANGE MODAL ==================== */}
      <Modal
        isOpen={forceChangeModalOpen}
        onClose={() => setForceChangeModalOpen(false)}
        title="🔒 Set Permanent Password Required"
        maxWidth="md"
      >
        <form onSubmit={handleForcePasswordChange} className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 rounded-xl space-y-1">
            <h4 className="font-extrabold text-sm">Temporary Password Detected</h4>
            <p className="text-xs">
              You are logging in with a temporary password provided by your company administrator.
              You must set a new permanent password before accessing your VISTAAR workspace.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase">
              New Permanent Password *
            </label>
            <input
              type="password"
              required
              value={forceNewPass}
              onChange={(e) => setForceNewPass(e.target.value)}
              placeholder="Create your new permanent password"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
            />
          </div>

          <PasswordRequirementsWidget password={forceNewPass} />

          <div className="space-y-1">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase">
              Confirm Permanent Password *
            </label>
            <input
              type="password"
              required
              value={forceConfirmPass}
              onChange={(e) => setForceConfirmPass(e.target.value)}
              placeholder="Re-type your new permanent password"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              Update Password & Access Workspace
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
