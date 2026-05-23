const client = require('./client')


class ClientService extends client.Unit {
    constructor(name) {
        super(name);
    }
}

exports.Service=ClientService;