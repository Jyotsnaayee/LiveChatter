import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { AuthProvider, WsServerEvent } from './src/shared/types.ts';
import { LiveChatterStore } from './server/store.ts';
import { CaptchaService } from './server/captcha.ts';

const PORT = 3000;
const app = express();
app.set('trust proxy', 1);
const store = new LiveChatterStore();
const captcha = new CaptchaService();

app.use(express.json({ limit: '6mb' }));

interface OAuthStateEntry {
  provider: AuthProvider;
  createdAt: number;
}

interface PendingOAuthTicket {
  provider: AuthProvider;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  expiresAt: number;
}

interface OAuthStateResult {
  status: 'ready' | 'error';
  oauthTicket?: string;
  profile?: { email: string; displayName: string; avatarUrl?: string };
  error?: string;
  expiresAt: number;
}

const oauthStates = new Map<string, OAuthStateEntry>();
const oauthStateResults = new Map<string, OAuthStateResult>();
const pendingOAuthTickets = new Map<string, PendingOAuthTicket>();

function cleanupOAuthMaps() {
  const now = Date.now();
  for (const [k, v] of oauthStates.entries()) {
    if (now - v.createdAt > 10 * 60_000) oauthStates.delete(k);
  }
  for (const [k, v] of oauthStateResults.entries()) {
    if (v.expiresAt < now) oauthStateResults.delete(k);
  }
  for (const [k, v] of pendingOAuthTickets.entries()) {
    if (v.expiresAt < now) pendingOAuthTickets.delete(k);
  }
}

function getAppBaseUrl(req?: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL.trim()) {
    return process.env.APP_URL.trim().replace(/\/+$/, '');
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return `http://localhost:${PORT}`;
}

function getOAuthProviderConfig(provider: AuthProvider) {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    return { configured: Boolean(clientId && clientSecret), clientId, clientSecret };
  }
  if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
    return { configured: Boolean(clientId && clientSecret), clientId, clientSecret };
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  return { configured: Boolean(clientId && clientSecret), clientId, clientSecret };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderOAuthPopupHtml(
  payload: Record<string, unknown>,
  title: string,
  detail?: string,
  isError = false
): string {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeTitle = escapeHtml(title);
  const safeDetail = escapeHtml(
    detail ||
      (isError
        ? 'Please return to LiveChatter and try again.'
        : 'Switch back to your LiveChatter tab to complete the final human verification CAPTCHA.')
  );
  const accent = isError ? '#f43f5e' : '#10b981';
  const badgeBg = isError ? 'rgba(244,63,94,0.14)' : 'rgba(16,185,129,0.14)';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LiveChatter Sign-In</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0e1117;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;">
  <div style="width:100%;max-width:420px;background:#171a21;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.45);">
    <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${badgeBg};color:${accent};font-size:12px;font-weight:700;margin-bottom:14px;">
      ${isError ? 'Google Sign-In Error' : 'Google Account Verified'}
    </div>
    <h1 style="font-size:19px;font-weight:700;margin:0 0 10px;line-height:1.3;">${safeTitle}</h1>
    <p style="font-size:14px;color:#cbd5e1;margin:0 0 20px;line-height:1.5;word-break:break-word;">${safeDetail}</p>
    <button type="button" onclick="window.close()" style="width:100%;padding:12px 16px;border:none;border-radius:10px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;">
      Close Tab &amp; Return to LiveChatter
    </button>
    ${isError ? '' : '<a href="livechatter://oauth-complete" style="display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:11px 16px;border-radius:10px;background:#262b38;color:#e2e8f0;font-size:13px;font-weight:600;text-decoration:none;">Open LiveChatter Mobile App</a>'}
    <p id="fallback-note" style="font-size:12px;color:#94a3b8;margin:12px 0 0;line-height:1.4;">
      If this tab does not close automatically, switch back to your AI Studio or LiveChatter app.
    </p>
  </div>
  <script>
    (function() {
      var data = ${safePayload};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(data, '*');
          ${isError ? '' : 'setTimeout(function() { window.close(); }, 250);'}
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

interface AuthedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
  sessionToken?: string;
}

const SESSION_COOKIE_NAME = 'lc_session';
// 10 years in seconds so users remain signed in indefinitely until they explicitly sign out
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function isSecureRequest(req: express.Request): boolean {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  return req.secure || xfProto === 'https' || host.endsWith('.run.app');
}

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    'HttpOnly',
  ];
  if (isSecureRequest(req)) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
  ];
  if (isSecureRequest(req)) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function getBearerToken(req: express.Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return undefined;
  return header.slice(7).trim();
}

function getSessionCookieToken(req: express.Request): string | undefined {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE_NAME];
  return raw && raw.length >= 16 ? raw : undefined;
}

