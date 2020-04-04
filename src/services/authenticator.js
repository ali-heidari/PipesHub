/**
 * Exports
 */
exports.verify = function (req, res, next) {
    if (exports.exceptions.indexOf(req.url) < 0) {
        console.log('m');
    }
    next();
};

exports.exceptions = ['/', '/auth']