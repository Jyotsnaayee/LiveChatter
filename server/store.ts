import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActiveSession,
  AppStateSnapshot,
  AutoModRule,
  Channel,
  ChannelType,
  DirectMessageThread,
  FriendInviteCode,
  FriendRelation,
  InboxItem,
  Message,
  MessageAttachment,
  PermissionKey,
  PollData,
  PresenceStatus,
  Role,
  ScheduledEvent,
  Server,
  ServerFolder,
  Thread,
  User,
  UserSettings,
  VoiceClip,
  VoiceParticipant,
  WhiteboardStroke,
} from '../src/shared/types.ts';
import { createInitialSeedData, DEFAULT_USER_SETTINGS } from './seed.ts';

interface AuthRecord {
  userId: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  dateOfBirth: string;
}

interface SessionTokenRecord {
  token: string;
  userId: string;
  sessionId: string;
  createdAt: string;
}

export class LiveChatterStore {
  private users: Record<string, User>;
  private servers: Server[];
  private folders: ServerFolder[];
  private discoveryServers: ReturnType<typeof createInitialSeedData>['discoveryServers'];
  private messages: Record<string, Message[]>;
  private threads: Thread[];
  private dms: DirectMessageThread[];
  private friendsByUser: Record<string, FriendRelation[]>;
  private friendInvites: FriendInviteCode[];
  private voiceParticipants: VoiceParticipant[];
  private whiteboardStrokes: Record<string, WhiteboardStroke[]>;
  private botDirectory: ReturnType<typeof createInitialSeedData>['botDirectory'];
  private inboxByUser: Record<string, InboxItem[]>;
  private sessionsByUser: Record<string, ActiveSession[]>;
  private mutedByUser: Record<string, string[]>;
  private unreadByUser: Record<string, string[]>;
  private authRecords: Record<string, AuthRecord> = {};
  private tokens = new Map<string, SessionTokenRecord>();
  private dataFilePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const baseDir = path.resolve(process.cwd(), 'data');
    const candidate = path.resolve(baseDir, 'livechatter-state.json');
    if (!candidate.startsWith(baseDir + path.sep)) {
      throw new Error('Invalid persistence path');
    }
    this.dataFilePath = candidate;

