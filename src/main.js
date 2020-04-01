/**
 * Import modules
 */ 
const http = require('http')
const yaml = require('yaml')
const fs = require('fs')
const httpStatus = require('http-status-codes');
const jose = require('jose');
const express = require('express');
const log = require("./services/logger.js")

var app = express();
/**
 * Read configs
 */
const configContent = fs.readFileSync(__dirname + "/configs/config.yaml", 'utf8')
const configs = yaml.parse(configContent)

/**
 * Create server
 */

app.get('/', function(req, res) {
    res.send('Hello Sir')
});
app.listen(configs["port"]);
log.l("Server running on http://127.0.0.1:" + configs["port"])