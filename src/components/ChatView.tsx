import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BellOff,
  Check,
  CornerUpLeft,
  Edit3,
  Forward,
  Inbox,
  Menu,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Pin,
  Play,
  Search,
  Send,
  Smile,
  Square,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  Channel,
  DirectMessageThread,
  InboxItem,
  Message,
  MessageAttachment,
  PollData,
  Server,
  Thread,
  User,
  VoiceClip,
} from '../shared/types';
import { Avatar } from './Avatar';
import { ChannelIcon } from './ChannelSidebar';
import { MarkdownRenderer } from './MarkdownRenderer';
import { playSoundboardEffect, speakMessageTTS } from '../lib/audio';

const QUICK_EMOJIS = ['👍', '🔥', '🚀', '✅', '👀', '❤️', '🎉', '💡', '🎧', '👏', '😄', '🛠️'];

const SLASH_COMMANDS = [
  { cmd: '/poll', desc: 'Create an interactive poll (Question | Option A | Option B)' },
  { cmd: '/roll', desc: 'Roll polyhedral dice (e.g. /roll 2d6)' },
  { cmd: '/coinflip', desc: 'Flip a fair coin' },
  { cmd: '/remind', desc: 'Post a formatted reminder card' },
  { cmd: '/serverinfo', desc: 'Display current server statistics' },
  { cmd: '/help', desc: 'List available slash commands' },
];

interface ChatViewProps {
  server: Server | null;
  channel: Channel | null;
  dm: DirectMessageThread | null;
  messages: Message[];
  threads: Thread[];
  users: Record<string, User>;
  currentUser: User;
  typingUserIds: string[];
  isMuted: boolean;
  showMemberList: boolean;
  inbox: InboxItem[];
  onToggleMute: () => void;
  onToggleMemberList: () => void;
  onOpenMobileMenu: () => void;
  onOpenQuickSwitcher: () => void;
  onMarkInboxRead: () => void;
  onSelectChannel: (serverId: string | null, channelId: string) => void;
  onSelectUserCard: (userId: string) => void;
  onSendMessage: (payload: {
    content: string;
    replyToId?: string;
    silent?: boolean;
    attachments?: MessageAttachment[];
    poll?: PollData;
    voiceClip?: VoiceClip;
  }) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onTogglePin: (messageId: string) => Promise<void>;
  onVotePoll: (messageId: string, optionId: string) => Promise<void>;
  onOpenThread: (threadId: string) => void;
  onStartThreadFromMessage: (message: Message) => Promise<void>;
  onForwardMessage: (message: Message, targetChannelId: string) => Promise<void>;
  onTypingChange: (isTyping: boolean) => void;
}

