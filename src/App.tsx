import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Home, MessageSquare, Settings, Sparkles } from 'lucide-react';
import type {
  AppStateSnapshot,
  Message,
  PresenceStatus,
  User,
  WhiteboardStroke,
  WsServerEvent,
} from './shared/types';
import { api, LiveChatterSocket, setAuthToken } from './lib/api';
import { playNotificationPing, playSoundboardEffect } from './lib/audio';
import { ServerRail } from './components/ServerRail';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatView } from './components/ChatView';
import { ForumView } from './components/ForumView';
import { VoiceStageView } from './components/VoiceStageView';
import { MemberListAndThreads } from './components/MemberListAndThreads';
import { HomeView } from './components/HomeView';
import { DiscoveryView } from './components/DiscoveryView';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { UserSettingsModal } from './components/UserSettingsModal';
import { InviteFriendsModal } from './components/InviteFriendsModal';
import { TicketDeskView } from './components/TicketDeskView';
import { AuthGateScreen } from './components/AuthGateScreen';
import { FeatureBallView } from './components/FeatureBallView';
import {
  CreateChannelModal,
  CreateGroupDmModal,
  CreateServerModal,
  QuickSwitcherModal,
} from './components/ActionModals';

export default function App() {
  const [state, setState] = useState<AppStateSnapshot | null>(null);
  const [pendingUrlInvite, setPendingUrlInvite] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    return code && code.trim() ? code.trim() : null;
  });

  // Navigation state
  const [activeView, setActiveView] = useState<'home' | 'server' | 'discovery' | 'featureballs'>('server');
  const [featureBallTab, setFeatureBallTab] = useState<'quests' | 'shop' | 'profile' | 'ranks' | 'activity'>('quests');
  const [featureBallServerId, setFeatureBallServerId] = useState<string | null>(null);
  const [activeServerId, setActiveServerId] = useState<string | null>('srv-kernel');
  const [activeChannelId, setActiveChannelId] = useState<string | null>('ch-k-general');
  const [activeHomeTab, setActiveHomeTab] = useState<'friends' | 'requests' | 'dm'>('friends');
  const [serverTicketsOpen, setServerTicketsOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showMemberList, setShowMemberList] = useState(true);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Modals
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [createChannelCatId, setCreateChannelCatId] = useState<string | null | undefined>(undefined);
  const [createDmOpen, setCreateDmOpen] = useState(false);
  const [serverSettingsTab, setServerSettingsTab] = useState<string | null>(null);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [inviteModal, setInviteModal] = useState<{
    open: boolean;
    tab: 'send' | 'redeem';
    serverId?: string;
    redeemCode?: string;
  }>({ open: false, tab: 'send' });

  // Ephemeral real-time indicators
  const [typingByChannel, setTypingByChannel] = useState<Record<string, Record<string, number>>>({});
  const [recentSoundEvent, setRecentSoundEvent] = useState<{ userName: string; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const socketRef = useRef<LiveChatterSocket | null>(null);
  const stateRef = useRef<AppStateSnapshot | null>(null);
  stateRef.current = state;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  }, []);

  // Idempotent WebSocket Event Reducer
  const handleWsEvent = useCallback((event: WsServerEvent) => {
    if (event.type === 'state:sync') {
      setState(event.payload);
      return;
    }

    if (event.type === 'typing:update') {
      const { channelId, userId, isTyping } = event.payload;
      setTypingByChannel((prev) => {
        const ch = { ...(prev[channelId] || {}) };
        if (isTyping) ch[userId] = Date.now();
        else delete ch[userId];
        return { ...prev, [channelId]: ch };
      });
      return;
    }

    if (event.type === 'soundboard:played') {
      const snap = stateRef.current;
      const myVoice = snap?.voiceParticipants.find((p) => p.userId === snap.currentUserId);
      if (myVoice && myVoice.channelId === event.payload.channelId && !myVoice.deafened) {
        playSoundboardEffect(event.payload.soundId);
      }
      const uName = snap?.users[event.payload.userId]?.displayName || 'Someone';
      setRecentSoundEvent({ userName: uName, label: event.payload.label });
      setTimeout(() => setRecentSoundEvent(null), 3000);
      return;
    }

    setState((prev) => {
      if (!prev) return prev;

      if (event.type === 'message:created') {
        const msg = event.payload.message;
        const bucketKey = msg.threadId || msg.channelId;
        const list = prev.messages[bucketKey] || [];
        // Strict idempotency check
        if (list.some((m) => m.id === msg.id)) return prev;
        const currentUser = prev.users[prev.currentUserId];
        if (
          msg.authorId !== prev.currentUserId &&
          !msg.silent &&
          currentUser?.status !== 'dnd' &&
          currentUser?.settings.notificationSounds &&
          !prev.mutedChannelIds.includes(msg.channelId)
        ) {
          playNotificationPing();
        }
        const nextUnread =
          msg.authorId !== prev.currentUserId && !prev.unreadChannelIds.includes(msg.channelId)
            ? [...prev.unreadChannelIds, msg.channelId]
            : prev.unreadChannelIds;
        return {
          ...prev,
          messages: { ...prev.messages, [bucketKey]: [...list, msg] },
          unreadChannelIds: nextUnread,
        };
      }

      if (event.type === 'message:updated') {
        const msg = event.payload.message;
        const bucketKey = msg.threadId || msg.channelId;
        const list = prev.messages[bucketKey] || [];
        return {
          ...prev,
          messages: {
            ...prev.messages,
            [bucketKey]: list.map((m) => (m.id === msg.id ? msg : m)),
          },
        };
      }

      if (event.type === 'message:deleted') {
        const bucketKey = event.payload.threadId || event.payload.channelId;
        const list = prev.messages[bucketKey] || [];
        return {
          ...prev,
          messages: {
            ...prev.messages,
            [bucketKey]: list.filter((m) => m.id !== event.payload.messageId),
          },
        };
      }

      if (event.type === 'thread:created') {
        const { thread, initialMessage } = event.payload;
        const exists = prev.threads.some((t) => t.id === thread.id);
        const nextThreads = exists ? prev.threads : [thread, ...prev.threads];
        const existingMsgs = prev.messages[thread.id] || [];
        const nextMsgs =
          initialMessage && !existingMsgs.some((m) => m.id === initialMessage.id)
            ? [...existingMsgs, initialMessage]
            : existingMsgs;
        return {
          ...prev,
          threads: nextThreads,
          messages: { ...prev.messages, [thread.id]: nextMsgs },
        };
      }

      if (event.type === 'thread:updated') {
        return {
          ...prev,
          threads: prev.threads.map((t) => (t.id === event.payload.thread.id ? event.payload.thread : t)),
        };
      }

      if (event.type === 'ticket:created') {
        const { ticket, initialMessage } = event.payload;
        const exists = (prev.tickets || []).some((t) => t.id === ticket.id);
        const nextTickets = exists ? prev.tickets : [ticket, ...(prev.tickets || [])];
        const existingMsgs = prev.messages[ticket.id] || [];
        const nextMsgs =
          initialMessage && !existingMsgs.some((m) => m.id === initialMessage.id)
            ? [...existingMsgs, initialMessage]
            : existingMsgs;
        return {
          ...prev,
          tickets: nextTickets,
          messages: { ...prev.messages, [ticket.id]: nextMsgs },
        };
      }

      if (event.type === 'ticket:updated') {
        return {
          ...prev,
          tickets: (prev.tickets || []).map((t) => (t.id === event.payload.ticket.id ? event.payload.ticket : t)),
        };
      }

      if (event.type === 'presence:updated') {
        const { userId, status, customStatus } = event.payload;
        const u = prev.users[userId];
        if (!u) return prev;
        return {
          ...prev,
          users: { ...prev.users, [userId]: { ...u, status, customStatus } },
        };
      }

      if (event.type === 'user:updated') {
        return {
          ...prev,
          users: { ...prev.users, [event.payload.user.id]: event.payload.user },
        };
      }

      if (event.type === 'voice:updated') {
        return { ...prev, voiceParticipants: event.payload.participants };
      }

      if (event.type === 'whiteboard:stroke') {
        const stroke = event.payload.stroke;
        const list = prev.whiteboardStrokes[stroke.channelId] || [];
        if (list.some((s) => s.id === stroke.id)) return prev;
        return {
          ...prev,
          whiteboardStrokes: { ...prev.whiteboardStrokes, [stroke.channelId]: [...list, stroke] },
        };
      }

      if (event.type === 'whiteboard:cleared') {
        return {
          ...prev,
          whiteboardStrokes: { ...prev.whiteboardStrokes, [event.payload.channelId]: [] },
        };
      }

      if (event.type === 'server:updated') {
        const srv = event.payload.server;
        const isMember = srv.members.some((m) => m.userId === prev.currentUserId);
        const exists = prev.servers.some((s) => s.id === srv.id);
        let nextServers = prev.servers;
        if (!isMember) {
          nextServers = prev.servers.filter((s) => s.id !== srv.id);
        } else if (exists) {
          nextServers = prev.servers.map((s) => (s.id === srv.id ? srv : s));
        } else {
          nextServers = [...prev.servers, srv];
        }
        return { ...prev, servers: nextServers };
      }

      if (event.type === 'server:created') {
        const srv = event.payload.server;
        if (prev.servers.some((s) => s.id === srv.id)) return prev;
        return { ...prev, servers: [...prev.servers, srv] };
      }

      if (event.type === 'server:deleted') {
        return { ...prev, servers: prev.servers.filter((s) => s.id !== event.payload.serverId) };
      }

      if (event.type === 'dm:created') {
        const dm = event.payload.dm;
        if (prev.dms.some((d) => d.id === dm.id)) return prev;
        return { ...prev, dms: [dm, ...prev.dms] };
      }

      return prev;
    });
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleAuthenticated = useCallback(
    ({
      token,
      snapshot,
      isNewUser,
    }: {
      token: string;
      user: User;
      snapshot: AppStateSnapshot;
      isNewUser?: boolean;
    }) => {
      setAuthToken(token);
      setState(snapshot);

      socketRef.current?.disconnect();
      const socket = new LiveChatterSocket(handleWsEvent);
      socketRef.current = socket;
      socket.connect();

      if (isNewUser || snapshot.servers.length === 0) {
        setActiveView('home');
        setActiveHomeTab('friends');
      } else {
        const firstServer = snapshot.servers[0];
        setActiveView('server');
        setActiveServerId(firstServer.id);
        setActiveChannelId(firstServer.channels[0]?.id || null);
      }

      if (pendingUrlInvite) {
        setInviteModal({
          open: true,
          tab: 'redeem',
          redeemCode: pendingUrlInvite,
        });
        setPendingUrlInvite(null);
        const params = new URLSearchParams(window.location.search);
        params.delete('invite');
        const cleanSearch = params.toString();
        const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', cleanUrl);
      }
    },
    [handleWsEvent, pendingUrlInvite]
  );

  const handleSignOut = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setAuthToken(null);
    setUserSettingsOpen(false);
    setState(null);
  }, []);

  // Expire stale typing indicators
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 4500;
      setTypingByChannel((prev) => {
        let changed = false;
        const next: Record<string, Record<string, number>> = {};
        for (const [chId, map] of Object.entries(prev)) {
          const filtered: Record<string, number> = {};
          for (const [uid, ts] of Object.entries(map)) {
            if (ts > cutoff) filtered[uid] = ts;
            else changed = true;
          }
          if (Object.keys(filtered).length > 0) next[chId] = filtered;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+K Quick Switcher & Esc Close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSwitcherOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setQuickSwitcherOpen(false);
        setCreateServerOpen(false);
        setCreateChannelCatId(undefined);
        setCreateDmOpen(false);
        setServerSettingsTab(null);
        setUserSettingsOpen(false);
        setInviteModal((prev) => ({ ...prev, open: false }));
        setSelectedProfileUserId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Apply Theme, Free Accent Color, Font Scale, Reduced Motion, and High Contrast
  const currentUser: User | undefined = state ? state.users[state.currentUserId] : undefined;

  useEffect(() => {
    if (!currentUser) return;
    const { theme, accentColor, fontScale, reducedMotion, highContrast } = currentUser.settings;
    const html = document.documentElement;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    html.classList.toggle('dark', useDark);
    html.classList.toggle('reduce-motion', reducedMotion);
    html.classList.toggle('high-contrast', highContrast);
    html.style.setProperty('--accent', accentColor);
    html.style.setProperty('--accent-hover', accentColor);
    html.style.setProperty('--accent-soft', `${accentColor}22`);
    html.style.setProperty('--font-scale', String(fontScale));
  }, [currentUser?.settings]);

  const activeServer = useMemo(
    () => state?.servers.find((s) => s.id === activeServerId) || state?.servers[0] || null,
    [state?.servers, activeServerId]
  );

  const activeChannel = useMemo(() => {
    if (activeView !== 'server' || !activeServer) return null;
    return activeServer.channels.find((c) => c.id === activeChannelId) || activeServer.channels[0] || null;
  }, [activeView, activeServer, activeChannelId]);

  const activeDm = useMemo(() => {
    if (activeView !== 'home' || activeHomeTab !== 'dm' || !state) return null;
    return state.dms.find((d) => d.id === activeChannelId) || null;
  }, [activeView, activeHomeTab, state, activeChannelId]);

  const activeThread = useMemo(
    () => (activeThreadId && state ? state.threads.find((t) => t.id === activeThreadId) || null : null),
    [activeThreadId, state]
  );

  const clearUnread = (channelId: string) => {
    setState((prev) =>
      prev ? { ...prev, unreadChannelIds: prev.unreadChannelIds.filter((id) => id !== channelId) } : prev
    );
  };

  // Mandatory Google Sign-In + Final-Step CAPTCHA Gate
  if (!state || !currentUser) {
    return (
      <AuthGateScreen
        pendingInviteCode={pendingUrlInvite}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const currentChannelId = activeChannel?.id || activeDm?.id || '';
  const currentMessages = currentChannelId ? state.messages[currentChannelId] || [] : [];
  const typingUserIds = Object.keys(typingByChannel[currentChannelId] || {}).filter((id) => id !== currentUser.id);
  const pendingReqCount =
    state.dms.filter((d) => d.isRequest).length +
    state.friends.filter((f) => f.status === 'pending_incoming').length;

  const selectServer = (serverId: string) => {
    const srv = state.servers.find((s) => s.id === serverId);
    setActiveView('server');
    setActiveServerId(serverId);
    setServerTicketsOpen(false);
    setActiveThreadId(null);
    if (srv) {
      const firstCh = srv.channels.find((c) => c.type === 'text') || srv.channels[0];
      if (firstCh) {
        setActiveChannelId(firstCh.id);
        clearUnread(firstCh.id);
      }
    }
    setMobileDrawerOpen(false);
  };

  const selectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    setServerTicketsOpen(false);
    setActiveThreadId(null);
    clearUnread(channelId);
    setMobileDrawerOpen(false);
  };

  const selectTicketDesk = () => {
    setActiveView('server');
    setServerTicketsOpen(true);
    setActiveThreadId(null);
    setMobileDrawerOpen(false);
  };

  const activeServerOpenTicketsCount = activeServer
    ? (state.tickets || []).filter((t) => t.serverId === activeServer.id && t.status === 'open').length
    : 0;

  const selectDm = (dmId: string) => {
    setActiveView('home');
    setActiveHomeTab('dm');
    setActiveChannelId(dmId);
    setActiveThreadId(null);
    clearUnread(dmId);
    setMobileDrawerOpen(false);
  };

  const myVoice = state.voiceParticipants.find((p) => p.userId === currentUser.id);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F3F4F6] dark:bg-[#111318] text-slate-900 dark:text-slate-100">
      {/* Desktop Server Rail + Channel Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <ServerRail
          servers={state.servers}
          folders={state.folders}
          activeView={activeView}
          activeServerId={activeServer?.id || null}
          unreadChannelIds={state.unreadChannelIds}
          pendingRequestCount={pendingReqCount}
          featureBallBalance={currentUser.featureBalls || 0}
          onSelectHome={() => {
            setActiveView('home');
            setActiveHomeTab('friends');
            setActiveThreadId(null);
          }}
          onSelectServer={selectServer}
          onSelectDiscovery={() => {
            setActiveView('discovery');
            setActiveThreadId(null);
          }}
          onSelectFeatureBalls={() => {
            setFeatureBallTab('quests');
            setActiveView('featureballs');
            setActiveThreadId(null);
            api
              .getQuests()
              .then((q) => setState((prev) => (prev ? { ...prev, featureBallQuests: q } : prev)))
              .catch(() => {});
          }}
          onOpenCreateServer={() => setCreateServerOpen(true)}
          onToggleFolder={(fid) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    folders: prev.folders.map((f) => (f.id === fid ? { ...f, collapsed: !f.collapsed } : f)),
                  }
                : prev
            )
          }
          onReorderServers={(orderedIds) => {
            setState((prev) => {
              if (!prev) return prev;
              const map = new Map(prev.servers.map((s) => [s.id, s]));
              const next = orderedIds.map((id) => map.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
              return { ...prev, servers: next };
            });
            api.reorderServers(orderedIds).catch(() => {});
          }}
        />

        {activeView !== 'discovery' && activeView !== 'featureballs' && (
          <ChannelSidebar
            mode={activeView === 'home' ? 'home' : 'server'}
            server={activeServer}
            dms={state.dms}
            activeChannelId={
              activeView === 'home'
                ? activeHomeTab === 'dm'
                  ? activeChannelId
                  : null
                : serverTicketsOpen
                ? null
                : activeChannel?.id || null
            }
            activeTicketsView={activeView === 'server' && serverTicketsOpen}
            openTicketsCount={activeServerOpenTicketsCount}
            activeHomeTab={activeHomeTab}
            currentUser={currentUser}
            users={state.users}
            voiceParticipants={state.voiceParticipants}
            mutedChannelIds={state.mutedChannelIds}
            unreadChannelIds={state.unreadChannelIds}
            onSelectChannel={selectChannel}
            onSelectTicketDesk={selectTicketDesk}
            onOpenFeatureBalls={(opts) => {
              setFeatureBallTab(opts?.tab || 'quests');
              if (opts?.serverId) setFeatureBallServerId(opts.serverId);
              setActiveView('featureballs');
              setActiveThreadId(null);
              api
                .getQuests()
                .then((q) => setState((prev) => (prev ? { ...prev, featureBallQuests: q } : prev)))
                .catch(() => {});
            }}
            onSelectHomeTab={(t) => {
              setActiveView('home');
              setActiveHomeTab(t);
              setActiveThreadId(null);
            }}
            onSelectDm={selectDm}
            onOpenCreateDm={() => setCreateDmOpen(true)}
            onOpenCreateChannel={(catId) => setCreateChannelCatId(catId || '')}
            onOpenServerSettings={(t) => setServerSettingsTab(t || 'overview')}
            onOpenInviteFriends={(opts) =>
              setInviteModal({
                open: true,
                tab: opts?.tab || 'send',
                serverId: opts?.serverId,
              })
            }
            onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
            onOpenUserSettings={() => setUserSettingsOpen(true)}
            onLeaveServer={async () => {
              if (!activeServer) return;
              const res = await api.leaveServer(activeServer.id);
              showToast(res.deleted ? `Deleted ${activeServer.name}.` : `Left ${activeServer.name}.`);
              const remaining = state.servers.filter((s) => s.id !== activeServer.id);
              if (remaining[0]) selectServer(remaining[0].id);
              else setActiveView('home');
            }}
            onVoiceToggleMute={() => {
              if (!myVoice) {
                showToast('Join a voice channel to use microphone controls.');
                return;
              }
              api.updateVoice({ action: 'update', muted: !myVoice.muted }).catch(() => {});
            }}
            onVoiceToggleDeafen={() => {
              if (!myVoice) {
                showToast('Join a voice channel to use audio controls.');
                return;
              }
              api.updateVoice({ action: 'update', deafened: !myVoice.deafened }).catch(() => {});
            }}
            onVoiceLeave={() => {
              api.updateVoice({ action: 'leave' }).catch(() => {});
            }}
            onUpdatePresence={(status: PresenceStatus, customStatus?: User['customStatus']) => {
              socketRef.current?.setPresence(status, customStatus);
              api.updateMe({ status, customStatus }).catch(() => {});
            }}
          />
        )}
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/55" onClick={() => setMobileDrawerOpen(false)}>
          <div className="flex h-full" onClick={(e) => e.stopPropagation()}>
            <ServerRail
              servers={state.servers}
              folders={state.folders}
              activeView={activeView}
              activeServerId={activeServer?.id || null}
              unreadChannelIds={state.unreadChannelIds}
              pendingRequestCount={pendingReqCount}
              featureBallBalance={currentUser.featureBalls || 0}
              onSelectHome={() => {
                setActiveView('home');
                setActiveHomeTab('friends');
              }}
              onSelectServer={selectServer}
              onSelectDiscovery={() => {
                setActiveView('discovery');
                setMobileDrawerOpen(false);
              }}
              onSelectFeatureBalls={() => {
                setFeatureBallTab('quests');
                setActiveView('featureballs');
                setMobileDrawerOpen(false);
              }}
              onOpenCreateServer={() => {
                setMobileDrawerOpen(false);
                setCreateServerOpen(true);
              }}
              onToggleFolder={(fid) =>
                setState((prev) =>
                  prev
                    ? { ...prev, folders: prev.folders.map((f) => (f.id === fid ? { ...f, collapsed: !f.collapsed } : f)) }
                    : prev
                )
              }
              onReorderServers={() => {}}
            />
            {activeView !== 'discovery' && activeView !== 'featureballs' && (
              <ChannelSidebar
                mode={activeView === 'home' ? 'home' : 'server'}
                server={activeServer}
                dms={state.dms}
                activeChannelId={serverTicketsOpen ? null : activeChannel?.id || activeChannelId}
                activeTicketsView={activeView === 'server' && serverTicketsOpen}
                openTicketsCount={activeServerOpenTicketsCount}
                activeHomeTab={activeHomeTab}
                currentUser={currentUser}
                users={state.users}
                voiceParticipants={state.voiceParticipants}
                mutedChannelIds={state.mutedChannelIds}
                unreadChannelIds={state.unreadChannelIds}
                onSelectChannel={selectChannel}
                onSelectTicketDesk={selectTicketDesk}
                onOpenFeatureBalls={(opts) => {
                  setFeatureBallTab(opts?.tab || 'quests');
                  if (opts?.serverId) setFeatureBallServerId(opts.serverId);
                  setActiveView('featureballs');
                  setMobileDrawerOpen(false);
                }}
                onSelectHomeTab={(t) => {
                  setActiveView('home');
                  setActiveHomeTab(t);
                  setMobileDrawerOpen(false);
                }}
                onSelectDm={selectDm}
                onOpenCreateDm={() => {
                  setMobileDrawerOpen(false);
                  setCreateDmOpen(true);
                }}
                onOpenCreateChannel={(catId) => {
                  setMobileDrawerOpen(false);
                  setCreateChannelCatId(catId || '');
                }}
                onOpenServerSettings={(t) => {
                  setMobileDrawerOpen(false);
                  setServerSettingsTab(t || 'overview');
                }}
                onOpenInviteFriends={(opts) => {
                  setMobileDrawerOpen(false);
                  setInviteModal({
                    open: true,
                    tab: opts?.tab || 'send',
                    serverId: opts?.serverId,
                  });
                }}
                onOpenQuickSwitcher={() => {
                  setMobileDrawerOpen(false);
                  setQuickSwitcherOpen(true);
                }}
                onOpenUserSettings={() => {
                  setMobileDrawerOpen(false);
                  setUserSettingsOpen(true);
                }}
                onLeaveServer={async () => {
                  if (!activeServer) return;
                  await api.leaveServer(activeServer.id);
                  setMobileDrawerOpen(false);
                }}
                onVoiceToggleMute={() => myVoice && api.updateVoice({ action: 'update', muted: !myVoice.muted })}
                onVoiceToggleDeafen={() => myVoice && api.updateVoice({ action: 'update', deafened: !myVoice.deafened })}
                onVoiceLeave={() => api.updateVoice({ action: 'leave' })}
                onUpdatePresence={(status, customStatus) => {
                  socketRef.current?.setPresence(status, customStatus);
                  api.updateMe({ status, customStatus }).catch(() => {});
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Main Content Workspace + Right Pane */}
      <div className="flex flex-1 min-w-0 flex-col h-full">
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {activeView === 'featureballs' && state.featureBallQuests ? (
            <FeatureBallView
              currentUser={currentUser}
              users={state.users}
              servers={state.servers}
              questsState={state.featureBallQuests}
              initialTab={featureBallTab}
              initialServerId={featureBallServerId || activeServer?.id || null}
              onOpenMobileMenu={() => setMobileDrawerOpen(true)}
              onRefreshQuests={async () => {
                const q = await api.getQuests();
                setState((prev) => (prev ? { ...prev, featureBallQuests: q } : prev));
              }}
              onAcceptQuest={async (questId) => {
                const res = await api.acceptQuest(questId);
                setState((prev) => (prev ? { ...prev, featureBallQuests: res.quests } : prev));
                showToast('Quest accepted!');
              }}
              onCompleteQuest={async (questId) => {
                const res = await api.completeQuest(questId);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        featureBallQuests: res.quests,
                      }
                    : prev
                );
                showToast(`+${res.awarded} Feature Balls earned!`);
              }}
              onClaimAllReady={async (frequency) => {
                const res = await api.claimAllQuests(frequency);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        featureBallQuests: res.quests,
                      }
                    : prev
                );
                if (res.awarded > 0) showToast(`Claimed +${res.awarded} Feature Balls!`);
              }}
              onBuyOrbsShopItem={async (itemId) => {
                const res = await api.buyOrbsShopItem(itemId);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        featureBallQuests: res.quests,
                      }
                    : prev
                );
                showToast(`Unlocked "${res.item.name}" with Feature Balls!`);
              }}
              onEquipOrbsShopItem={async (slot, itemId) => {
                const res = await api.equipOrbsShopItem(slot, itemId);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                      }
                    : prev
                );
              }}
              onSaveAvatar={async (avatarUrl) => {
                const res = await api.updateMe({ avatarUrl });
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        featureBallQuests: res.quests || prev.featureBallQuests,
                      }
                    : prev
                );
                showToast(avatarUrl ? 'Profile image updated (Free · 0 FB)!' : 'Profile image removed (Free · 0 FB).');
              }}
              onSaveProfile={async (patch) => {
                const res = await api.updateMe(patch);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        featureBallQuests: res.quests || prev.featureBallQuests,
                      }
                    : prev
                );
                showToast('Profile customized! Spent 10 Feature Balls.');
              }}
              onBuyServerRank={async (serverId, rankId) => {
                const res = await api.buyServerRank(serverId, rankId);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        servers: prev.servers.map((s) => (s.id === res.server.id ? res.server : s)),
                        featureBallQuests: res.quests,
                      }
                    : prev
                );
                showToast(`Purchased cosmetic rank "${res.rank.name}"!`);
              }}
              onAddServerRank={async (serverId, payload) => {
                const res = await api.addServerRank(serverId, payload);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        servers: prev.servers.map((s) => (s.id === res.server.id ? res.server : s)),
                      }
                    : prev
                );
                showToast(`Added cosmetic rank "${payload.name}".`);
              }}
              onDeleteServerRank={async (serverId, rankId) => {
                const res = await api.deleteServerRank(serverId, rankId);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        servers: prev.servers.map((s) => (s.id === res.server.id ? res.server : s)),
                      }
                    : prev
                );
              }}
              onBoostServer={async (serverId) => {
                const res = await api.boostServer(serverId);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: { ...prev.users, [res.user.id]: res.user },
                        servers: prev.servers.map((s) => (s.id === res.server.id ? res.server : s)),
                        featureBallQuests: res.quests,
                      }
                    : prev
                );
                showToast(`Boosted ${res.server.name}! (-100 Feature Balls)`);
              }}
            />
          ) : activeView === 'discovery' ? (
            <DiscoveryView
              discoveryServers={state.discoveryServers}
              joinedServers={state.servers}
              onOpenMobileMenu={() => setMobileDrawerOpen(true)}
              onJoinDiscoveryServer={async (discId) => {
                const { server, snapshot } = await api.joinServer(discId);
                setState(snapshot);
                setActiveView('server');
                setActiveServerId(server.id);
                setActiveChannelId(server.channels[0]?.id || null);
                showToast(`Joined ${server.name}!`);
              }}
            />
          ) : activeView === 'home' && activeHomeTab !== 'dm' ? (
            <HomeView
              tab={activeHomeTab}
              friends={state.friends}
              dms={state.dms}
              users={state.users}
              currentUser={currentUser}
              onOpenMobileMenu={() => setMobileDrawerOpen(true)}
              onManageFriend={async (action, target) => {
                const { friends } = await api.manageFriend(action, target);
                setState((prev) => (prev ? { ...prev, friends } : prev));
              }}
              onOpenDmWithUser={async (uid) => {
                const { dm } = await api.createOrOpenDm([uid]);
                setState((prev) =>
                  prev ? { ...prev, dms: prev.dms.some((d) => d.id === dm.id) ? prev.dms : [dm, ...prev.dms] } : prev
                );
                selectDm(dm.id);
              }}
              onSelectDm={selectDm}
              onOpenCreateGroupDm={() => setCreateDmOpen(true)}
              onOpenInviteFriends={(tab = 'send') =>
                setInviteModal({ open: true, tab })
              }
            />
          ) : activeView === 'server' && activeServer && serverTicketsOpen ? (
            <TicketDeskView
              server={activeServer}
              currentUser={currentUser}
              users={state.users}
              tickets={state.tickets || []}
              messages={state.messages}
              onOpenMobileMenu={() => setMobileDrawerOpen(true)}
              onOpenConfigureRewards={() => setServerSettingsTab('tickets')}
              onOpenInviteFriends={() =>
                setInviteModal({ open: true, tab: 'send', serverId: activeServer.id })
              }
              onCreateTicket={async (payload) => {
                const { ticket, initialMessage } = await api.createTicket(activeServer.id, payload);
                setState((prev) => {
                  if (!prev) return prev;
                  const exists = (prev.tickets || []).some((t) => t.id === ticket.id);
                  return {
                    ...prev,
                    tickets: exists ? prev.tickets : [ticket, ...(prev.tickets || [])],
                    messages: {
                      ...prev.messages,
                      [ticket.id]: (prev.messages[ticket.id] || []).some((m) => m.id === initialMessage.id)
                        ? prev.messages[ticket.id]
                        : [...(prev.messages[ticket.id] || []), initialMessage],
                    },
                  };
                });
                showToast(`Created personal ticket #TKT-${ticket.ticketNumber}.`);
                return ticket;
              }}
              onSendTicketMessage={async (ticketId, content) => {
                await api.sendMessage(ticketId, { content });
              }}
              onUpdateTicket={async (ticketId, patch) => {
                const res = await api.updateTicket(ticketId, patch);
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        tickets: (prev.tickets || []).map((t) => (t.id === res.ticket.id ? res.ticket : t)),
                      }
                    : prev
                );
                if (patch.approveReward) {
                  showToast('Invite reward approved & logged.');
                }
              }}
            />
          ) : activeView === 'server' && activeServer && activeChannel?.type === 'forum' ? (
            <>
              <div className="flex flex-1 min-w-0 flex-col">
                <header className="flex h-13 shrink-0 items-center justify-between border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1D2029] px-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="font-display text-[15px] font-bold text-slate-950 dark:text-white truncate">
                      #{activeChannel.name}
                    </h1>
                    <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 truncate">
                      · {activeChannel.topic}
                    </span>
                  </div>
                </header>
                <ForumView
                  channel={activeChannel}
                  threads={state.threads}
                  messages={state.messages}
                  users={state.users}
                  onOpenThread={(tid) => setActiveThreadId(tid)}
                  onCreatePost={async ({ title, content, tags }) => {
                    const { thread } = await api.createThread({
                      serverId: activeServer.id,
                      channelId: activeChannel.id,
                      title,
                      isForumPost: true,
                      tags,
                      initialContent: content,
                    });
                    setActiveThreadId(thread.id);
                  }}
                />
              </div>
              {(activeThread || showMemberList) && (
                <div className={activeThread ? 'flex' : 'hidden xl:flex'}>
                  <MemberListAndThreads
                    server={activeServer}
                    users={state.users}
                    currentUser={currentUser}
                    activeThread={activeThread}
                    threadMessages={activeThread ? state.messages[activeThread.id] || [] : []}
                    selectedProfileUserId={selectedProfileUserId}
                    allServers={state.servers}
                    onCloseThread={() => setActiveThreadId(null)}
                    onSendThreadMessage={async (threadId, content) => {
                      await api.sendMessage(activeChannel.id, { content, threadId });
                    }}
                    onUpdateThread={async (threadId, patch) => {
                      await api.updateThread(threadId, patch);
                    }}
                    onSelectProfileUser={setSelectedProfileUserId}
                    onStartDm={async (uid) => {
                      const { dm } = await api.createOrOpenDm([uid]);
                      selectDm(dm.id);
                    }}
                    onModerateMember={async (targetUserId, action, opts) => {
                      await api.moderateMember(activeServer.id, { targetUserId, action, ...opts });
                      showToast(`Moderation action (${action}) recorded in Audit Log.`);
                    }}
                  />
                </div>
              )}
            </>
          ) : activeView === 'server' &&
            activeServer &&
            (activeChannel?.type === 'voice' || activeChannel?.type === 'stage') ? (
            <VoiceStageView
              server={activeServer}
              channel={activeChannel}
              currentUser={currentUser}
              users={state.users}
              participants={state.voiceParticipants}
              messages={state.messages[activeChannel.id] || []}
              whiteboardStrokes={state.whiteboardStrokes[activeChannel.id] || []}
              recentSoundEvent={recentSoundEvent}
              onJoinVoice={(chId) => api.updateVoice({ action: 'join', channelId: chId })}
              onLeaveVoice={() => api.updateVoice({ action: 'leave' })}
              onUpdateVoice={(patch) => api.updateVoice({ action: 'update', ...patch })}
              onRaiseHand={() => api.updateVoice({ action: 'raise_hand' })}
              onSetStageRole={(targetUserId, stageRole) =>
                api.updateVoice({ action: 'set_stage_role', targetUserId, stageRole })
              }
              onPlaySoundboard={(soundId, label) => {
                socketRef.current?.playSoundboard(activeChannel.id, soundId, label);
              }}
              onSendWhiteboardStroke={(stroke: WhiteboardStroke) => {
                socketRef.current?.sendWhiteboardStroke(stroke);
              }}
              onClearWhiteboard={() => {
                socketRef.current?.clearWhiteboard(activeChannel.id);
              }}
              onSendChatMessage={async (content) => {
                await api.sendMessage(activeChannel.id, { content });
              }}
            />
          ) : (
            <>
              <ChatView
                server={activeView === 'server' ? activeServer : null}
                channel={activeView === 'server' ? activeChannel : null}
                dm={activeDm}
                messages={currentMessages}
                threads={state.threads}
                users={state.users}
                currentUser={currentUser}
                typingUserIds={typingUserIds}
                isMuted={state.mutedChannelIds.includes(currentChannelId)}
                showMemberList={showMemberList}
                inbox={state.inbox}
                onToggleMute={async () => {
                  if (!currentChannelId) return;
                  const { mutedChannelIds } = await api.toggleMuteChannel(currentChannelId);
                  setState((prev) => (prev ? { ...prev, mutedChannelIds } : prev));
                }}
                onToggleMemberList={() => setShowMemberList((v) => !v)}
                onOpenMobileMenu={() => setMobileDrawerOpen(true)}
                onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
                onMarkInboxRead={() => {
                  api.markInboxRead().catch(() => {});
                  setState((prev) =>
                    prev ? { ...prev, inbox: prev.inbox.map((i) => ({ ...i, read: true })) } : prev
                  );
                }}
                onSelectChannel={(srvId, chId) => {
                  if (srvId) {
                    setActiveView('server');
                    setActiveServerId(srvId);
                    setActiveChannelId(chId);
                  } else {
                    selectDm(chId);
                  }
                }}
                onSelectUserCard={(uid) => setSelectedProfileUserId(uid)}
                onSendMessage={async (payload) => {
                  if (!currentChannelId) return;
                  await api.sendMessage(currentChannelId, payload);
                }}
                onEditMessage={async (msgId, content) => {
                  if (!currentChannelId) return;
                  await api.editMessage(currentChannelId, msgId, content);
                }}
                onDeleteMessage={async (msgId) => {
                  if (!currentChannelId) return;
                  await api.deleteMessage(currentChannelId, msgId);
                }}
                onToggleReaction={async (msgId, emoji) => {
                  if (!currentChannelId) return;
                  await api.toggleReaction(currentChannelId, msgId, emoji);
                }}
                onTogglePin={async (msgId) => {
                  if (!currentChannelId) return;
                  try {
                    await api.togglePin(currentChannelId, msgId);
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Unable to pin message.');
                  }
                }}
                onVotePoll={async (msgId, optionId) => {
                  if (!currentChannelId) return;
                  await api.votePoll(currentChannelId, msgId, optionId);
                }}
                onOpenThread={(tid) => setActiveThreadId(tid)}
                onStartThreadFromMessage={async (msg: Message) => {
                  if (!activeServer || !activeChannel) return;
                  const title = (msg.content || 'Discussion Thread').slice(0, 52);
                  const { thread } = await api.createThread({
                    serverId: activeServer.id,
                    channelId: activeChannel.id,
                    title,
                    parentMessageId: msg.id,
                  });
                  setActiveThreadId(thread.id);
                }}
                onForwardMessage={async (msg: Message, targetChannelId: string) => {
                  const authorName = state.users[msg.authorId]?.displayName || 'Member';
                  await api.sendMessage(targetChannelId, {
                    content: msg.content,
                    forwardedFrom: {
                      channelName: activeChannel?.name || 'direct-message',
                      authorName,
                    },
                  });
                  showToast('Message forwarded.');
                }}
                onCreateCustomInvite={
                  activeView === 'server' && activeServer
                    ? async (expiresInMinutes) => {
                        const res = await api.createCustomServerInvite(activeServer.id, expiresInMinutes);
                        setState((prev) =>
                          prev
                            ? {
                                ...prev,
                                servers: prev.servers.map((s) => (s.id === res.server.id ? res.server : s)),
                              }
                            : prev
                        );
                        showToast(
                          res.invite.expiresAt
                            ? `Created custom invite link ${res.invite.code}.`
                            : `Created custom invite link ${res.invite.code} (Never expires).`
                        );
                        return { code: res.invite.code, expiresAt: res.invite.expiresAt };
                      }
                    : undefined
                }
                onTypingChange={(isTyping) => {
                  if (currentChannelId) socketRef.current?.sendTyping(currentChannelId, isTyping);
                }}
              />

              {activeView === 'server' && activeServer && (activeThread || showMemberList) && (
                <div className={activeThread ? 'flex' : 'hidden xl:flex'}>
                  <MemberListAndThreads
                    server={activeServer}
                    users={state.users}
                    currentUser={currentUser}
                    activeThread={activeThread}
                    threadMessages={activeThread ? state.messages[activeThread.id] || [] : []}
                    selectedProfileUserId={selectedProfileUserId}
                    allServers={state.servers}
                    onCloseThread={() => setActiveThreadId(null)}
                    onSendThreadMessage={async (threadId, content) => {
                      if (!activeChannel) return;
                      await api.sendMessage(activeChannel.id, { content, threadId });
                    }}
                    onUpdateThread={async (threadId, patch) => {
                      await api.updateThread(threadId, patch);
                    }}
                    onSelectProfileUser={setSelectedProfileUserId}
                    onStartDm={async (uid) => {
                      const { dm } = await api.createOrOpenDm([uid]);
                      setState((prev) =>
                        prev ? { ...prev, dms: prev.dms.some((d) => d.id === dm.id) ? prev.dms : [dm, ...prev.dms] } : prev
                      );
                      selectDm(dm.id);
                    }}
                    onModerateMember={async (targetUserId, action, opts) => {
                      try {
                        await api.moderateMember(activeServer.id, { targetUserId, action, ...opts });
                        showToast(`Moderation action (${action}) applied & logged.`);
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : 'Missing permission.');
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Compact Mobile Bottom Tab Bar (under 10% viewport height) */}
        <nav
          aria-label="Mobile Navigation"
          className="flex md:hidden h-12 shrink-0 items-center justify-around border-t border-slate-200 dark:border-white/[0.08] bg-[#F3F4F6] dark:bg-[#13161C] px-2"
        >
          <button
            type="button"
            onClick={() => {
              setActiveView('home');
              setActiveHomeTab('friends');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              activeView === 'home' ? 'text-[var(--accent)]' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Home className="h-4 w-4" />
            <span>Home</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              activeView === 'server' ? 'text-[var(--accent)]' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Servers</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFeatureBallTab('quests');
              setActiveView('featureballs');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              activeView === 'featureballs' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Quests</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('discovery')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              activeView === 'discovery' ? 'text-[var(--accent)]' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Explore</span>
          </button>
          <button
            type="button"
            onClick={() => setUserSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            <Settings className="h-4 w-4" />
            <span>Profile</span>
          </button>
        </nav>
      </div>

      {/* Modals */}
      {quickSwitcherOpen && (
        <QuickSwitcherModal
          servers={state.servers}
          dms={state.dms}
          users={state.users}
          currentUserId={currentUser.id}
          onSelectChannel={(srvId, chId) => {
            setActiveView('server');
            setActiveServerId(srvId);
            setActiveChannelId(chId);
            setActiveThreadId(null);
            clearUnread(chId);
          }}
          onSelectDm={selectDm}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

      {createServerOpen && (
        <CreateServerModal
          onCreateServer={async (payload) => {
            const { server, snapshot } = await api.createServer(payload);
            setState(snapshot);
            setActiveView('server');
            setActiveServerId(server.id);
            setActiveChannelId(server.botCmdChannelId || server.channels[0]?.id || null);
            showToast(
              `Created "${server.name}" with #${server.botCmdConfig?.channelName || 'bot-cmd'} ready.`
            );
          }}
          onJoinInvite={async (code) => {
            const { server, snapshot } = await api.joinServer(code);
            setState(snapshot);
            setActiveView('server');
            setActiveServerId(server.id);
            setActiveChannelId(server.channels[0]?.id || null);
            showToast(`Joined "${server.name}".`);
          }}
          onClose={() => setCreateServerOpen(false)}
        />
      )}

      {createChannelCatId !== undefined && activeServer && (
        <CreateChannelModal
          server={activeServer}
          defaultCategoryId={createChannelCatId || undefined}
          onCreateChannel={async (payload) => {
            const { channel } = await api.createChannel(activeServer.id, payload);
            setActiveChannelId(channel.id);
            showToast(`Created channel #${channel.name}.`);
          }}
          onClose={() => setCreateChannelCatId(undefined)}
        />
      )}

      {createDmOpen && (
        <CreateGroupDmModal
          users={state.users}
          currentUserId={currentUser.id}
          onCreateDm={async (participantIds, name) => {
            const { dm } = await api.createOrOpenDm(participantIds, name);
            setState((prev) =>
              prev ? { ...prev, dms: prev.dms.some((d) => d.id === dm.id) ? prev.dms : [dm, ...prev.dms] } : prev
            );
            selectDm(dm.id);
          }}
          onClose={() => setCreateDmOpen(false)}
        />
      )}

      {serverSettingsTab && activeServer && (
        <ServerSettingsModal
          server={activeServer}
          initialTab={serverSettingsTab}
          users={state.users}
          currentUser={currentUser}
          messages={state.messages}
          botDirectory={state.botDirectory}
          onClose={() => setServerSettingsTab(null)}
          onUpdateServer={async (patch) => {
            await api.updateServerSettings(activeServer.id, patch);
          }}
        />
      )}

      {userSettingsOpen && (
        <UserSettingsModal
          currentUser={currentUser}
          sessions={state.sessions}
          onClose={() => setUserSettingsOpen(false)}
          onSignOut={handleSignOut}
          onOpenFeatureBallProfile={() => {
            setFeatureBallTab('profile');
            setActiveView('featureballs');
          }}
          onUpdateProfile={async (patch) => {
            const res = await api.updateMe(patch);
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    users: { ...prev.users, [res.user.id]: res.user },
                    featureBallQuests: res.quests || prev.featureBallQuests,
                  }
                : prev
            );
          }}
          onRevokeSession={async (sessionId) => {
            const { snapshot } = await api.revokeSession(sessionId);
            setState(snapshot);
            showToast('Remote session signed out.');
          }}
          onExportData={async () => {
            const data = await api.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `livechatter-export-${currentUser.username}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Account data package downloaded.');
          }}
          onRegisterAccount={async (payload) => {
            const { token, snapshot } = await api.register(payload);
            setAuthToken(token);
            setState(snapshot);
            socketRef.current?.authenticate(token);
            setActiveView('home');
            setActiveHomeTab('friends');
            setServerTicketsOpen(false);
            showToast(`Welcome to LiveChatter, ${payload.displayName || payload.username}! LiveChatter Help Bot is ready in your Friends list.`);
          }}
          onLoginAccount={async (identifier, password, captchaId, captchaAnswer) => {
            const { token, snapshot } = await api.login(identifier, password, captchaId, captchaAnswer);
            setAuthToken(token);
            setState(snapshot);
            socketRef.current?.authenticate(token);
            showToast('Signed in.');
          }}
        />
      )}

      {inviteModal.open && (
        <InviteFriendsModal
          currentUser={currentUser}
          servers={state.servers}
          friendInvites={state.friendInvites || []}
          initialTab={inviteModal.tab}
          initialServerId={inviteModal.serverId}
          initialRedeemCode={inviteModal.redeemCode}
          onCreateInvite={async (payload) => {
            const { invite, snapshot } = await api.createFriendInvite(payload);
            setState(snapshot);
            return invite;
          }}
          onRevokeInvite={async (code) => {
            const { friendInvites } = await api.revokeFriendInvite(code);
            setState((prev) => (prev ? { ...prev, friendInvites } : prev));
            showToast(`Revoked invite code ${code}.`);
          }}
          onTrackShare={async (code, channel) => {
            const { friendInvites } = await api.trackFriendInviteShare(code, channel);
            setState((prev) => (prev ? { ...prev, friendInvites } : prev));
          }}
          onRedeemInvite={async (code) => {
            const res = await api.redeemFriendInvite(code);
            setState(res.snapshot);
            if (res.kind === 'friend' && res.dm) {
              selectDm(res.dm.id);
              showToast(
                res.server
                  ? `Connected with ${res.friend?.displayName} and joined ${res.server.name}!`
                  : `Connected with ${res.friend?.displayName}!`
              );
            } else if (res.server) {
              setActiveView('server');
              setActiveServerId(res.server.id);
              setActiveChannelId(res.server.channels[0]?.id || null);
              showToast(`Joined ${res.server.name}!`);
            }
            return {
              kind: res.kind,
              friendName: res.friend?.displayName,
              serverName: res.server?.name,
            };
          }}
          onClose={() => setInviteModal((prev) => ({ ...prev, open: false, redeemCode: undefined }))}
        />
      )}

      {/* Subtle Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 md:bottom-5 right-5 z-50 rounded-xl border border-slate-200 dark:border-white/12 bg-slate-900 dark:bg-[#232733] px-4 py-2.5 text-xs font-medium text-white shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
