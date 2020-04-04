class Logger {
    /**
     * Normal log
     * @param {String} message 
     */
    l(message) {
        console.log(message)
    }
    e(exception) {
        console.log(exception)
    }
}
const logger = new Logger();
/**
 * Exports
 */
exports.logger = function (req, res, next) {
    logger.l(`${req.method}\t${req.protocol}${req.httpVersion}\t${req.originalUrl}`)
    next();
};
exports.l = (message) => {
    logger.l(message)
};
exports.e = (exception) => {
    logger.e(exception)
};