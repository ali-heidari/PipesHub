const jose = require('jose');
const log = require("./logger");

const {
    JWE, // JSON Web Encryption (JWE)
    JWK, // JSON Web Key (JWK)
    JWKS, // JSON Web Key Set (JWKS)
    JWS, // JSON Web Signature (JWS)
    JWT, // JSON Web Token (JWT)
    errors // errors utilized by jose
} = jose;

let privateKey, publicKey;
/**
 * Generate private and public key
 */
const init = async () => {
    privateKey = await JWK.generate("RSA", 2048, {
        use: 'sig'
    });
    let jwk = privateKey.toJWK();
    publicKey = JWK.asKey(jwk);
}
/**
 * Sign the token
 */
const sign = (iss, aud) =>
    JWT.sign({
        'aid': 'some-key'
    }, privateKey, {
        algorithm: 'PS512',
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
    const auth = socket.handshake.headers['authorization'];
    return verify(auth, next);
}

const verify = function (auth, next) {
    // Is token available
    if (!auth) {
        next(new Error('No token provided'));
        return;
    }

    // Splice bearer 
    const jwt = auth;
    if (jwt.startsWith('bearer ')) jwt = auth.substr(7);

    // Is token valid
    if (isValid(jwt)) {
        next();
    }

    next(new Error('Invalid token'));
    return;
}

const isValid = function (jwt) {
    try {
        JWT.verify(
            jwt,
            JWK.asKey(publicKey.toPEM())
        );
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