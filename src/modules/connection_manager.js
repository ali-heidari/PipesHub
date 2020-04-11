/**
 * Persistance connections
 */
const io = require('socket.io')();
const log = require("../services/logger");
const auth = require("../services/authenticator");

/**
 * Communication protocol
 */
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
        this.senderId = '';
        this.result = {};
    }
}

/**
 * Every application or service known as unit
 */
class Unit {
    constructor(name, socketId) {
        this.name = name;
        this.socketId = socketId;
    }
}

/**
 * Get unit by name
 * @param {String} name Name of unit
 */
getUnitByName = (name) => units.find((value) => value.name == name);

// Socket storage
let units = [];

module.exports = (port = 3000) => {

    io.use(auth.verifySocketIO);
    io.on('connection', client => {
        log.l('Connection established.');


        let unit = getUnitByName(client.handshake.query.name);
        if (unit == undefined)
            // Add connected unit
            units.push(new Unit(client.handshake.query.name, client.id));
        else unit.socketId = client.id;

        // Say client connection established
        client.emit('gateway', 200);

        client.on('gateway', data => {
            log.l(data);

            // Set sender id, so receiver will know who is requesting 
            data.senderId = client.handshake.query.name;

            // Get receiver socket id
            let unit = getUnitByName(data.receiverId);
            if (unit == undefined) {
                client.emit('No unit found with given name.');
                return;
            }
            let socketId = unit.socketId;

            io.to(socketId).emit('gateway', data);
        });
    });

    io.listen(port);
}