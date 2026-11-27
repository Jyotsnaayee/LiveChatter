import type { FeatureBallQuestsState, QuestFrequency, QuestItem } from '../src/shared/types.ts';

export const DAILY_QUEST_COUNT = 10;
export const DAILY_QUEST_REWARD = 2;

export const WEEKLY_QUEST_COUNT = 70;
export const WEEKLY_QUEST_REWARD = 10;

export const MONTHLY_QUEST_COUNT = 310;
export const MONTHLY_QUEST_REWARD = 200;

export const PROFILE_EDIT_COST = 10;
export const SERVER_BOOST_COST = 100;

export interface UserQuestRecord {
  dailyDateKey: string;
  dailyProgress: Record<string, number>;
  dailyClaimed: Record<string, boolean>;
  weeklyCycle: number;
  weeklyProgress: Record<string, number>;
  weeklyClaimed: Record<string, boolean>;
  monthlyCycle: number;
  monthlyProgress: Record<string, number>;
  monthlyClaimed: Record<string, boolean>;
  acceptedQuestIds?: Record<string, boolean>;
}

export function getLocalDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNextMidnightIso(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.toISOString();
}

interface QuestTemplate {
  title: string;
  description: string;
  actionType: QuestItem['actionType'];
  baseTarget: number;
}

const DAILY_TEMPLATES: QuestTemplate[] = [
  { title: 'Daily Check-In', description: 'Check in to LiveChatter today to collect your daily Feature Balls.', actionType: 'checkin', baseTarget: 1 },
  { title: 'Say Hello in Chat', description: 'Send a message in any server channel or direct message.', actionType: 'message', baseTarget: 1 },
  { title: 'Active Conversationalist', description: 'Send 3 messages across your communities today.', actionType: 'message', baseTarget: 3 },
  { title: 'Drop a Reaction', description: 'Add an emoji reaction to any message.', actionType: 'reaction', baseTarget: 1 },
  { title: 'Run a Bot Command', description: 'Run -i, /invite link, or /help inside a #bot-cmd channel.', actionType: 'command', baseTarget: 1 },
  { title: 'Start or Reply in a Thread', description: 'Participate in a channel thread or forum post.', actionType: 'thread', baseTarget: 1 },
  { title: 'Hop Into Voice', description: 'Join any voice or stage room for a quick session.', actionType: 'voice', baseTarget: 1 },
  { title: 'Share Community Vibes', description: 'Send 5 helpful messages in any channel today.', actionType: 'message', baseTarget: 5 },
  { title: 'Spread the Word', description: 'Generate an invite link or invite a friend.', actionType: 'invite', baseTarget: 1 },
  { title: 'Community Streak Check', description: 'Complete your daily community review task.', actionType: 'community', baseTarget: 1 },
];

const WEEKLY_ARCHETYPES: QuestTemplate[] = [
  { title: 'Weekly Chat Sprint', description: 'Send community messages to keep discussions lively.', actionType: 'message', baseTarget: 3 },
  { title: 'Emoji Enthusiast', description: 'React to messages across your servers.', actionType: 'reaction', baseTarget: 2 },
  { title: 'Bot Command Operator', description: 'Use commands inside a server #bot-cmd tab.', actionType: 'command', baseTarget: 1 },
  { title: 'Voice Room Regular', description: 'Connect to voice or stage rooms with your group.', actionType: 'voice', baseTarget: 1 },
  { title: 'Thread Contributor', description: 'Contribute ideas inside threads or forums.', actionType: 'thread', baseTarget: 1 },
  { title: 'Community Inviter', description: 'Create a custom /invite link or share a friend invite.', actionType: 'invite', baseTarget: 1 },
  { title: 'Weekly Milestone Check', description: 'Complete a weekly community engagement check.', actionType: 'community', baseTarget: 1 },
];

