let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) sharedCtx = new AudioCtx();
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

export interface SoundboardClip {
  id: string;
  label: string;
  emoji: string;
  shortcut: string;
}

export const SOUNDBOARD_CLIPS: SoundboardClip[] = [
  { id: 'chime', label: 'Studio Chime', emoji: '🔔', shortcut: '1' },
  { id: 'levelup', label: 'Level Up', emoji: '✨', shortcut: '2' },
  { id: 'rimshot', label: 'Rimshot', emoji: '🥁', shortcut: '3' },
  { id: 'fanfare', label: 'Brass Horn', emoji: '🎺', shortcut: '4' },
  { id: 'pop', label: 'Soft Pop', emoji: '💬', shortcut: '5' },
  { id: 'clap', label: 'Applause', emoji: '👏', shortcut: '6' },
];

export function playSoundboardEffect(soundId: string, volume = 0.25) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0.02, Math.min(volume, 0.5)), now);
  master.connect(ctx.destination);

  const playTone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', gainPeak = 0.7) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.001, start);
    g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  };

  if (soundId === 'chime') {
    playTone(587.33, now, 0.35, 'triangle', 0.6);
    playTone(880, now + 0.09, 0.45, 'sine', 0.55);
  } else if (soundId === 'levelup') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, now + i * 0.07, 0.22, 'triangle', 0.5));
  } else if (soundId === 'rimshot') {
    playTone(180, now, 0.09, 'square', 0.6);
    playTone(130, now + 0.12, 0.11, 'triangle', 0.7);
    playTone(950, now + 0.24, 0.28, 'sawtooth', 0.25);
  } else if (soundId === 'fanfare') {
    playTone(392, now, 0.16, 'sawtooth', 0.35);
    playTone(523.25, now + 0.14, 0.36, 'sawtooth', 0.35);
  } else if (soundId === 'pop') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.12);
  } else {
    const bufferSize = ctx.sampleRate * 0.45;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    noise.connect(filter);
    filter.connect(master);
    noise.start(now);
  }
}

export function playNotificationPing() {
  playSoundboardEffect('pop', 0.12);
}

export function speakMessageTTS(authorName: string, content: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = content.replace(/[`*_~|#>]/g, '').slice(0, 280);
  const utter = new SpeechSynthesisUtterance(`${authorName} says: ${clean}`);
  utter.rate = 1.05;
  window.speechSynthesis.speak(utter);
}
