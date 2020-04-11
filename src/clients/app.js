const http = require('http');
const socketIOClient = require('socket.io-client');
const log = require('../services/logger')


var post_options = {
    host: 'localhost',
    port: '16916',
    path: '/auth',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

/**
 * Connect to get token
 */
function connect() {
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
function establishConnection() {
    connect().then((res) => {
        const socket = socketIOClient('http://127.0.0.1:3000/', {
            query: {
                name: 'app'
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
            console.log(data);
        });
        // Respond with a message including this clients' id sent from the server
        socket.emit('gateway', {
            receiverId: 'service',
            operation: 'sum',
            input: {
                a: 6,
                b: 9
            },
            awaiting: true
        });
    }, (err) => log.e(err));
}


establishConnection();