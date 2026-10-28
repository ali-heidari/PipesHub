/**
 * Persistance connections
 */
const http    = require('http');
const https   = require('https');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const log = require("./logger");
const auth = require("../services/authenticator");
const origins = require("./origins");
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

/**
 * Whether a socket is still connected
 */
const isLive = async (io, socketId) => (await io.in(socketId).fetchSockets()).length > 0;


module.exports = async (port = 3000, sslOptions = null, bindAddr = '0.0.0.0', redisClient = null) => {

    const server = sslOptions
        ? https.createServer(sslOptions)
        : http.createServer();

    const io = new Server(server, {
        cors: { origin: origins.corsOrigin },
        allowRequest: origins.allowRequest,
    });

    // Share rooms and broadcasts with the other nodes through Redis, so a
    // message reaches a unit on any node and a socket on any node can be found
    if (redisClient) {
        const pubClient = redisClient.duplicate();
        const subClient = redisClient.duplicate();
        for (const c of [pubClient, subClient])
            c.on('error', err => log.l(`Redis adapter error: ${err}`));
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
    }

    io.use(auth.verifySocketIO);

    // Refuse a socket for a name a live socket holds, unless its token proves
    // the same identity: the same token, or one got with the registration secret
    io.use(async (socket, next) => {
        try {
            const name = socket.data.unit;
            const held = (await data.findUnit(name))[0];
            socket.data.replaces = held?.socketId ?? null;
            socket.data.takeover = false;
            if (held?.socketId && await isLive(io, held.socketId)) {
                const sameToken = held.tokenId !== undefined && held.tokenId === socket.data.tokenId;
                if (!sameToken && !socket.data.verified) {
                    log.l(`Refused a second socket for unit ${name}: the name is in use.`);
                    const err = new Error('Unit name in use');
                    err.data = { code: 'UNIT_IN_USE' };
                    return next(err);
                }
                socket.data.takeover = true;
            }
            next();
        } catch (err) {
            log.e(err);
            next(new Error('Hub error'));
        }
    });

    io.on('connection', async client => {
        log.l('Connection established.');

        // The verified token names the unit, not the handshake query
        const unitName = client.data.unit;

        // Register the unit, unless another socket took the name meanwhile
        let claimed = false;
        try {
            claimed = await data.claimUnit(unitName, client.id, client.data.tokenId, client.data.replaces);
        } catch (err) {
            log.e(err);
        }
        if (!claimed) {
            log.l(`Refused a second socket for unit ${unitName}: the name is in use.`);
            client.emit('gateway', 'Unit name in use.');
            client.disconnect(true);
            return;
        }
        if (client.data.takeover) {
            const old = client.data.replaces;
            log.l(`Unit ${unitName} taken over: socket ${old} replaced by ${client.id}.`);
            io.to(old).emit('gateway', 'Unit name taken over by a new connection.');
            io.in(old).disconnectSockets(true);
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
            data.disconnectUnit(unitName, client.id);
            log.l(`Unit ${unitName} disconnected.`);
        });
    });

    server.listen(port, bindAddr);
    log.l(`Socket.io hub on ${sslOptions ? 'https' : 'http'}://${bindAddr}:${port}`);
}