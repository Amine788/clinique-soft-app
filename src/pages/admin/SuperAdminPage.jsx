import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { seDeconnecter } from '../../api/deconnexion';
import api from '../../api/axios';
import { 
    Users, Building2, CreditCard, ShieldAlert, 
    Trash2, CheckCircle2, AlertTriangle, Play,
    ArrowLeft, LogOut, Search, Filter, RefreshCw, Loader2, Hourglass
} from 'lucide-react';
import toast from 'react-hot-toast';

const HEURE = 60 * 60 * 1000;

// Durées proposées pour prolonger un essai
const TRIAL_EXTENSIONS = [
    { hours: 24, label: '+24 h' },
    { hours: 7 * 24, label: '+7 j' },
];

// heures : déjà arrondies (vers le haut pour un temps restant, vers le bas pour un dépassement)
const formatDuree = (heures) => (heures < 48 ? `${heures} h` : `${Math.floor(heures / 24)} j`);

// Fin d'essai renvoyée par le serveur (null hors essai) ; now : heure courante en ms
function TrialEnd({ clinic, now }) {
    if (clinic.subscriptionStatus !== 'trial' || !clinic.trialEnd) {
        return <span className="text-gray-400">—</span>;
    }
    const fin = new Date(clinic.trialEnd);
    const reste = fin.getTime() - now;
    const date = fin.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return (
        <div title={`Fin d'essai : ${date}`}>
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold ${
                reste <= 0 ? 'bg-red-50 text-red-700' : reste <= 3 * HEURE ? 'bg-amber-50 text-amber-700' : 'bg-primary-light text-primary'
            }`}>
                <Hourglass size={12} aria-hidden="true" />
                {reste > 0
                    ? `Reste ${formatDuree(Math.ceil(reste / HEURE))}`
                    : -reste < HEURE ? 'Expiré' : `Expiré depuis ${formatDuree(Math.floor(-reste / HEURE))}`}
            </span>
            <div className="mt-1 text-[11px] text-gray-400">{date}</div>
        </div>
    );
}

export default function SuperAdminPage() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    
    const [stats, setStats] = useState(null);
    const [clinics, setClinics] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'clinics' | 'users'
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [clinicSearch, setClinicSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    // '' : toutes les cliniques ; 'none' : comptes plateforme sans clinique ; sinon id de la clinique
    const [clinicFilter, setClinicFilter] = useState('');
    const [extendingId, setExtendingId] = useState(null);
    // Heure courante pour le décompte des essais, rafraîchie chaque minute
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchAllData = async () => {
        try {
            setLoading(true);
            const [statsRes, clinicsRes, usersRes] = await Promise.all([
                api.get('/super-admin/stats'),
                api.get('/super-admin/clinics'),
                api.get('/super-admin/users')
            ]);
            setStats(statsRes.data);
            setClinics(clinicsRes.data);
            setAllUsers(usersRes.data);
        } catch (err) {
            console.error('[SUPER-ADMIN FETCH ERROR]', err);
            toast.error('Erreur lors du chargement des données d\'administration');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Rediriger si l'utilisateur n'est pas un super_admin
        if (user?.role !== 'super_admin') {
            toast.error('Accès refusé. Rôle super_admin requis.');
            navigate('/dashboard');
            return;
        }
        fetchAllData();
    }, [user, navigate]);

    const handleUpdateStatus = async (clinicId, newStatus) => {
        const oldClinics = [...clinics];
        
        // Optimistic update
        setClinics(prev => prev.map(c => c.id === clinicId ? { ...c, subscriptionStatus: newStatus } : c));

        try {
            const { data } = await api.put(`/super-admin/clinics/${clinicId}/status`, { status: newStatus });
            if (data.success) {
                toast.success(`Statut de la clinique mis à jour en "${newStatus}"`);
                // Rafraîchir les stats et la fin d'essai (calculée par le serveur)
                const [statsRes, clinicsRes] = await Promise.all([
                    api.get('/super-admin/stats'),
                    api.get('/super-admin/clinics'),
                ]);
                setStats(statsRes.data);
                setClinics(clinicsRes.data);
            } else {
                setClinics(oldClinics);
            }
        } catch (err) {
            setClinics(oldClinics);
            toast.error(err.response?.data?.error || 'Erreur lors du changement de statut');
        }
    };

    const handleExtendTrial = async (clinic, hours, label) => {
        setExtendingId(clinic.id);
        try {
            const { data } = await api.post(`/super-admin/clinics/${clinic.id}/extend-trial`, { hours });
            setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, subscriptionStatus: data.subscriptionStatus, trialEnd: data.trialEnd } : c));
            setNow(Date.now());
            toast.success(`Essai de « ${clinic.name} » prolongé (${label})`);
            const statsRes = await api.get('/super-admin/stats');
            setStats(statsRes.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la prolongation de l’essai');
        } finally {
            setExtendingId(null);
        }
    };

    const handleDeleteClinic = async (clinicId, clinicName) => {
        if (!window.confirm(`⚠️ ATTENTION : Êtes-vous sûr de vouloir supprimer définitivement la clinique "${clinicName}" et TOUS ses utilisateurs associés ? Cette action est irréversible.`)) {
            return;
        }

        try {
            const { data } = await api.delete(`/super-admin/clinics/${clinicId}`);
            if (data.success) {
                toast.success(`Clinique "${clinicName}" supprimée avec succès`);
                setClinics(prev => prev.filter(c => c.id !== clinicId));
                setAllUsers(prev => prev.filter(u => u.clinic_id !== clinicId));
                if (clinicFilter === String(clinicId)) setClinicFilter('');
                // Rafraîchir les stats
                const statsRes = await api.get('/super-admin/stats');
                setStats(statsRes.data);
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la suppression de la clinique');
        }
    };

    const handleLogout = async () => {
        await seDeconnecter();
        navigate('/login');
    };

    if (loading && !stats) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 size={40} className="animate-spin text-brand-600 mb-4" />
                <p className="text-gray-500 font-medium">Chargement de la console Super Admin...</p>
            </div>
        );
    }

    // Filter logic
    const filteredClinics = clinics.filter(c => 
        c.name.toLowerCase().includes(clinicSearch.toLowerCase()) ||
        c.email?.toLowerCase().includes(clinicSearch.toLowerCase())
    );

    const clinicUsers = clinicFilter === ''
        ? allUsers
        : allUsers.filter(u => clinicFilter === 'none' ? !u.clinic_id : String(u.clinic_id) === clinicFilter);

    const sortedClinics = [...clinics].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    const showClinicUsers = (clinicId) => {
        setClinicFilter(String(clinicId));
        setActiveTab('users');
    };

    const filteredUsers = clinicUsers.filter(u => {
        const matchesSearch =
            `${u.prenom} ${u.nom}`.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.clinicName.toLowerCase().includes(userSearch.toLowerCase());
        const matchesRole = roleFilter ? u.role === roleFilter : true;
        const matchesStatus = statusFilter ? u.statut === statusFilter : true;
        return matchesSearch && matchesRole && matchesStatus;
    });

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            
            {/* Header / Topbar */}
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-600 text-white rounded-xl shadow-md">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Console SaaS Platform Admin</h1>
                        <p className="text-xs text-gray-500">Supervision globale de tous les comptes & cliniques</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={fetchAllData}
                        className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors"
                        title="Rafraîchir les données"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <div className="w-px h-6 bg-gray-200" />
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-700">{user?.name}</span>
                        <span className="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-bold uppercase">Super Admin</span>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors"
                    >
                        <LogOut size={16} /> Quitter
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
                
                {/* Stats Summary Panel */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                            <div>
                                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1">Cliniques</span>
                                <span className="text-3xl font-bold text-gray-900">{stats.totalClinics}</span>
                                <div className="text-xs text-gray-500 mt-2">
                                    <span className="text-emerald-600 font-bold">{stats.activeClinics}</span> actives • <span className="text-amber-500 font-bold">{stats.trialClinics}</span> essais
                                </div>
                            </div>
                            <div className="p-4 bg-brand-50 text-brand-600 rounded-2xl">
                                <Building2 size={24} />
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                            <div>
                                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1">Comptes Utilisateurs</span>
                                <span className="text-3xl font-bold text-gray-900">{stats.totalUsers}</span>
                                <div className="text-xs text-gray-500 mt-2">
                                    Médecins, secrétaires, admins
                                </div>
                            </div>
                            <div className="p-4 bg-brand-50 text-brand-600 rounded-2xl">
                                <Users size={24} />
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                            <div>
                                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1">Chiffre Affaires Est.</span>
                                <span className="text-3xl font-bold text-gray-900 text-emerald-600">
                                    {stats.estimatedMRR.toLocaleString('fr-FR')} DH
                                </span>
                                <div className="text-xs text-gray-500 mt-2">
                                    Mensuel (Cliniques actives payantes)
                                </div>
                            </div>
                            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                                <CreditCard size={24} />
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                            <div>
                                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1">Cliniques Suspendues</span>
                                <span className="text-3xl font-bold text-red-600">{stats.suspendedClinics}</span>
                                <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Bloquées pour impayé
                                </div>
                            </div>
                            <div className="p-4 bg-red-50 text-red-600 rounded-2xl">
                                <ShieldAlert size={24} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs Selector */}
                <div className="border-b border-gray-200 flex gap-6">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`pb-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'overview' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-950'}`}
                    >
                        Vue d'ensemble
                    </button>
                    <button
                        onClick={() => setActiveTab('clinics')}
                        className={`pb-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'clinics' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-950'}`}
                    >
                        Gestion des Cliniques ({clinics.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`pb-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'users' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-950'}`}
                    >
                        Utilisateurs Globaux ({clinicUsers.length})
                    </button>
                </div>

                {/* Tab 1: Overview */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Card: Role Breakdown */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-6">
                            <h3 className="text-base font-bold text-gray-900">Répartition des rôles sur la plateforme</h3>
                            <div className="space-y-4">
                                {[
                                    { label: 'Médecins (Doctors)', count: stats?.rolesBreakdown.doctor || 0, color: 'bg-indigo-600' },
                                    { label: 'Secrétaires (Secretaries)', count: stats?.rolesBreakdown.secretary || 0, color: 'bg-blue-500' },
                                    { label: 'Administrateurs (Clinic Admins)', count: stats?.rolesBreakdown.admin || 0, color: 'bg-emerald-500' },
                                    { label: 'Infirmiers', count: stats?.rolesBreakdown.nurse || 0, color: 'bg-violet-500' },
                                    { label: 'Pharmaciens', count: stats?.rolesBreakdown.pharmacist || 0, color: 'bg-amber-500' },
                                    { label: 'Laborantins', count: stats?.rolesBreakdown.lab_technician || 0, color: 'bg-cyan-500' },
                                ].map(item => {
                                    const percent = stats?.totalUsers > 0 ? (item.count / stats.totalUsers) * 100 : 0;
                                    return (
                                        <div key={item.label} className="space-y-1">
                                            <div className="flex justify-between text-sm font-medium">
                                                <span className="text-gray-700">{item.label}</span>
                                                <span className="font-bold text-gray-900">{item.count} ({Math.round(percent)}%)</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Card: Platform Details */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-gray-900">Informations & Intégrité du Système</h3>
                            <div className="space-y-3 text-sm text-gray-600">
                                <div className="flex justify-between py-2 border-b border-gray-100">
                                    <span>Hébergement Base de Données</span>
                                    <span className="font-semibold text-gray-900">MySQL (Local XAMPP)</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-100">
                                    <span>État du Serveur Socket.io</span>
                                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Actif
                                    </span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-100">
                                    <span>Envoi Notifications Emails</span>
                                    <span className="font-semibold text-gray-900">Gmail SMTP</span>
                                </div>
                                <div className="flex justify-between py-2">
                                    <span>Limite de Clés Tables MySQL</span>
                                    <span className="text-emerald-600 font-bold">Optimisé (103 index nettoyés)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab 2: Clinics Management */}
                {activeTab === 'clinics' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-6">
                        
                        {/* Search Bar */}
                        <div className="relative max-w-md">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={clinicSearch}
                                onChange={e => setClinicSearch(e.target.value)}
                                placeholder="Rechercher une clinique par nom, email..."
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition"
                            />
                        </div>

                        {/* Clinics Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                                        <th className="px-6 py-4">Nom de la clinique</th>
                                        <th className="px-6 py-4">Email de contact</th>
                                        <th className="px-6 py-4">Date de création</th>
                                        <th className="px-6 py-4">Utilisateurs</th>
                                        <th className="px-6 py-4">Plan</th>
                                        <th className="px-6 py-4">Statut Abonnement</th>
                                        <th className="px-6 py-4">Fin d'essai</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredClinics.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-8 text-center text-gray-400 font-medium">
                                                Aucune clinique trouvée.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredClinics.map(c => (
                                            <tr key={c.id} className="hover:bg-gray-50/50 transition">
                                                <td className="px-6 py-4 font-bold text-gray-900">{c.name}</td>
                                                <td className="px-6 py-4 text-gray-500">{c.email || 'Non renseigné'}</td>
                                                <td className="px-6 py-4 text-gray-500">{new Date(c.createdAt).toLocaleDateString('fr-FR')}</td>
                                                <td className="px-6 py-4 font-semibold text-gray-700">
                                                    <button
                                                        type="button"
                                                        onClick={() => showClinicUsers(c.id)}
                                                        title={`Voir les utilisateurs de ${c.name}`}
                                                        className="whitespace-nowrap text-brand-700 hover:underline"
                                                    >
                                                        {c.userCount} comptes
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 bg-gray-100 text-gray-700 font-semibold rounded-lg text-xs">
                                                        {c.type || 'Starter'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={c.subscriptionStatus}
                                                        onChange={e => handleUpdateStatus(c.id, e.target.value)}
                                                        className={`px-2 py-1 rounded-lg text-xs font-bold border outline-none cursor-pointer ${
                                                            c.subscriptionStatus === 'active' 
                                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                                                : c.subscriptionStatus === 'trial' 
                                                                    ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                                                    : 'bg-red-50 border-red-200 text-red-700'
                                                        }`}
                                                    >
                                                        <option value="trial">Essai (Trial)</option>
                                                        <option value="active">Actif (Payé)</option>
                                                        <option value="suspended">Suspendu (Impayé)</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <TrialEnd clinic={c} now={now} />
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="inline-flex items-center gap-1.5">
                                                    {c.subscriptionStatus !== 'active' && TRIAL_EXTENSIONS.map(({ hours, label }) => (
                                                        <button
                                                            key={hours}
                                                            type="button"
                                                            onClick={() => handleExtendTrial(c, hours, label)}
                                                            disabled={extendingId === c.id}
                                                            aria-label={`Prolonger l'essai de ${c.name} (${label})`}
                                                            title="Prolonger l'essai"
                                                            className="rounded-lg border border-primary/20 bg-primary-light px-2 py-1 text-xs font-bold whitespace-nowrap text-primary transition hover:bg-primary hover:text-white disabled:opacity-50"
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                    <button
                                                        onClick={() => handleDeleteClinic(c.id, c.name)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Supprimer la clinique"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Tab 3: Global Users List */}
                {activeTab === 'users' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-6">
                        
                        {/* Search and Filters bar */}
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full md:max-w-md">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                    placeholder="Rechercher utilisateur par nom, email, clinique..."
                                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition"
                                />
                            </div>

                            <div className="flex flex-wrap gap-3 w-full md:w-auto">
                                <select
                                    value={clinicFilter}
                                    onChange={e => setClinicFilter(e.target.value)}
                                    aria-label="Filtrer par clinique"
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none bg-white text-gray-700 max-w-xs"
                                >
                                    <option value="">Toutes les cliniques</option>
                                    {sortedClinics.map(c => (
                                        <option key={c.id} value={String(c.id)}>
                                            {c.name} ({allUsers.filter(u => u.clinic_id === c.id).length})
                                        </option>
                                    ))}
                                    <option value="none">Plateforme (sans clinique)</option>
                                </select>

                                <select
                                    value={roleFilter}
                                    onChange={e => setRoleFilter(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none bg-white text-gray-700"
                                >
                                    <option value="">Tous les rôles</option>
                                    <option value="admin">Administrateur</option>
                                    <option value="doctor">Médecin</option>
                                    <option value="secretary">Secrétaire</option>
                                    <option value="pharmacist">Pharmacien</option>
                                    <option value="nurse">Infirmier</option>
                                    <option value="lab_technician">Laborantin</option>
                                    <option value="super_admin">Super Admin</option>
                                </select>

                                <select 
                                    value={statusFilter} 
                                    onChange={e => setStatusFilter(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none bg-white text-gray-700"
                                >
                                    <option value="">Tous les statuts</option>
                                    <option value="actif">Actif</option>
                                    <option value="inactif">Inactif</option>
                                </select>
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                                        <th className="px-6 py-4">Matricule</th>
                                        <th className="px-6 py-4">Nom Complet</th>
                                        <th className="px-6 py-4">Email</th>
                                        <th className="px-6 py-4">Rôle</th>
                                        <th className="px-6 py-4">Clinique d'origine</th>
                                        <th className="px-6 py-4">Date de création</th>
                                        <th className="px-6 py-4">Statut</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-gray-400 font-medium">
                                                Aucun utilisateur trouvé.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map(u => (
                                            <tr key={u.id} className="hover:bg-gray-50/50 transition">
                                                <td className="px-6 py-4 font-mono font-semibold text-brand-700">{u.matricule}</td>
                                                <td className="px-6 py-4 font-bold text-gray-900">{u.prenom} {u.nom}</td>
                                                <td className="px-6 py-4 text-gray-500">{u.email}</td>
                                                <td className="px-6 py-4 capitalize font-medium text-gray-700">
                                                    {u.role === 'admin' ? 'Administrateur' : 
                                                     u.role === 'doctor' ? 'Médecin' : 
                                                     u.role === 'pharmacist' ? 'Pharmacien' : 
                                                     u.role === 'nurse' ? 'Infirmier' :
                                                     u.role === 'lab_technician' ? 'Laborantin' :
                                                     u.role === 'super_admin' ? 'Super Admin' :
                                                     'Secrétaire'}
                                                </td>
                                                <td className="px-6 py-4 font-semibold text-gray-600">{u.clinicName}</td>
                                                <td className="px-6 py-4 text-gray-500">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                        u.statut === 'actif' 
                                                            ? 'bg-emerald-50 text-emerald-700' 
                                                            : 'bg-red-50 text-red-700'
                                                    }`}>
                                                        {u.statut}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
