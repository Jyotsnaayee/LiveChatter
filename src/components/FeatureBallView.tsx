import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  History,
  Menu,
  Plus,
  Rocket,
  Search,
  ShoppingBag,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type { FeatureBallQuestsState, QuestFrequency, Server, User } from '../shared/types';
import {
  AVATAR_DECORATION_RING_CLASS,
  NAMEPLATE_CLASS,
  ORBS_BADGE_META,
  ORBS_SHOP_ITEMS,
  PROFILE_EFFECT_CLASS,
  type OrbsShopCategory,
  type OrbsShopItem,
} from '../shared/orbsCatalog';
import { processImageUpload } from '../lib/imageUpload';
import { Avatar } from './Avatar';
import { OrbIcon } from './OrbIcon';

export type FeatureBallHubTab = 'quests' | 'shop' | 'profile' | 'ranks' | 'activity';

interface FeatureBallViewProps {
  currentUser: User;
  users: Record<string, User>;
  servers: Server[];
  questsState: FeatureBallQuestsState;
  initialTab?: FeatureBallHubTab;
  initialServerId?: string | null;
  onOpenMobileMenu: () => void;
  onRefreshQuests: () => Promise<void>;
  onAcceptQuest: (questId: string) => Promise<void>;
  onCompleteQuest: (questId: string) => Promise<void>;
  onClaimAllReady: (frequency?: QuestFrequency) => Promise<void>;
  onBuyOrbsShopItem: (itemId: string) => Promise<void>;
  onEquipOrbsShopItem: (slot: 'decoration' | 'effect' | 'nameplate' | 'badge', itemId: string | null) => Promise<void>;
  onSaveAvatar: (avatarUrl: string | null) => Promise<void>;
  onSaveProfile: (patch: {
    displayName: string;
    pronouns: string;
    bio: string;
    bannerColor: string;
    avatarColor: string;
  }) => Promise<void>;
  onBuyServerRank: (serverId: string, rankId: string) => Promise<void>;
  onAddServerRank: (
    serverId: string,
    payload: { name: string; color: string; price: number; badge?: string }
  ) => Promise<void>;
  onDeleteServerRank: (serverId: string, rankId: string) => Promise<void>;
  onBoostServer: (serverId: string) => Promise<void>;
}

const PROFILE_EDIT_COST = 10;
const SERVER_BOOST_COST = 100;

