const client = require('./client')


class ClientApp extends client.Unit {
    constructor(name) {
        super(name);
    }
}

exports.App=ClientApp;