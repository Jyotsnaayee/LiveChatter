import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { WsServerEvent } from './src/shared/types.ts';
import { LiveChatterStore } from './server/store.ts';

const PORT = 3000;
const app = express();
const store = new LiveChatterStore();

app.use(express.json({ limit: '6mb' }));

interface AuthedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

function getBearerToken(req: express.Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return undefined;
  return header.slice(7).trim();
}

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  const session = store.verifyToken(token);
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.userId = session.userId;
  req.sessionId = session.sessionId;
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

app.post('/api/auth/demo', (req, res) => {
  try {
    const requestedId = typeof req.body?.userId === 'string' ? req.body.userId : 'user-alex';
    const user = store.getUser(requestedId) || store.getUser('user-alex')!;
    const { token } = store.issueSession(user.id, 'Web Browser');
    res.json({ token, user, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to start session' });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, username, displayName, password, dateOfBirth } = req.body || {};
    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string' || typeof dateOfBirth !== 'string') {
      res.status(400).json({ error: 'Missing required registration fields.' });
      return;
    }
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
    res.json({ token, user, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Provide email/username and password.' });
      return;
    }
    const { token, user } = store.loginUser(identifier, password);
    res.json({ token, user, snapshot: store.getSnapshot(user.id) });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
});

app.post('/api/auth/revoke-session', requireAuth, (req: AuthedRequest, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  if (sessionId) store.revokeSession(req.userId!, sessionId);
  res.json({ snapshot: store.getSnapshot(req.userId!) });
});

app.get('/api/bootstrap', requireAuth, (req: AuthedRequest, res) => {
  res.json(store.getSnapshot(req.userId!));
});

app.patch('/api/users/me', requireAuth, (req: AuthedRequest, res) => {
  try {
    const updated = store.updateUserProfile(req.userId!, req.body || {});
    broadcast({ type: 'user:updated', payload: { user: updated } });
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

app.get('/api/users/me/export', requireAuth, (req: AuthedRequest, res) => {
  res.json(store.exportUserData(req.userId!));
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
    const server = store.createServer({
      ownerId: req.userId!,
      name: String(req.body?.name || ''),
      template: req.body?.template || 'blank',
      category: req.body?.category,
      description: req.body?.description,
      iconColor: req.body?.iconColor,
    });
    broadcast({ type: 'server:created', payload: { server } }, (c) => c.userId === req.userId);
    res.json({ server, snapshot: store.getSnapshot(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create server' });
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
    for (const msg of result.messages) {
      broadcast({ type: 'message:created', payload: { message: msg } });
    }
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

app.post('/api/voice', requireAuth, (req: AuthedRequest, res) => {
  try {
    const participants = store.updateVoiceState(req.userId!, req.body?.action, req.body || {});
    broadcast({ type: 'voice:updated', payload: { participants } });
    res.json({ participants });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Voice update failed' });
  }
});

async function start() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const client: SocketClient = { ws, userId: null };
    clients.add(client);

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
