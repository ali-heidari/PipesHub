const fs = require('fs');
const showdown = require('showdown');

// Escape HTML special chars so substituted values can't inject markup.
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Sets the view engine
 */
exports.setEngine = function (app) {
    app.engine('md', function (filePath, options, callback) {
        fs.readFile(filePath, function (err, content) {
            if (err)
                return callback(err);
            // Convert the static template to HTML BEFORE injecting any
            // request-derived values. showdown <= 2.1.0 has an unpatched ReDoS
            // in its anchors subparser, so user-controlled input (e.g. the Host
            // header) must never reach makeHtml(). The ?key? tokens contain no
            // markdown syntax, so they pass through conversion untouched.
            const converter = new showdown.Converter({ tables: true });
            let html = converter.makeHtml(content.toString());
            // Replace all ?key? tokens with HTML-escaped option values.
            Object.entries(options).forEach(([key, val]) => {
                if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return;
                html = html.replace(new RegExp(`\\?${key}\\?`, 'g'), escapeHtml(String(val)));
            });
            return callback(null, html);
        });
    });
    app.set('view engine', 'md');
}