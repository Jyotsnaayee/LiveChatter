import { useState } from 'react';
import { Check, Compass, Menu, Search, Users } from 'lucide-react';
import type { DiscoveryServer, Server } from '../shared/types';

interface DiscoveryViewProps {
  discoveryServers: DiscoveryServer[];
  joinedServers: Server[];
  onJoinDiscoveryServer: (discoveryId: string) => Promise<void>;
  onOpenMobileMenu: () => void;
}

const CATEGORIES: Array<'All' | DiscoveryServer['category']> = [
  'All',
  'Open Source',
  'Education',
  'Gaming',
  'Creators',
];

export function DiscoveryView({
  discoveryServers,
  joinedServers,
  onJoinDiscoveryServer,
  onOpenMobileMenu,
}: DiscoveryViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | DiscoveryServer['category']>('All');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const filtered = discoveryServers.filter((s) => {
    if (category !== 'All' && s.category !== category) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }
    return true;
  });

  const handleJoin = async (id: string) => {
    setJoiningId(id);
    try {
      await onJoinDiscoveryServer(id);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white dark:bg-[#1D2029]">
      {/* Hero Discovery Header */}
      <div className="relative overflow-hidden border-b border-slate-200 dark:border-white/[0.07]">
        <img
          src="/src/assets/images/banner_community_event_1795346376394.jpg"
          alt="LiveChatter community studio"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/65 to-slate-950/40" />

        <div className="relative mx-auto max-w-5xl px-6 py-10 space-y-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Open menu"
              className="md:hidden rounded-lg bg-black/40 p-2 text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          <div className="max-w-2xl space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
              Find your community on LiveChatter
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              Explore public open-source groups, study collectives, audio workshops, and gaming squads — every tool unlocked for free.
            </p>
          </div>

          <div className="relative max-w-lg">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities by topic or name..."
              className="w-full rounded-xl border border-white/15 bg-slate-950/70 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* Category Filter Tabs & Grid */}
      <div className="mx-auto w-full max-w-5xl px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                category === cat
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((srv) => {
            const alreadyJoined = joinedServers.some((j) => j.name.toLowerCase() === srv.name.toLowerCase());
            return (
              <div
                key={srv.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#232733]/60 p-5 space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white"
                        style={{ backgroundColor: srv.iconColor }}
                      >
                        {srv.name
                          .split(/\s+/)
                          .map((w) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-bold text-slate-950 dark:text-white truncate">
                          {srv.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {srv.category} · {srv.language}
                          {srv.verified ? ' · Verified Community' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{srv.description}</p>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/[0.07]">
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {srv.memberCount.toLocaleString()} members
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{srv.onlineCount.toLocaleString()} online</span>
                  </div>

                  <button
                    type="button"
                    disabled={alreadyJoined || joiningId === srv.id}
                    onClick={() => handleJoin(srv.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      alreadyJoined
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]'
                    }`}
                  >
                    {alreadyJoined ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Joined</span>
                      </>
                    ) : joiningId === srv.id ? (
                      'Joining...'
                    ) : (
                      <>
                        <Compass className="h-3.5 w-3.5" />
                        <span>Join Server</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
