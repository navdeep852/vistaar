/**
 * VISTAAR BUSINESS OS — AUTH ERROR NORMALIZATION ENGINE
 * Converts raw network errors, Supabase GoTrue exceptions, SMTP delivery errors,
 * rate limits, or database exceptions into actionable, user-friendly diagnostic messages.
 */

export function normalizeAuthError(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';
  const msg = typeof error === 'string' ? error : error.message || error.error_description || String(error);
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || error?.error || '');
  const lowerMsg = msg.toLowerCase();

  // 1. Rate Limiting (429)
  if (
    status === 429 ||
    code === 'over_email_send_rate_limit' ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('too many requests')
  ) {
    return 'Too many verification attempts. Please wait a few minutes before trying again.';
  }

  // 2. OTP Verification Failure / Invalid or Expired Token
  if (
    lowerMsg.includes('token has expired') ||
    lowerMsg.includes('otp_expired') ||
    lowerMsg.includes('invalid_otp') ||
    lowerMsg.includes('invalid token') ||
    lowerMsg.includes('token is invalid') ||
    lowerMsg.includes('token is expired')
  ) {
    return 'The verification code is incorrect or expired.';
  }

  // 3. Email Delivery & SMTP Provider Errors (MUST check before generic status 500)
  if (
    code === 'email_provider_error' ||
    code === 'email_provider_disabled' ||
    lowerMsg.includes('error sending confirmation email') ||
    lowerMsg.includes('error sending confirmation mail') ||
    lowerMsg.includes('confirmation email') ||
    lowerMsg.includes('confirmation mail') ||
    lowerMsg.includes('email_provider_error') ||
    lowerMsg.includes('failed to send email') ||
    lowerMsg.includes('error sending email') ||
    lowerMsg.includes('error sending magic link') ||
    msg.includes('SMTP')
  ) {
    return "Unable to deliver verification email. Please verify that your Supabase Custom SMTP settings are configured in the Supabase Dashboard (Authentication -> Email Settings) or try again shortly.";
  }

  // 4. OTP / Email Provider Disabled in Supabase Auth
  if (
    code === 'otp_disabled' ||
    lowerMsg.includes('signups not allowed for otp') ||
    lowerMsg.includes('otp disabled')
  ) {
    return 'Email OTP signups are currently disabled in Supabase Auth configuration. Please enable Email OTP or contact support.';
  }

  // 5. Database Trigger / User Creation Errors
  if (
    lowerMsg.includes('database error saving new user') ||
    lowerMsg.includes('database error')
  ) {
    return 'A database error occurred while creating your account. Please contact system support.';
  }

  // 6. Account Already Exists
  if (
    lowerMsg.includes('user already registered') ||
    lowerMsg.includes('already registered') ||
    lowerMsg.includes('email_exists')
  ) {
    return 'An account with this email address already exists. Please sign in instead.';
  }

  // 7. Invalid Credentials
  if (
    lowerMsg.includes('invalid login credentials') ||
    lowerMsg.includes('invalid_credentials') ||
    lowerMsg.includes('invalid credentials')
  ) {
    return 'Invalid email or password.';
  }

  // 8. Password Policy
  if (lowerMsg.includes('password should be at least')) {
    return 'Password does not meet minimum length requirements.';
  }

  // 9. Network / DNS / Transport Failure
  if (
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('failed to connect') ||
    lowerMsg.includes('authretryablefetcherror') ||
    (lowerMsg.includes('typeerror') && lowerMsg.includes('fetch'))
  ) {
    return 'Unable to reach Supabase Auth server. Check your internet connection and Supabase project availability.';
  }

  // 10. Actual Server / Infrastructure Outage (502, 503, 504, 525)
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 525 ||
    lowerMsg.includes('service unavailable') ||
    lowerMsg.includes('bad gateway')
  ) {
    return 'VISTAAR authentication is temporarily unavailable. Please try again shortly.';
  }

  // 11. Generic 500 fallback
  if (status === 500 || lowerMsg.includes('internal server error')) {
    return 'Authentication server encountered an unexpected error. Please try again shortly or contact support.';
  }

  return msg;
}
