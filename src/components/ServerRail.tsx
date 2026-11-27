import React, { useEffect, useState } from 'react';
import { Compass, Folder, FolderOpen, MessageSquare, Plus } from 'lucide-react';
import type { Server, ServerFolder } from '../shared/types';
import { OrbIcon } from './OrbIcon';

interface ServerRailProps {
  servers: Server[];
  folders: ServerFolder[];
  activeView: 'home' | 'server' | 'discovery' | 'featureballs';
  activeServerId: string | null;
  unreadChannelIds: string[];
  pendingRequestCount: number;
  featureBallBalance: number;
  onSelectHome: () => void;
  onSelectServer: (serverId: string) => void;
  onSelectDiscovery: () => void;
  onSelectFeatureBalls: () => void;
  onOpenCreateServer: () => void;
  onToggleFolder: (folderId: string) => void;
  onReorderServers: (orderedIds: string[]) => void;
}

function ServerIconButton({
  server,
  active,
  hasUnread,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  server: Server;
  active: boolean;
  hasUnread: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => {
    setImgErr(false);
  }, [server.iconUrl]);
  const initials = server.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative flex w-full items-center justify-center group">
      <span
        aria-hidden="true"
        className={`absolute left-0 w-1 rounded-r-full bg-slate-900 dark:bg-white transition-all duration-150 ${
          active ? 'h-9 opacity-100' : hasUnread ? 'h-2.5 opacity-80' : 'h-0 opacity-0 group-hover:h-5 group-hover:opacity-60'
        }`}
      />
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onClick}
        title={`${server.name} — Drag to reorder`}
        aria-label={server.name}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-12 w-12 items-center justify-center overflow-hidden transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          active ? 'rounded-2xl ring-2 ring-[var(--accent)]/60' : 'rounded-[24px] hover:rounded-2xl'
        }`}
        style={{ backgroundColor: server.iconUrl && !imgErr ? undefined : server.iconColor }}
      >
        {server.iconUrl && !imgErr ? (
          <img
            src={server.iconUrl}
            alt={server.name}
            referrerPolicy="no-referrer"
            onError={() => setImgErr(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-sm font-bold text-white select-none">{initials}</span>
        )}
      </button>
    </div>
  );
}

export function ServerRail({
  servers,
  folders,
  activeView,
  activeServerId,
  unreadChannelIds,
  pendingRequestCount,
  featureBallBalance,
  onSelectHome,
  onSelectServer,
  onSelectDiscovery,
  onSelectFeatureBalls,
  onOpenCreateServer,
  onToggleFolder,
  onReorderServers,
}: ServerRailProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const folderServerIds = new Set(folders.flatMap((f) => f.serverIds));
  const topLevelServers = servers.filter((s) => !folderServerIds.has(s.id));

  const serverHasUnread = (srv: Server) => srv.channels.some((c) => unreadChannelIds.includes(c.id));

  const handleDropOnServer = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = servers.map((s) => s.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedId);
    onReorderServers(ids);
    setDraggedId(null);
  };

  return (
    <nav
      aria-label="Servers"
      className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2.5 border-r border-slate-200 dark:border-white/[0.07] bg-[#E8EAEF] dark:bg-[#111318] py-3 overflow-y-auto"
    >
      {/* Home / Direct Messages */}
      <div className="relative flex w-full items-center justify-center group">
        <span
          aria-hidden="true"
          className={`absolute left-0 w-1 rounded-r-full bg-slate-900 dark:bg-white transition-all duration-150 ${
            activeView === 'home' ? 'h-9 opacity-100' : 'h-0 opacity-0 group-hover:h-5 group-hover:opacity-60'
          }`}
        />
        <button
          type="button"
          onClick={onSelectHome}
          title="Home & Direct Messages"
          aria-label="Home and Direct Messages"
          className={`relative flex h-12 w-12 items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            activeView === 'home'
              ? 'rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'rounded-[24px] bg-white dark:bg-[#1D2029] text-slate-700 dark:text-slate-200 hover:rounded-2xl hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]'
          }`}
        >
          <MessageSquare className="h-5 w-5" />
          {pendingRequestCount > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[11px] font-semibold text-white tabular-nums ring-2 ring-[#E8EAEF] dark:ring-[#111318]">
              {pendingRequestCount}
            </span>
          )}
        </button>
      </div>

      <div className="h-px w-8 bg-slate-300 dark:bg-white/10" aria-hidden="true" />

      {/* Top-level servers */}
      {topLevelServers.map((server) => (
        <ServerIconButton
          key={server.id}
          server={server}
          active={activeView === 'server' && activeServerId === server.id}
          hasUnread={serverHasUnread(server)}
          onClick={() => onSelectServer(server.id)}
          onDragStart={() => setDraggedId(server.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDropOnServer(server.id)}
        />
      ))}

      {/* Server folders */}
      {folders.map((folder) => {
        const folderServers = folder.serverIds
          .map((id) => servers.find((s) => s.id === id))
          .filter((s): s is Server => Boolean(s));
        if (folderServers.length === 0) return null;

        return (
          <div
            key={folder.id}
            className="flex flex-col items-center gap-2 rounded-2xl bg-slate-300/60 dark:bg-white/[0.04] py-1.5 w-[56px]"
          >
            <button
              type="button"
              onClick={() => onToggleFolder(folder.id)}
              title={`${folder.name} (${folderServers.length} servers)`}
              aria-label={`Toggle ${folder.name} folder`}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
            >
              {folder.collapsed ? <Folder className="h-5 w-5" /> : <FolderOpen className="h-5 w-5" />}
            </button>
            {!folder.collapsed &&
              folderServers.map((srv) => (
                <ServerIconButton
                  key={srv.id}
                  server={srv}
                  active={activeView === 'server' && activeServerId === srv.id}
                  hasUnread={serverHasUnread(srv)}
                  onClick={() => onSelectServer(srv.id)}
                  onDragStart={() => setDraggedId(srv.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOnServer(srv.id)}
                />
              ))}
          </div>
        );
      })}

      <div className="h-px w-8 bg-slate-300 dark:bg-white/10" aria-hidden="true" />

      {/* Create Server */}
      <button
        type="button"
        onClick={onOpenCreateServer}
        title="Add or Join a Server"
        aria-label="Add or Join a Server"
        className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-white dark:bg-[#1D2029] text-emerald-600 dark:text-emerald-400 hover:rounded-2xl hover:bg-emerald-600 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* Server Discovery */}
      <button
        type="button"
        onClick={onSelectDiscovery}
        title="Explore Public Communities"
        aria-label="Explore Public Communities"
        className={`flex h-12 w-12 items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          activeView === 'discovery'
            ? 'rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)]'
            : 'rounded-[24px] bg-white dark:bg-[#1D2029] text-slate-700 dark:text-slate-300 hover:rounded-2xl hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]'
        }`}
      >
        <Compass className="h-5 w-5" />
      </button>

      {/* Feature Ball Hub (Orbs Quests, Shop, Profile Studio, Ranks & Boosts) */}
      <div className="relative flex w-full items-center justify-center group">
        <span
          aria-hidden="true"
          className={`absolute left-0 w-1 rounded-r-full bg-indigo-400 transition-all duration-150 ${
            activeView === 'featureballs' ? 'h-9 opacity-100' : 'h-0 opacity-0 group-hover:h-5 group-hover:opacity-60'
          }`}
        />
        <button
          type="button"
          onClick={onSelectFeatureBalls}
          title={`Feature Balls & Orbs Shop (${featureBallBalance} FB)`}
          aria-label={`Feature Balls and Orbs Shop (${featureBallBalance} Feature Balls)`}
          className={`relative flex h-12 w-12 items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
            activeView === 'featureballs'
              ? 'rounded-2xl bg-indigo-600/25 ring-2 ring-indigo-400 shadow-lg shadow-indigo-500/20'
              : 'rounded-[24px] bg-white dark:bg-[#1D2029] hover:rounded-2xl hover:bg-indigo-500/20'
          }`}
        >
          <OrbIcon className="h-6 w-6" />
          <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums ring-2 ring-[#E8EAEF] dark:ring-[#111318]">
            {featureBallBalance > 999 ? '999+' : featureBallBalance}
          </span>
        </button>
      </div>
    </nav>
  );
}
