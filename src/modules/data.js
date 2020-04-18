const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;

// Set schemas
const schema = new mongoose.Schema({
    name: String
});
const user = mongoose.model('user', schema);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    var guest = new user({
        name: 'guest'
    });
    guest.save(function (err, guest) {
        if (err) return console.error(err);
        console.log(guest);
    });
});

module.exports.findUser = (username) => user.find({
    name: `${username}`
}, (err, users) => {
    return users;
}).exec().then();