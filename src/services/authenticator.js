const jose = require('jose');
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
        let verified = JWT.verify(
            jwt,
            JWK.asKey(publicKey.toPEM())
        );
        log.l(verified);
    }
    next();
};

/**
 * Exports
 */
exports.init = () => init();
exports.verify = (req, res, next) => verify(req, res, next);
exports.sign = (iss, aud) => sign(iss, aud);
exports.exceptions = ['/', '/auth']