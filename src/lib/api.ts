import type {
  AppStateSnapshot,
  Channel,
  ChannelType,
  DirectMessageThread,
  FriendInviteCode,
  FriendRelation,
  Message,
  MessageAttachment,
  PollData,
  PresenceStatus,
  Server,
  Thread,
  User,
  UserSettings,
  VoiceClip,
  VoiceParticipant,
  WhiteboardStroke,
  WsServerEvent,
} from '../shared/types';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  demoLogin(userId = 'user-alex') {
    return request<{ token: string; user: User; snapshot: AppStateSnapshot }>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
  register(payload: { email: string; username: string; displayName: string; password: string; dateOfBirth: string }) {
    return request<{ token: string; user: User; snapshot: AppStateSnapshot }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  login(identifier: string, password: string) {
    return request<{ token: string; user: User; snapshot: AppStateSnapshot }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },
  revokeSession(sessionId: string) {
    return request<{ snapshot: AppStateSnapshot }>('/api/auth/revoke-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },
  bootstrap() {
    return request<AppStateSnapshot>('/api/bootstrap');
  },
  updateMe(
    patch: Partial<Pick<User, 'displayName' | 'bio' | 'pronouns' | 'status' | 'customStatus' | 'bannerColor' | 'avatarColor'>> & {
      settings?: Partial<UserSettings>;
    }
  ) {
    return request<{ user: User }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  exportData() {
    return request<Record<string, unknown>>('/api/users/me/export');
  },
  markInboxRead() {
    return request<{ ok: boolean }>('/api/inbox/read', { method: 'POST' });
  },
  toggleMuteChannel(channelId: string) {
    return request<{ mutedChannelIds: string[] }>(`/api/channels/${encodeURIComponent(channelId)}/mute`, {
      method: 'POST',
    });
  },
  createServer(payload: {
    name: string;
    template: 'blank' | 'opensource' | 'study' | 'gaming' | 'creators' | 'friends';
    description?: string;
    iconColor?: string;
  }) {
    return request<{ server: Server; snapshot: AppStateSnapshot }>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  joinServer(code: string) {
    return request<{ server: Server; snapshot: AppStateSnapshot }>('/api/servers/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
  reorderServers(orderedIds: string[]) {
    return request<{ ok: boolean }>('/api/servers/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds }),
    });
  },
  createChannel(
    serverId: string,
    payload: { name: string; type: ChannelType; categoryId?: string; topic?: string; isPrivate?: boolean; slowmodeSeconds?: number }
  ) {
    return request<{ server: Server; channel: Channel }>(`/api/servers/${encodeURIComponent(serverId)}/channels`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateServerSettings(serverId: string, patch: Record<string, unknown>) {
    return request<{ server: Server }>(`/api/servers/${encodeURIComponent(serverId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  moderateMember(
    serverId: string,
    payload: { targetUserId: string; action: 'timeout' | 'kick' | 'ban' | 'toggle_role'; reason?: string; durationMinutes?: number; roleId?: string }
  ) {
    return request<{ server: Server }>(`/api/servers/${encodeURIComponent(serverId)}/moderate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  leaveServer(serverId: string) {
    return request<{ ok: boolean; deleted: boolean }>(`/api/servers/${encodeURIComponent(serverId)}/leave`, {
      method: 'POST',
    });
  },
  sendMessage(
    channelId: string,
    payload: {
      content: string;
      threadId?: string;
      replyToId?: string;
      silent?: boolean;
      attachments?: MessageAttachment[];
      poll?: PollData;
      voiceClip?: VoiceClip;
      forwardedFrom?: { channelName: string; authorName: string };
    }
  ) {
    return request<{ messages: Message[] }>(`/api/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  editMessage(channelId: string, messageId: string, content: string, threadId?: string) {
    return request<{ message: Message }>(
      `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content, threadId }),
      }
    );
  },
  deleteMessage(channelId: string, messageId: string, threadId?: string) {
    const q = threadId ? `?threadId=${encodeURIComponent(threadId)}` : '';
    return request<{ ok: boolean }>(
      `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}${q}`,
      { method: 'DELETE' }
    );
  },
  toggleReaction(channelId: string, messageId: string, emoji: string, threadId?: string) {
    return request<{ message: Message }>(
      `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/react`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji, threadId }),
      }
    );
  },
  togglePin(channelId: string, messageId: string, threadId?: string) {
    return request<{ message: Message }>(
      `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
      {
        method: 'POST',
        body: JSON.stringify({ threadId }),
      }
    );
  },
  votePoll(channelId: string, messageId: string, optionId: string, threadId?: string) {
    return request<{ message: Message }>(
      `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({ optionId, threadId }),
      }
    );
  },
  createThread(payload: {
    serverId: string;
    channelId: string;
    title: string;
    parentMessageId?: string;
    isPrivate?: boolean;
    autoArchiveMinutes?: 60 | 1440 | 4320 | 10080;
    isForumPost?: boolean;
    tags?: string[];
    initialContent?: string;
  }) {
    return request<{ thread: Thread; initialMessage?: Message }>('/api/threads', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateThread(
    threadId: string,
    patch: { toggleFollow?: boolean; archived?: boolean; autoArchiveMinutes?: Thread['autoArchiveMinutes'] }
  ) {
    return request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  createOrOpenDm(participantIds: string[], name?: string) {
    return request<{ dm: DirectMessageThread }>('/api/dms', {
      method: 'POST',
      body: JSON.stringify({ participantIds, name }),
    });
  },
  manageFriend(action: 'add' | 'accept' | 'decline' | 'remove' | 'block', target: string) {
    return request<{ friends: FriendRelation[] }>('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ action, target }),
    });
  },
  createFriendInvite(payload: { serverId?: string; maxUses?: number; expiresInHours?: number; note?: string }) {
    return request<{ invite: FriendInviteCode; snapshot: AppStateSnapshot }>('/api/friend-invites', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  revokeFriendInvite(code: string) {
    return request<{ friendInvites: FriendInviteCode[] }>(`/api/friend-invites/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
  },
  trackFriendInviteShare(code: string, channel: 'whatsapp' | 'gmail' | 'messages' | 'copy' | 'native') {
    return request<{ invite: FriendInviteCode | null; friendInvites: FriendInviteCode[] }>(
      `/api/friend-invites/${encodeURIComponent(code)}/share`,
      {
        method: 'POST',
        body: JSON.stringify({ channel }),
      }
    );
  },
  redeemFriendInvite(code: string) {
    return request<{
      kind: 'friend' | 'server';
      friend?: User;
      dm?: DirectMessageThread;
      server?: Server;
      snapshot: AppStateSnapshot;
    }>('/api/friend-invites/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
  updateVoice(payload: {
    action: 'join' | 'leave' | 'update' | 'raise_hand' | 'set_stage_role';
    channelId?: string;
    targetUserId?: string;
    muted?: boolean;
    deafened?: boolean;
    videoOn?: boolean;
    screenSharing?: boolean;
    speaking?: boolean;
    stageRole?: 'speaker' | 'audience';
  }) {
    return request<{ participants: VoiceParticipant[] }>('/api/voice', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export class LiveChatterSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private onEvent: (event: WsServerEvent) => void;
  private onStatus?: (connected: boolean) => void;

  constructor(onEvent: (event: WsServerEvent) => void, onStatus?: (connected: boolean) => void) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
  }

  public connect() {
    if (this.closed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.onStatus?.(true);
      if (authToken) {
        ws.send(JSON.stringify({ type: 'auth', token: authToken }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as WsServerEvent;
        this.onEvent(parsed);
      } catch {
        // Ignore invalid frames
      }
    };

    ws.onclose = () => {
      this.onStatus?.(false);
      if (!this.closed) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    ws.onerror = () => {};
  }

  public authenticate(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'auth', token }));
    }
  }

  public sendTyping(channelId: string, isTyping: boolean) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'typing', channelId, isTyping }));
    }
  }

  public playSoundboard(channelId: string, soundId: string, label: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'soundboard:play', channelId, soundId, label }));
    }
  }

  public sendWhiteboardStroke(stroke: WhiteboardStroke) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'whiteboard:stroke', stroke }));
    }
  }

  public clearWhiteboard(channelId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'whiteboard:clear', channelId }));
    }
  }

  public setPresence(status: PresenceStatus, customStatus?: User['customStatus']) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'presence:set', status, customStatus }));
    }
  }

  public disconnect() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
