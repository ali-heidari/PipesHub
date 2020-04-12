const client = require('./client')


class ClientService extends client.Unit {
    constructor(name) {
        super(name);
    }
}

let cs = new ClientService('cService');
cs.add('sum', (args) => args.a + args.b);
let theList = []
cs.add('add', (args) => theList.push(args.a));
cs.add('list', () => theList);