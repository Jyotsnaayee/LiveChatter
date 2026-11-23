import React, { useState } from 'react';
import {
  Archive,
  Ban,
  Bell,
  BellOff,
  Clock,
  ExternalLink,
  MessageSquare,
  Send,
  ShieldAlert,
  UserX,
  X,
} from 'lucide-react';
import type { Message, Server, Thread, User } from '../shared/types';
import { Avatar, PRESENCE_LABEL } from './Avatar';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MemberListAndThreadsProps {
  server: Server | null;
  users: Record<string, User>;
  currentUser: User;
  activeThread: Thread | null;
  threadMessages: Message[];
  selectedProfileUserId: string | null;
  allServers: Server[];
  onCloseThread: () => void;
  onSendThreadMessage: (threadId: string, content: string) => Promise<void>;
  onUpdateThread: (
    threadId: string,
    patch: { toggleFollow?: boolean; archived?: boolean; autoArchiveMinutes?: Thread['autoArchiveMinutes'] }
  ) => Promise<void>;
  onSelectProfileUser: (userId: string | null) => void;
  onStartDm: (userId: string) => Promise<void>;
  onModerateMember: (
    targetUserId: string,
    action: 'timeout' | 'kick' | 'ban' | 'toggle_role',
    opts?: { roleId?: string; durationMinutes?: number }
  ) => Promise<void>;
}

