/**
 * Import modules
 */
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const httpStatus = require('http-status-codes');
const express = require('express');
const cookieParser = require('cookie-parser');
const log = require("./services/logger");
const auth = require("./services/authenticator");
const engine = require("./modules/md_engine");
const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth/index");

var app = express();


/**
 * Read configs
 */
const configContent = fs.readFileSync(__dirname + "/configs/config.yaml", 'utf8')
const configs = yaml.parse(configContent);

/**
 * Set configs
 */
auth.init();
 
app.set('views', path.join(__dirname, 'views'));
engine.setEngine(app);

app.use(express.json());
app.use(express.urlencoded({
    extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(log.logger);
app.use(auth.verify);

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

app.listen(configs["port"]);
log.l("Server running on http://127.0.0.1:" + configs["port"])