function isOriginMatchingHost(origin: string | undefined, req: http.IncomingMessage): boolean {
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin);
    const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    return Boolean(expectedHost) && parsedOrigin.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function isCsrfProtectedRequest(req: express.Request): boolean {
  const xrw = String(req.headers['x-requested-with'] || '').trim();
  if (xrw === 'LiveChatter' || xrw === 'XMLHttpRequest') return true;
  return isOriginMatchingHost(req.headers.origin, req);
}

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const bearer = getBearerToken(req);
  const cookieToken = !bearer ? getSessionCookieToken(req) : undefined;
  const token = bearer || cookieToken;
  const session = store.verifyToken(token);
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  // Enforce CSRF check whenever a mutating route authenticates via HttpOnly cookie
  if (!bearer && cookieToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    if (!isCsrfProtectedRequest(req)) {
      res.status(403).json({ error: 'Cross-site request blocked' });
      return;
    }
  }
  req.userId = session.userId;
  req.sessionId = session.sessionId;
  req.sessionToken = token;
  next();
}

interface SocketClient {
  ws: WebSocket;
  userId: string | null;
}

const clients = new Set<SocketClient>();

function broadcast(event: WsServerEvent, filter?: (client: SocketClient) => boolean) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN && (!filter || filter(client))) {
      client.ws.send(payload);
    }
  }
}

// --- Human Verification (CAPTCHA) ---
app.get('/api/auth/captcha', (_req, res) => {
  res.json(captcha.generate());
});

// --- OAuth Provider Discovery & Authorization URL ---
app.get('/api/auth/oauth/providers', (_req, res) => {
  res.json({
    providers: {
      google: getOAuthProviderConfig('google').configured,
      github: getOAuthProviderConfig('github').configured,
      microsoft: getOAuthProviderConfig('microsoft').configured,
    },
  });
});

app.get('/api/auth/oauth/:provider/url', (req, res) => {
  cleanupOAuthMaps();
  const provider = req.params.provider as AuthProvider;
  if (provider !== 'google' && provider !== 'github' && provider !== 'microsoft') {
    res.status(400).json({ error: 'Unsupported sign-in provider.' });
    return;
  }
  const cfg = getOAuthProviderConfig(provider);
  if (!cfg.configured || !cfg.clientId) {
    res.status(400).json({
      error: `${provider} OAuth credentials are not configured on this server.`,
      configured: false,
    });
    return;
  }

  const state = crypto.randomBytes(20).toString('hex');
  oauthStates.set(state, { provider, createdAt: Date.now() });
  const redirectUri = `${getAppBaseUrl(req)}/auth/callback/${provider}`;

  let url = '';
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });
    url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } else if (provider === 'github') {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
    });
    url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  } else {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile User.Read',
      prompt: 'select_account',
      state,
    });
    url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  res.json({ url, redirectUri, state });
});

// Poll OAuth completion status by state (supports mobile browsers where window.opener is null)
app.get('/api/auth/oauth/status/:state', (req, res) => {
  cleanupOAuthMaps();
  const state = typeof req.params.state === 'string' ? req.params.state : '';
  if (!state) {
    res.json({ status: 'expired' });
    return;
  }
  const result = oauthStateResults.get(state);
  if (result) {
    oauthStateResults.delete(state);
    res.json(result);
    return;
  }
  if (oauthStates.has(state)) {
    res.json({ status: 'pending' });
    return;
  }
  res.json({ status: 'expired' });
});

