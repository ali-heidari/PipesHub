/**
 * Item 2: a live unit's name cannot be taken by another socket, unless its
 * token proves the same identity: the same token, or one got with the
 * registration secret. The replaced socket is told, and the takeover logged.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('redis');
const { startRedis, startHub, getToken, connectUnit, randomId, sleep } = require('./helpers/hub');

let redis, hub, store;
before(async () => {
    redis = await startRedis();
    hub = await startHub({ redis });
    store = createClient({ url: redis.url });
    await store.connect();
});
after(async () => {
    await store?.quit();
    await hub?.stop();
    await redis?.stop();
});

const expectRefused = async (connecting, pattern) => {
    let unit;
    try {
        unit = await connecting;
    } catch (err) {
        assert.match(err.message, pattern);
        return err;
    }
    unit.close();
    assert.fail(`the hub let a second ${unit.name} in`);
};

const storedSocketId = async name => JSON.parse(await store.get(`unit:${name}`))?.socketId;

test('a second socket with another token is refused while the first is live', async () => {
    const name = `world-${randomId()}`;
    const first = await connectUnit(hub, name);
    const sender = await connectUnit(hub, `tab-${randomId()}`);
    try {
        await expectRefused(connectUnit(hub, name), /in use/i);

        sender.request(name, 'PING', { n: 1 });
        await first.waitFor('gateway', d => d?.input?.n === 1);
        assert.equal(first.socket.connected, true);
        assert.equal(await storedSocketId(name), first.socket.id);
    } finally {
        first.close();
        sender.close();
    }
});

test('the same token may replace its live socket; the old one is told and dropped', async () => {
    const name = `tab-${randomId()}`;
    const token = await getToken(hub, name);
    const old = await connectUnit(hub, name, { token });
    const sender = await connectUnit(hub, `world-${randomId()}`);
    let fresh;
    try {
        fresh = await connectUnit(hub, name, { token });

        assert.match(await old.waitFor('gateway', d => typeof d === 'string'), /taken over/i);
        await old.waitFor('disconnect');

        sender.request(name, 'PING', { n: 2 });
        await fresh.waitFor('gateway', d => d?.input?.n === 2);
        assert.deepEqual(old.messages(), []);
        assert.equal(await storedSocketId(name), fresh.socket.id);
        assert.match(hub.output(), new RegExp(`${name}.*taken over`, 'i'));
    } finally {
        old.close();
        fresh?.close();
        sender.close();
    }
});

test('a token got with AUTH_SECRET may replace a live socket', async () => {
    const h = await startHub({ redis, env: { AUTH_SECRET: 'registration-secret', AUTH_PROTECTED_UNITS: 'world-*' } });
    try {
        const name = `world-${randomId()}`;
        const old = await connectUnit(h, name, { token: await getToken(h, name, { secret: 'registration-secret' }) });
        try {
            const fresh = await connectUnit(h, name, { token: await getToken(h, name, { secret: 'registration-secret' }) });
            assert.match(await old.waitFor('gateway', d => typeof d === 'string'), /taken over/i);
            fresh.close();
        } finally {
            old.close();
        }

        // Without the secret, an unprotected name cannot take a live one either.
        const tab = `tab-${randomId()}`;
        const live = await connectUnit(h, tab);
        try {
            await expectRefused(connectUnit(h, tab), /in use/i);
        } finally {
            live.close();
        }
    } finally {
        await h.stop();
    }
});

test('once the live socket has gone, a new token can take the name', async () => {
    const name = `world-${randomId()}`;
    const first = await connectUnit(hub, name);
    first.close();
    await sleep(200);
    const second = await connectUnit(hub, name);
    second.close();
});

test('sockets racing for a free name: exactly one gets it', async () => {
    const name = `world-${randomId()}`;
    const tokens = await Promise.all(Array.from({ length: 6 }, () => getToken(hub, name)));
    const results = await Promise.allSettled(tokens.map(token => connectUnit(hub, name, { token })));
    const winners = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    try {
        assert.equal(winners.length, 1, results.map(r => r.reason?.message ?? 'connected').join('\n'));
        await sleep(200);
        assert.equal(winners[0].socket.connected, true);
        assert.equal(await storedSocketId(name), winners[0].socket.id);
    } finally {
        for (const w of winners) w.close();
    }
});
