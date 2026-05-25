const redis = require('./redis');

module.exports.addUser = async (username) => {
    try {
        await redis.set(`user:${username}`, { name: username });
    } catch (err) {
        console.error(err);
    }
};

module.exports.findUser = async (username) => {
    try {
        const user = await redis.get(`user:${username}`);
        return user ? [user] : [];
    } catch (err) {
        console.error(err);
        return [];
    }
};

module.exports.addUnit = async (name, socketId) => {
    try {
        await redis.set(`unit:${name}`, {
            name,
            socketId,
            registerDate: new Date(),
            disconnectDate: null
        });
    } catch (err) {
        console.error(err);
    }
};

module.exports.findUnit = async (name) => {
    try {
        const unit = await redis.get(`unit:${name}`);
        return unit ? [unit] : [];
    } catch (err) {
        console.error(err);
        return null;
    }
};

module.exports.disconnectUnit = async (name) => {
    try {
        const unitData = await redis.get(`unit:${name}`);
        if (unitData) {
            unitData.disconnectDate = new Date();
            await redis.set(`unit:${name}`, unitData);
        }
    } catch (err) {
        console.error(err);
    }
};

module.exports.updateSocketId = async (name, socketId) => {
    try {
        const unitData = await redis.get(`unit:${name}`);
        if (unitData) {
            unitData.socketId = socketId;
            unitData.disconnectDate = null;
            await redis.set(`unit:${name}`, unitData);
        }
    } catch (err) {
        console.error(err);
    }
};
