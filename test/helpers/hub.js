/**
 * Test harness: a real redis-server and real hub processes on spare ports,
 * and socket.io clients that speak the same envelope as Lifegrid's clients.
 */
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN = path.join(ROOT, 'src', 'main.js');

// The live deployment uses these ports; a test must never bind or reach them.
const RESERVED_PORTS = new Set([3000, 16916]);

const children = new Set();
process.on('exit', () => {
    for (const child of children) child.kill('SIGKILL');
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const randomId = (length = 12) => crypto.randomBytes(length).toString('hex').slice(0, length);

/**
 * A free TCP port on 127.0.0.1, never one of the reserved ones
 */
const freePort = async () => {
    for (;;) {
        const port = await new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const { port } = server.address();
                server.close(() => resolve(port));
            });
        });
        if (!RESERVED_PORTS.has(port)) return port;
    }
};

const hasExited = proc => proc.exitCode !== null || proc.signalCode !== null;

/**
 * Resolve once something accepts TCP connections on the port
 */
const waitForPort = (port, { host = '127.0.0.1', timeoutMs = 30000, proc } = {}) => {
    if (RESERVED_PORTS.has(port)) throw new Error(`refusing to touch reserved port ${port}`);
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const attempt = () => {
            if (proc && hasExited(proc))
                return reject(new Error(`process exited (${proc.exitCode ?? proc.signalCode}) before port ${port} opened`));
            const socket = net.connect(port, host);
            socket.once('connect', () => {
                socket.destroy();
                resolve();
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() > deadline)
                    return reject(new Error(`port ${port} did not open in ${timeoutMs} ms`));
                setTimeout(attempt, 50);
            });
        };
        attempt();
    });
};

/**
 * Keep a child's output and kill it if the test process exits early
 */
const track = proc => {
    children.add(proc);
    let output = '';
    proc.stdout?.on('data', chunk => { output += chunk; });
    proc.stderr?.on('data', chunk => { output += chunk; });
    const exited = new Promise(resolve => proc.once('exit', (code, signal) => {
        children.delete(proc);
        resolve({ code, signal });
    }));
    return { output: () => output, exited };
};

