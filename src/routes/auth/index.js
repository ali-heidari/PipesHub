var express = require('express');
var router = express.Router();

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
    res.render('auth/index',{message:req.body.sec})
});

module.exports = router;