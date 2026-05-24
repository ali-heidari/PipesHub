var express = require('express');
var router = express.Router();
const os = require('os');

function getMachineIP() {
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal)
                return iface.address;
        }
    }
    return 'unknown';
}

router.get('/', function (req, res, next) {
    const ip = getMachineIP();
    const host = req.headers.host || 'unknown';
    // If the Host header doesn't start with this machine's IP,
    // the request was redirected by AIxKer to a different node.
    const redirected = !host.startsWith(ip);
    res.render('index', { title: 'PipesHub', ip, host, redirected });
});

module.exports = router;