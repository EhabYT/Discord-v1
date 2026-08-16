import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Trash2, RefreshCw, ChevronDown, Lock, Eye, Music, Swords, Crown } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const LEVEL_META = [
  { level: 0, name: 'Viewer',    color: 'text-gray-400',   bg: 'bg-gray-500/10 border-gray-500/30',    icon: Eye,    desc: 'Read-only: overview, stats, members' },
  { level: 1, name: 'DJ',        color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30',    icon: Music,  desc: 'Viewer + music controller' },
  { level: 2, name: 'Moderator', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: Swords, desc: 'DJ + members, automod, logging, giveaways' },
  { level: 3, name: 'Admin',     color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/30',    icon: Crown,  desc: 'Full access including security & settings' },
];

function LevelBadge({ level }) {
  const meta = LEVEL_META[level] ?? LEVEL_META[0];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${meta.bg} ${meta.color}`}>
      <Icon size={11} />{meta.name}
    </span>
  );
}

export default function Permissions({ guild, guildData }) {
  const toast = useToast();
  const [perms,       setPerms]       = useState([]);
  const [myLevel,     setMyLevel]     = useState(0);
  const [roles,       setRoles]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [selectedRole,  setSelectedRole]  = useState('');
  const [selectedLevel, setSelectedLevel] = useState(2);
  const [roleDropOpen,  setRoleDropOpen]  = useState(false);
  const [roleQuery,     setRoleQuery]     = useState('');

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const [p, me] = await Promise.all([
        api.get(`/api/guild/${guild.id}/permissions`),
        api.get(`/api/guild/${guild.id}/permissions/my-level`),
      ]);
      setPerms(p.perms || []);
      setMyLevel(me.level ?? 0);
    } catch (_) {}
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (guildData?.guild?.roles) {
      setRoles(guildData.guild.roles.filter(r => r.name !== '@everyone'));
    }
  }, [guildData]);

  const assignedRoleIds  = perms.map(p => p.roleId);
  const availableRoles   = roles.filter(r => !assignedRoleIds.includes(r.id));
  const selectedRoleName = roles.find(r => r.id === selectedRole)?.name || 'Select a role…';
  const isAdmin          = myLevel >= 3;

  const handleAdd = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await api.post(`/api/guild/${guild.id}/permissions`, { roleId: selectedRole, level: selectedLevel });
      setPerms(res.perms || []);
      setSelectedRole('');
      toast.success('Permission assigned.');
    } catch (e) { toast.error(e.message || 'Failed to assign permission.'); }
    setSaving(false);
  };

  const handleRemove = async (roleId) => {
    setSaving(true);
    try {
      const res = await api.delete(`/api/guild/${guild.id}/permissions/${roleId}`);
      setPerms(res.perms || []);
      toast.success('Permission removed.');
    } catch (e) { toast.error(e.message || 'Failed to remove permission.'); }
    setSaving(false);
  };

  const handleChangeLevel = async (roleId, level) => {
    setSaving(true);
    try {
      const res = await api.post(`/api/guild/${guild.id}/permissions`, { roleId, level });
      setPerms(res.perms || []);
    } catch (e) { toast.error(e.message || 'Failed to update level.'); }
    setSaving(false);
  };

  if (!guild) {return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-500 text-sm">Select a server to manage permissions.</p>
    </div>
  );}

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Shield} title="Role Permissions" subtitle="Control which Discord roles can access dashboard features">
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.08]">
          Your access: <LevelBadge level={myLevel} />
        </div>
        <button onClick={load} disabled={loading} className="cyber-button flex items-center gap-1.5 text-xs py-1.5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      {/* Level reference */}
      <div className="cyber-card p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Lock size={12} className="text-cyan-400" /> Permission Levels
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {LEVEL_META.map(meta => {
            const Icon = meta.icon;
            return (
              <div key={meta.level} className={`rounded-xl border p-4 space-y-2 ${meta.bg}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className={meta.color} />
                  <span className={`text-sm font-bold ${meta.color}`}>{meta.name}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">{meta.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current assignments */}
      <div className="cyber-card p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Role Assignments</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-white/[0.04] rounded-lg animate-pulse" />)}
          </div>
        ) : perms.length === 0 ? (
          <div className="text-center py-8">
            <Shield size={32} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No role permissions configured yet.</p>
            <p className="text-gray-600 text-xs mt-1">Server owner & Discord Admins always have full access.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {perms.map((perm, i) => (
              <div key={perm.roleId}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-cyan-500/20 transition-all animate-slide-in"
                style={{ animationDelay: `${i * 50}ms` }}>
                <span className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: perm.roleColor || '#888', boxShadow: `0 0 6px ${perm.roleColor || '#888'}60` }} />
                <span className="text-sm text-gray-200 font-medium flex-1 truncate">{perm.roleName}</span>
                {isAdmin ? (
                  <select value={perm.level}
                    onChange={e => handleChangeLevel(perm.roleId, parseInt(e.target.value))}
                    disabled={saving}
                    className="cyber-select text-xs w-36">
                    {LEVEL_META.map(m => <option key={m.level} value={m.level}>{m.name}</option>)}
                  </select>
                ) : (
                  <LevelBadge level={perm.level} />
                )}
                {isAdmin && (
                  <button onClick={() => handleRemove(perm.roleId)} disabled={saving}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Permission */}
      {isAdmin ? (
        <div className="cyber-card p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Plus size={12} className="text-cyan-400" /> Assign Role Permission
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="relative">
              <button onClick={() => setRoleDropOpen(v => !v)}
                className="cyber-input flex items-center justify-between cursor-pointer">
                <span className={selectedRole ? 'text-white' : 'text-gray-500'}>{selectedRoleName}</span>
                <ChevronDown size={14} className={`text-gray-500 transition-transform ${roleDropOpen ? 'rotate-180' : ''}`} />
              </button>
              {roleDropOpen && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-[#0B0E14] border border-cyan-500/30 rounded-lg overflow-auto max-h-48 shadow-xl">
                  {availableRoles.length > 5 && (
                    <div className="p-2 border-b border-white/[0.06]">
                      <input
                        autoFocus
                        value={roleQuery}
                        onChange={(e) => setRoleQuery(e.target.value)}
                        placeholder="Find a role…"
                        className="cyber-input text-xs py-1.5"
                      />
                    </div>
                  )}
                  {availableRoles.filter((r) => !roleQuery.trim() || r.name.toLowerCase().includes(roleQuery.toLowerCase())).length === 0
                    ? <p className="px-3 py-2 text-xs text-gray-500">{availableRoles.length === 0 ? 'All roles assigned' : 'No roles match'}</p>
                    : availableRoles.filter((r) => !roleQuery.trim() || r.name.toLowerCase().includes(roleQuery.toLowerCase())).map(r => (
                        <button key={r.id}
                          onClick={() => { setSelectedRole(r.id); setRoleDropOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cyan-500/10 transition-colors text-left">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color || '#888' }} />
                          <span className="text-xs text-gray-200">{r.name}</span>
                        </button>
                      ))
                  }
                </div>
              )}
            </div>
            <select value={selectedLevel}
              onChange={e => setSelectedLevel(parseInt(e.target.value))}
              className="cyber-select">
              {LEVEL_META.map(m => <option key={m.level} value={m.level}>{m.name} — {m.desc}</option>)}
            </select>
            <button onClick={handleAdd} disabled={!selectedRole || saving}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                selectedRole && !saving
                  ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30'
                  : 'bg-white/[0.04] border border-white/[0.08] text-gray-500 cursor-not-allowed'
              }`}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Assign
            </button>
          </div>
          <p className="text-[11px] text-gray-600">
            Server owner and Discord Administrators always have Admin access regardless of this config.
          </p>
        </div>
      ) : (
        <div className="cyber-card p-4 border-yellow-500/20 bg-yellow-500/[0.04]">
          <p className="text-xs text-yellow-400 flex items-center gap-2">
            <Lock size={13} /> You need Admin access to modify role permissions.
          </p>
        </div>
      )}
    </div>
  );
}
