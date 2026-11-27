export type OrbsShopCategory = 'exclusive' | 'decoration' | 'effect' | 'nameplate';

export interface OrbsShopItem {
  id: string;
  name: string;
  description: string;
  category: OrbsShopCategory;
  price: number;
  repeatable?: boolean;
  /** Value stored on user.avatarDecoration / profileEffect / equippedNameplate / equippedBadges */
  cosmeticKey: string;
  /** Visual styling tokens for preview and live rendering */
  accentHex: string;
  previewClass?: string;
  badgeGlyph?: string;
  durationHours?: number;
}

export const ORBS_SHOP_ITEMS: OrbsShopItem[] = [
  // --- Orbs Exclusives (Badges & 3-Day Plus Credit, like Discord Orbs Exclusives) ---
  {
    id: 'badge-orb-apprentice',
    name: 'Feature Ball Apprentice Badge',
    description: 'Permanent Orbs-exclusive profile badge displayed on your profile card and in chat.',
    category: 'exclusive',
    price: 120,
    cosmeticKey: 'badge-orb-apprentice',
    accentHex: '#818CF8',
    badgeGlyph: '◈',
  },
  {
    id: 'perk-plus-3day',
    name: '3-Day LiveChatter Plus Credit',
    description: 'Redeem Feature Balls for 72 hours of Plus status, Plus profile emblem, and animated banner sheen. Stackable.',
    category: 'exclusive',
    price: 250,
    repeatable: true,
    cosmeticKey: 'plus-3day',
    accentHex: '#F59E0B',
    badgeGlyph: '✦',
    durationHours: 72,
  },
  {
    id: 'badge-orb-collector',
    name: 'Feature Ball Collector Badge',
    description: 'Prestige permanent profile badge for dedicated quest earners and Orbs collectors.',
    category: 'exclusive',
    price: 450,
    cosmeticKey: 'badge-orb-collector',
    accentHex: '#38BDF8',
    badgeGlyph: '❖',
  },

  // --- Avatar Decorations (Buy once, own forever, equip anytime for free) ---
  {
    id: 'deco-orbital-halo',
    name: 'Orbital Halo',
    description: 'Signature iridescent indigo-cyan orbital ring crafted for Feature Ball earners.',
    category: 'decoration',
    price: 150,
    cosmeticKey: 'orbital-halo',
    accentHex: '#6366F1',
    previewClass: 'ring-2 ring-indigo-400 shadow-[0_0_16px_rgba(99,102,241,0.65)]',
  },
  {
    id: 'deco-neon-ring',
    name: 'Neon Ring',
    description: 'Crisp electric cyan ring framing your avatar across servers and DMs.',
    category: 'decoration',
    price: 120,
    cosmeticKey: 'neon-ring',
    accentHex: '#22D3EE',
    previewClass: 'ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.55)]',
  },
  {
    id: 'deco-gold-halo',
    name: 'Gold Halo',
    description: 'Warm gilded amber ring that highlights your avatar in voice and chat.',
    category: 'decoration',
    price: 200,
    cosmeticKey: 'gold-halo',
    accentHex: '#FBBF24',
    previewClass: 'ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.55)]',
  },
  {
    id: 'deco-emerald-pulse',
    name: 'Emerald Pulse',
    description: 'Vivid emerald halo ring for active community builders.',
    category: 'decoration',
    price: 140,
    cosmeticKey: 'emerald-pulse',
    accentHex: '#34D399',
    previewClass: 'ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]',
  },
  {
    id: 'deco-prism-frame',
    name: 'Prism Frame',
    description: 'Refracted magenta-violet ring around your profile photo.',
    category: 'decoration',
    price: 180,
    cosmeticKey: 'prism-frame',
    accentHex: '#E879F9',
    previewClass: 'ring-2 ring-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,0.55)]',
  },
  {
    id: 'deco-solar-flare',
    name: 'Solar Flare',
    description: 'High-contrast fiery orange-rose halo ring for standout profiles.',
    category: 'decoration',
    price: 240,
    cosmeticKey: 'solar-flare',
    accentHex: '#FB7185',
    previewClass: 'ring-2 ring-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.6)]',
  },
  {
    id: 'deco-frost-crystal',
    name: 'Frost Crystal',
    description: 'Cool glacial sky ring with crisp frosted edge lighting.',
    category: 'decoration',
    price: 160,
    cosmeticKey: 'frost-crystal',
    accentHex: '#7DD3FC',
    previewClass: 'ring-2 ring-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.55)]',
  },

  // --- Profile Effects (Buy once, own forever, equip anytime for free) ---
  {
    id: 'effect-orbital-drift',
    name: 'Orbital Drift',
    description: 'Signature Feature Ball atmospheric shimmer sweeping across your profile banner.',
    category: 'effect',
    price: 180,
    cosmeticKey: 'orbital-drift',
    accentHex: '#818CF8',
    previewClass: 'bg-gradient-to-tr from-indigo-500/35 via-sky-400/20 to-amber-400/30',
  },
  {
    id: 'effect-aurora',
    name: 'Aurora Glow',
    description: 'Northern-lights cyan and emerald wash layered over your profile header.',
    category: 'effect',
    price: 150,
    cosmeticKey: 'aurora',
    accentHex: '#2DD4BF',
    previewClass: 'bg-gradient-to-r from-cyan-500/30 via-indigo-500/25 to-emerald-500/30',
  },
  {
    id: 'effect-starfield',
    name: 'Starfield',
    description: 'Deep twilight indigo gradient finish for night-sky profile cards.',
    category: 'effect',
    price: 170,
    cosmeticKey: 'starfield',
    accentHex: '#6366F1',
    previewClass: 'bg-gradient-to-br from-slate-950/55 via-indigo-600/30 to-violet-500/30',
  },
  {
    id: 'effect-ember',
    name: 'Ember Drift',
    description: 'Warm amber-to-crimson horizon glow across your banner.',
    category: 'effect',
    price: 160,
    cosmeticKey: 'ember',
    accentHex: '#F97316',
    previewClass: 'bg-gradient-to-r from-amber-500/30 via-orange-500/25 to-rose-500/30',
  },
  {
    id: 'effect-sakura',
    name: 'Sakura Breeze',
    description: 'Soft rose-petal tint with subtle dusk warmth.',
    category: 'effect',
    price: 200,
    cosmeticKey: 'sakura',
    accentHex: '#F472B6',
    previewClass: 'bg-gradient-to-r from-pink-400/30 via-rose-400/20 to-amber-300/25',
  },

  // --- Nameplates (Discord Orbs Shop style member-list & profile plates) ---
  {
    id: 'plate-obsidian-gold',
    name: 'Obsidian Gold Nameplate',
    description: 'Subtle gilded dark plate behind your name in every server member list.',
    category: 'nameplate',
    price: 140,
    cosmeticKey: 'obsidian-gold',
    accentHex: '#F59E0B',
    previewClass: 'bg-gradient-to-r from-amber-500/18 via-amber-400/8 to-transparent border border-amber-500/25',
  },
  {
    id: 'plate-aurora-ribbon',
    name: 'Aurora Ribbon Nameplate',
    description: 'Iridescent indigo-cyan ribbon highlighting your member list entry.',
    category: 'nameplate',
    price: 160,
    cosmeticKey: 'aurora-ribbon',
    accentHex: '#6366F1',
    previewClass: 'bg-gradient-to-r from-indigo-500/20 via-cyan-400/10 to-transparent border border-indigo-400/25',
  },
  {
    id: 'plate-emerald-tide',
    name: 'Emerald Tide Nameplate',
    description: 'Crisp emerald gradient plate for community regulars.',
    category: 'nameplate',
    price: 140,
    cosmeticKey: 'emerald-tide',
    accentHex: '#10B981',
    previewClass: 'bg-gradient-to-r from-emerald-500/18 via-teal-400/10 to-transparent border border-emerald-500/25',
  },
  {
    id: 'plate-crimson-dusk',
    name: 'Crimson Dusk Nameplate',
    description: 'Warm sunset crimson wash across your member row.',
    category: 'nameplate',
    price: 150,
    cosmeticKey: 'crimson-dusk',
    accentHex: '#F43F5E',
    previewClass: 'bg-gradient-to-r from-rose-500/20 via-orange-400/10 to-transparent border border-rose-500/25',
  },
  {
    id: 'plate-glacier-mist',
    name: 'Glacier Mist Nameplate',
    description: 'Clean icy sky-blue gradient nameplate.',
    category: 'nameplate',
    price: 130,
    cosmeticKey: 'glacier-mist',
    accentHex: '#38BDF8',
    previewClass: 'bg-gradient-to-r from-sky-400/20 via-blue-400/10 to-transparent border border-sky-400/25',
  },
];

