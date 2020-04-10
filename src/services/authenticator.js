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
 * Verify the request
 */
const verify = function (req, res, next) {
    if (exports.exceptions.indexOf(req.url) < 0) {
        let auth=req.headers.authorization;
        // Is token available
        if (!auth) {
            next(new Error('No token provided'));
            return;
        }

        // Splice bearer 
        const jwt = auth.substr(7);

        // Is token valid
        if (isValid(jwt)) {
            next();
        }

        next(new Error('Invalid token'));
        return;
    }
    
    // The requested route no need for authentication
    next();
};

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
exports.verify = (req, res, next) => verify(req, res, next);
exports.isValid = (jwt) => isValid(jwt);
exports.exceptions = ['/', '/auth']