const MONTHLY_ARCHETYPES: QuestTemplate[] = [
  { title: 'Monthly Chat Legend', description: 'Post messages across channels and direct messages.', actionType: 'message', baseTarget: 5 },
  { title: 'Reaction Collector', description: 'Share reactions on community posts and announcements.', actionType: 'reaction', baseTarget: 3 },
  { title: 'Bot Power User', description: 'Run bot commands like -i and /invite link in #bot-cmd.', actionType: 'command', baseTarget: 2 },
  { title: 'Voice & Stage Host', description: 'Hang out in voice lounges or stage discussions.', actionType: 'voice', baseTarget: 1 },
  { title: 'Forum & Thread Builder', description: 'Organize discussions with threads and forum posts.', actionType: 'thread', baseTarget: 2 },
  { title: 'Community Ambassador', description: 'Grow servers with personal custom invite links.', actionType: 'invite', baseTarget: 1 },
  { title: 'Monthly Mastery Task', description: 'Complete this monthly mastery milestone.', actionType: 'community', baseTarget: 1 },
  { title: 'Dedicated Supporter', description: 'Engage with server channels, tickets, or events.', actionType: 'checkin', baseTarget: 1 },
];

const STATIC_DAILY_DEFS: Omit<QuestItem, 'progress' | 'claimed'>[] = Array.from(
  { length: DAILY_QUEST_COUNT },
  (_, idx) => {
    const t = DAILY_TEMPLATES[idx % DAILY_TEMPLATES.length];
    return {
      id: `daily-${idx + 1}`,
      index: idx + 1,
      frequency: 'daily' as QuestFrequency,
      title: `Daily #${idx + 1}: ${t.title}`,
      description: t.description,
      actionType: t.actionType,
      target: t.baseTarget,
      reward: DAILY_QUEST_REWARD,
    };
  }
);

const STATIC_WEEKLY_DEFS: Omit<QuestItem, 'progress' | 'claimed'>[] = Array.from(
  { length: WEEKLY_QUEST_COUNT },
  (_, idx) => {
    const t = WEEKLY_ARCHETYPES[idx % WEEKLY_ARCHETYPES.length];
    const tier = Math.floor(idx / WEEKLY_ARCHETYPES.length) + 1;
    const target = t.actionType === 'checkin' || t.actionType === 'community' ? 1 : t.baseTarget + Math.min(tier - 1, 5);
    return {
      id: `weekly-${idx + 1}`,
      index: idx + 1,
      frequency: 'weekly' as QuestFrequency,
      title: `Weekly #${idx + 1}: ${t.title} (Tier ${tier})`,
      description: `${t.description} (Goal: ${target})`,
      actionType: t.actionType,
      target,
      reward: WEEKLY_QUEST_REWARD,
    };
  }
);

const STATIC_MONTHLY_DEFS: Omit<QuestItem, 'progress' | 'claimed'>[] = Array.from(
  { length: MONTHLY_QUEST_COUNT },
  (_, idx) => {
    const t = MONTHLY_ARCHETYPES[idx % MONTHLY_ARCHETYPES.length];
    const tier = Math.floor(idx / MONTHLY_ARCHETYPES.length) + 1;
    const target = t.actionType === 'checkin' || t.actionType === 'community' ? 1 : t.baseTarget + Math.min(tier - 1, 10);
    return {
      id: `monthly-${idx + 1}`,
      index: idx + 1,
      frequency: 'monthly' as QuestFrequency,
      title: `Monthly #${idx + 1}: ${t.title} (Stage ${tier})`,
      description: `${t.description} (Goal: ${target})`,
      actionType: t.actionType,
      target,
      reward: MONTHLY_QUEST_REWARD,
    };
  }
);

export const ALL_QUEST_DEFS: Omit<QuestItem, 'progress' | 'claimed'>[] = [
  ...STATIC_DAILY_DEFS,
  ...STATIC_WEEKLY_DEFS,
  ...STATIC_MONTHLY_DEFS,
];

export const QUEST_DEF_BY_ID = new Map(ALL_QUEST_DEFS.map((q) => [q.id, q]));

