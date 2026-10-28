/**
 * What existing clients rely on: the `gateway` 200 handshake, the envelope
 * shapes, `input.correlationId` on replies and the plain-text notice for an
 * unknown unit. Every later change must keep these passing.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { io } = require('socket.io-client');
const { ROOT, startRedis, startHub, requestToken, connectUnit, randomId, sleep } = require('./helpers/hub');

const LIFEGRID_DIR = process.env.LIFEGRID_DIR || path.join(ROOT, '..', '..', 'rust', 'life-grid');
const LIFEGRID_PIPES = path.join(LIFEGRID_DIR, 'web', 'js', 'pipes.js');

let redis, hub;
before(async () => {
    redis = await startRedis();
    hub = await startHub({ redis });
});
after(async () => {
    await hub?.stop();
    await redis?.stop();
});

test('POST /auth answers with a JWT as plain text', async () => {
    const res = await requestToken(hub, { name: `unit-${randomId()}` });
    assert.equal(res.status, 200);
    assert.match(res.body, /^[\w-]+\.[\w-]+\.[\w-]+$/);
});

test('POST /auth without a name is a 400', async () => {
    const res = await requestToken(hub, {});
    assert.equal(res.status, 400);
});

test('the hub says `gateway` 200 (a number) once a unit is registered', async () => {
    const unit = await connectUnit(hub, `unit-${randomId()}`);
    try {
        assert.deepEqual(unit.all('gateway'), [200]);
    } finally {
        unit.close();
    }
});

test('a socket without a token is refused', async () => {
    await assert.rejects(connectUnit(hub, `unit-${randomId()}`, { token: '' }), /token/i);
});

test('ask: the reply comes back on responseGateway with the correlationId', async () => {
    const a = await connectUnit(hub, `a-${randomId()}`);
    const b = await connectUnit(hub, `b-${randomId()}`);
    try {
        b.serve(({ input }) => input.x * 2);
        const reply = await a.ask(b.name, 'DOUBLE', { x: 21 });
        assert.equal(reply.res, 42);
        assert.equal(reply.senderId, a.name);
        assert.equal(reply.receiverId, b.name);
        assert.equal(reply.operation, 'DOUBLE');
        assert.equal(reply.awaiting, true);
        assert.equal(reply.input.x, 21);

        const [delivered] = b.messages();
        assert.deepEqual(Object.keys(delivered).sort(), ['awaiting', 'input', 'operation', 'receiverId', 'senderId']);
    } finally {
        a.close();
        b.close();
    }
});

test('many asks in flight are kept apart by correlationId', async () => {
    const a = await connectUnit(hub, `a-${randomId()}`);
    const b = await connectUnit(hub, `b-${randomId()}`);
    try {
        b.serve(({ input }) => input.a + input.b);
        const replies = await Promise.all(Array.from({ length: 20 }, (_, i) => a.ask(b.name, 'SUM', { a: i, b: 100 })));
        assert.deepEqual(replies.map(r => r.res), Array.from({ length: 20 }, (_, i) => i + 100));
    } finally {
        a.close();
        b.close();
    }
});

test('request: delivered once, in order, with awaiting false', async () => {
    const a = await connectUnit(hub, `a-${randomId()}`);
    const b = await connectUnit(hub, `b-${randomId()}`);
    try {
        for (const text of ['one', 'two', 'three']) a.request(b.name, 'ECHO', { text });
        await b.waitFor('gateway', d => d?.input?.text === 'three');
        await sleep(100);
        assert.deepEqual(b.messages().map(m => [m.operation, m.input.text, m.awaiting, m.senderId]), [
            ['ECHO', 'one', false, a.name],
            ['ECHO', 'two', false, a.name],
            ['ECHO', 'three', false, a.name],
        ]);
    } finally {
        a.close();
        b.close();
    }
});

test('a message to an unknown unit gets the plain-text notice on gateway', async () => {
    const a = await connectUnit(hub, `a-${randomId()}`);
    try {
        a.request(`nobody-${randomId()}`, 'PING', {});
        assert.equal(await a.waitFor('gateway', d => typeof d === 'string'), 'No unit found with given name.');
    } finally {
        a.close();
    }
});

test('Lifegrid web client (pipes.js) works against the hub', {
    skip: !fs.existsSync(LIFEGRID_PIPES) && `no ${LIFEGRID_PIPES}; set LIFEGRID_DIR`,
}, async () => {
    const { createPipe, fetchToken } = await import(pathToFileURL(LIFEGRID_PIPES).href);
    const worldName = `world-${randomId()}`;
    const tabName = `owner-1-${randomId(10)}`;
    const pings = [];
    const notices = [];
    const world = createPipe({
        hubUrl: hub.socketUrl,
        unitName: worldName,
        getToken: () => fetchToken(hub.httpUrl, worldName),
        io,
        socketOptions: { forceNew: true },
        onMessage: ({ operation, input, senderId, reply }) => {
            if (operation === 'SUM') reply(input.a + input.b);
            if (operation === 'PING') pings.push(senderId);
        },
    });
    const tab = createPipe({
        hubUrl: hub.socketUrl,
        unitName: tabName,
        getToken: () => fetchToken(hub.httpUrl, tabName),
        io,
        socketOptions: { forceNew: true },
        onNotice: v => notices.push(v),
    });
    try {
        await world.connect();
        await tab.connect();
        assert.equal(await tab.ask(worldName, 'SUM', { a: 2, b: 3 }), 5);
        const sums = await Promise.all(Array.from({ length: 10 }, (_, i) => tab.ask(worldName, 'SUM', { a: i, b: 1 })));
        assert.deepEqual(sums, Array.from({ length: 10 }, (_, i) => i + 1));

        assert.equal(tab.request(worldName, 'PING', {}), true);
        for (let i = 0; i < 40 && pings.length === 0; i++) await sleep(25);
        assert.deepEqual(pings, [tabName]);

        await assert.rejects(tab.ask(`nobody-${randomId()}`, 'SUM', {}, { timeoutMs: 500 }), e => e.code === 'TIMEOUT');
        assert.ok(notices.includes('No unit found with given name.'), `notices: ${JSON.stringify(notices)}`);
    } finally {
        tab.close();
        world.close();
    }
});