const stopProcess = async (proc, exited) => {
    if (hasExited(proc)) return;
    proc.kill('SIGTERM');
    const timer = setTimeout(() => proc.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(timer);
};

/**
 * Start a throwaway redis-server. REDIS_SERVER names the binary.
 */
const startRedis = async () => {
    const port = await freePort();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeshub-test-redis-'));
    const bin = process.env.REDIS_SERVER || 'redis-server';
    const proc = spawn(bin, [
        '--port', String(port), '--bind', '127.0.0.1',
        '--save', '', '--appendonly', 'no', '--dir', dir,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const started = new Promise((_, reject) => proc.once('error', err =>
        reject(new Error(`cannot start ${bin} (${err.code}); install Redis or set REDIS_SERVER`))));
    const { exited } = track(proc);
    await Promise.race([waitForPort(port, { proc }), started]);
    return {
        port,
        url: `redis://127.0.0.1:${port}/0`,
        async stop() {
            await stopProcess(proc, exited);
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
};

/**
 * Start `node src/main.js` on spare ports against the given Redis.
 * `env` entries replace the defaults; an undefined value removes the variable.
 * The child never inherits the caller's environment, so it cannot pick up a
 * live REDIS_URL or ports by accident.
 */
const startHub = async ({ redis, env = {}, wait = true, command } = {}) => {
    if (!redis && !env.REDIS_URL) throw new Error('startHub needs a test Redis');
    const port = await freePort();
    const socketPort = await freePort();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeshub-test-hub-'));
    const fullEnv = {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        PORT: String(port),
        SOCKET_PORT: String(socketPort),
        BIND_ADDR: '127.0.0.1',
        JWT_SECRET: `test-secret-${randomId(32)}`,
        REDIS_URL: redis?.url,
    };
    Object.assign(fullEnv, env);
    for (const [key, value] of Object.entries(fullEnv)) {
        if (value === undefined) delete fullEnv[key];
        else fullEnv[key] = String(value);
    }
    for (const key of ['PORT', 'SOCKET_PORT', 'HTTPS_PORT']) {
        if (RESERVED_PORTS.has(Number(fullEnv[key]))) throw new Error(`refusing reserved ${key}=${fullEnv[key]}`);
    }
    const [file, ...args] = command ?? [process.execPath, MAIN];
    const proc = spawn(file, args, { cwd: command ? ROOT : cwd, env: fullEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const { output, exited } = track(proc);
    const hub = {
        port,
        socketPort,
        env: fullEnv,
        proc,
        httpUrl: `http://127.0.0.1:${port}`,
        socketUrl: `http://127.0.0.1:${socketPort}`,
        output,
        exited,
        async stop() {
            await stopProcess(proc, exited);
            fs.rmSync(cwd, { recursive: true, force: true });
        },
    };
    if (wait) {
        try {
            await Promise.all([waitForPort(port, { proc }), waitForPort(socketPort, { proc })]);
        } catch (err) {
            await hub.stop();
            err.message += `\n--- hub output ---\n${output()}`;
            throw err;
        }
    }
    return hub;
};

/**
 * POST /auth with form fields. Resolves to { status, headers, body }.
 */
const requestToken = async (hub, fields, headers = {}) => {
    const res = await fetch(`${hub.httpUrl}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(fields).toString(),
    });
    return { status: res.status, headers: res.headers, body: await res.text() };
};

const getToken = async (hub, name, fields = {}) => {
    const res = await requestToken(hub, { name, ...fields });
    if (res.status !== 200) throw new Error(`POST /auth for ${name}: ${res.status} ${res.body}`);
    return res.body;
};

const decodeJwt = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

/**
 * A socket.io client with the hub's envelope, recording everything it gets
 */
class Unit {
    constructor(socket, name) {
        this.socket = socket;
        this.name = name;
        this.received = [];
        this.waiters = [];
        socket.onAny((event, payload) => this._record(event, payload));
        socket.on('connect_error', err => this._record('connect_error', err));
        socket.on('disconnect', reason => this._record('disconnect', reason));
    }

    _record(event, payload) {
        this.received.push({ event, payload });
        for (const waiter of [...this.waiters]) {
            if (waiter.event === event && waiter.match(payload)) waiter.resolve(payload);
        }
    }

    /**
     * First payload of `event` that matches, including ones already received
     */
    waitFor(event, match = () => true, timeoutMs = 3000) {
        const seen = this.received.find(r => r.event === event && match(r.payload));
        if (seen) return Promise.resolve(seen.payload);
        return new Promise((resolve, reject) => {
            const waiter = { event, match };
            const done = () => this.waiters.splice(this.waiters.indexOf(waiter), 1);
            const timer = setTimeout(() => {
                done();
                reject(new Error(`${this.name}: no matching '${event}' in ${timeoutMs} ms`));
            }, timeoutMs);
            waiter.resolve = payload => {
                clearTimeout(timer);
                done();
                resolve(payload);
            };
            this.waiters.push(waiter);
        });
    }

    all(event, match = () => true) {
        return this.received.filter(r => r.event === event && match(r.payload)).map(r => r.payload);
    }

    /** Envelopes delivered on `gateway` */
    messages() {
        return this.all('gateway', d => d !== null && typeof d === 'object');
    }

    /** Plain `gateway` payloads other than the 200 handshake */
    notices() {
        return this.all('gateway', d => d !== 200 && (d === null || typeof d !== 'object'));
    }

    request(receiverId, operation, input = {}, senderId = this.name) {
        this.socket.emit('gateway', { senderId, receiverId, operation, input, awaiting: false });
    }

    /**
     * Ask the way Lifegrid does: input.correlationId, reply on responseGateway
     */
    ask(receiverId, operation, input = {}, { timeoutMs = 3000, senderId = this.name, correlationId = randomId(16) } = {}) {
        this.socket.emit('gateway', {
            senderId,
            receiverId,
            operation,
            input: { ...input, correlationId },
            awaiting: true,
        });
        return this.waitFor('responseGateway', d => d?.input?.correlationId === correlationId, timeoutMs);
    }

    /** Answer every ask addressed to this unit with handler(envelope) */
    serve(handler) {
        this.socket.on('gateway', data => {
            if (!data || typeof data !== 'object' || data.receiverId !== this.name || !data.awaiting) return;
            this.socket.emit('responseGateway', { ...data, res: handler(data) });
        });
        return this;
    }

    close() {
        this.socket.disconnect();
    }
}

const openSocket = (hub, { token, name, query, ...options } = {}) => io(hub.socketUrl, {
    transports: ['websocket'],
    auth: token === undefined ? undefined : { token },
    query: query ?? (name === undefined ? undefined : { name }),
    reconnection: false,
    forceNew: true,
    ...options,
});

/**
 * Get a token (unless given), connect and wait for the hub's `gateway` 200.
 * Rejects with the connect_error if the hub refuses the socket.
 */
const connectUnit = async (hub, name, { token, timeoutMs = 5000, ...options } = {}) => {
    token ??= await getToken(hub, name);
    const socket = openSocket(hub, { token, name, ...options });
    const unit = new Unit(socket, name);
    unit.token = token;
    await new Promise((resolve, reject) => {
        const onGateway = data => { if (data === 200) done(); };
        const onError = err => done(err);
        const onDisconnect = reason => done(new Error(`${name}: disconnected before gateway 200 (${reason})`));
        const timer = setTimeout(() => done(new Error(`${name}: no gateway 200 in ${timeoutMs} ms`)), timeoutMs);
        function done(err) {
            clearTimeout(timer);
            socket.off('gateway', onGateway);
            socket.off('connect_error', onError);
            socket.off('disconnect', onDisconnect);
            if (err) {
                socket.disconnect();
                reject(err);
            } else resolve();
        }
        socket.on('gateway', onGateway);
        socket.on('connect_error', onError);
        socket.on('disconnect', onDisconnect);
    });
    return unit;
};

module.exports = {
    ROOT,
    RESERVED_PORTS,
    sleep,
    randomId,
    freePort,
    waitForPort,
    startRedis,
    startHub,
    requestToken,
    getToken,
    decodeJwt,
    Unit,
    openSocket,
    connectUnit,
};
