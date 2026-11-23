import { useState } from 'react';
import type { PresenceStatus, User } from '../shared/types';

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  invisible: 'Invisible',
  offline: 'Offline',
};

export const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500',
  idle: 'bg-amber-500',
  dnd: 'bg-rose-500',
  invisible: 'bg-slate-400',
  offline: 'bg-slate-400 dark:bg-slate-500',
};

export function Avatar({
  user,
  size = 'md',
  showPresence = false,
}: {
  user?: Pick<User, 'displayName' | 'avatarUrl' | 'avatarColor' | 'status'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showPresence?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const sizeClass =
    size === 'xs'
      ? 'h-6 w-6 text-[11px]'
      : size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
      ? 'h-12 w-12 text-base'
      : size === 'xl'
      ? 'h-16 w-16 text-xl'
      : 'h-9 w-9 text-sm';

  const dotSize =
    size === 'xs' || size === 'sm'
      ? 'h-2.5 w-2.5 border-[2px]'
      : size === 'xl'
      ? 'h-4 w-4 border-[3px]'
      : 'h-3 w-3 border-[2px]';

  const initials = (user?.displayName || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const status = user?.status || 'offline';

  return (
    <div className="relative inline-flex shrink-0">
      {user?.avatarUrl && !imgFailed ? (
        <img
          src={user.avatarUrl}
          alt={user.displayName}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${sizeClass} rounded-full object-cover bg-slate-200 dark:bg-slate-800`}
        />
      ) : (
        <div
          style={{ backgroundColor: user?.avatarColor || '#475569' }}
          className={`${sizeClass} flex items-center justify-center rounded-full font-display font-semibold text-white select-none`}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}
      {showPresence && (
        <span
          title={PRESENCE_LABEL[status]}
          aria-label={`Status: ${PRESENCE_LABEL[status]}`}
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-[#F3F4F6] dark:border-[#171A21] ${dotSize} ${PRESENCE_COLOR[status]}`}
        />
      )}
    </div>
  );
}
