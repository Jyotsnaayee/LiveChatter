import { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Crown,
  Hash,
  Headphones,
  HeadphoneOff,
  Lock,
  LogOut,
  Megaphone,
  MessagesSquare,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Ticket,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import type {
  Channel,
  DirectMessageThread,
  PresenceStatus,
  Server,
  User,
  VoiceParticipant,
} from '../shared/types';
import { OrbIcon } from './OrbIcon';
import { Avatar, PRESENCE_COLOR, PRESENCE_LABEL } from './Avatar';

interface ChannelSidebarProps {
  mode: 'server' | 'home';
  server: Server | null;
  dms: DirectMessageThread[];
  activeChannelId: string | null;
  activeTicketsView?: boolean;
  openTicketsCount?: number;
  activeHomeTab: 'friends' | 'requests' | 'dm';
  currentUser: User;
  users: Record<string, User>;
  voiceParticipants: VoiceParticipant[];
  mutedChannelIds: string[];
  unreadChannelIds: string[];
  onSelectChannel: (channelId: string) => void;
  onSelectTicketDesk: () => void;
  onOpenFeatureBalls: (opts?: { tab?: 'quests' | 'profile' | 'ranks'; serverId?: string }) => void;
  onSelectHomeTab: (tab: 'friends' | 'requests') => void;
  onSelectDm: (dmId: string) => void;
  onOpenCreateDm: () => void;
  onOpenCreateChannel: (categoryId?: string) => void;
  onOpenServerSettings: (tab?: string) => void;
  onOpenInviteFriends: (opts?: { tab?: 'send' | 'redeem'; serverId?: string }) => void;
  onOpenQuickSwitcher: () => void;
  onOpenUserSettings: () => void;
  onLeaveServer: () => void;
  onVoiceToggleMute: () => void;
  onVoiceToggleDeafen: () => void;
  onVoiceLeave: () => void;
  onUpdatePresence: (status: PresenceStatus, customStatus?: User['customStatus']) => void;
}

export function ChannelIcon({
  type,
  isBotCmdChannel = false,
  className = 'h-4 w-4 shrink-0',
}: {
  type: Channel['type'];
  isBotCmdChannel?: boolean;
  className?: string;
}) {
  if (isBotCmdChannel) return <Terminal className={className} />;
  if (type === 'voice') return <Volume2 className={className} />;
  if (type === 'stage') return <Radio className={className} />;
  if (type === 'forum') return <MessagesSquare className={className} />;
  if (type === 'announcement') return <Megaphone className={className} />;
  return <Hash className={className} />;
}

export function ChannelSidebar({
  mode,
  server,
  dms,
  activeChannelId,
  activeTicketsView = false,
  openTicketsCount = 0,
  activeHomeTab,
  currentUser,
  users,
  voiceParticipants,
  mutedChannelIds,
  unreadChannelIds,
  onSelectChannel,
  onSelectTicketDesk,
  onOpenFeatureBalls,
  onSelectHomeTab,
  onSelectDm,
  onOpenCreateDm,
  onOpenCreateChannel,
  onOpenServerSettings,
  onOpenInviteFriends,
  onOpenQuickSwitcher,
  onOpenUserSettings,
  onLeaveServer,
  onVoiceToggleMute,
  onVoiceToggleDeafen,
  onVoiceLeave,
  onUpdatePresence,
}: ChannelSidebarProps) {
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState(currentUser.customStatus?.text || '');

  const myVoice = voiceParticipants.find((p) => p.userId === currentUser.id);
  const myVoiceChannel = myVoice
    ? server?.channels.find((c) => c.id === myVoice.channelId)
    : undefined;

  const toggleCat = (id: string) => {
    setCollapsedCats((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const pendingRequestsCount = dms.filter((d) => d.isRequest).length;
  const activeDms = dms.filter((d) => !d.isRequest);

  return (
    <aside className="flex h-full w-[252px] shrink-0 flex-col border-r border-slate-200 dark:border-white/[0.07] bg-[#F3F4F6] dark:bg-[#171A21]">
      {/* Top Header */}
      {mode === 'server' && server ? (
        <div className="relative border-b border-slate-200 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={() => setServerMenuOpen((o) => !o)}
            className="flex h-13 w-full items-center justify-between px-4 text-left hover:bg-slate-200/60 dark:hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <span className="font-display text-[15px] font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {server.name}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${serverMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {serverMenuOpen && (
            <div className="absolute left-3 right-3 top-12 z-40 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  onOpenInviteFriends({ tab: 'send', serverId: server.id });
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--accent)] hover:bg-slate-100 dark:hover:bg-white/6"
              >
                <span>Invite People</span>
                <UserPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  onOpenCreateChannel();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/6"
              >
                <span>Create Channel</span>
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  onOpenServerSettings('overview');
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/6"
              >
                <span>Server Settings</span>
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  onOpenServerSettings('automod');
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/6"
              >
                <span>Moderation & AutoMod</span>
                <ShieldCheck className="h-4 w-4" />
              </button>
              <div className="my-1 h-px bg-slate-200 dark:bg-white/8" />
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  onLeaveServer();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <span>{server.ownerId === currentUser.id ? 'Delete Server' : 'Leave Server'}</span>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-13 items-center border-b border-slate-200 dark:border-white/[0.07] px-3">
          <button
            type="button"
            onClick={onOpenQuickSwitcher}
            className="flex h-8 w-full items-center justify-between rounded-lg bg-slate-200/80 dark:bg-[#111318] px-2.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Find conversation</span>
            </span>
            <kbd className="font-mono text-[11px] opacity-75">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Middle Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {mode === 'server' && server ? (
          <>
            {/* Quick server utility links (Ticket Bot, Events & Server Settings) */}
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={onSelectTicketDesk}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  activeTicketsView
                    ? 'bg-slate-200/90 dark:bg-white/[0.09] font-medium text-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Ticket
                    className={`h-4 w-4 shrink-0 ${
                      activeTicketsView ? 'text-[var(--accent)]' : 'text-indigo-500'
                    }`}
                  />
                  <span className="truncate">Ticket Bot</span>
                </span>
                {openTicketsCount > 0 && (
                  <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {openTicketsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpenFeatureBalls({ tab: 'ranks', serverId: server.id })}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <Crown className="h-4 w-4 shrink-0 text-amber-500" />
                  <span className="truncate">Ranks & Boosts</span>
                </span>
                <span className="font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">
                  Lv.{server.boostLevel || 0} · {server.boostCount || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenServerSettings('events')}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <Calendar className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate">Scheduled Events</span>
                </span>
                {server.events.length > 0 && (
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {server.events.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpenServerSettings('apps')}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate">Bots & Webhooks</span>
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {server.installedBotIds.length}
                </span>
              </button>
            </div>

            <div className="h-px bg-slate-200 dark:bg-white/[0.06]" />

            {/* Categories and Channels */}
            {server.categories.map((cat) => {
              const catChannels = server.channels.filter((c) => c.categoryId === cat.id);
              const isCollapsed = Boolean(collapsedCats[cat.id]);
              return (
                <div key={cat.id} className="space-y-0.5">
                  <div className="flex items-center justify-between px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => toggleCat(cat.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span className="truncate">{cat.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCreateChannel(cat.id)}
                      title={`Create channel in ${cat.name}`}
                      aria-label={`Create channel in ${cat.name}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {!isCollapsed &&
                    catChannels.map((channel) => {
                      const active = activeChannelId === channel.id;
                      const muted = mutedChannelIds.includes(channel.id);
                      const unread = unreadChannelIds.includes(channel.id) && !muted && !active;
                      const roomUsers = voiceParticipants.filter((vp) => vp.channelId === channel.id);

                      return (
                        <div key={channel.id}>
                          <button
                            type="button"
                            onClick={() => onSelectChannel(channel.id)}
                            className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                              active
                                ? 'bg-slate-200/90 dark:bg-white/[0.09] font-medium text-slate-950 dark:text-white'
                                : unread
                                ? 'font-medium text-slate-900 dark:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                                : muted
                                ? 'text-slate-400 dark:text-slate-500 hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <ChannelIcon
                                type={channel.type}
                                isBotCmdChannel={Boolean(channel.isBotCmdChannel || channel.id === server.botCmdChannelId)}
                                className={`h-4 w-4 shrink-0 ${
                                  active
                                    ? 'text-[var(--accent)]'
                                    : channel.isBotCmdChannel || channel.id === server.botCmdChannelId
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              />
                              <span className="truncate">{channel.name}</span>
                              {channel.isPrivate && <Lock className="h-3 w-3 shrink-0 text-slate-400" />}
                            </span>
                            {(channel.isBotCmdChannel || channel.id === server.botCmdChannelId) && !unread && (
                              <span className="shrink-0 rounded bg-emerald-500/12 px-1 py-0.5 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                                CMD
                              </span>
                            )}
                            {unread && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-label="Unread" />
                            )}
                            {(channel.type === 'voice' || channel.type === 'stage') && roomUsers.length > 0 && (
                              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                {roomUsers.length}
                              </span>
                            )}
                          </button>

                          {/* Connected Voice / Stage participants */}
                          {roomUsers.length > 0 && (
                            <div className="mt-0.5 ml-6 space-y-1 pb-1">
                              {roomUsers.map((vp) => {
                                const u = users[vp.userId];
                                if (!u) return null;
                                return (
                                  <div
                                    key={vp.userId}
                                    className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <Avatar user={u} size="xs" />
                                      <span className="truncate">{u.displayName}</span>
                                    </span>
                                    <span className="flex items-center gap-1 text-slate-400">
                                      {vp.muted && <MicOff className="h-3 w-3 text-rose-500" />}
                                      {vp.deafened && <HeadphoneOff className="h-3 w-3 text-rose-500" />}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </>
        ) : (
          /* Home Sidebar: Friends, Message Requests, Direct Messages */
          <div className="space-y-4">
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onSelectHomeTab('friends')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeHomeTab === 'friends'
                    ? 'bg-slate-200/90 dark:bg-white/[0.09] text-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                }`}
              >
                <Users className="h-4 w-4 text-slate-500" />
                <span>Friends</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectHomeTab('requests')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeHomeTab === 'requests'
                    ? 'bg-slate-200/90 dark:bg-white/[0.09] text-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <span>Message Requests</span>
                </span>
                {pendingRequestsCount > 0 && (
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpenInviteFriends({ tab: 'send' })}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-slate-200/60 dark:hover:bg-white/[0.05] transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                <span>Invite Friends</span>
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Direct Messages</span>
                <button
                  type="button"
                  onClick={onOpenCreateDm}
                  title="New Direct Message or Group DM"
                  aria-label="New Direct Message or Group DM"
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {activeDms.map((dm) => {
                const others = dm.participantIds.filter((id) => id !== currentUser.id).map((id) => users[id]).filter(Boolean);
                const title = dm.isGroup ? dm.name || others.map((u) => u.displayName).join(', ') : others[0]?.displayName || 'Direct Message';
                const active = activeHomeTab === 'dm' && activeChannelId === dm.id;
                return (
                  <button
                    key={dm.id}
                    type="button"
                    onClick={() => onSelectDm(dm.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      active
                        ? 'bg-slate-200/90 dark:bg-white/[0.09] text-slate-950 dark:text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    {dm.isGroup ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                        <Users className="h-4 w-4" />
                      </div>
                    ) : (
                      <Avatar user={others[0]} size="sm" showPresence />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="truncate text-sm font-medium">{title}</p>
                        {!dm.isGroup && others[0]?.isBot && (
                          <span className="shrink-0 rounded bg-teal-500/15 px-1 py-0.5 font-mono text-[9px] font-bold text-teal-700 dark:text-teal-300">
                            BOT
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {dm.isGroup ? `${dm.participantIds.length} members` : others[0]?.customStatus?.text || PRESENCE_LABEL[others[0]?.status || 'offline']}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Active Voice Connection Bar */}
      {myVoice && (
        <div className="border-t border-slate-200 dark:border-white/[0.07] bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Voice Connected</p>
              <button
                type="button"
                onClick={() => onSelectChannel(myVoice.channelId)}
                className="truncate text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                {myVoiceChannel?.name || 'Active Room'}
              </button>
            </div>
            <button
              type="button"
              onClick={onVoiceLeave}
              title="Disconnect from voice"
              aria-label="Disconnect from voice"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom User Control Bar */}
      <div className="relative border-t border-slate-200 dark:border-white/[0.07] bg-[#EAECEF] dark:bg-[#13161C] px-2.5 py-2">
        {presenceMenuOpen && (
          <div className="absolute bottom-14 left-2.5 right-2.5 z-50 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-2.5 shadow-xl space-y-2">
            <p className="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Set Presence</p>
            <div className="grid grid-cols-2 gap-1">
              {(['online', 'idle', 'dnd', 'invisible'] as PresenceStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    onUpdatePresence(st, currentUser.customStatus);
                    setPresenceMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    currentUser.status === st
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/6'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${PRESENCE_COLOR[st]}`} />
                  <span className="truncate">{PRESENCE_LABEL[st]}</span>
                </button>
              ))}
            </div>
            <div className="pt-1 border-t border-slate-200 dark:border-white/8">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Custom Status
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customStatusInput}
                  onChange={(e) => setCustomStatusInput(e.target.value)}
                  placeholder="What are you working on?"
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    onUpdatePresence(
                      currentUser.status,
                      customStatusInput.trim() ? { emoji: '💬', text: customStatusInput.trim() } : undefined
                    );
                    setPresenceMenuOpen(false);
                  }}
                  className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] whitespace-nowrap"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => setPresenceMenuOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left hover:bg-slate-300/60 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Avatar user={currentUser} size="sm" showPresence />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{currentUser.displayName}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <OrbIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-300 tabular-nums">
                  {currentUser.featureBalls || 0} FB
                </span>
              </p>
            </div>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onVoiceToggleMute}
              title={myVoice?.muted ? 'Unmute Microphone' : 'Mute Microphone'}
              aria-label={myVoice?.muted ? 'Unmute Microphone' : 'Mute Microphone'}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                myVoice?.muted
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/60 dark:hover:bg-white/10'
              }`}
            >
              {myVoice?.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onVoiceToggleDeafen}
              title={myVoice?.deafened ? 'Undeafen Audio' : 'Deafen Audio'}
              aria-label={myVoice?.deafened ? 'Undeafen Audio' : 'Deafen Audio'}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                myVoice?.deafened
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/60 dark:hover:bg-white/10'
              }`}
            >
              {myVoice?.deafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onOpenUserSettings}
              title="User Settings"
              aria-label="User Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-300/60 dark:hover:bg-white/10 transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
