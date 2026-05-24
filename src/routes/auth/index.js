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
    if (!req.body.name) {
        res.statusCode = 400;
        res.end('Missing name');
        return;
    }
    let result = await data.findUser(req.body.name);
    if (result.length === 0) {
        data.addUser(req.body.name);
    }
    res.end(auth.sign('localhost', req.body.name));
});

module.exports = router;