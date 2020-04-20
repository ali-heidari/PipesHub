/**
 * Persistance connections
 */
const io = require('socket.io')();
const log = require("../services/logger");
const auth = require("../services/authenticator");
const data = require("../modules/data");

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
getUnitByName = async (name) => {
    let unitModel = (await data.findUnit(name))[0];
    if (unitModel) {
        return new Unit(unitModel._doc.name, unitModel._doc.socketId);
    }
    return null;
}

/**
 * Add new unit to database  
 * @param {Unit} unit Unit instance
 */
addUnit = (unit) => data.addUnit(unit.name, unit.socketId);

getSocketId = (name) => {
    // Get receiver socket id
    let unit = getUnitByName(name);
    if (unit == undefined) {
        client.emit('gateway', 'No unit found with given name.');
        return;
    }
    return unit.socketId;
};


module.exports = (port = 3000) => {

    io.use(auth.verifySocketIO);
    io.on('connection', async client => {
        log.l('Connection established.');


        let unit = await getUnitByName(client.handshake.query.name);
        if (unit == null)
            // Add connected unit
            addUnit(new Unit(client.handshake.query.name, client.id));
        else {
            unit.socketId = client.id;

            // Update socket id of unit in database
            data.updateSocketId(unit.name, unit.socketId);
        }

        // Say client connection established
        client.emit('gateway', 200);

        client.on('gateway', data => {
            // Get socked id of receiver
            let socketId = getSocketId(data.receiverId);

            // Send data to receiver
            io.to(socketId).emit('gateway', data);
        });

        client.on('responseGateway', data => {
            // Get socked id of receiver
            let socketId = getSocketId(data.senderId);

            // Send data to receiver
            io.to(socketId).emit('responseGateway', data);
        });

        // On client disconnect
        client.on('disconnect', () => {
            let res = data.disconnectUnit(client.handshake.query.name);
            log.l(res);
        });
    });

    io.listen(port);
}