// --- OAuth Callback (both trailing and non-trailing slash) ---
app.get(['/auth/callback/:provider', '/auth/callback/:provider/'], async (req, res) => {
  cleanupOAuthMaps();
  const provider = req.params.provider as AuthProvider;
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
  const oauthErrorDesc = typeof req.query.error_description === 'string' ? req.query.error_description : '';

  const failCallback = (statusCode: number, title: string, detail: string) => {
    if (state) {
      oauthStateResults.set(state, {
        status: 'error',
        error: detail,
        expiresAt: Date.now() + 5 * 60_000,
      });
    }
    res
      .status(statusCode)
      .send(renderOAuthPopupHtml({ type: 'OAUTH_ERROR', error: detail }, title, detail, true));
  };

  if (provider !== 'google' && provider !== 'github' && provider !== 'microsoft') {
    failCallback(400, 'Sign-in failed', 'Unsupported authentication provider.');
    return;
  }
  if (oauthError) {
    oauthStates.delete(state);
    const reason = oauthErrorDesc || oauthError;
    failCallback(400, 'Google sign-in was cancelled', `Google returned: ${reason}`);
    return;
  }
  const savedState = state ? oauthStates.get(state) : undefined;
  if (!savedState || savedState.provider !== provider || !code) {
    failCallback(
      400,
      'Sign-in session expired',
      'This sign-in link expired or was already used. Return to LiveChatter and tap Continue with Google again.'
    );
    return;
  }
  oauthStates.delete(state);

  const cfg = getOAuthProviderConfig(provider);
  if (!cfg.configured || !cfg.clientId || !cfg.clientSecret) {
    failCallback(400, 'Configuration required', 'Google OAuth credentials are not configured on this server.');
    return;
  }

  const redirectUri = `${getAppBaseUrl(req)}/auth/callback/${provider}`;

  try {
    let email = '';
    let displayName = '';
    let username = '';
    let avatarUrl: string | undefined;

    if (provider === 'google') {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!tokenRes.ok || !tokenData.access_token) {
        const codeStr = tokenData.error || `HTTP ${tokenRes.status}`;
        const descStr = tokenData.error_description || '';
        if (codeStr === 'invalid_client' || tokenRes.status === 401) {
          throw new Error(
            `Google rejected the Client Secret (${codeStr}${descStr ? `: ${descStr}` : ''}). Re-check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in AI Studio Secrets and tap Apply changes.`
          );
        }
        throw new Error(
          `Google token exchange failed (${codeStr}${descStr ? `: ${descStr}` : ''}).`
        );
      }
      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) {
        throw new Error(`Could not fetch Google profile (HTTP ${userRes.status}).`);
      }
      const profile = (await userRes.json()) as { email?: string; name?: string; picture?: string };
      email = String(profile.email || '').trim().toLowerCase();
      displayName = String(profile.name || email.split('@')[0] || 'Google Member').trim();
      avatarUrl = profile.picture;
    } else if (provider === 'github') {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'GitHub token exchange failed.');
      }
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'LiveChatter' },
      });
      const profile = (await userRes.json()) as { login?: string; name?: string; email?: string; avatar_url?: string };
      email = String(profile.email || '').trim().toLowerCase();
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'LiveChatter' },
        });
        const emails = (await emailsRes.json()) as Array<{ email: string; primary?: boolean; verified?: boolean }>;
        const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) || emails[0] : undefined;
        email = primary?.email?.toLowerCase() || `${profile.login || 'github'}@users.noreply.github.com`;
      }
      username = profile.login || '';
      displayName = String(profile.name || profile.login || 'GitHub Member').trim();
      avatarUrl = profile.avatar_url;
    } else {
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'openid email profile User.Read',
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Microsoft token exchange failed.');
      }
      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = (await userRes.json()) as { mail?: string; userPrincipalName?: string; displayName?: string };
      email = String(profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
      displayName = String(profile.displayName || email.split('@')[0] || 'Microsoft Member').trim();
    }

    if (!email) {
      throw new Error('Could not read account email from provider.');
    }

    // Issue a short-lived pending ticket so CAPTCHA is still required as the final step!
    const oauthTicket = `oauthtk-${crypto.randomBytes(16).toString('hex')}`;
    pendingOAuthTickets.set(oauthTicket, {
      provider,
      email,
      displayName,
      username: username || undefined,
      avatarUrl,
      expiresAt: Date.now() + 5 * 60_000,
    });

    // Store result by state so mobile browsers without window.opener pick it up via polling
    oauthStateResults.set(state, {
      status: 'ready',
      oauthTicket,
      profile: { email, displayName, avatarUrl },
      expiresAt: Date.now() + 5 * 60_000,
    });

    res.send(
      renderOAuthPopupHtml(
        {
          type: 'OAUTH_PENDING_CAPTCHA',
          provider,
          oauthTicket,
          profile: { email, displayName, avatarUrl },
        },
        `Signed in as ${displayName}`,
        'Switch back to your LiveChatter tab to finish the final human verification CAPTCHA.',
        false
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth sign-in failed.';
    failCallback(500, 'Sign-in error', message);
  }
});

