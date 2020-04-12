const http = require('http');
const socketIOClient = require('socket.io-client');
const log = require('../services/logger')

let __pipes__ = {};
exports.a = __pipes__;
socket = null;

class Unit {

    constructor(name) {
        if (name == undefined)
            throw new Error('Specify a name for this unit.')
        this.name = name;
        __pipes__.name = name;

        // Connect to hub
        this.establishConnection();
    }

    /**
     * Connect to get token
     */
    connect() {
        let post_options = {
            host: 'localhost',
            port: '16916',
            path: '/auth',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };
        return new Promise(function (resolve, reject) {
            let post_req = http.request(post_options, function (res) {
                let token = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => token += chunk);
                res.on('error', (err) => reject(err));
                res.on('end', () => resolve(token));
            });
            post_req.write('sec=aaaa');
            post_req.end();
            log.l('c')
        });
    }

    /**
     * Connect to hub
     */
    establishConnection() {
        return this.connect().then((res) => {
            socket = socketIOClient('http://127.0.0.1:3000/', {
                query: {
                    name: this.name
                },
                transportOptions: {
                    polling: {
                        extraHeaders: {
                            'authorization': res
                        }
                    }
                }
            });
            socket.on('gateway', function (data) {
                log.l(data);
                if (data instanceof Object) {
                    if (data.receiverId !== __pipes__.name)
                        data.res = "I am not who you looking for :)";
                    else
                        data.res = __pipes__[data.operation](data.input);
                    if (data.awaiting)
                        socket.emit('responseGateway', data);
                }
            });
        }, (err) => log.e(err));
    }

    /**
     * Send a request to other unit and delivers the result
     * @param {*} unitId The receiver unit id
     * @param {*} operation Id or name of operation on other side
     * @param {*} input Input data receiver needs to run operation
     */
    ask(unitId, operation, input) {
        return new Promise((resolve, reject) => {
            socket.emit('gateway', {
                senderId: this.name,
                receiverId: unitId,
                operation: operation,
                input: input,
                awaiting: true
            });
            socket.on('responseGateway', function (data) {
                resolve(data);
            });
        });
    }
    /**
     * Send a request to other unit and no result expected
     * @param {*} unitId The receiver unit id
     * @param {*} operation Id or name of operation on other side
     * @param {*} input Input data receiver needs to run operation
     */
    request(unitId, operation, input) {
        socket.emit('gateway', {
            senderId: this.name,
            receiverId: unitId,
            operation: operation,
            input: input,
            awaiting: false
        });
    }

    /**
     * Add a function to global __pipes prototype
     * @param {*} funcName A name for operation
     * @param {*} handler Operation body
     */
    add(funcName, handler) {
        if (__pipes__[funcName] != undefined) {
            throw new Error('This function already exists.')
        }
        __pipes__[funcName] = handler;
    }
}

/**
 * Exports
 */
module.exports.Unit = Unit;