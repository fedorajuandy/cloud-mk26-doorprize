import { createSignal, onMount, For, Show, Switch, Match, createMemo } from 'solid-js';
import api from '../services/api';

export default function SystemSettings() {
  // --- UI Settings State ---
  const [uiFormData, setUiFormData] = createSignal({ logo_url: '', login_bg_color: '' });

  // Tabs: 'users', 'roles', 'master_permissions', 'ui'
  const [activeTab, setActiveTab] = createSignal('users');

  // --- Admin Users State ---
  const [admins, setAdmins] = createSignal([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = createSignal(false);

  // --- Roles & Permissions State ---
  const [roles, setRoles] = createSignal([]);
  const [allPermissions, setAllPermissions] = createSignal([]);
  const [selectedRoleId, setSelectedRoleId] = createSignal(null);
  const [activeRolePermIds, setActiveRolePermIds] = createSignal([]);
  const [isLoadingRoles, setIsLoadingRoles] = createSignal(false);

  // --- Modals State ---
  const [adminModal, setAdminModal] = createSignal({ open: false, mode: 'add', userId: null });
  const [passwordModal, setPasswordModal] = createSignal({ open: false, userId: null, username: '', newPassword: '' });
  const [roleModal, setRoleModal] = createSignal({ open: false, mode: 'add', roleId: null });
  const [permMasterModal, setPermMasterModal] = createSignal({ open: false, mode: 'add', permId: null, permName: '' });
  const [confirmModal, setConfirmModal] = createSignal({ open: false, type: '', id: null, title: '', message: '' });

  // --- Form & Saving State ---
  const [adminFormData, setAdminFormData] = createSignal({ username: '', password: '', role_id: 2 });
  const [newRoleName, setNewRoleName] = createSignal('');
  const [isSaving, setIsSaving] = createSignal(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = currentUser?.role_id === 1;

  // --- API Fetches ---

  const fetchAdmins = async () => {
    setIsLoadingAdmins(true);
    try {
      const response = await api.get('/users');
      setAdmins(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch admins:', error);
    } finally {
      setIsLoadingAdmins(false);
    }
  };

  const fetchRolesAndPermissions = async () => {
    setIsLoadingRoles(true);
    try {
      const [rolesRes, permsRes] = await Promise.allSettled([
        api.get('/role-permissions'),
        api.get('/permissions')
      ]);

      if (rolesRes.status === 'fulfilled') {
        const fetchedRoles = rolesRes.value.data?.data || [];
        setRoles(fetchedRoles);

        // Auto-select first role if none selected
        if (fetchedRoles.length > 0 && !selectedRoleId()) {
          selectRoleForEditing(fetchedRoles[0]);
        } else if (selectedRoleId()) {
          const currentlySelected = fetchedRoles.find(r => r.id === selectedRoleId());
          if (currentlySelected) selectRoleForEditing(currentlySelected);
        }
      } else {
        // Explicitly alert the user if the backend fails
        const errMsg = rolesRes.reason?.response?.data?.message || rolesRes.reason?.message;
        alert(`Failed to load roles: ${errMsg}`);
        console.error('Roles fetch failed:', rolesRes.reason);
      }

      if (permsRes.status === 'fulfilled') {
        setAllPermissions(permsRes.value.data?.data || []);
      } else {
        const errMsg = permsRes.reason?.response?.data?.message || permsRes.reason?.message;
        alert(`Failed to load permissions: ${errMsg}`);
        console.error('Permissions fetch failed:', permsRes.reason);
      }
    } catch (error) {
      console.error('Failed to fetch matrix data:', error);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const selectRoleForEditing = (role) => {
    setSelectedRoleId(role.id);
    const permIds = (role.permissions || []).map(p => p.id).filter(Boolean);
    setActiveRolePermIds(permIds);
  };

  const fetchUiSettings = async () => {
    try {
      const response = await api.get('/settings');
      if (response.data?.data) {
        setUiFormData(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch UI settings:', error);
    }
  };

  onMount(() => {
    fetchAdmins();
    fetchRolesAndPermissions();
    fetchUiSettings(); // Add this line
  });

  const saveUiSettings = async () => {
    setIsSaving(true);
    try {
      await api.put('/settings', uiFormData());
      alert('Brand settings updated successfully! Refresh the page to see changes applied everywhere.');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save UI settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Group Master Permissions into Clean Modules ---
  const categorizedPermissions = createMemo(() => {
    const groups = {};
    for (const perm of allPermissions()) {
      const parts = perm.permission_name.split('_');
      const category = parts.length > 1 ? parts.slice(1).join(' ').toUpperCase() : 'GENERAL';

      if (!groups[category]) groups[category] = [];
      groups[category].push(perm);
    }
    return groups;
  });

  // --- Role Permission Checklist Handlers ---

  const togglePermissionForSelectedRole = (permId) => {
    if (selectedRoleId() === 1) return; // Lock Super Admin from self-revocation
    const current = activeRolePermIds();
    if (current.includes(permId)) {
      setActiveRolePermIds(current.filter(id => id !== permId));
    } else {
      setActiveRolePermIds([...current, permId]);
    }
  };

  const selectAllPermissions = () => {
    if (selectedRoleId() === 1) return;
    setActiveRolePermIds(allPermissions().map(p => p.id));
  };

  const clearAllPermissions = () => {
    if (selectedRoleId() === 1) return;
    setActiveRolePermIds([]);
  };

  const saveSelectedRolePermissions = async () => {
    const currentRole = roles().find(r => r.id === selectedRoleId());
    if (!currentRole) return;

    setIsSaving(true);
    try {
      await api.put(`/role-permissions/${currentRole.id}`, {
        role_name: currentRole.role_name,
        permission_ids: activeRolePermIds()
      });
      alert(`Successfully updated permissions for ${currentRole.role_name}`);
      fetchRolesAndPermissions();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update role permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Role CRUD ---

  const createRole = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await api.post('/role-permissions', {
        role_name: newRoleName(),
        permission_ids: []
      });
      setRoleModal({ open: false, mode: 'add', roleId: null });
      setNewRoleName('');
      await fetchRolesAndPermissions();
      if (response.data?.data?.newId) {
        setSelectedRoleId(response.data.data.newId);
        setActiveRolePermIds([]);
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to create role.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Master Permission CRUD (Super Admin Only) ---

  const saveMasterPermission = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const modal = permMasterModal();
      if (modal.mode === 'add') {
        await api.post('/permissions', { permission_name: modal.permName });
      } else {
        await api.put(`/permissions/${modal.permId}`, { permission_name: modal.permName });
      }
      setPermMasterModal({ open: false, mode: 'add', permId: null, permName: '' });
      fetchRolesAndPermissions();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save permission string.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Admin User CRUD Handlers ---

  const openAdminModal = async (mode, id = null) => {
    if (mode === 'edit' && id) {
      try {
        const response = await api.get(`/users/${id}`);
        const user = response.data.data;
        setAdminFormData({ username: user.username, password: '', role_id: user.role_id });
        setAdminModal({ open: true, mode: 'edit', userId: id });
      } catch (error) {
        alert('Failed to fetch user details.');
      }
    } else {
      setAdminFormData({ username: '', password: '', role_id: 2 });
      setAdminModal({ open: true, mode: 'add', userId: null });
    }
  };

  const saveAdmin = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (adminModal().mode === 'add') {
        await api.post('/users', {
          username: adminFormData().username,
          password: adminFormData().password,
          role_id: Number(adminFormData().role_id)
        });
      } else {
        await api.put(`/users/${adminModal().userId}`, {
          username: adminFormData().username,
          role_id: Number(adminFormData().role_id)
        });
      }
      setAdminModal({ open: false, mode: 'add', userId: null });
      fetchAdmins();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save admin.');
    } finally {
      setIsSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.put(`/change-password/${passwordModal().userId}`, {
        password: passwordModal().newPassword
      });
      setPasswordModal({ open: false, userId: null, username: '', newPassword: '' });
      alert('Password changed successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to change password.');
    } finally {
      setIsSaving(false);
    }
  };

  const executeConfirmAction = async () => {
    setIsSaving(true);
    try {
      const { type, id } = confirmModal();
      if (type === 'delete_user') {
        await api.delete(`/users/${id}`);
        fetchAdmins();
      } else if (type === 'delete_role') {
        await api.delete(`/role-permissions/${id}`);
        setSelectedRoleId(null);
        fetchRolesAndPermissions();
      } else if (type === 'delete_perm') {
        await api.delete(`/permissions/${id}`);
        fetchRolesAndPermissions();
      }
      setConfirmModal({ open: false, type: '', id: null, title: '', message: '' });
    } catch (error) {
      alert(error.response?.data?.message || 'Action failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabClasses = (tabName) => {
    const isActive = activeTab() === tabName;
    return `px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
      isActive
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-200 dark:hover:border-gray-600'
    }`;
  };

  return (
    <div class="space-y-6 relative">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">System Settings</h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage administrators, roles, permissions, and application preferences.</p>
      </div>

      <div class="border-b border-gray-200 dark:border-gray-700">
        <nav class="-mb-px flex space-x-6">
          <button onClick={() => setActiveTab('users')} class={tabClasses('users')}>
            Admin Management
          </button>
          <button
            onClick={() => {
              setActiveTab('roles');
              fetchRolesAndPermissions();
            }}
            class={tabClasses('roles')}
          >
            Role Permissions
          </button>

          <Show when={isSuperAdmin}>
            <button
              onClick={() => {
                setActiveTab('master_permissions');
                fetchRolesAndPermissions();
              }}
              class={tabClasses('master_permissions')}
            >
              Permission Registry
            </button>
          </Show>

          <button onClick={() => setActiveTab('ui')} class={tabClasses('ui')}>
            UI Customization
          </button>
        </nav>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 min-h-[500px]">
        <Switch fallback={<div class="text-gray-500 dark:text-gray-400">Select a tab to view settings.</div>}>

          {/* TAB 1: ADMIN MANAGEMENT */}
          <Match when={activeTab() === 'users'}>
            <div class="space-y-4">
              <div class="flex justify-between items-center mb-4">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Internal Administrators</h2>
                <button
                  onClick={() => openAdminModal('add')}
                  class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition"
                >
                  + Add Admin
                </button>
              </div>

              <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                      <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    <Show when={!isLoadingAdmins()} fallback={<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">Loading admins...</td></tr>}>
                      <For each={admins()}>
                        {(admin) => (
                          <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{admin.username}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm">
                              <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${admin.role_id === 1 ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'}`}>
                                {admin.role_name}
                              </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {new Date(admin.created_at).toLocaleDateString()}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                              <button onClick={() => openAdminModal('edit', admin.id)} class="text-blue-600 hover:text-blue-900 dark:text-blue-400">Edit</button>
                              <button onClick={() => setPasswordModal({ open: true, userId: admin.id, username: admin.username, newPassword: '' })} class="text-orange-600 hover:text-orange-900 dark:text-orange-400">Password</button>
                              <button onClick={() => setConfirmModal({ open: true, type: 'delete_user', id: admin.id, title: 'Delete Admin', message: `Revoke access for ${admin.username}?` })} class="text-red-600 hover:text-red-900 dark:text-red-400">Delete</button>
                            </td>
                          </tr>
                        )}
                      </For>
                    </Show>
                  </tbody>
                </table>
              </div>
            </div>
          </Match>

          {/* TAB 2: ROLE PERMISSION MANAGEMENT (SPLIT SIDE PANEL) */}
          <Match when={activeTab() === 'roles'}>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Role Access Control</h2>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Select a role on the left to edit its assigned permissions on the right.</p>
                </div>
                <button
                  onClick={() => setRoleModal({ open: true, mode: 'add', roleId: null })}
                  class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition"
                >
                  + Create Role
                </button>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
                {/* Left Side: Role List */}
                <div class="md:col-span-1 space-y-2 border-r border-gray-200 dark:border-gray-700 pr-4">
                  <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Roles</h3>
                  <For each={roles()}>
                    {(role) => (
                      <button
                        onClick={() => selectRoleForEditing(role)}
                        class={`w-full text-left px-4 py-3 rounded-lg font-medium text-sm flex justify-between items-center transition ${
                          selectedRoleId() === role.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>{role.role_name}</span>
                        <Show when={role.id !== 1 && selectedRoleId() === role.id}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmModal({ open: true, type: 'delete_role', id: role.id, title: 'Delete Role', message: `Delete role "${role.role_name}"?` });
                            }}
                            class="text-xs text-red-200 hover:text-white underline"
                          >
                            Del
                          </button>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>

                {/* Right Side: Categorized Checklist */}
                <div class="md:col-span-3 space-y-4">
                  <Show when={selectedRoleId()} fallback={<div class="text-gray-400 italic">Select a role to configure permissions.</div>}>
                    <div class="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
                      <div>
                        <h3 class="text-md font-bold text-gray-900 dark:text-white">
                          Permissions for: {roles().find(r => r.id === selectedRoleId())?.role_name}
                        </h3>
                        <Show when={selectedRoleId() === 1}>
                          <p class="text-xs text-amber-500 mt-0.5">Super Admin permissions are locked to prevent system lockout.</p>
                        </Show>
                      </div>

                      <Show when={selectedRoleId() !== 1}>
                        <div class="flex gap-3 items-center">
                          <div class="space-x-2 text-xs">
                            <button type="button" onClick={selectAllPermissions} class="text-blue-600 hover:underline dark:text-blue-400">Select All</button>
                            <span class="text-gray-400">|</span>
                            <button type="button" onClick={clearAllPermissions} class="text-gray-500 hover:underline dark:text-gray-400">Clear All</button>
                          </div>
                          <button
                            onClick={saveSelectedRolePermissions}
                            disabled={isSaving()}
                            class="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-md text-xs font-semibold transition disabled:opacity-50"
                          >
                            {isSaving() ? 'Saving...' : 'Save Permissions'}
                          </button>
                        </div>
                      </Show>
                    </div>

                    {/* Checkboxes Grid */}
                    <div class="space-y-6 max-h-125 overflow-y-auto pr-2">
                      <For each={Object.keys(categorizedPermissions())}>
                        {(category) => (
                          <div class="bg-gray-50/50 dark:bg-gray-900/30 p-4 rounded-lg border border-gray-200 dark:border-gray-700/60">
                            <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                              {category}
                            </h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              <For each={categorizedPermissions()[category]}>
                                {(perm) => (
                                  <label class="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 p-2 rounded hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 cursor-pointer transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={activeRolePermIds().includes(perm.id)}
                                      disabled={selectedRoleId() === 1}
                                      onChange={() => togglePermissionForSelectedRole(perm.id)}
                                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                                    />
                                    <span class="font-mono text-xs">{perm.permission_name}</span>
                                  </label>
                                )}
                              </For>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          </Match>

          {/* TAB 3: MASTER PERMISSION REGISTRY (SUPER ADMIN ONLY) */}
          <Match when={activeTab() === 'master_permissions' && isSuperAdmin}>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Master Permission Registry</h2>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Manage raw system permission keys used across backend access control guards.</p>
                </div>
                <button
                  onClick={() => setPermMasterModal({ open: true, mode: 'add', permId: null, permName: '' })}
                  class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition"
                >
                  + Add Key
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                <For each={allPermissions()}>
                  {(perm) => (
                    <div class="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3 rounded-md flex justify-between items-center text-sm font-mono">
                      <span class="text-gray-800 dark:text-gray-200 truncate mr-2" title={perm.permission_name}>
                        {perm.permission_name}
                      </span>
                      <div class="flex gap-2">
                        <button
                          onClick={() => setPermMasterModal({ open: true, mode: 'edit', permId: perm.id, permName: perm.permission_name })}
                          class="text-xs text-blue-500 hover:underline font-sans"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmModal({ open: true, type: 'delete_perm', id: perm.id, title: 'Delete Permission Key', message: `Delete permission key "${perm.permission_name}"?` })}
                          class="text-xs text-red-500 hover:underline font-sans"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Match>

          {/* TAB 4: UI CUSTOMIZATION */}
          <Match when={activeTab() === 'ui'}>
            <div class="space-y-4">
              <div class="flex justify-between items-center mb-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Brand Customization</h2>
                <button
                  onClick={saveUiSettings}
                  disabled={isSaving()}
                  class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm transition disabled:opacity-50"
                >
                  {isSaving() ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              <div class="grid grid-cols-1 max-w-lg gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Company Logo URL</label>
                  <input
                    type="text"
                    value={uiFormData().logo_url}
                    onInput={(e) => setUiFormData({...uiFormData(), logo_url: e.target.value})}
                    class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-gray-900 dark:text-white focus:border-blue-500" 
                    placeholder="/logo.svg"
                  />
                  <p class="text-xs text-gray-500 mt-1">Accepts local paths (e.g., /logo.svg) or full web URLs.</p>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Login Background Color</label>
                  <div class="flex gap-2">
                    <input
                      type="color"
                      value={uiFormData().login_bg_color}
                      onInput={(e) => setUiFormData({...uiFormData(), login_bg_color: e.target.value})}
                      class="h-10 w-10 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={uiFormData().login_bg_color}
                      onInput={(e) => setUiFormData({...uiFormData(), login_bg_color: e.target.value})}
                      class="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-gray-900 dark:text-white" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </Match>

        </Switch>
      </div>

      {/* Modal: Create Role */}
      <Show when={roleModal().open}>
        <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New Role</h2>
            <form onSubmit={createRole} class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Name</label>
                <input required type="text" class="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500" value={newRoleName()} onInput={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Moderator" />
              </div>
              <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setRoleModal({ open: false, mode: 'add', roleId: null })} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition" disabled={isSaving()}>Cancel</button>
                <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition" disabled={isSaving()}>{isSaving() ? 'Saving...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* Modal: Master Permission Key */}
      <Show when={permMasterModal().open}>
        <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {permMasterModal().mode === 'add' ? 'Add Permission Key' : 'Edit Permission Key'}
            </h2>
            <form onSubmit={saveMasterPermission} class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Permission Key Name</label>
                <input required type="text" class="w-full font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500" value={permMasterModal().permName} onInput={(e) => setPermMasterModal({ ...permMasterModal(), permName: e.target.value })} placeholder="e.g. export_excel" />
              </div>
              <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setPermMasterModal({ open: false, mode: 'add', permId: null, permName: '' })} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition" disabled={isSaving()}>Cancel</button>
                <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition" disabled={isSaving()}>{isSaving() ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* Modal: Admin Form */}
      <Show when={adminModal().open}>
        <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {adminModal().mode === 'add' ? 'Add New Admin' : 'Edit Admin'}
            </h2>
            <form onSubmit={saveAdmin} class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input required type="text" class="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500" value={adminFormData().username} onInput={(e) => setAdminFormData({...adminFormData(), username: e.target.value})} />
              </div>

              <Show when={adminModal().mode === 'add'}>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <input required type="password" class="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500" value={adminFormData().password} onInput={(e) => setAdminFormData({...adminFormData(), password: e.target.value})} />
                </div>
              </Show>

              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Assignment</label>
                <select class="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500" value={adminFormData().role_id} onChange={(e) => setAdminFormData({...adminFormData(), role_id: e.target.value})}>
                  <For each={roles()}>
                    {(role) => <option value={role.id}>{role.role_name}</option>}
                  </For>
                </select>
              </div>

              <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setAdminModal({ open: false, mode: 'add', userId: null })} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition" disabled={isSaving()}>Cancel</button>
                <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition" disabled={isSaving()}>{isSaving() ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* Modal: Change Password */}
      <Show when={passwordModal().open}>
        <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Change Password</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">For user: {passwordModal().username}</p>
            <form onSubmit={savePassword} class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input required type="password" class="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500" value={passwordModal().newPassword} onInput={(e) => setPasswordModal({...passwordModal(), newPassword: e.target.value})} />
              </div>
              <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setPasswordModal({ open: false, userId: null, username: '', newPassword: '' })} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition" disabled={isSaving()}>Cancel</button>
                <button type="submit" class="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md font-medium transition" disabled={isSaving()}>Update</button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* Universal Confirmation Modal */}
      <Show when={confirmModal().open}>
        <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 text-center">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-2">{confirmModal().title}</h2>
            <p class="text-gray-600 dark:text-gray-400 mb-6">{confirmModal().message}</p>
            <div class="flex justify-center gap-3">
              <button onClick={() => setConfirmModal({ open: false, type: '', id: null, title: '', message: '' })} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition" disabled={isSaving()}>Cancel</button>
              <button onClick={executeConfirmAction} class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition" disabled={isSaving()}>{isSaving() ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
