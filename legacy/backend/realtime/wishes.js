const { randomUUID } = require('node:crypto');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

// Node timers overflow above ~24.8 days. Re-arm long-lived sessions safely.
function expireAt(exp, callback) {
    let timer;
    if (Number.isFinite(exp)) {
        const arm = () => {
            const remaining = exp * 1000 - Date.now();
            if (remaining <= 0) { callback(); return; }
            timer = setTimeout(arm, Math.min(remaining, 2147483647));
            timer.unref();
        };
        // Defer expired sessions until the connection's cleanup handlers are installed.
        timer = setTimeout(arm, 0);
        timer.unref();
    }
    return () => clearTimeout(timer);
}

function createWishEvents({ historyLimit = 256, heartbeatMs = 15000, maxPendingBytes = 1024 * 1024,
    drainTimeoutMs = 30000, onError = console.error, onDiagnostic = () => {} } = {}) {
    const epoch = randomUUID();
    let sequence = 0;
    const history = [];
    const clients = new Map();
    const subscribers = new Set();
    const frame = entry => `id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`;
    const closeClient = (res, reason) => {
        const client = clients.get(res);
        if (!client) return;
        clients.delete(res);
        clearTimeout(client.drainTimer);
        client.cancelExpiry();
        res.off('drain', client.drain);
        client.queue.length = 0;
        onDiagnostic({ transport: 'sse', event: 'disconnected', reason, connection_id: client.id });
    };
    const stop = (res, reason) => {
        closeClient(res, reason);
        res.destroy();
    };
    const send = (res, data) => {
        const client = clients.get(res);
        if (!client) return false;
        try {
            if (res.destroyed || res.writableEnded) {
                closeClient(res, 'connection closed');
                return false;
            }
            if (!res.write(data)) {
                // false means accepted but buffered, NOT a failed write. Wait for drain.
                client.blocked = true;
                client.drainTimer = setTimeout(() => stop(res, 'backpressure timeout'), drainTimeoutMs);
                client.drainTimer.unref();
            }
            return true;
        } catch (error) {
            onError(error);
            stop(res, 'write error');
            return false;
        }
    };
    const write = (res, data) => {
        const client = clients.get(res);
        if (!client) return false;
        if (!client.blocked) return send(res, data);
        const bytes = Buffer.byteLength(data);
        if (client.pendingBytes + bytes > maxPendingBytes) {
            stop(res, 'backpressure queue limit');
            return false;
        }
        client.queue.push(data);
        client.pendingBytes += bytes;
        return true;
    };
    const heartbeat = setInterval(() => {
        for (const [res, client] of clients) {
            if (!client.blocked) write(res, ': heartbeat\n\n');
        }
    }, heartbeatMs);
    heartbeat.unref();

    return {
        publish(event, data) {
            const entry = { id: `${epoch}:${++sequence}`, event, data };
            history.push(entry);
            if (history.length > historyLimit) history.shift();
            const message = frame(entry);
            for (const res of clients.keys()) write(res, message);
            for (const listener of subscribers) {
                try { listener(entry); } catch (error) { onError(error); }
            }
        },
        subscribe(listener) {
            subscribers.add(listener);
            return () => subscribers.delete(listener);
        },
        connect(req, res) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            });
            res.flushHeaders();
            // Disable local inactivity timeouts for this streaming response only.
            req.socket?.setTimeout(0);
            req.socket?.setKeepAlive(true, 15000);
            const client = { id: randomUUID(), queue: [], pendingBytes: 0, blocked: false,
                cancelExpiry: () => {}, drainTimer: undefined };
            client.drain = () => {
                clearTimeout(client.drainTimer);
                client.blocked = false;
                while (client.queue.length && !client.blocked && clients.has(res)) {
                    const data = client.queue.shift();
                    client.pendingBytes -= Buffer.byteLength(data);
                    if (!send(res, data)) break;
                }
            };
            clients.set(res, client);
            res.on('drain', client.drain);
            res.on('close', () => closeClient(res, 'connection closed'));
            res.on('error', () => stop(res, 'response error'));
            client.cancelExpiry = expireAt(req.user?.exp, () => {
                // Control event has no ID: it must not advance the replay cursor.
                write(res, 'event: session:expired\ndata: {"message":"Sign in again, then reconnect."}\n\n');
                closeClient(res, 'session expired');
                res.end();
            });
            onDiagnostic({ transport: 'sse', event: 'connected', connection_id: client.id });
            if (!write(res, 'retry: 3000\n\n')) return;
            const cursor = req.get('Last-Event-ID') || req.query.after;
            if (cursor) {
                const match = typeof cursor === 'string' && cursor.match(/^(.+):(\d+)$/);
                const offset = match ? Number(match[2]) : NaN;
                const earliest = sequence - history.length;
                if (!match || match[1] !== epoch || !Number.isSafeInteger(offset) || offset < earliest || offset > sequence) {
                    if (!write(res, frame({ id: `${epoch}:${sequence}`, event: 'stream:reset',
                        data: { reason: 'Replay unavailable. Reload wishes through GET /api/wishes.' } }))) return;
                } else {
                    for (const entry of history) {
                        if (Number(entry.id.split(':')[1]) > offset && !write(res, frame(entry))) return;
                    }
                }
            }
            if (!write(res, frame({ id: `${epoch}:${sequence}`, event: 'stream:ready', data: { connected: true } }))) return;
        },
        close() {
            clearInterval(heartbeat);
            for (const res of clients.keys()) {
                closeClient(res, 'server shutdown');
                res.end();
            }
            subscribers.clear();
        }
    };
}

