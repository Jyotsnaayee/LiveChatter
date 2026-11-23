import React, { useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Gift,
  HelpCircle,
  Lock,
  Menu,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Settings,
  Ticket,
  XCircle,
} from 'lucide-react';
import type {
  Message,
  Server,
  SupportTicket,
  TicketCategory,
  TicketStatus,
  User,
} from '../shared/types';
import { Avatar } from './Avatar';
import { MarkdownRenderer } from './MarkdownRenderer';

interface TicketDeskViewProps {
  server: Server;
  currentUser: User;
  users: Record<string, User>;
  tickets: SupportTicket[];
  messages: Record<string, Message[]>;
  onCreateTicket: (payload: {
    category: TicketCategory;
    subject: string;
    details: string;
    rewardTierId?: string;
  }) => Promise<SupportTicket>;
  onSendTicketMessage: (ticketId: string, content: string) => Promise<void>;
  onUpdateTicket: (ticketId: string, patch: { status?: TicketStatus; approveReward?: boolean }) => Promise<void>;
  onOpenConfigureRewards: () => void;
  onOpenInviteFriends: () => void;
  onOpenMobileMenu: () => void;
}

const CATEGORY_META: Record<
  TicketCategory,
  { label: string; shortLabel: string; description: string; icon: React.ReactNode }
> = {
  query: {
    label: 'General Query',
    shortLabel: 'Query',
    description: 'Ask questions about server rules, channels, roles, or events.',
    icon: <MessageSquare className="h-4 w-4" />,
  },
  help: {
    label: 'Help & Support',
    shortLabel: 'Help',
    description: 'Get private help from server moderators or report an issue.',
    icon: <HelpCircle className="h-4 w-4" />,
  },
  invite_reward: {
    label: 'Collect Invite Reward',
    shortLabel: 'Invite Reward',
    description: 'Claim a server reward set by the owner once you reach the invite goal.',
    icon: <Gift className="h-4 w-4" />,
  },
};

