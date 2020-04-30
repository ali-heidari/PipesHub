const App = require("./app").App;
const Service = require("./service").Service;

exports.run = function () {
    let ca = new App('cApp');
    let cs = new Service('cService');


    cs.add('sum', (args) => args.a + args.b);
    let theList = []
    cs.add('add', (args) => theList.push(args.a));
    cs.add('list', () => theList);

    setTimeout(async () => {
        let res = await ca.ask('cService', 'sum', {
            a: 9,
            b: 2
        });
        console.log(res);

        ca.request('cService', 'add', {
            a: 555
        });
       ca.request('cService', 'add', {
            a: "test"
        });

        res = await ca.ask('cService', 'list', null);
        console.log(res);

    }, 100);
}