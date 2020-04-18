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
    console.log(req.body);
    req.on('close', () => {
        console.log('Connection to client closed.');
        res.end();
    });
    let result = await data.findUser(req.body.name);
    if (result) {
        res.end(auth.sign('localhost', req.body.name));
        return;
    }
    res.end('Invalid user');
});

module.exports = router;