import React, { useEffect, useRef, useState } from 'react';
import {
  Hand,
  HeadphoneOff,
  Headphones,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Pencil,
  PhoneCall,
  PhoneOff,
  Sparkles,
  Trash2,
  UserCheck,
  UserMinus,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import type { Channel, Message, Server, User, VoiceParticipant, WhiteboardStroke } from '../shared/types';
import { Avatar } from './Avatar';
import { SOUNDBOARD_CLIPS } from '../lib/audio';
import { MarkdownRenderer } from './MarkdownRenderer';

interface VoiceStageViewProps {
  server: Server;
  channel: Channel;
  currentUser: User;
  users: Record<string, User>;
  participants: VoiceParticipant[];
  messages: Message[];
  whiteboardStrokes: WhiteboardStroke[];
  recentSoundEvent: { userName: string; label: string } | null;
  onJoinVoice: (channelId: string) => void;
  onLeaveVoice: () => void;
  onUpdateVoice: (patch: { muted?: boolean; deafened?: boolean; videoOn?: boolean; screenSharing?: boolean; speaking?: boolean }) => void;
  onRaiseHand: () => void;
  onSetStageRole: (targetUserId: string, stageRole: 'speaker' | 'audience') => void;
  onPlaySoundboard: (soundId: string, label: string) => void;
  onSendWhiteboardStroke: (stroke: WhiteboardStroke) => void;
  onClearWhiteboard: () => void;
  onSendChatMessage: (content: string) => Promise<void>;
}

export function VoiceStageView({
  server,
  channel,
  currentUser,
  users,
  participants,
  messages,
  whiteboardStrokes,
  recentSoundEvent,
  onJoinVoice,
  onLeaveVoice,
  onUpdateVoice,
  onRaiseHand,
  onSetStageRole,
  onPlaySoundboard,
  onSendWhiteboardStroke,
  onClearWhiteboard,
  onSendChatMessage,
}: VoiceStageViewProps) {
  const isStage = channel.type === 'stage';
  const roomParticipants = participants.filter((p) => p.channelId === channel.id);
  const myState = roomParticipants.find((p) => p.userId === currentUser.id);

  const [showSoundboard, setShowSoundboard] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showSideChat, setShowSideChat] = useState(true);
  const [chatDraft, setChatDraft] = useState('');
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Camera & Screen share streams
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Whiteboard canvas state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [brushColor, setBrushColor] = useState('#2563EB');

  const isModerator =
    server.ownerId === currentUser.id ||
    server.members
      .find((m) => m.userId === currentUser.id)
      ?.roleIds.some((rid) => server.roles.find((r) => r.id === rid)?.permissions.includes('MUTE_MEMBERS'));

  // Clean up media streams on unmount or leaving room
  useEffect(() => {
    if (!myState) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      screenStreamRef.current = null;
      micStreamRef.current = null;
      setAudioLevel(0);
    }
  }, [myState]);

  useEffect(() => {
    return () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Real microphone level meter when joined & unmuted (fails gracefully if mic denied)
  useEffect(() => {
    if (!myState || myState.muted) {
      setAudioLevel(0);
      return;
    }
    let cancelled = false;
    let rafId = 0;
    let audioCtx: AudioContext | null = null;

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new Ctx();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setAudioLevel(Math.min(100, Math.round(avg * 1.6)));
          rafId = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        // Microphone unavailable or permission denied in sandbox — keep room usable silently
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      audioCtx?.close().catch(() => {});
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    };
  }, [myState?.channelId, myState?.muted]);

  const handleToggleCamera = async () => {
    if (!myState) return;
    setMediaNotice(null);
    if (myState.videoOn) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      onUpdateVoice({ videoOn: false });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      onUpdateVoice({ videoOn: true });
      setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }, 60);
    } catch {
      setMediaNotice('Camera permission was not granted by the browser.');
    }
  };

  const handleToggleScreenShare = async () => {
    if (!myState) return;
    setMediaNotice(null);
    if (myState.screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      onUpdateVoice({ screenSharing: false });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => {
        screenStreamRef.current = null;
        onUpdateVoice({ screenSharing: false });
      };
      onUpdateVoice({ screenSharing: true });
      setTimeout(() => {
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
      }, 60);
    } catch {
      setMediaNotice('Screen share was cancelled or blocked by browser permissions.');
    }
  };

  // Re-render shared whiteboard strokes whenever strokes update
  useEffect(() => {
    if (!showWhiteboard) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of whiteboardStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [whiteboardStrokes, showWhiteboard]);

  const getCanvasPt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    currentPointsRef.current = [getCanvasPt(e)];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = getCanvasPt(e);
    const pts = currentPointsRef.current;
    const prev = pts[pts.length - 1];
    pts.push(pt);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && prev) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentPointsRef.current.length >= 2) {
      onSendWhiteboardStroke({
        id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        channelId: channel.id,
        userId: currentUser.id,
        color: brushColor,
        width: 3,
        points: currentPointsRef.current,
      });
    }
    currentPointsRef.current = [];
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    const text = chatDraft.trim();
    setChatDraft('');
    await onSendChatMessage(text);
  };

  const speakers = roomParticipants.filter((p) => p.stageRole === 'speaker');
  const audience = roomParticipants.filter((p) => p.stageRole !== 'speaker');

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-[#161920]">
      {/* Main Voice / Stage Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-y-auto p-6 space-y-5">
        {/* Top Stage / Room Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1D2029] p-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">{channel.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {channel.topic || (isStage ? 'Moderated community stage event.' : 'Low-latency Opus voice & screen share room.')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!myState ? (
              <button
                type="button"
                onClick={() => onJoinVoice(channel.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                <PhoneCall className="h-4 w-4" />
                <span>{isStage ? 'Join Audience' : 'Join Voice'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onLeaveVoice}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors whitespace-nowrap"
              >
                <PhoneOff className="h-4 w-4" />
                <span>Leave Room</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSideChat((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                showSideChat
                  ? 'bg-slate-200/80 dark:bg-white/10 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/6'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </button>
          </div>
        </div>

        {mediaNotice && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            {mediaNotice}
          </div>
        )}

        {recentSoundEvent && (
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#232733] px-4 py-2 text-xs text-slate-700 dark:text-slate-200">
            <span className="font-semibold">{recentSoundEvent.userName}</span> played{' '}
            <span className="font-medium text-[var(--accent)]">{recentSoundEvent.label}</span> on the Soundboard
          </div>
        )}

        {/* Active Screen Share Preview */}
        {myState?.screenSharing && (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-black">
            <div className="flex items-center justify-between bg-slate-900/90 px-4 py-2 text-xs text-slate-200">
              <span>You are sharing your screen · Live Preview</span>
              <button
                type="button"
                onClick={handleToggleScreenShare}
                className="rounded bg-rose-600 px-2.5 py-1 font-medium text-white hover:bg-rose-700"
              >
                Stop Sharing
              </button>
            </div>
            <video ref={screenVideoRef} autoPlay playsInline muted className="max-h-[340px] w-full object-contain" />
          </div>
        )}

        {/* Shared Activity: Real-Time Collaborative Whiteboard */}
        {showWhiteboard && (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/8 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[var(--accent)]" />
                <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Shared Whiteboard Activity
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">· Synced live across room</span>
              </div>
              <div className="flex items-center gap-2">
                {['#2563EB', '#10B981', '#F59E0B', '#E11D48', '#E2E8F0'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrushColor(c)}
                    aria-label={`Select color ${c}`}
                    className={`h-5 w-5 rounded-full border-2 ${
                      brushColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <button
                  type="button"
                  onClick={onClearWhiteboard}
                  className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-white/10 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/6"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
            <canvas
              ref={canvasRef}
              width={900}
              height={320}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="h-[260px] w-full cursor-crosshair bg-slate-50 dark:bg-[#14171F] touch-none"
            />
          </div>
        )}

        {/* Stage Layout vs Voice Grid */}
        {isStage ? (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-display text-sm font-semibold text-slate-700 dark:text-slate-300">
                Speakers on Stage · <span className="font-mono tabular-nums">{speakers.length}</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {speakers.map((p) => {
                  const u = users[p.userId];
                  if (!u) return null;
                  const isMe = p.userId === currentUser.id;
                  const activeRing = isMe && audioLevel > 14;
                  return (
                    <div
                      key={p.userId}
                      className={`flex flex-col items-center justify-center rounded-xl border bg-white dark:bg-[#1D2029] p-6 transition-colors ${
                        activeRing ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-200 dark:border-white/[0.08]'
                      }`}
                    >
                      <Avatar user={u} size="xl" />
                      <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {u.displayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {p.muted ? 'Muted' : 'Speaking'}
                      </p>
                      {isModerator && !isMe && (
                        <button
                          type="button"
                          onClick={() => onSetStageRole(p.userId, 'audience')}
                          className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-white/10 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/6"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          <span>Move to Audience</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-display text-sm font-semibold text-slate-700 dark:text-slate-300">
                Audience · <span className="font-mono tabular-nums">{audience.length}</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {audience.map((p) => {
                  const u = users[p.userId];
                  if (!u) return null;
                  return (
                    <div
                      key={p.userId}
                      className="flex flex-col items-center rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1D2029] p-4"
                    >
                      <Avatar user={u} size="md" />
                      <p className="mt-2 truncate max-w-full text-sm font-medium text-slate-900 dark:text-white">
                        {u.displayName}
                      </p>
                      {p.handRaised && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <Hand className="h-3.5 w-3.5" />
                          Hand Raised
                        </span>
                      )}
                      {isModerator && (
                        <button
                          type="button"
                          onClick={() => onSetStageRole(p.userId, 'speaker')}
                          className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition-colors"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Invite to Speak</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Standard Voice Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roomParticipants.length === 0 ? (
              <div className="col-span-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1D2029] p-10 text-center space-y-2">
                <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Nobody is in {channel.name} yet
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Click Join Voice to open live audio, share your screen, or launch the shared Whiteboard activity.
                </p>
              </div>
            ) : (
              roomParticipants.map((p) => {
                const u = users[p.userId];
                if (!u) return null;
                const isMe = p.userId === currentUser.id;
                const activeRing = isMe && audioLevel > 14;
                const vol = userVolumes[p.userId] ?? 100;
                return (
                  <div
                    key={p.userId}
                    className={`relative flex flex-col items-center justify-center rounded-xl border bg-white dark:bg-[#1D2029] p-6 min-h-[200px] transition-colors ${
                      activeRing ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-200 dark:border-white/[0.08]'
                    }`}
                  >
                    {isMe && p.videoOn ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-36 w-full rounded-lg object-cover bg-slate-900"
                      />
                    ) : (
                      <Avatar user={u} size="xl" />
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {u.displayName}
                      </span>
                      {p.muted && <MicOff className="h-3.5 w-3.5 text-rose-500" />}
                      {p.deafened && <HeadphoneOff className="h-3.5 w-3.5 text-rose-500" />}
                    </div>

                    {isMe && !p.muted && (
                      <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-75"
                          style={{ width: `${audioLevel}%` }}
                        />
                      </div>
                    )}

                    {!isMe && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Volume2 className="h-3.5 w-3.5" />
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={vol}
                          aria-label={`Volume for ${u.displayName}`}
                          onChange={(e) => setUserVolumes((prev) => ({ ...prev, [p.userId]: Number(e.target.value) }))}
                          className="w-24 accent-[var(--accent)]"
                        />
                        <span className="font-mono w-9 tabular-nums">{vol}%</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Soundboard Drawer */}
        {showSoundboard && myState && (
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D2029] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Server Soundboard · Free for all members
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">Plays live for everyone in room</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {SOUNDBOARD_CLIPS.map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => onPlaySoundboard(clip.id, clip.label)}
                  className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#232733] p-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <span className="text-lg">{clip.emoji}</span>
                  <span className="truncate">{clip.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Call Control Dock */}
        {myState && (
          <div className="mt-auto flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1D2029] p-3">
            <button
              type="button"
              onClick={() => onUpdateVoice({ muted: !myState.muted })}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                myState.muted
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
              }`}
            >
              {myState.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span>{myState.muted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateVoice({ deafened: !myState.deafened })}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                myState.deafened
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
              }`}
            >
              {myState.deafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
              <span>{myState.deafened ? 'Undeafen' : 'Deafen'}</span>
            </button>

            {isStage && myState.stageRole !== 'speaker' && (
              <button
                type="button"
                onClick={onRaiseHand}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  myState.handRaised
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
                }`}
              >
                <Hand className="h-4 w-4" />
                <span>{myState.handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
              </button>
            )}

            {!isStage && (
              <>
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    myState.videoOn
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
                  }`}
                >
                  {myState.videoOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  <span>Camera</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleScreenShare}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    myState.screenSharing
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
                  }`}
                >
                  {myState.screenSharing ? <Monitor className="h-4 w-4" /> : <MonitorOff className="h-4 w-4" />}
                  <span>Share Screen</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSoundboard((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    showSoundboard
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Soundboard</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowWhiteboard((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    showWhiteboard
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/14'
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                  <span>Whiteboard</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Side-by-side Voice Text Chat */}
      {showSideChat && (
        <div className="hidden lg:flex w-[320px] shrink-0 flex-col border-l border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1D2029]">
          <div className="border-b border-slate-200 dark:border-white/[0.07] px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">Room Text Chat</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m) => {
              const author = users[m.authorId];
              return (
                <div key={m.id} className="flex gap-2.5">
                  <Avatar user={author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {author?.displayName || 'Member'}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <MarkdownRenderer content={m.content} />
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={handleSendChat} className="border-t border-slate-200 dark:border-white/[0.07] p-3">
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder={`Message ${channel.name}...`}
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </form>
        </div>
      )}
    </div>
  );
}
