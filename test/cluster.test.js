/**
 * Item 4: two hub processes sharing one Redis behave as one hub. A message
 * reaches a unit on the other node, and the one-socket-per-name rule holds
 * across nodes.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startRedis, startHub, getToken, connectUnit, randomId } = require('./helpers/hub');

let redis, nodeA, nodeB;
before(async () => {
    redis = await startRedis();
    const env = { JWT_SECRET: `cluster-secret-${randomId(32)}` };
    [nodeA, nodeB] = await Promise.all([startHub({ redis, env }), startHub({ redis, env })]);
});
after(async () => {
    await nodeA?.stop();
    await nodeB?.stop();
    await redis?.stop();
});

const expectRefused = async (connecting, pattern) => {
    let unit;
    try {
        unit = await connecting;
    } catch (err) {
        assert.match(err.message, pattern);
        return;
    }
    unit.close();
    assert.fail(`the hub let a second ${unit.name} in`);
};

test('a token from one node works on the other', async () => {
    const name = `unit-${randomId()}`;
    (await connectUnit(nodeB, name, { token: await getToken(nodeA, name) })).close();
});

test('an ask reaches a unit on the other node, and the reply comes back', async () => {
    const tab = await connectUnit(nodeA, `tab-${randomId()}`);
    const world = (await connectUnit(nodeB, `world-${randomId()}`)).serve(({ input }) => input.a + input.b);
    try {
        const reply = await tab.ask(world.name, 'SUM', { a: 2, b: 40 });
        assert.equal(reply.res, 42);
        assert.equal(reply.senderId, tab.name);

        const replies = await Promise.all(Array.from({ length: 20 }, (_, i) => tab.ask(world.name, 'SUM', { a: i, b: 1 })));
        assert.deepEqual(replies.map(r => r.res), Array.from({ length: 20 }, (_, i) => i + 1));
    } finally {
        tab.close();
        world.close();
    }
});

test('a request reaches a unit on the other node, in order', async () => {
    const world = await connectUnit(nodeA, `world-${randomId()}`);
    const tab = await connectUnit(nodeB, `tab-${randomId()}`);
    try {
        for (let n = 0; n < 5; n++) world.request(tab.name, 'VIEW', { n });
        await tab.waitFor('gateway', d => d?.input?.n === 4);
        assert.deepEqual(tab.messages().map(m => m.input.n), [0, 1, 2, 3, 4]);
    } finally {
        world.close();
        tab.close();
    }
});

test('a live unit on one node cannot be taken by a socket on the other', async () => {
    const name = `world-${randomId()}`;
    const live = await connectUnit(nodeB, name);
    try {
        await expectRefused(connectUnit(nodeA, name), /in use/i);
        assert.equal(live.socket.connected, true);
    } finally {
        live.close();
    }
});

test('a same-token takeover from the other node tells and drops the old socket', async () => {
    const name = `tab-${randomId()}`;
    const token = await getToken(nodeA, name);
    const old = await connectUnit(nodeA, name, { token });
    const fresh = await connectUnit(nodeB, name, { token });
    try {
        assert.match(await old.waitFor('gateway', d => typeof d === 'string'), /taken over/i);
        await old.waitFor('disconnect');
    } finally {
        old.close();
        fresh.close();
    }
});