// Complete real OAuth sign-in AFTER passing final-step CAPTCHA
app.post('/api/auth/oauth/complete', (req, res) => {
  try {
    cleanupOAuthMaps();
    const { oauthTicket, captchaId, captchaAnswer, mode } = req.body || {};
    if (typeof oauthTicket !== 'string' || !pendingOAuthTickets.has(oauthTicket)) {
      res.status(400).json({ error: 'OAuth verification expired. Please sign in with Google again.' });
      return;
    }
    captcha.verifyAndConsume(captchaId, captchaAnswer);
    const ticket = pendingOAuthTickets.get(oauthTicket)!;
    pendingOAuthTickets.delete(oauthTicket);

    const { token, user, isNewUser } = store.authenticateWithProvider({
      provider: ticket.provider,
      email: ticket.email,
      displayName: ticket.displayName,
      username: ticket.username,
      avatarUrl: ticket.avatarUrl,
      mode: mode === 'signup' ? 'signup' : 'signin',
    });
    broadcast({ type: 'user:updated', payload: { user } });
    if (isNewUser) {
      const kernel = store.getServer('srv-kernel');
      if (kernel) broadcast({ type: 'server:updated', payload: { server: kernel } });
    }
    setSessionCookie(req, res, token);
    res.json({ token, user, isNewUser, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to complete sign-in.' });
  }
});

// Provider Sign-In / Account Creation (Google) with mandatory final-step CAPTCHA verification
app.post('/api/auth/provider-auth', (req, res) => {
  try {
    const { provider, email, displayName, mode, captchaId, captchaAnswer } = req.body || {};
    if (provider !== 'google' && provider !== 'github' && provider !== 'microsoft') {
      res.status(400).json({ error: 'Please sign in with Google to continue.' });
      return;
    }
    if (typeof email !== 'string' || !email.trim().includes('@')) {
      res.status(400).json({ error: 'Enter a valid Google email address.' });
      return;
    }
    captcha.verifyAndConsume(captchaId, captchaAnswer);

    const { token, user, isNewUser } = store.authenticateWithProvider({
      provider,
      email: email.trim(),
      displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined,
      mode: mode === 'signup' ? 'signup' : 'signin',
    });
    broadcast({ type: 'user:updated', payload: { user } });
    if (isNewUser) {
      const kernel = store.getServer('srv-kernel');
      if (kernel) broadcast({ type: 'server:updated', payload: { server: kernel } });
    }
    setSessionCookie(req, res, token);
    res.json({ token, user, isNewUser, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Sign-in failed.' });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, username, displayName, password, dateOfBirth, captchaId, captchaAnswer } = req.body || {};
    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string' || typeof dateOfBirth !== 'string') {
      res.status(400).json({ error: 'Missing required registration fields.' });
      return;
    }
    captcha.verifyAndConsume(captchaId, captchaAnswer);
    const { token, user } = store.registerUser({
      email,
      username,
      displayName: typeof displayName === 'string' ? displayName : username,
      password,
      dateOfBirth,
    });
    broadcast({ type: 'user:updated', payload: { user } });
    const kernel = store.getServer('srv-kernel');
    if (kernel) broadcast({ type: 'server:updated', payload: { server: kernel } });
    setSessionCookie(req, res, token);
    res.json({ token, user, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { identifier, password, captchaId, captchaAnswer } = req.body || {};
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Provide email/username and password.' });
      return;
    }
    captcha.verifyAndConsume(captchaId, captchaAnswer);
    const { token, user } = store.loginUser(identifier, password);
    setSessionCookie(req, res, token);
    res.json({ token, user, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
});

// Restore persistent session on app reload / mobile APK reopen until the user explicitly signs out
app.get('/api/auth/session', (req, res) => {
  const token = getBearerToken(req) || getSessionCookieToken(req);
  const session = store.verifyToken(token);
  if (!session || !token) {
    res.json({ authenticated: false });
    return;
  }
  const snapshot = store.getSnapshot(session.userId);
  const user = snapshot.users[session.userId];
  if (!user) {
    clearSessionCookie(req, res);
    res.json({ authenticated: false });
    return;
  }
  setSessionCookie(req, res, token);
  res.json({ authenticated: true, token, user, snapshot });
});

app.post('/api/auth/logout', (req, res) => {
  const bearer = getBearerToken(req);
  const cookieToken = getSessionCookieToken(req);
  if (!bearer && cookieToken && !isCsrfProtectedRequest(req)) {
    res.status(403).json({ error: 'Cross-site request blocked' });
    return;
  }
  if (bearer) store.revokeToken(bearer);
  if (cookieToken) store.revokeToken(cookieToken);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/revoke-session', requireAuth, (req: AuthedRequest, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  if (sessionId) {
    store.revokeSession(req.userId!, sessionId);
    if (sessionId === req.sessionId) {
      clearSessionCookie(req, res);
    }
  }
  res.json({ snapshot: store.getSnapshot(req.userId!) });
});

app.get('/api/bootstrap', requireAuth, (req: AuthedRequest, res) => {
  res.json(store.getSnapshot(req.userId!));
});

app.patch('/api/users/me', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { user: updated, chargedFeatureBalls } = store.updateUserProfile(req.userId!, req.body || {});
    broadcast({ type: 'user:updated', payload: { user: updated } });
    res.json({ user: updated, chargedFeatureBalls, quests: store.getQuestsState(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

app.get('/api/users/me/export', requireAuth, (req: AuthedRequest, res) => {
  res.json(store.exportUserData(req.userId!));
});

// --- Feature Ball Quests, Ranks Shop & Server Boosts ---
app.get('/api/quests', requireAuth, (req: AuthedRequest, res) => {
  res.json(store.getQuestsState(req.userId!));
});

app.post('/api/quests/:questId/accept', requireAuth, (req: AuthedRequest, res) => {
  try {
    const quests = store.acceptQuest(req.userId!, req.params.questId);
    res.json({ quests });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not accept quest.' });
  }
});

app.post('/api/quests/:questId/complete', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { user, quests, awarded } = store.completeQuestTask(req.userId!, req.params.questId);
    broadcast({ type: 'user:updated', payload: { user } });
    res.json({ user, quests, awarded });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not complete quest.' });
  }
});

app.post('/api/quests/claim-all', requireAuth, (req: AuthedRequest, res) => {
  try {
    const freq = req.body?.frequency;
    const validFreq = freq === 'daily' || freq === 'weekly' || freq === 'monthly' ? freq : undefined;
    const { user, quests, claimedCount, awarded } = store.claimAllReadyQuests(req.userId!, validFreq);
    if (awarded > 0) broadcast({ type: 'user:updated', payload: { user } });
    res.json({ user, quests, claimedCount, awarded });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not claim quests.' });
  }
});

app.post('/api/orbs/shop/:itemId/buy', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { user, item, quests } = store.buyOrbsShopItem(req.userId!, req.params.itemId);
    broadcast({ type: 'user:updated', payload: { user } });
    res.json({ user, item, quests });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not purchase shop item.' });
  }
});

app.post('/api/orbs/equip', requireAuth, (req: AuthedRequest, res) => {
  try {
    const slot = req.body?.slot;
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : null;
    if (slot !== 'decoration' && slot !== 'effect' && slot !== 'nameplate' && slot !== 'badge') {
      res.status(400).json({ error: 'Invalid cosmetic slot.' });
      return;
    }
    const user = store.equipOrbsShopItem(req.userId!, slot, itemId);
    broadcast({ type: 'user:updated', payload: { user } });
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not equip cosmetic.' });
  }
});

app.post('/api/servers/:serverId/ranks', requireAuth, (req: AuthedRequest, res) => {
  try {
    const server = store.addServerRank(req.userId!, req.params.serverId, {
      name: String(req.body?.name || ''),
      color: String(req.body?.color || '#2563EB'),
      price: Number(req.body?.price || 20),
      badge: typeof req.body?.badge === 'string' ? req.body.badge : undefined,
    });
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ server });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not add rank.' });
  }
});

app.delete('/api/servers/:serverId/ranks/:rankId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const server = store.deleteServerRank(req.userId!, req.params.serverId, req.params.rankId);
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ server });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not delete rank.' });
  }
});

