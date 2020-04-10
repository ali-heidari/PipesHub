const http = require('http');
const socketIOClient = require('socket.io-client');


var post_options = {
    host: 'localhost',
    port: '16916',
    path: '/auth',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

let post_req = http.request(post_options, function (res) {
    let token = '';
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
        token = chunk;
    });
    res.on('end', () => {
        console.log('End: ');
        const socket = socketIOClient('http://127.0.0.1:3000/', {
            query: {
                name: 'app'
            },
            transportOptions: {
                polling: {
                    extraHeaders: {
                        'authorization': token
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
    });
});

// post the data
post_req.write('sec=aaaa');
post_req.end();

console.log('request sent');