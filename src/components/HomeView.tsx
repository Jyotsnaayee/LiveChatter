import React, { useState } from 'react';
import { Check, Menu, MessageSquare, Share2, ShieldBan, Ticket, UserCheck, UserPlus, Users, X } from 'lucide-react';
import type { DirectMessageThread, FriendRelation, User } from '../shared/types';
import { Avatar, PRESENCE_LABEL } from './Avatar';

interface HomeViewProps {
  tab: 'friends' | 'requests';
  friends: FriendRelation[];
  dms: DirectMessageThread[];
  users: Record<string, User>;
  currentUser: User;
  onManageFriend: (action: 'add' | 'accept' | 'decline' | 'remove' | 'block', target: string) => Promise<void>;
  onOpenDmWithUser: (userId: string) => Promise<void>;
  onSelectDm: (dmId: string) => void;
  onOpenCreateGroupDm: () => void;
  onOpenInviteFriends: (tab?: 'send' | 'redeem') => void;
  onOpenMobileMenu: () => void;
}

export function HomeView({
  tab,
  friends,
  dms,
  users,
  currentUser,
  onManageFriend,
  onOpenDmWithUser,
  onSelectDm,
  onOpenCreateGroupDm,
  onOpenInviteFriends,
  onOpenMobileMenu,
}: HomeViewProps) {
  const [friendFilter, setFriendFilter] = useState<'online' | 'all' | 'pending' | 'blocked'>('online');
  const [addInput, setAddInput] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    setStatusFeedback(null);
    try {
      await onManageFriend('add', addInput.trim());
      setStatusFeedback({ kind: 'ok', text: `Friend request sent to @${addInput.trim()}.` });
      setAddInput('');
    } catch (err) {
      setStatusFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Unable to add friend.' });
    }
  };

  const messageRequests = dms.filter((d) => d.isRequest);

  const filteredFriends = friends.filter((f) => {
    const u = users[f.userId];
    if (!u) return false;
    if (friendFilter === 'online') {
      return f.status === 'accepted' && u.status !== 'offline' && u.status !== 'invisible';
    }
    if (friendFilter === 'all') return f.status === 'accepted';
    if (friendFilter === 'pending') return f.status === 'pending_incoming' || f.status === 'pending_outgoing';
    return f.status === 'blocked';
  });

  const activeNowUsers = Object.values(users).filter(
    (u) => u.id !== currentUser.id && !u.isBot && u.activity && u.status !== 'offline'
  );

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-white dark:bg-[#1D2029]">
      {/* Header */}
      <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-slate-200 dark:border-white/[0.07] px-5">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation"
            className="md:hidden rounded-lg p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-[15px] font-bold text-slate-950 dark:text-white whitespace-nowrap">
            {tab === 'requests' ? 'Message Requests' : 'Friends'}
          </h1>

          {tab === 'friends' && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {(
                [
                  ['online', 'Online'],
                  ['all', 'All'],
                  ['pending', 'Pending'],
                  ['blocked', 'Blocked'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFriendFilter(key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    friendFilter === key
                      ? 'bg-slate-200 dark:bg-white/12 text-slate-950 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenInviteFriends('send')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-[#232733] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <Share2 className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Invite Friends</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateGroupDm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Group DM</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main Column */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {tab === 'requests' ? (
            <div className="max-w-2xl space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Pending Message Requests
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Direct messages from non-friends who share a server with you appear here for review.
                </p>
              </div>
              {messageRequests.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No pending message requests.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                  {messageRequests.map((req) => {
                    const senderId = req.participantIds.find((id) => id !== currentUser.id);
                    const sender = senderId ? users[senderId] : undefined;
                    return (
                      <div key={req.id} className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar user={sender} size="md" showPresence />
                          <div className="min-w-0">
                            <p className="font-display text-sm font-semibold text-slate-950 dark:text-white truncate">
                              {sender?.displayName || 'Unknown User'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              @{sender?.username} · Shared server member
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectDm(req.id)}
                            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                          >
                            Review & Open
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl space-y-6">
              {/* Add Friend Form */}
              <form
                onSubmit={handleAddFriend}
                className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#232733]/60 p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-[var(--accent)]" />
                    <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                      Add Friend by Username
                    </h2>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenInviteFriends('send')}
                      className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span>Send via WhatsApp, Gmail or Messages</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInviteFriends('redeem')}
                      className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      <span>Redeem Code</span>
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    placeholder="Enter username (e.g., liamoconnor or soratanaka)"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] whitespace-nowrap"
                  >
                    Send Request
                  </button>
                </div>
                {statusFeedback && (
                  <p
                    className={`text-xs ${
                      statusFeedback.kind === 'ok'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {statusFeedback.text}
                  </p>
                )}
              </form>

              {/* Friends List */}
              <div className="space-y-2">
                {friends.filter((f) => f.status === 'accepted' && !users[f.userId]?.isBot).length === 0 && (
                  <div className="rounded-xl border border-teal-500/25 bg-teal-50/60 dark:bg-teal-950/25 px-4 py-3 text-xs text-teal-900 dark:text-teal-200 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      You haven’t added any friends yet — <strong>LiveChatter Help Bot</strong> is ready below if you need a hand getting started.
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenInviteFriends('send')}
                      className="font-semibold text-teal-700 dark:text-teal-300 underline underline-offset-2"
                    >
                      Invite friends via WhatsApp, Gmail or Messages
                    </button>
                  </div>
                )}
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {friendFilter === 'online'
                    ? 'Online Friends'
                    : friendFilter === 'all'
                    ? 'All Friends'
                    : friendFilter === 'pending'
                    ? 'Pending Requests'
                    : 'Blocked Users'}{' '}
                  · <span className="font-mono tabular-nums">{filteredFriends.length}</span>
                </h3>

                {filteredFriends.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No entries in this view.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                    {filteredFriends.map((rel) => {
                      const u = users[rel.userId];
                      if (!u) return null;
                      return (
                        <div key={rel.userId} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar user={u} size="md" showPresence />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="font-display text-sm font-semibold text-slate-950 dark:text-white truncate">
                                  {u.displayName}
                                </p>
                                {u.isBot && (
                                  <span className="shrink-0 rounded bg-teal-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-700 dark:text-teal-300">
                                    HELP BOT
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                @{u.username} ·{' '}
                                {rel.status === 'pending_incoming'
                                  ? 'Incoming friend request'
                                  : rel.status === 'pending_outgoing'
                                  ? 'Outgoing friend request'
                                  : u.customStatus?.text || PRESENCE_LABEL[u.status]}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {rel.status === 'accepted' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onOpenDmWithUser(u.id)}
                                  title="Send Direct Message"
                                  aria-label={`Message ${u.displayName}`}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/8 text-slate-700 dark:text-slate-200 hover:bg-[var(--accent)] hover:text-white transition-colors"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </button>
                                {!u.isBot && (
                                  <button
                                    type="button"
                                    onClick={() => onManageFriend('block', u.id)}
                                    title="Block user"
                                    aria-label={`Block ${u.displayName}`}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/8 text-slate-500 hover:bg-rose-500/15 hover:text-rose-500 transition-colors"
                                  >
                                    <ShieldBan className="h-4 w-4" />
                                  </button>
                                )}
                              </>
                            )}
                            {rel.status === 'pending_incoming' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onManageFriend('accept', u.id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Accept</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onManageFriend('decline', u.id)}
                                  className="rounded-lg border border-slate-200 dark:border-white/10 p-1.5 text-slate-500 hover:text-rose-500"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {rel.status === 'pending_outgoing' && (
                              <button
                                type="button"
                                onClick={() => onManageFriend('decline', u.id)}
                                className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-rose-500"
                              >
                                Cancel
                              </button>
                            )}
                            {rel.status === 'blocked' && (
                              <button
                                type="button"
                                onClick={() => onManageFriend('remove', u.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                <span>Unblock</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Active Now Panel */}
        <aside className="hidden xl:flex w-[300px] shrink-0 flex-col border-l border-slate-200 dark:border-white/[0.07] bg-[#F8F9FB] dark:bg-[#171A21] p-5 space-y-4 overflow-y-auto">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">Active Now</h3>
          {activeNowUsers.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              When friends start gaming, coding, or listening to music, their rich presence appears here.
            </p>
          ) : (
            <div className="space-y-3">
              {activeNowUsers.map((u) => (
                <div
                  key={u.id}
                  className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1D2029] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar user={u} size="sm" showPresence />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{u.displayName}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.activity?.name}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{u.activity?.details}</p>
                  {u.activity?.joinable && (
                    <button
                      type="button"
                      onClick={() => onOpenDmWithUser(u.id)}
                      className="w-full rounded-lg bg-[var(--accent-soft)] py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition-colors"
                    >
                      Ask to Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
