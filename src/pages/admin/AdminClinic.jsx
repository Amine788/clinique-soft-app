import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { urlPublique } from '../../utils/helpers';
import {
    Building2, Phone, Mail, MapPin, FileText, Shield,
    Users, Bed, Plus, Save, Upload, Copy, Check,
    Key, Pencil, Trash2, X, ToggleLeft, ToggleRight, ChevronRight
} from 'lucide-react';

function Field({ label, children }) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">{label}</label>
            {children}
        </div>
    );
}

const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary outline-none transition";

/* ── Modal wrapper ── */
function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl relative w-full max-w-md border border-gray-100">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                        <X size={16} className="text-gray-500" />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

export default function AdminClinic() {
    const [info, setInfo] = useState({
        name: '', address: '', phone: '', email: '', specialty: '',
        ice: '', ifNum: '', rc: '', tp: '', rib: '', logoUrl: null,
        displayKey: null
    });
    const [saving, setSaving] = useState(false);
    const logoInputRef = useRef(null);
    const [logoUploading, setLogoUploading] = useState(false);

    const handleLogoChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
            toast.error('Logo : image PNG ou JPEG de 2 Mo maximum');
            return;
        }
        setLogoUploading(true);
        try {
            const formData = new FormData();
            formData.append('logo', file);
            const { data } = await api.post('/clinic/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setInfo(prev => ({ ...prev, logoUrl: data.logoUrl }));
            toast.success('Logo mis à jour');
        } catch (err) {
            toast.error(err.response?.data?.error || "Erreur lors de l'envoi du logo");
        } finally {
            setLogoUploading(false);
        }
    };

    /* ── Départements ── */
    const [deps, setDeps] = useState([]);
    const [depsLoading, setDepsLoading] = useState(true);
    const [modalDep, setModalDep] = useState(null); // null | 'create' | depObject
    const [depForm, setDepForm] = useState({ nom: '', chef: '', lits: '', description: '' });
    const [depSaving, setDepSaving] = useState(false);

    /* ── Chargement clinique ── */
    useEffect(() => {
        api.get('/clinic').then(r => {
            if (r.data) setInfo({
                ...r.data,
                specialty: r.data.specialite || '',

                displayKey: r.data.displayKey || null  // 🔐 Clé masquée : CLN-XXXX-****-****
            });
        }).catch(() => {});
    }, []);

    /* ── Chargement départements ── */
    const fetchDeps = useCallback(() => {
        setDepsLoading(true);
        api.get('/clinic/departements')
            .then(r => setDeps(r.data || []))
            .catch(() => toast.error('Impossible de charger les départements'))
            .finally(() => setDepsLoading(false));
    }, []);

    useEffect(() => { fetchDeps(); }, [fetchDeps]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/clinic', info);
            toast.success('Informations de la clinique mises à jour');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la mise à jour');
        } finally {
            setSaving(false);
        }
    };

    const set = (k, v) => setInfo(prev => ({ ...prev, [k]: v }));

    /* ── CRUD Départements ── */
    const openCreateDep = () => {
        setDepForm({ nom: '', chef: '', lits: '', description: '' });
        setModalDep('create');
    };

    const openEditDep = (dep) => {
        setDepForm({ nom: dep.nom, chef: dep.chef || '', lits: dep.lits?.toString() || '', description: dep.description || '' });
        setModalDep(dep);
    };

    const handleDepSubmit = async (e) => {
        e.preventDefault();
        if (!depForm.nom.trim()) return toast.error('Le nom est obligatoire');
        setDepSaving(true);
        try {
            if (modalDep === 'create') {
                await api.post('/clinic/departements', depForm);
                toast.success('Département créé');
            } else {
                await api.put(`/clinic/departements/${modalDep.id}`, depForm);
                toast.success('Département modifié');
            }
            setModalDep(null);
            fetchDeps();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur');
        } finally {
            setDepSaving(false);
        }
    };

    const handleToggleDep = async (dep) => {
        try {
            const { data } = await api.patch(`/clinic/departements/${dep.id}/toggle`);
            setDeps(prev => prev.map(d => d.id === dep.id ? { ...d, statut: data.statut } : d));
        } catch {
            toast.error('Erreur');
        }
    };

    const handleDeleteDep = async (dep) => {
        if (!window.confirm(`Supprimer le département "${dep.nom}" ?`)) return;
        try {
            await api.delete(`/clinic/departements/${dep.id}`);
            setDeps(prev => prev.filter(d => d.id !== dep.id));
            toast.success('Département supprimé');
        } catch {
            toast.error('Erreur lors de la suppression');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Ma Clinique</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Identité, structure interne et organisation</p>
                </div>
                <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary-hover transition disabled:opacity-60">
                    <Save size={16} />
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* ─── Colonne principale ─── */}
                <div className="col-span-2 space-y-6">

                    {/* Identité */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-2">
                            <Building2 size={18} className="text-primary" /> Identité &amp; Coordonnées
                        </h2>
                        <div className="grid grid-cols-2 gap-5">
                            <Field label="Nom de la clinique">
                                <input value={info.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Ex: Clinique Al Amal" />
                            </Field>
                            <Field label="Spécialité principale">
                                <input value={info.specialty} onChange={e => set('specialty', e.target.value)} className={inputCls} placeholder="Ex: Médecine générale" />
                            </Field>
                            <Field label="Email officiel">
                                <div className="relative">
                                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input value={info.email} onChange={e => set('email', e.target.value)} className={inputCls + ' pl-9'} type="email" />
                                </div>
                            </Field>
                            <Field label="Téléphone">
                                <div className="relative">
                                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input value={info.phone} onChange={e => set('phone', e.target.value)} className={inputCls + ' pl-9'} />
                                </div>
                            </Field>
                            <div className="col-span-2">
                                <Field label="Adresse complète">
                                    <div className="relative">
                                        <MapPin size={14} className="absolute left-3 top-3 text-gray-400" />
                                        <input value={info.address} onChange={e => set('address', e.target.value)} className={inputCls + ' pl-9'} />
                                    </div>
                                </Field>
                            </div>
                        </div>
                    </div>

                    {/* Informations légales */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-2">
                            <FileText size={18} className="text-primary" /> Informations Légales &amp; Fiscales
                        </h2>
                        {/* Exemples neutres : jamais de vrais numéros d'une société en texte d'exemple */}
                        <div className="grid grid-cols-2 gap-5">
                            <div className="col-span-2">
                                <Field label="Raison sociale">
                                    <input value={info.raisonSociale || ''} onChange={e => set('raisonSociale', e.target.value)} className={inputCls} placeholder="Ex : STE CLINIQUE AL AMAL SARL" />
                                </Field>
                            </div>
                            <Field label="ICE (Identifiant Commun Entreprise)">
                                <input value={info.ice || ''} onChange={e => set('ice', e.target.value)} className={inputCls} placeholder="15 chiffres" />
                            </Field>
                            <Field label="IF (Identifiant Fiscal)">
                                <input value={info.ifNum || ''} onChange={e => set('ifNum', e.target.value)} className={inputCls} placeholder="Ex : 12345678" />
                            </Field>
                            <Field label="RC (Registre du Commerce)">
                                <input value={info.rc || ''} onChange={e => set('rc', e.target.value)} className={inputCls} placeholder="Ex : 12345" />
                            </Field>
                            <Field label="TP (Taxe Professionnelle)">
                                <input value={info.tp || ''} onChange={e => set('tp', e.target.value)} className={inputCls} placeholder="Ex : 12345678" />
                            </Field>
                            <div className="col-span-2">
                                <Field label="RIB (Relevé d'Identité Bancaire)">
                                    <input value={info.rib || ''} onChange={e => set('rib', e.target.value)} className={inputCls} placeholder="24 chiffres" />
                                </Field>
                            </div>
                        </div>
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3">
                            <Shield size={16} className="text-blue-600 shrink-0" />
                            <div className="text-xs text-blue-700">Ces informations apparaissent sur les <strong>factures, ordonnances et en-têtes officiels</strong> de la clinique.</div>
                        </div>
                    </div>

                    {/* ── Départements & Services (connecté à la DB) ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <Users size={18} className="text-primary" /> Départements &amp; Services
                            </h2>
                            <button onClick={openCreateDep}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-primary text-primary text-xs font-bold rounded-xl hover:bg-primary/5 transition">
                                <Plus size={13} /> Ajouter
                            </button>
                        </div>

                        {depsLoading ? (
                            <div className="py-8 text-center text-sm text-gray-400">Chargement...</div>
                        ) : deps.length === 0 ? (
                            <div className="py-10 text-center border-2 border-dashed border-gray-100 rounded-xl">
                                <Users size={32} className="mx-auto text-gray-200 mb-3" />
                                <p className="text-sm font-semibold text-gray-400">Aucun département créé</p>
                                <p className="text-xs text-gray-300 mt-1">Cliquez sur « Ajouter » pour créer votre premier service</p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-gray-100">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-400 uppercase">
                                        <tr>
                                            {['Service', 'Chef de service', 'Lits', 'Statut', 'Actions'].map(h => (
                                                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {deps.map(d => (
                                            <tr key={d.id} className={`hover:bg-gray-50/50 transition ${d.statut === 'inactif' ? 'opacity-55' : ''}`}>
                                                <td className="px-4 py-3 font-semibold text-gray-900">
                                                    {d.nom}
                                                    {d.description && <div className="text-xs text-gray-400 font-normal mt-0.5">{d.description}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">{d.chef || <span className="italic text-gray-300">—</span>}</td>
                                                <td className="px-4 py-3">
                                                    <span className="flex items-center gap-1 text-xs text-gray-600"><Bed size={12} />{d.lits} lits</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button onClick={() => handleToggleDep(d)}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${d.statut === 'actif' ? 'bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600'}`}>
                                                        {d.statut === 'actif' ? <><ToggleRight size={11} /> Actif</> : <><ToggleLeft size={11} /> Inactif</>}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => openEditDep(d)} title="Modifier"
                                                            className="p-1.5 hover:bg-blue-50 text-blue-400 rounded-lg transition">
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button onClick={() => handleDeleteDep(d)} title="Supprimer"
                                                            className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── Colonne droite ─── */}
                <div className="space-y-6">
                    {/* Logo */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                        <div className="text-xs font-bold text-gray-400 uppercase mb-4">Logo de la Clinique</div>
                        <div className="w-36 h-36 mx-auto rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center mb-4 overflow-hidden">
                            {info.logoUrl ? (
                                <img src={urlPublique(info.logoUrl)} alt="Logo de la clinique" className="w-28 h-28 object-contain" />
                            ) : (
                                <Building2 size={40} className="text-gray-300" aria-hidden="true" />
                            )}
                        </div>
                        {/* Logo repris sur les factures, ordonnances PDF et le menu */}
                        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoChange} />
                        <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                            className="flex items-center gap-2 mx-auto text-primary font-bold text-sm hover:underline disabled:opacity-60">
                            <Upload size={14} /> {logoUploading ? 'Envoi…' : info.logoUrl ? 'Changer le logo' : 'Ajouter un logo'}
                        </button>
                        <p className="mt-2 text-[11px] text-gray-400">PNG ou JPEG, 2 Mo maximum</p>
                    </div>

                    {/* ─── Clé de Licence (masquée) ─── */}
                    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-5 text-white shadow-xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Key size={14} className="text-primary" />
                            <div className="text-xs font-bold text-gray-300 uppercase tracking-widest">Clé de Licence</div>
                        </div>
                        {info.displayKey ? (
                            <>
                                {/* Clé masquée */}
                                <div className="font-mono text-base font-black tracking-widest text-white mb-3 break-all">
                                    {info.displayKey}
                                </div>
                                {/* Badge sécurité */}
                                <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                                    <Shield size={12} className="text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-amber-300 leading-relaxed">
                                        La clé complète a été affichée <strong>une seule fois</strong> à la création.
                                        Seul le préfixe est visible. Pour réinitialiser, contactez le support.
                                    </p>
                                </div>
                                <p className="text-[10px] text-gray-600 text-center">
                                    Identifiant unique — stocké sous forme hashée
                                </p>
                            </>
                        ) : (
                            <div className="text-xs text-gray-500 italic text-center py-4">
                                Aucune clé générée pour cette clinique
                            </div>
                        )}
                    </div>

                    {/* Abonnement */}
                    <div className="bg-gradient-to-br from-primary/90 to-primary rounded-2xl p-5 text-white shadow-xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-bold opacity-70 uppercase tracking-widest">Abonnement</div>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                                {info.subscriptionStatus === 'trial' ? 'ESSAI' : info.subscriptionStatus === 'active' ? 'PRO' : 'SUSPENDU'}
                            </span>
                        </div>
                        <div className="text-xl font-black mb-1 capitalize">{info.subscriptionStatus || 'trial'}</div>
                        <div className="text-xs opacity-60 mb-4">Contactez-nous pour changer de plan</div>
                        <button className="w-full py-2 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-bold transition">
                            Gérer le plan →
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Modal Créer / Modifier Département ── */}
            {modalDep !== null && (
                <Modal
                    title={modalDep === 'create' ? 'Nouveau Département' : `Modifier — ${modalDep.nom}`}
                    onClose={() => setModalDep(null)}
                >
                    <form onSubmit={handleDepSubmit} className="space-y-4">
                        <Field label="Nom du service *">
                            <input
                                required
                                value={depForm.nom}
                                onChange={e => setDepForm(p => ({ ...p, nom: e.target.value }))}
                                className={inputCls}
                                placeholder="Ex: Cardiologie"
                            />
                        </Field>
                        <Field label="Chef de service">
                            <input
                                value={depForm.chef}
                                onChange={e => setDepForm(p => ({ ...p, chef: e.target.value }))}
                                className={inputCls}
                                placeholder="Ex: Dr. Benali"
                            />
                        </Field>
                        <Field label="Nombre de lits">
                            <input
                                type="number"
                                min="0"
                                value={depForm.lits}
                                onChange={e => setDepForm(p => ({ ...p, lits: e.target.value }))}
                                className={inputCls}
                                placeholder="0"
                            />
                        </Field>
                        <Field label="Description (optionnel)">
                            <textarea
                                value={depForm.description}
                                onChange={e => setDepForm(p => ({ ...p, description: e.target.value }))}
                                className={inputCls + ' resize-none'}
                                rows={2}
                                placeholder="Description brève du service..."
                            />
                        </Field>
                        <button type="submit" disabled={depSaving}
                            className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                            {depSaving
                                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enregistrement...</>
                                : <><Check size={15} /> {modalDep === 'create' ? 'Créer le département' : 'Enregistrer les modifications'}</>
                            }
                        </button>
                    </form>
                </Modal>
            )}
        </div>
    );
}
