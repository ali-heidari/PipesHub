const jose = require('jose');
const log = require("../modules/logger");

const {
    JWE, // JSON Web Encryption (JWE)
    JWK, // JSON Web Key (JWK)
    JWKS, // JSON Web Key Set (JWKS)
    JWS, // JSON Web Signature (JWS)
    JWT, // JSON Web Token (JWT)
    errors // errors utilized by jose
} = jose;

// Shared secret — must be identical across all nodes.
// Set JWT_SECRET env var; never use the default in production.
const _secret = Buffer.from(process.env.JWT_SECRET || 'pipeshub-default-secret');

const init = async () => { /* no-op: secret comes from env */ }

const sign = (iss, aud) =>
    JWT.sign({
        'aid': 'some-key'
    }, _secret, {
        algorithm: 'HS256',
        audience: aud,
        issuer: iss
    });
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
        return verify(auth, next);
    }

    // The requested route no need for authentication
    next();
};
/**
 * Verify the request. Socket.io middleware
 * 
 * @param {*} socket 
 * @param {*} next 
 */
const verifySocketIO = function (socket, next) {
    const auth = socket.handshake.auth?.token ?? socket.handshake.headers['authorization'];
    return verify(auth, next);
}

const verify = function (auth, next) {
    if (!auth) {
        return next(new Error('No token provided'));
    }

    const jwt = auth.startsWith('bearer ') ? auth.substr(7) : auth;

    if (isValid(jwt)) {
        return next();
    }

    return next(new Error('Invalid token'));
}

const isValid = function (jwt) {
    try {
        JWT.verify(jwt, _secret);
        return true;
    } catch (error) {
        log.e(error);
    }
    return false;
}

/**
 * Exports
 */
exports.init = () => init();
exports.sign = (iss, aud) => sign(iss, aud);
exports.verifyExpress = (req, res, next) => verifyExpress(req, res, next);
exports.verifySocketIO = (socket, next) => verifySocketIO(socket, next);
exports.isValid = (jwt) => isValid(jwt);
exports.exceptions = ['/', '/auth']