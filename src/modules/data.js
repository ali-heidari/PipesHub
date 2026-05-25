const mongoose = require('mongoose');
const redis = require('./redis');
const log = require('./logger')

mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost/pipeshub');
const db = mongoose.connection;

// Set schemas
const schemaUser = new mongoose.Schema({
    name: String
});
const schemaUnit = new mongoose.Schema({
    name: String,
    socketId: String,
    registerDate: Date,
    disconnectDate: Date
});

// Set models
const user = mongoose.model('user', schemaUser);
const unit = mongoose.model('unit', schemaUnit);

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    log.l('Connection to mongodb established.')
});


// User functions (Redis as default)
module.exports.addUser = async (username) => {
    try {
        // Store in Redis
        await redis.set(`user:${username}`, { name: username });
        
        // Also store in MongoDB for backup
        var usr = new user({
            name: username
        });
        usr.save(function (err, usr) {
            if (err) return console.error(err);
            console.log(`${username} added to MongoDB.`);
        });
    } catch (err) {
        console.error(err);
    }
};

module.exports.findUser = async (username) => {
    try {
        // Try Redis first
        const cachedUser = await redis.get(`user:${username}`);
        if (cachedUser) {
            return cachedUser;
        }
        
        // Fallback to MongoDB
        return await user.find({
            name: `${username}`
        }).where('disconnectDate').equals(null).exec();
    } catch (err) {
        console.error(err);
        return null;
    }
};

// Unit functions (Redis as default)
module.exports.addUnit = async (name, socketId) => {
    try {
        let unt = {
            name: name,
            socketId: socketId,
            registerDate: new Date(),
            disconnectDate: null
        };
        
        // Store in Redis
        await redis.set(`unit:${name}`, unt);
        
        // Also store in MongoDB for backup
        let unitModel = new unit(unt);
        unitModel.save(function (err, unit) {
            if (err) return console.error(err);
            console.log(`unit added to MongoDB: ${name}`);
        });
    } catch (err) {
        console.error(err);
    }
};

module.exports.findUnit = async (name) => {
    try {
        // Try Redis first
        const cachedUnit = await redis.get(`unit:${name}`);
        if (cachedUnit && !cachedUnit.disconnectDate) {
            return [cachedUnit];
        }
        
        // Fallback to MongoDB
        return await unit.find({
            name: `${name}`
        }).exec();
    } catch (err) {
        console.error(err);
        return null;
    }
};

// Set disconnect date for unit (Redis as default)
module.exports.disconnectUnit = async (name) => {
    try {
        const unitData = await redis.get(`unit:${name}`);
        if (unitData) {
            unitData.disconnectDate = new Date();
            await redis.set(`unit:${name}`, unitData);
        }
        
        // Also update in MongoDB
        unit.updateOne({
            name: `${name}`
        }, {
            disconnectDate: new Date()
        }, (err, res) => {
            if (err) console.log(err);
        });
    } catch (err) {
        console.error(err);
    }
};

// Set update socket id (Redis as default)
module.exports.updateSocketId = async (name, socketId) => {
    try {
        // Update in Redis
        const unitData = await redis.get(`unit:${name}`);
        if (unitData) {
            unitData.socketId = socketId;
            unitData.disconnectDate = null;
            await redis.set(`unit:${name}`, unitData);
        }
        
        // Also update in MongoDB
        let unitModel = (await unit.find({ name: `${name}` }))[0];
        if (unitModel) {
            unitModel.socketId = socketId;
            unitModel.disconnectDate = null;
            unitModel.save();
        }
    } catch (err) {
        console.error(err);
    }
};