function attachWishSockets(server, { service, events, auth, permission, origin, onError = console.error,
    onDiagnostic = () => {}, pingInterval = 10000, pingTimeout = 60000 }) {
    const io = new Server(server, {
        cors: { origin, credentials: true },
        // CORS alone does not restrict WebSocket handshakes.
        allowRequest: (req, callback) => origin(req.headers.origin, (error, allowed) => callback(error, Boolean(allowed))),
        // Match the HTTP JSON limit, including escaped UTF-8/JSON overhead.
        maxHttpBufferSize: 1024 * 1024,
        pingInterval,
        pingTimeout
    });
    io.engine.on('connection_error', error => onDiagnostic({
        transport: 'socket.io', event: 'connection_error', code: error.code, message: error.message
    }));
    const track = socket => {
        onDiagnostic({ transport: 'socket.io', event: 'connected', namespace: socket.nsp.name,
            connection_id: socket.id });
        socket.on('disconnect', reason => onDiagnostic({ transport: 'socket.io', event: 'disconnected',
            namespace: socket.nsp.name, connection_id: socket.id, reason }));
    };
    io.on('connection', socket => {
        track(socket);
        let submitting = false;
        socket.on('wish:create', async (body, acknowledge) => {
            const respond = response => {
                if (typeof acknowledge === 'function') acknowledge(response);
                else socket.emit('wish:result', response);
            };
            if (submitting) return respond({ status: 429, message: 'Wait for your previous submission to finish.' });
            submitting = true;
            try {
                const data = await service.create(body);
                respond({ status: 201, message: 'Wish created.', data });
            } catch (error) {
                if (!error.status) onError(error);
                respond({ status: error.status || 500, message: error.status ? error.message : 'Unable to save wish.' });
            } finally {
                submitting = false;
            }
        });
    });

    // Phone submissions are public; watching all wishes requires the same permission as HTTP reads.
    const live = io.of('/wishes/live');
    live.use((socket, next) => {
        // Namespace credentials must not mutate a shared Engine.IO request.
        const req = { headers: { ...socket.request.headers } };
        req.header = name => req.headers[name.toLowerCase()];
        if (typeof socket.handshake.auth?.token === 'string') {
            req.headers.authorization = `Bearer ${socket.handshake.auth.token}`;
        }
        const response = {
            status(code) { this.code = code; return this; },
            json(body) { next(Object.assign(new Error(body.message), { data: { status: this.code } })); }
        };
        cookieParser()(req, response, () => auth(req, response, () => permission('read_wishes')(req, response, () => {
            socket.data.user = req.user;
            next();
        })));
    });
    live.on('connection', socket => {
        track(socket);
        const cancelExpiry = expireAt(socket.data.user?.exp, () => {
            socket.emit('session:expired', { message: 'Sign in again, then reconnect.' });
            // Close only this namespace; the public phone socket may share the transport.
            socket.disconnect();
        });
        socket.on('disconnect', cancelExpiry);
    });
    const unsubscribe = events.subscribe(({ id, event, data }) => live.emit(event, { event_id: id, data }));
    io.engine.on('close', unsubscribe);
    return io;
}

module.exports = { createWishEvents, attachWishSockets };
