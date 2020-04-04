var express = require('express');
var router = express.Router();
const httpStatus = require('http-status-codes');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', {
    title: 'Home',
    message: 'Fork me!'
  })
});

module.exports = router;