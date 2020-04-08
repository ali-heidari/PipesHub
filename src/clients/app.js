const http = require('http');

const agent = new http.Agent({
    keepAlive: true
  });

  console.log(agent)

var post_options = {
    host: 'localhost',
    port: '16916',
    path: '/auth',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'keepAlive': true,
        'connection':'keep-alive',
    }
};

let post_req = http.request(post_options, function (res) {
    console.log(res.headers)
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
        console.log('Response: ' + chunk);
    });
    res.on('end', () => {
        console.log('end');
    });
});

// post the data
post_req.write('sec=aaaa');
post_req.end();

console.log('request sent');