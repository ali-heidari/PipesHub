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
auth.init();

route(app);

const port       = process.env.PORT        || configs["port"];
const socketPort = process.env.SOCKET_PORT || 3000;
const sslKey     = process.env.SSL_KEY;
const sslCert    = process.env.SSL_CERT;

const sslOptions = (sslKey && sslCert)
    ? { key: fs.readFileSync(sslKey), cert: fs.readFileSync(sslCert) }
    : null;

cm(socketPort, sslOptions);

if (sslOptions) {
    https.createServer(sslOptions, app).listen(port, '0.0.0.0');
    log.l("Server running on https://0.0.0.0:" + port);
} else {
    http.createServer(app).listen(port, '0.0.0.0');
    log.l("Server running on http://0.0.0.0:" + port);
}


setTimeout(async () => await test.run(), 2000);


// To run log clustered, 
// const log = require("./modules/logger");
// log.clustered_log();