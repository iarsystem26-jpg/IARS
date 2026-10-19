import { SelectField } from '../ui/SelectField';
import React, { useState, useSyncExternalStore } from 'react';
import { ShieldCheck, Plus, Edit2, Trash2, Lock, Sparkles } from 'lucide-react';
import { appData, subscribeData } from '../../lib/backend';
import { CustomRole, CoreRole, AppPermission } from '../../types';
import { ALL_PERMISSIONS } from '../../lib/accessControl';
import { Modal } from '../ui/Modal';

export const AdminRBACRoleView: React.FC<{ actorName?: string }> = ({ actorName }) => {
  const coreRoles = useSyncExternalStore(subscribeData, appData.getCoreRoles);
  const customRoles = useSyncExternalStore(subscribeData, appData.getCustomRoles);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    isPositionOnly: false,
    permissions: [] as AppPermission[]
  });

  const openCreateModal = () => {
    setEditingRoleId(null);
    setRoleForm({
      name: '',
      description: '',
      isPositionOnly: false,
      permissions: ['attendance.scan']
    });
    setShowRoleModal(true);
  };

  const openEditModal = (role: CustomRole | CoreRole) => {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description,
      isPositionOnly: role.isPositionOnly,
      permissions: role.permissions || []
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRoleId) {
      if (coreRoles[editingRoleId] || ['admin', 'ossa', 'ossa_staff', 'ssg', 'mayor', 'student'].includes(editingRoleId)) {
        await appData.updateCoreRole(editingRoleId, {
          name: roleForm.name,
          description: roleForm.description,
          isPositionOnly: roleForm.isPositionOnly,
          permissions: roleForm.isPositionOnly ? [] : roleForm.permissions
        });
      } else {
        await appData.updateCustomRole(editingRoleId, {
          name: roleForm.name,
          description: roleForm.description,
          isPositionOnly: roleForm.isPositionOnly,
          permissions: roleForm.isPositionOnly ? [] : roleForm.permissions
        });
      }
    } else {
      await appData.createCustomRole({
        name: roleForm.name,
        description: roleForm.description,
        isPositionOnly: roleForm.isPositionOnly,
        permissions: roleForm.isPositionOnly ? [] : roleForm.permissions,
        createdBy: actorName || 'System Admin'
      });
    }
    setShowRoleModal(false);
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (confirm(`Are you sure you want to delete custom role "${roleName}"?`)) {
      await appData.deleteCustomRole(roleId);
    }
  };

  const togglePermission = (permId: AppPermission) => {
    setRoleForm(prev => {
      const exists = prev.permissions.includes(permId);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter(p => p !== permId)
          : [...prev.permissions, permId]
      };
    });
  };

  const categories = Array.from(new Set(ALL_PERMISSIONS.map(p => p.category)));

  return (
    <div className="space-y-6 animate-in fade-in duration-fast">
      {/* HERO HEADER */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-2xl shrink-0">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold uppercase tracking-tight">RBAC & Custom Roles Management</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500 text-white">
                  DYNAMIC RBAC
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-1 max-w-2xl">
                Define custom roles, assign granular permissions, or create position-only roles without special access.
              </p>
            </div>
          </div>

          <button
            onClick={openCreateModal}
            className="px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-purple-600 hover:bg-purple-700 text-white shadow-lg flex items-center justify-center gap-2 transition"
          >
            <Plus size={16} /> Create Custom Role
          </button>
        </div>
      </div>
      {/* BUILT-IN SYSTEM ROLES LIST */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Lock size={18} className="text-purple-500" /> Core System Roles (Built-in)
        </h3>

        {Object.keys(coreRoles).length === 0 && <p role="status" className="text-xs text-slate-500 dark:text-slate-400">Loading roles…</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.values(coreRoles).map(role => (
            <div key={role.id} className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{role.name}</span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                    SYSTEM CORE
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{role.description}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800 mt-auto">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                  {role.isPositionOnly ? '0 Permissions (Position Only)' : `${(role.permissions || []).length} Permissions Granted`}
                </span>
                <button
                  type="button"
                  onClick={() => openEditModal(role)}
                  aria-label={`Edit role ${role.name}`}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/80 flex items-center gap-1 transition"
                >
                  <Edit2 size={13} /> Edit Role
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* CUSTOM ROLES SECTION */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" /> Custom Institutional Roles & Positions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Custom RBAC roles created specifically for your institution&apos;s governance hierarchy.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="px-3.5 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase tracking-wider hover:bg-purple-100 flex items-center gap-1.5 transition"
          >
            <Plus size={14} /> Add Role
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.values(customRoles).length > 0 ? (
            Object.values(customRoles).map(role => (
              <div
                key={role.id}
                className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{role.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        role.isPositionOnly ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                      }`}>
                        {role.isPositionOnly ? 'POSITION TITLE ONLY' : 'FUNCTIONAL RBAC'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{role.description}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(role)}
                      className="p-1.5 text-slate-500 hover:text-purple-600 rounded-lg hover:bg-purple-50 dark:hover:bg-slate-800 transition"
                      title="Edit Permissions"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteRole(role.id, role.name)}
                      className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-slate-800 transition"
                      title="Delete Role"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {!role.isPositionOnly && (
                  <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Granted Permissions ({role.permissions.length}):
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map(perm => (
                        <span key={perm} className="text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 col-span-2 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              {Object.keys(coreRoles).length === 0 ? 'Loading custom roles…' : <>No custom roles created yet. Click &quot;Create Custom Role&quot; to define institution positions.</>}
            </div>
          )}
        </div>
      </div>
      {/* ROLE MODAL */}
      <Modal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title={editingRoleId ? (coreRoles[editingRoleId] ? `Edit System Core Role (${coreRoles[editingRoleId].name})` : 'Edit Custom Role') : 'Create New Custom Role'}
        description="Customize role type and granular access permissions"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setShowRoleModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="rbac-role-form"
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-purple-600 hover:bg-purple-700 text-white shadow-md"
            >
              {editingRoleId ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        }
      >
        <form id="rbac-role-form" onSubmit={handleSaveRole} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Role / Position Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Guidance Officer, Vice Mayor..."
                    value={roleForm.name}
                    onChange={(e) => setRoleForm(prev => ({ ...prev, name: e.target.value }))}
                    className="app-control w-full h-10 px-3 mt-1 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Role Nature Type</label>
                  <SelectField aria-label="Role Nature Type"
                    value={roleForm.isPositionOnly ? 'position' : 'functional'}
                    onChange={(e) => setRoleForm(prev => ({ ...prev, isPositionOnly: e === 'position' }))}
                    className="mt-1 min-w-0"
                  >
                    <option value="functional">Functional Role (Grants Permissions)</option>
                    <option value="position">Position Title Only (No Permissions)</option>
                  </SelectField>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe the duties and responsibilities of this role..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm(prev => ({ ...prev, description: e.target.value }))}
                  className="app-control w-full p-3 mt-1 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              {!roleForm.isPositionOnly && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Granular App Permissions
                    </label>
                    <span className="text-[11px] text-purple-600 dark:text-purple-400 font-bold">
                      {roleForm.permissions.length} Selected
                    </span>
                  </div>

                  <div className="space-y-4 max-h-[250px] overflow-y-auto pr-1">
                    {categories.map(cat => {
                      const catPerms = ALL_PERMISSIONS.filter(p => p.category === cat);
                      return (
                        <div key={cat} className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                            {cat} Permissions
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {catPerms.map(perm => {
                              const checked = roleForm.permissions.includes(perm.id);
                              return (
                                <label
                                  key={perm.id}
                                  className={`p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 ${
                                    checked
                                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800/60 text-purple-950 dark:text-purple-100'
                                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    aria-label={perm.name}
                                    checked={checked}
                                    onChange={() => togglePermission(perm.id)}
                                    className="mt-0.5 rounded text-purple-600"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold">{perm.name}</div>
                                    <p className="text-[10px] opacity-75">{perm.description}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
        </form>
      </Modal>
    </div>
  );
};