export function createEmptyQuestRecord(now = new Date()): UserQuestRecord {
  return {
    dailyDateKey: getLocalDateKey(now),
    dailyProgress: {},
    dailyClaimed: {},
    weeklyCycle: 1,
    weeklyProgress: {},
    weeklyClaimed: {},
    monthlyCycle: 1,
    monthlyProgress: {},
    monthlyClaimed: {},
    acceptedQuestIds: {},
  };
}

/**
 * Enforces the exact reset policies:
 * - Daily quests (10) reset completely from start at 12:00 AM every day.
 * - Weekly quests (70) NEVER expire until ALL 70 are completed & claimed, then start the next cycle.
 * - Monthly quests (310) NEVER expire until ALL 310 are completed & claimed, then start the next cycle.
 */
export function normalizeQuestRecord(rec: UserQuestRecord, now = new Date()): boolean {
  let changed = false;
  if (!rec.acceptedQuestIds) rec.acceptedQuestIds = {};
  const todayKey = getLocalDateKey(now);
  if (rec.dailyDateKey !== todayKey) {
    rec.dailyDateKey = todayKey;
    rec.dailyProgress = {};
    rec.dailyClaimed = {};
    for (const id of Object.keys(rec.acceptedQuestIds)) {
      if (id.startsWith('daily-')) delete rec.acceptedQuestIds[id];
    }
    changed = true;
  }

  const weeklyClaimedCount = STATIC_WEEKLY_DEFS.filter((q) => Boolean(rec.weeklyClaimed[q.id])).length;
  if (weeklyClaimedCount >= WEEKLY_QUEST_COUNT) {
    rec.weeklyCycle = (rec.weeklyCycle || 1) + 1;
    rec.weeklyProgress = {};
    rec.weeklyClaimed = {};
    for (const id of Object.keys(rec.acceptedQuestIds)) {
      if (id.startsWith('weekly-')) delete rec.acceptedQuestIds[id];
    }
    changed = true;
  }

  const monthlyClaimedCount = STATIC_MONTHLY_DEFS.filter((q) => Boolean(rec.monthlyClaimed[q.id])).length;
  if (monthlyClaimedCount >= MONTHLY_QUEST_COUNT) {
    rec.monthlyCycle = (rec.monthlyCycle || 1) + 1;
    rec.monthlyProgress = {};
    rec.monthlyClaimed = {};
    for (const id of Object.keys(rec.acceptedQuestIds)) {
      if (id.startsWith('monthly-')) delete rec.acceptedQuestIds[id];
    }
    changed = true;
  }

  return changed;
}

export function buildFeatureBallQuestsState(
  rec: UserQuestRecord,
  balance: number,
  now = new Date()
): FeatureBallQuestsState {
  normalizeQuestRecord(rec, now);

  const quests: QuestItem[] = ALL_QUEST_DEFS.map((def) => {
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
    const claimed = Boolean(claimedMap[def.id]);
    const progress = claimed ? def.target : Math.min(def.target, progressMap[def.id] || 0);
    return {
      ...def,
      progress,
      claimed,
    };
  });

  const dailyCompletedCount = quests.filter((q) => q.frequency === 'daily' && q.claimed).length;
  const weeklyCompletedCount = quests.filter((q) => q.frequency === 'weekly' && q.claimed).length;
  const monthlyCompletedCount = quests.filter((q) => q.frequency === 'monthly' && q.claimed).length;

  return {
    balance,
    dailyDateKey: rec.dailyDateKey,
    nextDailyResetAt: getNextMidnightIso(now),
    weeklyCycle: rec.weeklyCycle || 1,
    monthlyCycle: rec.monthlyCycle || 1,
    dailyCompletedCount,
    dailyTotalCount: DAILY_QUEST_COUNT,
    weeklyCompletedCount,
    weeklyTotalCount: WEEKLY_QUEST_COUNT,
    monthlyCompletedCount,
    monthlyTotalCount: MONTHLY_QUEST_COUNT,
    acceptedQuestIds: Object.keys(rec.acceptedQuestIds || {}).filter((id) => Boolean(rec.acceptedQuestIds?.[id])),
    quests,
  };
}
