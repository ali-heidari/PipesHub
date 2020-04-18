const express = require('express');
const router = express.Router();
const auth = require("../../services/authenticator");
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
const schema = new mongoose.Schema({
    name: String
});
const user = mongoose.model('user', schema);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    ;
    var guest = new user({
        name: 'guest'
    });
    console.log(guest);
    guest.save(function (err, guest) {
        if (err) return console.error(err);
        console.log(guest);
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
    let result = user.find({ name: `${req.body.name}` },(err, users) => {
        console.log(users);
        res.end(auth.sign('localhost', 'some-uid'));
    });
    console.log(result)
});

module.exports = router;