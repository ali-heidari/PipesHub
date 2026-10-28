/**
 * Item 1: identity. The unit name and senderId come from a verified token,
 * tokens expire, the hub needs a real JWT_SECRET, and POST /auth can be
 * closed with a registration secret.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { JWT } = require('jose');
const { startRedis, startHub, requestToken, getToken, decodeJwt, connectUnit, randomId, sleep } = require('./helpers/hub');

let redis, hub;
before(async () => {
    redis = await startRedis();
    hub = await startHub({ redis });
});
after(async () => {
    await hub?.stop();
    await redis?.stop();
});

/** Assert the hub refuses the socket; close it if it was let in. */
const expectRefused = async (connecting, pattern) => {
    let unit;
    try {
        unit = await connecting;
    } catch (err) {
        assert.match(err.message, pattern);
        return err;
    }
    unit.close();
    assert.fail(`the hub let ${unit.name} in`);
};

/** Resolve with the exit of a hub that should stop on its own, or null. */
const exitWithin = (h, ms) => Promise.race([h.exited, sleep(ms).then(() => null)]);

describe('unit name', () => {
    test('comes from the token: a socket whose query name differs is refused', async () => {
        const alice = `alice-${randomId()}`;
        const bob = `bob-${randomId()}`;
        const token = await getToken(hub, alice);
        await expectRefused(connectUnit(hub, bob, { token }), /does not match/i);

        const c = await connectUnit(hub, `c-${randomId()}`);
        try {
            c.request(bob, 'PING');
            assert.equal(await c.waitFor('gateway', d => typeof d === 'string'), 'No unit found with given name.');
        } finally {
            c.close();
        }
    });

    test('a socket with no query name registers under the token name', async () => {
        const alice = `alice-${randomId()}`;
        const token = await getToken(hub, alice);
        const a = await connectUnit(hub, alice, { token, query: {} });
        const b = await connectUnit(hub, `b-${randomId()}`);
        try {
            b.request(alice, 'PING');
            const msg = await a.waitFor('gateway', d => d?.operation === 'PING');
            assert.equal(msg.receiverId, alice);
        } finally {
            a.close();
            b.close();
        }
    });
});

describe('senderId', () => {
    test('is set by the hub, whatever the sender claims', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const b = await connectUnit(hub, `b-${randomId()}`);
        try {
            a.request(b.name, 'PING', {}, 'mallory');
            const msg = await b.waitFor('gateway', d => d?.operation === 'PING');
            assert.equal(msg.senderId, a.name);
        } finally {
            a.close();
            b.close();
        }
    });

    test('a reply goes to the real sender, not to the unit it claimed to be', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const b = (await connectUnit(hub, `b-${randomId()}`)).serve(() => 'pong');
        const victim = await connectUnit(hub, `victim-${randomId()}`);
        try {
            const reply = await a.ask(b.name, 'PING', {}, { senderId: victim.name });
            assert.equal(reply.res, 'pong');
            await sleep(100);
            assert.deepEqual(victim.all('responseGateway'), []);
        } finally {
            a.close();
            b.close();
            victim.close();
        }
    });

    test('a reply names the unit that really answered as receiverId', async () => {
        const a = await connectUnit(hub, `a-${randomId()}`);
        const b = await connectUnit(hub, `b-${randomId()}`);
        b.socket.on('gateway', data => {
            if (data?.awaiting) b.socket.emit('responseGateway', { ...data, receiverId: 'mallory', res: 'pong' });
        });
        try {
            const reply = await a.ask(b.name, 'PING');
            assert.equal(reply.receiverId, b.name);
            assert.equal(reply.res, 'pong');
        } finally {
            a.close();
            b.close();
        }
    });
});

test('a payload that is not an object does not crash the hub', async () => {
    const h = await startHub({ redis });
    try {
        const a = await connectUnit(h, `a-${randomId()}`);
        const b = (await connectUnit(h, `b-${randomId()}`)).serve(() => 'still here');
        try {
            for (const bad of [null, undefined, 'text', 42, true, []]) {
                a.socket.emit('gateway', bad);
                a.socket.emit('responseGateway', bad);
            }
            await sleep(300);
            assert.equal(h.proc.exitCode, null, h.output());
            assert.equal((await a.ask(b.name, 'PING')).res, 'still here');
        } finally {
            a.close();
            b.close();
        }
    } finally {
        await h.stop();
    }
});

