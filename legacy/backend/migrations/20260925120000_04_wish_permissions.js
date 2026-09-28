const actions = ['read', 'read_deleted', 'update', 'delete', 'recover'];

exports.up = async function(knex) {
    for (const action of actions) {
        const oldName = `${action}_user_data`;
        const newName = `${action}_wishes`;
        const oldPermission = await knex('permissions').where({ permission_name: oldName }).first();
        let newPermission = await knex('permissions').where({ permission_name: newName }).first();
        if (oldPermission && !newPermission) {
            // Keep IDs and every existing role assignment when upgrading.
            await knex('permissions').where({ id: oldPermission.id }).update({ permission_name: newName });
        } else if (!newPermission) {
            await knex('permissions').insert({ permission_name: newName });
        } else if (oldPermission) {
            const grants = await knex('role_permissions').where({ permission_id: oldPermission.id });
            for (const grant of grants) {
                await knex('role_permissions').insert({ ...grant, permission_id: newPermission.id })
                    .onConflict(['role_id', 'permission_id']).ignore();
            }
        }
    }
};

exports.down = async function(knex) {
    for (const action of actions) {
        const oldName = `${action}_user_data`;
        if (!await knex('permissions').where({ permission_name: oldName }).first()) {
            await knex('permissions').where({ permission_name: `${action}_wishes` })
                .update({ permission_name: oldName });
        }
    }
};
