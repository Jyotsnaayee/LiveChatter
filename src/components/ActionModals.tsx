import React, { useMemo, useRef, useState } from 'react';
import { Award, Camera, Check, Hash, ImagePlus, Megaphone, MessagesSquare, Pin, Plus, Radio, Search, Terminal, Trash2, Users, Volume2, X } from 'lucide-react';
import type { ChannelType, DirectMessageThread, Server, User } from '../shared/types';
import { processImageUpload } from '../lib/imageUpload';
import { Avatar } from './Avatar';

// --- Quick Switcher (Ctrl/Cmd + K) ---
export function QuickSwitcherModal({
  servers,
  dms,
  users,
  currentUserId,
  onSelectChannel,
  onSelectDm,
  onClose,
}: {
  servers: Server[];
  dms: DirectMessageThread[];
  users: Record<string, User>;
  currentUserId: string;
  onSelectChannel: (serverId: string, channelId: string) => void;
  onSelectDm: (dmId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{
      id: string;
      label: string;
      sub: string;
      kind: 'channel' | 'dm';
      serverId?: string;
      channelId?: string;
      dmId?: string;
    }> = [];

    for (const srv of servers) {
      for (const ch of srv.channels) {
        if (!q || ch.name.toLowerCase().includes(q) || srv.name.toLowerCase().includes(q)) {
          list.push({
            id: ch.id,
            label: `#${ch.name}`,
            sub: `${srv.name} · ${ch.type}`,
            kind: 'channel',
            serverId: srv.id,
            channelId: ch.id,
          });
        }
      }
    }

    for (const dm of dms) {
      const others = dm.participantIds.filter((id) => id !== currentUserId).map((id) => users[id]?.displayName).filter(Boolean);
      const label = dm.isGroup ? dm.name || others.join(', ') : others[0] || 'Direct Message';
      if (!q || label.toLowerCase().includes(q)) {
        list.push({
          id: dm.id,
          label,
          sub: dm.isGroup ? `Group DM · ${dm.participantIds.length} members` : 'Direct Message',
          kind: 'dm',
          dmId: dm.id,
        });
      }
    }
    return list.slice(0, 12);
  }, [query, servers, dms, users, currentUserId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-white/10 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a server, channel, or DM..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No matching channels or conversations.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.kind === 'channel' && item.serverId && item.channelId) {
                    onSelectChannel(item.serverId, item.channelId);
                  } else if (item.dmId) {
                    onSelectDm(item.dmId);
                  }
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <span className="font-medium text-sm text-slate-900 dark:text-white">{item.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{item.sub}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// --- Create or Join Server Modal ---
const OPTIONAL_BOT_COMMANDS: { cmd: string; label: string }[] = [
  { cmd: '/ticket', label: 'Personal support & reward tickets' },
  { cmd: '/poll', label: 'Interactive community polls' },
  { cmd: '/roll', label: 'Polyhedral dice roller' },
  { cmd: '/coinflip', label: 'Fair coin flip' },
  { cmd: '/remind', label: 'Formatted reminder cards' },
  { cmd: '/serverinfo', label: 'Server summary stats' },
  { cmd: '/help', label: 'List available commands' },
];

interface DraftServerRank {
  id: string;
  name: string;
  badge: string;
  color: string;
  price: number;
}

export function CreateServerModal({
  onCreateServer,
  onJoinInvite,
  onClose,
}: {
  onCreateServer: (payload: {
    name: string;
    template: 'blank' | 'opensource' | 'study' | 'gaming' | 'creators' | 'friends';
    description?: string;
    iconColor?: string;
    iconUrl: string;
    botCmdSetup: { channelName: string; enabledCommands: string[] };
    ranks: Array<{ name: string; color: string; price: number; badge?: string }>;
  }) => Promise<void>;
  onJoinInvite: (code: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<'blank' | 'opensource' | 'study' | 'gaming' | 'creators' | 'friends'>('opensource');
  const [iconColor, setIconColor] = useState('#2563EB');
  const [iconUrl, setIconUrl] = useState('');
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement | null>(null);
  const [botCmdChannelName, setBotCmdChannelName] = useState('bot-cmd');
  const [enabledOptionalCmds, setEnabledOptionalCmds] = useState<string[]>(
    OPTIONAL_BOT_COMMANDS.map((c) => c.cmd)
  );
  const [ranks, setRanks] = useState<DraftServerRank[]>([
    { id: 'r1', name: 'Bronze Member', badge: '🥉', color: '#CD7F32', price: 20 },
    { id: 'r2', name: 'Silver Star', badge: '🥈', color: '#94A3B8', price: 50 },
    { id: 'r3', name: 'Gold Legend', badge: '🥇', color: '#F59E0B', price: 120 },
  ]);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleServerIconSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploadingIcon(true);
    try {
      const processed = await processImageUpload(file, 256);
      setIconUrl(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process server icon image.');
    } finally {
      setUploadingIcon(false);
    }
  };

  const sanitizedBotCmdName =
    botCmdChannelName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'bot-cmd';

  const templates: { id: typeof template; title: string; desc: string }[] = [
    { id: 'opensource', title: 'Open Source', desc: 'Announcements, RFC forum, Dev Sync voice & Town Hall stage' },
    { id: 'study', title: 'Study Group', desc: 'Check-ins, Paper Notes forum & Silent Pomodoro room' },
    { id: 'gaming', title: 'Gaming Squad', desc: 'Match finder, clips & low-latency squad comms' },
    { id: 'creators', title: 'Creators Club', desc: 'Drops, Showcase forum & Live Studio stage' },
    { id: 'friends', title: 'Friends Hangout', desc: 'Casual chat & drop-in couch voice' },
    { id: 'blank', title: 'Start Blank', desc: 'Clean slate with #general and Lounge' },
  ];

  const toggleOptionalCmd = (cmd: string) => {
    setEnabledOptionalCmds((prev) =>
      prev.includes(cmd) ? prev.filter((c) => c !== cmd) : [...prev, cmd]
    );
  };

  const addRankRow = () => {
    setRanks((prev) => [
      ...prev,
      {
        id: `r-${Date.now()}-${prev.length}`,
        name: '',
        badge: '⭐',
        color: '#2563EB',
        price: 40,
      },
    ]);
  };

  const updateRankRow = (id: string, patch: Partial<DraftServerRank>) => {
    setRanks((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRankRow = (id: string) => {
    setRanks((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'create' && step === 1) {
      if (!iconUrl) {
        setError('Upload a server icon image before continuing.');
        return;
      }
      if (!name.trim()) {
        setError('Enter a server name to continue to Bot Command Setup.');
        return;
      }
      setStep(2);
      return;
    }

    if (mode === 'create' && step === 2) {
      if (!botCmdChannelName.trim()) {
        setError('Configure a Bot Command channel name before continuing.');
        return;
      }
      setStep(3);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'create') {
        if (!iconUrl) throw new Error('Upload a server icon image before creating your server.');
        if (!name.trim()) throw new Error('Enter a server name.');
        if (!botCmdChannelName.trim()) {
          throw new Error('Configure a Bot Command channel name before creating your server.');
        }
        const cleanedRanks = ranks
          .map((r) => ({
            name: r.name.trim(),
            badge: r.badge.trim() || '⭐',
            color: r.color || '#2563EB',
            price: Math.max(1, Math.round(Number(r.price) || 20)),
          }))
          .filter((r) => r.name.length > 0);
        if (cleanedRanks.length === 0) {
          throw new Error('Add at least 1 cosmetic server rank (no permissions) before creating your server.');
        }
        await onCreateServer({
          name: name.trim(),
          template,
          iconColor,
          iconUrl,
          botCmdSetup: {
            channelName: sanitizedBotCmdName,
            enabledCommands: ['-i', '/invite link', ...enabledOptionalCmds],
          },
          ranks: cleanedRanks,
        });
      } else {
        if (!inviteCode.trim()) throw new Error('Enter an invite code.');
        await onJoinInvite(inviteCode.trim());
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              {mode === 'join'
                ? 'Join via Invite'
                : step === 1
                ? 'Create a Server'
                : step === 2
                ? 'Bot Command Setup (Required)'
                : 'Server Ranks Setup (Required)'}
            </h2>
            {mode === 'create' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Step {step} of 3 ·{' '}
                {step === 1
                  ? 'Choose template & identity'
                  : step === 2
                  ? 'Configure your dedicated bot command tab'
                  : 'Add cosmetic Feature Ball ranks (zero permissions)'}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1.5 rounded-lg bg-slate-100 dark:bg-[#14171F] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('create');
              setError(null);
            }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === 'create'
                ? 'bg-white dark:bg-[#232733] text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Create from Template
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('join');
              setError(null);
            }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === 'join'
                ? 'bg-white dark:bg-[#232733] text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Join with Invite Code
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      template === t.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className="font-display text-xs font-bold text-slate-950 dark:text-white">{t.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{t.desc}</p>
                  </button>
                ))}
              </div>

              {/* Required Server Icon Upload */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Server Icon Image
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      iconUrl
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                    }`}
                  >
                    {iconUrl ? 'Icon Ready' : 'Required'}
                  </span>
                </div>
                <div className="flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => iconFileInputRef.current?.click()}
                    disabled={uploadingIcon}
                    aria-label="Upload server icon image"
                    className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
                      iconUrl
                        ? 'border-emerald-500/60 bg-slate-900'
                        : 'border-slate-300 dark:border-white/20 bg-white dark:bg-[#1D2029] hover:border-[var(--accent)]'
                    }`}
                  >
                    {iconUrl ? (
                      <img src={iconUrl} alt="Server icon preview" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-6 w-6 text-slate-400" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {iconUrl
                        ? 'Your server icon is ready. You can swap it anytime.'
                        : 'You must upload a server icon image (PNG, JPG, WebP, or GIF) before creating a server.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={uploadingIcon}
                        onClick={() => iconFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>{uploadingIcon ? 'Processing...' : iconUrl ? 'Change Icon Image' : 'Upload Server Icon'}</span>
                      </button>
                      {iconUrl && (
                        <button
                          type="button"
                          onClick={() => setIconUrl('')}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    ref={iconFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleServerIconSelect}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Server name (e.g. Weekend Builders)"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
                <input
                  type="color"
                  value={iconColor}
                  onChange={(e) => setIconColor(e.target.value)}
                  aria-label="Server accent color"
                  title="Server accent color"
                  className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
              </div>
            </>
          ) : mode === 'create' && step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Terminal className="h-4 w-4 text-[var(--accent)]" />
                  <span>Bot Command Tab Name</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-400">#</span>
                  <input
                    type="text"
                    required
                    value={botCmdChannelName}
                    onChange={(e) => setBotCmdChannelName(e.target.value)}
                    placeholder="bot-cmd"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] px-3 py-1.5 font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Created as <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">#{sanitizedBotCmdName}</span>. Bot commands can only be entered inside this tab.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Core Invite Commands (Always Enabled)
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs">
                    <div>
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">-i</span>
                      <span className="ml-2 text-slate-600 dark:text-slate-300">Check personal verified invite count</span>
                    </div>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs">
                    <div>
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">/invite link</span>
                      <span className="ml-2 text-slate-600 dark:text-slate-300">Custom invite link with expiry &amp; Never option</span>
                    </div>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Additional Bot Commands
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {OPTIONAL_BOT_COMMANDS.map((item) => {
                    const active = enabledOptionalCmds.includes(item.cmd);
                    return (
                      <button
                        key={item.cmd}
                        type="button"
                        onClick={() => toggleOptionalCmd(item.cmd)}
                        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <span className="font-mono font-semibold">{item.cmd}</span>
                        {active && <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-3 text-[11px] text-slate-600 dark:text-slate-300">
                <Pin className="h-3.5 w-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                <span>
                  Your server’s <strong>default server link</strong> will be pinned at the top of{' '}
                  <span className="font-mono">#{sanitizedBotCmdName}</span>. Joins through the default link will{' '}
                  <strong>not</strong> increase invite counts — only joins through a member’s own custom{' '}
                  <span className="font-mono">/invite link</span> count (+1).
                </span>
              </div>
            </div>
          ) : mode === 'create' && step === 3 ? (
            <div className="space-y-3.5">
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                <Award className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Add at least 1 rank members can buy with <strong>Feature Balls</strong>. Server ranks are strictly{' '}
                  <strong>cosmetic badges</strong> and grant <strong>no permissions</strong>.
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {ranks.map((r, idx) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-12 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-2"
                  >
                    <input
                      type="text"
                      maxLength={4}
                      value={r.badge}
                      onChange={(e) => updateRankRow(r.id, { badge: e.target.value })}
                      aria-label={`Rank ${idx + 1} badge`}
                      className="col-span-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] px-1.5 py-1.5 text-center text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={r.name}
                      onChange={(e) => updateRankRow(r.id, { name: e.target.value })}
                      placeholder="Rank name"
                      className="col-span-5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      required
                      value={r.price}
                      onChange={(e) => updateRankRow(r.id, { price: Number(e.target.value) })}
                      title="Cost in Feature Balls"
                      className="col-span-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="color"
                      value={r.color}
                      onChange={(e) => updateRankRow(r.id, { color: e.target.value })}
                      aria-label={`Rank ${idx + 1} color`}
                      className="col-span-1 h-7 w-full cursor-pointer border-0 bg-transparent"
                    />
                    <button
                      type="button"
                      disabled={ranks.length <= 1}
                      onClick={() => removeRankRow(r.id)}
                      aria-label="Remove rank"
                      className="col-span-1 flex items-center justify-center rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRankRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Another Cosmetic Rank</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Invite Code or Link
              </label>
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Try: kernel-craft, atlas-study, or a custom /invite link"
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 font-mono text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {mode === 'create' && step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setStep((s) => (s === 3 ? 2 : 1));
                  setError(null);
                }}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8"
              >
                Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {busy
                  ? 'Working...'
                  : mode === 'join'
                  ? 'Join Server'
                  : step === 1
                  ? 'Next: Bot Command Setup'
                  : step === 2
                  ? 'Next: Server Ranks Setup'
                  : 'Finish & Create Server'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Create Channel Modal ---
export function CreateChannelModal({
  server,
  defaultCategoryId,
  onCreateChannel,
  onClose,
}: {
  server: Server;
  defaultCategoryId?: string;
  onCreateChannel: (payload: {
    name: string;
    type: ChannelType;
    categoryId?: string;
    topic?: string;
    isPrivate?: boolean;
    slowmodeSeconds?: number;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const [categoryId, setCategoryId] = useState(defaultCategoryId || server.categories[0]?.id || '');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [slowmodeSeconds, setSlowmodeSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const types: { id: ChannelType; label: string; desc: string; icon: React.ReactNode }[] = [
    { id: 'text', label: 'Text', desc: 'Persistent chat, threads, polls & files', icon: <Hash className="h-4 w-4" /> },
    { id: 'voice', label: 'Voice', desc: 'Audio, video, screen share & whiteboard', icon: <Volume2 className="h-4 w-4" /> },
    { id: 'stage', label: 'Stage', desc: 'Moderated speaker events with raise-hand', icon: <Radio className="h-4 w-4" /> },
    { id: 'forum', label: 'Forum', desc: 'Organized threaded posts with tags', icon: <MessagesSquare className="h-4 w-4" /> },
    { id: 'announcement', label: 'Announcement', desc: 'Official updates other servers can follow', icon: <Megaphone className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">Create Channel</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setError(null);
            try {
              await onCreateChannel({ name: name.trim(), type, categoryId, topic, isPrivate, slowmodeSeconds });
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unable to create channel.');
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                  type === t.id
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-slate-600 dark:text-slate-300">{t.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-950 dark:text-white">{t.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'voice' || type === 'stage' ? 'Channel name (e.g. Design Critique)' : 'channel-name'}
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
          />

          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Optional channel topic"
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            >
              {server.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={slowmodeSeconds}
              onChange={(e) => setSlowmodeSeconds(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value={0}>Slowmode: Off</option>
              <option value={5}>Slowmode: 5s</option>
              <option value={15}>Slowmode: 15s</option>
              <option value={60}>Slowmode: 1m</option>
            </select>
          </div>

          <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <span>Private Channel (restricted to selected roles)</span>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-slate-500">
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
            >
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Create Group DM Modal ---
export function CreateGroupDmModal({
  users,
  currentUserId,
  onCreateDm,
  onClose,
}: {
  users: Record<string, User>;
  currentUserId: string;
  onCreateDm: (participantIds: string[], name?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  const selectable = Object.values(users).filter((u) => u.id !== currentUserId && !u.isBot);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 9 ? [...prev, id] : prev));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-950 dark:text-white">
            <Users className="h-5 w-5 text-[var(--accent)]" />
            <span>Start DM or Group DM</span>
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select 1 person for a direct message or up to 9 people for a Group DM.
        </p>

        {selectedIds.length > 1 && (
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Optional group name (e.g. Sprint Crew)"
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        )}

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/10">
          {selectable.map((u) => {
            const chosen = selectedIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors ${
                  chosen ? 'bg-[var(--accent-soft)]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar user={u} size="sm" showPresence />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{u.displayName}</p>
                    <p className="text-xs text-slate-500">@{u.username}</p>
                  </div>
                </div>
                <input type="checkbox" readOnly checked={chosen} className="h-4 w-4 accent-[var(--accent)]" />
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-slate-500">
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={async () => {
              await onCreateDm(selectedIds, groupName.trim() || undefined);
              onClose();
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-40"
          >
            {selectedIds.length > 1 ? `Create Group (${selectedIds.length + 1})` : 'Open Direct Message'}
          </button>
        </div>
      </div>
    </div>
  );
}
