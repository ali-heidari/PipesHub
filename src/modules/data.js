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

// Write ARGV[1] if the name is free or still held by socket ARGV[2], the
// holder the caller saw ('' for none). 1 if written, 0 if someone else holds it.
const CLAIM_UNIT = `
local current = redis.call('GET', KEYS[1])
if current then
  local ok, unit = pcall(cjson.decode, current)
  local held = ok and type(unit) == 'table' and unit.socketId
  if type(held) ~= 'string' then held = '' end
  if held ~= ARGV[2] then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1])
return 1
`;

/**
 * Register a unit's socket, unless another socket took the name since the
 * caller looked. Resolves true if registered.
 */
module.exports.claimUnit = async (name, socketId, tokenId, expectedSocketId, node) => {
    const unit = JSON.stringify({
        name,
        socketId,
        tokenId,
        node,
        registerDate: new Date()
    });
    return await redis.evalScript(CLAIM_UNIT, [`unit:${name}`], [unit, expectedSocketId || '']) === 1;
};

module.exports.findUnit = async (name) => {
    try {
        const unit = await redis.get(`unit:${name}`);
        return unit ? [unit] : [];
    } catch (err) {
        console.error(err);
        return [];
    }
};

// Delete the unit if socket ARGV[1] still holds it. 1 if deleted.
const REMOVE_UNIT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, unit = pcall(cjson.decode, current)
if not ok or type(unit) ~= 'table' or unit.socketId ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

/**
 * Remove a disconnected unit, unless a newer socket has taken its name.
 * Resolves true if removed.
 */
module.exports.removeUnit = async (name, socketId) =>
    await redis.evalScript(REMOVE_UNIT, [`unit:${name}`], [socketId]) === 1;
