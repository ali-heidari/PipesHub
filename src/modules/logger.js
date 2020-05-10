const fs = require('fs');
const crypto = require('crypto');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

class Logger {
    indexer = 0;
    lastHash_st = '';
    awaiting_workers = [];
    lastHash = '';
    busy = false;

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
        let hash = this.generate_hash(this.lastHash_st.concat(message));

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
        this.lastHash_st = hash;

        return this.lastHash_st;
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


    /**
     * Send data to the specific worker
     * @param {*} worker_id 
     */
    job(worker_id) {
        // If no worker is busy generating hash, send the current las hash to it; otherwise add it to waiting worker list 
        if (!this.busy) {
            // Send current last hash to the worker
            cluster.workers[worker_id].send({
                lastHash: this.lastHash
            });
            // Set busy true to lock last hash by master
            this.busy = true;
        } else {
            this.awaiting_workers.push(worker_id);
        }
    }
    /**
     * Using cluster module to implement logging on different processes
     */
    clustered_log() {
        let tempHash = '';
        let index = 0;
        const MESSAGE_REQUEST = 1,
            MESSAGE_LAST_HASH = 3;
        if (cluster.isMaster) {
            console.log(`Master ${process.pid} is running`);

            cluster.on('message', (worker, msg, handle) => {
                // Incoming message from worker has a type which define request type of worker
                // MESSAGE_REQUEST worker asking for last hash to generate new hash
                // MESSAGE_LAST_HASH worker sending new hash
                if (msg.type == MESSAGE_REQUEST) {
                    console.log(`Last hash requested by ${worker.id}`);
                    // Send current worker id to send last hash
                    this.job(worker.id);
                } else if (msg.type == MESSAGE_LAST_HASH) {
                    // Set last hash
                    this.lastHash = msg.lastHash;
                    console.log(`Last hash received from ${worker.id} = ${this.lastHash}`);
                    // Set busy to false, to unlock last hash
                    this.busy = false;
                    if (this.awaiting_workers.length > 0) {
                        // Send last hash to the first working in queue of workers
                        this.job(this.awaiting_workers[0]);
                        // Remove worker from awaiting last    
                        this.awaiting_workers.splice(0, 1);
                    }
                }
            });

            // Fork workers.
            for (let i = 0; i < numCPUs; i++) {
                cluster.fork();
            }

            cluster.on('exit', (worker, code, signal) => {
                console.log(`worker ${worker.process.pid} died`);
                // If a worker died by any reason, create new worker to replace it
                cluster.fork();
            });
        } else {

            process.on('message', (msg) => {
                // Create hash with a sample message
                tempHash = this.hash_log(JSON.stringify({
                    index: index,
                    msg: "Hello"
                }));
                console.log("Last Hash = " + tempHash);
                // Send back generated hash to master
                process.send({
                    type: MESSAGE_LAST_HASH,
                    lastHash: tempHash
                });
            });
            // Test code to run workers at different time intervals
            let interval = cluster.worker.id * 2000;
            setInterval(function () {
                process.send({
                    type: MESSAGE_REQUEST
                });
            }, interval);
            console.log(`Worker ${process.pid} started. Interval: ${interval}`);
        }
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
exports.clustered_log = () => {
    logger.clustered_log()
};