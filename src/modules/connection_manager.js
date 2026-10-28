/**
 * Persistance connections
 */
const http    = require('http');
const https   = require('https');
const { Server } = require('socket.io');
const log = require("./logger");
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
        return new Unit(unitModel.name, unitModel.socketId);
    }
    return null;
}

/**
 * Add new unit to database  
 * @param {Unit} unit Unit instance
 */
addUnit = (unit) => data.addUnit(unit.name, unit.socketId);

getSocketId = async (name, client) => {
    // Get receiver socket id
    let unit = await getUnitByName(name);
    if (unit == undefined) {
        client.emit('gateway', 'No unit found with given name.');
        return;
    }
    return unit.socketId;
};

/**
 * Only plain objects are envelopes; anything else is ignored.
 */
const isEnvelope = data => data !== null && typeof data === 'object' && !Array.isArray(data);


module.exports = (port = 3000, sslOptions = null) => {

    const server = sslOptions
        ? https.createServer(sslOptions)
        : http.createServer();

    const io = new Server(server, { cors: { origin: '*' } });

    io.use(auth.verifySocketIO);
    io.on('connection', async client => {
        log.l('Connection established.');

        // The verified token names the unit, not the handshake query
        const unitName = client.data.unit;

        let unit = await getUnitByName(unitName);
        if (unit == null)
            // Add connected unit
            addUnit(new Unit(unitName, client.id));
        else {
            unit.socketId = client.id;

            // Update socket id of unit in database
            data.updateSocketId(unit.name, unit.socketId);
        }

        // Say client connection established
        client.emit('gateway', 200);

        client.on('gateway', async data => {
            if (!isEnvelope(data)) return log.l(`Ignored a gateway payload from ${unitName} that is not an object.`);
            try {
                // The sender is whoever the token says, not what the message claims
                data.senderId = unitName;

                // Get socked id of receiver
                let socketId = await getSocketId(data.receiverId, client);

                // Send data to receiver
                if (socketId) io.to(socketId).emit('gateway', data);
            } catch (err) {
                log.e(err);
            }
        });

        client.on('responseGateway', async data => {
            if (!isEnvelope(data)) return log.l(`Ignored a responseGateway payload from ${unitName} that is not an object.`);
            try {
                // senderId names the asker the reply goes to; receiverId is
                // the unit that answered, so the hub sets it
                data.receiverId = unitName;

                // Get socked id of receiver
                let socketId = await getSocketId(data.senderId, client);

                // Send data to receiver
                if (socketId) io.to(socketId).emit('responseGateway', data);
            } catch (err) {
                log.e(err);
            }
        });

        // On client disconnect
        client.on('disconnect', () => {
            data.disconnectUnit(unitName);
            log.l(`Unit ${unitName} disconnected.`);
        });
    });

    server.listen(port, '0.0.0.0');
}