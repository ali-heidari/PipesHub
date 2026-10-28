/**
 * Import modules
 */
const yaml    = require('yaml');
const fs      = require('fs');
const http    = require('http');
const https   = require('https');
const express = require('express');
const log     = require("./modules/logger");
const auth    = require("./services/authenticator");
const route   = require("./modules/route");
const cm      = require("./modules/connection_manager");
const redis   = require("./modules/redis");
const test    = require("./clients/test");

var app = express();
/**
 * Read configs
 */
const configContent = fs.readFileSync(__dirname + "/configs/config.yaml", 'utf8')
const configs = yaml.parse(configContent);

/**
 * Set configs
 */
try {
    auth.init();
} catch (err) {
    log.e(`PipesHub cannot start: ${err.message}`);
    process.exit(1);
}

route(app);

const httpPort   = process.env.PORT        || configs["port"];
const httpsPort  = process.env.HTTPS_PORT;
const socketPort = process.env.SOCKET_PORT || 3000;
const sslKey     = process.env.SSL_KEY;
const sslCert    = process.env.SSL_CERT;
// Where every port listens; 0.0.0.0 is every network
const bindAddr   = process.env.BIND_ADDR   || '0.0.0.0';
// Largest message a socket may send, in bytes; a bigger one closes it
const maxHttpBufferSize = Number(process.env.MAX_HTTP_BUFFER_SIZE || 1e6);
if (!Number.isInteger(maxHttpBufferSize) || maxHttpBufferSize <= 0) {
    log.e(`PipesHub cannot start: MAX_HTTP_BUFFER_SIZE must be a number of bytes, not "${process.env.MAX_HTTP_BUFFER_SIZE}".`);
    process.exit(1);
}

const sslOptions = (sslKey && sslCert)
    ? { key: fs.readFileSync(sslKey), cert: fs.readFileSync(sslCert) }
    : null;

const start = async () => {
    // Redis holds the unit registry and carries messages between nodes, so
    // nothing listens until it is reachable
    await redis.init(configs.redis);

    await cm({ port: socketPort, sslOptions, bindAddr, redisClient: redis.getClient(), maxHttpBufferSize });

    http.createServer(app).listen(httpPort, bindAddr);
    log.l(`Server running on http://${bindAddr}:${httpPort}`);

    if (sslOptions && httpsPort) {
        https.createServer(sslOptions, app).listen(httpsPort, bindAddr);
        log.l(`Server running on https://${bindAddr}:${httpsPort}`);
    }
};

start().catch(err => {
    log.e(`PipesHub cannot start: ${err.message}`);
    process.exit(1);
});


setTimeout(async () => await test.run(), 2000);


// To run log clustered, 
// const log = require("./modules/logger");
// log.clustered_log();