/**
 * Item 6: running it. `npm start` starts the hub, the compose file builds
 * from a Dockerfile that exists, and TLS is used only when SSL_KEY and
 * SSL_CERT both name real files; otherwise the hub serves HTTP and warns.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const { ROOT, startRedis, startHub, connectUnit, freePort, randomId } = require('./helpers/hub');

let redis;
before(async () => {
    redis = await startRedis();
});
after(async () => {
    await redis?.stop();
});

const hasOpenssl = (() => {
    try {
        execFileSync('openssl', ['version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

/** A throwaway self-signed key and certificate for 127.0.0.1 */
const selfSigned = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeshub-test-tls-'));
    const key = path.join(dir, 'key.pem');
    const cert = path.join(dir, 'cert.pem');
    execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-subj', '/CN=127.0.0.1', '-keyout', key, '-out', cert,
    ], { stdio: 'ignore' });
    return { dir, key, cert };
};

test('npm start starts the hub', async () => {
    const h = await startHub({ redis, command: ['npm', 'start'] });
    try {
        (await connectUnit(h, `unit-${randomId()}`)).close();
    } finally {
        await h.stop();
    }
});

test("the compose file builds from Dockerfiles that exist", () => {
    const compose = YAML.parse(fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8'));
    const builds = [compose['x-node']?.build, ...Object.values(compose.services ?? {}).map(s => s.build)]
        .filter(b => b && typeof b === 'object');
    assert.ok(builds.length > 0, 'no build sections');
    for (const build of builds) {
        const dockerfile = path.join(ROOT, build.context ?? '.', build.dockerfile ?? 'Dockerfile');
        assert.ok(fs.existsSync(dockerfile), `${build.dockerfile} does not exist`);
    }
});

describe('TLS', () => {
    const plainHttp = async (env, warning) => {
        const h = await startHub({ redis, env });
        try {
            (await connectUnit(h, `unit-${randomId()}`)).close();
            assert.match(h.output(), warning);
        } finally {
            await h.stop();
        }
    };

    test('SSL_KEY and SSL_CERT naming missing files: HTTP and a warning, not a crash', () =>
        plainHttp({ SSL_KEY: '/nonexistent/privkey.pem', SSL_CERT: '/nonexistent/fullchain.pem', HTTPS_PORT: undefined },
            /WARNING.*SSL.*plain HTTP/i));

    test('only one of them set: HTTP and a warning', { skip: !hasOpenssl && 'needs openssl' }, async () => {
        const tls = selfSigned();
        try {
            await plainHttp({ SSL_KEY: tls.key, SSL_CERT: undefined }, /WARNING.*SSL_CERT.*plain HTTP/i);
        } finally {
            fs.rmSync(tls.dir, { recursive: true, force: true });
        }
    });

    test('files that hold no key or certificate: HTTP and a warning', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeshub-test-tls-'));
        const junk = path.join(dir, 'junk.pem');
        fs.writeFileSync(junk, 'not a pem file\n');
        try {
            await plainHttp({ SSL_KEY: junk, SSL_CERT: junk }, /WARNING.*SSL.*plain HTTP/i);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('both empty, as Lifegrid sets them: HTTP and a warning', () =>
        plainHttp({ SSL_KEY: '', SSL_CERT: '' }, /WARNING.*SSL.*plain HTTP/i));

    test('both naming real files: the socket and HTTPS ports speak TLS', { skip: !hasOpenssl && 'needs openssl' }, async () => {
        const tls = selfSigned();
        const httpsPort = await freePort();
        const h = await startHub({ redis, env: { SSL_KEY: tls.key, SSL_CERT: tls.cert, HTTPS_PORT: httpsPort } });
        try {
            const secure = { ...h, socketUrl: `https://127.0.0.1:${h.socketPort}` };
            (await connectUnit(secure, `unit-${randomId()}`, { rejectUnauthorized: false })).close();

            const status = await new Promise((resolve, reject) => https
                .get(`https://127.0.0.1:${httpsPort}/`, { rejectUnauthorized: false }, res => {
                    res.resume();
                    resolve(res.statusCode);
                })
                .on('error', reject));
            assert.equal(status, 200);
        } finally {
            await h.stop();
            fs.rmSync(tls.dir, { recursive: true, force: true });
        }
    });
});