app.post('/api/servers/:serverId/ranks/:rankId/buy', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { user, server, rank } = store.buyServerRank(req.userId!, req.params.serverId, req.params.rankId);
    broadcast({ type: 'user:updated', payload: { user } });
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ user, server, rank, quests: store.getQuestsState(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not purchase rank.' });
  }
});

app.post('/api/servers/:serverId/boost', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { user, server, announcementMessage } = store.boostServer(req.userId!, req.params.serverId);
    broadcast({ type: 'user:updated', payload: { user } });
    broadcast({ type: 'server:updated', payload: { server } });
    if (announcementMessage) {
      broadcast({ type: 'message:created', payload: { message: announcementMessage } });
    }
    res.json({ user, server, announcementMessage, quests: store.getQuestsState(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not boost server.' });
  }
});

app.post('/api/inbox/read', requireAuth, (req: AuthedRequest, res) => {
  store.markInboxRead(req.userId!);
  res.json({ ok: true });
});

app.post('/api/channels/:channelId/mute', requireAuth, (req: AuthedRequest, res) => {
  const mutedChannelIds = store.toggleMuteChannel(req.userId!, req.params.channelId);
  res.json({ mutedChannelIds });
});

app.post('/api/servers', requireAuth, (req: AuthedRequest, res) => {
  try {
    const rawIconUrl = typeof req.body?.iconUrl === 'string' ? req.body.iconUrl.trim() : '';
    const isValidServerIcon =
      rawIconUrl.length > 0 &&
      rawIconUrl.length <= 2_500_000 &&
      (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(rawIconUrl) ||
        /^https:\/\/[^\s"'<>]+$/i.test(rawIconUrl));
    if (!isValidServerIcon) {
      res.status(400).json({
        error: 'A server icon image (PNG, JPG, WebP, or GIF) is required before creating a server.',
      });
      return;
    }
    const botCmdSetup = req.body?.botCmdSetup;
    if (!botCmdSetup || typeof botCmdSetup.channelName !== 'string' || !botCmdSetup.channelName.trim()) {
      res.status(400).json({ error: 'Bot command setup (bot command channel name) is required when creating a server.' });
      return;
    }
    const rawRanks = Array.isArray(req.body?.ranks) ? req.body.ranks : [];
    const validRanks = rawRanks
      .map((r: { name?: unknown; color?: unknown; price?: unknown; badge?: unknown }) => ({
        name: String(r?.name || '').trim(),
        color: String(r?.color || '#2563EB'),
        price: Math.max(1, Math.round(Number(r?.price) || 20)),
        badge: typeof r?.badge === 'string' && r.badge.trim() ? r.badge.trim() : '⭐',
      }))
      .filter((r: { name: string }) => r.name.length > 0);
    if (validRanks.length === 0) {
      res.status(400).json({
        error: 'You must add at least 1 cosmetic server rank (no permissions) when creating a server.',
      });
      return;
    }
    const server = store.createServer({
      ownerId: req.userId!,
      name: String(req.body?.name || ''),
      template: req.body?.template || 'blank',
      category: req.body?.category,
      description: req.body?.description,
      iconColor: req.body?.iconColor,
      iconUrl: rawIconUrl,
      botCmdSetup: {
        channelName: botCmdSetup.channelName,
        enabledCommands: Array.isArray(botCmdSetup.enabledCommands)
          ? botCmdSetup.enabledCommands.map(String)
          : undefined,
      },
      ranks: validRanks,
    });
    broadcast({ type: 'server:created', payload: { server } }, (c) => c.userId === req.userId);
    res.json({ server, snapshot: store.getSnapshot(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create server' });
  }
});

app.post('/api/servers/:serverId/custom-invite', requireAuth, (req: AuthedRequest, res) => {
  try {
    const rawMinutes = req.body?.expiresInMinutes;
    const expiresInMinutes =
      rawMinutes === null || rawMinutes === undefined || rawMinutes === 'never' || rawMinutes === 0
        ? null
        : Number(rawMinutes);
    const { server, invite, message } = store.createCustomServerInvite(
      req.userId!,
      req.params.serverId,
      Number.isFinite(expiresInMinutes) ? expiresInMinutes : null,
      true
    );
    store.recordQuestAction(req.userId!, 'invite', 1);
    broadcast({ type: 'server:updated', payload: { server } });
    if (message) {
      broadcast({ type: 'message:created', payload: { message } });
    }
    res.json({ server, invite, message });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create custom invite link' });
  }
});

app.post('/api/servers/join', requireAuth, (req: AuthedRequest, res) => {
  try {
    const code = String(req.body?.code || '');
    const server = store.joinByInviteOrDiscovery(req.userId!, code);
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ server, snapshot: store.getSnapshot(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not join server' });
  }
});

app.post('/api/servers/reorder', requireAuth, (req: AuthedRequest, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
  store.reorderServers(orderedIds);
  res.json({ ok: true });
});

app.post('/api/servers/:serverId/channels', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { server, channel } = store.createChannel(req.userId!, req.params.serverId, req.body || {});
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ server, channel });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Could not create channel' });
  }
});

app.patch('/api/servers/:serverId/settings', requireAuth, (req: AuthedRequest, res) => {
  try {
    const server = store.updateServerSettings(req.userId!, req.params.serverId, req.body || {});
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ server });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Could not update server' });
  }
});

app.post('/api/servers/:serverId/moderate', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { targetUserId, action, reason, durationMinutes, roleId } = req.body || {};
    const server = store.moderateMember(req.userId!, req.params.serverId, String(targetUserId), action, {
      reason,
      durationMinutes,
      roleId,
    });
    broadcast({ type: 'server:updated', payload: { server } });
    res.json({ server });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Moderation failed' });
  }
});

