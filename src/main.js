/**
 * Import modules
 */
const yaml = require('yaml');
const fs = require('fs');
const express = require('express');
const log = require("./services/logger");
const auth = require("./services/authenticator");
const route = require("./modules/route");

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

const server = app.listen(configs["port"]);
log.l("Server running on http://127.0.0.1:" + configs["port"])

server.on('connection', function (socket) {
    console.log("A new connection was made by a client.");
    socket.setTimeout(5 * 60 * 1000);
});