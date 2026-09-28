const { hasProfanity } = require('./profanity');

const COLUMNS = 'CAST(id AS CHAR) AS id, name, wish, created_at, updated_at, deleted_at';

function problem(status, message) {
    return Object.assign(new Error(message), { status });
}

function validateWish(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw problem(400, 'A wish object is required.');
    }
    if (typeof body.wish !== 'string' || !body.wish.trim()) {
        throw problem(400, 'wish must be a non-empty string.');
    }
    const wish = body.wish.trim();
    if (Buffer.byteLength(wish, 'utf8') > 65535) {
        throw problem(400, 'wish must fit within 65,535 UTF-8 bytes.');
    }
    if (body.name != null && (typeof body.name !== 'string' || [...body.name].length > 255)) {
        throw problem(400, 'name must be a string of at most 255 characters or null.');
    }
    const name = body.name?.trim() || null;
    if (hasProfanity(name) || hasProfanity(wish)) {
        throw problem(400, 'Nama atau harapan mengandung kata yang tidak pantas. Silakan gunakan kata-kata yang sopan.');
    }
    return { name, wish };
}

function validateId(value) {
    const id = String(value);
    if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n) {
        throw problem(400, 'id must be a positive unsigned bigint.');
    }
    return id;
}

function filters(query, deleted = false) {
    let sql = `WHERE deleted_at IS ${deleted ? 'NOT ' : ''}NULL`;
    const params = [];
    if (query.search !== undefined) {
        if (typeof query.search !== 'string' || query.search.length > 1000) {
            throw problem(400, 'search must be a string of at most 1000 characters.');
        }
        sql += ' AND (name LIKE ? OR wish LIKE ?)';
        params.push(`%${query.search}%`, `%${query.search}%`);
    }
    for (const key of ['start_date', 'end_date']) {
        const value = query[key];
        if (value === undefined) continue;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
            throw problem(400, `${key} must be a valid YYYY-MM-DD date.`);
        }
        sql += key === 'start_date' ? ' AND created_at >= ?' : ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
        params.push(value);
    }
    if (query.start_date && query.end_date && query.start_date > query.end_date) {
        throw problem(400, 'start_date must not be after end_date.');
    }
    return { sql, params };
}

function createWishService(db, events) {
    // Read back database timestamps and commit before notifying any client.
    async function mutate(work, event) {
        const connection = await db.getConnection();
        let data;
        try {
            await connection.beginTransaction();
            data = await work(connection);
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        events.publish(event, data);
        return data;
    }

    async function getFrom(connection, id, activeOnly = true) {
        const [rows] = await connection.execute(
            `SELECT ${COLUMNS} FROM wishes WHERE id = ?${activeOnly ? ' AND deleted_at IS NULL' : ''}`, [id]
        );
        if (!rows.length) throw problem(404, 'Wish not found.');
        return rows[0];
    }

    return {
        async create(body) {
            const { name, wish } = validateWish(body);
            return mutate(async connection => {
                await connection.execute('INSERT INTO wishes (name, wish) VALUES (?, ?)', [name, wish]);
                // LAST_INSERT_ID stays on this connection and avoids JavaScript bigint rounding.
                const [[row]] = await connection.execute('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
                return getFrom(connection, row.id);
            }, 'wish:created');
        },
        async get(id) {
            return getFrom(db, validateId(id));
        },
        async list(query = {}, { deleted = false, exportAll = false } = {}) {
            const { sql, params } = filters(query, deleted);
            const page = Number(query.page ?? 1);
            const limit = Number(query.limit ?? 20);
            if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
                !Number.isSafeInteger((page - 1) * limit)) {
                throw problem(400, 'page must be a positive integer; limit must be between 1 and 100.');
            }
            const [rows] = await db.execute(
                `SELECT ${COLUMNS} FROM wishes ${sql} ORDER BY created_at DESC, id DESC` +
                (exportAll ? '' : ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`), params
            );
            if (exportAll) return rows;
            const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM wishes ${sql}`, params);
            return {
                summary: { total_wishes: count.total }, records: rows,
                pagination: { total_records: count.total, total_pages: Math.ceil(count.total / limit), current_page: page, limit }
            };
        },
        async update(id, body) {
            id = validateId(id);
            const { name, wish } = validateWish(body);
            return mutate(async connection => {
                const [result] = await connection.execute(
                    'UPDATE wishes SET name = ?, wish = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL',
                    [name, wish, id]
                );
                if (!result.affectedRows) throw problem(404, 'Wish not found.');
                return getFrom(connection, id);
            }, 'wish:updated');
        },
        async remove(id, { permanent = false } = {}) {
            id = validateId(id);
            return mutate(async connection => {
                const [result] = await connection.execute(permanent ? 'DELETE FROM wishes WHERE id = ?' :
                    'UPDATE wishes SET deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
                if (!result.affectedRows) throw problem(404, 'Wish not found.');
                return { id, permanent };
            }, 'wish:deleted');
        },
        async recover(id) {
            id = validateId(id);
            return mutate(async connection => {
                const [result] = await connection.execute(
                    'UPDATE wishes SET deleted_at = NULL, updated_at = NOW() WHERE id = ? AND deleted_at IS NOT NULL', [id]
                );
                if (!result.affectedRows) throw problem(404, 'Deleted wish not found.');
                return getFrom(connection, id);
            }, 'wish:recovered');
        },
        async wipe() {
            return mutate(async connection => {
                // DELETE is transactional and preserves monotonically increasing wish IDs.
                const [result] = await connection.execute('DELETE FROM wishes');
                return { deleted_count: result.affectedRows };
            }, 'wishes:cleared');
        }
    };
}

module.exports = { createWishService, validateWish, validateId };
