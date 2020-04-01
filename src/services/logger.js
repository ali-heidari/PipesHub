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
const logger =new Logger();
/**
 * Exports
 */
exports.logger = Logger;
exports.l = (message) => {
    logger.l(message)
};
exports.e = (exception) => {
    logger.e(exception)
};