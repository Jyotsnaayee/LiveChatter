export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export type ChannelType = 'text' | 'voice' | 'stage' | 'forum' | 'announcement';

export type PermissionKey =
  | 'ADMINISTRATOR'
  | 'VIEW_CHANNEL'
  | 'SEND_MESSAGES'
  | 'MANAGE_MESSAGES'
  | 'CONNECT'
  | 'SPEAK'
  | 'VIDEO'
  | 'MUTE_MEMBERS'
  | 'MANAGE_CHANNELS'
  | 'MANAGE_ROLES'
  | 'MANAGE_SERVER'
  | 'KICK_MEMBERS'
  | 'BAN_MEMBERS'
  | 'TIMEOUT_MEMBERS'
  | 'MENTION_EVERYONE';

export interface ConnectedAccount {
  id: string;
  platform: 'GitHub' | 'Spotify' | 'Steam' | 'YouTube' | 'Bluesky';
  handle: string;
  verified: boolean;
}

export interface UserActivity {
  type: 'playing' | 'listening' | 'coding' | 'studying';
  name: string;
  details: string;
  joinable?: boolean;
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  density: 'cozy' | 'compact';
  fontScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
  disableAnimatedEmoji: boolean;
  ttsEnabled: boolean;
  liveCaptions: boolean;
  voiceMode: 'vad' | 'ptt';
  pttKey: string;
  vadSensitivity: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  dmPrivacy: 'everyone' | 'server_members' | 'friends_only';
  explicitMediaFilter: 'all' | 'non_friends' | 'off';
  messageRequestsEnabled: boolean;
  twoFactorEnabled: boolean;
  desktopNotifications: boolean;
  notificationSounds: boolean;
}

export interface ActiveSession {
  id: string;
  device: string;
  platform: string;
  location: string;
  lastActive: string;
  current?: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  avatarColor: string;
  bannerColor: string;
  bio: string;
  pronouns: string;
  status: PresenceStatus;
  customStatus?: { emoji: string; text: string };
  activity?: UserActivity;
  connectedAccounts: ConnectedAccount[];
  isBot?: boolean;
  createdAt: string;
  settings: UserSettings;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  hoist: boolean;
  mentionable: boolean;
  position: number;
  permissions: PermissionKey[];
}

export interface ServerMember {
  userId: string;
  nickname?: string;
  roleIds: string[];
  joinedAt: string;
  timedOutUntil?: string;
  rulesAccepted: boolean;
}

export interface Category {
  id: string;
  name: string;
  position: number;
}

export interface Channel {
  id: string;
  serverId: string;
  categoryId?: string;
  name: string;
  type: ChannelType;
  topic: string;
  position: number;
  slowmodeSeconds: number;
  isPrivate: boolean;
  ageRestricted: boolean;
  guidelines?: string;
  availableTags?: string[];
  followedAnnouncementChannelIds?: string[];
}

export interface AutoModRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: 'keywords' | 'mention_spam' | 'suspicious_links';
  keywords: string[];
  maxMentions?: number;
  action: 'block' | 'alert' | 'timeout';
  triggeredCount: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  target: string;
  reason?: string;
  createdAt: string;
}

export interface ScheduledEvent {
  id: string;
  serverId: string;
  channelId?: string;
  title: string;
  description: string;
  startsAt: string;
  locationType: 'voice' | 'stage' | 'external';
  externalLocation?: string;
  coverUrl?: string;
  interestedUserIds: string[];
  hostId: string;
}

export interface InviteLink {
  code: string;
  serverId: string;
  createdBy: string;
  uses: number;
  maxUses: number;
  expiresAt?: string;
  temporary: boolean;
}

export interface InstalledBot {
  id: string;
  name: string;
  handle: string;
  description: string;
  category: 'Moderation' | 'Productivity' | 'Utility' | 'Events';
  commands: { name: string; description: string; usage: string }[];
  verified: boolean;
  installed: boolean;
}

export interface WebhookConfig {
  id: string;
  name: string;
  channelId: string;
  createdAt: string;
  lastTriggeredAt?: string;
}

export interface Server {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  iconColor: string;
  bannerUrl?: string;
  category: 'Open Source' | 'Education' | 'Gaming' | 'Creators' | 'Friends';
  language: string;
  ownerId: string;
  vanityCode?: string;
  isCommunity: boolean;
  verificationLevel: 'none' | 'email' | 'account_age' | 'phone';
  rules: string[];
  customEmojis: { id: string; name: string; symbol: string }[];
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  members: ServerMember[];
  bannedUserIds: string[];
  autoModRules: AutoModRule[];
  auditLog: AuditLogEntry[];
  events: ScheduledEvent[];
  invites: InviteLink[];
  webhooks: WebhookConfig[];
  installedBotIds: string[];
}

export interface ServerFolder {
  id: string;
  name: string;
  color: string;
  serverIds: string[];
  collapsed: boolean;
}

