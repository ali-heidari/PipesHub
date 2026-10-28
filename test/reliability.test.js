/**
 * Item 5: no message is lost without a word. Early messages wait for
 * registration, a unit's entry goes when it disconnects, a message for an
 * unknown or gone unit gets an error with its correlationId, units can
 * subscribe to presence, and MAX_HTTP_BUFFER_SIZE sets the size limit.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('redis');
const { startRedis, startHub, getToken, connectUnit, openSocket, Unit, randomId, sleep } = require('./helpers/hub');

let redis, hub, other, store;
before(async () => {
    redis = await startRedis();
    const env = { JWT_SECRET: `reliability-secret-${randomId(32)}` };
    [hub, other] = await Promise.all([startHub({ redis, env }), startHub({ redis, env })]);
    store = createClient({ url: redis.url });
    await store.connect();
});
after(async () => {
    await store?.quit();
    await hub?.stop();
    await other?.stop();
    await redis?.stop();
});

const until = async (check, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
        if (Date.now() > deadline) return false;
        await sleep(25);
    }
    return true;
};

const exitWithin = (h, ms) => Promise.race([h.exited, sleep(ms).then(() => null)]);

/** Subscribe to presence and resolve with the hub's ack */
const subscribe = (unit, units) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${unit.name}: no ack for subscribePresence`)), 3000);
    unit.socket.emit('subscribePresence', units, ack => {
        clearTimeout(timer);
        resolve(ack);
    });
});

test('messages sent before the hub has registered the sender are delivered, in order', async () => {
    const b = await connectUnit(hub, `b-${randomId()}`);
    const name = `a-${randomId()}`;
    const token = await getToken(hub, name);
    // Hold every Redis write, so the hub cannot finish registering `a` yet.
    await store.sendCommand(['CLIENT', 'PAUSE', '700', 'WRITE']);
    const a = new Unit(openSocket(hub, { token, name }), name);
    try {
        for (let n = 0; n < 5; n++) a.request(b.name, 'EARLY', { n });
        await b.waitFor('gateway', d => d?.input?.n === 4, 4000);
        assert.deepEqual(b.messages().map(m => m.input.n), [0, 1, 2, 3, 4]);
        await a.waitFor('gateway', d => d === 200);
    } finally {
        a.close();
        b.close();
    }
});

test("a unit's Redis entry is removed when it disconnects", async () => {
    const a = await connectUnit(hub, `a-${randomId()}`);
    assert.equal(await store.exists(`unit:${a.name}`), 1);
    a.close();
    assert.ok(await until(async () => await store.exists(`unit:${a.name}`) === 0), 'entry still there');
});

describe('gatewayError', () => {
    test('a message to an unknown unit gets an error with its correlationId', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const nobody = `nobody-${randomId()}`;
        try {
            a.ask(nobody, 'HELLO', {}, { correlationId: 'corr-unknown' }).catch(() => {});
            const err = await a.waitFor('gatewayError');
            assert.deepEqual(err, {
                code: 'UNIT_NOT_FOUND',
                message: 'No unit found with given name.',
                event: 'gateway',
                receiverId: nobody,
                operation: 'HELLO',
                correlationId: 'corr-unknown',
            });
            // The plain-text notice older clients read is still sent.
            assert.deepEqual(a.notices(), ['No unit found with given name.']);
        } finally {
            a.close();
        }
    });

    test('a message to a unit that has disconnected gets an error, not silence', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const gone = await connectUnit(hub, `world-${randomId()}`);
        try {
            gone.close();
            await sleep(100);
            a.ask(gone.name, 'HELLO', {}, { correlationId: 'corr-gone' }).catch(() => {});
            const err = await a.waitFor('gatewayError');
            assert.equal(err.code, 'UNIT_NOT_FOUND');
            assert.equal(err.correlationId, 'corr-gone');
        } finally {
            a.close();
        }
    });

    test('a message to a unit gone from another node gets an error', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const gone = await connectUnit(other, `world-${randomId()}`);
        try {
            gone.close();
            await sleep(100);
            a.request(gone.name, 'PING', { correlationId: 'corr-remote' });
            const err = await a.waitFor('gatewayError');
            assert.equal(err.receiverId, gone.name);
            assert.equal(err.correlationId, 'corr-remote');
        } finally {
            a.close();
        }
    });

    test('a reply to an asker that has gone gets an error for the unit that answered', async () => {
        const asker = await connectUnit(hub, `tab-${randomId()}`);
        const world = await connectUnit(hub, `world-${randomId()}`);
        try {
            asker.ask(world.name, 'SLOW', {}, { correlationId: 'corr-reply' }).catch(() => {});
            const envelope = await world.waitFor('gateway', d => d?.operation === 'SLOW');
            asker.close();
            await sleep(100);
            world.socket.emit('responseGateway', { ...envelope, res: 'late' });
            const err = await world.waitFor('gatewayError');
            assert.equal(err.event, 'responseGateway');
            assert.equal(err.receiverId, asker.name);
            assert.equal(err.correlationId, 'corr-reply');
        } finally {
            world.close();
        }
    });
});

describe('presence', () => {
    test('a subscriber learns that a unit went offline, and which units are online', async () => {
        const world = await connectUnit(hub, `world-${randomId()}`);
        const tab = await connectUnit(other, `tab-${randomId()}`);
        try {
            const ack = await subscribe(world, [tab.name, 'nobody']);
            assert.deepEqual(ack, { ok: true, online: [tab.name] });
            tab.close();
            // The tab's 'online' may still be on its way from the other node.
            const event = await world.waitFor('presence', p => p?.unit === tab.name && p.status === 'offline');
            assert.equal(typeof event.at, 'string');
        } finally {
            world.close();
        }
    });

    test("'*' subscribes to every unit, online and offline", async () => {
        const world = await connectUnit(hub, `world-${randomId()}`);
        try {
            assert.deepEqual(await subscribe(world, '*'), { ok: true });
            const tab = await connectUnit(other, `tab-${randomId()}`);
            assert.equal((await world.waitFor('presence', p => p?.unit === tab.name && p.status === 'online')).status, 'online');
            tab.close();
            await world.waitFor('presence', p => p?.unit === tab.name && p.status === 'offline');
        } finally {
            world.close();
        }
    });

    test('a takeover is not reported as offline', async () => {
        const world = await connectUnit(hub, `world-${randomId()}`);
        const name = `tab-${randomId()}`;
        const token = await getToken(hub, name);
        const old = await connectUnit(hub, name, { token });
        try {
            await subscribe(world, [name]);
            const fresh = await connectUnit(other, name, { token });
            await old.waitFor('disconnect');
            await sleep(200);
            assert.deepEqual(world.all('presence', p => p?.status === 'offline'), []);
            fresh.close();
            await world.waitFor('presence', p => p?.unit === name && p.status === 'offline');
        } finally {
            old.close();
            world.close();
        }
    });

    test('a unit that did not subscribe gets no presence events', async () => {
        const world = await connectUnit(hub, `world-${randomId()}`);
        const tab = await connectUnit(hub, `tab-${randomId()}`);
        tab.close();
        await sleep(300);
        assert.deepEqual(world.all('presence'), []);
        world.close();
    });

    test('a bad subscription is refused in the ack', async () => {
        const world = await connectUnit(hub, `world-${randomId()}`);
        try {
            assert.equal((await subscribe(world, { not: 'a list' })).ok, false);
        } finally {
            world.close();
        }
    });
});

describe('message size', () => {
    const big = { blob: 'x'.repeat(1_500_000) };

    test('by default a message over 1 MB closes the connection', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const b = await connectUnit(hub, `b-${randomId()}`);
        try {
            a.request(b.name, 'BIG', big);
            await a.waitFor('disconnect');
        } finally {
            a.close();
            b.close();
        }
    });

    test('MAX_HTTP_BUFFER_SIZE raises the limit', async () => {
        const h = await startHub({ redis, env: { MAX_HTTP_BUFFER_SIZE: 3_000_000 } });
        try {
            const a = await connectUnit(h, `a-${randomId()}`);
            const b = await connectUnit(h, `b-${randomId()}`);
            try {
                a.request(b.name, 'BIG', big);
                const msg = await b.waitFor('gateway', d => d?.operation === 'BIG', 5000);
                assert.equal(msg.input.blob.length, big.blob.length);
                assert.equal(a.socket.connected, true);
            } finally {
                a.close();
                b.close();
            }
        } finally {
            await h.stop();
        }
    });

    test('a MAX_HTTP_BUFFER_SIZE that is not a number stops the hub from starting', async () => {
        const h = await startHub({ redis, env: { MAX_HTTP_BUFFER_SIZE: 'lots' }, wait: false });
        try {
            const result = await exitWithin(h, 15000);
            assert.ok(result, 'the hub kept running');
            assert.notEqual(result.code, 0);
            assert.match(h.output(), /MAX_HTTP_BUFFER_SIZE/);
        } finally {
            await h.stop();
        }
    });
});
