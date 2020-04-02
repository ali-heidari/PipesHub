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
const controllers = require("./controllers/")

var app = express();
/**
 * Read configs
 */
const configContent = fs.readFileSync(__dirname + "/configs/config.yaml", 'utf8')
const configs = yaml.parse(configContent)

/**
 * Main route
 */
app.get('*', function (req, res) {
    let urlSegments = req.path.toLowerCase().split('/');

    const controller = new controllers[urlSegments[1]]();
    const action = controller.request(urlSegments[2]);

    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    var readStream = fs.createReadStream(__dirname + '/views/' + urlSegments[1] + '/' + action.viewName + '.html', 'utf8');
    readStream.pipe(res);
});
app.listen(configs["port"]);
log.l("Server running on http://127.0.0.1:" + configs["port"])