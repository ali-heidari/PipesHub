/**
 * Persistance connections
 */
const crypto  = require('crypto');
const http    = require('http');
const https   = require('https');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const log = require("./logger");
const auth = require("../services/authenticator");
const origins = require("./origins");
const data = require("../modules/data");

// Marks this process's entries in the unit registry, so it can tell when one
// of its own sockets has closed without asking the other nodes
const NODE_ID = crypto.randomUUID();
const NOT_FOUND = 'No unit found with given name.';
// Presence rooms: one per watched unit, and one for units that watch all
const presenceRoom = name => `presence:unit:${name}`;
const ALL_PRESENCE = 'presence:all';
const MAX_PRESENCE_NAMES = 1000;

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
    constructor(name, socketId, node) {
        this.name = name;
        this.socketId = socketId;
        this.node = node;
    }
}

/**
 * Get unit by name
 * @param {String} name Name of unit
 */
getUnitByName = async (name) => {
    if (typeof name !== 'string' || !name) return null;
    let unitModel = (await data.findUnit(name))[0];
    if (unitModel) {
        return new Unit(unitModel.name, unitModel.socketId, unitModel.node);
    }
    return null;
}

/**
 * Only plain objects are envelopes; anything else is ignored.
 */
const isEnvelope = data => data !== null && typeof data === 'object' && !Array.isArray(data);

/**
 * Whether a unit's socket is still connected. This node's sockets are
 * looked up here; any other is asked for across the cluster.
 */
const isLive = async (io, unit) => unit.node === NODE_ID
    ? io.sockets.sockets.has(unit.socketId)
    : (await io.in(unit.socketId).fetchSockets()).length > 0;

/**
 * Socket id of a unit that can take a message, or null if it is unknown or gone
 * @param {String} name Name of unit
 */
const findSocketId = async (io, name) => {
    const unit = await getUnitByName(name);
    if (!unit?.socketId) return null;
    // A socket of this node that has closed is gone, even before its entry is
    if (unit.node === NODE_ID && !io.sockets.sockets.has(unit.socketId)) return null;
    return unit.socketId;
};

/**
 * Tell a sender that its message found no unit: the plain-text notice older
 * clients read, and a gatewayError that carries the message's correlationId
 */
const notFound = (client, event, envelope, receiverId) => {
    client.emit('gateway', NOT_FOUND);
    client.emit('gatewayError', {
        code: 'UNIT_NOT_FOUND',
        message: NOT_FOUND,
        event,
        receiverId: receiverId ?? null,
        operation: envelope.operation ?? null,
        correlationId: envelope.input?.correlationId ?? envelope.correlationId ?? null,
    });
};

/**
 * Tell the units watching `name`, or watching every unit, that it came or went
 */
const announce = (io, name, status) => io.to(presenceRoom(name)).to(ALL_PRESENCE)
    .emit('presence', { unit: name, status, at: new Date().toISOString() });

/**
 * Unit names a presence subscription asks for: '*' for all, or a list
 */
const presenceNames = units => {
    if (units === '*') return '*';
    const names = typeof units === 'string' ? [units] : units;
    if (!Array.isArray(names) || names.length > MAX_PRESENCE_NAMES) return null;
    return names.every(n => typeof n === 'string' && n) ? names : null;
};

/**
 * Register a connected socket under its unit name and say `gateway` 200.
 * Resolves false if another socket took the name meanwhile; this socket is
 * then told and disconnected.
 */
const register = async (io, client) => {
    const unitName = client.data.unit;
    let claimed = false;
    try {
        claimed = await data.claimUnit(unitName, client.id, client.data.tokenId, client.data.replaces, NODE_ID);
    } catch (err) {
        log.e(err);
    }
    if (!claimed) {
        log.l(`Refused a second socket for unit ${unitName}: the name is in use.`);
        client.emit('gateway', 'Unit name in use.');
        client.disconnect(true);
        return false;
    }
    if (client.data.takeover) {
        const old = client.data.replaces;
        log.l(`Unit ${unitName} taken over: socket ${old} replaced by ${client.id}.`);
        io.to(old).emit('gateway', 'Unit name taken over by a new connection.');
        io.in(old).disconnectSockets(true);
    } else {
        announce(io, unitName, 'online');
    }

    // Say client connection established
    client.emit('gateway', 200);
    return true;
};


