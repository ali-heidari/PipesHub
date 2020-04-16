const express = require('express');
const router = express.Router();
const auth = require("../../services/authenticator");
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test', {
    useNewUrlParser: true
});
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    var schema = new mongoose.Schema({
        name: String
    });
    var user = mongoose.model('user', schema);
    var guest = new user({
        name: 'guest'
    });
    guest.save(function (err, fluffy) {
        if (err) return console.error(err);
    });
});
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
    req.on('close', () => {
        console.log('Connection to client closed.');
        res.end();
    });
    Kitten.find({
        name: `/^${req.body.name}/`
    }, () => res.end(auth.sign('localhost', 'some-uid')));

});

module.exports = router;