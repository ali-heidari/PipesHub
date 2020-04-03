const fs = require('fs');
/**
 * The return object of controller
 */
exports.setEngine = function (app) {
    app.engine('md', function (filePath, options, callback) {
        fs.readFile(filePath, function (err, content) {
            if (err)
                return callback(err);
            // this is an extremely simple template engine
            const md = content.toString()
                .replace('?title?', options.title)
                .replace('?message?', options.message);
            const showdown = require('showdown');
            let html = showdown.makeHtml(md);
            return callback(null, html);
        });
    });
    app.set('view engine', 'md');
}