describe('token lifetime', () => {
    test('a token names its unit in sub, has a jti, and lasts 24 h by default', async () => {
        const name = `unit-${randomId()}`;
        const claims = decodeJwt(await getToken(hub, name));
        assert.equal(claims.sub, name);
        assert.equal(typeof claims.jti, 'string');
        assert.equal(claims.exp - claims.iat, 24 * 60 * 60);
    });

    test('TOKEN_TTL sets the lifetime, and an expired token is refused', async () => {
        const h = await startHub({ redis, env: { TOKEN_TTL: 1 } });
        try {
            const name = `unit-${randomId()}`;
            const token = await getToken(h, name);
            const claims = decodeJwt(token);
            assert.equal(claims.exp - claims.iat, 1);
            await sleep(2100);
            await expectRefused(connectUnit(h, name, { token }), /token/i);
        } finally {
            await h.stop();
        }
    });

    test('a token without an expiry, as the hub used to issue, is refused', async () => {
        const name = `unit-${randomId()}`;
        const legacy = JWT.sign({ aid: 'some-key' }, Buffer.from(hub.env.JWT_SECRET), {
            algorithm: 'HS256', audience: name, issuer: 'localhost',
        });
        await expectRefused(connectUnit(hub, name, { token: legacy }), /token/i);
    });

    test('TOKEN_TTL=0 issues tokens that do not expire', async () => {
        const h = await startHub({ redis, env: { TOKEN_TTL: 0 } });
        try {
            const name = `unit-${randomId()}`;
            const token = await getToken(h, name);
            assert.equal(decodeJwt(token).exp, undefined);
            (await connectUnit(h, name, { token })).close();
        } finally {
            await h.stop();
        }
    });

    test('a token signed with another secret is refused', async () => {
        const name = `unit-${randomId()}`;
        const forged = JWT.sign({}, Buffer.from('not-the-secret'), {
            algorithm: 'HS256', subject: name, jti: randomId(), expiresIn: '1 h',
        });
        await expectRefused(connectUnit(hub, name, { token: forged }), /token/i);
    });
});

describe('JWT_SECRET', () => {
    test('the hub refuses to start without it', async () => {
        const h = await startHub({ redis, env: { JWT_SECRET: undefined, NODE_ENV: undefined }, wait: false });
        try {
            const result = await exitWithin(h, 15000);
            assert.ok(result, 'the hub kept running');
            assert.notEqual(result.code, 0);
            assert.match(h.output(), /JWT_SECRET/);
        } finally {
            await h.stop();
        }
    });

    test('the hub refuses to start with the old public default', async () => {
        const h = await startHub({ redis, env: { JWT_SECRET: 'pipeshub-default-secret', NODE_ENV: 'production' }, wait: false });
        try {
            const result = await exitWithin(h, 15000);
            assert.ok(result, 'the hub kept running');
            assert.notEqual(result.code, 0);
            assert.match(h.output(), /JWT_SECRET/);
        } finally {
            await h.stop();
        }
    });

    test('NODE_ENV=development starts without it and warns', async () => {
        const h = await startHub({ redis, env: { JWT_SECRET: undefined, NODE_ENV: 'development' } });
        try {
            (await connectUnit(h, `unit-${randomId()}`)).close();
            assert.match(h.output(), /JWT_SECRET/);
        } finally {
            await h.stop();
        }
    });
});

describe('POST /auth', () => {
    test('without AUTH_SECRET any name still gets a token', async () => {
        const res = await requestToken(hub, { name: `world-region-${randomId()}` });
        assert.equal(res.status, 200);
        assert.equal(decodeJwt(res.body).verified, undefined);
    });

    test('the name must be one string', async () => {
        const res = await requestToken(hub, [['name', 'a'], ['name', 'b']]);
        assert.equal(res.status, 400);
    });

    test('with AUTH_SECRET every name needs the secret', async () => {
        const h = await startHub({ redis, env: { AUTH_SECRET: 'registration-secret' } });
        try {
            const name = `unit-${randomId()}`;
            assert.equal((await requestToken(h, { name })).status, 403);
            assert.equal((await requestToken(h, { name, secret: 'wrong' })).status, 403);
            const ok = await requestToken(h, { name, secret: 'registration-secret' });
            assert.equal(ok.status, 200);
            assert.equal(decodeJwt(ok.body).verified, true);
            (await connectUnit(h, name, { token: ok.body })).close();
        } finally {
            await h.stop();
        }
    });

    test('AUTH_PROTECTED_UNITS limits the secret to matching names', async () => {
        const h = await startHub({ redis, env: { AUTH_SECRET: 'registration-secret', AUTH_PROTECTED_UNITS: 'world-region-*, admin' } });
        try {
            assert.equal((await requestToken(h, { name: 'world-region-0' })).status, 403);
            assert.equal((await requestToken(h, { name: 'admin' })).status, 403);
            assert.equal((await requestToken(h, { name: 'administrator' })).status, 200);

            const tab = await requestToken(h, { name: 'owner-1-abc' });
            assert.equal(tab.status, 200);
            assert.equal(decodeJwt(tab.body).verified, undefined);

            const world = await requestToken(h, { name: 'world-region-0', secret: 'registration-secret' });
            assert.equal(world.status, 200);
            assert.equal(decodeJwt(world.body).verified, true);
        } finally {
            await h.stop();
        }
    });

    test('AUTH_PROTECTED_UNITS without AUTH_SECRET stops the hub from starting', async () => {
        const h = await startHub({ redis, env: { AUTH_PROTECTED_UNITS: 'world-*' }, wait: false });
        try {
            const result = await exitWithin(h, 15000);
            assert.ok(result, 'the hub kept running');
            assert.notEqual(result.code, 0);
            assert.match(h.output(), /AUTH_SECRET/);
        } finally {
            await h.stop();
        }
    });
});
