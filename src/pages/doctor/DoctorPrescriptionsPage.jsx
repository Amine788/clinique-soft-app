import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

import { useSocket } from '../../hooks/useSocket';
import { PackageCheck, Activity, Clock, CheckCircle, Pill, Loader, Download } from 'lucide-react';
import { generatePrescriptionPDF } from '../../utils/pdfGenerator';

const STATUT_LABELS = {
    en_attente: { label: 'En attente pharmacie', cls: 'bg-amber-100 text-amber-700' },
    en_preparation: { label: 'En préparation', cls: 'bg-brand-100 text-brand-700' },
    preparee: { label: 'Prête (à récupérer)', cls: 'bg-green-100 text-green-700' },
    remise: { label: 'Remise au patient', cls: 'bg-gray-100 text-gray-500' },
};

export default function DoctorPrescriptionsPage() {
    const [prescriptions, setPrescriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [clinicInfo, setClinicInfo] = useState(null);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [prescRes, clinicRes] = await Promise.all([
                api.get('/prescriptions'),
                api.get('/clinic').catch(() => ({ data: null }))
            ]);

            setPrescriptions(prescRes.data || []);
            setClinicInfo(clinicRes.data);
        } catch {
            toast.error('Erreur de chargement');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const handleDownloadPDF = (p) => {
        generatePrescriptionPDF(p, null, null, clinicInfo);
    };


    // Écouteur temps réel pour le statut des ordonnances
    useSocket({
        prescription_ready: () => {
            fetchAll();
        },
        meds_administered: (data) => {
            toast.success(data.message || 'Traitement administré par l\'infirmière', { duration: 6000 });
            fetchAll();
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Mes Ordonnances</h1>
                    <p className="text-muted text-sm mt-1">Suivez en temps réel le statut des médicaments de vos patients</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader className="animate-spin text-primary" size={28} />
                </div>
            ) : prescriptions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
                    <PackageCheck size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Vous n'avez pas encore généré d'ordonnance</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {prescriptions.map(p => {
                        const statut = STATUT_LABELS[p.statut] || STATUT_LABELS.en_attente;
                        return (
                            <div key={p.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${p.statut === 'preparee' ? 'border-green-200' : p.statut === 'remise' ? 'border-transparent' : 'border-gray-100'}`}>
                                <div className={`px-5 py-3 flex items-center justify-between ${p.statut === 'preparee' ? 'bg-green-50' : p.statut === 'remise' ? 'bg-gray-50' : 'bg-gray-50/50'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="font-mono font-bold text-sm text-gray-900">{p.numero}</div>
                                        <span className={`text-xs rounded-full px-2.5 py-0.5 font-semibold ${statut.cls}`}>{statut.label}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-xs text-muted font-medium">{new Date(p.createdAt).toLocaleString('fr-FR')}</div>
                                        <button onClick={() => handleDownloadPDF(p)} className="p-1 text-gray-400 hover:text-primary transition" title="Télécharger PDF">
                                            <Download size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="px-5 py-4 space-y-3">
                                    <div className="flex gap-6 text-sm">
                                        <div><span className="text-muted text-xs block mb-0.5">Patient CIN</span><div className="font-semibold font-mono">{p.patientCin}</div></div>
                                        {p.patientNom && <div><span className="text-muted text-xs block mb-0.5">Nom</span><div className="font-medium text-gray-800">{p.patientNom}</div></div>}
                                        {p.diagnostique && <div><span className="text-muted text-xs block mb-0.5">Diagnostic</span><div className="font-medium text-gray-800">{p.diagnostique}</div></div>}
                                    </div>

                                    {p.notes && (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mt-2">
                                            <span className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider mb-1 block">Notes pour la pharmacie</span>
                                            <p className="text-xs text-yellow-900 italic font-medium">{p.notes}</p>
                                        </div>
                                    )}

                                    <div className="space-y-1.5 mt-3">
                                        <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Médicaments prescrits ({p.medicaments?.length || 0})</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(p.medicaments || []).map((m, i) => (
                                                <div key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                                    <Pill size={14} className="text-primary flex-shrink-0 mt-0.5" />
                                                    <div>
                                                        <div className="font-semibold text-xs text-gray-900">{m.nom}</div>
                                                        <div className="text-[10px] text-gray-500 mt-0.5">{m.posologie} • {m.frequence}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
