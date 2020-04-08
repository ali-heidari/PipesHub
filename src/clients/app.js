const http = require('http');

const agent = new http.Agent;
agent.maxSockets = 1;
agent.keepAlive = true;

console.log(agent)

const request = function () {
    var post_options = {
        host: 'localhost',
        port: '16916',
        path: '/auth',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        agent: agent
    };

    let post_req = http.request(post_options, function (res) {
        console.log(res.headers)
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            console.log('Response: ' + chunk);
        });
        res.on('end', () => {
            console.log('end');
            request();
        });
    });

    // post the data
    post_req.write('sec=aaaa');
    post_req.end();

    console.log('request sent');
}
request();