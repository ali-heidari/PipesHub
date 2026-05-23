const express = require('express');
const router = express.Router();
const auth = require("../../services/authenticator");
const data = require("../../modules/data");

/**
 *  Login API 
 */
router.get('/', function (req, res, next) {
    res.end('Please post your data.');
});
/**
 *  Login API 
 */
router.post('/', async function (req, res, next) {
    req.on('close', () => {
        console.log('Connection to client closed.');
        res.end();
    });
    let result = await data.findUser(req.body.name);
    if (result.length > 0) {
        res.end(auth.sign('localhost', req.body.name));
        return;
    }
    res.statusCode = 401;
    res.statusMessage = 'Invalid user';
    res.end();
});

module.exports = router;