app.post('/api/servers/:serverId/leave', requireAuth, (req: AuthedRequest, res) => {
  try {
    const result = store.leaveServer(req.userId!, req.params.serverId);
    if (result.deleted) {
      broadcast({ type: 'server:deleted', payload: { serverId: req.params.serverId } });
    } else if (result.server) {
      broadcast({ type: 'server:updated', payload: { server: result.server } });
    }
    res.json({ ok: true, deleted: result.deleted });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not leave server' });
  }
});

app.post('/api/channels/:channelId/messages', requireAuth, (req: AuthedRequest, res) => {
  try {
    const result = store.sendMessage({
      userId: req.userId!,
      channelId: req.params.channelId,
      threadId: req.body?.threadId,
      content: String(req.body?.content || ''),
      replyToId: req.body?.replyToId,
      silent: Boolean(req.body?.silent),
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      poll: req.body?.poll,
      voiceClip: req.body?.voiceClip,
      forwardedFrom: req.body?.forwardedFrom,
    });
    const ticket = store.getTicket(req.params.channelId);
    for (const msg of result.messages) {
      if (ticket) {
        broadcast(
          { type: 'message:created', payload: { message: msg } },
          (c) => Boolean(c.userId && store.canAccessTicket(c.userId, ticket))
        );
      } else {
        broadcast({ type: 'message:created', payload: { message: msg } });
      }
    }
    if (result.createdTicket) {
      const created = result.createdTicket;
      const initialMessage = store.getSnapshot(created.creatorId).messages[created.id]?.[0];
      broadcast(
        { type: 'ticket:created', payload: { ticket: created, initialMessage } },
        (c) => Boolean(c.userId && store.canAccessTicket(c.userId, created))
      );
    }
    if (result.serverUpdated) {
      broadcast({ type: 'server:updated', payload: { server: result.serverUpdated } });
    }
    const trimmedMsg = String(req.body?.content || '').trim();
    const isCmdMsg = trimmedMsg.startsWith('/') || /^-i(\s|$)/i.test(trimmedMsg);
    store.recordQuestAction(req.userId!, isCmdMsg ? 'command' : 'message', 1);
    res.json({ messages: result.messages });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not send message' });
  }
});

app.patch('/api/channels/:channelId/messages/:messageId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const updated = store.editMessage(
      req.userId!,
      req.params.channelId,
      req.params.messageId,
      String(req.body?.content || ''),
      req.body?.threadId
    );
    broadcast({ type: 'message:updated', payload: { message: updated } });
    res.json({ message: updated });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Could not edit message' });
  }
});