export interface DiscoveryServer {
  id: string;
  name: string;
  description: string;
  category: Server['category'];
  language: string;
  memberCount: number;
  onlineCount: number;
  iconColor: string;
  bannerUrl?: string;
  verified: boolean;
  template: 'opensource' | 'study' | 'gaming' | 'creators' | 'friends';
}

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  altText?: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  expiresAt: string;
  allowMultiple: boolean;
}

export interface VoiceClip {
  durationSec: number;
  waveform: number[];
  audioDataUrl?: string;
}

export interface Message {
  id: string;
  channelId: string;
  threadId?: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  pinned?: boolean;
  silent?: boolean;
  replyToId?: string;
  forwardedFrom?: { channelName: string; authorName: string };
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  poll?: PollData;
  voiceClip?: VoiceClip;
  embed?: {
    title: string;
    description: string;
    fields?: { name: string; value: string }[];
    footer?: string;
  };
}

export interface Thread {
  id: string;
  channelId: string;
  serverId: string;
  parentMessageId?: string;
  title: string;
  creatorId: string;
  createdAt: string;
  lastActivityAt: string;
  autoArchiveMinutes: 60 | 1440 | 4320 | 10080;
  archived: boolean;
  isPrivate: boolean;
  followerIds: string[];
  tags?: string[];
  isForumPost?: boolean;
  bodyPreview?: string;
}

export interface DirectMessageThread {
  id: string;
  isGroup: boolean;
  name?: string;
  participantIds: string[];
  isRequest?: boolean;
  muted?: boolean;
  lastMessageAt: string;
}

export interface FriendRelation {
  userId: string;
  status: 'accepted' | 'pending_incoming' | 'pending_outgoing' | 'blocked';
  createdAt: string;
}

export interface VoiceParticipant {
  userId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  videoOn: boolean;
  screenSharing: boolean;
  speaking: boolean;
  stageRole?: 'speaker' | 'audience';
  handRaised?: boolean;
}

export interface WhiteboardStroke {
  id: string;
  channelId: string;
  userId: string;
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface InboxItem {
  id: string;
  type: 'mention' | 'reply' | 'event' | 'automod';
  title: string;
  preview: string;
  serverId?: string;
  channelId?: string;
  messageId?: string;
  createdAt: string;
  read: boolean;
}

export interface FriendInviteCode {
  code: string;
  creatorId: string;
  serverId?: string;
  serverName?: string;
  note?: string;
  uses: number;
  maxUses: number;
  createdAt: string;
  expiresAt?: string;
  sharedChannels: ('whatsapp' | 'gmail' | 'messages' | 'copy' | 'native')[];
}

export interface AppStateSnapshot {
  currentUserId: string;
  users: Record<string, User>;
  servers: Server[];
  folders: ServerFolder[];
  discoveryServers: DiscoveryServer[];
  messages: Record<string, Message[]>;
  threads: Thread[];
  dms: DirectMessageThread[];
  friends: FriendRelation[];
  friendInvites: FriendInviteCode[];
  voiceParticipants: VoiceParticipant[];
  whiteboardStrokes: Record<string, WhiteboardStroke[]>;
  botDirectory: InstalledBot[];
  inbox: InboxItem[];
  sessions: ActiveSession[];
  mutedChannelIds: string[];
  unreadChannelIds: string[];
}

export type WsServerEvent =
  | { type: 'state:sync'; payload: AppStateSnapshot }
  | { type: 'message:created'; payload: { message: Message } }
  | { type: 'message:updated'; payload: { message: Message } }
  | { type: 'message:deleted'; payload: { channelId: string; threadId?: string; messageId: string } }
  | { type: 'thread:created'; payload: { thread: Thread; initialMessage?: Message } }
  | { type: 'thread:updated'; payload: { thread: Thread } }
  | { type: 'typing:update'; payload: { channelId: string; userId: string; isTyping: boolean } }
  | { type: 'presence:updated'; payload: { userId: string; status: PresenceStatus; customStatus?: User['customStatus'] } }
  | { type: 'voice:updated'; payload: { participants: VoiceParticipant[] } }
  | { type: 'soundboard:played'; payload: { channelId: string; userId: string; soundId: string; label: string } }
  | { type: 'whiteboard:stroke'; payload: { stroke: WhiteboardStroke } }
  | { type: 'whiteboard:cleared'; payload: { channelId: string } }
  | { type: 'server:updated'; payload: { server: Server } }
  | { type: 'server:created'; payload: { server: Server } }
  | { type: 'server:deleted'; payload: { serverId: string } }
  | { type: 'dm:created'; payload: { dm: DirectMessageThread } }
  | { type: 'user:updated'; payload: { user: User } }
  | { type: 'inbox:added'; payload: { item: InboxItem } }
  | { type: 'error'; payload: { message: string } };
