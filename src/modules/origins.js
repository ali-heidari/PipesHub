/**
 * Browser origins allowed to call the hub
 *
 * CORS_ORIGINS  comma-separated origins, e.g. http://localhost:8080, or *
 *               for any. Unset: same origin only.
 */
const log = require('./logger');

const list = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const any = list.includes('*');
const listed = new Set(list.map(o => o.replace(/\/+$/, '')));

if (any) log.l('WARNING: CORS_ORIGINS is *; any web page may call the hub.');

/**
 * Whether a cross-origin request from `origin` is allowed
 */
const allowed = origin => any || (typeof origin === 'string' && listed.has(origin));

/**
 * Whether `origin` is the origin the request was sent to
 */
const sameOrigin = (origin, host) => {
    try {
        return typeof host === 'string' && new URL(origin).host === host;
    } catch {
        return false;
    }
};

/**
 * Origin option for the cors package and Socket.io: CORS headers only for
 * allowed origins
 */
const corsOrigin = (origin, callback) => callback(null, allowed(origin));

/**
 * Engine.io allowRequest: refuse a handshake whose Origin header (sent by
 * browsers, also on WebSocket) is neither allowed nor the hub's own.
 * Clients that send no Origin, such as servers, are let in.
 */
const allowRequest = (req, callback) => {
    const origin = req.headers.origin;
    if (!origin || allowed(origin) || sameOrigin(origin, req.headers.host)) return callback(null, true);
    log.l(`Refused a socket from origin ${origin}.`);
    callback('Origin not allowed', false);
};

module.exports = { allowed, sameOrigin, corsOrigin, allowRequest };
