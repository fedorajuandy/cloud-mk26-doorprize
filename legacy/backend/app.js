const express = require('express');
const cors = require('cors');
const cookieParser = require("cookie-parser");
const http = require('node:http');
const { createWishService } = require('./services/wishes');
const { createWishEvents, attachWishSockets } = require('./realtime/wishes');
const auth = require('./utils/utility_javascript/middleware/auth');
const permission = require('./utils/utility_javascript/middleware/permission');

require('dotenv').config();

const logger = require('./utils/utility_javascript/logger');
const db = require(`./utils/utility_javascript/config/db`);
const rt = require('./utils/utility_javascript/responseTemplate');

const app = express();
const allowedOrigins = [
  // Local
  'http://localhost:5001',
  'http://127.0.0.1:5001',
  'https://twghnmr6-5001.asse.devtunnels.ms',
  // Front end
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.0.167:3000',
  // Server
  'https://www.mkn2026.com',
  'https://mkn2026.com'
];

// Extra frontend origins can be supplied as a comma-separated list.
allowedOrigins.push(...(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const origin = (value, callback) => {
    const allowed = !value || allowedOrigins.includes(value);
    if (!allowed) logger.warn(`Origin rejected: ${JSON.stringify(value)}. Add the exact frontend origin to ALLOWED_ORIGINS.`);
    callback(null, allowed);
};
app.use(cors({ origin, credentials: true }));

const realtimeOptions = require('./config/realtime')();
const onDiagnostic = diagnostic => {
    if (['connection_error', 'rejected'].includes(diagnostic.event)) {
        logger.warn(`Realtime ${JSON.stringify(diagnostic)}`);
    } else if (process.env.REALTIME_DEBUG === 'true') {
        logger.info(`Realtime ${JSON.stringify(diagnostic)}`);
    }
};
const events = createWishEvents({ ...realtimeOptions, onDiagnostic, onError: error => logger.error(error.stack) });
const wishService = createWishService(db, events);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());

app.get(`/api`, async (req, res) => {
    return rt.sendResponse(
        res, 200, `Server is running.`
    );
});

app.get(`/api/health`, async (req, res) => {
    try {
        await db.query(`SELECT 1`);
        return rt.sendResponse(
            res, 200, `Database is connected.`
        );
    } catch (error) {
        logger.error(`Database health check failed: ${error.message}`);
        return rt.sendResponse(
            res, 500, `Database is disconnected :(`,
            null,
            { error: error.message }
        );
    }
});

// --- ROUTES DIDAFTARKAN DULU ---
const userRoutes = require(`./utils/utility_javascript/users/users`);
const rolePermissionRoutes = require(`./utils/utility_javascript/users/rolePermissions`);
const defaultGenericRoutes = require(`./utils/utility_javascript/users/generic`);
const systemSettingRoutes = require(`./utils/utility_javascript/settings/system`);
const wishRoutes = require('./routes/wishes')({ service: wishService, events, auth, permission, onDiagnostic });

app.use(`/api`, userRoutes);
app.use(`/api`, rolePermissionRoutes);
app.use(`/api`, defaultGenericRoutes);
app.use('/api', systemSettingRoutes);
app.use('/api', wishRoutes);

// --- GLOBAL ERROR HANDLER (PINDAHKAN KE SINI / PALING BAWAH) ---
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    logger.error(`Connection error: ${error.stack}`);

    return rt.sendResponse(
        res, error.status || 500, error.status ? error.message : 'Server error.'
    );
});

const server = http.createServer(app);
const io = attachWishSockets(server, {
    ...realtimeOptions, service: wishService, events, auth, permission, origin, onDiagnostic,
    onError: error => logger.error(error.stack)
});

if (require.main === module) {
    const PORT = process.env.PORT ?? 6228;
    server.listen(PORT, () => {
        logger.info(`HTTP, Socket.IO and SSE server running on port ${PORT}`);
    });
    const shutdown = () => {
        events.close();
        io.close(() => db.end().finally(() => process.exit(0)));
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
}

module.exports = { app, server, io, events };
