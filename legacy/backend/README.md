# Data Collection Backend

## Initialisation

1. Clone with the submodule
    ```
    git clone --recurse-submodules https://github.com/Maximum-Ultimate/data-collection.git
    ```
    Or clone the submodule only
    ```
    git submodule update --init --recursive
    ```

2. Install dependencies
    ```
    npm install
    ```

3. Install runner
    ```
    npm install -g pm2
    ```

## Running

1. Development mode
    ```
    npx nodemon app.js
    ```

2. Production mode
    ```
    pm2 start ecosystem.config.js --name "data-collection" --watch
    ```

## Environment Example

```
PORT=6228
DB_HOST=0.0.0.0
DB_USER=root
DB_PASSWORD=
DB_NAME=data_collection
JWT_SECRET=nailonggggg
JWT_EXPIRES_IN=8h
```

---

## Links

[Database structure](https://dbdiagram.io/d/Data-Collection-6a9558bcaed2f4f6be6fd009)

## Backend API guide

See [the backend API guide](docs/API_GUIDE.md) for authentication, wishes CRUD,
Socket.IO phone submissions, SSE standby receivers, admin endpoints, examples,
and VS Code tunnel troubleshooting.

Real-time diagnostics: set `REALTIME_DEBUG=true` and restart the backend. Configure
each frontend's exact origin in `ALLOWED_ORIGINS`. Socket.IO uses a 10-second ping
interval and a 60-second pong timeout; SSE uses 15-second heartbeats and waits for
temporary write buffers to drain before disconnecting a genuinely stalled client.

Run `npm test` for local transport and service checks. To include the isolated
MariaDB integration test, run `TEST_MYSQL_SOCKET=/path/to/mysql.sock npm test`.
