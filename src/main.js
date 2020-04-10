/**
 * Import modules
 */
const http = require('http');
const socketIO = require('socket.io');
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


const server = http.createServer(app);
const io = socketIO(server);
io.on('connection', client => {
    log.l('Connection established.');
    client.emit('res','hi') 
    client.on('event', data => {
        log.l(data);
    });
});

io.listen(configs["port"]);

// const server = app.listen(configs["port"]);
log.l("Server running on http://127.0.0.1:" + configs["port"])