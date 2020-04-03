const fs = require('fs');
const converter = require('showdown').Converter();

/**
 * The return object of controller
 */
exports.setEngine = function (app) {
    app.engine('mde', function (filePath, options, callback) { // define the template engine
        fs.readFile(filePath, function (err, content) {
            if (err) return callback(err);
            // this is an extremely simple template engine
            let md = content.toString()
                .replace('#title#', options.title)
                .replace('#message#', options.message);
            html = converter.makeHtml(md);
            return callback(null, html)
        })
    });
    app.set('view engine', 'mde');
}