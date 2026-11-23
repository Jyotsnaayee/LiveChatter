import React, { useState } from 'react';
import { MessageSquare, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Channel, Message, Thread, User } from '../shared/types';
import { Avatar } from './Avatar';

interface ForumViewProps {
  channel: Channel;
  threads: Thread[];
  messages: Record<string, Message[]>;
  users: Record<string, User>;
  onOpenThread: (threadId: string) => void;
  onCreatePost: (payload: { title: string; content: string; tags: string[] }) => Promise<void>;
}

export function ForumView({ channel, threads, messages, users, onOpenThread, onCreatePost }: ForumViewProps) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'activity' | 'newest' | 'replies'>('activity');
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const availableTags = channel.availableTags || ['Discussion', 'Question', 'RFC'];

  const filtered = threads
    .filter((t) => t.channelId === channel.id)
    .filter((t) => {
      if (selectedTag !== 'all' && !(t.tags || []).includes(selectedTag)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return t.title.toLowerCase().includes(q) || (t.bodyPreview || '').toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'replies') return (messages[b.id]?.length || 0) - (messages[a.id]?.length || 0);
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    try {
      await onCreatePost({ title: newTitle.trim(), content: newBody.trim(), tags: newTags });
      setNewTitle('');
      setNewBody('');
      setNewTags([]);
      setComposerOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleNewTag = (tag: string) => {
    setNewTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white dark:bg-[#1D2029] px-6 py-5">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        {/* Guidelines Banner */}
        {channel.guidelines && (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#232733] p-4">
            <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">Post Guidelines</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{channel.guidelines}</p>
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search posts in #${channel.name}...`}
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-2.5 py-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <select
                aria-label="Sort forum posts"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'activity' | 'newest' | 'replies')}
                className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="activity">Recent Activity</option>
                <option value="newest">Newest First</option>
                <option value="replies">Most Replies</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>New Post</span>
            </button>
          </div>
        </div>

        {/* Interactive Tag Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedTag('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              selectedTag === 'all'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
            }`}
          >
            All Topics
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                selectedTag === tag
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* New Forum Post Composer */}
        {composerOpen && (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#232733] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Create Forum Post</h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close composer"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Post title (e.g., Proposal for keyboard shortcuts)"
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171A21] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <textarea
              required
              rows={4}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Write your opening post with full markdown support..."
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171A21] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {availableTags.map((tag) => {
                  const chosen = newTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleNewTag(tag)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        chosen
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-slate-200/70 dark:bg-white/8 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {submitting ? 'Publishing...' : 'Publish Post'}
              </button>
            </div>
          </form>
        )}

        {/* Thread Cards */}
        <div className="divide-y divide-slate-200 dark:divide-white/[0.07] rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#232733]/60 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="font-display text-base font-semibold text-slate-900 dark:text-white">No matching posts yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Start a focused thread for proposals, notes, or Q&A in #{channel.name}.
              </p>
            </div>
          ) : (
            filtered.map((thr) => {
              const author = users[thr.creatorId];
              const replyCount = messages[thr.id]?.length || 0;
              return (
                <button
                  key={thr.id}
                  type="button"
                  onClick={() => onOpenThread(thr.id)}
                  className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h4 className="font-display text-[15px] font-semibold text-slate-950 dark:text-white leading-snug">
                      {thr.title}
                    </h4>
                    {thr.bodyPreview && (
                      <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{thr.bodyPreview}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <Avatar user={author} size="xs" />
                        {author?.displayName || 'Member'}
                      </span>
                      {thr.tags && thr.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{thr.tags.join(' / ')}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {new Date(thr.lastActivityAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    <MessageSquare className="h-4 w-4" />
                    <span>{replyCount}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