function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatRemainingHours(targetIso: string | undefined, nowMs: number): string | null {
  if (!targetIso) return null;
  const diff = new Date(targetIso).getTime() - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const totalMin = Math.floor(diff / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h ${m}m left`;
  return `${h}h ${m}m left`;
}

export function FeatureBallView({
  currentUser,
  users,
  servers,
  questsState,
  initialTab = 'quests',
  initialServerId,
  onOpenMobileMenu,
  onRefreshQuests,
  onAcceptQuest,
  onCompleteQuest,
  onClaimAllReady,
  onBuyOrbsShopItem,
  onEquipOrbsShopItem,
  onSaveAvatar,
  onSaveProfile,
  onBuyServerRank,
  onAddServerRank,
  onDeleteServerRank,
  onBoostServer,
}: FeatureBallViewProps) {
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<FeatureBallHubTab>(initialTab);
  const [questFreq, setQuestFreq] = useState<QuestFrequency>('daily');
  const [questFilter, setQuestFilter] = useState<'all' | 'accepted' | 'incomplete' | 'completed'>('all');
  const [questSearch, setQuestSearch] = useState('');
  const [questPage, setQuestPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Orbs Shop state
  const [shopCategory, setShopCategory] = useState<'all' | OrbsShopCategory>('all');
  const [previewItem, setPreviewItem] = useState<OrbsShopItem | null>(null);

  // Profile editor state
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [pronouns, setPronouns] = useState(currentUser.pronouns || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [bannerColor, setBannerColor] = useState(currentUser.bannerColor || '#1E293B');
  const [avatarColor, setAvatarColor] = useState(currentUser.avatarColor || '#2563EB');

  // Server ranks & boost state
  const [selectedServerId, setSelectedServerId] = useState<string>(initialServerId || servers[0]?.id || '');
  const [newRankName, setNewRankName] = useState('');
  const [newRankBadge, setNewRankBadge] = useState('⭐');
  const [newRankPrice, setNewRankPrice] = useState(30);
  const [newRankColor, setNewRankColor] = useState('#2563EB');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialServerId && servers.some((s) => s.id === initialServerId)) {
      setSelectedServerId(initialServerId);
    } else if (!selectedServerId && servers[0]) {
      setSelectedServerId(servers[0].id);
    }
  }, [initialServerId, servers, selectedServerId]);

  useEffect(() => {
    setDisplayName(currentUser.displayName);
    setPronouns(currentUser.pronouns || '');
    setBio(currentUser.bio || '');
    setBannerColor(currentUser.bannerColor || '#1E293B');
    setAvatarColor(currentUser.avatarColor || '#2563EB');
  }, [currentUser.id, currentUser.displayName, currentUser.pronouns, currentUser.bio, currentUser.bannerColor, currentUser.avatarColor]);

  // Live 12:00 AM daily reset & 3-Day Plus Pass countdown ticker
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= new Date(questsState.nextDailyResetAt).getTime()) {
        onRefreshQuests().catch(() => {});
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [questsState.nextDailyResetAt, onRefreshQuests]);

  const balance = currentUser.featureBalls ?? questsState.balance ?? 0;
  const ownedShopIds = useMemo(() => new Set(currentUser.ownedShopItemIds || []), [currentUser.ownedShopItemIds]);
  const acceptedQuestSet = useMemo(() => new Set(questsState.acceptedQuestIds || []), [questsState.acceptedQuestIds]);
  const plusRemaining = formatRemainingHours(currentUser.plusPassExpiresAt, nowMs);

  const activeQuestList = useMemo(() => {
    const list = questsState.quests.filter((q) => q.frequency === questFreq);
    const term = questSearch.trim().toLowerCase();
    return list.filter((q) => {
      if (questFilter === 'accepted' && !acceptedQuestSet.has(q.id)) return false;
      if (questFilter === 'incomplete' && q.claimed) return false;
      if (questFilter === 'completed' && !q.claimed) return false;
      if (term && !q.title.toLowerCase().includes(term) && !q.description.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [questsState.quests, questFreq, questFilter, questSearch, acceptedQuestSet]);

  const readyToClaimCount = useMemo(
    () => questsState.quests.filter((q) => q.frequency === questFreq && !q.claimed && q.progress >= q.target).length,
    [questsState.quests, questFreq]
  );

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(activeQuestList.length / PAGE_SIZE));
  const safePage = Math.min(questPage, totalPages);
  const pagedQuests = activeQuestList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filteredShopItems = useMemo(
    () => (shopCategory === 'all' ? ORBS_SHOP_ITEMS : ORBS_SHOP_ITEMS.filter((i) => i.category === shopCategory)),
    [shopCategory]
  );

  // Live preview user combining equipped cosmetics + hovered/clicked shop preview
  const previewUser: User = useMemo(() => {
    const base: User = {
      ...currentUser,
      displayName: displayName || currentUser.displayName,
      pronouns,
      bio,
      bannerColor,
      avatarColor,
    };
    if (!previewItem) return base;
    if (previewItem.category === 'decoration') {
      return { ...base, avatarDecoration: previewItem.cosmeticKey };
    }
    if (previewItem.category === 'effect') {
      return { ...base, profileEffect: previewItem.cosmeticKey };
    }
    if (previewItem.category === 'nameplate') {
      return { ...base, equippedNameplate: previewItem.cosmeticKey };
    }
    if (previewItem.category === 'exclusive' && !previewItem.repeatable) {
      return {
        ...base,
        equippedBadges: Array.from(new Set([...(base.equippedBadges || []), previewItem.cosmeticKey])),
      };
    }
    return base;
  }, [currentUser, displayName, pronouns, bio, bannerColor, avatarColor, previewItem]);

  const previewEffectClass = previewUser.profileEffect ? PROFILE_EFFECT_CLASS[previewUser.profileEffect] || '' : '';
  const previewNameplateClass = previewUser.equippedNameplate ? NAMEPLATE_CLASS[previewUser.equippedNameplate] || '' : '';
  const previewHasPlus = Boolean(
    plusRemaining || (previewItem && previewItem.id === 'perk-plus-3day')
  );

  const selectedServer = servers.find((s) => s.id === selectedServerId) || servers[0] || null;
  const myOwnedRankIds = selectedServer?.memberRanks?.[currentUser.id] || [];
  const isSelectedServerOwner = Boolean(selectedServer && selectedServer.ownerId === currentUser.id);
  const nextBoostTarget =
    (selectedServer?.boostCount || 0) < 2 ? 2 : (selectedServer?.boostCount || 0) < 7 ? 7 : 14;

  const isItemEquipped = (item: OrbsShopItem): boolean => {
    if (item.category === 'decoration') return currentUser.avatarDecoration === item.cosmeticKey;
    if (item.category === 'effect') return currentUser.profileEffect === item.cosmeticKey;
    if (item.category === 'nameplate') return currentUser.equippedNameplate === item.cosmeticKey;
    if (item.category === 'exclusive' && !item.repeatable) {
      return Boolean(currentUser.equippedBadges?.includes(item.cosmeticKey));
    }
    return false;
  };

  const itemSlot = (item: OrbsShopItem): 'decoration' | 'effect' | 'nameplate' | 'badge' => {
    if (item.category === 'decoration') return 'decoration';
    if (item.category === 'effect') return 'effect';
    if (item.category === 'nameplate') return 'nameplate';
    return 'badge';
  };

  const handleBuyShopItem = async (item: OrbsShopItem) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await onBuyOrbsShopItem(item.id);
      setPreviewItem(null);
      setNotice(
        item.repeatable
          ? `Redeemed "${item.name}" for ${item.price} Feature Balls! Your 72-hour Plus status is active.`
          : `Unlocked & equipped "${item.name}" for ${item.price} Feature Balls! It is permanently in your collection.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete purchase.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleEquipItem = async (item: OrbsShopItem) => {
    setBusyId(`equip-${item.id}`);
    setError(null);
    setNotice(null);
    try {
      const wasEquipped = isItemEquipped(item);
      await onEquipOrbsShopItem(itemSlot(item), item.id);
      setNotice(wasEquipped ? `Unequipped "${item.name}".` : `Equipped "${item.name}" (Free — already owned).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to equip item.');
    } finally {
      setBusyId(null);
    }
  };

  const ownedCollection = ORBS_SHOP_ITEMS.filter((i) => !i.repeatable && ownedShopIds.has(i.id));
  const orbHistory = currentUser.orbHistory || [];

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-white dark:bg-[#1B1E27]">
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="md:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
          <OrbIcon className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-base font-bold text-slate-950 dark:text-white truncate">
              Feature Balls
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Earn through Quests · Spend in the Orbs Shop, Profile Studio, Ranks &amp; Boosts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {plusRemaining && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-300 font-mono tabular-nums whitespace-nowrap">
              <span>✦ Plus</span>
              <span aria-hidden="true">·</span>
              <span>{plusRemaining}</span>
            </span>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5">
            <OrbIcon className="h-4 w-4 shrink-0" />
            <span className="font-mono text-sm font-bold text-indigo-700 dark:text-indigo-200 tabular-nums whitespace-nowrap">
              {balance.toLocaleString()} FB
            </span>
          </div>
        </div>
      </header>

      {/* Primary Workspace Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#171A21] px-4 sm:px-6 py-2 overflow-x-auto">
        {(
          [
            { id: 'quests', label: 'Quests', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
            { id: 'shop', label: 'Orbs Shop', icon: <ShoppingBag className="h-3.5 w-3.5" /> },
            { id: 'profile', label: 'Edit Profile', icon: <UserIcon className="h-3.5 w-3.5" /> },
            { id: 'ranks', label: 'Server Ranks & Boosts', icon: <Crown className="h-3.5 w-3.5" /> },
            { id: 'activity', label: 'Activity', icon: <History className="h-3.5 w-3.5" /> },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setError(null);
              setNotice(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === item.id
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.06]'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {notice && (
          <div className="max-w-5xl rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {notice}
          </div>
        )}
        {error && (
          <div className="max-w-5xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* TAB 1: QUESTS */}
        {tab === 'quests' && (
          <div className="space-y-5 max-w-5xl">
            {/* Summary Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuestFreq('daily');
                  setQuestPage(1);
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  questFreq === 'daily'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-slate-950 dark:text-white">Daily Quests</span>
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-300 tabular-nums">
                    <OrbIcon className="h-3.5 w-3.5" />
                    +2 FB each
                  </span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                  {questsState.dailyCompletedCount} / {questsState.dailyTotalCount}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.round(
                        (questsState.dailyCompletedCount / Math.max(1, questsState.dailyTotalCount)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Resets at 12:00 AM · {formatCountdown(questsState.nextDailyResetAt, nowMs)}</span>
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuestFreq('weekly');
                  setQuestPage(1);
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  questFreq === 'weekly'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-slate-950 dark:text-white">Weekly Quests</span>
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-300 tabular-nums">
                    <OrbIcon className="h-3.5 w-3.5" />
                    +10 FB each
                  </span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                  {questsState.weeklyCompletedCount} / {questsState.weeklyTotalCount}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width: `${Math.round(
                        (questsState.weeklyCompletedCount / Math.max(1, questsState.weeklyTotalCount)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No expiration until all 70 completed · Cycle #{questsState.weeklyCycle}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuestFreq('monthly');
                  setQuestPage(1);
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  questFreq === 'monthly'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-slate-950 dark:text-white">Monthly Quests</span>
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-300 tabular-nums">
                    <OrbIcon className="h-3.5 w-3.5" />
                    +200 FB each
                  </span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                  {questsState.monthlyCompletedCount} / {questsState.monthlyTotalCount}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{
                      width: `${Math.round(
                        (questsState.monthlyCompletedCount / Math.max(1, questsState.monthlyTotalCount)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No expiration until all 310 completed · Cycle #{questsState.monthlyCycle}
                </p>
              </button>
            </div>

            {/* Quest Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={questSearch}
                    onChange={(e) => {
                      setQuestSearch(e.target.value);
                      setQuestPage(1);
                    }}
                    placeholder={`Search ${questFreq} quests...`}
                    className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white w-52"
                  />
                </div>
                <div className="flex rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#14171F] p-0.5 text-xs">
                  {(['all', 'accepted', 'incomplete', 'completed'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setQuestFilter(f);
                        setQuestPage(1);
                      }}
                      className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors whitespace-nowrap ${
                        questFilter === f
                          ? 'bg-white dark:bg-[#232733] text-slate-950 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {readyToClaimCount > 0 && (
                  <button
                    type="button"
                    disabled={busyId === 'claim-all'}
                    onClick={async () => {
                      setBusyId('claim-all');
                      setError(null);
                      try {
                        await onClaimAllReady(questFreq);
                        setNotice(`Claimed all ${readyToClaimCount} ready ${questFreq} quests!`);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Unable to claim quests.');
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap"
                  >
                    <OrbIcon className="h-3.5 w-3.5" />
                    <span>Claim {readyToClaimCount} Ready</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTab('shop')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] whitespace-nowrap"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Spend in Orbs Shop</span>
                </button>
              </div>
            </div>

            {/* Quest Cards */}
            {pagedQuests.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No quests match this filter. Switch to <strong>All</strong> or clear your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pagedQuests.map((q) => {
                  const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100));
                  const isAccepted = acceptedQuestSet.has(q.id);
                  return (
                    <div
                      key={q.id}
                      className={`flex flex-col justify-between gap-3 rounded-xl border p-4 transition-colors ${
                        q.claimed
                          ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                          : isAccepted
                          ? 'border-indigo-500/40 bg-indigo-500/[0.04]'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white leading-snug">
                            {q.title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{q.description}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 shrink-0 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                          <OrbIcon className="h-3.5 w-3.5" />
                          +{q.reward} FB
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {q.claimed ? 'Reward claimed' : isAccepted ? 'Accepted · In progress' : 'Available quest'}
                          </span>
                          <span className="font-mono tabular-nums">
                            {q.progress} / {q.target}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all ${q.claimed ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {q.claimed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" />
                              Claimed
                            </span>
                          ) : (
                            <>
                              {!isAccepted && (
                                <button
                                  type="button"
                                  disabled={busyId === `accept-${q.id}`}
                                  onClick={async () => {
                                    setBusyId(`accept-${q.id}`);
                                    setError(null);
                                    try {
                                      await onAcceptQuest(q.id);
                                      setNotice(`Accepted "${q.title}". Track it under the Accepted tab!`);
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : 'Unable to accept quest.');
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                  className="rounded-lg border border-slate-200 dark:border-white/12 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-white/10 disabled:opacity-50 whitespace-nowrap"
                                >
                                  Accept Quest
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyId === q.id}
                                onClick={async () => {
                                  setBusyId(q.id);
                                  setError(null);
                                  try {
                                    await onCompleteQuest(q.id);
                                    setNotice(`Completed "${q.title}" and earned +${q.reward} Feature Balls!`);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : 'Unable to complete quest.');
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap"
                              >
                                {busyId === q.id
                                  ? 'Claiming...'
                                  : q.progress >= q.target
                                  ? `Claim +${q.reward} FB`
                                  : `Complete & Claim +${q.reward} FB`}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-4 text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, activeQuestList.length)} of{' '}
                  {activeQuestList.length} quests
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setQuestPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1 font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setQuestPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1 font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DISCORD ORBS-STYLE SHOP */}
        {tab === 'shop' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl items-start">
            <div className="lg:col-span-8 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                    Feature Ball Orbs Shop
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Spend earned Feature Balls on permanent exclusives, 3-day Plus credits, avatar decorations, profile effects, and nameplates.
                  </p>
                </div>
              </div>

              {/* Shop Category Filter */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#14171F] p-1 w-fit">
                {(
                  [
                    { id: 'all', label: 'All Items' },
                    { id: 'exclusive', label: 'Orbs Exclusives' },
                    { id: 'decoration', label: 'Avatar Decorations' },
                    { id: 'effect', label: 'Profile Effects' },
                    { id: 'nameplate', label: 'Nameplates' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setShopCategory(c.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      shopCategory === c.id
                        ? 'bg-white dark:bg-[#232733] text-slate-950 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Shop Item Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredShopItems.map((item) => {
                  const owned = !item.repeatable && ownedShopIds.has(item.id);
                  const equipped = isItemEquipped(item);
                  const isPreviewing = previewItem?.id === item.id;
                  const canAfford = balance >= item.price;

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col justify-between gap-3 rounded-xl border p-4 transition-colors ${
                        isPreviewing
                          ? 'border-indigo-500 bg-indigo-500/[0.06]'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21]'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Visual Item Preview Banner */}
                        <div className="flex h-20 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111318] px-4 overflow-hidden relative">
                          {item.category === 'decoration' && (
                            <div className={`rounded-full p-0.5 ${item.previewClass || ''}`}>
                              <Avatar
                                user={{ ...currentUser, avatarDecoration: item.cosmeticKey }}
                                size="lg"
                              />
                            </div>
                          )}
                          {item.category === 'effect' && (
                            <div
                              className="h-full w-full relative flex items-center justify-center"
                              style={{ backgroundColor: currentUser.bannerColor || '#1E293B' }}
                            >
                              <div className={`absolute inset-0 ${item.previewClass || ''}`} />
                              <span className="relative text-xs font-semibold text-white drop-shadow">
                                {item.name}
                              </span>
                            </div>
                          )}
                          {item.category === 'nameplate' && (
                            <div
                              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 ${item.previewClass || ''}`}
                            >
                              <Avatar user={currentUser} size="sm" showPresence />
                              <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                {currentUser.displayName}
                              </span>
                            </div>
                          )}
                          {item.category === 'exclusive' && (
                            <div className="flex items-center gap-3">
                              <span
                                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl font-bold"
                                style={{
                                  backgroundColor: `${item.accentHex}22`,
                                  color: item.accentHex,
                                }}
                              >
                                {item.badgeGlyph || '◈'}
                              </span>
                              <div className="text-left">
                                <p className="text-xs font-bold text-slate-900 dark:text-white">
                                  {item.repeatable ? '72-Hour Redeemable Pass' : 'Orbs-Exclusive Badge'}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {item.repeatable ? 'Stackable duration' : 'Permanent profile display'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                              {item.name}
                            </h3>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-white/[0.08] pt-3">
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                          <OrbIcon className="h-3.5 w-3.5" />
                          {item.price.toLocaleString()} FB
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(isPreviewing ? null : item)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                              isPreviewing
                                ? 'border-indigo-500 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.06]'
                            }`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>{isPreviewing ? 'Previewing' : 'Preview'}</span>
                          </button>

                          {owned ? (
                            <button
                              type="button"
                              disabled={busyId === `equip-${item.id}`}
                              onClick={() => handleToggleEquipItem(item)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                equipped
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                  : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                              }`}
                            >
                              {equipped ? 'Equipped' : 'Equip'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === item.id || !canAfford}
                              onClick={() => handleBuyShopItem(item)}
                              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45 whitespace-nowrap"
                            >
                              {busyId === item.id
                                ? 'Unlocking...'
                                : item.repeatable
                                ? 'Redeem'
                                : 'Unlock'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sticky Live Orbs Profile & Member-List Preview */}
            <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-0">
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#14171F]">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] px-4 py-2.5 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {previewItem ? `Previewing: ${previewItem.name}` : 'Your Live Profile'}
                  </span>
                  {previewItem && (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(null)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="h-24 relative" style={{ backgroundColor: previewUser.bannerColor || '#1E293B' }}>
                  {previewEffectClass && <div className={`absolute inset-0 ${previewEffectClass}`} />}
                </div>
                <div className="px-5 pb-5">
                  <div className="-mt-10 mb-3 flex items-end justify-between">
                    <div className="rounded-full ring-4 ring-white dark:ring-[#14171F]">
                      <Avatar user={previewUser} size="xl" showPresence />
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                      <OrbIcon className="h-3.5 w-3.5" />
                      {balance.toLocaleString()} FB
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                      {previewUser.displayName}
                    </h3>
                    {(previewUser.equippedBadges || [])
                      .map((k) => ORBS_BADGE_META[k])
                      .filter(Boolean)
                      .map((b) => (
                        <span key={b.name} title={b.name} className="text-sm font-bold" style={{ color: b.color }}>
                          {b.glyph}
                        </span>
                      ))}
                    {previewHasPlus && <span className="text-xs font-semibold text-amber-500">✦ Plus</span>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    @{previewUser.username}
                    {previewUser.pronouns && ` · ${previewUser.pronouns}`}
                  </p>

                  {/* Member list nameplate preview */}
                  <div className="mt-4 space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Member List Preview</p>
                    <div
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                        previewNameplateClass || 'bg-slate-100 dark:bg-white/[0.04]'
                      }`}
                    >
                      <Avatar user={previewUser} size="sm" showPresence />
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {previewUser.displayName}
                      </span>
                      {previewHasPlus && <span className="text-xs font-bold text-amber-400">✦</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-white">How Feature Balls Work</p>
                <p>Earned exclusively by completing Quests · Never expire once earned.</p>
                <p>Account-bound and non-transferable · Unlocked Shop cosmetics stay in your collection forever.</p>
              </div>
            </aside>
          </div>
        )}

        {/* TAB 3: PROFILE STUDIO */}
        {tab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl items-start">
            <div className="lg:col-span-7 space-y-5">
              {/* Free Profile Image Uploader (0 Feature Balls) */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={currentUser} size="lg" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                      Profile Image · Free (0 Feature Balls)
                    </p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                      Upload a PNG, JPG, WebP, or GIF photo anytime without spending Feature Balls.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === 'save-avatar'}
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{busyId === 'save-avatar' ? 'Uploading...' : 'Change Photo'}</span>
                  </button>
                  {currentUser.avatarUrl && (
                    <button
                      type="button"
                      disabled={busyId === 'save-avatar'}
                      onClick={async () => {
                        setError(null);
                        setNotice(null);
                        setBusyId('save-avatar');
                        try {
                          await onSaveAvatar(null);
                          setNotice('Profile image removed! Free — 0 Feature Balls spent.');
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Unable to remove profile image.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-rose-500/30 p-1.5 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                      aria-label="Remove profile image"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setError(null);
                      setNotice(null);
                      setBusyId('save-avatar');
                      try {
                        const dataUrl = await processImageUpload(file, 256);
                        await onSaveAvatar(dataUrl);
                        setNotice('Profile image updated! Free — 0 Feature Balls spent.');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Unable to update profile image.');
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Owned Orbs Shop Cosmetics Switcher (Free to equip once unlocked) */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                      Your Orbs Collection ({ownedCollection.length})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Equip or unequip any unlocked decoration, effect, nameplate, or badge for free.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('shop')}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
                  >
                    Browse Shop →
                  </button>
                </div>

                {ownedCollection.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    You have not unlocked any Orbs Shop items yet. Complete quests and visit the Orbs Shop to collect decorations, effects, badges, and nameplates.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ownedCollection.map((item) => {
                      const active = isItemEquipped(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={busyId === `equip-${item.id}`}
                          onClick={() => handleToggleEquipItem(item)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                            active
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/20'
                          }`}
                        >
                          {item.name} {active ? '· Equipped' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Paid Profile Details Form (10 Feature Balls) */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  setNotice(null);
                  setBusyId('save-profile');
                  try {
                    await onSaveProfile({
                      displayName: displayName.trim() || currentUser.displayName,
                      pronouns: pronouns.trim(),
                      bio: bio.trim(),
                      bannerColor,
                      avatarColor,
                    });
                    setNotice(`Profile updated! Spent ${PROFILE_EDIT_COST} Feature Balls.`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Unable to save profile.');
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-5"
              >
                <div>
                  <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                    Profile Details ({PROFILE_EDIT_COST} Feature Balls)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Edit your display name, pronouns, bio, banner color, and fallback avatar color.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Pronouns
                    </label>
                    <input
                      type="text"
                      value={pronouns}
                      onChange={(e) => setPronouns(e.target.value)}
                      placeholder="they/them, he/him, she/her"
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    About Me / Bio
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell communities about yourself..."
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <span>Banner Color</span>
                    <input
                      type="color"
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      className="h-6 w-8 cursor-pointer border-0 bg-transparent"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <span>Avatar Color</span>
                    <input
                      type="color"
                      value={avatarColor}
                      onChange={(e) => setAvatarColor(e.target.value)}
                      className="h-6 w-8 cursor-pointer border-0 bg-transparent"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Balance: <strong className="font-mono text-indigo-600 dark:text-indigo-300 tabular-nums">{balance.toLocaleString()} FB</strong>
                  </span>
                  <button
                    type="submit"
                    disabled={busyId === 'save-profile' || balance < PROFILE_EDIT_COST}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45 whitespace-nowrap"
                  >
                    <OrbIcon className="h-3.5 w-3.5" />
                    <span>
                      {busyId === 'save-profile'
                        ? 'Saving...'
                        : `Save Details (${PROFILE_EDIT_COST} FB)`}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Live Profile Card Preview */}
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#14171F]">
                <div className="h-24 relative" style={{ backgroundColor: bannerColor }}>
                  {currentUser.profileEffect && PROFILE_EFFECT_CLASS[currentUser.profileEffect] && (
                    <div className={`absolute inset-0 ${PROFILE_EFFECT_CLASS[currentUser.profileEffect]}`} />
                  )}
                </div>
                <div className="px-5 pb-5">
                  <div className="-mt-10 mb-3 flex items-end justify-between">
                    <div className="rounded-full ring-4 ring-white dark:ring-[#14171F]">
                      <Avatar
                        user={{
                          ...currentUser,
                          displayName: displayName || currentUser.displayName,
                          avatarColor,
                        }}
                        size="xl"
                        showPresence
                      />
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                      <OrbIcon className="h-3.5 w-3.5" />
                      {balance.toLocaleString()} FB
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                      {displayName || currentUser.displayName}
                    </h3>
                    {(currentUser.equippedBadges || [])
                      .map((k) => ORBS_BADGE_META[k])
                      .filter(Boolean)
                      .map((b) => (
                        <span key={b.name} title={b.name} className="text-sm font-bold" style={{ color: b.color }}>
                          {b.glyph}
                        </span>
                      ))}
                    {plusRemaining && <span className="text-xs font-semibold text-amber-500">✦ Plus</span>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    @{currentUser.username}
                    {pronouns && ` · ${pronouns}`}
                  </p>
                  <div className="mt-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1D2029] p-3 text-xs text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">About Me</p>
                    <p className="leading-relaxed">{bio || 'No bio set yet.'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SERVER RANKS & BOOSTS */}
        {tab === 'ranks' && (
          <div className="space-y-6 max-w-5xl">
            {servers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-8 text-center text-sm text-slate-500">
                Join or create a server first to buy cosmetic server ranks or boost a server.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                      Select a Server
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Spend Feature Balls to boost any server (100 FB) or collect zero-permission cosmetic server ranks.
                    </p>
                  </div>
                  <select
                    value={selectedServer?.id || ''}
                    onChange={(e) => setSelectedServerId(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#14171F] px-3.5 py-2 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Boost Lv.{s.boostLevel || 0} · {s.boostCount || 0} boosts)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedServer && (
                  <>
                    {/* Discord-style Server Boost Panel */}
                    <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/[0.06] p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Rocket className="h-5 w-5 text-fuchsia-500" />
                            <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                              Boost {selectedServer.name}
                            </h3>
                            <span className="font-mono text-xs font-bold text-fuchsia-600 dark:text-fuchsia-300 tabular-nums">
                              · Level {selectedServer.boostLevel || 0}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            1 Server Boost = <strong>{SERVER_BOOST_COST} Feature Balls</strong>. Boosts raise
                            the server level (Lv.1 at 2, Lv.2 at 7, Lv.3 at 14) and post a celebration announcement.
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={busyId === 'boost' || balance < SERVER_BOOST_COST}
                          onClick={async () => {
                            setBusyId('boost');
                            setError(null);
                            setNotice(null);
                            try {
                              await onBoostServer(selectedServer.id);
                              setNotice(
                                `Boosted ${selectedServer.name}! Spent ${SERVER_BOOST_COST} Feature Balls.`
                              );
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Unable to boost server.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-bold text-white hover:bg-fuchsia-500 disabled:opacity-45 shrink-0 whitespace-nowrap"
                        >
                          <Rocket className="h-4 w-4" />
                          <span>
                            {busyId === 'boost' ? 'Boosting...' : `Boost Server (${SERVER_BOOST_COST} FB)`}
                          </span>
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                          <span>{selectedServer.boostCount || 0} Total Boosts</span>
                          <span>Next milestone: {nextBoostTarget} Boosts</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-fuchsia-500 transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(((selectedServer.boostCount || 0) / nextBoostTarget) * 100)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      {(selectedServer.boosters || []).length > 0 && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Recent Boosters:{' '}
                          {(selectedServer.boosters || [])
                            .slice(0, 6)
                            .map((b) => `${users[b.userId]?.displayName || 'Member'} (×${b.count})`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Cosmetic Server Ranks Shop */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-display text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                          <Award className="h-4 w-4 text-amber-500" />
                          <span>{selectedServer.name} Cosmetic Ranks</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Cosmetic display ranks only — server ranks grant <strong>no permissions</strong>.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(selectedServer.shopRanks || []).map((rank) => {
                          const owned = myOwnedRankIds.includes(rank.id);
                          return (
                            <div
                              key={rank.id}
                              className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-display text-sm font-bold" style={{ color: rank.color }}>
                                    {rank.badge || '⭐'} {rank.name}
                                  </span>
                                  {isSelectedServerOwner && (selectedServer.shopRanks || []).length > 1 && (
                                    <button
                                      type="button"
                                      title="Remove rank"
                                      onClick={async () => {
                                        setError(null);
                                        try {
                                          await onDeleteServerRank(selectedServer.id, rank.id);
                                          setNotice(`Removed rank "${rank.name}".`);
                                        } catch (err) {
                                          setError(err instanceof Error ? err.message : 'Unable to remove rank.');
                                        }
                                      }}
                                      className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Zero permissions · Cosmetic badge shown in chat &amp; member list
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/8">
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                                  <OrbIcon className="h-3.5 w-3.5" />
                                  {rank.price} FB
                                </span>
                                {owned ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <Check className="h-3.5 w-3.5" />
                                    Owned
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busyId === rank.id || balance < rank.price}
                                    onClick={async () => {
                                      setBusyId(rank.id);
                                      setError(null);
                                      setNotice(null);
                                      try {
                                        await onBuyServerRank(selectedServer.id, rank.id);
                                        setNotice(`Purchased "${rank.name}" rank in ${selectedServer.name}!`);
                                      } catch (err) {
                                        setError(err instanceof Error ? err.message : 'Unable to buy rank.');
                                      } finally {
                                        setBusyId(null);
                                      }
                                    }}
                                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45 whitespace-nowrap"
                                  >
                                    {busyId === rank.id ? 'Buying...' : 'Buy Rank'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {isSelectedServerOwner && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!newRankName.trim()) return;
                            setBusyId('add-rank');
                            setError(null);
                            try {
                              await onAddServerRank(selectedServer.id, {
                                name: newRankName.trim(),
                                badge: newRankBadge.trim() || '⭐',
                                color: newRankColor,
                                price: Math.max(1, Number(newRankPrice) || 20),
                              });
                              setNewRankName('');
                              setNotice(`Added cosmetic rank "${newRankName.trim()}" to ${selectedServer.name}.`);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Unable to add rank.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3"
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            Owner Controls: Add Cosmetic Rank (No Permissions)
                          </p>
                          <div className="grid grid-cols-12 gap-2">
                            <input
                              type="text"
                              maxLength={4}
                              value={newRankBadge}
                              onChange={(e) => setNewRankBadge(e.target.value)}
                              aria-label="Rank badge emoji"
                              className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-2 py-1.5 text-center text-xs text-slate-900 dark:text-white"
                            />
                            <input
                              type="text"
                              required
                              value={newRankName}
                              onChange={(e) => setNewRankName(e.target.value)}
                              placeholder="New rank name (e.g. Emerald Supporter)"
                              className="col-span-10 sm:col-span-5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                            <input
                              type="number"
                              min={1}
                              max={100000}
                              value={newRankPrice}
                              onChange={(e) => setNewRankPrice(Number(e.target.value))}
                              aria-label="Rank price in Feature Balls"
                              className="col-span-5 sm:col-span-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white tabular-nums"
                            />
                            <input
                              type="color"
                              value={newRankColor}
                              onChange={(e) => setNewRankColor(e.target.value)}
                              aria-label="Rank color"
                              className="col-span-2 sm:col-span-1 h-8 w-full cursor-pointer border-0 bg-transparent"
                            />
                            <button
                              type="submit"
                              disabled={busyId === 'add-rank'}
                              className="col-span-5 sm:col-span-3 inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add Rank</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 5: ORBS ACTIVITY LEDGER */}
        {tab === 'activity' && (
          <div className="space-y-5 max-w-4xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Current Balance</p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                  <OrbIcon className="h-5 w-5" />
                  <span>{balance.toLocaleString()} FB</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Orbs Collection</p>
                <p className="mt-1 font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                  {ownedCollection.length} / {ORBS_SHOP_ITEMS.filter((i) => !i.repeatable).length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">3-Day Plus Credit</p>
                <p className="mt-1 font-mono text-base font-bold text-slate-950 dark:text-white tabular-nums">
                  {plusRemaining ? `Active · ${plusRemaining}` : 'Not Active'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] overflow-hidden">
              <div className="border-b border-slate-200 dark:border-white/10 px-4 py-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                  Feature Ball Activity Ledger
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {orbHistory.length} recent entries
                </span>
              </div>

              {orbHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Complete a quest or unlock an item in the Orbs Shop to see your Feature Ball history here.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                  {orbHistory.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs hover:bg-slate-100/70 dark:hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{tx.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tx.category.toUpperCase()} · {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`font-mono font-bold tabular-nums shrink-0 ${
                          tx.type === 'earn'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {tx.type === 'earn' ? '+' : '-'}
                        {tx.amount.toLocaleString()} FB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
