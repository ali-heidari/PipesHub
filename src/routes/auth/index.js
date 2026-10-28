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
 *
 *  Form fields: `name` (the unit name) and, when AUTH_SECRET is set,
 *  `secret`. Answers with the JWT as plain text.
 */
router.post('/', async function (req, res, next) {
    const name = req.body?.name;
    if (typeof name !== 'string' || !name) {
        res.statusCode = 400;
        res.end('Missing name');
        return;
    }
    if (name.length > auth.MAX_NAME_LENGTH) {
        res.statusCode = 400;
        res.end('Name too long');
        return;
    }
    const token = auth.issue(name, req.body.secret);
    if (!token) {
        res.statusCode = 403;
        res.end('This unit name needs the registration secret');
        return;
    }
    let result = await data.findUser(name);
    if (result.length === 0) {
        data.addUser(name);
    }
    res.end(token);
});

module.exports = router;