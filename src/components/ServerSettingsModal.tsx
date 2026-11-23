import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Bot,
  Calendar,
  Check,
  Copy,
  Gift,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Ticket,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import type {
  InstalledBot,
  Message,
  PermissionKey,
  Role,
  Server,
  User,
} from '../shared/types';
import { buildDefaultInviteMessage, buildInviteShareLinks } from '../lib/inviteShare';

const ALL_PERMISSIONS: { key: PermissionKey; label: string; dangerous?: boolean }[] = [
  { key: 'VIEW_CHANNEL', label: 'View Channels' },
  { key: 'SEND_MESSAGES', label: 'Send Messages' },
  { key: 'MANAGE_MESSAGES', label: 'Manage & Pin Messages' },
  { key: 'CONNECT', label: 'Connect to Voice / Stage' },
  { key: 'SPEAK', label: 'Speak in Voice / Stage' },
  { key: 'VIDEO', label: 'Share Video & Screen' },
  { key: 'MUTE_MEMBERS', label: 'Mute / Stage Moderate Members' },
  { key: 'MENTION_EVERYONE', label: 'Mention @everyone & @here' },
  { key: 'MANAGE_CHANNELS', label: 'Manage Channels' },
  { key: 'MANAGE_ROLES', label: 'Manage Roles' },
  { key: 'MANAGE_SERVER', label: 'Manage Server Settings' },
  { key: 'TIMEOUT_MEMBERS', label: 'Timeout Members' },
  { key: 'KICK_MEMBERS', label: 'Kick Members' },
  { key: 'BAN_MEMBERS', label: 'Ban Members' },
  { key: 'ADMINISTRATOR', label: 'Administrator (Full Override)', dangerous: true },
];

type TabId = 'overview' | 'roles' | 'automod' | 'audit' | 'events' | 'invites' | 'tickets' | 'insights' | 'apps';

interface ServerSettingsModalProps {
  server: Server;
  initialTab?: string;
  users: Record<string, User>;
  currentUser: User;
  messages: Record<string, Message[]>;
  botDirectory: InstalledBot[];
  onClose: () => void;
  onUpdateServer: (patch: Record<string, unknown>) => Promise<void>;
}

