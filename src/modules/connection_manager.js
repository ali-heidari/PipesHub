/**
 * Persistance connections
 */
const io = require('socket.io')();
const log = require("../services/logger");
const auth = require("../services/authenticator");

class Protocol {
    /**
     * Constructor
     * @param {String} receiverId Id of service whose message sent for
     * @param {int} operation operation id which receiver knows
     * @param {Object} input Optional - object receiver needs for operation
     * @param {boolean} awaiting Determine if sender is waiting for answer. Default is false. 
     */
    constructor(receiverId, operation, input = NaN, awaiting = false) {
        this.receiverId = receiverId;
        this.operation = operation;
        this.input = input;
        this.awaiting = awaiting;
    }
}

module.exports = (port = 3000) => {

    io.use(auth.verifySocketIO);
    io.on('connection', client => {
        log.l('Connection established.');
        client.emit('gateway', new Protocol('sDAZSDAAsad5d', 22, {
            customerId: 5
        }, false));
        client.on('gateway', data => {
            log.l(data);
        });
    });

    io.listen(port);
}