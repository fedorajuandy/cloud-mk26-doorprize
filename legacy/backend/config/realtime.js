function milliseconds(env, name, fallback) {
    if (env[name] === undefined || env[name] === '') return fallback;
    const value = Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
        throw new Error(`${name} must be an integer between 1 and 2147483647 milliseconds.`);
    }
    return value;
}

module.exports = function realtimeConfig(env = process.env) {
    return {
        heartbeatMs: milliseconds(env, 'SSE_HEARTBEAT_MS', 15000),
        drainTimeoutMs: milliseconds(env, 'SSE_DRAIN_TIMEOUT_MS', 30000),
        pingInterval: milliseconds(env, 'SOCKET_IO_PING_INTERVAL_MS', 10000),
        pingTimeout: milliseconds(env, 'SOCKET_IO_PING_TIMEOUT_MS', 60000)
    };
};
