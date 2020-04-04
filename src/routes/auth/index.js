const express = require('express');
const router = express.Router();
const auth = require("../../services/authenticator");

/**
 *  Login API 
 */
router.get('/', function (req, res, next) {
    res.end('Please post your data.');
});
/**
 *  Login API 
 */
router.post('/', function (req, res, next) {
    console.log(req.body);
    res.end(auth.sign('localhost', 'some-uid'));
});

module.exports = router;