module.exports = async ({ port = 3000, sslOptions = null, bindAddr = '0.0.0.0', redisClient = null, maxHttpBufferSize = 1e6 } = {}) => {

    const server = sslOptions
        ? https.createServer(sslOptions)
        : http.createServer();

    const io = new Server(server, {
        cors: { origin: origins.corsOrigin },
        allowRequest: origins.allowRequest,
        maxHttpBufferSize,
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
            if (held?.socketId && await isLive(io, held)) {
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

    io.on('connection', client => {
        log.l('Connection established.');

        // The verified token names the unit, not the handshake query
        const unitName = client.data.unit;

        // Listen at once: messages that arrive before registration ends wait
        // for it, in order, instead of being dropped
        const registered = register(io, client);

        client.on('gateway', async data => {
            if (!await registered) return;
            if (!isEnvelope(data)) return log.l(`Ignored a gateway payload from ${unitName} that is not an object.`);
            try {
                // The sender is whoever the token says, not what the message claims
                data.senderId = unitName;

                // Get socked id of receiver
                const socketId = await findSocketId(io, data.receiverId);

                // Send data to receiver
                if (socketId) io.to(socketId).emit('gateway', data);
                else notFound(client, 'gateway', data, data.receiverId);
            } catch (err) {
                log.e(err);
            }
        });

        client.on('responseGateway', async data => {
            if (!await registered) return;
            if (!isEnvelope(data)) return log.l(`Ignored a responseGateway payload from ${unitName} that is not an object.`);
            try {
                // senderId names the asker the reply goes to; receiverId is
                // the unit that answered, so the hub sets it
                data.receiverId = unitName;

                // Get socked id of receiver
                const socketId = await findSocketId(io, data.senderId);

                // Send data to receiver
                if (socketId) io.to(socketId).emit('responseGateway', data);
                else notFound(client, 'responseGateway', data, data.senderId);
            } catch (err) {
                log.e(err);
            }
        });

        // Opt in to `presence` events: '*' or a list of unit names. The ack
        // lists which of the named units are online now.
        client.on('subscribePresence', async (units, ack) => {
            if (typeof units === 'function') [units, ack] = [undefined, units];
            const reply = typeof ack === 'function' ? ack : () => {};
            if (!await registered) return;
            const names = presenceNames(units);
            if (!names) return reply({ ok: false, error: `Expected '*' or a list of at most ${MAX_PRESENCE_NAMES} unit names.` });
            if (names === '*') {
                client.join(ALL_PRESENCE);
                return reply({ ok: true });
            }
            client.join(names.map(presenceRoom));
            try {
                const online = await Promise.all(names.map(async n => (await findSocketId(io, n)) ? n : null));
                reply({ ok: true, online: online.filter(Boolean) });
            } catch (err) {
                log.e(err);
                reply({ ok: true });
            }
        });

        client.on('unsubscribePresence', async (units, ack) => {
            if (typeof units === 'function') [units, ack] = [undefined, units];
            const reply = typeof ack === 'function' ? ack : () => {};
            if (!await registered) return;
            const names = presenceNames(units);
            if (!names) return reply({ ok: false, error: `Expected '*' or a list of at most ${MAX_PRESENCE_NAMES} unit names.` });
            for (const room of names === '*' ? [ALL_PRESENCE] : names.map(presenceRoom)) client.leave(room);
            reply({ ok: true });
        });

        // On client disconnect
        client.on('disconnect', async () => {
            if (!await registered) return;
            log.l(`Unit ${unitName} disconnected.`);
            try {
                // A socket that was taken over leaves the entry to its successor
                if (await data.removeUnit(unitName, client.id)) announce(io, unitName, 'offline');
            } catch (err) {
                log.e(err);
            }
        });
    });

    server.listen(port, bindAddr);
    log.l(`Socket.io hub on ${sslOptions ? 'https' : 'http'}://${bindAddr}:${port}`);
}
