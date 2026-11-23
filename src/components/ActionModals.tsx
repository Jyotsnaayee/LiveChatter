import React, { useMemo, useState } from 'react';
import { Hash, Megaphone, MessagesSquare, Radio, Search, Users, Volume2, X } from 'lucide-react';
import type { ChannelType, DirectMessageThread, Server, User } from '../shared/types';
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
  }) => Promise<void>;
  onJoinInvite: (code: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<'blank' | 'opensource' | 'study' | 'gaming' | 'creators' | 'friends'>('opensource');
  const [iconColor, setIconColor] = useState('#2563EB');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const templates: { id: typeof template; title: string; desc: string }[] = [
    { id: 'opensource', title: 'Open Source', desc: 'Announcements, RFC forum, Dev Sync voice & Town Hall stage' },
    { id: 'study', title: 'Study Group', desc: 'Check-ins, Paper Notes forum & Silent Pomodoro room' },
    { id: 'gaming', title: 'Gaming Squad', desc: 'Match finder, clips & low-latency squad comms' },
    { id: 'creators', title: 'Creators Club', desc: 'Drops, Showcase forum & Live Studio stage' },
    { id: 'friends', title: 'Friends Hangout', desc: 'Casual chat & drop-in couch voice' },
    { id: 'blank', title: 'Start Blank', desc: 'Clean slate with #general and Lounge' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') {
        if (!name.trim()) throw new Error('Enter a server name.');
        await onCreateServer({ name: name.trim(), template, iconColor });
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
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
            {mode === 'create' ? 'Create a Server' : 'Join via Invite'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1.5 rounded-lg bg-slate-100 dark:bg-[#14171F] p-1">
          <button
            type="button"
            onClick={() => setMode('create')}
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
            onClick={() => setMode('join')}
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
          {mode === 'create' ? (
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
                  aria-label="Server icon color"
                  className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
              </div>
            </>
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
                placeholder="Try: kernel-craft, atlas-study, or vanguard"
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 font-mono text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
              {busy ? 'Working...' : mode === 'create' ? 'Create Server' : 'Join Server'}
            </button>
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