export function TicketDeskView({
  server,
  currentUser,
  users,
  tickets,
  messages,
  onCreateTicket,
  onSendTicketMessage,
  onUpdateTicket,
  onOpenConfigureRewards,
  onOpenInviteFriends,
  onOpenMobileMenu,
}: TicketDeskViewProps) {
  const serverTickets = useMemo(
    () => tickets.filter((t) => t.serverId === server.id),
    [tickets, server.id]
  );

  const isStaff = useMemo(() => {
    if (server.ownerId === currentUser.id) return true;
    const member = server.members.find((m) => m.userId === currentUser.id);
    if (!member) return false;
    return server.roles.some(
      (r) =>
        member.roleIds.includes(r.id) &&
        (r.permissions.includes('ADMINISTRATOR') ||
          r.permissions.includes('MANAGE_SERVER') ||
          r.permissions.includes('MANAGE_MESSAGES'))
    );
  }, [server, currentUser.id]);

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [creatingMode, setCreatingMode] = useState<boolean>(serverTickets.length === 0);

  // New ticket form state
  const [category, setCategory] = useState<TicketCategory>('help');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [selectedRewardId, setSelectedRewardId] = useState<string>(
    server.ticketBot?.inviteRewards[0]?.id || ''
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ticket reply composer
  const [replyInput, setReplyInput] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const visibleTickets = useMemo(() => {
    if (scope === 'all' && isStaff) return serverTickets;
    return serverTickets.filter((t) => t.creatorId === currentUser.id);
  }, [serverTickets, scope, isStaff, currentUser.id]);

  const activeTicket = useMemo(
    () => (selectedTicketId ? serverTickets.find((t) => t.id === selectedTicketId) || null : null),
    [serverTickets, selectedTicketId]
  );

  const ticketMessages = activeTicket ? messages[activeTicket.id] || [] : [];
  const rewardsEnabled = Boolean(
    server.ticketBot?.inviteRewardsEnabled && (server.ticketBot?.inviteRewards?.length || 0) > 0
  );
  const rewardTiers = server.ticketBot?.inviteRewards || [];
  const myInviteCount = server.memberInviteCounts?.[currentUser.id] || 0;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const chosenReward =
      category === 'invite_reward'
        ? rewardTiers.find((r) => r.id === selectedRewardId) || rewardTiers[0]
        : undefined;
    const finalSubject =
      subject.trim() ||
      (category === 'invite_reward' && chosenReward
        ? `Claim Invite Reward: ${chosenReward.title}`
        : '');
    if (!finalSubject) {
      setFormError('Please enter a brief subject for your personal ticket.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await onCreateTicket({
        category,
        subject: finalSubject,
        details: details.trim(),
        rewardTierId: chosenReward?.id,
      });
      setSubject('');
      setDetails('');
      setCreatingMode(false);
      setSelectedTicketId(created.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyInput.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await onSendTicketMessage(activeTicket.id, replyInput.trim());
      setReplyInput('');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-white dark:bg-[#1D2029]">
      {/* Header */}
      <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.07] px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation"
            className="md:hidden rounded-lg p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
            <Ticket className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[15px] font-bold text-slate-950 dark:text-white truncate">
                Ticket Bot
              </h1>
              <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                BOT
              </span>
            </div>
          </div>
          <span className="hidden lg:inline text-xs text-slate-500 dark:text-slate-400 truncate">
            · Private personal tickets for queries, help & invite rewards
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300">
            <Gift className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="font-mono tabular-nums font-semibold">{myInviteCount}</span>
            <span>server invites</span>
          </span>
          {isStaff && (
            <button
              type="button"
              onClick={onOpenConfigureRewards}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/12 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 whitespace-nowrap"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Configure Rewards</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCreatingMode(true);
              setSelectedTicketId(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Personal Ticket</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">
        {/* Left Ticket List */}
        <aside className="flex w-full lg:w-[290px] shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/[0.07] bg-[#F8F9FB] dark:bg-[#171A21] max-h-56 lg:max-h-none">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.06] px-3.5 py-2.5">
            {isStaff ? (
              <div className="flex rounded-lg bg-slate-200/70 dark:bg-white/[0.06] p-0.5 w-full">
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                    scope === 'mine'
                      ? 'bg-white dark:bg-[#232733] text-slate-950 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  My Tickets
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                    scope === 'all'
                      ? 'bg-white dark:bg-[#232733] text-slate-950 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All Staff ({serverTickets.length})
                </button>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Your Personal Tickets · <span className="font-mono tabular-nums">{visibleTickets.length}</span>
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {visibleTickets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 p-5 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No personal tickets yet in {server.name}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingMode(true);
                    setSelectedTicketId(null);
                  }}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Generate your first ticket
                </button>
              </div>
            ) : (
              visibleTickets.map((tkt) => {
                const active = !creatingMode && activeTicket?.id === tkt.id;
                const creator = users[tkt.creatorId];
                const statusColor =
                  tkt.status === 'open'
                    ? 'bg-emerald-500'
                    : tkt.status === 'resolved'
                    ? 'bg-sky-500'
                    : 'bg-slate-400';
                return (
                  <button
                    key={tkt.id}
                    type="button"
                    onClick={() => {
                      setCreatingMode(false);
                      setSelectedTicketId(tkt.id);
                    }}
                    className={`w-full rounded-xl p-3 text-left transition-colors border ${
                      active
                        ? 'border-[var(--accent)] bg-white dark:bg-[#232733]'
                        : 'border-transparent hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        #TKT-{tkt.ticketNumber}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize">
                        <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                        {tkt.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {tkt.subject}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="truncate">
                        {CATEGORY_META[tkt.category].shortLabel}
                        {scope === 'all' && creator ? ` · ${creator.displayName}` : ''}
                      </span>
                      {tkt.rewardFulfilled && (
                        <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
                          Reward Granted
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Workspace: Create Ticket Form OR Active Personal Ticket Chat */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          {creatingMode || !activeTicket ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-2xl space-y-6">
                {/* Ticket Bot Intro Banner */}
                <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#171A21] p-5 flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                      Generate a Personal Ticket in {server.name}
                    </h2>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {server.ticketBot?.welcomeMessage ||
                        'Open a private personal ticket for any query, help request, or to collect invite rewards set by the server owner.'}
                    </p>
                    <p className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                      <Lock className="h-3 w-3" />
                      <span>Private: Only visible to you, Ticket Bot, and server staff.</span>
                    </p>
                  </div>
                </div>

                {/* Category Selector */}
                <form onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      What do you need help with?
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(['query', 'help', 'invite_reward'] as TicketCategory[]).map((cat) => {
                        const meta = CATEGORY_META[cat];
                        const selected = category === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setCategory(cat);
                              setFormError(null);
                              if (cat === 'invite_reward' && rewardTiers[0] && !selectedRewardId) {
                                setSelectedRewardId(rewardTiers[0].id);
                              }
                            }}
                            className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors ${
                              selected
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] hover:border-slate-300 dark:hover:border-white/20'
                            }`}
                          >
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                selected
                                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                                  : 'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {meta.icon}
                            </span>
                            <div>
                              <p className="font-display text-xs font-bold text-slate-950 dark:text-white">
                                {meta.label}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                                {meta.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Invite Rewards Selector (when category === 'invite_reward') */}
                  {category === 'invite_reward' && (
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-display text-xs font-bold text-slate-950 dark:text-white">
                            Server Invite Rewards
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Your verified invites to {server.name}:{' '}
                            <strong className="font-mono text-slate-900 dark:text-white">{myInviteCount}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={onOpenInviteFriends}
                          className="text-xs font-medium text-[var(--accent)] hover:underline"
                        >
                          Invite more friends →
                        </button>
                      </div>

                      {rewardsEnabled ? (
                        <div className="space-y-2">
                          {rewardTiers.map((tier) => {
                            const unlocked = myInviteCount >= tier.requiredInvites;
                            const chosen = (selectedRewardId || rewardTiers[0]?.id) === tier.id;
                            return (
                              <button
                                key={tier.id}
                                type="button"
                                onClick={() => {
                                  setSelectedRewardId(tier.id);
                                  if (!subject.trim()) {
                                    setSubject(`Claim Invite Reward: ${tier.title}`);
                                  }
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                                  chosen
                                    ? 'border-[var(--accent)] bg-white dark:bg-[#232733]'
                                    : 'border-slate-200 dark:border-white/8 bg-white/70 dark:bg-[#1D2029]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-950 dark:text-white">
                                    {tier.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {tier.description}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                                    {myInviteCount}/{tier.requiredInvites}
                                  </p>
                                  <p
                                    className={`text-[11px] font-medium ${
                                      unlocked
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {unlocked ? 'Eligible' : `${tier.requiredInvites - myInviteCount} more`}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 dark:border-white/12 p-4 text-center space-y-2">
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            The server owner has not enabled invite rewards for <strong>{server.name}</strong> yet.
                          </p>
                          {isStaff && (
                            <button
                              type="button"
                              onClick={onOpenConfigureRewards}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)]"
                            >
                              <Settings className="h-3.5 w-3.5" />
                              <span>Set Up Invite Rewards as Owner</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subject & Details */}
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Ticket Subject
                      </span>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder={
                          category === 'invite_reward'
                            ? 'e.g., Claiming Community Supporter Role (3 invites)'
                            : category === 'query'
                            ? 'e.g., Question about upcoming community call'
                            : 'e.g., Need help with channel permissions'
                        }
                        className="w-full rounded-lg border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#14171F] px-3.5 py-2.5 text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Details (Optional)
                      </span>
                      <textarea
                        rows={4}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Describe your question, issue, or reward claim details..."
                        className="w-full rounded-lg border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#14171F] px-3.5 py-2.5 text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                      />
                    </label>
                  </div>

                  {formError && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{formError}</p>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="submit"
                      disabled={submitting || (category === 'invite_reward' && !rewardsEnabled)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      <Ticket className="h-4 w-4" />
                      <span>{submitting ? 'Generating...' : 'Generate Personal Ticket'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* Active Personal Ticket Thread */
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.07] bg-slate-50/70 dark:bg-[#171A21]/80 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      #TKT-{activeTicket.ticketNumber}
                    </span>
                    <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white truncate">
                      {activeTicket.subject}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {CATEGORY_META[activeTicket.category].label} · Opened by{' '}
                    {users[activeTicket.creatorId]?.displayName || 'Member'} · Private Personal Ticket
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {isStaff &&
                    activeTicket.category === 'invite_reward' &&
                    !activeTicket.rewardFulfilled && (
                      <button
                        type="button"
                        onClick={() => onUpdateTicket(activeTicket.id, { approveReward: true })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        <span>Approve & Grant Reward</span>
                      </button>
                    )}

                  {activeTicket.status === 'open' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateTicket(activeTicket.id, { status: 'resolved' })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/12 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Resolve</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateTicket(activeTicket.id, { status: 'closed' })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/12 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Close</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpdateTicket(activeTicket.id, { status: 'open' })}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/12 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reopen Ticket</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Ticket Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {ticketMessages.map((msg) => {
                  const author = users[msg.authorId];
                  return (
                    <div key={msg.id} className="flex items-start gap-3">
                      <Avatar user={author} size="sm" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                            {author?.displayName || 'Ticket Bot'}
                          </span>
                          {author?.isBot && (
                            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                              BOT
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {msg.content && (
                          <div className="text-sm text-slate-800 dark:text-slate-200">
                            <MarkdownRenderer content={msg.content} />
                          </div>
                        )}

                        {msg.embed && (
                          <div className="max-w-xl rounded-xl border border-slate-200 dark:border-white/10 border-l-4 border-l-indigo-500 bg-slate-50 dark:bg-[#171A21] p-4 space-y-2.5">
                            <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                              {msg.embed.title}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {msg.embed.description}
                            </p>
                            {msg.embed.fields && msg.embed.fields.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                {msg.embed.fields.map((f, idx) => (
                                  <div key={idx}>
                                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                      {f.name}
                                    </p>
                                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                                      {f.value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {msg.embed.footer && (
                              <p className="pt-1 text-[11px] text-slate-400">{msg.embed.footer}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ticket Reply Composer */}
              <form
                onSubmit={handleSendReply}
                className="border-t border-slate-200 dark:border-white/[0.07] p-4"
              >
                {activeTicket.status === 'closed' ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>This ticket is closed. Reopen it to send additional messages.</span>
                    <button
                      type="button"
                      onClick={() => onUpdateTicket(activeTicket.id, { status: 'open' })}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      Reopen
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#14171F] px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--accent)]">
                    <input
                      type="text"
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      placeholder={`Reply privately in #TKT-${activeTicket.ticketNumber}...`}
                      className="flex-1 bg-transparent text-sm text-slate-950 dark:text-white placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!replyInput.trim() || sendingReply}
                      aria-label="Send ticket reply"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
