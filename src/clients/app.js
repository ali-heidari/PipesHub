const client = require('./client')


class ClientApp extends client.Unit {
    constructor(name) {
        super(name);
    }
}

let ca = new ClientApp('cApp');
setTimeout(async () => {
    let res = await ca.ask('cService', 'sum', {
        a: 9,
        b: 2
    }, true);
    console.log(res);

    res = await ca.request('cService', 'add', {
        a: 555
    }, true);
    res = await ca.request('cService', 'add', {
        a: "test"
    }, true);

    res = await ca.ask('cService', 'list', null, true);
    console.log(res);

}, 100);