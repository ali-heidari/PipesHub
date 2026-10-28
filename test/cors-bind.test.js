/**
 * Item 3: allowed browser origins come from CORS_ORIGINS (default: same
 * origin only), and the listen address from BIND_ADDR (default 0.0.0.0).
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { startRedis, startHub, requestToken, getToken, connectUnit, randomId } = require('./helpers/hub');

const EVIL = 'http://evil.example';
const GOOD = 'http://good.example';

let redis, hub, listed;
before(async () => {
    redis = await startRedis();
    [hub, listed] = await Promise.all([
        startHub({ redis }),
        startHub({ redis, env: { CORS_ORIGINS: `${GOOD}, http://other.example` } }),
    ]);
});
after(async () => {
    await hub?.stop();
    await listed?.stop();
    await redis?.stop();
});

const preflight = (h, origin) => fetch(`${h.httpUrl}/auth`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
});

const allowOrigin = res => res.headers.get('access-control-allow-origin');

/** Connect as a browser on `origin` would: the Origin header on the handshake */
const connectFrom = async (h, origin, transport = 'websocket') => {
    const name = `tab-${randomId()}`;
    return connectUnit(h, name, {
        token: await getToken(h, name),
        transports: [transport],
        extraHeaders: origin ? { Origin: origin } : {},
    });
};

const expectRefused = async connecting => {
    let unit;
    try {
        unit = await connecting;
    } catch {
        return;
    }
    unit.close();
    assert.fail('the hub let the socket in');
};

describe('POST /auth CORS', () => {
    test('by default another origin gets no CORS header', async () => {
        const res = await requestToken(hub, { name: `tab-${randomId()}` }, { Origin: EVIL });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        assert.equal(allowOrigin(await preflight(hub, EVIL)), null);
    });

    test('CORS_ORIGINS lists the origins that may read the token', async () => {
        const good = await requestToken(listed, { name: `tab-${randomId()}` }, { Origin: GOOD });
        assert.equal(good.headers.get('access-control-allow-origin'), GOOD);
        assert.equal(allowOrigin(await preflight(listed, GOOD)), GOOD);

        const evil = await requestToken(listed, { name: `tab-${randomId()}` }, { Origin: EVIL });
        assert.equal(evil.headers.get('access-control-allow-origin'), null);
        assert.equal(allowOrigin(await preflight(listed, EVIL)), null);
    });

    test('CORS_ORIGINS=* allows any origin, as before', async () => {
        const h = await startHub({ redis, env: { CORS_ORIGINS: '*' } });
        try {
            const res = await requestToken(h, { name: `tab-${randomId()}` }, { Origin: EVIL });
            assert.ok([EVIL, '*'].includes(res.headers.get('access-control-allow-origin')));
            (await connectFrom(h, EVIL)).close();
        } finally {
            await h.stop();
        }
    });
});

describe('Socket.io origins', () => {
    test('by default a browser socket from another origin is refused', async () => {
        await expectRefused(connectFrom(hub, EVIL, 'websocket'));
        await expectRefused(connectFrom(hub, EVIL, 'polling'));
    });

    test('a socket from a listed origin is let in, and one from another is not', async () => {
        (await connectFrom(listed, GOOD, 'websocket')).close();
        (await connectFrom(listed, GOOD, 'polling')).close();
        await expectRefused(connectFrom(listed, EVIL, 'websocket'));
    });

    test('a client without an Origin header (a server) is let in', async () => {
        (await connectFrom(hub, null)).close();
        (await connectFrom(listed, null)).close();
    });
});

describe('BIND_ADDR', () => {
    const reachable = (port, host) => new Promise(resolve => {
        const socket = net.connect(port, host);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
    });

    test('sets the address every port listens on', { skip: process.platform !== 'linux' && 'needs 127.0.0.2' }, async () => {
        const h = await startHub({ redis, env: { BIND_ADDR: '127.0.0.2' }, host: '127.0.0.2' });
        try {
            assert.equal(await reachable(h.port, '127.0.0.2'), true);
            assert.equal(await reachable(h.socketPort, '127.0.0.2'), true);
            assert.equal(await reachable(h.port, '127.0.0.1'), false);
            assert.equal(await reachable(h.socketPort, '127.0.0.1'), false);
            (await connectUnit(h, `unit-${randomId()}`)).close();
        } finally {
            await h.stop();
        }
    });

    test('defaults to every network (0.0.0.0)', { skip: process.platform !== 'linux' && 'needs 127.0.0.2' }, async () => {
        const h = await startHub({ redis, env: { BIND_ADDR: undefined } });
        try {
            assert.equal(await reachable(h.port, '127.0.0.2'), true);
            assert.equal(await reachable(h.socketPort, '127.0.0.2'), true);
            assert.match(h.output(), /0\.0\.0\.0/);
        } finally {
            await h.stop();
        }
    });
});
