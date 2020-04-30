class Logger {    
    /**
     * Normal log
     * @param {String} message 
     */
    l(message) {
        const stackObj = {};
        Error.captureStackTrace(stackObj);
        console.log(message, stackObj.stack.split('\n')[3]);
    }
    /**
     * Error log
     * @param {*} exception 
     */
    e(exception) {
        console.error(exception);
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