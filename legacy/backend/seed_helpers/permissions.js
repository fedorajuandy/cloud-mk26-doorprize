const wishPermissions = ['read_wishes', 'read_deleted_wishes', 'update_wishes', 'delete_wishes', 'recover_wishes'];
const permissions = [
    'create_user', 'read_user', 'update_user', 'delete_user', 'change_password',
    'create_role_permission', 'read_role_permission', 'update_role_permission', 'delete_role_permission',
    'create_permission', 'read_permission', 'read_deleted_permission', 'update_permission', 'delete_permission', 'revert_permission',
    ...wishPermissions
];
const rolePermissions = { 'Super Admin': permissions, Admin: ['read_wishes'] };

async function seedPermissions(knex) {
    await knex.transaction(async trx => {
        for (const permission_name of permissions) {
            await trx('permissions').insert({ permission_name }).onConflict('permission_name').ignore();
        }
        // Legacy wish names may coexist after old seeds ran. Preserve custom-role grants.
        for (const name of wishPermissions) {
            const old = await trx('permissions').where({ permission_name: name.replace('_wishes', '_user_data') }).first();
            if (!old) continue;
            const current = await trx('permissions').where({ permission_name: name }).first();
            for (const grant of await trx('role_permissions').where({ permission_id: old.id })) {
                await trx('role_permissions').insert({ ...grant, permission_id: current.id })
                    .onConflict(['role_id', 'permission_id']).ignore();
            }
            await trx('role_permissions').where({ permission_id: old.id }).del();
            await trx('permissions').where({ id: old.id }).del();
        }
        const rows = await trx('permissions').whereIn('permission_name', permissions);
        const ids = new Map(rows.map(row => [row.permission_name, row.id]));
        for (const [role_name, names] of Object.entries(rolePermissions)) {
            const role = await trx('roles').where({ role_name }).whereNull('deleted_at').first();
            if (!role) continue;
            const wanted = names.map(name => ids.get(name));
            // Reconcile supported application grants for standard roles; leave custom roles alone.
            await trx('role_permissions').where({ role_id: role.id })
                .whereIn('permission_id', [...ids.values()]).whereNotIn('permission_id', wanted).del();
            for (const permission_id of wanted) {
                await trx('role_permissions').insert({ role_id: role.id, permission_id })
                    .onConflict(['role_id', 'permission_id']).merge({ deleted_at: null, deleted_by: null });
            }
            await trx('permissions').whereIn('id', wanted).update({ deleted_at: null, deleted_by: null });
        }
    });
}
module.exports = { permissions, wishPermissions, rolePermissions, seedPermissions };