app.delete('/api/channels/:channelId/messages/:messageId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : undefined;
    store.deleteMessage(req.userId!, req.params.channelId, req.params.messageId, threadId);
    broadcast({
      type: 'message:deleted',
      payload: { channelId: req.params.channelId, threadId, messageId: req.params.messageId },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Could not delete message' });
  }
});

app.post('/api/channels/:channelId/messages/:messageId/react', requireAuth, (req: AuthedRequest, res) => {
  try {
    const updated = store.toggleReaction(
      req.userId!,
      req.params.channelId,
      req.params.messageId,
      String(req.body?.emoji || '👍'),
      req.body?.threadId
    );
    store.recordQuestAction(req.userId!, 'reaction', 1);
    broadcast({ type: 'message:updated', payload: { message: updated } });
    res.json({ message: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not react' });
  }
});

app.post('/api/channels/:channelId/messages/:messageId/pin', requireAuth, (req: AuthedRequest, res) => {
  try {
    const updated = store.togglePin(req.userId!, req.params.channelId, req.params.messageId, req.body?.threadId);
    broadcast({ type: 'message:updated', payload: { message: updated } });
    res.json({ message: updated });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Could not pin message' });
  }
});

app.post('/api/channels/:channelId/messages/:messageId/vote', requireAuth, (req: AuthedRequest, res) => {
  try {
    const updated = store.votePoll(
      req.userId!,
      req.params.channelId,
      req.params.messageId,
      String(req.body?.optionId || ''),
      req.body?.threadId
    );
    broadcast({ type: 'message:updated', payload: { message: updated } });
    res.json({ message: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not vote' });
  }
});

app.post('/api/threads', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { thread, initialMessage } = store.createThread({
      userId: req.userId!,
      serverId: String(req.body?.serverId || ''),
      channelId: String(req.body?.channelId || ''),
      title: String(req.body?.title || ''),
      parentMessageId: req.body?.parentMessageId,
      isPrivate: Boolean(req.body?.isPrivate),
      autoArchiveMinutes: req.body?.autoArchiveMinutes,
      isForumPost: Boolean(req.body?.isForumPost),
      tags: Array.isArray(req.body?.tags) ? req.body.tags : undefined,
      initialContent: req.body?.initialContent,
    });
    store.recordQuestAction(req.userId!, 'thread', 1);
    broadcast({ type: 'thread:created', payload: { thread, initialMessage } });
    res.json({ thread, initialMessage });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create thread' });
  }
});

app.patch('/api/threads/:threadId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const thread = store.updateThread(req.userId!, req.params.threadId, req.body || {});
    broadcast({ type: 'thread:updated', payload: { thread } });
    res.json({ thread });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update thread' });
  }
});

app.post('/api/dms', requireAuth, (req: AuthedRequest, res) => {
  try {
    const dm = store.createOrOpenDm(
      req.userId!,
      Array.isArray(req.body?.participantIds) ? req.body.participantIds : [],
      req.body?.name
    );
    broadcast({ type: 'dm:created', payload: { dm } }, (c) => Boolean(c.userId && dm.participantIds.includes(c.userId)));
    res.json({ dm });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not open DM' });
  }
});

app.post('/api/friends', requireAuth, (req: AuthedRequest, res) => {
  try {
    const friends = store.manageFriend(req.userId!, req.body?.action, String(req.body?.target || ''));
    res.json({ friends });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Friend action failed' });
  }
});

