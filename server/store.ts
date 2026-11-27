import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActiveSession,
  AppStateSnapshot,
  AuthProvider,
  AutoModRule,
  Channel,
  ChannelType,
  DirectMessageThread,
  FeatureBallQuestsState,
  FriendInviteCode,
  FriendRelation,
  InboxItem,
  InviteLink,
  InviteRewardTier,
  Message,
  MessageAttachment,
  OrbTransaction,
  PermissionKey,
  PollData,
  PresenceStatus,
  QuestItem,
  Role,
  ScheduledEvent,
  Server,
  ServerFolder,
  ServerRank,
  SupportTicket,
  Thread,
  TicketBotConfig,
  TicketCategory,
  TicketStatus,
  User,
  UserSettings,
  VoiceClip,
  VoiceParticipant,
  WhiteboardStroke,
} from '../src/shared/types.ts';
import { ORBS_SHOP_ITEM_BY_ID } from '../src/shared/orbsCatalog.ts';
import { createInitialSeedData, DEFAULT_USER_SETTINGS } from './seed.ts';
import {
  ALL_QUEST_DEFS,
  buildFeatureBallQuestsState,
  createEmptyQuestRecord,
  normalizeQuestRecord,
  PROFILE_EDIT_COST,
  QUEST_DEF_BY_ID,
  SERVER_BOOST_COST,
  type UserQuestRecord,
} from './quests.ts';

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
  private tickets: SupportTicket[] = [];
  private ticketCounter = 1001;
  private voiceParticipants: VoiceParticipant[];
  private whiteboardStrokes: Record<string, WhiteboardStroke[]>;
  private botDirectory: ReturnType<typeof createInitialSeedData>['botDirectory'];
  private inboxByUser: Record<string, InboxItem[]>;
  private sessionsByUser: Record<string, ActiveSession[]>;
  private mutedByUser: Record<string, string[]>;
  private unreadByUser: Record<string, string[]>;
  private authRecords: Record<string, AuthRecord> = {};
  private questsByUser: Record<string, UserQuestRecord> = {};
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
    this.ensureCoreBotsAndTicketSetup(seed);
  }

  private ensureCoreBotsAndTicketSetup(seed: ReturnType<typeof createInitialSeedData>) {
    // Ensure Help Bot and Ticket Bot always exist in users & bot directory
    if (!this.users['bot-help'] && seed.users['bot-help']) {
      this.users['bot-help'] = seed.users['bot-help'];
    }
    if (!this.users['bot-ticket'] && seed.users['bot-ticket']) {
      this.users['bot-ticket'] = seed.users['bot-ticket'];
    }
    if (!this.botDirectory.some((b) => b.id === 'bot-ticket')) {
      const ticketBotEntry = seed.botDirectory.find((b) => b.id === 'bot-ticket');
      if (ticketBotEntry) this.botDirectory.push(ticketBotEntry);
    }

    // Automatically ensure Ticket Bot is installed and configured in every server
    for (const server of this.servers) {
      if (!server.installedBotIds.includes('bot-ticket')) {
        server.installedBotIds.push('bot-ticket');
      }
      if (!server.members.some((m) => m.userId === 'bot-ticket')) {
        const defaultRole =
          server.roles.find((r) => r.name === '@everyone') || server.roles[server.roles.length - 1];
        server.members.push({
          userId: 'bot-ticket',
          roleIds: defaultRole ? [defaultRole.id] : [],
          joinedAt: new Date().toISOString(),
          rulesAccepted: true,
        });
      }
      if (!server.ticketBot) {
        const seededMatch = seed.servers.find((s) => s.id === server.id);
        server.ticketBot = seededMatch?.ticketBot || {
          enabled: true,
          welcomeMessage:
            'Have a question, need help, or ready to claim an invite reward? Generate a personal ticket below and server staff will assist you privately.',
          inviteRewardsEnabled: false,
          inviteRewards: [],
        };
      }
      if (!server.memberInviteCounts) {
        const seededMatch = seed.servers.find((s) => s.id === server.id);
        server.memberInviteCounts = seededMatch?.memberInviteCounts || {};
      }

      // Ensure every server has a marked Default Server Invite Link (isDefault: true, isCustom: false)
      let defaultInvite = server.invites.find((inv) => inv.isDefault);
      if (!defaultInvite) {
        const vanityMatch = server.vanityCode
          ? server.invites.find((inv) => inv.code.toLowerCase() === server.vanityCode!.toLowerCase())
          : undefined;
        if (vanityMatch && !vanityMatch.isCustom) {
          vanityMatch.isDefault = true;
          vanityMatch.isCustom = false;
          defaultInvite = vanityMatch;
        } else if (server.invites[0] && !server.invites[0].isCustom) {
          server.invites[0].isDefault = true;
          server.invites[0].isCustom = false;
          defaultInvite = server.invites[0];
        } else {
          const fallbackCode = server.vanityCode || `${server.id.replace(/^srv-/, '')}-default`;
          defaultInvite = {
            code: fallbackCode,
            serverId: server.id,
            createdBy: server.ownerId,
            uses: 0,
            maxUses: 0,
            temporary: false,
            isDefault: true,
            isCustom: false,
          };
          server.invites.unshift(defaultInvite);
        }
      }

      // Ensure every server has a designated #bot-cmd channel with a pinned Default Server Link message
      let botCmdChannel =
        (server.botCmdChannelId && server.channels.find((c) => c.id === server.botCmdChannelId)) ||
        server.channels.find((c) => c.isBotCmdChannel || c.name === 'bot-cmd');
      if (!botCmdChannel) {
        const firstTextCat = server.categories[0]?.id;
        botCmdChannel = {
          id: `ch-${server.id.replace(/^srv-/, '')}-bot-cmd`,
          serverId: server.id,
          categoryId: firstTextCat,
          name: server.botCmdConfig?.channelName || 'bot-cmd',
          type: 'text',
          topic: 'Run bot commands here (-i to check invites, /invite link for personal tracked links).',
          position: server.channels.length,
          slowmodeSeconds: 0,
          isPrivate: false,
          ageRestricted: false,
          isBotCmdChannel: true,
        };
        server.channels.push(botCmdChannel);
      } else {
        botCmdChannel.isBotCmdChannel = true;
      }
      server.botCmdChannelId = botCmdChannel.id;
      if (!server.botCmdConfig) {
        server.botCmdConfig = {
          channelName: botCmdChannel.name,
          enabledCommands: ['-i', '/invite link', '/ticket', '/poll', '/roll', '/coinflip', '/remind', '/serverinfo', '/help'],
        };
      }
      this.ensurePinnedDefaultInviteMessage(server, botCmdChannel, defaultInvite.code);

      // Ensure every server has cosmetic zero-permission ranks & boost tracking
      if (!Array.isArray(server.shopRanks) || server.shopRanks.length === 0) {
        server.shopRanks = [
          { id: `rank-${server.id}-bronze`, name: 'Bronze Member', color: '#CD7F32', price: 20, badge: '🥉', permissions: [] },
          { id: `rank-${server.id}-silver`, name: 'Silver Star', color: '#94A3B8', price: 50, badge: '🥈', permissions: [] },
          { id: `rank-${server.id}-gold`, name: 'Gold Legend', color: '#F59E0B', price: 120, badge: '👑', permissions: [] },
        ];
      } else {
        // Strictly enforce zero permissions on every cosmetic rank
        server.shopRanks = server.shopRanks.map((r) => ({ ...r, permissions: [] }));
      }
      if (!server.memberRanks) server.memberRanks = {};
      if (typeof server.boostCount !== 'number') server.boostCount = 0;
      if (typeof server.boostLevel !== 'number') server.boostLevel = this.computeBoostLevel(server.boostCount);
      if (!Array.isArray(server.boosters)) server.boosters = [];
    }

    // Ensure every user has a numeric Feature Ball wallet
    for (const u of Object.values(this.users)) {
      if (typeof u.featureBalls !== 'number' || Number.isNaN(u.featureBalls)) {
        u.featureBalls = 0;
      }
      if (!Array.isArray(u.ownedDecorations)) {
        u.ownedDecorations = [];
      }
    }
  }

  private computeBoostLevel(boostCount: number): number {
    if (boostCount >= 14) return 3;
    if (boostCount >= 7) return 2;
    if (boostCount >= 2) return 1;
    return 0;
  }

  private ensurePinnedDefaultInviteMessage(server: Server, botCmdChannel: Channel, defaultCode: string) {
    if (!this.messages[botCmdChannel.id]) {
      this.messages[botCmdChannel.id] = [];
    }
    const existingPinned = this.messages[botCmdChannel.id].find(
      (m) => m.pinned && m.embed?.title === 'Default Server Invite Link (Pinned)'
    );
    if (!existingPinned) {
      const pinnedMsg: Message = {
        id: `msg-pin-${server.id}`,
        channelId: botCmdChannel.id,
        authorId: 'bot-relay',
        content: '',
        pinned: true,
        embed: {
          title: 'Default Server Invite Link (Pinned)',
          description: `Share **${server.name}** with the default server link: \`https://livechatter.app/invite/${defaultCode}\` (code: \`${defaultCode}\`).\n\n**Important:** Joining through this default server link does **not** increase anyone's invite count. To earn tracked invites, run \`/invite link\` here to create your own personal custom invite link (supports expiry periods & **Never**), and type \`-i\` to check your invite count.`,
          fields: [
            { name: 'Default Invite Code', value: defaultCode },
            { name: 'Invite Count Credit', value: 'Does NOT count toward personal invites' },
            { name: 'Personal Commands', value: '`-i` (check invites) · `/invite link` (custom link)' },
          ],
          footer: `Pinned in #${botCmdChannel.name} · Bot commands are only allowed in this channel`,
        },
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        reactions: [],
        attachments: [],
      };
      this.messages[botCmdChannel.id].unshift(pinnedMsg);
    }
  }

  public getDefaultInviteCode(server: Server): string {
    const def = server.invites.find((i) => i.isDefault) || server.invites.find((i) => !i.isCustom);
    return def?.code || server.vanityCode || server.id;
  }

  private parseInviteExpiryArg(rawArg: string): { minutes: number | null; label: string } {
    const norm = rawArg.trim().toLowerCase();
    if (!norm || norm === 'never' || norm === 'none' || norm === '0' || norm === 'forever') {
      return { minutes: null, label: 'Never expires' };
    }
    if (norm === '30m' || norm === '30min' || norm === '30mins') {
      return { minutes: 30, label: '30 Minutes' };
    }
    if (norm === '1h' || norm === '60m' || norm === '1hr' || norm === 'hour') {
      return { minutes: 60, label: '1 Hour' };
    }
    if (norm === '6h' || norm === '6hr') {
      return { minutes: 360, label: '6 Hours' };
    }
    if (norm === '12h' || norm === '12hr') {
      return { minutes: 720, label: '12 Hours' };
    }
    if (norm === '24h' || norm === '1d' || norm === 'day') {
      return { minutes: 1440, label: '24 Hours' };
    }
    if (norm === '7d' || norm === 'week' || norm === '1w') {
      return { minutes: 10080, label: '7 Days' };
    }
    if (norm === '30d' || norm === 'month') {
      return { minutes: 43200, label: '30 Days' };
    }
    const numMatch = norm.match(/^(\d+)(m|h|d)$/);
    if (numMatch) {
      const val = Math.max(1, Number(numMatch[1]));
      const unit = numMatch[2];
      if (unit === 'm') return { minutes: val, label: `${val} Minute${val === 1 ? '' : 's'}` };
      if (unit === 'h') return { minutes: val * 60, label: `${val} Hour${val === 1 ? '' : 's'}` };
      if (unit === 'd') return { minutes: val * 1440, label: `${val} Day${val === 1 ? '' : 's'}` };
    }
    return { minutes: null, label: 'Never expires' };
  }

  private formatExpiryLabel(expiresInMinutes: number | null): string {
    if (!expiresInMinutes || expiresInMinutes <= 0) return 'Never expires';
    if (expiresInMinutes < 60) return `${expiresInMinutes} Minutes`;
    if (expiresInMinutes < 1440) {
      const hrs = Math.round(expiresInMinutes / 60);
      return `${hrs} Hour${hrs === 1 ? '' : 's'}`;
    }
    const days = Math.round(expiresInMinutes / 1440);
    return `${days} Day${days === 1 ? '' : 's'}`;
  }

  public createCustomServerInvite(
    userId: string,
    serverId: string,
    expiresInMinutes: number | null,
    postToBotCmd = true
  ): { server: Server; invite: InviteLink; message?: Message } {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found.');
    if (!server.members.some((m) => m.userId === userId)) {
      throw new Error('You must be a member of this server to create a custom invite link.');
    }
    const user = this.users[userId];
    const userPrefix = (user?.username || 'member').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'user';
    const code = `inv-${userPrefix}-${crypto.randomBytes(2).toString('hex')}`;
    const validMinutes =
      typeof expiresInMinutes === 'number' && Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
        ? Math.min(Math.round(expiresInMinutes), 60 * 24 * 365)
        : null;
    const expiresAt = validMinutes ? new Date(Date.now() + validMinutes * 60_000).toISOString() : undefined;

    const invite: InviteLink = {
      code,
      serverId: server.id,
      createdBy: userId,
      uses: 0,
      maxUses: 0,
      temporary: false,
      expiresAt,
      isDefault: false,
      isCustom: true,
    };
    server.invites.unshift(invite);
    this.appendAudit(
      server,
      userId,
      'Created Custom Invite Link',
      code,
      validMinutes ? `Expires in ${this.formatExpiryLabel(validMinutes)}` : 'Never expires'
    );

    let message: Message | undefined;
    if (postToBotCmd) {
      const botCmdChannel =
        (server.botCmdChannelId && server.channels.find((c) => c.id === server.botCmdChannelId)) ||
        server.channels.find((c) => c.isBotCmdChannel) ||
        server.channels[0];
      if (botCmdChannel) {
        if (!this.messages[botCmdChannel.id]) this.messages[botCmdChannel.id] = [];
        message = this.buildCustomInviteEmbedMessage(botCmdChannel.id, undefined, user, server, invite, validMinutes);
        this.messages[botCmdChannel.id].push(message);
      }
    }

    this.scheduleSave();
    return { server, invite, message };
  }

  private buildCustomInviteEmbedMessage(
    channelId: string,
    threadId: string | undefined,
    author: User | undefined,
    server: Server,
    invite: InviteLink,
    validMinutes: number | null
  ): Message {
    const expiryLabel = this.formatExpiryLabel(validMinutes);
    return {
      id: `msg-${crypto.randomBytes(6).toString('hex')}`,
      channelId,
      threadId,
      authorId: 'bot-relay',
      content: '',
      embed: {
        title: `Custom Invite Link for ${author?.displayName || 'Member'}`,
        description: `Share your personal custom link: \`https://livechatter.app/invite/${invite.code}\`\n\nWhenever a new person joins **${server.name}** using **this custom link**, your personal invite count increases by **+1** (check anytime with \`-i\`).`,
        fields: [
          { name: 'Custom Invite Code', value: invite.code },
          { name: 'Link Expiry', value: invite.expiresAt ? `${expiryLabel} (${new Date(invite.expiresAt).toLocaleString()})` : 'Never expires' },
          { name: 'Tracked Invite Count', value: 'Counts +1 per new member who joins with this link' },
        ],
        footer: 'Custom Personal Invite · Default server link joins do not count',
      },
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [],
    };
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
        if (Array.isArray(parsed.tickets)) {
          this.tickets = parsed.tickets;
        }
        if (typeof parsed.ticketCounter === 'number' && parsed.ticketCounter >= 1001) {
          this.ticketCounter = parsed.ticketCounter;
        }
        this.inboxByUser = parsed.inboxByUser || this.inboxByUser;
        this.mutedByUser = parsed.mutedByUser || this.mutedByUser;
        this.authRecords = parsed.authRecords || {};
        this.questsByUser = parsed.questsByUser || {};
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
              tickets: this.tickets,
              ticketCounter: this.ticketCounter,
              inboxByUser: this.inboxByUser,
              mutedByUser: this.mutedByUser,
              authRecords: this.authRecords,
              questsByUser: this.questsByUser,
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

    // New users start with NO human friends — only the LiveChatter Help Bot
    this.friendsByUser[userId] = [
      { userId: 'bot-help', status: 'accepted', createdAt: new Date().toISOString() },
    ];
    this.inboxByUser[userId] = [];
    this.mutedByUser[userId] = [];
    this.unreadByUser[userId] = [];

    // Open an automatic welcome DM with LiveChatter Help Bot
    const helpDmId = `dm-help-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();
    this.dms.unshift({
      id: helpDmId,
      isGroup: false,
      participantIds: [userId, 'bot-help'],
      lastMessageAt: nowIso,
    });
    this.messages[helpDmId] = [
      {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: helpDmId,
        authorId: 'bot-help',
        content: `Welcome to **LiveChatter**, **${newUser.displayName}**! 👋\n\nI’m the **LiveChatter Help Bot** — right now I’m the only contact in your Friends list until you add or invite people.\n\n**Quick ways to get started:**\n- **Invite friends on their phone**: Click **Invite Friends** to send your invite code on **WhatsApp**, **Gmail**, or **Messages**.\n- **Redeem an invite code**: Got a code from a friend? Click **Redeem Code** in the Friends tab.\n- **Need help in a server?**: Every server includes **Ticket Bot** so you can open a personal ticket for queries, help, or collecting invite rewards.\n\nReply here anytime with keywords like \`invites\`, \`tickets\`, \`friends\`, or \`servers\` and I’ll guide you!`,
        createdAt: nowIso,
        reactions: [],
        attachments: [],
      },
    ];

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

  public authenticateWithProvider(input: {
    provider: AuthProvider;
    email: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    mode?: 'signin' | 'signup';
  }): { token: string; user: User; isNewUser: boolean } {
    const provider: AuthProvider =
      input.provider === 'google' || input.provider === 'github' || input.provider === 'microsoft'
        ? input.provider
        : 'google';
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error(`Please provide a valid ${provider} email address.`);
    }

    const existingUser = Object.values(this.users).find(
      (u) => !u.isBot && u.email && u.email.toLowerCase() === email
    );

    if (existingUser) {
      if (!existingUser.authProvider) existingUser.authProvider = provider;
      if (input.avatarUrl && !existingUser.avatarUrl) existingUser.avatarUrl = input.avatarUrl;
      if (typeof existingUser.featureBalls !== 'number') existingUser.featureBalls = 0;
      this.scheduleSave();
      const { token, user } = this.issueSession(existingUser.id, `${provider.toUpperCase()} Sign-In`);
      return { token, user, isNewUser: false };
    }

    // Create a brand new user linked to Google / GitHub / Microsoft
    const baseName = (input.username || email.split('@')[0] || 'member')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 20) || 'member';
    let candidateUsername = baseName;
    let suffix = 1;
    while (Object.values(this.users).some((u) => u.username.toLowerCase() === candidateUsername)) {
      candidateUsername = `${baseName}${suffix++}`;
    }

    const userId = `user-${crypto.randomBytes(5).toString('hex')}`;
    const palette = ['#2563EB', '#059669', '#D97706', '#0D9488', '#E11D48', '#4F46E5'];
    const color = palette[Math.floor(Math.random() * palette.length)];
    const displayName = (input.displayName || baseName).trim().slice(0, 48) || candidateUsername;
    const providerLabel = provider === 'google' ? 'Google' : provider === 'github' ? 'GitHub' : 'Microsoft';

    const newUser: User = {
      id: userId,
      username: candidateUsername,
      displayName,
      email,
      authProvider: provider,
      avatarUrl: input.avatarUrl,
      avatarColor: color,
      bannerColor: '#1E293B',
      ownedDecorations: [],
      featureBalls: 0,
      bio: `Signed in with ${providerLabel} on LiveChatter.`,
      pronouns: '',
      status: 'online',
      connectedAccounts:
        provider === 'github'
          ? [{ id: `ca-${crypto.randomBytes(3).toString('hex')}`, platform: 'GitHub', handle: candidateUsername, verified: true }]
          : [],
      createdAt: new Date().toISOString(),
      settings: { ...DEFAULT_USER_SETTINGS },
    };

    this.users[userId] = newUser;

    const kernel = this.servers.find((s) => s.id === 'srv-kernel');
    if (kernel && !kernel.members.some((m) => m.userId === userId)) {
      kernel.members.push({
        userId,
        roleIds: ['role-k-everyone'],
        joinedAt: new Date().toISOString(),
        rulesAccepted: true,
      });
    }

    // New users start with NO human friends — only the LiveChatter Help Bot
    this.friendsByUser[userId] = [
      { userId: 'bot-help', status: 'accepted', createdAt: new Date().toISOString() },
    ];
    this.inboxByUser[userId] = [];
    this.mutedByUser[userId] = [];
    this.unreadByUser[userId] = [];
    this.questsByUser[userId] = createEmptyQuestRecord();

    const helpDmId = `dm-help-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();
    this.dms.unshift({
      id: helpDmId,
      isGroup: false,
      participantIds: [userId, 'bot-help'],
      lastMessageAt: nowIso,
    });
    this.messages[helpDmId] = [
      {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: helpDmId,
        authorId: 'bot-help',
        content: `Welcome to **LiveChatter**, **${newUser.displayName}**! 👋\n\nYou signed in with **${providerLabel}** and passed human verification.\n\n**Quick ways to get started:**\n- **Feature Balls**: Open the **Feature Ball** hub on the left rail to complete **Daily (10)**, **Weekly (70)**, and **Monthly (310)** quests to earn Feature Balls for profile editing, server cosmetic ranks, and **Server Boosts (100 Feature Balls)**!\n- **Invite friends on their phone**: Click **Invite Friends** to send your code via **WhatsApp**, **Gmail**, or **Messages**.\n- **Ticket Bot & #bot-cmd**: Every server includes Ticket Bot and a dedicated \`#bot-cmd\` tab.`,
        createdAt: nowIso,
        reactions: [],
        attachments: [],
      },
    ];

    this.scheduleSave();
    const { token, user } = this.issueSession(userId, `${providerLabel} Sign-In`);
    return { token, user, isNewUser: true };
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
      tickets: this.tickets.filter((t) => this.canAccessTicket(userId, t)),
      voiceParticipants: this.voiceParticipants,
      whiteboardStrokes: this.whiteboardStrokes,
      botDirectory: this.botDirectory,
      inbox: this.inboxByUser[userId] || [],
      sessions: this.sessionsByUser[userId] || [],
      mutedChannelIds: this.mutedByUser[userId] || [],
      unreadChannelIds: this.unreadByUser[userId] || [],
      featureBallQuests: this.getQuestsState(userId),
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

  private validateSafeImageUrl(value: unknown, label: string): string | undefined {
    if (value === null || value === '') return undefined;
    if (typeof value !== 'string') {
      throw new Error(`${label} must be a valid image.`);
    }
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > 2_500_000) {
      throw new Error(`${label} is too large. Please upload a smaller image.`);
    }
    const isSafeDataUrl = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed);
    const isSafeHttpsUrl = /^https:\/\/[^\s"'<>]+$/i.test(trimmed) && trimmed.length <= 2048;
    if (!isSafeDataUrl && !isSafeHttpsUrl) {
      throw new Error(`${label} must be a PNG, JPG, WebP, or GIF image.`);
    }
    return trimmed;
  }

  public updateUserProfile(
    userId: string,
    patch: Partial<
      Pick<
        User,
        | 'displayName'
        | 'bio'
        | 'pronouns'
        | 'status'
        | 'customStatus'
        | 'bannerColor'
        | 'avatarColor'
        | 'avatarDecoration'
        | 'profileEffect'
      >
    > & {
      avatarUrl?: string | null;
      settings?: Partial<UserSettings>;
    }
  ): { user: User; chargedFeatureBalls: number } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found');

    // Profile image (avatarUrl) edits are always FREE (0 Feature Balls).
    // Other profile customizations cost PROFILE_EDIT_COST Feature Balls.
    const isPaidProfileEdit =
      patch.displayName !== undefined ||
      patch.bio !== undefined ||
      patch.pronouns !== undefined ||
      patch.bannerColor !== undefined ||
      patch.avatarColor !== undefined ||
      patch.avatarDecoration !== undefined ||
      patch.profileEffect !== undefined;

    let validatedAvatarUrl: string | undefined;
    const hasAvatarChange = 'avatarUrl' in patch;
    if (hasAvatarChange) {
      validatedAvatarUrl = this.validateSafeImageUrl(patch.avatarUrl, 'Profile image');
    }

    let chargedFeatureBalls = 0;
    if (isPaidProfileEdit) {
      const balance = user.featureBalls || 0;
      if (balance < PROFILE_EDIT_COST) {
        throw new Error(
          `Editing your profile details requires ${PROFILE_EDIT_COST} Feature Balls (you have ${balance}). Updating your profile image is free — complete Daily, Weekly, or Monthly quests to earn Feature Balls for other edits!`
        );
      }
      user.featureBalls = balance - PROFILE_EDIT_COST;
      chargedFeatureBalls = PROFILE_EDIT_COST;
      this.recordOrbTransaction(user, {
        amount: PROFILE_EDIT_COST,
        type: 'spend',
        title: 'Customized Discord-style profile details',
        category: 'profile',
      });
    }

    if (hasAvatarChange) {
      user.avatarUrl = validatedAvatarUrl;
    }
    if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
      user.displayName = patch.displayName.trim().slice(0, 48);
    }
    if (typeof patch.bio === 'string') user.bio = patch.bio.slice(0, 240);
    if (typeof patch.pronouns === 'string') user.pronouns = patch.pronouns.slice(0, 32);
    if (patch.status) user.status = patch.status;
    if ('customStatus' in patch) user.customStatus = patch.customStatus;
    if (patch.bannerColor) user.bannerColor = patch.bannerColor;
    if (patch.avatarColor) user.avatarColor = patch.avatarColor;
    if ('avatarDecoration' in patch) user.avatarDecoration = patch.avatarDecoration || undefined;
    if ('profileEffect' in patch) user.profileEffect = patch.profileEffect || undefined;
    if (patch.settings) {
      user.settings = { ...user.settings, ...patch.settings };
    }
    this.scheduleSave();
    return { user, chargedFeatureBalls };
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
  }): { messages: Message[]; serverUpdated?: Server; inboxItem?: InboxItem; createdTicket?: SupportTicket } {
    // Support personal Ticket Bot conversations
    const ticket = this.tickets.find((t) => t.id === input.channelId);
    if (ticket) {
      if (!this.canAccessTicket(input.userId, ticket)) {
        throw new Error('You do not have permission to access this personal ticket.');
      }
      if (ticket.status === 'closed') {
        throw new Error('This ticket is closed. Reopen it to send new messages.');
      }
      const trimmed = input.content.trim();
      if (!trimmed && (!input.attachments || input.attachments.length === 0)) {
        throw new Error('Message cannot be empty.');
      }
      if (!this.messages[ticket.id]) this.messages[ticket.id] = [];
      const msg: Message = {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: ticket.id,
        authorId: input.userId,
        content: trimmed.slice(0, 4000),
        createdAt: new Date().toISOString(),
        reactions: [],
        attachments: (input.attachments || []).slice(0, 4),
      };
      this.messages[ticket.id].push(msg);
      ticket.updatedAt = msg.createdAt;
      this.scheduleSave();
      return { messages: [msg] };
    }

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

    const isBotCommand = !input.poll && !input.voiceClip && (trimmed.startsWith('/') || /^-i(\s|$)/i.test(trimmed));
    if (isBotCommand) {
      if (loc.server && loc.channel) {
        const isBotCmdChannel =
          Boolean(loc.channel.isBotCmdChannel) || loc.channel.id === loc.server.botCmdChannelId;
        if (!isBotCmdChannel) {
          const targetCmdChannel =
            (loc.server.botCmdChannelId && loc.server.channels.find((c) => c.id === loc.server!.botCmdChannelId)) ||
            loc.server.channels.find((c) => c.isBotCmdChannel);
          throw new Error(
            `Bot commands can only be entered in #${targetCmdChannel?.name || 'bot-cmd'}.`
          );
        }
      }

      const beforeTicketCount = this.tickets.length;
      const cmdResult = this.handleSlashCommand(trimmed, input.userId, input.channelId, input.threadId, loc.server);
      if (cmdResult) {
        this.messages[bucketKey].push(cmdResult.message);
        if (input.threadId) {
          const thr = this.threads.find((t) => t.id === input.threadId);
          if (thr) thr.lastActivityAt = cmdResult.message.createdAt;
        }
        const createdTicket = this.tickets.length > beforeTicketCount ? this.tickets[0] : undefined;
        this.scheduleSave();
        return { messages: [cmdResult.message], createdTicket, serverUpdated: cmdResult.serverUpdated };
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
      // LiveChatter Help Bot instant automated reply in DMs
      if (loc.dm.participantIds.includes('bot-help') && input.userId !== 'bot-help') {
        const reply = this.buildHelpBotReply(trimmed, input.userId, loc.dm.id);
        this.messages[bucketKey].push(reply);
        loc.dm.lastMessageAt = reply.createdAt;
        this.scheduleSave();
        return { messages: [msg, reply] };
      }
    }

    this.scheduleSave();
    return { messages: [msg] };
  }

  private buildHelpBotReply(userText: string, userId: string, dmId: string): Message {
    const q = userText.toLowerCase();
    const user = this.users[userId];
    let text = `Hi **${user?.displayName || 'there'}**! Here’s what I can help with on LiveChatter:\n\n• **Invites** — Open **Invite Friends** to send your invite code on **WhatsApp**, **Gmail**, or **Messages**.\n• **Friends** — Add friends by username or click **Redeem Code** to accept a friend's invite code.\n• **Tickets & Rewards** — Open **Ticket Bot** in any server sidebar (or type \`/ticket\`) to create a personal ticket for queries, help, or claiming server invite rewards.\n• **Servers** — Click **+** on the left rail to create a server or join one by invite code.`;

    if (q.includes('invite') || q.includes('whatsapp') || q.includes('gmail') || q.includes('message') || q.includes('code')) {
      text = `**Inviting Friends via Phone (WhatsApp, Gmail, or Messages):**\n1. Open **Friends → Invite Friends** (or **Invite People** in any server menu).\n2. Copy your personal code or tap **WhatsApp**, **Gmail**, or **Messages** to send it straight to their phone.\n3. When they tap the link or enter the code under **Redeem Code**, you’ll be connected automatically — and if you attached a server, your server invite count increases for invite rewards!`;
    } else if (q.includes('ticket') || q.includes('reward') || q.includes('claim')) {
      text = `**Using Ticket Bot & Claiming Invite Rewards:**\n1. Open any server and click **Ticket Bot** at the top of the channel sidebar (or type \`/ticket\` in chat).\n2. Click **New Personal Ticket** and pick **General Query**, **Help & Support**, or **Collect Invite Reward**.\n3. Your ticket is completely private between you and the server staff. Server owners can configure invite reward tiers anytime under **Server Settings → Ticket Bot & Rewards**.`;
    } else if (q.includes('friend') || q.includes('add')) {
      text = `**Adding Friends:**\nNew accounts start with only me (Help Bot) so your Friends list stays clean and private. Go to **Home → Friends** to add someone by username, send your invite code over **WhatsApp / Gmail / Messages**, or click **Redeem Code** if a friend sent you one.`;
    } else if (q.includes('server') || q.includes('create') || q.includes('join')) {
      text = `**Creating or Joining Servers:**\nClick the **+** button on the left server rail to create a server from a template (Gaming, Study, Open Source, Friends, Creators) or join via an invite code. Every server you create automatically includes **Ticket Bot** ready for personal support tickets and invite rewards!`;
    }

    return {
      id: `msg-${crypto.randomBytes(6).toString('hex')}`,
      channelId: dmId,
      authorId: 'bot-help',
      content: text,
      createdAt: new Date(Date.now() + 250).toISOString(),
      reactions: [],
      attachments: [],
    };
  }

  private handleSlashCommand(
    raw: string,
    userId: string,
    channelId: string,
    threadId: string | undefined,
    server?: Server
  ): { message: Message; serverUpdated?: Server } | null {
    const [rawCmd, ...restParts] = raw.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
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

    // -i command: Check verified personal invite count (counts ONLY joins via personal custom links)
    if (cmd === '-i' && server) {
      let targetUser: User | undefined = author;
      if (rest) {
        const lookup = rest.replace(/^@/, '').toLowerCase();
        const matchedMember = server.members.find((m) => {
          const u = this.users[m.userId];
          return u && (u.username.toLowerCase() === lookup || u.displayName.toLowerCase().includes(lookup));
        });
        if (matchedMember) {
          targetUser = this.users[matchedMember.userId];
        }
      }
      const targetId = targetUser?.id || userId;
      const inviteCount = server.memberInviteCounts?.[targetId] || 0;
      const customLinks = server.invites.filter((inv) => inv.isCustom && !inv.isDefault && inv.createdBy === targetId);
      const totalCustomUses = customLinks.reduce((sum, inv) => sum + inv.uses, 0);

      const fields: { name: string; value: string }[] = [
        { name: 'Verified Invites', value: `${inviteCount} ${inviteCount === 1 ? 'person' : 'people'}` },
        { name: 'Personal Custom Links', value: `${customLinks.length} created (${totalCustomUses} uses)` },
      ];

      if (server.ticketBot?.inviteRewardsEnabled && server.ticketBot.inviteRewards.length > 0) {
        const sortedTiers = [...server.ticketBot.inviteRewards].sort((a, b) => a.requiredInvites - b.requiredInvites);
        const nextTier = sortedTiers.find((t) => inviteCount < t.requiredInvites);
        const unlockedCount = sortedTiers.filter((t) => inviteCount >= t.requiredInvites).length;
        fields.push({
          name: 'Invite Rewards',
          value: nextTier
            ? `${unlockedCount} unlocked · Next: ${nextTier.title} (${inviteCount}/${nextTier.requiredInvites})`
            : `All ${unlockedCount} reward tiers unlocked! Claim via Ticket Bot.`,
        });
      }

      return {
        message: {
          ...base,
          content: '',
          embed: {
            title: `Invite Tracker — ${targetUser?.displayName || 'Member'}`,
            description: `**${targetUser?.displayName || 'Member'}** currently has **${inviteCount}** verified ${
              inviteCount === 1 ? 'invite' : 'invites'
            } in **${server.name}**.\n\n*Only people who join using your personal custom \`/invite link\` count toward this total. Joins via the default server link are not counted.*`,
            fields,
            footer: 'Command: -i · Create your own tracked link with /invite link',
          },
        },
      };
    }

    // /invite link [expiry] command: Generate personal custom invite link with expiry period (Never enabled)
    if (cmd === '/invite' && server) {
      const sub = (restParts[0] || '').toLowerCase();
      if (sub === 'link' || !sub) {
        const expiryArg = sub === 'link' ? restParts.slice(1).join(' ') : '';
        const parsed = this.parseInviteExpiryArg(expiryArg);
        const { invite } = this.createCustomServerInvite(userId, server.id, parsed.minutes, false);
        return {
          message: this.buildCustomInviteEmbedMessage(channelId, threadId, author, server, invite, parsed.minutes),
          serverUpdated: server,
        };
      }
    }

    if (cmd === '/poll') {
      const parts = rest.split('|').map((s) => s.trim()).filter(Boolean);
      const question = parts[0] || 'Quick Community Poll';
      const options = (parts.length >= 3 ? parts.slice(1) : ['Yes', 'No']).slice(0, 6).map((text, idx) => ({
        id: `opt-${idx + 1}`,
        text,
        voterIds: [],
      }));
      return {
        message: {
          ...base,
          content: `Poll created by **${author?.displayName || 'Member'}**`,
          poll: {
            question,
            options,
            expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
            allowMultiple: false,
          },
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
        message: {
          ...base,
          content: `**${author?.displayName}** rolled \`${count}d${sides}\` → **${total}** (${rolls.join(', ')})`,
        },
      };
    }

    if (cmd === '/coinflip') {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      return {
        message: {
          ...base,
          content: `**${author?.displayName}** flipped a coin → **${result}**`,
        },
      };
    }

    if (cmd === '/remind') {
      return {
        message: {
          ...base,
          content: '',
          embed: {
            title: 'Scheduled Reminder',
            description: rest || 'Follow up with the team in this channel.',
            fields: [{ name: 'Set by', value: author?.displayName || 'Member' }],
            footer: 'Relay Utility · Bot Command',
          },
        },
      };
    }

    if (cmd === '/serverinfo' && server) {
      const onlineCount = server.members.filter((m) => {
        const st = this.users[m.userId]?.status;
        return st && st !== 'offline' && st !== 'invisible';
      }).length;
      return {
        message: {
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
            footer: `Default server invite: livechatter.app/invite/${this.getDefaultInviteCode(server)}`,
          },
        },
      };
    }

    if (cmd === '/ticket' && server) {
      const subject = rest || 'General support request';
      const { ticket } = this.createTicket(userId, server.id, {
        category: 'help',
        subject,
        details: `Opened via /ticket command by @${author?.username || 'member'}.`,
      });
      return {
        message: {
          ...base,
          authorId: 'bot-ticket',
          content: '',
          embed: {
            title: `Personal Ticket #TKT-${ticket.ticketNumber} Created`,
            description: `**${author?.displayName}**, your private personal ticket is ready. Click **Ticket Bot** in the sidebar to chat privately with server staff.`,
            fields: [
              { name: 'Subject', value: ticket.subject },
              { name: 'Category', value: 'Help & Support' },
              { name: 'Privacy', value: 'Visible only to you and server staff' },
            ],
            footer: 'Ticket Bot · Automatically installed in every server',
          },
        },
      };
    }

    if (cmd === '/help') {
      const cmdChannelName = server?.botCmdConfig?.channelName || 'bot-cmd';
      return {
        message: {
          ...base,
          content: '',
          embed: {
            title: 'Available Bot Commands',
            description: server
              ? `All server bot commands must be run inside **#${cmdChannelName}**.`
              : 'Run utility commands directly in the composer.',
            fields: [
              { name: '-i [@user]', value: 'Check verified personal invites (custom invite links only)' },
              { name: '/invite link [never|30m|1h|6h|24h|7d|30d]', value: 'Create your personal tracked custom invite link' },
              { name: '/ticket [subject]', value: 'Open a private personal ticket with Ticket Bot' },
              { name: '/poll Question | Option A | Option B', value: 'Create a live interactive poll' },
              { name: '/roll 2d6', value: 'Roll up to 10 dice (default 1d20)' },
              { name: '/coinflip', value: 'Flip a fair coin' },
              { name: '/remind Note', value: 'Post a formatted reminder card' },
              { name: '/serverinfo', value: 'Show current server statistics' },
            ],
            footer: 'Relay Utility & Ticket Bot · Free for all servers',
          },
        },
      };
    }

    return null;
  }

  public editMessage(userId: string, channelId: string, messageId: string, content: string, threadId?: string): Message {
    const bucket = this.messages[threadId || channelId] || [];
    const msg = bucket.find((m) => m.id === messageId);
    if (!msg) throw new Error('Message not found');
    if (this.users[msg.authorId]?.isBot) {
      throw new Error('Bot messages cannot be edited.');
    }
    if (msg.authorId !== userId) {
      throw new Error('Only the original message poster can edit this message.');
    }
    const clean = content.trim().slice(0, 4000);
    if (!clean) throw new Error('Message content cannot be empty.');
    msg.content = clean;
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
    iconUrl?: string;
    botCmdSetup?: { channelName: string; enabledCommands?: string[] };
    ranks?: { name: string; color: string; price: number; badge?: string }[];
  }): Server {
    const validatedIconUrl = input.iconUrl ? this.validateSafeImageUrl(input.iconUrl, 'Server icon image') : undefined;
    const id = `srv-${crypto.randomBytes(4).toString('hex')}`;
    const cat1 = `cat-${crypto.randomBytes(3).toString('hex')}`;
    const cat2 = `cat-${crypto.randomBytes(3).toString('hex')}`;
    const ownerRoleId = `role-${crypto.randomBytes(3).toString('hex')}`;
    const everyoneRoleId = `role-${crypto.randomBytes(3).toString('hex')}`;

    const rawBotCmdName = input.botCmdSetup?.channelName?.trim() || 'bot-cmd';
    const cleanBotCmdName =
      rawBotCmdName.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bot-cmd';
    const enabledCommands = Array.from(
      new Set([
        '-i',
        '/invite link',
        ...(input.botCmdSetup?.enabledCommands && input.botCmdSetup.enabledCommands.length > 0
          ? input.botCmdSetup.enabledCommands
          : ['/ticket', '/poll', '/roll', '/coinflip', '/remind', '/serverinfo', '/help']),
      ])
    );

    // Strictly zero-permission cosmetic server ranks
    const sanitizedRanks: ServerRank[] = (input.ranks || [])
      .filter((r) => r && typeof r.name === 'string' && r.name.trim().length > 0)
      .slice(0, 20)
      .map((r) => ({
        id: `rank-${crypto.randomBytes(4).toString('hex')}`,
        name: r.name.trim().slice(0, 32),
        color: /^#[0-9a-fA-F]{6}$/.test(r.color || '') ? r.color : '#2563EB',
        price: Math.max(1, Math.min(100_000, Math.round(Number(r.price) || 20))),
        badge: (r.badge || '⭐').slice(0, 4),
        permissions: [],
      }));

    const finalRanks: ServerRank[] =
      sanitizedRanks.length > 0
        ? sanitizedRanks
        : [
            { id: `rank-${id}-bronze`, name: 'Bronze Member', color: '#CD7F32', price: 20, badge: '🥉', permissions: [] },
            { id: `rank-${id}-silver`, name: 'Silver Star', color: '#94A3B8', price: 50, badge: '🥈', permissions: [] },
            { id: `rank-${id}-gold`, name: 'Gold Legend', color: '#F59E0B', price: 120, badge: '👑', permissions: [] },
          ];

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

    const botCmdChannel: Channel = {
      id: `ch-${crypto.randomBytes(4).toString('hex')}`,
      serverId: id,
      categoryId: cat1,
      name: cleanBotCmdName,
      type: 'text',
      topic: 'Dedicated bot command channel — run -i, /invite link, and all bot commands here.',
      position: channels.length,
      slowmodeSeconds: 0,
      isPrivate: false,
      ageRestricted: false,
      isBotCmdChannel: true,
    };
    channels.push(botCmdChannel);

    const inviteCode = `${input.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'server'}-${crypto.randomBytes(2).toString('hex')}`;

    const server: Server = {
      id,
      name: input.name.trim().slice(0, 60) || 'Untitled Server',
      description: input.description?.trim() || `Community space for ${input.name.trim()}.`,
      iconColor: input.iconColor || '#2563EB',
      iconUrl: validatedIconUrl,
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
        { userId: 'bot-ticket', roleIds: [everyoneRoleId], joinedAt: new Date().toISOString(), rulesAccepted: true },
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
        {
          id: `al-${crypto.randomBytes(4).toString('hex')}`,
          actorId: input.ownerId,
          action: 'Configured Bot Commands',
          target: `#${cleanBotCmdName} (${enabledCommands.join(', ')})`,
          createdAt: new Date().toISOString(),
        },
        {
          id: `al-${crypto.randomBytes(4).toString('hex')}`,
          actorId: 'bot-ticket',
          action: 'Auto-Installed Bot',
          target: 'Ticket Bot (Personal Tickets & Invite Rewards)',
          createdAt: new Date().toISOString(),
        },
      ],
      events: [],
      invites: [
        {
          code: inviteCode,
          serverId: id,
          createdBy: input.ownerId,
          uses: 0,
          maxUses: 0,
          temporary: false,
          isDefault: true,
          isCustom: false,
        },
      ],
      webhooks: [],
      installedBotIds: ['bot-relay', 'bot-ticket'],
      ticketBot: {
        enabled: true,
        welcomeMessage:
          'Need help, have a question, or want to claim an invite reward? Generate a personal ticket below and server staff will respond privately.',
        inviteRewardsEnabled: false,
        inviteRewards: [],
      },
      memberInviteCounts: {},
      botCmdChannelId: botCmdChannel.id,
      botCmdConfig: {
        channelName: cleanBotCmdName,
        enabledCommands,
      },
      shopRanks: finalRanks,
      memberRanks: {},
      boostCount: 0,
      boostLevel: 0,
      boosters: [],
    };

    this.servers.push(server);
    this.ensurePinnedDefaultInviteMessage(server, botCmdChannel, inviteCode);

    const firstText = channels.find((c) => !c.isBotCmdChannel && (c.type === 'text' || c.type === 'announcement'));
    if (firstText) {
      this.messages[firstText.id] = [
        {
          id: `msg-${crypto.randomBytes(6).toString('hex')}`,
          channelId: firstText.id,
          authorId: 'bot-relay',
          content: `Welcome to **${server.name}**! Run bot commands like \`-i\` and \`/invite link\` inside **#${cleanBotCmdName}**, where the default server link (\`${inviteCode}\`) is pinned at the top.`,
          createdAt: new Date().toISOString(),
          reactions: [{ emoji: '👋', userIds: [input.ownerId] }],
          attachments: [],
        },
        {
          id: `msg-${crypto.randomBytes(6).toString('hex')}`,
          channelId: firstText.id,
          authorId: 'bot-ticket',
          content: '',
          embed: {
            title: 'Ticket Bot Automatically Installed',
            description:
              `Members can open **personal tickets** anytime from **Ticket Bot** in the sidebar (or with \`/ticket\` inside **#${cleanBotCmdName}**) for queries, help, or collecting invite rewards. Server owners can configure invite rewards under **Server Settings → Ticket Bot & Rewards**.`,
            footer: 'Ticket Bot · Private personal support desk',
          },
          createdAt: new Date(Date.now() + 100).toISOString(),
          reactions: [],
          attachments: [],
        },
      ];
    }
    this.scheduleSave();
    return server;
  }

  public joinByInviteOrDiscovery(userId: string, codeOrDiscoveryId: string): Server {
    let clean = codeOrDiscoveryId.trim();
    const queryMatch = clean.match(/[?&]invite=([A-Za-z0-9_-]+)/i);
    if (queryMatch) {
      clean = queryMatch[1];
    } else {
      clean = clean.replace(/^https?:\/\/[^/]+\/invite\//i, '').replace(/\/+$/, '');
    }
    const cleanLower = clean.toLowerCase();

    const existing = this.servers.find(
      (s) =>
        s.invites.some((i) => i.code.toLowerCase() === cleanLower) ||
        s.vanityCode?.toLowerCase() === cleanLower ||
        s.id === codeOrDiscoveryId
    );
    if (existing) {
      if (existing.bannedUserIds.includes(userId)) {
        throw new Error('You are banned from this server.');
      }
      const inv = existing.invites.find((i) => i.code.toLowerCase() === cleanLower);
      if (inv) {
        if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) {
          throw new Error('This invite link has expired.');
        }
        if (inv.maxUses > 0 && inv.uses >= inv.maxUses) {
          throw new Error('This invite link has reached its maximum uses.');
        }
      }

      if (!existing.members.some((m) => m.userId === userId)) {
        const defaultRole = existing.roles.find((r) => r.name === '@everyone') || existing.roles[existing.roles.length - 1];
        existing.members.push({
          userId,
          roleIds: defaultRole ? [defaultRole.id] : [],
          joinedAt: new Date().toISOString(),
          rulesAccepted: true,
        });
        if (inv) {
          inv.uses += 1;
          // STRICT RULE: Only joins using a member's own personal custom invite link increase their invite count.
          // Joins using the default server link (isDefault: true or !isCustom) MUST NOT increase anyone's invite count.
          if (inv.isCustom === true && !inv.isDefault && inv.createdBy && inv.createdBy !== userId) {
            if (!existing.memberInviteCounts) existing.memberInviteCounts = {};
            existing.memberInviteCounts[inv.createdBy] = (existing.memberInviteCounts[inv.createdBy] || 0) + 1;
          }
        }
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
        botCmdSetup: { channelName: 'bot-cmd' },
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
      updateTicketBot?: Partial<Pick<TicketBotConfig, 'enabled' | 'welcomeMessage' | 'inviteRewardsEnabled'>>;
      addInviteReward?: Omit<InviteRewardTier, 'id'>;
      deleteInviteRewardId?: string;
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
    if (!server.ticketBot) {
      server.ticketBot = {
        enabled: true,
        welcomeMessage:
          'Have a question, need help, or ready to claim an invite reward? Generate a personal ticket below.',
        inviteRewardsEnabled: false,
        inviteRewards: [],
      };
    }
    if (patch.updateTicketBot) {
      if (typeof patch.updateTicketBot.enabled === 'boolean') {
        server.ticketBot.enabled = patch.updateTicketBot.enabled;
      }
      if (typeof patch.updateTicketBot.inviteRewardsEnabled === 'boolean') {
        server.ticketBot.inviteRewardsEnabled = patch.updateTicketBot.inviteRewardsEnabled;
        this.appendAudit(
          server,
          userId,
          patch.updateTicketBot.inviteRewardsEnabled ? 'Enabled Invite Rewards' : 'Disabled Invite Rewards',
          'Ticket Bot'
        );
      }
      if (typeof patch.updateTicketBot.welcomeMessage === 'string') {
        server.ticketBot.welcomeMessage = patch.updateTicketBot.welcomeMessage.trim().slice(0, 320);
      }
    }
    if (patch.addInviteReward) {
      const tier: InviteRewardTier = {
        id: `rw-${crypto.randomBytes(4).toString('hex')}`,
        title: patch.addInviteReward.title.trim().slice(0, 80) || 'Invite Reward',
        description: patch.addInviteReward.description.trim().slice(0, 240) || 'Reward for inviting friends.',
        requiredInvites: Math.max(1, Math.min(500, Math.floor(Number(patch.addInviteReward.requiredInvites) || 1))),
        roleId: patch.addInviteReward.roleId || undefined,
      };
      server.ticketBot.inviteRewards.push(tier);
      server.ticketBot.inviteRewards.sort((a, b) => a.requiredInvites - b.requiredInvites);
      server.ticketBot.inviteRewardsEnabled = true;
      this.appendAudit(server, userId, 'Added Invite Reward', `${tier.title} (${tier.requiredInvites} invites)`);
    }
    if (patch.deleteInviteRewardId) {
      const target = server.ticketBot.inviteRewards.find((r) => r.id === patch.deleteInviteRewardId);
      server.ticketBot.inviteRewards = server.ticketBot.inviteRewards.filter((r) => r.id !== patch.deleteInviteRewardId);
      if (target) {
        this.appendAudit(server, userId, 'Removed Invite Reward', target.title);
      }
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

      // Also join attached server if present & credit creator's server invite count
      let joinedServer: Server | undefined;
      if (friendInvite.serverId) {
        try {
          const targetSrv = this.getServer(friendInvite.serverId);
          const wasMember = targetSrv?.members.some((m) => m.userId === userId);
          joinedServer = this.joinByInviteOrDiscovery(userId, friendInvite.serverId);
          if (joinedServer && !wasMember && friendInvite.creatorId !== userId) {
            if (!joinedServer.memberInviteCounts) joinedServer.memberInviteCounts = {};
            joinedServer.memberInviteCounts[friendInvite.creatorId] =
              (joinedServer.memberInviteCounts[friendInvite.creatorId] || 0) + 1;
          }
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

  public isTicketStaff(userId: string, server: Server): boolean {
    return (
      server.ownerId === userId ||
      this.hasPermission(server, userId, 'ADMINISTRATOR') ||
      this.hasPermission(server, userId, 'MANAGE_SERVER') ||
      this.hasPermission(server, userId, 'MANAGE_MESSAGES')
    );
  }

  public canAccessTicket(userId: string, ticket: SupportTicket): boolean {
    if (ticket.creatorId === userId) return true;
    const server = this.getServer(ticket.serverId);
    if (!server) return false;
    return this.isTicketStaff(userId, server);
  }

  public getTicket(ticketId: string): SupportTicket | undefined {
    return this.tickets.find((t) => t.id === ticketId);
  }

  public createTicket(
    userId: string,
    serverId: string,
    input: {
      category: TicketCategory;
      subject: string;
      details: string;
      rewardTierId?: string;
    }
  ): { ticket: SupportTicket; initialMessage: Message } {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found.');
    if (!server.members.some((m) => m.userId === userId)) {
      throw new Error('You must be a member of this server to open a ticket.');
    }

    const category: TicketCategory =
      input.category === 'query' || input.category === 'help' || input.category === 'invite_reward'
        ? input.category
        : 'help';
    const subject = input.subject.trim().slice(0, 120);
    if (!subject) throw new Error('Please enter a subject for your ticket.');

    let rewardTier: InviteRewardTier | undefined;
    if (category === 'invite_reward') {
      if (!server.ticketBot?.inviteRewardsEnabled || !server.ticketBot.inviteRewards.length) {
        throw new Error('The server owner has not set up invite rewards for this server yet.');
      }
      rewardTier =
        server.ticketBot.inviteRewards.find((r) => r.id === input.rewardTierId) ||
        server.ticketBot.inviteRewards[0];
    }

    const nowIso = new Date().toISOString();
    const ticketNumber = this.ticketCounter++;
    const ticket: SupportTicket = {
      id: `tkt-${crypto.randomBytes(5).toString('hex')}`,
      ticketNumber,
      serverId: server.id,
      creatorId: userId,
      category,
      subject,
      status: 'open',
      rewardTierId: rewardTier?.id,
      rewardTitle: rewardTier?.title,
      rewardFulfilled: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const author = this.users[userId];
    const inviteCount = server.memberInviteCounts?.[userId] || 0;
    const categoryLabel =
      category === 'invite_reward'
        ? 'Collect Invite Reward'
        : category === 'query'
        ? 'General Query'
        : 'Help & Support';

    const fields: { name: string; value: string }[] = [
      { name: 'Opened by', value: `${author?.displayName || 'Member'} (@${author?.username || 'user'})` },
      { name: 'Category', value: categoryLabel },
      { name: 'Status', value: 'Open · Private Personal Ticket' },
    ];
    if (rewardTier) {
      const eligible = inviteCount >= rewardTier.requiredInvites;
      fields.push({
        name: 'Requested Reward',
        value: `${rewardTier.title} (Requires ${rewardTier.requiredInvites} invites)`,
      });
      fields.push({
        name: 'Your Verified Server Invites',
        value: `${inviteCount} / ${rewardTier.requiredInvites} — ${
          eligible ? 'Eligible! Waiting for staff approval.' : 'In progress (share your invite code to reach the goal!)'
        }`,
      });
    }

    const initialMessage: Message = {
      id: `msg-${crypto.randomBytes(6).toString('hex')}`,
      channelId: ticket.id,
      authorId: 'bot-ticket',
      content: input.details.trim()
        ? `**Member message:** ${input.details.trim().slice(0, 2000)}`
        : '',
      embed: {
        title: `Ticket #TKT-${ticketNumber} — ${subject}`,
        description:
          server.ticketBot?.welcomeMessage ||
          'Thank you for opening a personal ticket. Server staff have been notified and will reply privately right here.',
        fields,
        footer: `Ticket Bot · ${server.name}`,
      },
      createdAt: nowIso,
      reactions: [],
      attachments: [],
    };

    this.tickets.unshift(ticket);
    this.messages[ticket.id] = [initialMessage];

    // Notify server owner in inbox if someone else opened a ticket
    if (server.ownerId !== userId) {
      const ownerInbox = this.inboxByUser[server.ownerId] || [];
      ownerInbox.unshift({
        id: `inb-${crypto.randomBytes(4).toString('hex')}`,
        type: 'event',
        title: `New Ticket #TKT-${ticketNumber} (${categoryLabel})`,
        preview: `${author?.displayName || 'A member'}: ${subject}`,
        serverId: server.id,
        createdAt: nowIso,
        read: false,
      });
      this.inboxByUser[server.ownerId] = ownerInbox;
    }

    this.scheduleSave();
    return { ticket, initialMessage };
  }

  public updateTicket(
    userId: string,
    ticketId: string,
    patch: { status?: TicketStatus; approveReward?: boolean }
  ): { ticket: SupportTicket; systemMessage?: Message; serverUpdated?: Server } {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error('Ticket not found.');
    const server = this.getServer(ticket.serverId);
    if (!server) throw new Error('Server not found.');
    const isStaff = this.isTicketStaff(userId, server);
    if (ticket.creatorId !== userId && !isStaff) {
      throw new Error('You do not have permission to update this ticket.');
    }

    const actor = this.users[userId];
    const nowIso = new Date().toISOString();
    let systemMessage: Message | undefined;
    let serverUpdated: Server | undefined;

    if (patch.approveReward) {
      if (!isStaff) {
        throw new Error('Only the server owner or staff can approve invite rewards.');
      }
      ticket.rewardFulfilled = true;
      ticket.status = 'resolved';
      ticket.updatedAt = nowIso;

      // Grant attached reward role if configured
      const tier = server.ticketBot?.inviteRewards.find((r) => r.id === ticket.rewardTierId);
      if (tier?.roleId) {
        const member = server.members.find((m) => m.userId === ticket.creatorId);
        if (member && !member.roleIds.includes(tier.roleId)) {
          member.roleIds.push(tier.roleId);
          serverUpdated = server;
        }
      }
      this.appendAudit(
        server,
        userId,
        'Fulfilled Invite Reward',
        `${ticket.rewardTitle || 'Reward'} → @${this.users[ticket.creatorId]?.username || ticket.creatorId}`
      );
      serverUpdated = server;

      systemMessage = {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: ticket.id,
        authorId: 'bot-ticket',
        content: `🎉 **Invite Reward Approved!** **${actor?.displayName || 'Staff'}** verified and granted **${ticket.rewardTitle || 'your invite reward'}**.`,
        createdAt: nowIso,
        reactions: [],
        attachments: [],
      };
    } else if (patch.status) {
      ticket.status = patch.status;
      ticket.updatedAt = nowIso;
      if (patch.status === 'closed') ticket.closedBy = userId;
      systemMessage = {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: ticket.id,
        authorId: 'bot-ticket',
        content:
          patch.status === 'closed'
            ? `Ticket #TKT-${ticket.ticketNumber} was **closed** by ${actor?.displayName || 'Member'}.`
            : patch.status === 'resolved'
            ? `Ticket #TKT-${ticket.ticketNumber} was marked **resolved** by ${actor?.displayName || 'Member'}.`
            : `Ticket #TKT-${ticket.ticketNumber} was **reopened** by ${actor?.displayName || 'Member'}.`,
        createdAt: nowIso,
        reactions: [],
        attachments: [],
      };
    }

    if (systemMessage) {
      if (!this.messages[ticket.id]) this.messages[ticket.id] = [];
      this.messages[ticket.id].push(systemMessage);
    }

    this.scheduleSave();
    return { ticket, systemMessage, serverUpdated };
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

  // --- Feature Ball Quests, Cosmetic Server Ranks & Server Boosts ---

  private getOrInitQuestRecord(userId: string): UserQuestRecord {
    if (!this.questsByUser[userId]) {
      this.questsByUser[userId] = createEmptyQuestRecord();
    }
    const changed = normalizeQuestRecord(this.questsByUser[userId]);
    if (changed) this.scheduleSave();
    return this.questsByUser[userId];
  }

  public getQuestsState(userId: string): FeatureBallQuestsState {
    const rec = this.getOrInitQuestRecord(userId);
    const balance = this.users[userId]?.featureBalls || 0;
    return buildFeatureBallQuestsState(rec, balance);
  }

  public recordQuestAction(userId: string, actionType: QuestItem['actionType'], amount = 1) {
    const user = this.users[userId];
    if (!user || user.isBot) return;
    const rec = this.getOrInitQuestRecord(userId);
    let updated = false;

    for (const def of ALL_QUEST_DEFS) {
      if (def.actionType !== actionType) continue;
      const progressMap =
        def.frequency === 'daily'
          ? rec.dailyProgress
          : def.frequency === 'weekly'
          ? rec.weeklyProgress
          : rec.monthlyProgress;
      const claimedMap =
        def.frequency === 'daily'
          ? rec.dailyClaimed
          : def.frequency === 'weekly'
          ? rec.weeklyClaimed
          : rec.monthlyClaimed;
      if (claimedMap[def.id]) continue;
      const prev = progressMap[def.id] || 0;
      if (prev < def.target) {
        progressMap[def.id] = Math.min(def.target, prev + amount);
        updated = true;
      }
    }
    if (updated) this.scheduleSave();
  }

  private recordOrbTransaction(user: User, entry: Omit<OrbTransaction, 'id' | 'createdAt'>) {
    if (!user.orbHistory) user.orbHistory = [];
    user.orbHistory.unshift({
      id: `orbtx-${crypto.randomBytes(4).toString('hex')}`,
      ...entry,
      createdAt: new Date().toISOString(),
    });
    if (user.orbHistory.length > 60) {
      user.orbHistory.length = 60;
    }
  }

  public acceptQuest(userId: string, questId: string): FeatureBallQuestsState {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const def = QUEST_DEF_BY_ID.get(questId);
    if (!def) throw new Error('Quest not found.');
    const rec = this.getOrInitQuestRecord(userId);
    if (!rec.acceptedQuestIds) rec.acceptedQuestIds = {};
    rec.acceptedQuestIds[questId] = true;
    this.scheduleSave();
    return buildFeatureBallQuestsState(rec, user.featureBalls || 0);
  }

  public completeQuestTask(userId: string, questId: string): { user: User; quests: FeatureBallQuestsState; awarded: number } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const def = QUEST_DEF_BY_ID.get(questId);
    if (!def) throw new Error('Quest not found.');

    const rec = this.getOrInitQuestRecord(userId);
    const progressMap =
      def.frequency === 'daily'
        ? rec.dailyProgress
        : def.frequency === 'weekly'
        ? rec.weeklyProgress
        : rec.monthlyProgress;
    const claimedMap =
      def.frequency === 'daily'
        ? rec.dailyClaimed
        : def.frequency === 'weekly'
        ? rec.weeklyClaimed
        : rec.monthlyClaimed;

    if (claimedMap[def.id]) {
      throw new Error('This quest reward has already been claimed.');
    }

    progressMap[def.id] = def.target;
    claimedMap[def.id] = true;
    if (rec.acceptedQuestIds) delete rec.acceptedQuestIds[def.id];
    user.featureBalls = (user.featureBalls || 0) + def.reward;
    this.recordOrbTransaction(user, {
      amount: def.reward,
      type: 'earn',
      title: `Completed ${def.title}`,
      category: 'quest',
    });

    // Check if completing this quest finished all 70 weekly or all 310 monthly quests
    normalizeQuestRecord(rec);
    this.scheduleSave();
    return {
      user,
      quests: buildFeatureBallQuestsState(rec, user.featureBalls),
      awarded: def.reward,
    };
  }

  public claimAllReadyQuests(
    userId: string,
    frequency?: 'daily' | 'weekly' | 'monthly'
  ): { user: User; quests: FeatureBallQuestsState; claimedCount: number; awarded: number } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const rec = this.getOrInitQuestRecord(userId);

    let claimedCount = 0;
    let awarded = 0;
    for (const def of ALL_QUEST_DEFS) {
      if (frequency && def.frequency !== frequency) continue;
      const progressMap =
        def.frequency === 'daily'
          ? rec.dailyProgress
          : def.frequency === 'weekly'
          ? rec.weeklyProgress
          : rec.monthlyProgress;
      const claimedMap =
        def.frequency === 'daily'
          ? rec.dailyClaimed
          : def.frequency === 'weekly'
          ? rec.weeklyClaimed
          : rec.monthlyClaimed;

      if (!claimedMap[def.id] && (progressMap[def.id] || 0) >= def.target) {
        claimedMap[def.id] = true;
        if (rec.acceptedQuestIds) delete rec.acceptedQuestIds[def.id];
        awarded += def.reward;
        claimedCount += 1;
      }
    }

    if (awarded > 0) {
      user.featureBalls = (user.featureBalls || 0) + awarded;
      this.recordOrbTransaction(user, {
        amount: awarded,
        type: 'earn',
        title: `Claimed ${claimedCount} ready ${frequency ? `${frequency} ` : ''}quest${claimedCount === 1 ? '' : 's'}`,
        category: 'quest',
      });
      normalizeQuestRecord(rec);
      this.scheduleSave();
    }

    return {
      user,
      quests: buildFeatureBallQuestsState(rec, user.featureBalls || 0),
      claimedCount,
      awarded,
    };
  }

  public buyOrbsShopItem(
    userId: string,
    itemId: string
  ): { user: User; item: NonNullable<ReturnType<typeof ORBS_SHOP_ITEM_BY_ID.get>>; quests: FeatureBallQuestsState } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const item = ORBS_SHOP_ITEM_BY_ID.get(itemId);
    if (!item) throw new Error('Shop item not found.');

    if (!user.ownedShopItemIds) user.ownedShopItemIds = [];
    if (!item.repeatable && user.ownedShopItemIds.includes(item.id)) {
      throw new Error(`You already own "${item.name}". Equip it anytime for free!`);
    }

    const balance = user.featureBalls || 0;
    if (balance < item.price) {
      throw new Error(
        `Not enough Feature Balls. "${item.name}" costs ${item.price} Feature Balls (you have ${balance}).`
      );
    }

    user.featureBalls = balance - item.price;

    if (item.repeatable && item.durationHours) {
      const currentExpiry = user.plusPassExpiresAt ? new Date(user.plusPassExpiresAt).getTime() : 0;
      const baseMs = Math.max(Date.now(), Number.isFinite(currentExpiry) ? currentExpiry : 0);
      user.plusPassExpiresAt = new Date(baseMs + item.durationHours * 3600_000).toISOString();
      this.recordOrbTransaction(user, {
        amount: item.price,
        type: 'spend',
        title: `Redeemed ${item.name}`,
        category: 'pass',
      });
    } else {
      user.ownedShopItemIds = Array.from(new Set([...user.ownedShopItemIds, item.id]));
      // Auto-equip newly unlocked cosmetic
      if (item.category === 'decoration') {
        user.avatarDecoration = item.cosmeticKey;
      } else if (item.category === 'effect') {
        user.profileEffect = item.cosmeticKey;
      } else if (item.category === 'nameplate') {
        user.equippedNameplate = item.cosmeticKey;
      } else if (item.category === 'exclusive') {
        user.equippedBadges = Array.from(new Set([...(user.equippedBadges || []), item.cosmeticKey]));
      }
      this.recordOrbTransaction(user, {
        amount: item.price,
        type: 'spend',
        title: `Unlocked ${item.name}`,
        category: 'shop',
      });
    }

    this.scheduleSave();
    return {
      user,
      item,
      quests: this.getQuestsState(userId),
    };
  }

  public equipOrbsShopItem(
    userId: string,
    slot: 'decoration' | 'effect' | 'nameplate' | 'badge',
    itemId: string | null
  ): User {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const owned = user.ownedShopItemIds || [];

    if (!itemId) {
      if (slot === 'decoration') user.avatarDecoration = undefined;
      else if (slot === 'effect') user.profileEffect = undefined;
      else if (slot === 'nameplate') user.equippedNameplate = undefined;
      else if (slot === 'badge') user.equippedBadges = [];
      this.scheduleSave();
      return user;
    }

    const item = ORBS_SHOP_ITEM_BY_ID.get(itemId);
    if (!item) throw new Error('Shop item not found.');
    if (!owned.includes(item.id)) {
      throw new Error(`Unlock "${item.name}" in the Feature Ball Shop first.`);
    }

    if (slot === 'decoration' && item.category === 'decoration') {
      user.avatarDecoration = user.avatarDecoration === item.cosmeticKey ? undefined : item.cosmeticKey;
    } else if (slot === 'effect' && item.category === 'effect') {
      user.profileEffect = user.profileEffect === item.cosmeticKey ? undefined : item.cosmeticKey;
    } else if (slot === 'nameplate' && item.category === 'nameplate') {
      user.equippedNameplate = user.equippedNameplate === item.cosmeticKey ? undefined : item.cosmeticKey;
    } else if (slot === 'badge' && item.category === 'exclusive' && !item.repeatable) {
      const current = user.equippedBadges || [];
      user.equippedBadges = current.includes(item.cosmeticKey)
        ? current.filter((b) => b !== item.cosmeticKey)
        : [...current, item.cosmeticKey];
    } else {
      throw new Error('Item does not match the selected cosmetic slot.');
    }

    this.scheduleSave();
    return user;
  }

  public addServerRank(
    userId: string,
    serverId: string,
    input: { name: string; color: string; price: number; badge?: string }
  ): Server {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found.');
    if (server.ownerId !== userId && !this.hasPermission(server, userId, 'MANAGE_SERVER')) {
      throw new Error('Only the server owner or admins can add server ranks.');
    }
    const name = String(input.name || '').trim().slice(0, 32);
    if (!name) throw new Error('Rank name is required.');
    const price = Math.max(1, Math.min(100_000, Math.round(Number(input.price) || 20)));
    const rank: ServerRank = {
      id: `rank-${crypto.randomBytes(4).toString('hex')}`,
      name,
      color: /^#[0-9a-fA-F]{6}$/.test(input.color || '') ? input.color : '#2563EB',
      price,
      badge: (input.badge || '⭐').slice(0, 4),
      permissions: [], // Cosmetic ranks strictly grant NO permissions
    };
    if (!server.shopRanks) server.shopRanks = [];
    server.shopRanks.push(rank);
    this.appendAudit(server, userId, 'Added Cosmetic Server Rank', `${rank.name} (${rank.price} Feature Balls, no permissions)`);
    this.scheduleSave();
    return server;
  }

  public deleteServerRank(userId: string, serverId: string, rankId: string): Server {
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found.');
    if (server.ownerId !== userId && !this.hasPermission(server, userId, 'MANAGE_SERVER')) {
      throw new Error('Only the server owner or admins can remove server ranks.');
    }
    if ((server.shopRanks || []).length <= 1) {
      throw new Error('A server must keep at least 1 cosmetic rank.');
    }
    server.shopRanks = (server.shopRanks || []).filter((r) => r.id !== rankId);
    this.scheduleSave();
    return server;
  }

  public buyServerRank(
    userId: string,
    serverId: string,
    rankId: string
  ): { user: User; server: Server; rank: ServerRank } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found.');
    if (!server.members.some((m) => m.userId === userId)) {
      throw new Error('You must be a member of this server to buy a rank here.');
    }

    const rank = (server.shopRanks || []).find((r) => r.id === rankId);
    if (!rank) throw new Error('Rank not found in this server.');

    if (!server.memberRanks) server.memberRanks = {};
    const owned = server.memberRanks[userId] || [];
    if (owned.includes(rank.id)) {
      throw new Error(`You already own the "${rank.name}" rank in ${server.name}.`);
    }

    const balance = user.featureBalls || 0;
    if (balance < rank.price) {
      throw new Error(
        `Not enough Feature Balls. "${rank.name}" costs ${rank.price} Feature Balls (you have ${balance}).`
      );
    }

    user.featureBalls = balance - rank.price;
    server.memberRanks[userId] = [...owned, rank.id];
    this.recordOrbTransaction(user, {
      amount: rank.price,
      type: 'spend',
      title: `Bought rank "${rank.name}" in ${server.name}`,
      category: 'rank',
    });
    // Strictly cosmetic: does NOT modify server.roles or grant any permissions
    this.appendAudit(server, userId, 'Purchased Cosmetic Rank', `${rank.name} (${rank.price} Feature Balls)`);
    this.scheduleSave();
    return { user, server, rank };
  }

  public boostServer(
    userId: string,
    serverId: string
  ): { user: User; server: Server; announcementMessage?: Message } {
    const user = this.users[userId];
    if (!user) throw new Error('User not found.');
    const server = this.getServer(serverId);
    if (!server) throw new Error('Server not found.');
    if (!server.members.some((m) => m.userId === userId)) {
      throw new Error('You must be a member of this server to boost it.');
    }

    const balance = user.featureBalls || 0;
    if (balance < SERVER_BOOST_COST) {
      throw new Error(
        `Boosting a server costs ${SERVER_BOOST_COST} Feature Balls (you have ${balance}). Complete quests to earn more Feature Balls!`
      );
    }

    user.featureBalls = balance - SERVER_BOOST_COST;
    this.recordOrbTransaction(user, {
      amount: SERVER_BOOST_COST,
      type: 'spend',
      title: `Boosted server ${server.name}`,
      category: 'boost',
    });
    server.boostCount = (server.boostCount || 0) + 1;
    server.boostLevel = this.computeBoostLevel(server.boostCount);
    if (!server.boosters) server.boosters = [];
    const existingBooster = server.boosters.find((b) => b.userId === userId);
    const nowIso = new Date().toISOString();
    if (existingBooster) {
      existingBooster.count += 1;
      existingBooster.lastBoostedAt = nowIso;
    } else {
      server.boosters.unshift({ userId, count: 1, lastBoostedAt: nowIso });
    }

    this.appendAudit(
      server,
      userId,
      'Boosted Server',
      `1 Boost (${SERVER_BOOST_COST} Feature Balls) — Total: ${server.boostCount} (Level ${server.boostLevel})`
    );

    // Post a celebratory Server Boost message in the primary text channel (like Discord)
    let announcementMessage: Message | undefined;
    const generalCh =
      server.channels.find((c) => !c.isBotCmdChannel && (c.type === 'text' || c.type === 'announcement')) ||
      server.channels[0];
    if (generalCh) {
      if (!this.messages[generalCh.id]) this.messages[generalCh.id] = [];
      announcementMessage = {
        id: `msg-${crypto.randomBytes(6).toString('hex')}`,
        channelId: generalCh.id,
        authorId: 'bot-relay',
        content: '',
        embed: {
          title: `Server Boosted by ${user.displayName}!`,
          description: `**${user.displayName}** just boosted **${server.name}** using **${SERVER_BOOST_COST} Feature Balls**!`,
          fields: [
            { name: 'Total Server Boosts', value: `${server.boostCount}` },
            { name: 'Server Boost Level', value: `Level ${server.boostLevel}` },
          ],
          footer: 'Server Boost · 1 Boost = 100 Feature Balls',
        },
        createdAt: nowIso,
        reactions: [{ emoji: '🚀', userIds: [userId] }],
        attachments: [],
      };
      this.messages[generalCh.id].push(announcementMessage);
    }

    this.scheduleSave();
    return { user, server, announcementMessage };
  }
}
