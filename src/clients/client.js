const http = require('http');
const socketIOClient = require('socket.io-client');
const log = require('../modules/logger')

class Unit {

    constructor(name) {
        if (name == undefined)
            throw new Error('Specify a name for this unit.')
        this.name = name;
        this.__pipes__ = {};
        this.__pipes__.name = name;
        this.socket = null;

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
                res.on('end', () => {
                    if (res.statusCode == 200)
                        resolve(token)
                    else
                        reject(res.statusMessage);
                });
            });
            post_req.write('name=guest');
            post_req.end();
        });
    }

    /**
     * Connect to hub
     */
    establishConnection() {
        let __pipes__ = this.__pipes__;
        return this.connect().then((res) => {
            this.socket = socketIOClient('http://127.0.0.1:3000/', {
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
            let socket = this.socket;
            this.socket.on('gateway', function (data) {
                if (data instanceof Object) {
                    if (data.receiverId !== __pipes__.name)
                        data.res = "I am not who you looking for :)";
                    else {
                        if (data.awaiting)
                            if (!data.input) data.input={};
                            
                            data.input.pushResponse = res => {
                                data.res = res;
                                socket.emit('responseGateway', data);
                            };
                        __pipes__[data.operation](data.input);
                    }
                }
            });
        }, (err) => {
            throw err;
        });
    }

    /**
     * Send a request to other unit and delivers the result
     * @param {*} unitId The receiver unit id
     * @param {*} operation Id or name of operation on other side
     * @param {*} input Input data receiver needs to run operation
     */
    ask(unitId, operation, input) {
        let socket = this.socket;
        return new Promise((resolve, reject) => {
            this.socket.emit('gateway', {
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
        this.socket.emit('gateway', {
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
        if (this.__pipes__[funcName] != undefined) {
            throw new Error('This function already exists.')
        }
        this.__pipes__[funcName] = handler;
    }
}

/**
 * Exports
 */
module.exports.Unit = Unit;