// Import modules
const http = require('http')
const yaml = require('yaml')
const fs = require('fs')
const log = require("./services/logger.js")

/**
 * Read configs
 */
const configContent = fs.readFileSync(__dirname+"/configs/config.yaml", 'utf8')
const configs = yaml.parse(configContent)

/**
 * Create server
 */
http.createServer(function () {
    try {
        new log.l("hi");
    } catch (error) {
        log.e(error);
    }
}).listen(configs["port"]);
log.l("Server running on http://127.0.0.1:" + configs["port"])