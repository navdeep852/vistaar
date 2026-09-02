import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Mail,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Building,
  User,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { supabaseAuthService as auth } from '../services/supabaseAuth';
import { showToast } from '../components/Toast';
import logoFullNameLight from '../assets/Vistaar_Logo_With_Name_Light.png';
import logoFullNameDark from '../assets/Vistaar_Logo_With_Name.png';
import { ThemeToggle } from '../components/ThemeToggle';
import { PhoneInput } from '../components/PhoneInput';
import { validateIndianPhoneNumber } from '../lib/phoneUtils';

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
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin');

  // Sign In State
  const [identifier, setIdentifier] = useState('admin@vistaar.com');
  const [loginPassword, setLoginPassword] = useState('Vistaar@2026Secure');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-step Sign Up State
  const [signupStep, setSignupStep] = useState<'email' | 'otp' | 'registration' | 'success'>('email');
  const [signupEmail, setSignupEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState<number>(0);

  const [signupCompany, setSignupCompany] = useState('');
  const [signupOwner, setSignupOwner] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [signupPass, setSignupPass] = useState('');
  const [signupConfirmPass, setSignupConfirmPass] = useState('');
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // OTP Box Refs
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Forgot Password & Reset State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetConfirmPass, setResetConfirmPass] = useState('');

  // Password Recovery Listener
  useEffect(() => {
    const checkRecovery = () => {
      if (auth.isRecoverySession()) {
        setAuthMode('reset');
      }
    };
    checkRecovery();
    const unsubscribe = auth.subscribe(checkRecovery);
    return unsubscribe;
  }, []);

  // First Login Force Password Change Modal State
  const [forceChangeModalOpen, setForceChangeModalOpen] = useState(false);
  const [pendingUserAccount, setPendingUserAccount] = useState<UserAccount | null>(null);
  const [forceNewPass, setForceNewPass] = useState('');
  const [forceConfirmPass, setForceConfirmPass] = useState('');

  // Resend Timer Countdown
  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Mask Email for OTP Display (e.g. r****h@company.com)
  const maskEmail = (emailStr: string) => {
    if (!emailStr || !emailStr.includes('@')) return emailStr;
    const [local, domain] = emailStr.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}${'*'.repeat(Math.max(2, local.length - 2))}${local[local.length - 1]}@${domain}`;
  };

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

  // Step 1: Request Email OTP Handler
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = signupEmail.trim();
    if (!cleanEmail) {
      setError('Please enter your work or personal email address.');
      return;
    }

    setLoading(true);
    const res = await auth.requestEmailOtp(cleanEmail);
    setLoading(false);

    if (res.success) {
      setSignupStep('otp');
      setResendTimer(60);
      setOtpDigits(['', '', '', '', '', '']);
      showToast(`Verification code sent to ${cleanEmail}`, 'info');
      setTimeout(() => otpRefs[0].current?.focus(), 150);
    } else {
      setError(res.error || 'Failed to send verification code.');
    }
  };

  // Resend OTP Action
  const handleResendOtp = async () => {
    if (resendTimer > 0 || loading) return;
    setError(null);
    setLoading(true);
    const res = await auth.requestEmailOtp(signupEmail);
    setLoading(false);

    if (res.success) {
      setResendTimer(60);
      setOtpDigits(['', '', '', '', '', '']);
      showToast(`New verification code sent to ${signupEmail}`, 'info');
      setTimeout(() => otpRefs[0].current?.focus(), 150);
    } else {
      setError(res.error || 'Failed to resend verification code.');
    }
  };

  // Step 2: Verify OTP Handler
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const otpCode = otpDigits.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setLoading(true);
    const res = await auth.verifyEmailOtp(signupEmail, otpCode);
    setLoading(false);

    if (res.success) {
      showToast('Email verified successfully! Complete your registration details.', 'success');
      setSignupStep('registration');
    } else {
      setError(res.error || 'That code is incorrect. Please check the code sent to your email.');
    }
  };

  // OTP Box Input Handlers
  const handleOtpDigitChange = (index: number, val: string) => {
    const digit = val.replace(/[^0-9]/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = digit;
    setOtpDigits(updated);
    setError(null);

    if (digit && index < 5) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const updated = ['', '', '', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        updated[i] = pasted[i];
      }
      setOtpDigits(updated);
      const nextFocusIndex = Math.min(pasted.length, 5);
      otpRefs[nextFocusIndex].current?.focus();
    }
  };

  // Step 3: Complete Company Sign Up Handler
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPhoneError(null);

    if (!signupCompany.trim()) {
      setError('Please enter Company / Business Name.');
      return;
    }

    if (!signupOwner.trim()) {
      setError('Please enter Owner / Admin Full Name.');
      return;
    }

    const pRes = validateIndianPhoneNumber(signupPhone, false);
    if (!pRes.isValid) {
      setPhoneError(pRes.error || 'Phone number must contain exactly 10 digits.');
      setError('Please enter a valid 10-digit Indian phone number.');
      return;
    }

    if (signupPass !== signupConfirmPass) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    const strength = validatePassword(signupPass);
    if (!strength.isValid) {
      setError('Password must satisfy all security requirements.');
      return;
    }

    setLoading(true);
    const res = await auth.completeRegistration({
      email: signupEmail,
      companyName: signupCompany,
      ownerName: signupOwner,
      phone: pRes.normalized,
      password: signupPass,
      confirmPassword: signupConfirmPass,
    });
    setLoading(false);

    if (res.success) {
      showToast('Company Workspace & Owner Account created successfully!', 'success');
      setSignupStep('success');
    } else {
      setError(res.error || 'Failed to complete company registration.');
    }
  };

  // Forgot Password Request Handler
  const handleRequestForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await auth.requestPasswordReset(forgotEmail);
    setLoading(false);

    setForgotMessage(res.message);
  };

  // Execute Password Reset with Token/Session
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setLoading(true);

    const res = await auth.completePasswordReset(resetNewPass, resetConfirmPass);
    setLoading(false);

    if (res.success) {
      showToast('Password reset successfully! Please log in with your new password.', 'success');
      auth.clearRecoverySession();
      // Force a full reload to the clean root so all state (recovery flag, URL, any
      // stale subscriptions) starts fresh, rather than trusting in-memory state alone.
      window.location.href = window.location.origin + '/';
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
                  Log in using your email address or assigned Employee ID (e.g. VST-00002)
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

          {/* ==================== 2. MULTI-STEP SIGN UP FLOW ==================== */}
          {authMode === 'signup' && (
            <div className="space-y-5">
              {/* Registration Step Indicator */}
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className={`flex items-center gap-1.5 ${signupStep === 'email' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${signupStep === 'email' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>1</span>
                  <span>Email</span>
                </div>
                <span className="text-slate-300 dark:text-slate-700">→</span>
                <div className={`flex items-center gap-1.5 ${signupStep === 'otp' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${signupStep === 'otp' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>2</span>
                  <span>OTP</span>
                </div>
                <span className="text-slate-300 dark:text-slate-700">→</span>
                <div className={`flex items-center gap-1.5 ${signupStep === 'registration' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${signupStep === 'registration' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>3</span>
                  <span>Details</span>
                </div>
              </div>

              {/* STEP 1: EMAIL ADDRESS INPUT */}
              {signupStep === 'email' && (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Step 1: Verify your email
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Enter your work or personal email address. We will send a 6-digit verification code to confirm ownership.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Work / Personal Email *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        required
                        autoFocus
                        value={signupEmail}
                        onChange={(e) => {
                          setSignupEmail(e.target.value);
                          setError(null);
                        }}
                        placeholder="owner@company.com"
                        className="w-full pl-10 pr-3.5 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Send Verification Code</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 2: EMAIL OTP VERIFICATION */}
              {signupStep === 'otp' && (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Step 2: Enter Verification Code
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setSignupStep('email');
                          setError(null);
                        }}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>Change Email</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Verification code dispatched to{' '}
                      <span className="font-bold text-slate-900 dark:text-white">{maskEmail(signupEmail)}</span>
                    </p>
                  </div>

                  {/* 6-DIGIT NUMERIC OTP BOXES */}
                  <div className="flex justify-between gap-1.5 sm:gap-2">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={otpRefs[idx]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        onPaste={idx === 0 ? handleOtpPaste : undefined}
                        className="w-10 sm:w-12 h-12 sm:h-13 text-center text-lg sm:text-xl font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Didn't receive the code?</span>
                    <button
                      type="button"
                      disabled={resendTimer > 0 || loading}
                      onClick={handleResendOtp}
                      className={`font-bold flex items-center gap-1.5 ${
                        resendTimer > 0
                          ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                          : 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span>{resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otpDigits.join('').length !== 6}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Verify Code & Continue</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 3: REGISTRATION DETAILS FORM */}
              {signupStep === 'registration' && (
                <form onSubmit={handleCompleteRegistration} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Step 3: Complete your business setup
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Email Verified</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Registering company workspace for{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{signupEmail}</span>
                    </p>
                  </div>

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
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <PhoneInput
                    id="signup-phone"
                    label="Owner Mobile Phone Number *"
                    value={signupPhone}
                    onChange={(val) => {
                      setSignupPhone(val);
                      setPhoneError(null);
                    }}
                    error={phoneError || undefined}
                    required
                  />

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Admin Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showSignupPass ? 'text' : 'password'}
                        required
                        value={signupPass}
                        onChange={(e) => setSignupPass(e.target.value)}
                        placeholder="Create a strong password"
                        className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPass(!showSignupPass)}
                        className="absolute right-3 top-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        {showSignupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* LIVE PASSWORD REQUIREMENTS INDICATOR WIDGET */}
                  <PasswordRequirementsWidget password={signupPass} />

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Confirm Admin Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        required
                        value={signupConfirmPass}
                        onChange={(e) => setSignupConfirmPass(e.target.value)}
                        placeholder="Repeat admin password"
                        className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3 top-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50 mt-2"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Create Workspace & Start Using VISTAAR</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 4: REGISTRATION SUCCESS CARD */}
              {signupStep === 'success' && (
                <div className="text-center space-y-4 py-4">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                      Workspace Ready!
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Welcome to <span className="font-bold text-blue-600 dark:text-blue-400">{signupCompany}</span>
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 text-left text-xs space-y-2">
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span className="text-slate-500">Owner Name:</span>
                      <span className="font-bold text-slate-900 dark:text-white">{signupOwner}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span className="text-slate-500">Work Email:</span>
                      <span className="font-bold text-slate-900 dark:text-white">{signupEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Assigned Role:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">Workspace Owner (Full Admin)</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onSuccess}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    <span>Launch VISTAAR Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
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
            </div>
          )}

          {/* ==================== 4. RESET PASSWORD FORM (ONLY RECOVERY SESSION) ==================== */}
          {authMode === 'reset' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Create New Permanent Password</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Your identity has been verified via the recovery link. Set your new account password below.
                </p>
              </div>

              <form onSubmit={handleExecuteReset} className="space-y-4 pt-2">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200">
                  <span className="font-bold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Verified Recovery Session Active</span>
                  </span>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                    Your session is verified by Supabase Auth recovery token.
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
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
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
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
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