function VoiceClipPlayer({ clip }: { clip: VoiceClip }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  const togglePlay = () => {
    if (playing) {
      audioRef.current?.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setPlaying(false);
      return;
    }

    setPlaying(true);
    setProgress(0);
    if (clip.audioDataUrl) {
      const audio = new Audio(clip.audioDataUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPlaying(false);
        setProgress(1);
      };
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.play().catch(() => setPlaying(false));
    } else {
      // Seeded demo voice clip playback progress + soft start chime
      playSoundboardEffect('pop', 0.12);
      const totalSteps = Math.max(10, clip.durationSec * 4);
      let step = 0;
      timerRef.current = setInterval(() => {
        step += 1;
        setProgress(step / totalSteps);
        if (step >= totalSteps) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPlaying(false);
        }
      }, 250);
    }
  };

  return (
    <div className="mt-2 inline-flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-3 py-2 max-w-sm">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors"
      >
        {playing ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
      </button>
      <div className="flex items-end gap-1 h-7">
        {clip.waveform.map((val, idx) => {
          const filled = idx / clip.waveform.length <= progress;
          return (
            <span
              key={idx}
              className={`w-1 rounded-full transition-colors ${
                filled ? 'bg-[var(--accent)]' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              style={{ height: `${Math.max(22, Math.round(val * 100))}%` }}
            />
          );
        })}
      </div>
      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
        0:{String(clip.durationSec).padStart(2, '0')}
      </span>
    </div>
  );
}

export function ChatView({
  server,
  channel,
  dm,
  messages,
  threads,
  users,
  currentUser,
  typingUserIds,
  isMuted,
  showMemberList,
  inbox,
  onToggleMute,
  onToggleMemberList,
  onOpenMobileMenu,
  onOpenQuickSwitcher,
  onMarkInboxRead,
  onSelectChannel,
  onSelectUserCard,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTogglePin,
  onVotePoll,
  onOpenThread,
  onStartThreadFromMessage,
  onForwardMessage,
  onTypingChange,
}: ChatViewProps) {
  const [draft, setDraft] = useState('');
  const [silentMode, setSilentMode] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [showThreadsList, setShowThreadsList] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  // Poll Builder
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Attachments
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Voice Note Recording
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Composer feedback & scroll
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channelId = channel?.id || dm?.id || '';
  const density = currentUser.settings.density;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: currentUser.settings.reducedMotion ? 'auto' : 'smooth' });
  }, [channelId, messages.length, currentUser.settings.reducedMotion]);

  const title = useMemo(() => {
    if (channel) return channel.name;
    if (dm) {
      if (dm.isGroup) return dm.name || 'Group Direct Message';
      const otherId = dm.participantIds.find((id) => id !== currentUser.id);
      return (otherId && users[otherId]?.displayName) || 'Direct Message';
    }
    return 'Conversation';
  }, [channel, dm, currentUser.id, users]);

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);
  const channelThreads = useMemo(
    () => (channel ? threads.filter((t) => t.channelId === channel.id) : []),
    [threads, channel]
  );

  // Search filter parsing: supports from:username, has:poll, has:file, pinned
  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    const tokens = q.split(/\s+/);
    return messages.filter((m) => {
      const author = users[m.authorId];
      for (const tok of tokens) {
        if (tok.startsWith('from:')) {
          const who = tok.slice(5);
          if (
            !author?.username.toLowerCase().includes(who) &&
            !author?.displayName.toLowerCase().includes(who)
          ) {
            return false;
          }
        } else if (tok === 'has:poll') {
          if (!m.poll) return false;
        } else if (tok === 'has:file' || tok === 'has:image') {
          if (m.attachments.length === 0) return false;
        } else if (tok === 'pinned' || tok === 'is:pinned') {
          if (!m.pinned) return false;
        } else {
          if (!m.content.toLowerCase().includes(tok) && !(m.poll?.question.toLowerCase().includes(tok))) {
            return false;
          }
        }
      }
      return true;
    });
  }, [messages, searchQuery, users]);

  const slashMatches = useMemo(() => {
    if (!draft.startsWith('/')) return [];
    const firstWord = draft.split(/\s+/)[0].toLowerCase();
    if (draft.includes(' ')) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(firstWord));
  }, [draft]);

  const unreadInboxCount = inbox.filter((i) => !i.read).length;

  const handleDraftChange = (value: string) => {
    setDraft(value);
    setComposerError(null);
    onTypingChange(Boolean(value.trim()));
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => onTypingChange(false), 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    for (const file of files) {
      if (file.size > 2_500_000) {
        setComposerError('Attachment exceeds the 2.5 MB preview upload limit.');
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result.startsWith('data:image/') && !result.startsWith('data:text/') && !result.startsWith('data:application/pdf')) {
          setComposerError('Only images, text, and PDF attachments are supported.');
          return;
        }
        setPendingAttachments((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            url: result,
            altText: '',
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sending) return;
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;

    setSending(true);
    setComposerError(null);
    try {
      await onSendMessage({
        content: text,
        replyToId: replyTo?.id,
        silent: silentMode,
        attachments: pendingAttachments,
      });
      setDraft('');
      setReplyTo(null);
      setSilentMode(false);
      setPendingAttachments([]);
      onTypingChange(false);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || cleanOpts.length < 2) {
      setComposerError('Enter a poll question and at least 2 options.');
      return;
    }
    setSending(true);
    try {
      await onSendMessage({
        content: '',
        poll: {
          question: pollQuestion.trim(),
          options: cleanOpts.map((text, i) => ({ id: `opt-${i + 1}`, text, voterIds: [] })),
          expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
          allowMultiple: false,
        },
      });
      setShowPollBuilder(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Failed to create poll.');
    } finally {
      setSending(false);
    }
  };

  const startVoiceRecording = async () => {
    setComposerError(null);
    setRecordSeconds(0);
    setRecordingVoice(true);
    recordTimerRef.current = setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      // Allow recording fallback even when browser mic isn't available in sandbox
      mediaRecorderRef.current = null;
    }
  };

  const stopAndSendVoiceRecording = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const duration = Math.max(1, recordSeconds);
    setRecordingVoice(false);

    const waveform = Array.from({ length: 18 }, (_, i) =>
      Number((0.25 + Math.abs(Math.sin(i * 0.7 + duration)) * 0.65).toFixed(2))
    );

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          onSendMessage({
            content: '',
            voiceClip: {
              durationSec: duration,
              waveform,
              audioDataUrl: typeof reader.result === 'string' ? reader.result : undefined,
            },
          }).catch(() => {});
        };
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    } else {
      await onSendMessage({
        content: '',
        voiceClip: { durationSec: duration, waveform },
      });
    }
  };

  const cancelVoiceRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingVoice(false);
    setRecordSeconds(0);
  };

  const serverEmojis = server?.customEmojis || [];

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-white dark:bg-[#1D2029]">
      {/* Channel Top Header */}
      <header className="relative flex h-13 shrink-0 items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.07] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="md:hidden rounded-lg p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8"
          >
            <Menu className="h-5 w-5" />
          </button>

          {channel ? (
            <ChannelIcon type={channel.type} className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500" />
          ) : (
            <Users className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500" />
          )}

          <h1 className="font-display text-[15px] font-bold text-slate-950 dark:text-white truncate">{title}</h1>

          {channel?.topic && (
            <>
              <span className="hidden lg:inline text-slate-300 dark:text-white/15" aria-hidden="true">
                |
              </span>
              <p className="hidden lg:block truncate text-xs text-slate-500 dark:text-slate-400 max-w-md">
                {channel.topic}
              </p>
            </>
          )}
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {channel && (
            <button
              type="button"
              onClick={() => {
                setShowThreadsList((v) => !v);
                setShowPins(false);
                setShowInbox(false);
              }}
              title="Channel Threads"
              aria-label="Channel Threads"
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors ${
                showThreadsList
                  ? 'bg-slate-200 dark:bg-white/12 text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquarePlus className="h-4 w-4" />
              {channelThreads.length > 0 && <span className="font-mono tabular-nums">{channelThreads.length}</span>}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? 'Unmute Channel Notifications' : 'Mute Channel Notifications'}
            aria-label={isMuted ? 'Unmute channel' : 'Mute channel'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              isMuted
                ? 'text-rose-500 bg-rose-500/10'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowPins((v) => !v);
              setShowThreadsList(false);
              setShowInbox(false);
            }}
            title="Pinned Messages"
            aria-label="Pinned Messages"
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              showPins
                ? 'bg-slate-200 dark:bg-white/12 text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Pin className="h-4 w-4" />
            {pinnedMessages.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                {pinnedMessages.length}
              </span>
            )}
          </button>

          {server && (
            <button
              type="button"
              onClick={onToggleMemberList}
              title={showMemberList ? 'Hide Member List' : 'Show Member List'}
              aria-label="Toggle Member List"
              className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                showMemberList
                  ? 'bg-slate-200 dark:bg-white/12 text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
            </button>
          )}

          {/* Message Search */}
          <div className="relative hidden sm:block ml-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search (from:, has:poll, pinned)"
              aria-label="Search messages in channel"
              className="h-8 w-44 lg:w-56 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#14171F] pl-8 pr-7 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowInbox((v) => !v);
              setShowPins(false);
              setShowThreadsList(false);
              if (unreadInboxCount > 0) onMarkInboxRead();
            }}
            title="Inbox (Mentions, Replies & Events)"
            aria-label="Inbox"
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              showInbox
                ? 'bg-slate-200 dark:bg-white/12 text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Inbox className="h-4 w-4" />
            {unreadInboxCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenQuickSwitcher}
            title="Quick Switcher (Ctrl/Cmd + K)"
            className="hidden md:inline-flex h-8 items-center rounded-lg border border-slate-200 dark:border-white/10 px-2 font-mono text-[11px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6"
          >
            ⌘K
          </button>
        </div>

        {/* Pinned Messages Popover */}
        {showPins && (
          <div className="absolute right-4 top-13 z-40 w-96 max-w-[92vw] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/8">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Pinned Messages ({pinnedMessages.length})
              </h3>
              <button type="button" onClick={() => setShowPins(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto space-y-3">
              {pinnedMessages.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No pinned messages in this channel yet.
                </p>
              ) : (
                pinnedMessages.map((pm) => {
                  const author = users[pm.authorId];
                  return (
                    <div key={pm.id} className="rounded-lg border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#1A1E28] p-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">{author?.displayName}</span>
                        <button
                          type="button"
                          onClick={() => onTogglePin(pm.id)}
                          className="text-slate-500 hover:text-rose-500"
                        >
                          Unpin
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{pm.content}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Channel Threads Popover */}
        {showThreadsList && (
          <div className="absolute right-4 top-13 z-40 w-96 max-w-[92vw] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/8">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Threads in #{channel?.name}
              </h3>
              <button type="button" onClick={() => setShowThreadsList(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
              {channelThreads.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Hover any message and click Thread to start a focused discussion.
                </p>
              ) : (
                channelThreads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setShowThreadsList(false);
                      onOpenThread(t.id);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#1A1E28] p-3 text-left hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.archived ? 'Archived' : 'Active'} · {t.followerIds.length} following
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Inbox Popover */}
        {showInbox && (
          <div className="absolute right-4 top-13 z-40 w-96 max-w-[92vw] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/8">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">Inbox</h3>
              <button type="button" onClick={() => setShowInbox(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
              {inbox.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">All caught up.</p>
              ) : (
                inbox.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowInbox(false);
                      if (item.channelId) onSelectChannel(item.serverId || null, item.channelId);
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#1A1E28] p-3 text-left hover:border-[var(--accent)] transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{item.title}</span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{item.preview}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </header>

      {/* Search Active Banner */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-[#171A21] px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
          <span>
            Showing <strong className="font-mono tabular-nums">{visibleMessages.length}</strong> matching messages for “{searchQuery}”
          </span>
          <button type="button" onClick={() => setSearchQuery('')} className="text-[var(--accent)] hover:underline">
            Clear filter
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
        {/* Welcome Channel Header */}
        {!searchQuery && (
          <div className="mb-6 border-b border-slate-200 dark:border-white/[0.07] pb-5">
            <h2 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
              {channel ? `Welcome to #${channel.name}` : title}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {channel?.topic || 'This is the beginning of your conversation history.'}
              {channel && channel.slowmodeSeconds > 0 && ` · Slowmode ${channel.slowmodeSeconds}s`}
            </p>
          </div>
        )}

        {visibleMessages.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No messages match your view yet. Start the conversation below or type <code className="font-mono">/help</code>.
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const author = users[msg.authorId];
            const prev = idx > 0 ? visibleMessages[idx - 1] : null;
            const isGrouped =
              Boolean(prev) &&
              prev!.authorId === msg.authorId &&
              !msg.replyToId &&
              !msg.forwardedFrom &&
              new Date(msg.createdAt).getTime() - new Date(prev!.createdAt).getTime() < 5 * 60_000;

            const repliedMsg = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) : undefined;
            const attachedThread = threads.find((t) => t.parentMessageId === msg.id);
            const authorMember = server?.members.find((m) => m.userId === msg.authorId);
            const topRole = server?.roles
              .filter((r) => authorMember?.roleIds.includes(r.id))
              .sort((a, b) => b.position - a.position)[0];
            const canEdit = msg.authorId === currentUser.id;
            const canDelete =
              canEdit ||
              (server
                ? server.ownerId === currentUser.id ||
                  server.members
                    .find((m) => m.userId === currentUser.id)
                    ?.roleIds.some((rid) => server.roles.find((r) => r.id === rid)?.permissions.includes('MANAGE_MESSAGES'))
                : false);

            return (
              <article
                key={msg.id}
                className={`group relative rounded-lg px-2.5 transition-colors hover:bg-slate-100/70 dark:hover:bg-white/[0.03] ${
                  isGrouped ? (density === 'compact' ? 'py-0.5' : 'py-1') : density === 'compact' ? 'pt-2 pb-1' : 'pt-3 pb-1.5'
                }`}
              >
                {/* Reply Context Preview */}
                {repliedMsg && (
                  <div className="mb-1 ml-11 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <CornerUpLeft className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {users[repliedMsg.authorId]?.displayName || 'Member'}
                    </span>
                    <span className="truncate max-w-md">{repliedMsg.content || '[Attachment / Media]'}</span>
                  </div>
                )}

                {/* Forwarded Context */}
                {msg.forwardedFrom && (
                  <div className="mb-1 ml-11 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Forward className="h-3.5 w-3.5" />
                    <span>
                      Forwarded from #{msg.forwardedFrom.channelName} · Originally by {msg.forwardedFrom.authorName}
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {isGrouped ? (
                    <span className="w-9 shrink-0 pt-0.5 text-right font-mono text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 tabular-nums select-none">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectUserCard(msg.authorId)}
                      className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      <Avatar user={author} size="md" />
                    </button>
                  )}

                  <div className="min-w-0 flex-1">
                    {!isGrouped && (
                      <div className="flex flex-wrap items-baseline gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectUserCard(msg.authorId)}
                          className="font-display text-[15px] font-semibold hover:underline"
                          style={{ color: topRole && topRole.name !== '@everyone' ? topRole.color : undefined }}
                        >
                          {authorMember?.nickname || author?.displayName || 'Unknown'}
                        </button>
                        {author?.isBot && (
                          <span className="text-xs font-medium text-[var(--accent)]">App</span>
                        )}
                        <span className="font-mono text-xs text-slate-400 tabular-nums">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.editedAt && <span className="text-xs text-slate-400">(edited)</span>}
                        {msg.silent && <span className="text-xs text-slate-400">· Silent</span>}
                        {msg.pinned && <span className="text-xs text-amber-600 dark:text-amber-400">· Pinned</span>}
                      </div>
                    )}

                    {/* Message Body or Inline Editor */}
                    {editingId === msg.id ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!editDraft.trim()) return;
                          await onEditMessage(msg.id, editDraft.trim());
                          setEditingId(null);
                        }}
                        className="mt-1 space-y-1.5"
                      >
                        <input
                          type="text"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          autoFocus
                          className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#14171F] px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        />
                        <div className="flex items-center gap-2 text-xs">
                          <button type="submit" className="font-medium text-[var(--accent)] hover:underline">
                            Save changes
                          </button>
                          <span className="text-slate-400">·</span>
                          <button type="button" onClick={() => setEditingId(null)} className="text-slate-500 hover:underline">
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}

                    {/* Rich Embed Card */}
                    {msg.embed && (
                      <div className="mt-2 max-w-lg rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-2.5">
                        <h4 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                          {msg.embed.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{msg.embed.description}</p>
                        {msg.embed.fields && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {msg.embed.fields.map((f, fIdx) => (
                              <div key={fIdx}>
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{f.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{f.value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.embed.footer && (
                          <p className="pt-1 text-xs text-slate-400">{msg.embed.footer}</p>
                        )}
                      </div>
                    )}

                    {/* Interactive Poll */}
                    {msg.poll && (
                      <div className="mt-2 max-w-md rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                            {msg.poll.question}
                          </h4>
                          <BarChart3 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        </div>
                        <div className="space-y-2">
                          {(() => {
                            const totalVotes = msg.poll!.options.reduce((sum, o) => sum + o.voterIds.length, 0);
                            return msg.poll!.options.map((opt) => {
                              const voted = opt.voterIds.includes(currentUser.id);
                              const pct = totalVotes > 0 ? Math.round((opt.voterIds.length / totalVotes) * 100) : 0;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => onVotePoll(msg.id, opt.id)}
                                  className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                    voted
                                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] hover:border-slate-300 dark:hover:border-white/20'
                                  }`}
                                >
                                  <div
                                    className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--accent)]/15 transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                  <div className="relative flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                                      {voted && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
                                      {opt.text}
                                    </span>
                                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                      {pct}% ({opt.voterIds.length})
                                    </span>
                                  </div>
                                </button>
                              );
                            });
                          })()}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {msg.poll.options.reduce((sum, o) => sum + o.voterIds.length, 0)} votes · Click an option to vote
                        </p>
                      </div>
                    )}

                    {/* Voice Message Clip */}
                    {msg.voiceClip && <VoiceClipPlayer clip={msg.voiceClip} />}

                    {/* Attachments */}
                    {msg.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-3">
                        {msg.attachments.map((att) =>
                          att.mimeType.startsWith('image/') ? (
                            <figure key={att.id} className="max-w-xs overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                              <img
                                src={att.url}
                                alt={att.altText || att.name}
                                referrerPolicy="no-referrer"
                                className="max-h-60 w-auto object-cover"
                              />
                              {att.altText && (
                                <figcaption className="bg-slate-50 dark:bg-[#171A21] px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400">
                                  Alt: {att.altText}
                                </figcaption>
                              )}
                            </figure>
                          ) : (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                            >
                              <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-medium">{att.name}</span>
                              <span className="font-mono text-slate-400 tabular-nums">
                                ({Math.max(1, Math.round(att.sizeBytes / 1024))} KB)
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Attached Thread Callout */}
                    {attachedThread && (
                      <button
                        type="button"
                        onClick={() => onOpenThread(attachedThread.id)}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        <span>{attachedThread.title}</span>
                        <span className="text-slate-400">· Open thread</span>
                      </button>
                    )}

                    {/* Reactions */}
                    {msg.reactions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {msg.reactions.map((r) => {
                          const reacted = r.userIds.includes(currentUser.id);
                          return (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => onToggleReaction(msg.id, r.emoji)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs transition-colors ${
                                reacted
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                                  : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span className="font-mono tabular-nums">{r.userIds.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Hover Message Action Bar */}
                <div className="absolute -top-3 right-3 z-20 hidden group-hover:flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-[#232733] p-0.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setReactingMessageId(reactingMessageId === msg.id ? null : msg.id)}
                    title="Add Reaction"
                    aria-label="Add Reaction"
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Smile className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyTo(msg)}
                    title="Reply"
                    aria-label="Reply"
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <CornerUpLeft className="h-3.5 w-3.5" />
                  </button>
                  {channel && !attachedThread && (
                    <button
                      type="button"
                      onClick={() => onStartThreadFromMessage(msg)}
                      title="Create Thread"
                      aria-label="Create Thread"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onTogglePin(msg.id)}
                    title={msg.pinned ? 'Unpin' : 'Pin Message'}
                    aria-label={msg.pinned ? 'Unpin' : 'Pin Message'}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                  {server && (
                    <button
                      type="button"
                      onClick={() => setForwardingMessage(msg)}
                      title="Forward Message"
                      aria-label="Forward Message"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    >
                      <Forward className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => speakMessageTTS(author?.displayName || 'Member', msg.content)}
                    title="Read Aloud (TTS)"
                    aria-label="Read message aloud"
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(msg.id);
                        setEditDraft(msg.content);
                      }}
                      title="Edit"
                      aria-label="Edit message"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDeleteMessage(msg.id)}
                      title="Delete"
                      aria-label="Delete message"
                      className="rounded p-1.5 text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Reaction Picker */}
                {reactingMessageId === msg.id && (
                  <div className="absolute right-3 top-6 z-30 flex flex-wrap gap-1 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#232733] p-2 shadow-xl max-w-xs">
                    {[...serverEmojis.map((e) => e.symbol), ...QUICK_EMOJIS]
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onToggleReaction(msg.id, emoji);
                            setReactingMessageId(null);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          {emoji}
                        </button>
                      ))}
                  </div>
                )}
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Forward Message Inline Bar */}
      {forwardingMessage && server && (
        <div className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#232733] px-4 py-2.5 text-xs">
          <span className="text-slate-700 dark:text-slate-200">
            Forward message to another channel:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {server.channels
              .filter((c) => (c.type === 'text' || c.type === 'announcement') && c.id !== channel?.id)
              .map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={async () => {
                    await onForwardMessage(forwardingMessage, target.id);
                    setForwardingMessage(null);
                  }}
                  className="rounded-md bg-[var(--accent)] px-2.5 py-1 font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                >
                  #{target.name}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setForwardingMessage(null)}
              className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Composer Area */}
      <div className="shrink-0 px-4 pb-4 pt-1 relative">
        {/* Slash Command Autocomplete */}
        {slashMatches.length > 0 && (
          <div className="mb-2 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#232733] p-1.5 shadow-xl">
            <p className="px-2.5 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Slash Commands · Relay Utility
            </p>
            {slashMatches.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => setDraft(`${item.cmd} `)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-white/6"
              >
                <span className="font-mono font-semibold text-[var(--accent)]">{item.cmd}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate ml-4">{item.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Poll Builder Popover */}
        {showPollBuilder && (
          <form
            onSubmit={handleCreatePoll}
            className="mb-2 rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#232733] p-4 space-y-3 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">Create Live Poll</h4>
              <button type="button" onClick={() => setShowPollBuilder(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask the community a question..."
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171A21] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <div className="space-y-2">
              {pollOptions.map((opt, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[idx] = e.target.value;
                    setPollOptions(next);
                  }}
                  placeholder={`Choice ${idx + 1}`}
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171A21] px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              {pollOptions.length < 5 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  + Add Choice
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={sending}
                className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
              >
                Post Poll
              </button>
            </div>
          </form>
        )}

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="mb-2 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#232733] p-3 shadow-xl space-y-2">
            {serverEmojis.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Server Custom Emoji</p>
                <div className="flex flex-wrap gap-1">
                  {serverEmojis.map((ce) => (
                    <button
                      key={ce.id}
                      type="button"
                      onClick={() => {
                        setDraft((d) => `${d}${ce.symbol} `);
                        setShowEmojiPicker(false);
                      }}
                      title={`:${ce.name}:`}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      <span>{ce.symbol}</span>
                      <span className="font-mono text-[11px] text-slate-500">:{ce.name}:</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Standard Emoji</p>
              <div className="flex flex-wrap gap-1">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setDraft((d) => `${d}${em}`);
                      setShowEmojiPicker(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Composer Error / AutoMod Block */}
        {composerError && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <span>{composerError}</span>
            <button type="button" onClick={() => setComposerError(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Reply Indicator */}
        {replyTo && (
          <div className="mb-1.5 flex items-center justify-between rounded-t-lg border border-b-0 border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#171A21] px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="truncate">
              Replying to <strong>{users[replyTo.authorId]?.displayName || 'Member'}</strong>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pending Attachments Preview with Alt Text */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171A21] p-2.5">
            {pendingAttachments.map((att, i) => (
              <div key={att.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] p-2">
                {att.mimeType.startsWith('image/') && (
                  <img src={att.url} alt={att.name} className="h-10 w-10 rounded object-cover" />
                )}
                <div className="space-y-1">
                  <p className="max-w-[140px] truncate text-xs font-medium text-slate-800 dark:text-slate-200">{att.name}</p>
                  {att.mimeType.startsWith('image/') && (
                    <input
                      type="text"
                      value={att.altText || ''}
                      onChange={(e) => {
                        const next = [...pendingAttachments];
                        next[i] = { ...att, altText: e.target.value };
                        setPendingAttachments(next);
                      }}
                      placeholder="Add alt text..."
                      className="w-36 rounded border border-slate-200 dark:border-white/10 bg-transparent px-1.5 py-0.5 text-[11px] text-slate-700 dark:text-slate-300"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  className="text-slate-400 hover:text-rose-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Active Voice Recorder Bar OR Standard Text Composer */}
        {recordingVoice ? (
          <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5">
            <div className="flex items-center gap-3 text-sm font-medium text-rose-700 dark:text-rose-300">
              <Mic className="h-4 w-4" />
              <span>Recording voice message</span>
              <span className="font-mono tabular-nums">0:{String(recordSeconds).padStart(2, '0')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopAndSendVoiceRecording}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
              >
                Send Voice Note
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSend}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#14171F] px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[var(--accent)]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.md,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach Image or File"
              aria-label="Attach file"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <input
              type="text"
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              placeholder={`Message ${channel ? `#${channel.name}` : title} (try /poll, /roll, or markdown)`}
              className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => setSilentMode((s) => !s)}
              title={silentMode ? 'Silent message enabled (no notification)' : 'Send silently (no notification)'}
              aria-label="Toggle silent message"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                silentMode
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <VolumeX className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPollBuilder((v) => !v);
                setShowEmojiPicker(false);
              }}
              title="Create Poll"
              aria-label="Create Poll"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                showPollBuilder
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={startVoiceRecording}
              title="Record Voice Message"
              aria-label="Record Voice Message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Mic className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker((v) => !v);
                setShowPollBuilder(false);
              }}
              title="Emoji & Server Custom Emoji"
              aria-label="Insert emoji"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Smile className="h-4 w-4" />
            </button>

            <button
              type="submit"
              disabled={sending || (!draft.trim() && pendingAttachments.length === 0)}
              aria-label="Send message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Live Typing Indicators */}
        <div className="mt-1 h-4 px-1 text-[11px] text-slate-500 dark:text-slate-400">
          {typingUserIds.length > 0 && (
            <span>
              <strong>
                {typingUserIds
                  .map((id) => users[id]?.displayName || 'Someone')
                  .slice(0, 3)
                  .join(', ')}
              </strong>{' '}
              {typingUserIds.length === 1 ? 'is' : 'are'} typing...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
