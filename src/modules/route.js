
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const engine = require("./md_engine");
const log = require("../services/logger");
const auth = require("../services/authenticator");
const indexRouter = require("../routes/index");
const usersRouter = require("../routes/users");
const authRouter = require("../routes/auth/index");

module.exports = (app) => {

    app.set('views', path.join(__dirname, '/../views'));
    engine.setEngine(app);
    
    app.use(express.json());
    app.use(express.urlencoded({
        extended: false
    }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, '/../public')));
    app.use(log.logger);
    app.use(auth.verifyExpress);

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
};