const logger = require("../modules/logger")

const App = require("./app").App;
const Service = require("./service").Service;

exports.run = function () {
    // let ca = new App('cApp');
    // let cs = new Service('cService');

    // cs.add('sum', (args) => args.pushResponse(args.a + args.b));
    // let theList = []
    // cs.add('add', (args) => theList.push(args.a));
    // cs.add('list', (args) => args.pushResponse(theList));
    // cs.add('message', (args) => setInterval(() => {
    //     args.pushResponse("Time is " + new Date());
    // }, 5000))
    // cs.add('log', (args) => setInterval(() => {
    //     args.pushResponse("Time is " + new Date());
    // }, 5000))


    setTimeout(async () => {
        // let res = await ca.ask('cService', 'sum', {
        //     a: 9,
        //     b: 2
        // });
        // console.log(res.res);

        // ca.request('cService', 'add', {
        //     a: 555
        // });
        // ca.request('cService', 'add', {
        //     a: "test"
        // });

        // res = await ca.ask('cService', 'list', null);
        // console.log(res.res);

        // ca.persist('cService', 'message', null, data => console.log(data.res));

        // ca.persist('cService', 'log', null, data => logger.hash_log(data.res));

        let res = await logger.hash_checker('524aedd87ee3af6fed6ff26f1a71ddab87a59dfb9a468851562e178578d84086');
        console.log(res);

        // logger.clustered_log();

    }, 100);
}