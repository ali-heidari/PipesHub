const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
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
    console.log('Connection to mongodb established.')
});


// User functions
module.exports.addUser = (username) => {
    var usr = new user({
        name: username
    });
    usr.save(function (err, usr) {
        if (err) return console.error(err);
        console.log(`${username} added.`);
    });
};

module.exports.findUser = (username) => user.find({
    name: `${username}`
}, (err, res) => {
    return res;
}).exec().then();

// Unit functions
module.exports.addUnit = (name, socketId) => {
    let unit = new unit({
        name: name,
        socketId: socketId,
        registerDate: new Date()
    });
    unit.save(function (err, unit) {
        if (err) return console.error(err);
        console.log(`unit added: ${name}`);
    });
};

module.exports.findUnit = (name) => {
    return unit.find({
        name: `${name}`
    }, (err, res) => {
        return res;
    }).exec().then();
};

// Set disconnect date for unit
module.exports.disconnectUnit = (name) =>
    unit.update({
        name: `${name}`
    }, {
        disconnectDate: new Date()
    });