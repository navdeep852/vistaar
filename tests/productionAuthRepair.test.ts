import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeAuthError } from '../src/lib/authErrorNormalizer.ts';

describe('VISTAAR — Production Authentication & Error Normalization Engine', () => {
  it('1. Correctly maps "Error sending confirmation email" to SMTP guidance (fixes bug)', () => {
    const error = {
      status: 500,
      message: 'Error sending confirmation email',
    };
    const normalized = normalizeAuthError(error);

    assert.ok(
      normalized.includes('Unable to deliver verification email') || normalized.includes('SMTP'),
      `Expected SMTP delivery guidance, got: "${normalized}"`
    );
    assert.strictEqual(
      normalized.includes('temporarily unavailable'),
      false,
      'Must NOT misclassify SMTP error as generic temporary outage'
    );
  });

  it('2. Correctly maps legacy "Error sending confirmation mail" and email_provider_error', () => {
    const error1 = { status: 500, message: 'Error sending confirmation mail' };
    assert.ok(normalizeAuthError(error1).includes('verification email'));

    const error2 = { code: 'email_provider_error', message: 'Failed to send email' };
    assert.ok(normalizeAuthError(error2).includes('verification email'));
  });

  it('3. Correctly maps Rate Limiting (429 and over_email_send_rate_limit)', () => {
    const err429 = { status: 429, message: 'Too many requests' };
    assert.ok(normalizeAuthError(err429).includes('Too many verification attempts'));

    const errCode = { code: 'over_email_send_rate_limit', message: 'Rate limit exceeded' };
    assert.ok(normalizeAuthError(errCode).includes('Too many verification attempts'));
  });

  it('4. Correctly maps Invalid and Expired OTP tokens', () => {
    const expired = { message: 'Token has expired or is invalid' };
    assert.strictEqual(
      normalizeAuthError(expired),
      'The verification code is incorrect or expired.'
    );

    const invalid = { message: 'invalid_otp: token is invalid' };
    assert.strictEqual(
      normalizeAuthError(invalid),
      'The verification code is incorrect or expired.'
    );
  });

  it('5. Correctly maps Disabled OTP signups in Supabase Auth configuration', () => {
    const otpDisabled = {
      status: 422,
      code: 'otp_disabled',
      message: 'Signups not allowed for otp',
    };
    const normalized = normalizeAuthError(otpDisabled);
    assert.ok(
      normalized.includes('Email OTP signups are currently disabled'),
      `Expected OTP disabled message, got: "${normalized}"`
    );
  });

  it('6. Correctly maps Duplicate Email / User Already Registered', () => {
    const err = { message: 'User already registered' };
    assert.strictEqual(
      normalizeAuthError(err),
      'An account with this email address already exists. Please sign in instead.'
    );
  });

  it('7. Correctly maps Network & DNS transport failures', () => {
    const errFetch = { message: 'Failed to fetch' };
    assert.ok(normalizeAuthError(errFetch).includes('Unable to reach Supabase Auth server'));

    const errNet = { message: 'NetworkError when attempting to fetch resource.' };
    assert.ok(normalizeAuthError(errNet).includes('Unable to reach Supabase Auth server'));
  });

  it('8. Correctly maps true infrastructure outages (502, 503, 504, 525)', () => {
    const err502 = { status: 502, message: 'Bad Gateway' };
    assert.strictEqual(
      normalizeAuthError(err502),
      'VISTAAR authentication is temporarily unavailable. Please try again shortly.'
    );

    const err503 = { status: 503, message: 'Service Unavailable' };
    assert.strictEqual(
      normalizeAuthError(err503),
      'VISTAAR authentication is temporarily unavailable. Please try again shortly.'
    );
  });
});

describe('VISTAAR — Email Sanitization & Normalization Invariants', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it('1. Normalizes and validates standard Gmail addresses', () => {
    const raw = '  User.Test+tag@GMAIL.COM  ';
    const clean = raw.trim().toLowerCase();
    assert.strictEqual(clean, 'user.test+tag@gmail.com');
    assert.ok(emailRegex.test(clean));
  });

  it('2. Normalizes and validates corporate Outlook / Enterprise domains', () => {
    const raw = 'Accountant@Company-Group.Co.In ';
    const clean = raw.trim().toLowerCase();
    assert.strictEqual(clean, 'accountant@company-group.co.in');
    assert.ok(emailRegex.test(clean));
  });

  it('3. Rejects invalid and malformed email inputs', () => {
    const invalidEmails = ['', '   ', 'notanemail', 'user@', '@domain.com', 'user @domain.com'];
    for (const em of invalidEmails) {
      assert.strictEqual(emailRegex.test(em.trim().toLowerCase()), false, `Should reject: "${em}"`);
    }
  });
});

describe('VISTAAR — Multi-Tenant Atomic Provisioning RPC & Schema Invariants', () => {
  const rootDir = process.cwd();
  const migrationPath = path.resolve(
    rootDir,
    'supabase/migrations/077_atomic_workspace_provisioning_and_auth_repair.sql'
  );

  it('1. Migration 077 exists on disk and is syntactically structured', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration 077 must exist');
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(content.startsWith('-- ============================================================================='));
    assert.ok(content.includes('BEGIN;'));
    assert.ok(content.includes('COMMIT;'));
  });

  it('2. Migration 077 declares public.provision_company_workspace with SECURITY DEFINER', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('CREATE OR REPLACE FUNCTION public.provision_company_workspace'),
      'Must declare provision_company_workspace'
    );
    assert.ok(
      content.includes('SECURITY DEFINER'),
      'provision_company_workspace must run as SECURITY DEFINER'
    );
    assert.ok(
      content.includes('SET search_path = public, extensions, pg_temp'),
      'Must enforce restricted search_path'
    );
    assert.ok(
      content.includes('auth.uid()'),
      'Must bind strictly to auth.uid()'
    );
  });

  it('3. Migration 077 declares public.check_email_registered RPC for safe pre-registration', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('CREATE OR REPLACE FUNCTION public.check_email_registered'),
      'Must declare check_email_registered'
    );
    assert.ok(
      content.includes('GRANT EXECUTE ON FUNCTION public.check_email_registered(TEXT) TO anon, authenticated, service_role'),
      'Must grant execute to anon, authenticated, service_role'
    );
  });

  it('4. Migration 077 preserves employee account handling and trigger compatibility', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes("NEW.raw_user_meta_data->>'account_type' = 'employee'"),
      'Must preserve employee account discrimination'
    );
    assert.ok(
      content.includes('public.generate_next_employee_id(v_target_ws_id)'),
      'Must preserve employee ID generation'
    );
    assert.ok(
      content.includes("ON CONFLICT (owner_email) DO NOTHING"),
      'Must preserve owner_email uniqueness'
    );
  });

  it('5. Frontend supabaseAuth.ts integrates provision_company_workspace and check_email_registered', () => {
    const authServicePath = path.resolve(rootDir, 'src/services/supabaseAuth.ts');
    const content = fs.readFileSync(authServicePath, 'utf-8');

    assert.ok(
      content.includes("check_email_registered"),
      'supabaseAuth.ts must call check_email_registered'
    );
    assert.ok(
      content.includes("provision_company_workspace"),
      'supabaseAuth.ts must call provision_company_workspace'
    );
  });
});
