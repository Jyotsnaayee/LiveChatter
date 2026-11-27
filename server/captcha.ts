import crypto from 'node:crypto';

interface CaptchaRecord {
  id: string;
  code: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}

// Visually unambiguous characters (no 0/O, 1/I/l confusion)
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export class CaptchaService {
  private challenges = new Map<string, CaptchaRecord>();

  public generate(): { captchaId: string; imageDataUrl: string; expiresAt: string } {
    this.cleanupExpired();
    const id = `cap-${crypto.randomBytes(12).toString('hex')}`;
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[bytes[i] % ALPHABET.length];
    }

    const expiresAt = Date.now() + 5 * 60_000; // 5-minute TTL
    this.challenges.set(id, {
      id,
      code,
      expiresAt,
      attempts: 0,
      used: false,
    });

    const svg = this.renderSvg(code);
    const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    return {
      captchaId: id,
      imageDataUrl,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public verifyAndConsume(captchaId: string | undefined, userAnswer: string | undefined): void {
    this.cleanupExpired();
    if (!captchaId || typeof captchaId !== 'string') {
      throw new Error('Human verification (CAPTCHA) is required to continue.');
    }
    const rec = this.challenges.get(captchaId);
    if (!rec || rec.used || rec.expiresAt < Date.now()) {
      this.challenges.delete(captchaId);
      throw new Error('CAPTCHA challenge expired. Please refresh and try again.');
    }

    rec.attempts += 1;
    if (rec.attempts > 5) {
      this.challenges.delete(captchaId);
      throw new Error('Too many CAPTCHA attempts. Please load a new verification challenge.');
    }

    const normalized = String(userAnswer || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (normalized.length !== rec.code.length) {
      throw new Error('Incorrect CAPTCHA code. Please check the characters and try again.');
    }

    const a = Buffer.from(normalized, 'utf8');
    const b = Buffer.from(rec.code, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Incorrect CAPTCHA code. Please check the characters and try again.');
    }

    rec.used = true;
    this.challenges.delete(captchaId);
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [id, rec] of this.challenges.entries()) {
      if (rec.expiresAt < now || rec.used) {
        this.challenges.delete(id);
      }
    }
  }

  private renderSvg(code: string): string {
    const width = 220;
    const height = 70;
    const bgColors = ['#0F172A', '#131B2E', '#111827'];
    const bg = bgColors[crypto.randomInt(bgColors.length)];
    const fgPalette = ['#60A5FA', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#38BDF8'];

    const noiseLines: string[] = [];
    for (let i = 0; i < 7; i++) {
      const x1 = crypto.randomInt(0, width);
      const y1 = crypto.randomInt(0, height);
      const x2 = crypto.randomInt(0, width);
      const y2 = crypto.randomInt(0, height);
      const color = fgPalette[crypto.randomInt(fgPalette.length)];
      noiseLines.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity="0.28" stroke-width="1.5" />`
      );
    }

    const noiseDots: string[] = [];
    for (let i = 0; i < 28; i++) {
      const cx = crypto.randomInt(4, width - 4);
      const cy = crypto.randomInt(4, height - 4);
      const r = (crypto.randomInt(10, 24) / 10).toFixed(1);
      noiseDots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#94A3B8" fill-opacity="0.32" />`);
    }

    const chars: string[] = [];
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const x = 22 + i * 31 + crypto.randomInt(-3, 4);
      const y = 45 + crypto.randomInt(-7, 8);
      const rot = crypto.randomInt(-22, 23);
      const size = crypto.randomInt(26, 33);
      const color = fgPalette[crypto.randomInt(fgPalette.length)];
      chars.push(
        `<text x="${x}" y="${y}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${size}" font-weight="800" fill="${color}" transform="rotate(${rot} ${x} ${y})">${ch}</text>`
      );
    }

    const waveY1 = crypto.randomInt(18, 52);
    const waveY2 = crypto.randomInt(18, 52);
    const wave = `<path d="M 6 ${waveY1} Q 110 ${waveY2} ${width - 6} ${waveY1}" fill="none" stroke="#E2E8F0" stroke-opacity="0.25" stroke-width="2" />`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" rx="10" fill="${bg}" />
      ${noiseDots.join('')}
      ${noiseLines.join('')}
      ${chars.join('')}
      ${wave}
    </svg>`;
  }
}
