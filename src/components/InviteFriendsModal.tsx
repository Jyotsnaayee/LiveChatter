import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Share2,
  Smartphone,
  Ticket,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { FriendInviteCode, Server, User } from '../shared/types';
import { buildDefaultInviteMessage, buildInviteShareLinks } from '../lib/inviteShare';

interface InviteFriendsModalProps {
  currentUser: User;
  servers: Server[];
  friendInvites: FriendInviteCode[];
  initialTab?: 'send' | 'redeem';
  initialServerId?: string;
  initialRedeemCode?: string;
  onCreateInvite: (payload: {
    serverId?: string;
    maxUses?: number;
    expiresInHours?: number;
    note?: string;
  }) => Promise<FriendInviteCode>;
  onRevokeInvite: (code: string) => Promise<void>;
  onTrackShare: (code: string, channel: 'whatsapp' | 'gmail' | 'messages' | 'copy' | 'native') => Promise<void>;
  onRedeemInvite: (code: string) => Promise<{
    kind: 'friend' | 'server';
    friendName?: string;
    serverName?: string;
  }>;
  onClose: () => void;
}

export function InviteFriendsModal({
  currentUser,
  servers,
  friendInvites,
  initialTab = 'send',
  initialServerId,
  initialRedeemCode = '',
  onCreateInvite,
  onRevokeInvite,
  onTrackShare,
  onRedeemInvite,
  onClose,
}: InviteFriendsModalProps) {
  const [tab, setTab] = useState<'send' | 'redeem'>(initialTab);
  const [selectedCode, setSelectedCode] = useState<string>(() => {
    if (initialServerId) {
      const match = friendInvites.find((inv) => inv.serverId === initialServerId);
      if (match) return match.code;
    }
    return friendInvites[0]?.code || '';
  });

  // Generator controls
  const [attachServerId, setAttachServerId] = useState<string>(initialServerId || '');
  const [maxUses, setMaxUses] = useState<number>(25);
  const [expiresInHours, setExpiresInHours] = useState<number>(168); // 7 days
  const [creating, setCreating] = useState(false);

  // Share fields
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | 'message' | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Redeem tab state
  const [redeemInput, setRedeemInput] = useState(initialRedeemCode);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const activeInvite = useMemo(() => {
    return friendInvites.find((inv) => inv.code === selectedCode) || friendInvites[0] || null;
  }, [friendInvites, selectedCode]);

  // If opened for a specific server without an existing invite for that server, let user generate or use server invite
  const selectedServer = useMemo(
    () => servers.find((s) => s.id === (activeInvite?.serverId || attachServerId)),
    [servers, activeInvite?.serverId, attachServerId]
  );

  // Keep editable message synced when active code changes
  useEffect(() => {
    if (!activeInvite) return;
    setCustomMessage(
      buildDefaultInviteMessage({
        senderName: currentUser.displayName,
        senderUsername: currentUser.username,
        code: activeInvite.code,
        serverName: activeInvite.serverName,
        customNote: activeInvite.note,
      })
    );
  }, [activeInvite?.code, activeInvite?.serverName, activeInvite?.note, currentUser.displayName, currentUser.username]);

  // Auto-generate an invite if user has zero active invites
  useEffect(() => {
    if (friendInvites.length === 0 && !creating) {
      setCreating(true);
      onCreateInvite({ serverId: initialServerId || undefined, maxUses: 25, expiresInHours: 168 })
        .then((inv) => setSelectedCode(inv.code))
        .catch(() => {})
        .finally(() => setCreating(false));
    }
  }, [friendInvites.length, creating, initialServerId, onCreateInvite]);

  const shareLinks = useMemo(() => {
    if (!activeInvite) return null;
    return buildInviteShareLinks({
      code: activeInvite.code,
      senderName: currentUser.displayName,
      serverName: activeInvite.serverName,
      message: customMessage,
      recipientPhone,
      recipientEmail,
    });
  }, [activeInvite, currentUser.displayName, customMessage, recipientPhone, recipientEmail]);

  const supportsNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleGenerateNewCode = async () => {
    setCreating(true);
    setShareFeedback(null);
    try {
      const inv = await onCreateInvite({
        serverId: attachServerId || undefined,
        maxUses,
        expiresInHours: expiresInHours > 0 ? expiresInHours : undefined,
      });
      setSelectedCode(inv.code);
      setShareFeedback(
        inv.serverName
          ? `Created invite code ${inv.code} for friend + ${inv.serverName}.`
          : `Created new personal friend invite code ${inv.code}.`
      );
    } catch (err) {
      setShareFeedback(err instanceof Error ? err.message : 'Unable to generate invite code.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (kind: 'code' | 'link' | 'message', text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedTarget(kind);
    setTimeout(() => setCopiedTarget((cur) => (cur === kind ? null : cur)), 1800);
    if (activeInvite) {
      onTrackShare(activeInvite.code, 'copy').catch(() => {});
    }
  };

  const handleNativeShare = async () => {
    if (!activeInvite || !shareLinks || !navigator.share) return;
    try {
      await navigator.share({
        title: shareLinks.subject,
        text: shareLinks.message,
        url: shareLinks.inviteUrl,
      });
      await onTrackShare(activeInvite.code, 'native');
      setShareFeedback('Shared using your device share sheet.');
    } catch {
      // User dismissed share sheet
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemInput.trim()) return;
    setRedeeming(true);
    setRedeemFeedback(null);
    try {
      const res = await onRedeemInvite(redeemInput.trim());
      if (res.kind === 'friend') {
        setRedeemFeedback({
          kind: 'ok',
          text: res.serverName
            ? `Connected with ${res.friendName} and joined ${res.serverName}!`
            : `Connected with ${res.friendName}! Direct message opened.`,
        });
      } else {
        setRedeemFeedback({
          kind: 'ok',
          text: `Joined ${res.serverName || 'server'} successfully!`,
        });
      }
      setRedeemInput('');
      setTimeout(() => onClose(), 900);
    } catch (err) {
      setRedeemFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Could not redeem that invite code.',
      });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite Friends"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <UserPlus className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-slate-950 dark:text-white truncate">
                Invite Friends to LiveChatter
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Send an invite code straight to their phone via WhatsApp, Gmail, or Messages
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#171A21] px-6 pt-2.5 gap-2">
          <button
            type="button"
            onClick={() => setTab('send')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === 'send'
                ? 'border-[var(--accent)] text-slate-950 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Share2 className="h-4 w-4" />
            <span>Send Invite Code</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('redeem')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === 'redeem'
                ? 'border-[var(--accent)] text-slate-950 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Ticket className="h-4 w-4" />
            <span>Redeem a Code</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'send' ? (
            <>
              {/* Active Invite Code Hero Card */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {activeInvite?.serverName
                        ? `Friend + ${activeInvite.serverName} Invite Code`
                        : 'Your Personal Friend Invite Code'}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-slate-950 dark:text-white select-all">
                      {activeInvite?.code || 'Generating...'}
                    </p>
                  </div>

                  {activeInvite && shareLinks && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy('code', activeInvite.code)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                      >
                        {copiedTarget === 'code' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedTarget === 'code' ? 'Code Copied' : 'Copy Code'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy('link', shareLinks.inviteUrl)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                      >
                        {copiedTarget === 'link' ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedTarget === 'link' ? 'Link Copied' : 'Copy App Link'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {shareLinks && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#1D2029] border border-slate-200 dark:border-white/[0.07] px-3 py-2">
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate select-all">
                      {shareLinks.inviteUrl}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                      {activeInvite?.uses || 0}/{activeInvite?.maxUses || '∞'} used
                    </span>
                  </div>
                )}
              </div>

              {/* Primary Phone Sharing Actions: WhatsApp, Gmail, Messages */}
              {activeInvite && shareLinks && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                      Send Directly to Their Phone
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Opens the app with your code pre-filled
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* WhatsApp */}
                    <a
                      href={shareLinks.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        onTrackShare(activeInvite.code, 'whatsapp').catch(() => {});
                        setShareFeedback(`Prepared WhatsApp invite with code ${activeInvite.code}.`);
                      }}
                      className="group flex flex-col justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4 hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#16A34A] dark:text-[#25D366]">
                          <MessageCircle className="h-5 w-5" />
                        </span>
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Open →
                        </span>
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                          WhatsApp
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {recipientPhone.trim()
                            ? `Send to ${recipientPhone.trim()}`
                            : 'Choose contact in WhatsApp'}
                        </p>
                      </div>
                    </a>

                    {/* Gmail */}
                    <a
                      href={shareLinks.gmailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        onTrackShare(activeInvite.code, 'gmail').catch(() => {});
                        setShareFeedback(`Opened Gmail compose with invite code ${activeInvite.code}.`);
                      }}
                      className="group flex flex-col justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4 hover:border-rose-500/60 hover:bg-rose-50/40 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          <Mail className="h-5 w-5" />
                        </span>
                        <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          Compose →
                        </span>
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                          Gmail
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {recipientEmail.trim()
                            ? `Email ${recipientEmail.trim()}`
                            : 'Compose email in Gmail'}
                        </p>
                      </div>
                    </a>

                    {/* Messages (SMS / iMessage) */}
                    <a
                      href={shareLinks.smsUrl}
                      onClick={() => {
                        onTrackShare(activeInvite.code, 'messages').catch(() => {});
                        setShareFeedback(`Opened Messages app with invite code ${activeInvite.code}.`);
                      }}
                      className="group flex flex-col justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4 hover:border-sky-500/60 hover:bg-sky-50/40 dark:hover:bg-sky-500/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
                          <Smartphone className="h-5 w-5" />
                        </span>
                        <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                          Text →
                        </span>
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                          Messages
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {recipientPhone.trim()
                            ? `SMS to ${recipientPhone.trim()}`
                            : 'Send via SMS or iMessage'}
                        </p>
                      </div>
                    </a>
                  </div>

                  {/* Secondary Mailto & Native Mobile Share Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <a
                        href={shareLinks.mailtoUrl}
                        onClick={() => onTrackShare(activeInvite.code, 'gmail').catch(() => {})}
                        className="text-slate-500 dark:text-slate-400 hover:text-[var(--accent)] underline underline-offset-2"
                      >
                        Use default mail app instead
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopy('message', shareLinks.message)}
                        className="text-slate-500 dark:text-slate-400 hover:text-[var(--accent)] underline underline-offset-2"
                      >
                        {copiedTarget === 'message' ? 'Full message copied!' : 'Copy full invite text'}
                      </button>
                    </div>
                    {supportsNativeShare && (
                      <button
                        type="button"
                        onClick={handleNativeShare}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Phone Share Sheet</span>
                      </button>
                    )}
                  </div>

                  {shareFeedback && (
                    <p className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                      {shareFeedback}
                    </p>
                  )}
                </div>
              )}

              {/* Optional Recipient & Message Customization */}
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Optional Recipient & Message Preview
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Phone className="h-3.5 w-3.5" />
                      <span>Friend’s Phone (WhatsApp / Messages)</span>
                    </span>
                    <input
                      type="tel"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+1 555 234 5678 (optional)"
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Mail className="h-3.5 w-3.5" />
                      <span>Friend’s Email (Gmail)</span>
                    </span>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="friend@gmail.com (optional)"
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Invite Message Sent to Friend
                  </span>
                  <textarea
                    rows={3}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                  />
                </label>
              </div>

              {/* Create New Code + Active Codes List */}
              <div className="space-y-3 border-t border-slate-200 dark:border-white/[0.08] pt-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-end gap-2.5 flex-1">
                    <label className="space-y-1 min-w-[160px] flex-1">
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Attach Server (Optional)
                      </span>
                      <select
                        value={attachServerId}
                        onChange={(e) => setAttachServerId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="">Friend connection only</option>
                        {servers.map((srv) => (
                          <option key={srv.id} value={srv.id}>
                            Friend + {srv.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 w-28">
                      <span className="block text-xs text-slate-500 dark:text-slate-400">Expires</span>
                      <select
                        value={expiresInHours}
                        onChange={(e) => setExpiresInHours(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      >
                        <option value={24}>24 hours</option>
                        <option value={168}>7 days</option>
                        <option value={720}>30 days</option>
                        <option value={0}>Never</option>
                      </select>
                    </label>
                    <label className="space-y-1 w-24">
                      <span className="block text-xs text-slate-500 dark:text-slate-400">Max Uses</span>
                      <select
                        value={maxUses}
                        onChange={(e) => setMaxUses(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      >
                        <option value={1}>1 use</option>
                        <option value={5}>5 uses</option>
                        <option value={25}>25 uses</option>
                        <option value={0}>Unlimited</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={handleGenerateNewCode}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/12 bg-slate-100 dark:bg-white/8 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/12 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{creating ? 'Creating...' : 'Generate New Code'}</span>
                  </button>
                </div>

                {friendInvites.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                    {friendInvites.map((inv) => {
                      const isSelected = activeInvite?.code === inv.code;
                      return (
                        <div
                          key={inv.code}
                          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors ${
                            isSelected ? 'bg-[var(--accent-soft)]' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedCode(inv.code)}
                            className="flex flex-1 items-center gap-3 text-left min-w-0"
                          >
                            <span className="font-mono text-xs font-bold text-slate-950 dark:text-white">
                              {inv.code}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {inv.serverName ? `Friend + ${inv.serverName}` : 'Personal Friend Invite'}
                            </span>
                            {inv.sharedChannels.length > 0 && (
                              <span className="hidden sm:inline text-[11px] text-slate-400 truncate">
                                · Sent via{' '}
                                {inv.sharedChannels
                                  .filter((c) => c === 'whatsapp' || c === 'gmail' || c === 'messages')
                                  .map((c) => (c === 'whatsapp' ? 'WhatsApp' : c === 'gmail' ? 'Gmail' : 'Messages'))
                                  .join(', ') || 'Copy'}
                              </span>
                            )}
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {inv.uses}/{inv.maxUses > 0 ? inv.maxUses : '∞'}
                            </span>
                            {friendInvites.length > 1 && (
                              <button
                                type="button"
                                onClick={() => onRevokeInvite(inv.code)}
                                title="Revoke invite code"
                                aria-label={`Revoke ${inv.code}`}
                                className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedServer && activeInvite?.serverId !== selectedServer.id && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tip: Click “Generate New Code” to create a dedicated invite code that connects you as friends and automatically invites them into <strong className="text-slate-700 dark:text-slate-200">{selectedServer.name}</strong>.
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Redeem Invite Code Tab */
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] p-5 space-y-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                    Received an Invite Code on WhatsApp, Gmail, or Messages?
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Paste the invite code or the full invite link your friend sent you. You’ll be connected as friends right away and taken straight to your chat.
                  </p>
                </div>

                <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={redeemInput}
                    onChange={(e) => setRedeemInput(e.target.value)}
                    placeholder="e.g., LC-SORA-9051 or full invite link"
                    autoFocus
                    className="flex-1 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-[#1D2029] px-3.5 py-2.5 font-mono text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <button
                    type="submit"
                    disabled={redeeming || !redeemInput.trim()}
                    className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap"
                  >
                    {redeeming ? 'Connecting...' : 'Redeem & Connect'}
                  </button>
                </form>

                {redeemFeedback && (
                  <p
                    className={`text-xs font-medium ${
                      redeemFeedback.kind === 'ok'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {redeemFeedback.text}
                  </p>
                )}
              </div>

              {/* Sample Friend Invite Codes to Try */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Try Redeeming a Sample Friend Code
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { code: 'LC-SORA-9051', label: 'Sora Tanaka', desc: 'Personal Friend Invite' },
                    { code: 'LC-LIAM-5520', label: "Liam O'Connor", desc: 'Friend + Apex Vanguard' },
                  ].map((sample) => (
                    <button
                      key={sample.code}
                      type="button"
                      onClick={() => setRedeemInput(sample.code)}
                      className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#232733] px-3.5 py-3 text-left hover:border-[var(--accent)] transition-colors"
                    >
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-950 dark:text-white">
                          {sample.code}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {sample.label} · {sample.desc}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-[var(--accent)]">Use</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
