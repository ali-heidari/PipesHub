
/**
 * Encrypt outgoing request. Socket.io middleware
 * 
 * @param {*} socket 
 * @param {*} next 
 */
const encryptSocketIO = function (socket, next) {
    const auth = socket.handshake.headers['authorization'];
    return verify(auth, next);
}