export function ServerSettingsModal({
  server,
  initialTab,
  users,
  currentUser,
  messages,
  botDirectory,
  onClose,
  onUpdateServer,
}: ServerSettingsModalProps) {
  const [tab, setTab] = useState<TabId>((initialTab as TabId) || 'overview');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Overview state
  const [srvName, setSrvName] = useState(server.name);
  const [srvDesc, setSrvDesc] = useState(server.description);
  const [srvVanity, setSrvVanity] = useState(server.vanityCode || '');
  const [srvVerify, setSrvVerify] = useState(server.verificationLevel);
  const [emojiName, setEmojiName] = useState('');
  const [emojiSymbol, setEmojiSymbol] = useState('✨');

  // Roles state
  const [selectedRoleId, setSelectedRoleId] = useState(server.roles[0]?.id || '');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#2563EB');

  // AutoMod state
  const [ruleName, setRuleName] = useState('');
  const [ruleKeywords, setRuleKeywords] = useState('');
  const [ruleAction, setRuleAction] = useState<'block' | 'alert' | 'timeout'>('block');

  // Event state
  const [evtTitle, setEvtTitle] = useState('');
  const [evtDesc, setEvtDesc] = useState('');
  const [evtType, setEvtType] = useState<'stage' | 'voice' | 'external'>('stage');
  const [evtDate, setEvtDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));

  // Webhook state
  const [hookName, setHookName] = useState('');
  const [hookChannelId, setHookChannelId] = useState(
    server.channels.find((c) => c.type === 'text' || c.type === 'announcement')?.id || server.channels[0]?.id || ''
  );

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Ticket Bot & Invite Rewards state
  const [ticketWelcome, setTicketWelcome] = useState(
    server.ticketBot?.welcomeMessage ||
      'Need help, have a question, or want to claim an invite reward? Generate a personal ticket below.'
  );
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardDesc, setRewardDesc] = useState('');
  const [rewardReqInvites, setRewardReqInvites] = useState(3);
  const [rewardRoleId, setRewardRoleId] = useState('');

  const runUpdate = async (patch: Record<string, unknown>, okText: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await onUpdateServer(patch);
      setStatusMsg(okText);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save settings.');
    }
  };

  const selectedRole: Role | undefined = server.roles.find((r) => r.id === selectedRoleId) || server.roles[0];

  const channelInsights = server.channels
    .map((ch) => ({
      channel: ch,
      count: (messages[ch.id] || []).length,
    }))
    .sort((a, b) => b.count - a.count);

  const totalMessages = channelInsights.reduce((acc, item) => acc + item.count, 0);
  const onlineMembersCount = server.members.filter((m) => {
    const st = users[m.userId]?.status;
    return st && st !== 'offline' && st !== 'invisible';
  }).length;

  const navItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Settings className="h-4 w-4" /> },
    { id: 'roles', label: 'Roles & Permissions', icon: <Shield className="h-4 w-4" /> },
    { id: 'automod', label: 'AutoMod & Safety', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" /> },
    { id: 'events', label: 'Scheduled Events', icon: <Calendar className="h-4 w-4" /> },
    { id: 'invites', label: 'Invites', icon: <Link2 className="h-4 w-4" /> },
    { id: 'tickets', label: 'Ticket Bot & Rewards', icon: <Ticket className="h-4 w-4" /> },
    { id: 'insights', label: 'Server Insights', icon: <BarChart2 className="h-4 w-4" /> },
    { id: 'apps', label: 'Bots & Webhooks', icon: <Bot className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[84vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] shadow-2xl"
      >
        {/* Left Settings Nav */}
        <nav className="w-56 shrink-0 border-r border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#171A21] p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-1">
            <p className="px-2.5 pb-2 font-display text-xs font-bold text-slate-500 dark:text-slate-400 truncate">
              {server.name}
            </p>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setStatusMsg(null);
                  setErrorMsg(null);
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
          </div>
          <p className="px-2.5 pt-4 text-[11px] text-slate-400">
            All server features are free for every community.
          </p>
        </nav>

        {/* Main Content */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] px-6 py-4">
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              {navItems.find((n) => n.id === tab)?.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close server settings"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {statusMsg && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div className="space-y-6 max-w-2xl">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runUpdate(
                      { name: srvName, description: srvDesc, vanityCode: srvVanity, verificationLevel: srvVerify },
                      'Server overview saved.'
                    );
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Server Name</label>
                    <input
                      type="text"
                      value={srvName}
                      onChange={(e) => setSrvName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={srvDesc}
                      onChange={(e) => setSrvDesc(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Vanity Invite Code
                      </label>
                      <input
                        type="text"
                        value={srvVanity}
                        onChange={(e) => setSrvVanity(e.target.value)}
                        placeholder="my-community"
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 font-mono text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Member Verification Level
                      </label>
                      <select
                        value={srvVerify}
                        onChange={(e) => setSrvVerify(e.target.value as Server['verificationLevel'])}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                      >
                        <option value="none">None (Open)</option>
                        <option value="email">Verified Email Required</option>
                        <option value="account_age">Account Age &gt; 5 Minutes</option>
                        <option value="phone">Verified Phone Required</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                  >
                    Save Changes
                  </button>
                </form>

                {/* Custom Server Emoji */}
                <div className="border-t border-slate-200 dark:border-white/8 pt-5 space-y-3">
                  <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                    Custom Server Emoji ({server.customEmojis.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {server.customEmojis.map((ce) => (
                      <span
                        key={ce.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-2.5 py-1 text-sm"
                      >
                        <span>{ce.symbol}</span>
                        <span className="font-mono text-xs text-slate-500">:{ce.name}:</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={emojiSymbol}
                      onChange={(e) => setEmojiSymbol(e.target.value)}
                      placeholder="Emoji"
                      className="w-16 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-1.5 text-center text-sm"
                    />
                    <input
                      type="text"
                      value={emojiName}
                      onChange={(e) => setEmojiName(e.target.value)}
                      placeholder="shortcode_name"
                      className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-1.5 font-mono text-sm text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!emojiName.trim() || !emojiSymbol.trim()) return;
                        runUpdate({ addCustomEmoji: { name: emojiName.trim(), symbol: emojiSymbol.trim() } }, 'Custom emoji added.');
                        setEmojiName('');
                      }}
                      className="rounded-lg bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-medium text-white dark:text-slate-950"
                    >
                      Add Emoji
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ROLES & PERMISSIONS */}
            {tab === 'roles' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="space-y-1">
                    {server.roles.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRoleId(r.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          selectedRole?.id === r.id
                            ? 'bg-slate-200 dark:bg-white/12 text-slate-950 dark:text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/6'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                          <span className="truncate">{r.name}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Create New Role</p>
                    <input
                      type="text"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="Role name (e.g. Reviewer)"
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center justify-between">
                      <input
                        type="color"
                        value={newRoleColor}
                        onChange={(e) => setNewRoleColor(e.target.value)}
                        aria-label="Role color"
                        className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newRoleName.trim()) return;
                          runUpdate(
                            {
                              newRole: {
                                name: newRoleName.trim(),
                                color: newRoleColor,
                                hoist: true,
                                mentionable: true,
                                permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CONNECT', 'SPEAK'],
                              },
                            },
                            `Created role "${newRoleName.trim()}".`
                          );
                          setNewRoleName('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Role</span>
                      </button>
                    </div>
                  </div>
                </div>

                {selectedRole && (
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: selectedRole.color }} />
                        <h3 className="font-display text-base font-bold text-slate-950 dark:text-white">
                          {selectedRole.name}
                        </h3>
                      </div>
                      {selectedRole.name !== '@everyone' && (
                        <button
                          type="button"
                          onClick={() => runUpdate({ deleteRoleId: selectedRole.id }, `Deleted role ${selectedRole.name}.`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete Role</span>
                        </button>
                      )}
                    </div>

                    {selectedRole.permissions.includes('ADMINISTRATOR') && (
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                          Administrator grants full access to every channel and overrides all permission restrictions. Grant sparingly.
                        </span>
                      </div>
                    )}

                    <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
                      {ALL_PERMISSIONS.map((perm) => {
                        const enabled = selectedRole.permissions.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className="flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                          >
                            <span className={perm.dangerous ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}>
                              {perm.label}
                            </span>
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => {
                                const nextPerms = enabled
                                  ? selectedRole.permissions.filter((p) => p !== perm.key)
                                  : [...selectedRole.permissions, perm.key];
                                runUpdate(
                                  { updateRole: { ...selectedRole, permissions: nextPerms } },
                                  `Updated ${selectedRole.name} permissions.`
                                );
                              }}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AUTOMOD */}
            {tab === 'automod' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-2.5">
                  {server.autoModRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4"
                    >
                      <div className="space-y-1">
                        <p className="font-display text-sm font-semibold text-slate-950 dark:text-white">{rule.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Action: {rule.action} · Triggered{' '}
                          <span className="font-mono tabular-nums">{rule.triggeredCount}</span> times
                          {rule.keywords.length > 0 && ` · Terms: ${rule.keywords.join(', ')}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => runUpdate({ toggleAutoModId: rule.id }, 'AutoMod rule updated.')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          rule.enabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!ruleName.trim() || !ruleKeywords.trim()) return;
                    runUpdate(
                      {
                        newAutoModRule: {
                          name: ruleName.trim(),
                          enabled: true,
                          triggerType: 'keywords',
                          keywords: ruleKeywords.split(',').map((k) => k.trim()).filter(Boolean),
                          action: ruleAction,
                        },
                      },
                      'New AutoMod rule activated.'
                    );
                    setRuleName('');
                    setRuleKeywords('');
                  }}
                  className="rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-3"
                >
                  <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">Add Keyword Filter Rule</h3>
                  <input
                    type="text"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="Rule name (e.g. Block spoiler leaks)"
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    value={ruleKeywords}
                    onChange={(e) => setRuleKeywords(e.target.value)}
                    placeholder="Comma-separated blocked words or links"
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <select
                      value={ruleAction}
                      onChange={(e) => setRuleAction(e.target.value as 'block' | 'alert' | 'timeout')}
                      className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="block">Block Message</option>
                      <option value="alert">Send Moderator Alert</option>
                      <option value="timeout">Block & Timeout 5m</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                    >
                      Create Rule
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* AUDIT LOG */}
            {tab === 'audit' && (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Actor</th>
                      <th className="px-4 py-2.5">Action</th>
                      <th className="px-4 py-2.5">Target</th>
                      <th className="px-4 py-2.5 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/[0.07]">
                    {server.auditLog.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          No moderation or admin events recorded yet.
                        </td>
                      </tr>
                    ) : (
                      server.auditLog.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                            {users[entry.actorId]?.displayName || 'System'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{entry.action}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                            {entry.target}
                            {entry.reason && ` · ${entry.reason}`}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400 tabular-nums">
                            {new Date(entry.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* SCHEDULED EVENTS */}
            {tab === 'events' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-3">
                  {server.events.length === 0 ? (
                    <p className="text-sm text-slate-500">No upcoming events scheduled yet.</p>
                  ) : (
                    server.events.map((evt) => {
                      const interested = evt.interestedUserIds.includes(currentUser.id);
                      return (
                        <div
                          key={evt.id}
                          className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21]"
                        >
                          {evt.coverUrl && (
                            <img
                              src={evt.coverUrl}
                              alt={evt.title}
                              referrerPolicy="no-referrer"
                              className="h-32 w-full object-cover"
                            />
                          )}
                          <div className="p-4 flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="font-mono text-xs text-[var(--accent)] tabular-nums">
                                {new Date(evt.startsAt).toLocaleString([], {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                · {evt.locationType === 'stage' ? 'Stage Channel' : evt.locationType === 'voice' ? 'Voice Channel' : 'External'}
                              </p>
                              <h4 className="font-display text-base font-bold text-slate-950 dark:text-white">
                                {evt.title}
                              </h4>
                              <p className="text-sm text-slate-600 dark:text-slate-300">{evt.description}</p>
                              <p className="text-xs text-slate-500 tabular-nums">
                                {evt.interestedUserIds.length} interested
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => runUpdate({ toggleEventRsvpId: evt.id }, interested ? 'RSVP removed.' : 'Marked interested.')}
                              className={`rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
                                interested
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]'
                              }`}
                            >
                              {interested ? 'Interested ✓' : 'RSVP'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!evtTitle.trim()) return;
                    runUpdate(
                      {
                        newEvent: {
                          title: evtTitle.trim(),
                          description: evtDesc.trim() || 'Community session.',
                          startsAt: new Date(evtDate).toISOString(),
                          locationType: evtType,
                        },
                      },
                      'Scheduled event published.'
                    );
                    setEvtTitle('');
                    setEvtDesc('');
                  }}
                  className="rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-3"
                >
                  <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">Schedule New Event</h3>
                  <input
                    type="text"
                    required
                    value={evtTitle}
                    onChange={(e) => setEvtTitle(e.target.value)}
                    placeholder="Event title"
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                  <textarea
                    rows={2}
                    value={evtDesc}
                    onChange={(e) => setEvtDesc(e.target.value)}
                    placeholder="What will happen during this session?"
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="datetime-local"
                      value={evtDate}
                      onChange={(e) => setEvtDate(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 font-mono text-xs text-slate-900 dark:text-white"
                    />
                    <select
                      value={evtType}
                      onChange={(e) => setEvtType(e.target.value as 'stage' | 'voice' | 'external')}
                      className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="stage">Stage Channel Event</option>
                      <option value="voice">Voice Channel Hangout</option>
                      <option value="external">External Location</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
                  >
                    Create Event
                  </button>
                </form>
              </div>
            )}

            {/* INVITES */}
            {tab === 'invites' && (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Share any invite code below so friends can join via the “+” menu.
                  </p>
                  <button
                    type="button"
                    onClick={() => runUpdate({ createInvite: { maxUses: 25, temporary: false } }, 'New invite code created.')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-[var(--accent-contrast)] whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Generate Invite</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
                  {server.invites.map((inv) => {
                    const msg = buildDefaultInviteMessage({
                      senderName: currentUser.displayName,
                      senderUsername: currentUser.username,
                      code: inv.code,
                      serverName: server.name,
                    });
                    const links = buildInviteShareLinks({
                      code: inv.code,
                      senderName: currentUser.displayName,
                      serverName: server.name,
                      message: msg,
                    });
                    return (
                      <div key={inv.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold text-slate-950 dark:text-white truncate">
                            {inv.code}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {inv.uses} uses {inv.maxUses > 0 ? `/ ${inv.maxUses} max` : '· Unlimited'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <a
                            href={links.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Send via WhatsApp"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>WhatsApp</span>
                          </a>
                          <a
                            href={links.gmailUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Send via Gmail"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span>Gmail</span>
                          </a>
                          <a
                            href={links.smsUrl}
                            title="Send via Messages (SMS)"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10"
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                            <span>Messages</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(inv.code).catch(() => {});
                              setCopiedCode(inv.code);
                              setTimeout(() => setCopiedCode(null), 1500);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                          >
                            {copiedCode === inv.code ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copiedCode === inv.code ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* INSIGHTS */}
            {tab === 'insights' && (
              <div className="space-y-6 max-w-3xl">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Members</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-950 dark:text-white tabular-nums">
                      {server.members.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Currently Online</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {onlineMembersCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Recorded Messages</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-950 dark:text-white tabular-nums">
                      {totalMessages}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">AutoMod Blocks</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-950 dark:text-white tabular-nums">
                      {server.autoModRules.reduce((s, r) => s + r.triggeredCount, 0)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                    Top Channels by Message Activity
                  </h3>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
                    {channelInsights.map(({ channel, count }) => (
                      <div key={channel.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          #{channel.name} <span className="text-xs text-slate-400">· {channel.type}</span>
                        </span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">{count} msgs</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* BOTS & WEBHOOKS */}
            {tab === 'apps' && (
              <div className="space-y-6 max-w-3xl">
                <div className="space-y-3">
                  <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                    Verified App Directory
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {botDirectory.map((bot) => {
                      const installed = server.installedBotIds.includes(bot.id);
                      return (
                        <div
                          key={bot.id}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                                {bot.name}
                              </h4>
                              <span className="text-xs text-slate-500">{bot.category}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {bot.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              runUpdate(
                                { toggleBotId: bot.id },
                                installed ? `Removed ${bot.name}.` : `Installed ${bot.name} to server.`
                              )
                            }
                            className={`w-full rounded-lg py-1.5 text-xs font-medium transition-colors ${
                              installed
                                ? 'border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-rose-500/10 hover:text-rose-500'
                                : 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]'
                            }`}
                          >
                            {installed ? 'Installed · Remove' : 'Add to Server'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-white/8 pt-5 space-y-3">
                  <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-950 dark:text-white">
                    <Webhook className="h-4 w-4 text-[var(--accent)]" />
                    <span>Channel Webhooks</span>
                  </h3>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
                    {server.webhooks.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">No webhooks configured yet.</p>
                    ) : (
                      server.webhooks.map((wh) => {
                        const ch = server.channels.find((c) => c.id === wh.channelId);
                        return (
                          <div key={wh.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{wh.name}</p>
                              <p className="text-slate-500">Posts to #{ch?.name || 'channel'}</p>
                            </div>
                            <span className="font-mono text-slate-400">ID: {wh.id}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={hookName}
                      onChange={(e) => setHookName(e.target.value)}
                      placeholder="Webhook name (e.g. GitHub Actions)"
                      className="flex-1 min-w-[180px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <select
                      value={hookChannelId}
                      onChange={(e) => setHookChannelId(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                    >
                      {server.channels
                        .filter((c) => c.type === 'text' || c.type === 'announcement')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!hookName.trim()) return;
                        runUpdate({ createWebhook: { name: hookName.trim(), channelId: hookChannelId } }, 'Webhook created.');
                        setHookName('');
                      }}
                      className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-contrast)]"
                    >
                      Create Webhook
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TICKET BOT & INVITE REWARDS */}
            {tab === 'tickets' && (
              <div className="space-y-6 max-w-2xl">
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                        Ticket Bot Welcome Message
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Automatically installed in every server for private member queries, support, and invite reward claims.
                      </p>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={ticketWelcome}
                    onChange={(e) => setTicketWelcome(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      runUpdate(
                        { updateTicketBot: { welcomeMessage: ticketWelcome } },
                        'Ticket Bot welcome message saved.'
                      )
                    }
                    className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-contrast)]"
                  >
                    Save Welcome Message
                  </button>
                </div>

                {/* Invite Rewards Toggle & Tiers */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/10 p-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-950 dark:text-white">
                        <Gift className="h-4 w-4 text-[var(--accent)]" />
                        <span>Server Invite Rewards</span>
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Allow members to open a personal ticket to collect free community rewards when they invite friends to {server.name}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        runUpdate(
                          {
                            updateTicketBot: {
                              inviteRewardsEnabled: !server.ticketBot?.inviteRewardsEnabled,
                            },
                          },
                          server.ticketBot?.inviteRewardsEnabled
                            ? 'Invite rewards disabled.'
                            : 'Invite rewards enabled.'
                        )
                      }
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        server.ticketBot?.inviteRewardsEnabled
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8'
                      }`}
                    >
                      {server.ticketBot?.inviteRewardsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {/* Existing Tiers */}
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
                    {(server.ticketBot?.inviteRewards || []).length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        No invite reward tiers configured yet. Add one below so members can collect rewards via Ticket Bot.
                      </p>
                    ) : (
                      (server.ticketBot?.inviteRewards || []).map((tier) => {
                        const linkedRole = tier.roleId
                          ? server.roles.find((r) => r.id === tier.roleId)
                          : undefined;
                        return (
                          <div key={tier.id} className="flex items-center justify-between gap-4 px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[var(--accent)]">
                                  {tier.requiredInvites} invites
                                </span>
                                <p className="font-display text-sm font-semibold text-slate-950 dark:text-white truncate">
                                  {tier.title}
                                </p>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {tier.description}
                                {linkedRole ? ` · Auto-grants @${linkedRole.name} role on approval` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                runUpdate(
                                  { deleteInviteRewardId: tier.id },
                                  `Removed reward "${tier.title}".`
                                )
                              }
                              aria-label={`Remove ${tier.title}`}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Reward Tier Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!rewardTitle.trim()) return;
                      runUpdate(
                        {
                          addInviteReward: {
                            title: rewardTitle.trim(),
                            description:
                              rewardDesc.trim() ||
                              `Invite ${rewardReqInvites} friends to ${server.name} to claim this reward.`,
                            requiredInvites: rewardReqInvites,
                            roleId: rewardRoleId || undefined,
                          },
                        },
                        `Added invite reward "${rewardTitle.trim()}".`
                      );
                      setRewardTitle('');
                      setRewardDesc('');
                      setRewardReqInvites(3);
                      setRewardRoleId('');
                    }}
                    className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3"
                  >
                    <p className="font-display text-xs font-bold text-slate-950 dark:text-white">
                      Add Invite Reward Tier
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={rewardTitle}
                        onChange={(e) => setRewardTitle(e.target.value)}
                        placeholder="Reward title (e.g. VIP Event Pass)"
                        className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={rewardReqInvites}
                        onChange={(e) => setRewardReqInvites(Math.max(1, Number(e.target.value) || 1))}
                        placeholder="Invites needed"
                        className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-3 py-2 font-mono text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <input
                      type="text"
                      value={rewardDesc}
                      onChange={(e) => setRewardDesc(e.target.value)}
                      placeholder="Short description of what the member receives"
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <select
                        value={rewardRoleId}
                        onChange={(e) => setRewardRoleId(e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="">No automatic role grant (manual reward)</option>
                        {server.roles
                          .filter((r) => r.name !== '@everyone')
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              Auto-grant role: @{r.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="submit"
                        disabled={!rewardTitle.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Reward Tier</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
