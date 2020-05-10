const fs = require('fs');
const crypto = require('crypto');

class Logger {
    indexer = 0;
    lastHash = '';

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


    generate_hash(content) {
        const hash_sha256 = crypto.createHash('sha256');
        return hash_sha256.update(content, 'utf8').digest('hex');
    }

    /**
     * Stores hashed format of log
     * @param {String} message 
     */
    hash_log(message) {

        // Generate hash for received data
        let hash = this.generate_hash(this.lastHash.concat(message));

        // Create log object to ensure fixed log structure 
        const log_data = {
            i: this.indexer,
            log: message,
            hash: hash
        }

        // Store stringified log data
        let log = JSON.stringify(log_data);

        // Write in log file
        fs.appendFile('./system.log', log + '\n', function (err) {
            if (err) return console.error(err);
        });

        // log on console 
        this.l(log);

        // Set variables for next log
        this.indexer++;
        this.lastHash = hash;
    }

    /**
     * Check if hash exists in file or not
     * @param {String} hash 
     */
    async hash_checker(hash) {
        return new Promise(async resolve => {
            // Read log file
            let content = await fs.readFileSync('./system.log', "utf8");

            let lHash = ''; // temp last hash
            let logData = null; // temp log data

            // Iterate through lines of file
            for (const line of content.split('\n')) {

                if (line == '') continue;

                // Parse the line to get structured log data
                logData = JSON.parse(line);

                // Generate hash from the first line
                let gHash = this.generate_hash(lHash.concat(logData.log));

                // Check the new hash if equals to given hash
                if (gHash === hash)
                    // Found the hash between log hashes
                    return resolve(true);

                lHash = gHash;
            }

            // Could not match provided hash with log hashes
            return resolve(false);
        });
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
exports.hash_log = (message) => {
    logger.hash_log(message)
};
exports.hash_checker = async (message) => {
    return logger.hash_checker(message)
};