export const ORBS_SHOP_ITEM_BY_ID = new Map(ORBS_SHOP_ITEMS.map((i) => [i.id, i]));

export const AVATAR_DECORATION_RING_CLASS: Record<string, string> = Object.fromEntries(
  ORBS_SHOP_ITEMS.filter((i) => i.category === 'decoration' && i.previewClass).map((i) => [
    i.cosmeticKey,
    i.previewClass!,
  ])
);

export const PROFILE_EFFECT_CLASS: Record<string, string> = Object.fromEntries(
  ORBS_SHOP_ITEMS.filter((i) => i.category === 'effect' && i.previewClass).map((i) => [
    i.cosmeticKey,
    i.previewClass!,
  ])
);

export const NAMEPLATE_CLASS: Record<string, string> = Object.fromEntries(
  ORBS_SHOP_ITEMS.filter((i) => i.category === 'nameplate' && i.previewClass).map((i) => [
    i.cosmeticKey,
    i.previewClass!,
  ])
);

export const ORBS_BADGE_META: Record<string, { name: string; glyph: string; color: string }> = Object.fromEntries(
  ORBS_SHOP_ITEMS.filter((i) => i.category === 'exclusive' && !i.repeatable).map((i) => [
    i.cosmeticKey,
    { name: i.name, glyph: i.badgeGlyph || '◈', color: i.accentHex },
  ])
);
