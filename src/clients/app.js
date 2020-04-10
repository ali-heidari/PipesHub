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
    console.log(res.headers)
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
        console.log('Response: ' + chunk);
    });
    res.on('end', () => {
        console.log('End: ');
        const socket = socketIOClient('http://127.0.0.1:3000/', {
            transportOptions: {
                polling: {
                    extraHeaders: {
                        'authorization': 'abc'
                    }
                }
            }
        });
        socket.on('gateway', function (data) {
            console.log(data);


            // Respond with a message including this clients' id sent from the server
            socket.emit('gateway', {
                data: 'foo!',
                id: data.id
            });
        });
    });
});

// post the data
post_req.write('sec=aaaa');
post_req.end();

console.log('request sent');