import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../hooks/useSocket';
import {
    RefreshCw, BedDouble, UserCheck, AlertTriangle, CheckCircle,
    LogOut, Home, ClipboardList, Sparkles, ChevronRight, Clock
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const statusColor = {
    available:   { bg: 'bg-green-50 border-green-200',   badge: 'bg-green-100 text-green-800',   dot: 'bg-green-500',   label: '🟢 Libre' },
    occupied:    { bg: 'bg-red-50 border-red-200',        badge: 'bg-red-100 text-red-800',        dot: 'bg-red-500',     label: '🔴 Occupée' },
    reserved:    { bg: 'bg-yellow-50 border-yellow-200',  badge: 'bg-yellow-100 text-yellow-800',  dot: 'bg-yellow-500',  label: '🟡 Réservée' },
    maintenance: { bg: 'bg-orange-50 border-orange-200',  badge: 'bg-orange-100 text-orange-800',  dot: 'bg-orange-500',  label: '🟠 Nettoyage' },
    hors_service:{ bg: 'bg-slate-100 border-slate-300',   badge: 'bg-slate-200 text-slate-600',    dot: 'bg-slate-400',   label: '⚫ Hors service' },
};

function daysSince(date) {
    if (!date) return '—';
    const diff = Math.floor((Date.now() - new Date(date)) / 86400000);
    return diff === 0 ? "Aujourd'hui" : `${diff}j`;
}

import { useSearchParams } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function SecretaryAdmissionsPage() {
    const [searchParams] = useSearchParams();
    const urlTab = searchParams.get('tab');

    const [admissions, setAdmissions] = useState([]);   // statut = 'demande'
    const [activeList, setActiveList] = useState([]);   // statut = 'admis' | 'sortie_demandee'
    const [rooms, setRooms] = useState([]);
    const [nurses, setNurses] = useState([]);
    const [activeTab, setActiveTab] = useState(urlTab || 'admissions');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (urlTab) {
            setActiveTab(urlTab);
        }
    }, [urlTab]);

    // Formulaire admission
    const [selectedHosp, setSelectedHosp] = useState(null);
    const [selectedChambreId, setSelectedChambreId] = useState('');
    const [lit, setLit] = useState('Lit A');
    const [selectedNurseId, setSelectedNurseId] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Socket temps réel ──────────────────────────────────
    useSocket({
        hosp_demande: (data) => {
            toast.success(`🏥 Nouvelle hospitalisation — ${data.patientNom}`, { duration: 6000 });
            loadAllData();
        },
        discharge_requested: (data) => {
            toast(`🚪 Sortie demandée — ${data.patientNom}`, { icon: '📋', duration: 6000 });
            loadAllData();
        },
        chambre_status_changed: () => {
            loadAllData();
        },
        hosp_validated: () => {
            loadAllData();
        }
    });

    // ── Chargement des données ────────────────────────────
    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [resAdm, resActive, resRooms, resNurses] = await Promise.all([
                api.get('/hospitalisations/admissions'),
                api.get('/hospitalisations/administrative-stays'),
                api.get('/rooms'),
                api.get('/hospitalisations/nurses'),
            ]);
            setAdmissions(resAdm.data || []);
            setActiveList(resActive.data || []);
            setRooms(resRooms.data || []);
            setNurses(resNurses.data || []);
        } catch (err) {
            console.error(err);
            toast.error('Erreur de chargement des données');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAllData(); }, [loadAllData]);

    // ── Actions ───────────────────────────────────────────
    const handleAdmit = async (e) => {
        e.preventDefault();
        if (!selectedHosp || !selectedChambreId || !selectedNurseId) {
            return toast.error('Chambre, lit et infirmier(e) sont obligatoires');
        }
        setSubmitting(true);
        try {
            await api.put(`/hospitalisations/${selectedHosp.id}/admit`, {
                chambreId: parseInt(selectedChambreId),
                lit,
                nurseId: parseInt(selectedNurseId)
            });
            toast.success('Patient admis avec succès ! 🛏️');
            setSelectedHosp(null);
            setSelectedChambreId('');
            setSelectedNurseId('');
            setLit('Lit A');
            loadAllData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la validation');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseHosp = async (hospId) => {
        if (!window.confirm('Confirmer la clôture du séjour et passer la chambre en nettoyage ?')) return;
        try {
            await api.put(`/hospitalisations/${hospId}/close`);
            toast.success('Séjour clôturé. Chambre en nettoyage 🧹');
            loadAllData();
        } catch {
            toast.error('Erreur lors de la clôture');
        }
    };

    const handleCleanRoom = async (chambreId) => {
        try {
            await api.put(`/hospitalisations/chambres/${chambreId}/clean`);
            toast.success('Chambre remise en service 🟢');
            loadAllData();
        } catch {
            toast.error('Erreur');
        }
    };

    // ── Calculs stats ─────────────────────────────────────
    const totalRooms     = rooms.length;
    const freeRooms      = rooms.filter(r => r.status === 'available').length;
    const occupiedRooms  = rooms.filter(r => r.status === 'occupied').length;
    const reservedRooms  = rooms.filter(r => r.status === 'reserved').length;
    const cleaningRooms  = rooms.filter(r => r.status === 'maintenance').length;
    const occupancyRate  = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    const dischargeRequests = activeList.filter(h => h.statut === 'sortie_demandee');
    const pendingAdmissions = admissions.length;

    const stats = [
        { label: 'Chambres total',    val: totalRooms,        color: 'text-slate-800',    bg: 'bg-white border border-slate-100' },
        { label: 'Libres 🟢',         val: freeRooms,         color: 'text-green-700',    bg: 'bg-green-50 border border-green-200' },
        { label: 'Occupées 🔴',       val: occupiedRooms,     color: 'text-red-700',      bg: 'bg-red-50 border border-red-200' },
        { label: 'Réservées 🟡',      val: reservedRooms,     color: 'text-yellow-700',   bg: 'bg-yellow-50 border border-yellow-200' },
        { label: 'Nettoyage 🟠',      val: cleaningRooms,     color: 'text-orange-700',   bg: 'bg-orange-50 border border-orange-200' },
        { label: 'Taux occupation',   val: `${occupancyRate}%`, color: 'text-white',      bg: 'bg-slate-900' },
    ];

    return (
        <div className="flex flex-col min-h-[calc(100vh-100px)] p-6 bg-slate-50 font-sans">
            {/* ── Header ── */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        🏢 Admissions &amp; Chambres
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Gestion des admissions, sorties et suivi de l'occupation en temps réel
                    </p>
                </div>
                <button
                    onClick={loadAllData}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-sm text-slate-600"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* ── Dashboard stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                {stats.map((s, i) => (
                    <div key={i} className={`p-4 rounded-2xl shadow-sm ${s.bg} flex flex-col justify-between`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400">{s.label}</span>
                        <span className={`text-2xl font-black mt-2 ${s.color}`}>{s.val}</span>
                    </div>
                ))}
            </div>

            {/* Alertes rapides */}
            {(pendingAdmissions > 0 || dischargeRequests.length > 0) && (
                <div className="flex gap-3 mb-5 flex-wrap">
                    {pendingAdmissions > 0 && (
                        <div
                            onClick={() => setActiveTab('admissions')}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-800 cursor-pointer hover:bg-blue-100 transition"
                        >
                            <ClipboardList size={14} />
                            {pendingAdmissions} admission{pendingAdmissions > 1 ? 's' : ''} en attente
                        </div>
                    )}
                    {dischargeRequests.length > 0 && (
                        <div
                            onClick={() => setActiveTab('discharges')}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-xl text-xs font-bold text-yellow-800 cursor-pointer hover:bg-yellow-100 transition"
                        >
                            <LogOut size={14} />
                            {dischargeRequests.length} sortie{dischargeRequests.length > 1 ? 's' : ''} à finaliser
                        </div>
                    )}
                </div>
            )}

            {/* ── Onglets ── */}
            <div className="flex border-b border-slate-200 mb-6">
                {[
                    { id: 'admissions', label: '📥 Demandes d\'admission', count: pendingAdmissions },
                    { id: 'discharges', label: '📤 Sorties', count: dischargeRequests.length },
                    { id: 'chambres',   label: '🛏️ Chambres',  count: null },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setSelectedHosp(null); }}
                        className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                            activeTab === tab.id
                                ? 'border-slate-950 text-slate-950'
                                : 'border-transparent text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== null && tab.count > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold">
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Contenu ── */}
            <div className="flex-1">

                {/* ────────────── TAB ADMISSIONS ────────────── */}
                {activeTab === 'admissions' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Liste demandes */}
                        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                            <h2 className="font-extrabold text-sm text-slate-800">
                                Demandes en attente d'affectation
                                {admissions.length > 0 && (
                                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-bold">
                                        {admissions.length}
                                    </span>
                                )}
                            </h2>

                            {loading ? (
                                <p className="text-xs text-slate-400 text-center py-10">Chargement...</p>
                            ) : admissions.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <div className="text-4xl mb-2">✅</div>
                                    <p className="text-sm font-medium">Aucune demande en attente</p>
                                </div>
                            ) : (
                                admissions.map(a => (
                                    <div
                                        key={a.id}
                                        onClick={() => {
                                            setSelectedHosp(a);
                                            // Chambre proposée à la prise de RDV (P17), si elle est encore libre
                                            setSelectedChambreId(a.chambreId && rooms.some(r => r.status === 'available' && String(r.id) === String(a.chambreId)) ? String(a.chambreId) : '');
                                        }}
                                        className={`p-4 border rounded-2xl cursor-pointer transition-all ${
                                            selectedHosp?.id === a.id
                                                ? 'bg-slate-900 text-white border-transparent shadow-lg'
                                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-xs">
                                                    {a.Patient?.prenom} {a.Patient?.nom}
                                                </h3>
                                                <p className={`text-[10px] mt-1 ${selectedHosp?.id === a.id ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    Dossier: {a.Patient?.numeroDossier} · CIN: {a.Patient?.cinNumero}
                                                </p>
                                                <p className={`text-[10px] mt-1 font-semibold ${selectedHosp?.id === a.id ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    Dr. {a.Medecin?.User?.prenom} {a.Medecin?.User?.nom}
                                                </p>
                                                {a.diagnostic && (
                                                    <p className={`text-[10px] mt-0.5 italic ${selectedHosp?.id === a.id ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {a.diagnostic}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                    a.etat === 'critique' ? 'bg-red-500 text-white animate-pulse' :
                                                    a.etat === 'surveillance' ? 'bg-yellow-500 text-white' :
                                                    'bg-slate-200 text-slate-700'
                                                }`}>
                                                    {a.etat}
                                                </span>
                                                <ChevronRight size={14} className={selectedHosp?.id === a.id ? 'text-white' : 'text-slate-400'} />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Formulaire d'affectation */}
                        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                            <h2 className="font-extrabold text-sm text-slate-800 mb-4">
                                Affecter chambre &amp; Nurse
                            </h2>
                            {selectedHosp ? (
                                <form onSubmit={handleAdmit} className="space-y-4">
                                    {/* Résumé patient */}
                                    <div className="p-4 bg-slate-50 rounded-2xl text-xs space-y-1.5">
                                        <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider mb-1">Patient</span>
                                        <span className="font-black text-slate-900 text-sm block">
                                            {selectedHosp.Patient?.prenom} {selectedHosp.Patient?.nom}
                                        </span>
                                        <span className="text-slate-500">
                                            Prescrit par Dr. {selectedHosp.Medecin?.User?.prenom} {selectedHosp.Medecin?.User?.nom}
                                        </span>
                                        {selectedHosp.motif && (
                                            <span className="text-slate-500 italic block">"{selectedHosp.motif}"</span>
                                        )}
                                        {selectedHosp.dateSortieEstimee && (
                                            <span className="text-slate-500 block">
                                                Prévue du {new Date(selectedHosp.dateAdmission).toLocaleDateString('fr-FR')} au {new Date(selectedHosp.dateSortieEstimee).toLocaleDateString('fr-FR')}
                                            </span>
                                        )}
                                    </div>

                                    {/* Chambre libre */}
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 block mb-1.5 uppercase tracking-wider">
                                            Chambre libre *
                                        </label>
                                        <select
                                            value={selectedChambreId}
                                            onChange={e => setSelectedChambreId(e.target.value)}
                                            required
                                            className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        >
                                            <option value="">Sélectionner une chambre libre...</option>
                                            {rooms.filter(r => r.status === 'available').map(r => (
                                                <option key={r.id} value={r.id}>
                                                    Chambre {r.number} ({r.type} · {r.beds} lit{r.beds > 1 ? 's' : ''})
                                                    {r.price ? ` · ${r.price} MAD/nuit` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {rooms.filter(r => r.status === 'available').length === 0 && (
                                            <p className="text-[10px] text-red-600 mt-1">⚠️ Aucune chambre disponible actuellement</p>
                                        )}
                                    </div>

                                    {/* Lit */}
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 block mb-1.5 uppercase tracking-wider">
                                            Numéro de lit / Emplacement
                                        </label>
                                        <input
                                            type="text"
                                            value={lit}
                                            onChange={e => setLit(e.target.value)}
                                            placeholder="Ex: Lit A, Lit 02..."
                                            className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        />
                                    </div>

                                    {/* Nurse */}
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 block mb-1.5 uppercase tracking-wider">
                                            Infirmier(ère) responsable *
                                        </label>
                                        <select
                                            value={selectedNurseId}
                                            onChange={e => setSelectedNurseId(e.target.value)}
                                            required
                                            className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        >
                                            <option value="">Sélectionner un(e) infirmier(ère)...</option>
                                            {nurses.map(n => (
                                                <option key={n.id} value={n.id}>
                                                    {n.prenom} {n.nom}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-extrabold hover:bg-slate-800 transition disabled:opacity-60 flex items-center justify-center gap-2"
                                    >
                                        {submitting ? (
                                            <><RefreshCw size={14} className="animate-spin" /> Validation...</>
                                        ) : (
                                            <><CheckCircle size={14} /> Valider l'Admission</>
                                        )}
                                    </button>
                                </form>
                            ) : (
                                <div className="text-center py-16 text-slate-400">
                                    <BedDouble size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-xs font-medium">Sélectionnez une demande à gauche</p>
                                    <p className="text-[10px] mt-1">pour affecter une chambre et un(e) infirmier(ère)</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ────────────── TAB SORTIES ────────────── */}
                {activeTab === 'discharges' && (
                    <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                        <h2 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                            <LogOut size={16} />
                            Demandes de sortie validées par le médecin
                            {dischargeRequests.length > 0 && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-bold">
                                    {dischargeRequests.length}
                                </span>
                            )}
                        </h2>

                        {loading ? (
                            <p className="text-xs text-slate-400 text-center py-10">Chargement...</p>
                        ) : dischargeRequests.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <div className="text-4xl mb-2">✅</div>
                                <p className="text-sm font-medium">Aucune sortie en attente de finalisation</p>
                                <p className="text-xs mt-1">Les demandes de sortie validées par le médecin apparaîtront ici</p>
                            </div>
                        ) : (
                            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
                                            <th className="p-3 font-semibold">Patient</th>
                                            <th className="p-3 font-semibold">Chambre / Lit</th>
                                            <th className="p-3 font-semibold">Médecin référent</th>
                                            <th className="p-3 font-semibold">Admission</th>
                                            <th className="p-3 font-semibold">Durée</th>
                                            <th className="p-3 text-right font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {dischargeRequests.map(h => (
                                            <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-3">
                                                    <span className="font-bold text-slate-900 block">
                                                        {h.Patient?.prenom} {h.Patient?.nom}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {h.Patient?.cinNumero}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <span className="font-semibold text-slate-700">
                                                        Ch. {h.Chambre?.numero || '—'}
                                                    </span>
                                                    <span className="text-slate-500 ml-1">· {h.lit || '—'}</span>
                                                </td>
                                                <td className="p-3 text-slate-600">
                                                    Dr. {h.Medecin?.User?.prenom} {h.Medecin?.User?.nom}
                                                </td>
                                                <td className="p-3 text-slate-600">
                                                    {new Date(h.dateAdmission).toLocaleDateString('fr-FR')}
                                                </td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold">
                                                        {daysSince(h.dateAdmission)}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button
                                                        onClick={() => handleCloseHosp(h.id)}
                                                        className="bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-slate-700 transition text-[10px] uppercase tracking-wider"
                                                    >
                                                        Clôturer le séjour
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ────────────── TAB CHAMBRES ────────────── */}
                {activeTab === 'chambres' && (
                    <div className="space-y-6">
                        {/* Toutes les chambres */}
                        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                            <h2 className="font-extrabold text-sm text-slate-800 mb-4 flex items-center gap-2">
                                <Home size={16} />
                                Vue d'ensemble des chambres
                            </h2>
                            {loading ? (
                                <p className="text-xs text-slate-400 text-center py-10">Chargement...</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {rooms.map(r => {
                                        const sc = statusColor[r.status] || statusColor.hors_service;
                                        return (
                                            <div key={r.id} className={`p-4 border rounded-2xl text-xs transition-all ${sc.bg}`}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-black text-slate-900">Chambre {r.number}</span>
                                                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${sc.badge}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
                                                        {sc.label.split(' ').slice(1).join(' ')}
                                                    </span>
                                                </div>
                                                <p className="text-slate-500 text-[10px]">
                                                    {r.type} · {r.beds} lit{r.beds > 1 ? 's' : ''}
                                                    {r.price ? ` · ${r.price} MAD/nuit` : ''}
                                                </p>

                                                {/* Patient occupant */}
                                                {r.hospitalisation && (
                                                    <div className="mt-3 pt-2 border-t border-slate-200/70 space-y-0.5">
                                                        <span className="font-bold text-slate-800 block">
                                                            {r.hospitalisation.patient?.prenom} {r.hospitalisation.patient?.nom}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500">
                                                            Dr. {r.hospitalisation.medecin?.prenom} {r.hospitalisation.medecin?.nom}
                                                        </span>
                                                        {r.hospitalisation.nurse && (
                                                            <span className="text-[10px] text-slate-500 block">
                                                                Nurse: {r.hospitalisation.nurse.prenom} {r.hospitalisation.nurse.nom}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-slate-400">
                                                            <Clock size={9} className="inline mr-0.5" />
                                                            Depuis le {new Date(r.hospitalisation.dateAdmission).toLocaleDateString('fr-FR')}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Action nettoyage */}
                                                {r.status === 'maintenance' && (
                                                    <button
                                                        onClick={() => handleCleanRoom(r.id)}
                                                        className="mt-3 w-full py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg text-[10px] transition"
                                                    >
                                                        ✓ Marquer propre
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {rooms.length === 0 && (
                                        <div className="col-span-full text-center py-12 text-slate-400">
                                            <BedDouble size={32} className="mx-auto mb-2 opacity-30" />
                                            <p className="text-sm">Aucune chambre enregistrée</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Chambres en nettoyage séparément */}
                        {rooms.filter(r => r.status === 'maintenance').length > 0 && (
                            <div className="bg-orange-50 border border-orange-200 rounded-3xl p-6">
                                <h3 className="font-extrabold text-sm text-orange-800 mb-3 flex items-center gap-2">
                                    🧹 Chambres en cours de nettoyage
                                    <span className="px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full text-[10px] font-bold">
                                        {rooms.filter(r => r.status === 'maintenance').length}
                                    </span>
                                </h3>
                                <div className="space-y-2">
                                    {rooms.filter(r => r.status === 'maintenance').map(r => (
                                        <div key={r.id} className="bg-white rounded-xl p-4 flex justify-between items-center text-xs border border-orange-100">
                                            <div>
                                                <span className="font-bold text-orange-900">Chambre {r.number}</span>
                                                <span className="text-orange-600 ml-2">{r.type} · {r.beds} lits</span>
                                            </div>
                                            <button
                                                onClick={() => handleCleanRoom(r.id)}
                                                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-1.5 rounded-lg text-[10px] transition"
                                            >
                                                ✓ Marquer propre
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
