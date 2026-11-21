import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import AdminClinic from './AdminClinic';
import AdminPerformance from './AdminPerformance';
import AdminSettings from './AdminSettings';
import {
    Users, UserPlus, Key, Trash2, ToggleLeft, ToggleRight,
    Search, RefreshCw, Edit2, X, Check,
    Stethoscope, ClipboardList, Pill, Microscope, ShieldCheck,
    Eye, EyeOff, Activity
} from 'lucide-react';

/* ─── Config par rôle ─── */
const ROLE_CONFIG = {
    doctor:         { label: 'Médecin',        icon: Stethoscope,   color: 'bg-brand-50 text-brand-700 border-brand-200',   badge: 'bg-brand-100 text-brand-700',   dot: 'bg-brand-500' },
    secretary:      { label: 'Secrétaire',      icon: ClipboardList, color: 'bg-teal-50 text-teal-700 border-teal-200',   badge: 'bg-teal-100 text-teal-700',   dot: 'bg-teal-500' },
    pharmacist:     { label: 'Pharmacien',      icon: Pill,          color: 'bg-green-50 text-green-700 border-green-200', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    lab_technician: { label: 'Laborantin',      icon: Microscope,    color: 'bg-purple-50 text-purple-700 border-purple-200', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
    nurse:          { label: 'Infirmier',       icon: Activity,      color: 'bg-pink-50 text-pink-700 border-pink-200', badge: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' },
    admin:          { label: 'Administrateur',  icon: ShieldCheck,   color: 'bg-red-50 text-red-700 border-red-200',      badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
};

const ALL_ROLES = Object.keys(ROLE_CONFIG);
const ROLES_CREATE = ['doctor', 'secretary', 'pharmacist', 'lab_technician', 'nurse'];

/* ─── Champ de formulaire ─── */
function Field({ label, children }) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}

function Input({ ...props }) {
    return <input {...props} className={`w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary outline-none transition ${props.className || ''}`} />;
}

function Select({ children, ...props }) {
    return (
        <select {...props} className={`w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary outline-none transition bg-white ${props.className || ''}`}>
            {children}
        </select>
    );
}

/* ─── Modal wrapper ─── */
function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl relative w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-100">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════════════════════════ */
export default function AdminPage({ tab = 'users' }) {
    const activeTab = tab;
    const [users, setUsers] = useState([]);
    // L'admin connecté ne peut pas désactiver son propre compte (refusé aussi par le serveur)
    const currentUserId = useAuthStore(s => s.user?.id);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('');
    
    // Modals
    const [modalCreate, setModalCreate] = useState(false);
    const [modalPassword, setModalPassword] = useState(null); // user object
    const [modalEdit, setModalEdit] = useState(null);         // user object
    const [modalDelete, setModalDelete] = useState(null);     // user object

    /* ── Chargement ── */
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [usersRes, statsRes] = await Promise.all([
                api.get('/admin/users' + (filterRole ? `?role=${filterRole}` : '')),
                api.get('/admin/stats')
            ]);
            setUsers(usersRes.data || []);
            setStats(statsRes.data);
        } catch {
            toast.error('Erreur de chargement');
        } finally {
            setLoading(false);
        }
    }, [filterRole]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    /* ── Toggle actif/inactif ── */
    const handleToggle = async (user) => {
        try {
            const { data } = await api.patch(`/admin/users/${user.id}/toggle`);
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, statut: data.statut } : u));
            toast.success(`Compte ${data.statut === 'actif' ? 'activé' : 'désactivé'}`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur');
        }
    };

    /* ── Suppression ── */
    const handleDelete = async () => {
        try {
            await api.delete(`/admin/users/${modalDelete.id}`);
            setUsers(prev => prev.filter(u => u.id !== modalDelete.id));
            setModalDelete(null);
            toast.success('Compte supprimé');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur');
        }
    };

    /* ── Filtrage local ── */
    const filtered = users.filter(u => {
        const q = search.toLowerCase();
        return (
            u.nom?.toLowerCase().includes(q) ||
            u.prenom?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.matricule?.toLowerCase().includes(q)
        );
    });

    /* ─── RENDER ─── */
    if (activeTab === 'clinic') return <AdminClinic />;
    if (activeTab === 'performance') return <AdminPerformance />;
    if (activeTab === 'settings') return <AdminSettings />;

    return (
        <div className="space-y-6">
            {activeTab === 'users' && (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="page-title">Gestion des Comptes</h1>
                            <p className="text-sm text-muted mt-0.5">Créer, modifier et gérer tous les accès utilisateurs</p>
                        </div>
                        <button onClick={() => setModalCreate(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold text-sm shadow-md shadow-primary/25 transition">
                            <UserPlus size={16} /> Nouveau compte
                        </button>
                    </div>

                    {/* Stats KPI */}
                    {stats && (
                        <div className="grid grid-cols-5 gap-3">
                            {ROLES_CREATE.map(role => {
                                const cfg = ROLE_CONFIG[role];
                                const Icon = cfg.icon;
                                return (
                                    <button key={role} onClick={() => setFilterRole(filterRole === role ? '' : role)}
                                        className={`bg-white rounded-2xl border p-4 shadow-sm text-left transition hover:shadow-md ${filterRole === role ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <Icon size={16} className={cfg.dot.replace('bg-', 'text-')} />
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-900">{stats[role] ?? 0}</div>
                                        <div className="text-xs text-muted mt-0.5">compte(s)</div>
                                    </button>
                                );
                            })}
                            <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-4 shadow-md text-white">
                                <div className="text-xs font-bold opacity-80 uppercase tracking-wide mb-1">Total actifs</div>
                                <div className="text-3xl font-bold">{stats.actifs ?? 0}</div>
                                <div className="text-xs opacity-70 mt-0.5">/ {stats.total ?? 0} comptes</div>
                            </div>
                        </div>
                    )}

                    {/* Barre de recherche */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Rechercher par nom, email, matricule..."
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
                        </div>
                        <Select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="w-44">
                            <option value="">Tous les rôles</option>
                            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>)}
                        </Select>
                        <button onClick={fetchAll} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                            <RefreshCw size={16} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* Table des utilisateurs */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 text-xs text-muted font-semibold flex items-center justify-between">
                            <span>{filtered.length} compte(s) affiché(s){filterRole ? ` — filtre: ${ROLE_CONFIG[filterRole]?.label}` : ''}</span>
                            {filterRole && <button onClick={() => setFilterRole('')} className="text-primary hover:underline">Effacer filtre</button>}
                        </div>
                        {loading ? (
                            <div className="p-12 text-center text-muted text-sm">
                                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-primary" />
                                Chargement...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-12 text-center text-muted text-sm">Aucun compte trouvé.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-muted border-b border-gray-100">
                                    <tr>
                                        {['Utilisateur', 'Rôle', 'Contact', 'Matricule', 'Statut', 'Actions'].map(h => (
                                            <th key={h} className="px-5 py-3 text-left font-semibold">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filtered.map(user => {
                                        const cfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.admin;
                                        const Icon = cfg.icon;
                                        const initials = `${user.prenom?.[0] || ''}${user.nom?.[0] || ''}`.toUpperCase();
                                        const isActif = user.statut === 'actif';
                                        return (
                                            <tr key={user.id} className={`hover:bg-gray-50/50 transition ${!isActif ? 'opacity-60' : ''}`}>
                                                {/* Utilisateur */}
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${cfg.badge}`}>
                                                            {user.photoUrl ? (
                                                                <img src={user.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                                            ) : initials || '?'}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-gray-900">
                                                                {user.medecinInfo?.titre && <span className="text-muted mr-1">{user.medecinInfo.titre}</span>}
                                                                {user.prenom} {user.nom}
                                                            </div>
                                                            {user.medecinInfo?.specialites?.length > 0 && (
                                                                <div className="text-xs text-muted">{user.medecinInfo.specialites[0]}</div>
                                                            )}
                                                            {user.medecinInfo?.salle && (
                                                                <div className="text-xs text-muted">Salle {user.medecinInfo.salle}</div>
                                                            )}
                                                            {user.role === 'nurse' && user.doctorInfo && (
                                                                <div className="text-[11px] text-primary font-semibold mt-1">
                                                                    Réf : {user.doctorInfo.titre || 'Dr.'} {user.doctorInfo.prenom} {user.doctorInfo.nom}
                                                                    <span className="text-[10px] text-muted font-normal block">({user.doctorInfo.specialites?.[0] || 'Généraliste'})</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Rôle */}
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>
                                                        <Icon size={10} />
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                                {/* Contact */}
                                                <td className="px-5 py-3">
                                                    <div className="text-sm text-gray-700">{user.email}</div>
                                                    {user.telephone && <div className="text-xs text-muted">{user.telephone}</div>}
                                                </td>
                                                {/* Matricule */}
                                                <td className="px-5 py-3 font-mono text-xs text-gray-500">{user.matricule}</td>
                                                {/* Statut */}
                                                <td className="px-5 py-3">
                                                    <button onClick={() => handleToggle(user)}
                                                        disabled={user.id === currentUserId}
                                                        title={user.id === currentUserId ? 'Votre propre compte ne peut pas être désactivé' : undefined}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${isActif ? 'bg-green-100 text-green-700 enabled:hover:bg-red-50 enabled:hover:text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'}`}>
                                                        {isActif ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                                        {isActif ? 'Actif' : 'Inactif'}
                                                    </button>
                                                </td>
                                                {/* Actions */}
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => setModalEdit(user)} title="Modifier"
                                                            className="p-1.5 hover:bg-brand-50 text-brand-500 rounded-lg transition">
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button onClick={() => setModalPassword(user)} title="Changer le mot de passe"
                                                            className="p-1.5 hover:bg-amber-50 text-amber-500 rounded-lg transition">
                                                            <Key size={14} />
                                                        </button>
                                                        {user.role !== 'admin' && (
                                                            <button onClick={() => setModalDelete(user)} title="Supprimer"
                                                                className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* ── MODAL : Créer un compte ── */}
            {modalCreate && <CreateModal onClose={() => setModalCreate(false)} onSuccess={() => { setModalCreate(false); fetchAll(); }} />}

            {/* ── MODAL : Modifier ── */}
            {modalEdit && <EditModal user={modalEdit} onClose={() => setModalEdit(null)} onSuccess={() => { setModalEdit(null); fetchAll(); }} />}

            {/* ── MODAL : Reset password ── */}
            {modalPassword && <PasswordModal user={modalPassword} onClose={() => setModalPassword(null)} />}

            {/* ── MODAL : Supprimer ── */}
            {modalDelete && (
                <Modal title="Confirmer la suppression" onClose={() => setModalDelete(null)}>
                    <div className="text-sm text-gray-600 mb-6">
                        Supprimer le compte de <strong>{modalDelete.prenom} {modalDelete.nom}</strong> ?
                        Cette action est <span className="text-red-600 font-semibold">irréversible</span>.
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setModalDelete(null)}
                            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition">
                            Annuler
                        </button>
                        <button onClick={handleDelete}
                            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition">
                            Supprimer
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL : Créer un compte
═══════════════════════════════════════════════════════════════════════════ */
function CreateModal({ onClose, onSuccess }) {
    const [form, setForm] = useState({
        role: 'secretary', nom: '', prenom: '', email: '',
        password: '', telephone: '', specialite: '', titre: 'Dr.', salleConsultation: '', doctorId: ''
    });
    const [doctors, setDoctors] = useState([]);
    const [showPass, setShowPass] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    useEffect(() => {
        api.get('/admin/users?role=doctor')
            .then(r => setDoctors(r.data || []))
            .catch(console.error);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post('/admin/users', form);
            toast.success(`Compte ${ROLE_CONFIG[form.role]?.label} créé avec succès !`);
            onSuccess();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la création');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title="Créer un compte" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Rôle */}
                <Field label="Rôle *">
                    <div className="grid grid-cols-2 gap-2">
                        {ROLES_CREATE.map(r => {
                            const cfg = ROLE_CONFIG[r];
                            const Icon = cfg.icon;
                            return (
                                <button type="button" key={r} onClick={() => set('role', r)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition ${form.role === r ? `border-primary bg-primary/5 text-primary` : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    <Icon size={14} /> {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Prénom *"><Input required value={form.prenom} onChange={e => set('prenom', e.target.value)} /></Field>
                    <Field label="Nom *"><Input required value={form.nom} onChange={e => set('nom', e.target.value)} /></Field>
                </div>
                <Field label="Email (identifiant de connexion) *">
                    <Input required type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </Field>
                <Field label="Mot de passe *">
                    <div className="relative">
                        <Input required type={showPass ? 'text' : 'password'} value={form.password}
                            onChange={e => set('password', e.target.value)} placeholder="Min. 6 caractères" />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                </Field>
                <Field label="Téléphone">
                    <Input type="tel" value={form.telephone} onChange={e => set('telephone', e.target.value)} />
                </Field>

                {/* Champs spécifiques médecin */}
                {form.role === 'doctor' && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Titre">
                                <Select value={form.titre} onChange={e => set('titre', e.target.value)}>
                                    <option>Dr.</option>
                                    <option>Pr.</option>
                                    <option>Chirurgien</option>
                                </Select>
                            </Field>
                            <Field label="Salle de consultation">
                                <Input value={form.salleConsultation} onChange={e => set('salleConsultation', e.target.value)} placeholder="Ex: S-12" />
                            </Field>
                        </div>
                        <Field label="Spécialité">
                            <Input value={form.specialite} onChange={e => set('specialite', e.target.value)} placeholder="Ex: Cardiologie" />
                        </Field>
                    </>
                )}
                {/* Champs spécifiques infirmier */}
                {form.role === 'nurse' && (
                    <Field label="Médecin Référent / Responsable *">
                        <Select required value={form.doctorId} onChange={e => set('doctorId', e.target.value)}>
                            <option value="">Sélectionner un médecin</option>
                            {doctors.map(d => (
                                <option key={d.id} value={d.medecinInfo?.medecinId}>
                                    {d.medecinInfo?.titre || 'Dr.'} {d.prenom} {d.nom} ({d.medecinInfo?.specialites?.[0] || 'Généraliste'})
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                <button type="submit" disabled={submitting}
                    className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                    {submitting
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Création...</>
                        : <><UserPlus size={16} /> Créer le compte</>
                    }
                </button>
            </form>
        </Modal>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL : Modifier un compte
═══════════════════════════════════════════════════════════════════════════ */
function EditModal({ user, onClose, onSuccess }) {
    const [form, setForm] = useState({
        nom: user.nom || '',
        prenom: user.prenom || '',
        email: user.email || '',
        telephone: user.telephone || '',
        statut: user.statut || 'actif',
        specialite: user.medecinInfo?.specialites?.[0] || '',
        salleConsultation: user.medecinInfo?.salle || '',
        doctorId: user.doctor_id || user.doctorId || '',
    });
    const [doctors, setDoctors] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    useEffect(() => {
        api.get('/admin/users?role=doctor')
            .then(r => setDoctors(r.data || []))
            .catch(console.error);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.put(`/admin/users/${user.id}`, form);
            toast.success('Compte mis à jour !');
            onSuccess();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur');
        } finally {
            setSubmitting(false);
        }
    };

    const cfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.admin;

    return (
        <Modal title={`Modifier — ${user.prenom} ${user.nom}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${cfg.color}`}>
                    <cfg.icon size={11} /> {cfg.label}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Prénom"><Input required value={form.prenom} onChange={e => set('prenom', e.target.value)} /></Field>
                    <Field label="Nom"><Input required value={form.nom} onChange={e => set('nom', e.target.value)} /></Field>
                </div>
                <Field label="Email"><Input required type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
                <Field label="Téléphone"><Input value={form.telephone} onChange={e => set('telephone', e.target.value)} /></Field>
                <Field label="Statut">
                    <Select value={form.statut} onChange={e => set('statut', e.target.value)}>
                        <option value="actif">Actif</option>
                        <option value="inactif">Inactif</option>
                        <option value="conge">En congé</option>
                    </Select>
                </Field>
                {user.role === 'doctor' && (
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Spécialité"><Input value={form.specialite} onChange={e => set('specialite', e.target.value)} /></Field>
                        <Field label="Salle"><Input value={form.salleConsultation} onChange={e => set('salleConsultation', e.target.value)} /></Field>
                    </div>
                )}
                {user.role === 'nurse' && (
                    <Field label="Médecin Référent / Responsable *">
                        <Select required value={form.doctorId} onChange={e => set('doctorId', e.target.value)}>
                            <option value="">Sélectionner un médecin</option>
                            {doctors.map(d => (
                                <option key={d.id} value={d.medecinInfo?.medecinId}>
                                    {d.medecinInfo?.titre || 'Dr.'} {d.prenom} {d.nom} ({d.medecinInfo?.specialites?.[0] || 'Généraliste'})
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}
                <button type="submit" disabled={submitting}
                    className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                    Enregistrer
                </button>
            </form>
        </Modal>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL : Reset mot de passe
═══════════════════════════════════════════════════════════════════════════ */
function PasswordModal({ user, onClose }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password.length < 6) return toast.error('Minimum 6 caractères');
        if (password !== confirm) return toast.error('Mots de passe différents');
        setSubmitting(true);
        try {
            await api.put(`/admin/users/${user.id}/password`, { password });
            toast.success('Mot de passe mis à jour !');
            onClose();
        } catch {
            toast.error('Erreur');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={`Changer le mot de passe`} onClose={onClose}>
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                🔒 Réinitialisation pour <strong>{user.prenom} {user.nom}</strong>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Nouveau mot de passe">
                    <div className="relative">
                        <Input required type={showPass ? 'text' : 'password'} value={password}
                            onChange={e => setPassword(e.target.value)} placeholder="Min. 6 caractères" />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                </Field>
                <Field label="Confirmer le mot de passe">
                    <Input required type={showPass ? 'text' : 'password'} value={confirm}
                        onChange={e => setConfirm(e.target.value)} placeholder="Répéter le mot de passe" />
                </Field>
                {password && confirm && password !== confirm && (
                    <div className="text-xs text-red-600 font-semibold">⚠ Les mots de passe ne correspondent pas</div>
                )}
                <button type="submit" disabled={submitting || (password && confirm && password !== confirm)}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Key size={16} />}
                    Mettre à jour
                </button>
            </form>
        </Modal>
    );
}
