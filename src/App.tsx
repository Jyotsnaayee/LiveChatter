import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Home, MessageSquare, Settings } from 'lucide-react';
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
import {
  CreateChannelModal,
  CreateGroupDmModal,
  CreateServerModal,
  QuickSwitcherModal,
} from './components/ActionModals';

export default function App() {
  const [state, setState] = useState<AppStateSnapshot | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Navigation state
  const [activeView, setActiveView] = useState<'home' | 'server' | 'discovery'>('server');
  const [activeServerId, setActiveServerId] = useState<string | null>('srv-kernel');
  const [activeChannelId, setActiveChannelId] = useState<string | null>('ch-k-general');
  const [activeHomeTab, setActiveHomeTab] = useState<'friends' | 'requests' | 'dm'>('friends');
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

  // Bootstrap initial session + WebSocket connection
  useEffect(() => {
    let mounted = true;
    const socket = new LiveChatterSocket(handleWsEvent);
    socketRef.current = socket;

    api
      .demoLogin('user-alex')
      .then(({ token, snapshot }) => {
        if (!mounted) return;
        setAuthToken(token);
        setState(snapshot);
        socket.connect();
        // Auto-open Redeem modal if user arrived from a WhatsApp / Gmail / Messages ?invite= link
        const params = new URLSearchParams(window.location.search);
        const urlInvite = params.get('invite');
        if (urlInvite && urlInvite.trim()) {
          setInviteModal({
            open: true,
            tab: 'redeem',
            redeemCode: urlInvite.trim(),
          });
          params.delete('invite');
          const cleanSearch = params.toString();
          const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
          window.history.replaceState({}, '', cleanUrl);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setBootError(err instanceof Error ? err.message : 'Unable to connect to LiveChatter server.');
      });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [handleWsEvent]);

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

  if (bootError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111318] p-6 text-slate-200">
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#1D2029] p-6 space-y-3 text-center">
          <h1 className="font-display text-lg font-bold text-white">Connection Error</h1>
          <p className="text-sm text-slate-400">{bootError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!state || !currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3F4F6] dark:bg-[#111318]">
        <div className="space-y-2 text-center">
          <p className="font-display text-lg font-bold text-slate-900 dark:text-white">LiveChatter</p>
          <p className="text-xs text-slate-500">Connecting to real-time gateway...</p>
        </div>
      </div>
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
    setActiveThreadId(null);
    clearUnread(channelId);
    setMobileDrawerOpen(false);
  };

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

        {activeView !== 'discovery' && (
          <ChannelSidebar
            mode={activeView === 'home' ? 'home' : 'server'}
            server={activeServer}
            dms={state.dms}
            activeChannelId={activeView === 'home' ? (activeHomeTab === 'dm' ? activeChannelId : null) : activeChannel?.id || null}
            activeHomeTab={activeHomeTab}
            currentUser={currentUser}
            users={state.users}
            voiceParticipants={state.voiceParticipants}
            mutedChannelIds={state.mutedChannelIds}
            unreadChannelIds={state.unreadChannelIds}
            onSelectChannel={selectChannel}
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
              onSelectHome={() => {
                setActiveView('home');
                setActiveHomeTab('friends');
              }}
              onSelectServer={selectServer}
              onSelectDiscovery={() => {
                setActiveView('discovery');
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
            {activeView !== 'discovery' && (
              <ChannelSidebar
                mode={activeView === 'home' ? 'home' : 'server'}
                server={activeServer}
                dms={state.dms}
                activeChannelId={activeChannel?.id || activeChannelId}
                activeHomeTab={activeHomeTab}
                currentUser={currentUser}
                users={state.users}
                voiceParticipants={state.voiceParticipants}
                mutedChannelIds={state.mutedChannelIds}
                unreadChannelIds={state.unreadChannelIds}
                onSelectChannel={selectChannel}
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
          {activeView === 'discovery' ? (
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
            onClick={() => setActiveView('discovery')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              activeView === 'discovery' ? 'text-[var(--accent)]' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Explore</span>
          </button>
          <button
            type="button"
            onClick={() => setUserSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
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
            setActiveChannelId(server.channels[0]?.id || null);
            showToast(`Created server "${server.name}".`);
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
          allUsers={state.users}
          sessions={state.sessions}
          onClose={() => setUserSettingsOpen(false)}
          onUpdateProfile={async (patch) => {
            await api.updateMe(patch);
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
          onSwitchDemoAccount={async (uid) => {
            const { token, snapshot } = await api.demoLogin(uid);
            setAuthToken(token);
            setState(snapshot);
            socketRef.current?.authenticate(token);
            showToast(`Switched account to ${snapshot.users[uid]?.displayName}.`);
          }}
          onRegisterAccount={async (payload) => {
            const { token, snapshot } = await api.register(payload);
            setAuthToken(token);
            setState(snapshot);
            socketRef.current?.authenticate(token);
            showToast(`Welcome to LiveChatter, ${payload.displayName || payload.username}!`);
          }}
          onLoginAccount={async (identifier, password) => {
            const { token, snapshot } = await api.login(identifier, password);
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
