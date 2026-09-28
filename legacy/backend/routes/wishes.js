const express = require('express');
const ExcelJS = require('exceljs');
const rt = require('../utils/utility_javascript/responseTemplate');

module.exports = function createWishRouter({ service, events, auth, permission, onDiagnostic = () => {} }) {
    const router = express.Router();
    const protect = name => [auth, permission(name)];
    const handle = fn => async (req, res, next) => {
        try {
            await fn(req, res);
        } catch (error) {
            if (error.status) return rt.sendResponse(res, error.status, error.message);
            next(error);
        }
    };

    router.post('/wishes', handle(async (req, res) => {
        rt.sendResponse(res, 201, 'Wish created.', await service.create(req.body));
    }));

    router.get('/wishes/stream', (req, res, next) => {
        res.once('finish', () => {
            if (res.statusCode >= 400) onDiagnostic({ transport: 'sse', event: 'rejected', status: res.statusCode });
        });
        next();
    }, (req, res) => events.connect(req, res));

    router.get('/wishes', ...protect('read_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wishes fetched.', await service.list(req.query));
    }));

    router.get('/deleted-wishes', ...protect('read_deleted_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Deleted wishes fetched.', await service.list(req.query, { deleted: true }));
    }));

    router.get('/wishes/export/excel', ...protect('read_wishes'), handle(async (req, res) => {
        const rows = await service.list(req.query, { exportAll: true });
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Wishes');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 22 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Wish', key: 'wish', width: 80 },
            { header: 'Created At', key: 'created_at', width: 24 },
            { header: 'Updated At', key: 'updated_at', width: 24 }
        ];
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true };
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Wishes_${new Date().toISOString().slice(0, 10)}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    }));

    router.get('/wishes/:id', ...protect('read_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wish fetched.', await service.get(req.params.id));
    }));
    router.put('/wishes/:id', ...protect('update_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wish updated.', await service.update(req.params.id, req.body));
    }));
    router.delete('/wishes/:id', ...protect('delete_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wish deleted.', await service.remove(req.params.id));
    }));
    router.put('/wishes/:id/recover', ...protect('recover_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wish recovered.', await service.recover(req.params.id));
    }));
    router.delete('/admin/wishes/wipe-all', ...protect('delete_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wishes cleared.', await service.wipe());
    }));
    router.delete('/admin/wishes/:id', ...protect('delete_wishes'), handle(async (req, res) => {
        rt.sendResponse(res, 200, 'Wish permanently deleted.', await service.remove(req.params.id, { permanent: true }));
    }));
    return router;
};
