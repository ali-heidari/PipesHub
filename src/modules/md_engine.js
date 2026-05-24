const fs = require('fs');
const showdown = require('showdown');
/**
 * Sets the view engine
 */
exports.setEngine = function (app) {
    app.engine('md', function (filePath, options, callback) {
        fs.readFile(filePath, function (err, content) {
            if (err)
                return callback(err);
            // replace all ?key? tokens from options
            let md = content.toString();
            Object.entries(options).forEach(([key, val]) => {
                if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return;
                md = md.replace(new RegExp(`\\?${key}\\?`, 'g'), String(val));
            });
            const converter = new showdown.Converter({ tables: true });
            let html = converter.makeHtml(md);
            return callback(null, html);
        });
    });
    app.set('view engine', 'md');
}