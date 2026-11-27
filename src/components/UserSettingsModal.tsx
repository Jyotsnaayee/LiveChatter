import React, { useRef, useState } from 'react';
import {
  Accessibility,
  Camera,
  Download,
  Headphones,
  Keyboard,
  Laptop,
  LogOut,
  Palette,
  Shield,
  Sparkles,
  Trash2,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import type { ActiveSession, User, UserSettings } from '../shared/types';
import { processImageUpload } from '../lib/imageUpload';
import { Avatar } from './Avatar';
import { CaptchaWidget } from './CaptchaWidget';

const ACCENT_SWATCHES = [
  { name: 'Cobalt', hex: '#2563EB' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Crimson', hex: '#E11D48' },
  { name: 'Slate', hex: '#475569' },
];

type SettingsTab = 'account' | 'appearance' | 'voice' | 'privacy' | 'accessibility' | 'auth';

interface UserSettingsModalProps {
  currentUser: User;
  sessions: ActiveSession[];
  onClose: () => void;
  onSignOut: () => void;
  onOpenFeatureBallProfile: () => void;
  onUpdateProfile: (
    patch: Partial<
      Pick<User, 'displayName' | 'bio' | 'pronouns' | 'bannerColor' | 'avatarColor' | 'avatarDecoration' | 'profileEffect'>
    > & {
      avatarUrl?: string | null;
      settings?: Partial<UserSettings>;
    }
  ) => Promise<void>;
  onRevokeSession: (sessionId: string) => Promise<void>;
  onExportData: () => Promise<void>;
  onRegisterAccount: (payload: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    dateOfBirth: string;
    captchaId: string;
    captchaAnswer: string;
  }) => Promise<void>;
  onLoginAccount: (identifier: string, password: string, captchaId: string, captchaAnswer: string) => Promise<void>;
}

export function UserSettingsModal({
  currentUser,
  sessions,
  onClose,
  onSignOut,
  onOpenFeatureBallProfile,
  onUpdateProfile,
  onRevokeSession,
  onExportData,
  onRegisterAccount,
  onLoginAccount,
}: UserSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('account');
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [pronouns, setPronouns] = useState(currentUser.pronouns);
  const [bio, setBio] = useState(currentUser.bio);
  const [bannerColor, setBannerColor] = useState(currentUser.bannerColor);

  // Auth forms (CAPTCHA mandatory at final step)
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regDisplay, setRegDisplay] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDob, setRegDob] = useState('2000-01-15');
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const settings = currentUser.settings;
  const featureBalls = currentUser.featureBalls || 0;

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    setUploadingAvatar(true);
    try {
      const dataUrl = await processImageUpload(file, 256);
      await onUpdateProfile({ avatarUrl: dataUrl });
      setNotice('Profile image updated! Free — 0 Feature Balls spent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setError(null);
    setNotice(null);
    setUploadingAvatar(true);
    try {
      await onUpdateProfile({ avatarUrl: null });
      setNotice('Profile image removed! Free — 0 Feature Balls spent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove profile image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const updateSettings = async (partial: Partial<UserSettings>) => {
    setError(null);
    await onUpdateProfile({ settings: partial });
  };

  const navItems: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'My Account', icon: <UserIcon className="h-4 w-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
    { id: 'voice', label: 'Voice & Audio', icon: <Headphones className="h-4 w-4" /> },
    { id: 'privacy', label: 'Privacy & Safety', icon: <Shield className="h-4 w-4" /> },
    { id: 'accessibility', label: 'Accessibility & Keys', icon: <Accessibility className="h-4 w-4" /> },
    { id: 'auth', label: 'Switch / Sign Up', icon: <UserPlus className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[84vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] shadow-2xl"
      >
        <nav className="w-56 shrink-0 border-r border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#171A21] p-4 space-y-1 overflow-y-auto">
          <p className="px-2.5 pb-2 font-display text-xs font-bold text-slate-500 dark:text-slate-400">User Settings</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setNotice(null);
                setError(null);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.05]'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          <div className="pt-3 mt-3 border-t border-slate-200 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>

        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] px-6 py-4">
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              {navItems.find((n) => n.id === tab)?.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close user settings"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {notice && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {notice}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            {/* MY ACCOUNT */}
            {tab === 'account' && (
              <div className="space-y-6 max-w-xl">
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                  <div className="h-20" style={{ backgroundColor: bannerColor }} />
                  <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 -mt-8">
                    <div className="flex items-end gap-3">
                      <div className="rounded-full ring-4 ring-white dark:ring-[#1D2029]">
                        <Avatar user={currentUser} size="xl" showPresence />
                      </div>
                      <div className="pb-1">
                        <p className="font-display text-base font-bold text-slate-950 dark:text-white">
                          {currentUser.displayName}
                        </p>
                        <p className="text-xs text-slate-500">@{currentUser.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                      <button
                        type="button"
                        disabled={uploadingAvatar}
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>{uploadingAvatar ? 'Uploading...' : 'Change Photo (Free)'}</span>
                      </button>
                      {currentUser.avatarUrl && (
                        <button
                          type="button"
                          disabled={uploadingAvatar}
                          onClick={handleRemoveAvatar}
                          aria-label="Remove profile image"
                          title="Remove profile image (Free)"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 p-1.5 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <input
                        ref={avatarFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleAvatarFileChange}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs">
                  <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>
                      <strong>Profile photo is free (0 FB)</strong>. Name, bio &amp; banner edits cost{' '}
                      <strong>10 Feature Balls</strong> (Balance:{' '}
                      <strong className="font-mono">{featureBalls} FB</strong>).
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFeatureBallProfile();
                    }}
                    className="font-semibold text-[var(--accent)] hover:underline"
                  >
                    Open Full Profile Studio →
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    setNotice(null);
                    try {
                      await onUpdateProfile({ displayName, pronouns, bio, bannerColor });
                      setNotice('Profile saved! Spent 10 Feature Balls.');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unable to save profile.');
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Pronouns
                      </label>
                      <input
                        type="text"
                        value={pronouns}
                        onChange={(e) => setPronouns(e.target.value)}
                        placeholder="she/they, he/him, etc."
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Bio</label>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>Profile Banner Color</span>
                      <input
                        type="color"
                        value={bannerColor}
                        onChange={(e) => setBannerColor(e.target.value)}
                        className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={featureBalls < 10}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45"
                    >
                      Save Profile (10 FB)
                    </button>
                  </div>
                </form>

                {/* Security & Active Devices */}
                <div className="border-t border-slate-200 dark:border-white/8 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Two-Factor Authentication (2FA)</p>
                      <p className="text-xs text-slate-500">Protect your account with an authenticator app & backup codes.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ twoFactorEnabled: !settings.twoFactorEnabled })}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-medium ${
                        settings.twoFactorEnabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {settings.twoFactorEnabled ? 'Enabled' : 'Enable 2FA'}
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Devices & Sessions</p>
                    <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
                      {sessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                          <div className="flex items-center gap-2.5">
                            <Laptop className="h-4 w-4 text-slate-400" />
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {s.device} {s.current ? '· This device' : ''}
                              </p>
                              <p className="text-slate-500">
                                {s.location} · {s.lastActive}
                              </p>
                            </div>
                          </div>
                          {!s.current && (
                            <button
                              type="button"
                              onClick={() => onRevokeSession(s.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              <span>Log Out</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onExportData}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/12 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/6"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download My Account Data (JSON)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* APPEARANCE */}
            {tab === 'appearance' && (
              <div className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Theme</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['dark', 'light', 'system'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => updateSettings({ theme: t })}
                        className={`rounded-xl border px-4 py-3 text-sm font-medium capitalize transition-colors ${
                          settings.theme === t
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Accent Color <span className="text-xs font-normal text-slate-500">· Free for everyone</span>
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {ACCENT_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() => updateSettings({ accentColor: swatch.hex })}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          settings.accentColor.toLowerCase() === swatch.hex.toLowerCase()
                            ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-white/10 text-slate-950 dark:text-white'
                            : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: swatch.hex }} />
                        <span>{swatch.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Message Display Density</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cozy', 'compact'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => updateSettings({ density: d })}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-medium capitalize ${
                          settings.density === d
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-900 dark:text-white">Font Scaling</span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {Math.round(settings.fontScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.9}
                    max={1.2}
                    step={0.05}
                    value={settings.fontScale}
                    onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              </div>
            )}

            {/* VOICE & AUDIO */}
            {tab === 'voice' && (
              <div className="space-y-5 max-w-xl">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Input Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateSettings({ voiceMode: 'vad' })}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                        settings.voiceMode === 'vad'
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Voice Activity
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ voiceMode: 'ptt' })}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                        settings.voiceMode === 'ptt'
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Push to Talk ({settings.pttKey})
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-200">Voice Sensitivity Threshold</span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">{settings.vadSensitivity}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={settings.vadSensitivity}
                    onChange={(e) => updateSettings({ vadSensitivity: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                {(
                  [
                    ['noiseSuppression', 'Noise Suppression', 'Filter keyboard clicks and ambient background hum'],
                    ['echoCancellation', 'Echo Cancellation', 'Prevent speaker output from looping into your mic'],
                    ['autoGainControl', 'Automatic Gain Control', 'Keep speaking volume consistent across calls'],
                  ] as const
                ).map(([key, label, desc]) => (
                  <label key={key} className="flex items-center justify-between gap-4 py-1 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={() => updateSettings({ [key]: !settings[key] })}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </label>
                ))}
              </div>
            )}

            {/* PRIVACY & SAFETY */}
            {tab === 'privacy' && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                    Who can send you Direct Messages
                  </label>
                  <select
                    value={settings.dmPrivacy}
                    onChange={(e) => updateSettings({ dmPrivacy: e.target.value as UserSettings['dmPrivacy'] })}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="server_members">Server Members & Friends</option>
                    <option value="friends_only">Friends Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                    Explicit Media Filter
                  </label>
                  <select
                    value={settings.explicitMediaFilter}
                    onChange={(e) =>
                      updateSettings({ explicitMediaFilter: e.target.value as UserSettings['explicitMediaFilter'] })
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="all">Scan all direct messages</option>
                    <option value="non_friends">Scan DMs from non-friends</option>
                    <option value="off">Do not scan</option>
                  </select>
                </div>

                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Filter Unknown DMs into Message Requests</p>
                    <p className="text-xs text-slate-500">Review messages from non-friends before accepting them.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.messageRequestsEnabled}
                    onChange={() => updateSettings({ messageRequestsEnabled: !settings.messageRequestsEnabled })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Notification Sounds</p>
                    <p className="text-xs text-slate-500">Play a gentle chime when new messages arrive (silenced in Do Not Disturb).</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notificationSounds}
                    onChange={() => updateSettings({ notificationSounds: !settings.notificationSounds })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </label>
              </div>
            )}

            {/* ACCESSIBILITY & KEYBINDS */}
            {tab === 'accessibility' && (
              <div className="space-y-5 max-w-xl">
                {(
                  [
                    ['reducedMotion', 'Reduced Motion', 'Minimize transitions and animations across the interface'],
                    ['highContrast', 'High Contrast Accent', 'Increase focus ring and interactive accent legibility'],
                    ['disableAnimatedEmoji', 'Disable Animated Emoji & GIFs', 'Keep emoji and media static until interacted with'],
                    ['ttsEnabled', 'Enable Text-to-Speech', 'Allow reading messages aloud from the message menu'],
                    ['liveCaptions', 'Live Voice Captions (Opt-in)', 'Show live transcript strip during voice calls when available'],
                  ] as const
                ).map(([key, label, desc]) => (
                  <label key={key} className="flex items-center justify-between gap-4 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={() => updateSettings({ [key]: !settings[key] })}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </label>
                ))}

                <div className="border-t border-slate-200 dark:border-white/8 pt-4 space-y-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Keyboard className="h-4 w-4 text-[var(--accent)]" />
                    <span>Keyboard Shortcuts</span>
                  </p>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10 text-xs">
                    <div className="flex items-center justify-between px-3.5 py-2">
                      <span className="text-slate-600 dark:text-slate-300">Open Quick Switcher</span>
                      <kbd className="rounded bg-slate-100 dark:bg-white/10 px-2 py-0.5 font-mono">Ctrl / ⌘ + K</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3.5 py-2">
                      <span className="text-slate-600 dark:text-slate-300">Close Active Modal or Panel</span>
                      <kbd className="rounded bg-slate-100 dark:bg-white/10 px-2 py-0.5 font-mono">Esc</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SWITCH / SIGN UP / LOGIN (Google Sign Out + Mandatory CAPTCHA) */}
            {tab === 'auth' && (
              <div className="space-y-6 max-w-xl">
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Switch Google Account</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sign out to return to the Google Sign-In &amp; CAPTCHA gate and sign in with another Google account.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out &amp; Switch</span>
                  </button>
                </div>

                <div className="border-t border-slate-200 dark:border-white/8 pt-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setCaptchaRefresh((n) => n + 1);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        authMode === 'register'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Create New Account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setCaptchaRefresh((n) => n + 1);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        authMode === 'login'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Sign In with Password
                    </button>
                  </div>

                  {authMode === 'register' ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        try {
                          await onRegisterAccount({
                            email: regEmail,
                            username: regUsername,
                            displayName: regDisplay,
                            password: regPassword,
                            dateOfBirth: regDob,
                            captchaId,
                            captchaAnswer,
                          });
                          setNotice('Account created and signed in!');
                          setCaptchaAnswer('');
                          setCaptchaRefresh((n) => n + 1);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Registration failed.');
                          setCaptchaAnswer('');
                          setCaptchaRefresh((n) => n + 1);
                        }
                      }}
                      className="space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="email"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="Email address"
                          className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          required
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          placeholder="Unique username"
                          className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={regDisplay}
                          onChange={(e) => setRegDisplay(e.target.value)}
                          placeholder="Display name"
                          className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Password (8+ characters)"
                          className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Date of Birth (Minimum age 13 required)
                        </label>
                        <input
                          type="date"
                          required
                          value={regDob}
                          onChange={(e) => setRegDob(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 font-mono text-sm text-slate-900 dark:text-white"
                        />
                      </div>
                      <CaptchaWidget
                        refreshTrigger={captchaRefresh}
                        value={captchaAnswer}
                        onChange={({ captchaId: cid, captchaAnswer: ans }) => {
                          setCaptchaId(cid);
                          setCaptchaAnswer(ans);
                        }}
                      />
                      <button
                        type="submit"
                        disabled={captchaAnswer.trim().length < 6}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45"
                      >
                        Verify CAPTCHA &amp; Create Account
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        try {
                          await onLoginAccount(loginId, loginPw, captchaId, captchaAnswer);
                          setNotice('Signed in successfully.');
                          setCaptchaAnswer('');
                          setCaptchaRefresh((n) => n + 1);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Login failed.');
                          setCaptchaAnswer('');
                          setCaptchaRefresh((n) => n + 1);
                        }
                      }}
                      className="space-y-3"
                    >
                      <input
                        type="text"
                        required
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        placeholder="Email or username"
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                      <input
                        type="password"
                        required
                        value={loginPw}
                        onChange={(e) => setLoginPw(e.target.value)}
                        placeholder="Password"
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                      <CaptchaWidget
                        refreshTrigger={captchaRefresh}
                        value={captchaAnswer}
                        onChange={({ captchaId: cid, captchaAnswer: ans }) => {
                          setCaptchaId(cid);
                          setCaptchaAnswer(ans);
                        }}
                      />
                      <button
                        type="submit"
                        disabled={captchaAnswer.trim().length < 6}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-45"
                      >
                        Verify CAPTCHA &amp; Sign In
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