app.post('/api/friend-invites', requireAuth, (req: AuthedRequest, res) => {
  try {
    const invite = store.createFriendInvite(req.userId!, {
      serverId: typeof req.body?.serverId === 'string' && req.body.serverId ? req.body.serverId : undefined,
      maxUses: typeof req.body?.maxUses === 'number' ? req.body.maxUses : undefined,
      expiresInHours: typeof req.body?.expiresInHours === 'number' ? req.body.expiresInHours : undefined,
      note: typeof req.body?.note === 'string' ? req.body.note : undefined,
    });
    store.recordQuestAction(req.userId!, 'invite', 1);
    res.json({ invite, snapshot: store.getSnapshot(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create invite code' });
  }
});

app.delete('/api/friend-invites/:code', requireAuth, (req: AuthedRequest, res) => {
  try {
    const friendInvites = store.revokeFriendInvite(req.userId!, req.params.code);
    res.json({ friendInvites });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not revoke invite' });
  }
});

app.post('/api/friend-invites/:code/share', requireAuth, (req: AuthedRequest, res) => {
  const allowed = ['whatsapp', 'gmail', 'messages', 'copy', 'native'] as const;
  const ch = req.body?.channel;
  if (typeof ch !== 'string' || !allowed.includes(ch as (typeof allowed)[number])) {
    res.status(400).json({ error: 'Invalid share channel' });
    return;
  }
  const invite = store.recordFriendInviteShare(
    req.userId!,
    req.params.code,
    ch as (typeof allowed)[number]
  );
  res.json({ invite, friendInvites: store.getSnapshot(req.userId!).friendInvites });
});

app.post('/api/friend-invites/redeem', requireAuth, (req: AuthedRequest, res) => {
  try {
    const code = String(req.body?.code || '');
    const result = store.redeemFriendInvite(req.userId!, code);
    if (result.dm) {
      broadcast(
        { type: 'dm:created', payload: { dm: result.dm } },
        (c) => Boolean(c.userId && result.dm!.participantIds.includes(c.userId))
      );
    }
    if (result.server) {
      broadcast({ type: 'server:updated', payload: { server: result.server } });
    }
    res.json({ ...result, snapshot: store.getSnapshot(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not redeem invite code' });
  }
});

app.post('/api/servers/:serverId/tickets', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { ticket, initialMessage } = store.createTicket(req.userId!, req.params.serverId, {
      category: req.body?.category || 'help',
      subject: String(req.body?.subject || ''),
      details: String(req.body?.details || ''),
      rewardTierId: typeof req.body?.rewardTierId === 'string' ? req.body.rewardTierId : undefined,
    });
    broadcast(
      { type: 'ticket:created', payload: { ticket, initialMessage } },
      (c) => Boolean(c.userId && store.canAccessTicket(c.userId, ticket))
    );
    res.json({ ticket, initialMessage });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create ticket' });
  }
});

app.patch('/api/tickets/:ticketId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { ticket, systemMessage, serverUpdated } = store.updateTicket(req.userId!, req.params.ticketId, {
      status: req.body?.status,
      approveReward: Boolean(req.body?.approveReward),
    });
    broadcast(
      { type: 'ticket:updated', payload: { ticket } },
      (c) => Boolean(c.userId && store.canAccessTicket(c.userId, ticket))
    );
    if (systemMessage) {
      broadcast(
        { type: 'message:created', payload: { message: systemMessage } },
        (c) => Boolean(c.userId && store.canAccessTicket(c.userId, ticket))
      );
    }
    if (serverUpdated) {
      broadcast({ type: 'server:updated', payload: { server: serverUpdated } });
    }
    res.json({ ticket, systemMessage, server: serverUpdated });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Could not update ticket' });
  }
});

app.post('/api/voice', requireAuth, (req: AuthedRequest, res) => {
  try {
    const participants = store.updateVoiceState(req.userId!, req.body?.action, req.body || {});
    if (req.body?.action === 'join') {
      store.recordQuestAction(req.userId!, 'voice', 1);
    }
    broadcast({ type: 'voice:updated', payload: { participants } });
    res.json({ participants });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Voice update failed' });
  }
});

async function start() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const client: SocketClient = { ws, userId: null };
    clients.add(client);

    // Auto-authenticate WebSocket from persistent HttpOnly session cookie when origin matches
    const originHeader = req.headers.origin;
    if (!originHeader || isOriginMatchingHost(originHeader, req)) {
      const cookies = parseCookies(req.headers.cookie);
      const cookieSess = store.verifyToken(cookies[SESSION_COOKIE_NAME]);
      if (cookieSess) {
        client.userId = cookieSess.userId;
      }
    }

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'auth' && typeof data.token === 'string') {
          const sess = store.verifyToken(data.token);
          if (sess) {
            client.userId = sess.userId;
            ws.send(JSON.stringify({ type: 'state:sync', payload: store.getSnapshot(sess.userId) }));
          }
          return;
        }
        if (!client.userId) return;

        if (data.type === 'typing' && typeof data.channelId === 'string') {
          broadcast(
            {
              type: 'typing:update',
              payload: { channelId: data.channelId, userId: client.userId, isTyping: Boolean(data.isTyping) },
            },
            (c) => c !== client
          );
        } else if (data.type === 'soundboard:play' && typeof data.channelId === 'string') {
          broadcast({
            type: 'soundboard:played',
            payload: {
              channelId: data.channelId,
              userId: client.userId,
              soundId: String(data.soundId || 'chime'),
              label: String(data.label || 'Chime'),
            },
          });
        } else if (data.type === 'whiteboard:stroke' && data.stroke && typeof data.stroke.channelId === 'string') {
          const stroke = {
            id: String(data.stroke.id || Date.now()),
            channelId: String(data.stroke.channelId),
            userId: client.userId,
            color: String(data.stroke.color || '#2563EB'),
            width: Number(data.stroke.width || 3),
            points: Array.isArray(data.stroke.points) ? data.stroke.points.slice(0, 500) : [],
          };
          store.addWhiteboardStroke(stroke);
          broadcast({ type: 'whiteboard:stroke', payload: { stroke } });
        } else if (data.type === 'whiteboard:clear' && typeof data.channelId === 'string') {
          store.clearWhiteboard(data.channelId);
          broadcast({ type: 'whiteboard:cleared', payload: { channelId: data.channelId } });
        } else if (data.type === 'presence:set' && typeof data.status === 'string') {
          const updated = store.updatePresence(client.userId, data.status, data.customStatus);
          if (updated) {
            broadcast({
              type: 'presence:updated',
              payload: { userId: updated.id, status: updated.status, customStatus: updated.customStatus },
            });
          }
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LiveChatter server running on http://localhost:${PORT}`);
  });
}

start();