    const seed = createInitialSeedData();
    this.users = seed.users;
    this.servers = seed.servers;
    this.folders = seed.folders;
    this.discoveryServers = seed.discoveryServers;
    this.messages = seed.messages;
    this.threads = seed.threads;
    this.dms = seed.dms;
    this.friendsByUser = { 'user-alex': seed.friends };
    this.friendInvites = [
      {
        code: 'LC-ALEX-7429',
        creatorId: 'user-alex',
        note: 'Add me on LiveChatter so we can chat and hop into voice rooms.',
        uses: 2,
        maxUses: 25,
        createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        sharedChannels: ['whatsapp', 'messages'],
      },
      {
        code: 'LC-MARC-3184',
        creatorId: 'user-marcus',
        serverId: 'srv-kernel',
        serverName: 'Kernel Commons',
        note: 'Join me in Kernel Commons on LiveChatter!',
        uses: 1,
        maxUses: 20,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        sharedChannels: ['gmail'],
      },
      {
        code: 'LC-SORA-9051',
        creatorId: 'user-sora',
        note: 'Connect with Sora on LiveChatter.',
        uses: 0,
        maxUses: 15,
        createdAt: new Date(Date.now() - 43_200_000).toISOString(),
        sharedChannels: ['whatsapp'],
      },
      {
        code: 'LC-LIAM-5520',
        creatorId: 'user-liam',
        serverId: 'srv-gaming',
        serverName: 'Apex Vanguard',
        note: 'Squad up with me in Apex Vanguard on LiveChatter!',
        uses: 0,
        maxUses: 10,
        createdAt: new Date(Date.now() - 21_600_000).toISOString(),
        sharedChannels: ['messages'],
      },
    ];
    this.voiceParticipants = seed.voiceParticipants;
    this.whiteboardStrokes = seed.whiteboardStrokes;
    this.botDirectory = seed.botDirectory;
    this.inboxByUser = { 'user-alex': seed.inbox };
    this.sessionsByUser = { 'user-alex': seed.sessions };
    this.mutedByUser = { 'user-alex': seed.mutedChannelIds };
    this.unreadByUser = { 'user-alex': seed.unreadChannelIds };

    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.dataFilePath)) return;
      const raw = fs.readFileSync(this.dataFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.users && parsed.servers && parsed.messages) {
        this.users = parsed.users;
        this.servers = parsed.servers;
        this.folders = parsed.folders || this.folders;
        this.messages = parsed.messages;
        this.threads = parsed.threads || this.threads;
        this.dms = parsed.dms || this.dms;
        this.friendsByUser = parsed.friendsByUser || this.friendsByUser;
        if (Array.isArray(parsed.friendInvites) && parsed.friendInvites.length > 0) {
          this.friendInvites = parsed.friendInvites;
        }
        this.inboxByUser = parsed.inboxByUser || this.inboxByUser;
        this.mutedByUser = parsed.mutedByUser || this.mutedByUser;
        this.authRecords = parsed.authRecords || {};
      }
    } catch {
      // Fall back cleanly to initial seed data if persistence file is corrupted
    }
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const dir = path.dirname(this.dataFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          this.dataFilePath,
          JSON.stringify(
            {
              users: this.users,
              servers: this.servers,
              folders: this.folders,
              messages: this.messages,
              threads: this.threads,
              dms: this.dms,
              friendsByUser: this.friendsByUser,
              friendInvites: this.friendInvites,
              inboxByUser: this.inboxByUser,
              mutedByUser: this.mutedByUser,
              authRecords: this.authRecords,
            },
            null,
            2
          ),
          'utf8'
        );
      } catch {
        // Ignore non-critical disk write failures
      }
    }, 300);
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  public issueSession(userId: string, device = 'Web Browser'): { token: string; user: User } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found');
    const token = crypto.randomBytes(32).toString('hex');
    const sessionId = `sess-${crypto.randomBytes(6).toString('hex')}`;
    this.tokens.set(token, {
      token,
      userId,
      sessionId,
      createdAt: new Date().toISOString(),
    });
    const list = this.sessionsByUser[userId] || [];
    const nextList: ActiveSession[] = [
      {
        id: sessionId,
        device,
        platform: 'Web',
        location: 'Current Session',
        lastActive: 'Active now',
        current: true,
      },
      ...list.filter((s) => s.id !== sessionId).map((s) => ({ ...s, current: false })),
    ].slice(0, 6);
    this.sessionsByUser[userId] = nextList;
    return { token, user };
  }

  public verifyToken(token: string | undefined): SessionTokenRecord | null {
    if (!token) return null;
    return this.tokens.get(token) || null;
  }

  public revokeSession(userId: string, sessionId: string) {
    for (const [tok, rec] of this.tokens.entries()) {
      if (rec.userId === userId && rec.sessionId === sessionId) {
        this.tokens.delete(tok);
      }
    }
    this.sessionsByUser[userId] = (this.sessionsByUser[userId] || []).filter((s) => s.id !== sessionId);
  }

  public registerUser(input: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    dateOfBirth: string;
  }): { token: string; user: User } {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!email.includes('@') || username.length < 2 || input.password.length < 8) {
      throw new Error('Provide a valid email, username (2+ chars), and password (8+ chars).');
    }

    const dob = new Date(input.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      throw new Error('Please enter a valid date of birth.');
    }
    const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 13) {
      throw new Error('You must be at least 13 years old to create a LiveChatter account.');
    }

    if (Object.values(this.users).some((u) => u.username.toLowerCase() === username)) {
      throw new Error('That username is already taken.');
    }
    if (this.authRecords[email]) {
      throw new Error('An account with that email already exists.');
    }

    const userId = `user-${crypto.randomBytes(5).toString('hex')}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(input.password, salt);
    const palette = ['#2563EB', '#059669', '#D97706', '#0D9488', '#E11D48', '#4F46E5'];
    const color = palette[Math.floor(Math.random() * palette.length)];

    const newUser: User = {
      id: userId,
      username,
      displayName: input.displayName.trim() || username,
      email,
      avatarColor: color,
      bannerColor: '#1E293B',
      bio: 'New member on LiveChatter.',
      pronouns: '',
      status: 'online',
      connectedAccounts: [],
      createdAt: new Date().toISOString(),
      settings: {
        ...DEFAULT_USER_SETTINGS,
        dmPrivacy: ageYears < 18 ? 'friends_only' : 'server_members',
        explicitMediaFilter: ageYears < 18 ? 'all' : 'non_friends',
      },
    };

    this.users[userId] = newUser;
    this.authRecords[email] = {
      userId,
      email,
      passwordSalt: salt,
      passwordHash: hash,
      dateOfBirth: input.dateOfBirth,
    };

    const kernel = this.servers.find((s) => s.id === 'srv-kernel');
    if (kernel && !kernel.members.some((m) => m.userId === userId)) {
      kernel.members.push({
        userId,
        roleIds: ['role-k-everyone'],
        joinedAt: new Date().toISOString(),
        rulesAccepted: true,
      });
    }

    this.friendsByUser[userId] = [
      { userId: 'user-alex', status: 'accepted', createdAt: new Date().toISOString() },
    ];
    this.inboxByUser[userId] = [];
    this.mutedByUser[userId] = [];
    this.unreadByUser[userId] = [];

    this.scheduleSave();
    return this.issueSession(userId, 'Web Browser');
  }

  public loginUser(emailOrUsername: string, password: string): { token: string; user: User } {
    const key = emailOrUsername.trim().toLowerCase();
    const record =
      this.authRecords[key] ||
      Object.values(this.authRecords).find((r) => this.users[r.userId]?.username.toLowerCase() === key);

    if (!record) {
      throw new Error('Invalid credentials. You can register a new account or switch to a demo profile.');
    }
    const candidateHash = this.hashPassword(password, record.passwordSalt);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(record.passwordHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Invalid email/username or password.');
    }
    return this.issueSession(record.userId, 'Web Browser');
  }

  public getSnapshot(userId: string): AppStateSnapshot {
    const userServers = this.servers.filter((s) => s.members.some((m) => m.userId === userId));
    const userDms = this.dms.filter((d) => d.participantIds.includes(userId));
    return {
      currentUserId: userId,
      users: this.users,
      servers: userServers,
      folders: this.folders,
      discoveryServers: this.discoveryServers,
      messages: this.messages,
      threads: this.threads,
      dms: userDms,
      friends: this.friendsByUser[userId] || [],
      friendInvites: this.friendInvites.filter((inv) => inv.creatorId === userId),
      voiceParticipants: this.voiceParticipants,
      whiteboardStrokes: this.whiteboardStrokes,
      botDirectory: this.botDirectory,
      inbox: this.inboxByUser[userId] || [],
      sessions: this.sessionsByUser[userId] || [],
      mutedChannelIds: this.mutedByUser[userId] || [],
      unreadChannelIds: this.unreadByUser[userId] || [],
    };
  }

  public getUser(userId: string): User | undefined {
    return this.users[userId];
  }

  public getServer(serverId: string): Server | undefined {
    return this.servers.find((s) => s.id === serverId);
  }

  public getChannelLocation(channelId: string): { server?: Server; channel?: Channel; dm?: DirectMessageThread } {
    for (const server of this.servers) {
      const ch = server.channels.find((c) => c.id === channelId);
      if (ch) return { server, channel: ch };
    }
    const dm = this.dms.find((d) => d.id === channelId);
    if (dm) return { dm };
    return {};
  }

  public hasPermission(server: Server, userId: string, perm: PermissionKey): boolean {
    if (server.ownerId === userId) return true;
    const member = server.members.find((m) => m.userId === userId);
    if (!member) return false;
    const roles = server.roles.filter((r) => member.roleIds.includes(r.id));
    return roles.some((r) => r.permissions.includes('ADMINISTRATOR') || r.permissions.includes(perm));
  }

  private appendAudit(server: Server, actorId: string, action: string, target: string, reason?: string) {
    server.auditLog.unshift({
      id: `al-${crypto.randomBytes(4).toString('hex')}`,
      actorId,
      action,
      target,
      reason,
      createdAt: new Date().toISOString(),
    });
    if (server.auditLog.length > 100) server.auditLog.length = 100;
  }

  public updateUserProfile(
    userId: string,
    patch: Partial<Pick<User, 'displayName' | 'bio' | 'pronouns' | 'status' | 'customStatus' | 'bannerColor' | 'avatarColor'>> & {
      settings?: Partial<UserSettings>;
    }
  ): User {
    const user = this.users[userId];
    if (!user) throw new Error('User not found');
    if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
      user.displayName = patch.displayName.trim().slice(0, 48);
    }
    if (typeof patch.bio === 'string') user.bio = patch.bio.slice(0, 240);
    if (typeof patch.pronouns === 'string') user.pronouns = patch.pronouns.slice(0, 32);
    if (patch.status) user.status = patch.status;
    if ('customStatus' in patch) user.customStatus = patch.customStatus;
    if (patch.bannerColor) user.bannerColor = patch.bannerColor;
    if (patch.avatarColor) user.avatarColor = patch.avatarColor;
    if (patch.settings) {
      user.settings = { ...user.settings, ...patch.settings };
    }
    this.scheduleSave();
    return user;
  }

  public sendMessage(input: {
    userId: string;
    channelId: string;
    threadId?: string;
    content: string;
    replyToId?: string;
    silent?: boolean;
    attachments?: MessageAttachment[];
    poll?: PollData;
    voiceClip?: VoiceClip;
    forwardedFrom?: { channelName: string; authorName: string };
  }): { messages: Message[]; serverUpdated?: Server; inboxItem?: InboxItem } {
    const loc = this.getChannelLocation(input.channelId);
    if (!loc.channel && !loc.dm) throw new Error('Channel not found');

    if (loc.server) {
      const member = loc.server.members.find((m) => m.userId === input.userId);
      if (!member) throw new Error('Not a member of this server');
      if (member.timedOutUntil && new Date(member.timedOutUntil).getTime() > Date.now()) {
        throw new Error('You are currently timed out in this server.');
      }

      const textLower = input.content.toLowerCase();
      for (const rule of loc.server.autoModRules) {
        if (!rule.enabled) continue;
        let triggered = false;
        if ((rule.triggerType === 'keywords' || rule.triggerType === 'suspicious_links') && rule.keywords.length > 0) {
          triggered = rule.keywords.some((kw) => kw.trim() && textLower.includes(kw.toLowerCase()));
        } else if (rule.triggerType === 'mention_spam') {
          const mentionCount = (input.content.match(/@\w+/g) || []).length;
          if (mentionCount >= (rule.maxMentions || 5)) triggered = true;
        }
        if (triggered) {
          rule.triggeredCount += 1;
          this.appendAudit(loc.server, 'bot-relay', `AutoMod: ${rule.action.toUpperCase()}`, rule.name, `Blocked content from @${this.users[input.userId]?.username}`);
          const inboxItem: InboxItem = {
            id: `inb-${crypto.randomBytes(4).toString('hex')}`,
            type: 'automod',
            title: `AutoMod triggered: ${rule.name}`,
            preview: `Action "${rule.action}" applied in #${loc.channel?.name}`,
            serverId: loc.server.id,
            channelId: input.channelId,
            createdAt: new Date().toISOString(),
            read: false,
          };
          const ownerInbox = this.inboxByUser[loc.server.ownerId] || [];
          ownerInbox.unshift(inboxItem);
          this.inboxByUser[loc.server.ownerId] = ownerInbox;
          this.scheduleSave();
          if (rule.action === 'block' || rule.action === 'timeout') {
            if (rule.action === 'timeout') {
              member.timedOutUntil = new Date(Date.now() + 5 * 60_000).toISOString();
            }
            throw new Error(`Blocked by AutoMod rule "${rule.name}".`);
          }
        }
      }
    }

    const trimmed = input.content.trim();
    if (!trimmed && !input.poll && !input.voiceClip && (!input.attachments || input.attachments.length === 0)) {
      throw new Error('Message cannot be empty.');
    }

    const bucketKey = input.threadId || input.channelId;
    if (!this.messages[bucketKey]) this.messages[bucketKey] = [];

    if (trimmed.startsWith('/') && !input.poll && !input.voiceClip) {
      const botMsg = this.handleSlashCommand(trimmed, input.userId, input.channelId, input.threadId, loc.server);
      if (botMsg) {
        this.messages[bucketKey].push(botMsg);
        if (input.threadId) {
          const thr = this.threads.find((t) => t.id === input.threadId);
          if (thr) thr.lastActivityAt = botMsg.createdAt;
        }
        this.scheduleSave();
        return { messages: [botMsg] };
      }
    }

    const msg: Message = {
      id: `msg-${crypto.randomBytes(6).toString('hex')}`,
      channelId: input.channelId,
      threadId: input.threadId,
      authorId: input.userId,
      content: trimmed.slice(0, 4000),
      createdAt: new Date().toISOString(),
      silent: Boolean(input.silent),
      replyToId: input.replyToId,
      forwardedFrom: input.forwardedFrom,
      reactions: [],
      attachments: (input.attachments || []).slice(0, 4),
      poll: input.poll,
      voiceClip: input.voiceClip,
    };

    this.messages[bucketKey].push(msg);

    if (input.threadId) {
      const thr = this.threads.find((t) => t.id === input.threadId);
      if (thr) {
        thr.lastActivityAt = msg.createdAt;
        thr.archived = false;
      }
    }
    if (loc.dm) {
      loc.dm.lastMessageAt = msg.createdAt;
      loc.dm.isRequest = false;
    }

    this.scheduleSave();
    return { messages: [msg] };
  }

  private handleSlashCommand(
    raw: string,
    userId: string,
    channelId: string,
    threadId: string | undefined,
    server?: Server
  ): Message | null {
    const [cmd, ...restParts] = raw.split(/\s+/);
    const rest = restParts.join(' ').trim();
    const author = this.users[userId];
    const base = {
      id: `msg-${crypto.randomBytes(6).toString('hex')}`,
      channelId,
      threadId,
      authorId: 'bot-relay',
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [],
    };

    if (cmd === '/poll') {
      const parts = rest.split('|').map((s) => s.trim()).filter(Boolean);
      const question = parts[0] || 'Quick Community Poll';
      const options = (parts.length >= 3 ? parts.slice(1) : ['Yes', 'No']).slice(0, 6).map((text, idx) => ({
        id: `opt-${idx + 1}`,
        text,
        voterIds: [],
      }));
      return {
        ...base,
        content: `Poll created by **${author?.displayName || 'Member'}**`,
        poll: {
          question,
          options,
          expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
          allowMultiple: false,
        },
      };
    }

    if (cmd === '/roll') {
      const match = (rest || '1d20').match(/^(\d+)?d(\d+)$/i);
      const count = Math.min(Math.max(Number(match?.[1] || 1), 1), 10);
      const sides = Math.min(Math.max(Number(match?.[2] || 20), 2), 1000);
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0);
      return {
        ...base,
        content: `**${author?.displayName}** rolled \`${count}d${sides}\` → **${total}** (${rolls.join(', ')})`,
      };
    }

    if (cmd === '/coinflip') {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      return {
        ...base,
        content: `**${author?.displayName}** flipped a coin → **${result}**`,
      };
    }

    if (cmd === '/remind') {
      return {
        ...base,
        content: '',
        embed: {
          title: 'Scheduled Reminder',
          description: rest || 'Follow up with the team in this channel.',
          fields: [{ name: 'Set by', value: author?.displayName || 'Member' }],
          footer: 'Relay Utility · Slash Command',
        },
      };
    }

    if (cmd === '/serverinfo' && server) {
      const onlineCount = server.members.filter((m) => {
        const st = this.users[m.userId]?.status;
        return st && st !== 'offline' && st !== 'invisible';
      }).length;
      return {
        ...base,
        content: '',
        embed: {
          title: server.name,
          description: server.description,
          fields: [
            { name: 'Members', value: `${server.members.length} total (${onlineCount} online)` },
            { name: 'Channels', value: `${server.channels.length} channels` },
            { name: 'Roles', value: `${server.roles.length} roles` },
            { name: 'Category', value: `${server.category} · ${server.language}` },
          ],
          footer: `Vanity invite: livechatter.app/invite/${server.vanityCode || server.invites[0]?.code || server.id}`,
        },
      };
    }

    if (cmd === '/help') {
      return {
        ...base,
        content: '',
        embed: {
          title: 'Available Slash Commands',
          description: 'Run deterministic utility commands directly from any message composer.',
          fields: [
            { name: '/poll Question | Option A | Option B', value: 'Create a live interactive poll' },
            { name: '/roll 2d6', value: 'Roll up to 10 dice (default 1d20)' },
            { name: '/coinflip', value: 'Flip a fair coin' },
            { name: '/remind Note', value: 'Post a formatted reminder card' },
            { name: '/serverinfo', value: 'Show current server statistics' },
          ],
          footer: 'Relay Utility · Free for all servers',
        },
      };
    }

    return null;
  }

  public editMessage(userId: string, channelId: string, messageId: string, content: string, threadId?: string): Message {
    const bucket = this.messages[threadId || channelId] || [];
    const msg = bucket.find((m) => m.id === messageId);
    if (!msg) throw new Error('Message not found');
    if (msg.authorId !== userId) throw new Error('You can only edit your own messages.');
    msg.content = content.trim().slice(0, 4000);
    msg.editedAt = new Date().toISOString();
    this.scheduleSave();
    return msg;
  }

  public deleteMessage(userId: string, channelId: string, messageId: string, threadId?: string): boolean {
    const bucketKey = threadId || channelId;
    const bucket = this.messages[bucketKey] || [];
    const idx = bucket.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;
    const msg = bucket[idx];
    const loc = this.getChannelLocation(channelId);
    const canManage = loc.server ? this.hasPermission(loc.server, userId, 'MANAGE_MESSAGES') : false;
    if (msg.authorId !== userId && !canManage) {
      throw new Error('Missing permission to delete this message.');
    }
    bucket.splice(idx, 1);
    this.scheduleSave();
    return true;
  }

  public toggleReaction(userId: string, channelId: string, messageId: string, emoji: string, threadId?: string): Message {
    const bucket = this.messages[threadId || channelId] || [];
    const msg = bucket.find((m) => m.id === messageId);
    if (!msg) throw new Error('Message not found');
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(userId)) {
        existing.userIds = existing.userIds.filter((id) => id !== userId);
        if (existing.userIds.length === 0) {
          msg.reactions = msg.reactions.filter((r) => r.emoji !== emoji);
        }
      } else {
        existing.userIds.push(userId);
      }
    } else {
      msg.reactions.push({ emoji, userIds: [userId] });
    }
    this.scheduleSave();
    return msg;
  }

  public togglePin(userId: string, channelId: string, messageId: string, threadId?: string): Message {
    const bucket = this.messages[threadId || channelId] || [];
    const msg = bucket.find((m) => m.id === messageId);
    if (!msg) throw new Error('Message not found');
    const loc = this.getChannelLocation(channelId);
    if (loc.server && !this.hasPermission(loc.server, userId, 'MANAGE_MESSAGES')) {
      throw new Error('Requires Manage Messages permission to pin messages.');
    }
    msg.pinned = !msg.pinned;
    this.scheduleSave();
    return msg;
  }

  public votePoll(userId: string, channelId: string, messageId: string, optionId: string, threadId?: string): Message {
    const bucket = this.messages[threadId || channelId] || [];
    const msg = bucket.find((m) => m.id === messageId);
    if (!msg || !msg.poll) throw new Error('Poll not found');
    for (const opt of msg.poll.options) {
      if (opt.id === optionId) {
        if (opt.voterIds.includes(userId)) {
          opt.voterIds = opt.voterIds.filter((id) => id !== userId);
        } else {
          opt.voterIds.push(userId);
        }
      } else if (!msg.poll.allowMultiple) {
        opt.voterIds = opt.voterIds.filter((id) => id !== userId);
      }
    }
    this.scheduleSave();
    return msg;
  }

  public createThread(input: {
    userId: string;
    serverId: string;
    channelId: string;
    title: string;
    parentMessageId?: string;
    isPrivate?: boolean;
    autoArchiveMinutes?: 60 | 1440 | 4320 | 10080;
    isForumPost?: boolean;
    tags?: string[];
    initialContent?: string;
  }): { thread: Thread; initialMessage?: Message } {
    const nowIso = new Date().toISOString();
    const thread: Thread = {
      id: `thr-${crypto.randomBytes(5).toString('hex')}`,
      channelId: input.channelId,
      serverId: input.serverId,
      parentMessageId: input.parentMessageId,
      title: input.title.trim().slice(0, 120) || 'New Thread',
      creatorId: input.userId,
      createdAt: nowIso,
      lastActivityAt: nowIso,
      autoArchiveMinutes: input.autoArchiveMinutes || 1440,
      archived: false,
      isPrivate: Boolean(input.isPrivate),
      followerIds: [input.userId],
      tags: input.tags,
      isForumPost: input.isForumPost,
      bodyPreview: input.initialContent?.slice(0, 180),
    };
    this.threads.unshift(thread);
    this.messages[thread.id] = [];

    let initialMessage: Message | undefined;
    if (input.initialContent?.trim()) {
      initialMessage = {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: input.channelId,
        threadId: thread.id,
        authorId: input.userId,
        content: input.initialContent.trim(),
        createdAt: nowIso,
        reactions: [],
        attachments: [],
      };
      this.messages[thread.id].push(initialMessage);
    }

    this.scheduleSave();
    return { thread, initialMessage };
  }

  public updateThread(userId: string, threadId: string, patch: { toggleFollow?: boolean; archived?: boolean; autoArchiveMinutes?: Thread['autoArchiveMinutes'] }): Thread {
    const thr = this.threads.find((t) => t.id === threadId);
    if (!thr) throw new Error('Thread not found');
    if (patch.toggleFollow) {
      if (thr.followerIds.includes(userId)) {
        thr.followerIds = thr.followerIds.filter((id) => id !== userId);
      } else {
        thr.followerIds.push(userId);
      }
    }
    if (typeof patch.archived === 'boolean') thr.archived = patch.archived;
    if (patch.autoArchiveMinutes) thr.autoArchiveMinutes = patch.autoArchiveMinutes;
    this.scheduleSave();
    return thr;
  }

  public createServer(input: {
    ownerId: string;
    name: string;
    template: 'blank' | 'opensource' | 'study' | 'gaming' | 'creators' | 'friends';
    category?: Server['category'];
    description?: string;
    iconColor?: string;
  }): Server {
    const id = `srv-${crypto.randomBytes(4).toString('hex')}`;
    const cat1 = `cat-${crypto.randomBytes(3).toString('hex')}`;
    const cat2 = `cat-${crypto.randomBytes(3).toString('hex')}`;
    const ownerRoleId = `role-${crypto.randomBytes(3).toString('hex')}`;
    const everyoneRoleId = `role-${crypto.randomBytes(3).toString('hex')}`;

    const templateChannels: Record<string, { name: string; type: ChannelType; topic: string; cat: string }[]> = {
      blank: [
        { name: 'general', type: 'text', topic: 'General conversation.', cat: cat1 },
        { name: 'Lounge', type: 'voice', topic: 'Drop-in voice room.', cat: cat2 },
      ],
      opensource: [
        { name: 'announcements', type: 'announcement', topic: 'Release updates & changelogs.', cat: cat1 },
        { name: 'general', type: 'text', topic: 'Contributor chat & questions.', cat: cat1 },
        { name: 'rfcs', type: 'forum', topic: 'Design proposals and RFCs.', cat: cat1 },
        { name: 'Dev Sync', type: 'voice', topic: 'Pairing and screen sharing.', cat: cat2 },
        { name: 'Community Call', type: 'stage', topic: 'Monthly moderated town hall.', cat: cat2 },
      ],
      study: [
        { name: 'check-in', type: 'text', topic: 'Share your session goals.', cat: cat1 },
        { name: 'notes-forum', type: 'forum', topic: 'Organize class & paper notes.', cat: cat1 },
        { name: 'Silent Study', type: 'voice', topic: 'Focused Pomodoro voice room.', cat: cat2 },
      ],
      gaming: [
        { name: 'lfg-lobby', type: 'text', topic: 'Find teammates and schedule runs.', cat: cat1 },
        { name: 'clips', type: 'text', topic: 'Share highlights and screenshots.', cat: cat1 },
        { name: 'Squad Voice 1', type: 'voice', topic: 'Low-latency squad comms.', cat: cat2 },
      ],
      creators: [
        { name: 'updates', type: 'announcement', topic: 'Creator drops & schedules.', cat: cat1 },
        { name: 'showcase', type: 'forum', topic: 'Share works in progress.', cat: cat1 },
        { name: 'Live Studio Stage', type: 'stage', topic: 'Q&A and listening parties.', cat: cat2 },
      ],
      friends: [
        { name: 'hangout', type: 'text', topic: 'Everyday chat.', cat: cat1 },
        { name: 'Couch Voice', type: 'voice', topic: 'Hang out & screen share.', cat: cat2 },
      ],
    };

    const list = templateChannels[input.template] || templateChannels.blank;
    const channels: Channel[] = list.map((ch, idx) => ({
      id: `ch-${crypto.randomBytes(4).toString('hex')}`,
      serverId: id,
      categoryId: ch.cat,
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      position: idx,
      slowmodeSeconds: 0,
      isPrivate: false,
      ageRestricted: false,
      availableTags: ch.type === 'forum' ? ['Discussion', 'Question', 'Resource'] : undefined,
      guidelines: ch.type === 'forum' ? 'Add a descriptive title and select relevant tags.' : undefined,
    }));

    const inviteCode = `${input.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'server'}-${crypto.randomBytes(2).toString('hex')}`;

    const server: Server = {
      id,
      name: input.name.trim().slice(0, 60) || 'Untitled Server',
      description: input.description?.trim() || `Community space for ${input.name.trim()}.`,
      iconColor: input.iconColor || '#2563EB',
      category:
        input.category ||
        (input.template === 'study'
          ? 'Education'
          : input.template === 'gaming'
          ? 'Gaming'
          : input.template === 'creators'
          ? 'Creators'
          : input.template === 'friends'
          ? 'Friends'
          : 'Open Source'),
      language: 'English',
      ownerId: input.ownerId,
      vanityCode: inviteCode,
      isCommunity: true,
      verificationLevel: 'none',
      rules: ['Be respectful and keep discussions constructive.'],
      customEmojis: [{ id: `ce-${id}`, name: 'wave', symbol: '👋' }],
      categories: [
        { id: cat1, name: 'Text Channels', position: 0 },
        { id: cat2, name: 'Voice Channels', position: 1 },
      ],
      channels,
      roles: [
        {
          id: ownerRoleId,
          name: 'Owner',
          color: '#3B82F6',
          hoist: true,
          mentionable: true,
          position: 1,
          permissions: [
            'ADMINISTRATOR',
            'VIEW_CHANNEL',
            'SEND_MESSAGES',
            'MANAGE_MESSAGES',
            'CONNECT',
            'SPEAK',
            'VIDEO',
            'MUTE_MEMBERS',
            'MANAGE_CHANNELS',
            'MANAGE_ROLES',
            'MANAGE_SERVER',
            'KICK_MEMBERS',
            'BAN_MEMBERS',
            'TIMEOUT_MEMBERS',
            'MENTION_EVERYONE',
          ],
        },
        {
          id: everyoneRoleId,
          name: '@everyone',
          color: '#94A3B8',
          hoist: false,
          mentionable: false,
          position: 0,
          permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CONNECT', 'SPEAK', 'VIDEO'],
        },
      ],
      members: [
        { userId: input.ownerId, roleIds: [ownerRoleId], joinedAt: new Date().toISOString(), rulesAccepted: true },
        { userId: 'bot-relay', roleIds: [everyoneRoleId], joinedAt: new Date().toISOString(), rulesAccepted: true },
      ],
      bannedUserIds: [],
      autoModRules: [],
      auditLog: [
        {
          id: `al-${crypto.randomBytes(4).toString('hex')}`,
          actorId: input.ownerId,
          action: 'Created Server',
          target: input.name.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
      events: [],
      invites: [
        {
          code: inviteCode,
          serverId: id,
          createdBy: input.ownerId,
          uses: 1,
          maxUses: 0,
          temporary: false,
        },
      ],
      webhooks: [],
      installedBotIds: ['bot-relay'],
    };

    this.servers.push(server);
    const firstText = channels.find((c) => c.type === 'text' || c.type === 'announcement');
    if (firstText) {
      this.messages[firstText.id] = [
        {
          id: `msg-${crypto.randomBytes(6).toString('hex')}`,
          channelId: firstText.id,
          authorId: 'bot-relay',
          content: `Welcome to **${server.name}**! Invite friends using code \`${inviteCode}\`, or type \`/help\` to explore slash commands.`,
          createdAt: new Date().toISOString(),
          reactions: [{ emoji: '👋', userIds: [input.ownerId] }],
          attachments: [],
        },
      ];
    }
    this.scheduleSave();
    return server;
  }

  public joinByInviteOrDiscovery(userId: string, codeOrDiscoveryId: string): Server {
    const clean = codeOrDiscoveryId.trim().toLowerCase().replace(/^https?:\/\/[^/]+\/invite\//, '');
    const existing = this.servers.find(
      (s) => s.vanityCode?.toLowerCase() === clean || s.invites.some((i) => i.code.toLowerCase() === clean) || s.id === codeOrDiscoveryId
    );
    if (existing) {
      if (existing.bannedUserIds.includes(userId)) {
        throw new Error('You are banned from this server.');
      }
      if (!existing.members.some((m) => m.userId === userId)) {
        const defaultRole = existing.roles.find((r) => r.name === '@everyone') || existing.roles[existing.roles.length - 1];
        existing.members.push({
          userId,
          roleIds: defaultRole ? [defaultRole.id] : [],
          joinedAt: new Date().toISOString(),
          rulesAccepted: true,
        });
        const inv = existing.invites.find((i) => i.code.toLowerCase() === clean);
        if (inv) inv.uses += 1;
        this.scheduleSave();
      }
      return existing;
    }

    const disc = this.discoveryServers.find((d) => d.id === codeOrDiscoveryId);
    if (disc) {
      const created = this.createServer({
        ownerId: userId,
        name: disc.name,
        template: disc.template,
        category: disc.category,
        description: disc.description,
        iconColor: disc.iconColor,
      });
      created.bannerUrl = disc.bannerUrl;
      this.scheduleSave();
      return created;
    }

    throw new Error('Invite code not found or expired.');
  }

  public createChannel(
    userId: string,
    serverId: string,
    input: { name: string; type: ChannelType; categoryId?: string; topic?: string; isPrivate?: boolean; slowmodeSeconds?: number }
  ): { server: Server; channel: Channel } {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found');
    if (!this.hasPermission(server, userId, 'MANAGE_CHANNELS')) {
      throw new Error('Requires Manage Channels permission.');
    }
    const cleanName =
      input.type === 'voice' || input.type === 'stage'
        ? input.name.trim().slice(0, 48) || 'New Room'
        : input.name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'new-channel';
    const channel: Channel = {
      id: `ch-${crypto.randomBytes(4).toString('hex')}`,
      serverId,
      categoryId: input.categoryId || server.categories[0]?.id,
      name: cleanName,
      type: input.type,
      topic: input.topic?.trim() || '',
      position: server.channels.length,
      slowmodeSeconds: Math.max(0, Math.min(Number(input.slowmodeSeconds || 0), 300)),
      isPrivate: Boolean(input.isPrivate),
      ageRestricted: false,
      availableTags: input.type === 'forum' ? ['General', 'Question', 'Announcement'] : undefined,
      guidelines: input.type === 'forum' ? 'Keep threads focused and searchable.' : undefined,
    };
    server.channels.push(channel);
    this.messages[channel.id] = [];
    this.appendAudit(server, userId, 'Created Channel', `#${channel.name} (${channel.type})`);
    this.scheduleSave();
    return { server, channel };
  }

  public updateServerSettings(
    userId: string,
    serverId: string,
    patch: {
      name?: string;
      description?: string;
      category?: Server['category'];
      language?: string;
      verificationLevel?: Server['verificationLevel'];
      vanityCode?: string;
      newRole?: Omit<Role, 'id' | 'position'>;
      updateRole?: Role;
      deleteRoleId?: string;
      newAutoModRule?: Omit<AutoModRule, 'id' | 'triggeredCount'>;
      toggleAutoModId?: string;
      newEvent?: Omit<ScheduledEvent, 'id' | 'serverId' | 'interestedUserIds' | 'hostId'>;
      toggleEventRsvpId?: string;
      createInvite?: { maxUses: number; temporary: boolean };
      toggleBotId?: string;
      createWebhook?: { name: string; channelId: string };
      addCustomEmoji?: { name: string; symbol: string };
    }
  ): Server {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found');

    if (patch.toggleEventRsvpId) {
      const evt = server.events.find((e) => e.id === patch.toggleEventRsvpId);
      if (evt) {
        if (evt.interestedUserIds.includes(userId)) {
          evt.interestedUserIds = evt.interestedUserIds.filter((id) => id !== userId);
        } else {
          evt.interestedUserIds.push(userId);
        }
        this.scheduleSave();
        return server;
      }
    }

    if (!this.hasPermission(server, userId, 'MANAGE_SERVER') && !this.hasPermission(server, userId, 'MANAGE_ROLES')) {
      throw new Error('Requires Manage Server or Manage Roles permission.');
    }

    if (patch.name?.trim()) {
      server.name = patch.name.trim().slice(0, 60);
      this.appendAudit(server, userId, 'Updated Server Profile', server.name);
    }
    if (typeof patch.description === 'string') server.description = patch.description.slice(0, 300);
    if (patch.category) server.category = patch.category;
    if (patch.language) server.language = patch.language;
    if (patch.verificationLevel) server.verificationLevel = patch.verificationLevel;
    if (typeof patch.vanityCode === 'string') {
      server.vanityCode = patch.vanityCode.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    }

    if (patch.newRole) {
      const role: Role = {
        ...patch.newRole,
        id: `role-${crypto.randomBytes(4).toString('hex')}`,
        position: server.roles.length,
      };
      server.roles.unshift(role);
      this.appendAudit(server, userId, 'Created Role', role.name);
    }
    if (patch.updateRole) {
      const idx = server.roles.findIndex((r) => r.id === patch.updateRole!.id);
      if (idx !== -1) {
        server.roles[idx] = patch.updateRole;
        this.appendAudit(server, userId, 'Updated Role', patch.updateRole.name);
      }
    }
    if (patch.deleteRoleId) {
      const target = server.roles.find((r) => r.id === patch.deleteRoleId);
      if (target && target.name !== '@everyone') {
        server.roles = server.roles.filter((r) => r.id !== patch.deleteRoleId);
        for (const m of server.members) {
          m.roleIds = m.roleIds.filter((id) => id !== patch.deleteRoleId);
        }
        this.appendAudit(server, userId, 'Deleted Role', target.name);
      }
    }
    if (patch.newAutoModRule) {
      const rule: AutoModRule = {
        ...patch.newAutoModRule,
        id: `am-${crypto.randomBytes(4).toString('hex')}`,
        triggeredCount: 0,
      };
      server.autoModRules.push(rule);
      this.appendAudit(server, userId, 'Created AutoMod Rule', rule.name);
    }
    if (patch.toggleAutoModId) {
      const rule = server.autoModRules.find((r) => r.id === patch.toggleAutoModId);
      if (rule) {
        rule.enabled = !rule.enabled;
        this.appendAudit(server, userId, rule.enabled ? 'Enabled AutoMod Rule' : 'Disabled AutoMod Rule', rule.name);
      }
    }
    if (patch.newEvent) {
      const evt: ScheduledEvent = {
        ...patch.newEvent,
        id: `evt-${crypto.randomBytes(4).toString('hex')}`,
        serverId: server.id,
        interestedUserIds: [userId],
        hostId: userId,
      };
      server.events.unshift(evt);
      this.appendAudit(server, userId, 'Scheduled Event', evt.title);
    }
    if (patch.createInvite) {
      const code = `${server.vanityCode?.slice(0, 6) || 'join'}-${crypto.randomBytes(3).toString('hex')}`;
      server.invites.unshift({
        code,
        serverId: server.id,
        createdBy: userId,
        uses: 0,
        maxUses: patch.createInvite.maxUses,
        temporary: patch.createInvite.temporary,
      });
      this.appendAudit(server, userId, 'Created Invite', code);
    }
    if (patch.toggleBotId) {
      const bot = this.botDirectory.find((b) => b.id === patch.toggleBotId);
      if (bot) {
        if (server.installedBotIds.includes(bot.id)) {
          server.installedBotIds = server.installedBotIds.filter((id) => id !== bot.id);
          this.appendAudit(server, userId, 'Removed Bot', bot.name);
        } else {
          server.installedBotIds.push(bot.id);
          this.appendAudit(server, userId, 'Installed Bot', bot.name);
        }
      }
    }
    if (patch.createWebhook) {
      server.webhooks.unshift({
        id: `wh-${crypto.randomBytes(4).toString('hex')}`,
        name: patch.createWebhook.name.trim().slice(0, 48) || 'Custom Webhook',
        channelId: patch.createWebhook.channelId,
        createdAt: new Date().toISOString(),
      });
      this.appendAudit(server, userId, 'Created Webhook', patch.createWebhook.name);
    }
    if (patch.addCustomEmoji) {
      server.customEmojis.push({
        id: `ce-${crypto.randomBytes(3).toString('hex')}`,
        name: patch.addCustomEmoji.name.replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'custom',
        symbol: patch.addCustomEmoji.symbol,
      });
    }

    this.scheduleSave();
    return server;
  }

  public moderateMember(
    actorId: string,
    serverId: string,
    targetUserId: string,
    action: 'timeout' | 'kick' | 'ban' | 'toggle_role',
    opts?: { reason?: string; durationMinutes?: number; roleId?: string }
  ): Server {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found');
    const targetUser = this.users[targetUserId];
    if (!targetUser) throw new Error('User not found');

    if (action === 'toggle_role' && opts?.roleId) {
      if (!this.hasPermission(server, actorId, 'MANAGE_ROLES')) throw new Error('Requires Manage Roles permission.');
      const mem = server.members.find((m) => m.userId === targetUserId);
      if (mem) {
        if (mem.roleIds.includes(opts.roleId)) {
          mem.roleIds = mem.roleIds.filter((id) => id !== opts.roleId);
        } else {
          mem.roleIds.push(opts.roleId);
        }
        const role = server.roles.find((r) => r.id === opts.roleId);
        this.appendAudit(server, actorId, 'Updated Member Roles', `${targetUser.displayName} (${role?.name || opts.roleId})`);
      }
    } else if (action === 'timeout') {
      if (!this.hasPermission(server, actorId, 'TIMEOUT_MEMBERS')) throw new Error('Requires Timeout Members permission.');
      const mem = server.members.find((m) => m.userId === targetUserId);
      if (mem) {
        mem.timedOutUntil = new Date(Date.now() + (opts?.durationMinutes || 10) * 60_000).toISOString();
        this.appendAudit(server, actorId, 'Timed Out Member', targetUser.displayName, opts?.reason || '10m timeout');
      }
    } else if (action === 'kick') {
      if (!this.hasPermission(server, actorId, 'KICK_MEMBERS')) throw new Error('Requires Kick Members permission.');
      if (server.ownerId === targetUserId) throw new Error('Cannot kick the server owner.');
      server.members = server.members.filter((m) => m.userId !== targetUserId);
      this.appendAudit(server, actorId, 'Kicked Member', targetUser.displayName, opts?.reason);
    } else if (action === 'ban') {
      if (!this.hasPermission(server, actorId, 'BAN_MEMBERS')) throw new Error('Requires Ban Members permission.');
      if (server.ownerId === targetUserId) throw new Error('Cannot ban the server owner.');
      server.members = server.members.filter((m) => m.userId !== targetUserId);
      if (!server.bannedUserIds.includes(targetUserId)) server.bannedUserIds.push(targetUserId);
      this.appendAudit(server, actorId, 'Banned Member', targetUser.displayName, opts?.reason);
    }

    this.scheduleSave();
    return server;
  }

  public leaveServer(userId: string, serverId: string): { deleted: boolean; server?: Server } {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found');
    if (server.ownerId === userId) {
      this.servers = this.servers.filter((s) => s.id !== serverId);
      this.scheduleSave();
      return { deleted: true };
    }
    server.members = server.members.filter((m) => m.userId !== userId);
    this.scheduleSave();
    return { deleted: false, server };
  }

  public createOrOpenDm(userId: string, participantIds: string[], name?: string): DirectMessageThread {
    const unique = Array.from(new Set([userId, ...participantIds])).slice(0, 10);
    if (unique.length < 2) throw new Error('Select at least one other user.');
    if (unique.length === 2) {
      const existing = this.dms.find(
        (d) => !d.isGroup && d.participantIds.length === 2 && unique.every((id) => d.participantIds.includes(id))
      );
      if (existing) {
        existing.isRequest = false;
        return existing;
      }
    }
    const dm: DirectMessageThread = {
      id: `dm-${crypto.randomBytes(4).toString('hex')}`,
      isGroup: unique.length > 2,
      name: unique.length > 2 ? name?.trim() || unique.map((id) => this.users[id]?.displayName?.split(' ')[0]).filter(Boolean).join(', ') : undefined,
      participantIds: unique,
      lastMessageAt: new Date().toISOString(),
    };
    this.dms.unshift(dm);
    this.messages[dm.id] = [];
    this.scheduleSave();
    return dm;
  }

  public manageFriend(userId: string, action: 'add' | 'accept' | 'decline' | 'remove' | 'block', targetUsernameOrId: string): FriendRelation[] {
    const list = this.friendsByUser[userId] || [];
    const target =
      this.users[targetUsernameOrId] ||
      Object.values(this.users).find((u) => u.username.toLowerCase() === targetUsernameOrId.trim().toLowerCase());
    if (!target || target.id === userId) {
      throw new Error('User not found. Try a username like marcuschen, soratanaka, or liamoconnor.');
    }

    const existing = list.find((f) => f.userId === target.id);
    if (action === 'add') {
      if (existing) {
        existing.status = 'accepted';
      } else {
        list.unshift({ userId: target.id, status: 'pending_outgoing', createdAt: new Date().toISOString() });
      }
    } else if (action === 'accept' && existing) {
      existing.status = 'accepted';
    } else if ((action === 'decline' || action === 'remove') && existing) {
      this.friendsByUser[userId] = list.filter((f) => f.userId !== target.id);
      this.scheduleSave();
      return this.friendsByUser[userId];
    } else if (action === 'block') {
      if (existing) existing.status = 'blocked';
      else list.unshift({ userId: target.id, status: 'blocked', createdAt: new Date().toISOString() });
    }
    this.friendsByUser[userId] = list;
    this.scheduleSave();
    return list;
  }

  public createFriendInvite(
    userId: string,
    opts?: { serverId?: string; maxUses?: number; expiresInHours?: number; note?: string }
  ): FriendInviteCode {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const prefix = (user.username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'USER').toUpperCase();
    const digits = crypto.randomInt(1000, 9999);
    let code = `LC-${prefix}-${digits}`;
    while (this.friendInvites.some((i) => i.code.toLowerCase() === code.toLowerCase())) {
      code = `LC-${prefix}-${crypto.randomInt(1000, 9999)}`;
    }
    const server = opts?.serverId
      ? this.servers.find((s) => s.id === opts.serverId && s.members.some((m) => m.userId === userId))
      : undefined;
    const maxUses = typeof opts?.maxUses === 'number' && opts.maxUses >= 0 ? Math.min(500, Math.floor(opts.maxUses)) : 25;
    const expiresAt =
      typeof opts?.expiresInHours === 'number' && opts.expiresInHours > 0
        ? new Date(Date.now() + opts.expiresInHours * 3_600_000).toISOString()
        : undefined;
    const invite: FriendInviteCode = {
      code,
      creatorId: userId,
      serverId: server?.id,
      serverName: server?.name,
      note: opts?.note?.trim().slice(0, 200) || undefined,
      uses: 0,
      maxUses,
      createdAt: new Date().toISOString(),
      expiresAt,
      sharedChannels: [],
    };
    this.friendInvites.unshift(invite);
    this.scheduleSave();
    return invite;
  }

  public revokeFriendInvite(userId: string, code: string): FriendInviteCode[] {
    const clean = code.trim().toUpperCase();
    this.friendInvites = this.friendInvites.filter(
      (i) => !(i.creatorId === userId && i.code.toUpperCase() === clean)
    );
    this.scheduleSave();
    return this.friendInvites.filter((i) => i.creatorId === userId);
  }

  public recordFriendInviteShare(
    userId: string,
    code: string,
    channel: 'whatsapp' | 'gmail' | 'messages' | 'copy' | 'native'
  ): FriendInviteCode | null {
    const clean = code.trim().toUpperCase();
    const inv = this.friendInvites.find((i) => i.creatorId === userId && i.code.toUpperCase() === clean);
    if (!inv) return null;
    if (!inv.sharedChannels.includes(channel)) {
      inv.sharedChannels.push(channel);
      this.scheduleSave();
    }
    return inv;
  }

  public redeemFriendInvite(
    userId: string,
    rawInput: string
  ): {
    kind: 'friend' | 'server';
    friend?: User;
    dm?: DirectMessageThread;
    server?: Server;
  } {
    let clean = rawInput.trim();
    // Extract ?invite=CODE or /invite/CODE if user pasted a full WhatsApp/Gmail/SMS link
    const queryMatch = clean.match(/[?&]invite=([A-Za-z0-9_-]+)/i);
    if (queryMatch) {
      clean = queryMatch[1];
    } else {
      clean = clean.replace(/^https?:\/\/[^/]+\/invite\//i, '').replace(/\/+$/, '');
    }
    if (!clean) throw new Error('Enter a valid invite code or invite link.');

    const friendInvite = this.friendInvites.find((i) => i.code.toLowerCase() === clean.toLowerCase());
    if (friendInvite) {
      if (friendInvite.expiresAt && new Date(friendInvite.expiresAt).getTime() < Date.now()) {
        throw new Error('This invite code has expired.');
      }
      if (friendInvite.maxUses > 0 && friendInvite.uses >= friendInvite.maxUses) {
        throw new Error('This invite code has reached its maximum number of uses.');
      }
      if (friendInvite.creatorId === userId) {
        throw new Error('This is your own invite code — share it with a friend on WhatsApp, Gmail, or Messages!');
      }
      const creator = this.users[friendInvite.creatorId];
      if (!creator) throw new Error('The creator of this invite no longer exists.');

      // Establish mutual accepted friendship
      const ensureAccepted = (ownerId: string, otherId: string) => {
        const list = this.friendsByUser[ownerId] || [];
        const existing = list.find((f) => f.userId === otherId);
        if (existing) {
          existing.status = 'accepted';
        } else {
          list.unshift({ userId: otherId, status: 'accepted', createdAt: new Date().toISOString() });
        }
        this.friendsByUser[ownerId] = list;
      };
      ensureAccepted(userId, creator.id);
      ensureAccepted(creator.id, userId);

      // Open or create DM between the two friends
      const dm = this.createOrOpenDm(userId, [creator.id]);
      if (dm.isRequest) dm.isRequest = false;

      // Also join attached server if present
      let joinedServer: Server | undefined;
      if (friendInvite.serverId) {
        try {
          joinedServer = this.joinByInviteOrDiscovery(userId, friendInvite.serverId);
        } catch {
          // Ignore if already joined or unavailable
        }
      }

      friendInvite.uses += 1;
      this.scheduleSave();
      return { kind: 'friend', friend: creator, dm, server: joinedServer };
    }

    // Fallback: check if it's a server invite code
    const server = this.joinByInviteOrDiscovery(userId, clean);
    return { kind: 'server', server };
  }

  public updateVoiceState(
    userId: string,
    action: 'join' | 'leave' | 'update' | 'raise_hand' | 'set_stage_role',
    payload: {
      channelId?: string;
      targetUserId?: string;
      muted?: boolean;
      deafened?: boolean;
      videoOn?: boolean;
      screenSharing?: boolean;
      speaking?: boolean;
      stageRole?: 'speaker' | 'audience';
    }
  ): VoiceParticipant[] {
    if (action === 'leave') {
      this.voiceParticipants = this.voiceParticipants.filter((p) => p.userId !== userId);
      return this.voiceParticipants;
    }

    if (action === 'join' && payload.channelId) {
      const loc = this.getChannelLocation(payload.channelId);
      const isStage = loc.channel?.type === 'stage';
      const isOwnerOrMod = loc.server ? this.hasPermission(loc.server, userId, 'MUTE_MEMBERS') : false;
      this.voiceParticipants = this.voiceParticipants.filter((p) => p.userId !== userId);
      this.voiceParticipants.push({
        userId,
        channelId: payload.channelId,
        muted: isStage && !isOwnerOrMod,
        deafened: false,
        videoOn: false,
        screenSharing: false,
        speaking: false,
        stageRole: isStage ? (isOwnerOrMod ? 'speaker' : 'audience') : undefined,
        handRaised: false,
      });
      return this.voiceParticipants;
    }

    const targetId = payload.targetUserId || userId;
    const participant = this.voiceParticipants.find((p) => p.userId === targetId);
    if (!participant) return this.voiceParticipants;

    if (action === 'update') {
      if (typeof payload.muted === 'boolean') participant.muted = payload.muted;
      if (typeof payload.deafened === 'boolean') {
        participant.deafened = payload.deafened;
        if (payload.deafened) participant.muted = true;
      }
      if (typeof payload.videoOn === 'boolean') participant.videoOn = payload.videoOn;
      if (typeof payload.screenSharing === 'boolean') participant.screenSharing = payload.screenSharing;
      if (typeof payload.speaking === 'boolean') participant.speaking = payload.speaking;
    } else if (action === 'raise_hand') {
      participant.handRaised = !participant.handRaised;
    } else if (action === 'set_stage_role' && payload.stageRole) {
      participant.stageRole = payload.stageRole;
      participant.handRaised = false;
      if (payload.stageRole === 'audience') participant.muted = true;
    }

    return this.voiceParticipants;
  }

  public addWhiteboardStroke(stroke: WhiteboardStroke) {
    if (!this.whiteboardStrokes[stroke.channelId]) this.whiteboardStrokes[stroke.channelId] = [];
    this.whiteboardStrokes[stroke.channelId].push(stroke);
    if (this.whiteboardStrokes[stroke.channelId].length > 250) {
      this.whiteboardStrokes[stroke.channelId].shift();
    }
  }

  public clearWhiteboard(channelId: string) {
    this.whiteboardStrokes[channelId] = [];
  }

  public toggleMuteChannel(userId: string, channelId: string): string[] {
    const current = this.mutedByUser[userId] || [];
    if (current.includes(channelId)) {
      this.mutedByUser[userId] = current.filter((id) => id !== channelId);
    } else {
      this.mutedByUser[userId] = [...current, channelId];
    }
    this.scheduleSave();
    return this.mutedByUser[userId];
  }

  public markInboxRead(userId: string) {
    const list = this.inboxByUser[userId] || [];
    for (const item of list) item.read = true;
    this.scheduleSave();
  }

  public reorderServers(orderedIds: string[]) {
    const map = new Map(this.servers.map((s) => [s.id, s]));
    const next: Server[] = [];
    for (const id of orderedIds) {
      const s = map.get(id);
      if (s) {
        next.push(s);
        map.delete(id);
      }
    }
    for (const rest of map.values()) next.push(rest);
    this.servers = next;
    this.scheduleSave();
  }

  public exportUserData(userId: string) {
    const user = this.users[userId];
    const authoredMessages = Object.values(this.messages)
      .flat()
      .filter((m) => m.authorId === userId);
    return {
      exportedAt: new Date().toISOString(),
      account: user,
      serversJoined: this.servers.filter((s) => s.members.some((m) => m.userId === userId)).map((s) => ({ id: s.id, name: s.name })),
      friends: this.friendsByUser[userId] || [],
      messagesCount: authoredMessages.length,
      messages: authoredMessages,
    };
  }

  public updatePresence(userId: string, status: PresenceStatus, customStatus?: User['customStatus']): User | undefined {
    const user = this.users[userId];
    if (!user) return undefined;
    user.status = status;
    if (customStatus !== undefined) user.customStatus = customStatus;
    this.scheduleSave();
    return user;
  }
}
