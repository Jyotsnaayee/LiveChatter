import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Lock, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
import type { AppStateSnapshot, User } from '../shared/types';
import { api } from '../lib/api';
import { CaptchaWidget } from './CaptchaWidget';

interface AuthGateScreenProps {
  pendingInviteCode?: string | null;
  onAuthenticated: (payload: { token: string; user: User; snapshot: AppStateSnapshot; isNewUser?: boolean }) => void;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45c-.28 1.48-1.12 2.74-2.38 3.58v2.97h3.85c2.25-2.07 3.57-5.13 3.57-8.58z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.85-2.97c-1.07.72-2.44 1.14-4.08 1.14-3.14 0-5.8-2.12-6.75-4.97H1.27v3.06C3.24 21.29 7.3 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.29A7.18 7.18 0 0 1 4.87 12c0-.79.14-1.56.38-2.29V6.65H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.35l3.98-3.06z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.3 0 3.24 2.71 1.27 6.65l3.98 3.06C6.2 6.87 8.86 4.75 12 4.75z"
      />
    </svg>
  );
}

export function AuthGateScreen({ pendingInviteCode, onAuthenticated }: AuthGateScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [step, setStep] = useState<'google' | 'google_form' | 'captcha'>('google');
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState(false);

  // Account info before final CAPTCHA step
  const [oauthTicket, setOauthTicket] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Mandatory final-step CAPTCHA state
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);

  const [busy, setBusy] = useState(false);
  const [waitingOAuthState, setWaitingOAuthState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOAuthProviders()
      .then((res) => setGoogleOAuthConfigured(Boolean(res.providers?.google)))
      .catch(() => setGoogleOAuthConfigured(false));
  }, []);

  // Listen for real Google OAuth popup postMessage -> advance to final CAPTCHA step
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        oauthTicket?: string;
        profile?: { email?: string; displayName?: string };
        error?: string;
      };
      if (!data || typeof data !== 'object') return;
      if (data.type === 'OAUTH_PENDING_CAPTCHA' && data.oauthTicket) {
        setWaitingOAuthState(null);
        setOauthTicket(data.oauthTicket);
        setEmail(data.profile?.email || '');
        setDisplayName(data.profile?.displayName || '');
        setError(null);
        setCaptchaAnswer('');
        setCaptchaRefresh((n) => n + 1);
        setStep('captcha');
      } else if (data.type === 'OAUTH_ERROR') {
        setWaitingOAuthState(null);
        setError(data.error || 'Google sign-in was cancelled or failed.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Poll server OAuth state for mobile browsers where window.opener is severed across redirects
  useEffect(() => {
    if (!waitingOAuthState) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await api.getOAuthStatus(waitingOAuthState);
        if (!active) return;
        if (res.status === 'ready' && res.oauthTicket) {
          setWaitingOAuthState(null);
          setOauthTicket(res.oauthTicket);
          setEmail(res.profile?.email || '');
          setDisplayName(res.profile?.displayName || '');
          setError(null);
          setCaptchaAnswer('');
          setCaptchaRefresh((n) => n + 1);
          setStep('captcha');
        } else if (res.status === 'error') {
          setWaitingOAuthState(null);
          setError(res.error || 'Google sign-in failed.');
        } else if (res.status === 'expired') {
          setWaitingOAuthState(null);
        }
      } catch {
        // Keep polling transiently
      }
    };
    const timer = window.setInterval(poll, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [waitingOAuthState]);

  const handleCaptchaChange = useCallback((payload: { captchaId: string; captchaAnswer: string }) => {
    setCaptchaId(payload.captchaId);
    setCaptchaAnswer(payload.captchaAnswer);
  }, []);

  const handleStartGoogle = async () => {
    setError(null);
    if (googleOAuthConfigured) {
      setBusy(true);
      try {
        const { url, state } = await api.getOAuthUrl('google');
        setWaitingOAuthState(state);
        const popup = window.open(url, 'google_oauth_popup', 'width=560,height=680');
        if (!popup) {
          setWaitingOAuthState(null);
          setError('Popup was blocked by your browser. Allow popups or enter your Google email below.');
          setStep('google_form');
        }
      } catch (err) {
        setWaitingOAuthState(null);
        setError(err instanceof Error ? err.message : 'Unable to start Google sign-in.');
        setStep('google_form');
      } finally {
        setBusy(false);
      }
    } else {
      setStep('google_form');
    }
  };

  const handleContinueToCaptcha = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid Google email address (e.g. you@gmail.com).');
      return;
    }
    if (mode === 'signup' && !displayName.trim()) {
      setError('Enter your display name to create your account.');
      return;
    }
    setOauthTicket(null);
    setCaptchaAnswer('');
    setCaptchaRefresh((n) => n + 1);
    setStep('captcha');
  };

  const handleFinalVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!captchaAnswer.trim() || captchaAnswer.trim().length < 6) {
      setError('Enter all 6 characters from the human verification CAPTCHA.');
      return;
    }

    setBusy(true);
    try {
      const res = oauthTicket
        ? await api.completeOAuth({
            oauthTicket,
            captchaId,
            captchaAnswer: captchaAnswer.trim(),
            mode,
          })
        : await api.providerAuth({
            provider: 'google',
            email: email.trim(),
            displayName: displayName.trim() || undefined,
            mode,
            captchaId,
            captchaAnswer: captchaAnswer.trim(),
          });
      onAuthenticated({
        token: res.token,
        user: res.user,
        snapshot: res.snapshot,
        isNewUser: res.isNewUser,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Human verification failed. Please try again.');
      setCaptchaAnswer('');
      setCaptchaRefresh((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0E1117] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 overflow-hidden rounded-2xl border border-white/10 bg-[#171A21] shadow-2xl">
        {/* Left Brand Context Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-[#12151C] border-b lg:border-b-0 lg:border-r border-white/[0.08] p-7">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-white">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-white">LiveChatter</h1>
                <p className="text-xs text-slate-400">Real-time servers, voice & quests</p>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white leading-tight">
                Sign in with Google to continue.
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Every member verifies with Google and completes human verification before joining channels, quests, and voice rooms.
              </p>
            </div>

            {pendingInviteCode && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                Invite code <span className="font-mono font-bold">{pendingInviteCode}</span> detected — sign in to redeem it right away.
              </div>
            )}
          </div>

          <div className="mt-8 space-y-2.5 border-t border-white/[0.08] pt-5 text-xs text-slate-400">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Mandatory Google sign-in + final-step CAPTCHA verification</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Earn Feature Balls from Daily, Weekly & Monthly quests</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Lock className="h-4 w-4 text-blue-400 shrink-0" />
              <span>Customize your profile, buy server ranks & boost communities</span>
            </div>
          </div>
        </div>

        {/* Right Sign-In & CAPTCHA Flow */}
        <div className="lg:col-span-7 p-7 sm:p-9 flex flex-col justify-center">
          {/* Step Progress Indicator */}
          <div className="mb-6 flex items-center gap-3 text-xs">
            <div
              className={`flex items-center gap-1.5 font-semibold ${
                step === 'captcha' ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {step === 'captcha' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[11px] font-bold text-white">
                  1
                </span>
              )}
              <span>Google Account</span>
            </div>
            <div className="h-px flex-1 bg-white/10" />
            <div
              className={`flex items-center gap-1.5 font-semibold ${
                step === 'captcha' ? 'text-white' : 'text-slate-500'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  step === 'captcha' ? 'bg-[#2563EB] text-white' : 'bg-white/10 text-slate-400'
                }`}
              >
                2
              </span>
              <span>Human Verification (CAPTCHA)</span>
            </div>
          </div>

          {/* Mode Toggle */}
          {step !== 'captcha' && (
            <div className="mb-5 flex gap-1.5 rounded-xl bg-[#111318] p-1 border border-white/[0.07]">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === 'signin' ? 'bg-[#232733] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In with Google
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === 'signup' ? 'bg-[#232733] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account with Google
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300">
              {error}
            </div>
          )}

          {step === 'google' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  {mode === 'signin' ? 'Welcome back' : 'Create your LiveChatter account'}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Step 1 of 2: Authenticate with your Google account. A human verification CAPTCHA will follow as the final step.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleStartGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <GoogleMark />
                <span>{mode === 'signin' ? 'Continue with Google' : 'Sign up with Google'}</span>
              </button>

              {waitingOAuthState && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-3 text-xs text-blue-200 space-y-2">
                  <p className="font-semibold">Waiting for Google sign-in...</p>
                  <p className="text-blue-200/80">
                    Finish signing in on the Google tab, then switch back here to complete the CAPTCHA.
                  </p>
                  <button
                    type="button"
                    onClick={() => setWaitingOAuthState(null)}
                    className="text-[11px] font-semibold text-blue-300 underline hover:text-white"
                  >
                    Cancel waiting
                  </button>
                </div>
              )}

              <p className="text-center text-[11px] text-slate-500">
                Google account sign-in is required for all users on LiveChatter.
              </p>
            </div>
          )}

          {step === 'google_form' && (
            <form onSubmit={handleContinueToCaptcha} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GoogleMark />
                  <h3 className="font-display text-base font-bold text-white">
                    {mode === 'signin' ? 'Google Sign-In' : 'Create Account via Google'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('google');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Google Email Address</label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full rounded-xl border border-white/12 bg-[#111318] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Display Name {mode === 'signin' && <span className="font-normal text-slate-500">(optional for returning accounts)</span>}
                  </label>
                  <input
                    type="text"
                    required={mode === 'signup'}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Mercer"
                    className="w-full rounded-xl border border-white/12 bg-[#111318] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] transition-colors"
              >
                Continue to Human Verification →
              </button>
            </form>
          )}

          {step === 'captcha' && (
            <form onSubmit={handleFinalVerify} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111318] px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <GoogleMark />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">
                      {displayName || email.split('@')[0]}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">{email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('google_form');
                    setOauthTicket(null);
                    setError(null);
                  }}
                  className="text-xs font-medium text-blue-400 hover:underline shrink-0"
                >
                  Change
                </button>
              </div>

              <div>
                <h3 className="font-display text-base font-bold text-white">
                  Final Step: Confirm you’re human
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Complete the CAPTCHA below to finish {mode === 'signup' ? 'creating your account' : 'signing in'} and enter LiveChatter.
                </p>
              </div>

              <CaptchaWidget
                refreshTrigger={captchaRefresh}
                value={captchaAnswer}
                onChange={handleCaptchaChange}
                disabled={busy}
              />

              <button
                type="submit"
                disabled={busy || captchaAnswer.trim().length < 6}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-45"
              >
                {busy
                  ? 'Verifying...'
                  : mode === 'signup'
                  ? 'Verify CAPTCHA & Create Account'
                  : 'Verify CAPTCHA & Continue to LiveChatter'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