export function MemberListAndThreads({
  server,
  users,
  currentUser,
  activeThread,
  threadMessages,
  selectedProfileUserId,
  allServers,
  onCloseThread,
  onSendThreadMessage,
  onUpdateThread,
  onSelectProfileUser,
  onStartDm,
  onModerateMember,
}: MemberListAndThreadsProps) {
  const [threadDraft, setThreadDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Active Thread Side Panel takes priority over Member List
  if (activeThread) {
    const isFollowing = activeThread.followerIds.includes(currentUser.id);

    const handleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!threadDraft.trim() || sending) return;
      setSending(true);
      try {
        await onSendThreadMessage(activeThread.id, threadDraft.trim());
        setThreadDraft('');
      } finally {
        setSending(false);
      }
    };

    return (
      <aside className="flex h-full w-full sm:w-[360px] shrink-0 flex-col border-l border-slate-200 dark:border-white/[0.07] bg-[#F8F9FB] dark:bg-[#171A21]">
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-white/[0.07] px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white leading-snug">
              {activeThread.title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {activeThread.isPrivate ? 'Private Thread' : activeThread.isForumPost ? 'Forum Post' : 'Thread'} ·{' '}
              {activeThread.archived ? 'Archived' : 'Active'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseThread}
            aria-label="Close thread"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thread Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.07] px-4 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateThread(activeThread.id, { toggleFollow: true })}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                isFollowing
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'bg-slate-200/70 dark:bg-white/8 text-slate-700 dark:text-slate-300'
              }`}
            >
              {isFollowing ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              <span>{isFollowing ? 'Following' : 'Follow'}</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateThread(activeThread.id, { archived: !activeThread.archived })}
              className="inline-flex items-center gap-1 rounded-md bg-slate-200/70 dark:bg-white/8 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-white/12"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>{activeThread.archived ? 'Reopen' : 'Archive'}</span>
            </button>
          </div>

          <select
            aria-label="Auto-archive duration"
            value={activeThread.autoArchiveMinutes}
            onChange={(e) =>
              onUpdateThread(activeThread.id, {
                autoArchiveMinutes: Number(e.target.value) as Thread['autoArchiveMinutes'],
              })
            }
            className="rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300"
          >
            <option value={60}>Archive: 1h</option>
            <option value={1440}>Archive: 24h</option>
            <option value={4320}>Archive: 3d</option>
            <option value={10080}>Archive: 7d</option>
          </select>
        </div>

        {/* Thread Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {threadMessages.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Start the discussion inside this thread.
            </p>
          ) : (
            threadMessages.map((m) => {
              const u = users[m.authorId];
              return (
                <div key={m.id} className="flex items-start gap-2.5">
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {u?.displayName || 'Member'}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <MarkdownRenderer content={m.content} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Thread Composer */}
        <form onSubmit={handleSend} className="border-t border-slate-200 dark:border-white/[0.07] p-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[var(--accent)]">
            <input
              type="text"
              value={threadDraft}
              onChange={(e) => setThreadDraft(e.target.value)}
              placeholder={activeThread.archived ? 'Reply to reopen thread...' : 'Reply in thread...'}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !threadDraft.trim()}
              aria-label="Send thread reply"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </aside>
    );
  }

  if (!server) return null;

  // Group server members by hoisted role, plus Online and Offline
  const sortedHoistedRoles = [...server.roles]
    .filter((r) => r.hoist)
    .sort((a, b) => b.position - a.position);

  const onlineMembers = server.members.filter((m) => {
    const st = users[m.userId]?.status;
    return st && st !== 'offline' && st !== 'invisible';
  });
  const offlineMembers = server.members.filter((m) => {
    const st = users[m.userId]?.status;
    return !st || st === 'offline' || st === 'invisible';
  });

  const assignedOnlineIds = new Set<string>();
  const roleGroups = sortedHoistedRoles
    .map((role) => {
      const list = onlineMembers.filter((m) => {
        if (assignedOnlineIds.has(m.userId)) return false;
        if (m.roleIds.includes(role.id)) {
          assignedOnlineIds.add(m.userId);
          return true;
        }
        return false;
      });
      return { id: role.id, label: role.name, color: role.color, members: list };
    })
    .filter((g) => g.members.length > 0);

  const otherOnline = onlineMembers.filter((m) => !assignedOnlineIds.has(m.userId));
  if (otherOnline.length > 0) {
    roleGroups.push({ id: 'online-other', label: 'Online', color: '#94A3B8', members: otherOnline });
  }

  const profileUser = selectedProfileUserId ? users[selectedProfileUserId] : null;
  const profileMember = profileUser ? server.members.find((m) => m.userId === profileUser.id) : null;
  const mutualServers = profileUser
    ? allServers.filter((s) => s.members.some((m) => m.userId === profileUser.id))
    : [];

  const canModerate =
    server.ownerId === currentUser.id ||
    server.members
      .find((m) => m.userId === currentUser.id)
      ?.roleIds.some((rid) =>
        server.roles.find((r) => r.id === rid)?.permissions.some((p) => p === 'ADMINISTRATOR' || p === 'TIMEOUT_MEMBERS' || p === 'MANAGE_ROLES')
      );

  return (
    <aside className="relative flex h-full w-[248px] shrink-0 flex-col border-l border-slate-200 dark:border-white/[0.07] bg-[#F3F4F6] dark:bg-[#171A21] overflow-y-auto px-3 py-4 space-y-5">
      {roleGroups.map((group) => (
        <div key={group.id} className="space-y-1">
          <h3 className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {group.label} · <span className="font-mono tabular-nums">{group.members.length}</span>
          </h3>
          {group.members.map((member) => {
            const u = users[member.userId];
            if (!u) return null;
            return (
              <button
                key={member.userId}
                type="button"
                onClick={() => onSelectProfileUser(member.userId)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-200/70 dark:hover:bg-white/[0.06] transition-colors"
              >
                <Avatar user={u} size="sm" showPresence />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate text-sm font-medium"
                      style={{ color: group.color !== '#94A3B8' ? group.color : undefined }}
                    >
                      {member.nickname || u.displayName}
                    </span>
                    {u.isBot && <span className="text-[11px] font-medium text-[var(--accent)]">App</span>}
                  </div>
                  {(u.customStatus?.text || u.activity) && (
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {u.customStatus?.text || `${u.activity?.name}`}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {offlineMembers.length > 0 && (
        <div className="space-y-1">
          <h3 className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Offline · <span className="font-mono tabular-nums">{offlineMembers.length}</span>
          </h3>
          {offlineMembers.map((member) => {
            const u = users[member.userId];
            if (!u) return null;
            return (
              <button
                key={member.userId}
                type="button"
                onClick={() => onSelectProfileUser(member.userId)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left opacity-60 hover:opacity-100 hover:bg-slate-200/70 dark:hover:bg-white/[0.06] transition-all"
              >
                <Avatar user={u} size="sm" showPresence />
                <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                  {member.nickname || u.displayName}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Member Profile Card Modal/Popover */}
      {profileUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onSelectProfileUser(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] shadow-2xl"
          >
            <div className="relative h-20" style={{ backgroundColor: profileUser.bannerColor }}>
              <button
                type="button"
                onClick={() => onSelectProfileUser(null)}
                aria-label="Close profile card"
                className="absolute right-3 top-3 rounded-lg bg-black/30 p-1 text-white hover:bg-black/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-5">
              <div className="-mt-8 mb-3 flex items-end justify-between">
                <div className="rounded-full ring-4 ring-white dark:ring-[#1D2029]">
                  <Avatar user={profileUser} size="xl" showPresence />
                </div>
                {profileUser.id !== currentUser.id && !profileUser.isBot && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onStartDm(profileUser.id);
                      onSelectProfileUser(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Message</span>
                  </button>
                )}
              </div>

              <h4 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                {profileUser.displayName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                @{profileUser.username}
                {profileUser.pronouns && ` · ${profileUser.pronouns}`}
                {` · ${PRESENCE_LABEL[profileUser.status]}`}
              </p>

              {profileUser.bio && (
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{profileUser.bio}</p>
              )}

              {profileUser.activity && (
                <div className="mt-3 rounded-lg border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#171A21] p-2.5 text-xs">
                  <p className="font-semibold text-slate-900 dark:text-white">{profileUser.activity.name}</p>
                  <p className="text-slate-500 dark:text-slate-400">{profileUser.activity.details}</p>
                </div>
              )}

              {/* Roles */}
              {profileMember && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Server Roles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {server.roles
                      .filter((r) => r.name !== '@everyone')
                      .map((role) => {
                        const has = profileMember.roleIds.includes(role.id);
                        if (!has && !canModerate) return null;
                        return (
                          <button
                            key={role.id}
                            type="button"
                            disabled={!canModerate}
                            onClick={() => onModerateMember(profileUser.id, 'toggle_role', { roleId: role.id })}
                            className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                              has
                                ? 'border-slate-300 dark:border-white/15 bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                                : 'border-dashed border-slate-300 dark:border-white/15 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />
                            {role.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Connected Accounts & Mutuals */}
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 dark:border-white/8 pt-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{mutualServers.length} mutual {mutualServers.length === 1 ? 'server' : 'servers'}</span>
                {profileUser.connectedAccounts.map((acc) => (
                  <span key={acc.id} className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                    {acc.platform}: {acc.handle}
                  </span>
                ))}
              </div>

              {/* Moderation Controls */}
              {canModerate && profileUser.id !== currentUser.id && profileUser.id !== server.ownerId && (
                <div className="mt-4 border-t border-slate-200 dark:border-white/8 pt-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Moderation Actions</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await onModerateMember(profileUser.id, 'timeout', { durationMinutes: 10 });
                        onSelectProfileUser(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>Timeout 10m</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onModerateMember(profileUser.id, 'kick');
                        onSelectProfileUser(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
                    >
                      <UserX className="h-3.5 w-3.5" />
                      <span>Kick</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onModerateMember(profileUser.id, 'ban');
                        onSelectProfileUser(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Ban</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
