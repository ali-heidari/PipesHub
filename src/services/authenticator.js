const crypto = require('crypto');
const jose = require('jose');
const log = require("../modules/logger");

const {
    JWT, // JSON Web Token (JWT)
} = jose;

// The hub used to fall back on this secret. It is public, so it is refused.
const PUBLIC_DEFAULT_SECRET = 'pipeshub-default-secret';
const DEFAULT_TOKEN_TTL = 24 * 60 * 60;
const MAX_NAME_LENGTH = 256;

let _secret = null;
let _tokenTtl = DEFAULT_TOKEN_TTL;
let _registrationSecret = null;
let _protectedUnits = [];

/**
 * Read the auth settings from env. Throws if the hub must not start.
 *
 * JWT_SECRET            token secret, the same on every node (required
 *                       unless NODE_ENV=development)
 * TOKEN_TTL             token lifetime in seconds (default 24 h; 0 = never)
 * AUTH_SECRET           registration secret POST /auth asks for
 * AUTH_PROTECTED_UNITS  names that need it: comma-separated, a trailing *
 *                       matches a prefix (default * when AUTH_SECRET is set)
 */
const init = () => {
    const env = process.env;
    const development = env.NODE_ENV === 'development';

    const secret = env.JWT_SECRET;
    if (!development && !secret)
        throw new Error('JWT_SECRET is not set. Set it (the same on every node), or set NODE_ENV=development to use a random one.');
    if (!development && secret === PUBLIC_DEFAULT_SECRET)
        throw new Error('JWT_SECRET is the public default. Set a secret of your own.');
    if (secret) {
        _secret = Buffer.from(secret);
        if (secret.length < 32) log.l('WARNING: JWT_SECRET is shorter than 32 characters.');
    } else {
        // Tokens from this process only work against this process.
        _secret = crypto.randomBytes(32);
        log.l('WARNING: JWT_SECRET is not set; using a random secret because NODE_ENV=development.');
    }

    const ttl = env.TOKEN_TTL ? Number(env.TOKEN_TTL) : DEFAULT_TOKEN_TTL;
    if (!Number.isInteger(ttl) || ttl < 0)
        throw new Error(`TOKEN_TTL must be a whole number of seconds, not "${env.TOKEN_TTL}".`);
    _tokenTtl = ttl;

    _registrationSecret = env.AUTH_SECRET || null;
    _protectedUnits = (env.AUTH_PROTECTED_UNITS || '').split(',').map(p => p.trim()).filter(Boolean);
    if (_protectedUnits.length && !_registrationSecret)
        throw new Error('AUTH_PROTECTED_UNITS is set but AUTH_SECRET is not.');
    if (_registrationSecret && !_protectedUnits.length) _protectedUnits = ['*'];
    if (!_registrationSecret) log.l('WARNING: AUTH_SECRET is not set; POST /auth gives a token for any unit name.');
};

const isProtected = name => _protectedUnits.some(pattern =>
    pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern);

const sameSecret = (given, expected) => {
    if (typeof given !== 'string') return false;
    const hash = s => crypto.createHash('sha256').update(s).digest();
    return crypto.timingSafeEqual(hash(given), hash(expected));
};

/**
 * Sign a token for a unit name, or return null if the name needs the
 * registration secret and `secret` is not it. A token got with the secret
 * carries `verified: true`.
 *
 * @param {String} name Unit name
 * @param {String} secret Registration secret, if the caller sent one
 */
const issue = (name, secret) => {
    const verified = _registrationSecret !== null && sameSecret(secret, _registrationSecret);
    if (!verified && isProtected(name)) return null;
    return JWT.sign(verified ? { verified: true } : {}, _secret, {
        algorithm: 'HS256',
        subject: name,
        audience: name,
        issuer: 'localhost',
        jti: crypto.randomUUID(),
        expiresIn: _tokenTtl ? `${_tokenTtl} s` : undefined,
    });
};

/**
 * Claims of a valid token, or null. A valid token names its unit in `sub`
 * and, unless TOKEN_TTL is 0, expires.
 *
 * @param {String} auth The JWT, optionally prefixed with "Bearer "
 */
const verifyToken = function (auth) {
    if (typeof auth !== 'string' || !auth) return null;
    const jwt = /^bearer /i.test(auth) ? auth.slice(7) : auth;
    try {
        const claims = JWT.verify(jwt, _secret, {
            algorithms: ['HS256'],
            clockTolerance: '1 s',
            maxTokenAge: _tokenTtl ? `${_tokenTtl} s` : undefined,
        });
        if (typeof claims.sub !== 'string' || !claims.sub) return null;
        if (_tokenTtl && typeof claims.exp !== 'number') return null;
        return claims;
    } catch (error) {
        log.l(`Token refused: ${error.message}`);
    }
    return null;
}

/**
 * Verify the request. ExpressJS middleware
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
const verifyExpress = function (req, res, next) {
    if (exports.exceptions.indexOf(req.url) < 0) {
        let auth = req.headers.authorization;
        if (!auth) return next(new Error('No token provided'));
        const claims = verifyToken(auth);
        if (!claims) return next(new Error('Invalid token'));
        req.unit = claims.sub;
    }

    // The requested route no need for authentication
    next();
};
/**
 * Verify the request. Socket.io middleware
 *
 * The unit name comes from the token; a `name` in the query has to match it.
 *
 * @param {*} socket
 * @param {*} next
 */
const verifySocketIO = function (socket, next) {
    const auth = socket.handshake.auth?.token ?? socket.handshake.headers['authorization'];
    if (!auth) return next(new Error('No token provided'));

    const claims = verifyToken(auth);
    if (!claims) return next(new Error('Invalid token'));

    const asked = socket.handshake.query?.name;
    if (asked !== undefined && asked !== claims.sub)
        return next(new Error('Unit name does not match the token'));

    socket.data.unit = claims.sub;
    socket.data.tokenId = claims.jti;
    socket.data.verified = claims.verified === true;
    next();
}

/**
 * Exports
 */
exports.init = () => init();
exports.issue = (name, secret) => issue(name, secret);
exports.verifyToken = (auth) => verifyToken(auth);
exports.verifyExpress = (req, res, next) => verifyExpress(req, res, next);
exports.verifySocketIO = (socket, next) => verifySocketIO(socket, next);
exports.isValid = (jwt) => verifyToken(jwt) !== null;
exports.MAX_NAME_LENGTH = MAX_NAME_LENGTH;
exports.exceptions = ['/', '/auth']
