import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { PackageCheck, CheckCircle, Clock, AlertCircle, Pill, Loader, Download } from 'lucide-react';
import { useSocket } from '../../hooks/useSocket';
import { generatePrescriptionPDF } from '../../utils/pdfGenerator';

const STATUT_LABELS = {
    en_attente: { label: '⏳ En attente', cls: 'bg-amber-100 text-amber-700' },
    en_preparation: { label: '🔄 En préparation', cls: 'bg-brand-100 text-brand-700' },
    preparee: { label: '✅ Prête', cls: 'bg-green-100 text-green-700' },
    remise: { label: '💊 Remise', cls: 'bg-gray-100 text-gray-500' },
};

export default function PharmacyDispensationPage() {
    const [prescriptions, setPrescriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});
    const [clinicInfo, setClinicInfo] = useState(null);

    // Charger les ordonnances et les infos clinique depuis l'API
    const fetchPrescriptions = () => {
        api.get('/prescriptions')
            .then(r => setPrescriptions(r.data || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchPrescriptions();
        api.get('/clinic').then(r => setClinicInfo(r.data)).catch(() => {});
    }, []);

    // Écouter les nouvelles ordonnances via Socket.io
    useSocket({
        new_prescription: () => {
            toast('💊 Nouvelle ordonnance reçue du médecin !', { icon: '🔔', duration: 6000 });
            fetchPrescriptions(); // Recharger la liste
        },
    });

    const setStatut = async (id, statut) => {
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            await api.patch(`/prescriptions/${id}/status`, { statut });
            setPrescriptions(prev => prev.map(p => p.id === id ? { ...p, statut } : p));
            if (statut === 'preparee') toast.success('Médicaments préparés — médecin notifié !');
            if (statut === 'remise') toast.success('Médicaments remis au patient');
        } catch {
            toast.error('Erreur de mise à jour');
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    const pendingCount = prescriptions.filter(p => p.statut === 'en_attente').length;
    const enPrepCount = prescriptions.filter(p => p.statut === 'en_preparation').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">💊 File d'Ordonnances</h1>
                    <p className="text-muted text-sm mt-1">Ordonnances reçues en temps réel des médecins.</p>
                </div>
                <div className="flex gap-3">
                    {pendingCount > 0 && (
                        <div className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl text-sm font-semibold">
                            {pendingCount} en attente
                        </div>
                    )}
                    {enPrepCount > 0 && (
                        <div className="px-3 py-1.5 bg-brand-100 text-brand-700 rounded-xl text-sm font-semibold">
                            {enPrepCount} en préparation
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader className="animate-spin text-primary" size={28} />
                </div>
            ) : prescriptions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
                    <PackageCheck size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Aucune ordonnance en attente</p>
                    <p className="text-xs text-muted mt-1">Les nouvelles ordonnances apparaîtront ici automatiquement</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {prescriptions.map(p => {
                        const loading = actionLoading[p.id];
                        const statut = STATUT_LABELS[p.statut] || STATUT_LABELS.en_attente;
                        return (
                            <div key={p.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${p.statut === 'en_attente' ? 'border-amber-200' : p.statut === 'en_preparation' ? 'border-brand-200' : 'border-gray-100'}`}>
                                {/* En-tête ordonnance */}
                                <div className={`px-5 py-3 flex items-center justify-between ${p.statut === 'en_attente' ? 'bg-amber-50' : p.statut === 'en_preparation' ? 'bg-brand-50' : 'bg-gray-50'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="font-mono font-bold text-sm text-gray-900">{p.numero}</div>
                                        <span className={`text-xs rounded-full px-2.5 py-0.5 font-semibold ${statut.cls}`}>{statut.label}</span>
                                        {p.medecinNom && <span className="text-xs text-muted">par {p.medecinNom}</span>}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-xs text-muted">{new Date(p.createdAt).toLocaleString('fr-FR')}</div>
                                        <button onClick={() => generatePrescriptionPDF(p, null, null, clinicInfo)} className="p-1.5 text-gray-500 hover:text-primary hover:bg-white rounded-lg transition" title="Télécharger PDF">
                                            <Download size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Corps ordonnance */}
                                <div className="px-5 py-4 space-y-3">
                                    <div className="flex gap-6 text-sm mb-2">
                                        <div><span className="text-muted text-xs">Patient CIN</span><div className="font-semibold font-mono">{p.patientCin}</div></div>
                                        {p.patientNom && <div><span className="text-muted text-xs">Nom</span><div className="font-medium">{p.patientNom}</div></div>}
                                        {p.diagnostique && <div><span className="text-muted text-xs">Diagnostic</span><div className="font-medium">{p.diagnostique}</div></div>}
                                    </div>

                                    {/* Notes du médecin */}
                                    {p.notes && (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 my-3">
                                            <div className="flex items-center gap-2 text-yellow-800 font-bold text-sm mb-1">
                                                <AlertCircle size={16} className="text-yellow-600" /> Note importante du médecin
                                            </div>
                                            <p className="text-sm text-yellow-900 font-medium">{p.notes}</p>
                                        </div>
                                    )}

                                    {/* Médicaments */}
                                    <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted uppercase tracking-wide">Médicaments ({p.medicaments?.length || 0})</div>
                                        {(p.medicaments || []).map((m, i) => (
                                            <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                                <Pill size={14} className="text-primary flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold text-sm">{m.nom}</div>
                                                    <div className="text-xs text-muted">{m.posologie} • {m.frequence} • {m.duree}</div>
                                                    {m.instructions && <div className="text-xs text-muted italic">{m.instructions}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    {p.statut !== 'remise' && (
                                        <div className="flex gap-2 pt-1">
                                            {p.statut === 'en_attente' && (
                                                <button onClick={() => setStatut(p.id, 'en_preparation')} disabled={loading}
                                                    className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50">
                                                    {loading ? <Loader size={14} className="animate-spin" /> : <Clock size={14} />} Prendre en charge
                                                </button>
                                            )}
                                            {p.statut === 'en_preparation' && (
                                                <button onClick={() => setStatut(p.id, 'preparee')} disabled={loading}
                                                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50">
                                                    {loading ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />} Marquer prête (notifier médecin)
                                                </button>
                                            )}
                                            {p.statut === 'preparee' && (
                                                <button onClick={() => setStatut(p.id, 'remise')} disabled={loading}
                                                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50">
                                                    {loading ? <Loader size={14} className="animate-spin" /> : <PackageCheck size={14} />} Confirmer remise au patient
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
