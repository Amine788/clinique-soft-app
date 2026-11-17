import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { CalendarOff, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DoctorAbsencesPage() {
    const { user } = useAuthStore();
    const [data, setData] = useState({ absences: [], counters: {} });
    const [loading, setLoading] = useState(true);

    // Form state
    const [typeAbsence, setTypeAbsence] = useState('conge_annuel');
    const [dateDebut, setDateDebut] = useState('');
    const [dateFin, setDateFin] = useState('');
    const [motif, setMotif] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadAbsences = () => {
        const doctorId = user?.doctorId;
        if (doctorId) {
            setLoading(true);
            api.get(`/doctors/${doctorId}/absences`)
                .then(r => setData(r.data))
                .catch(() => { })
                .finally(() => setLoading(false));
        }
    };

    useEffect(() => {
        let active = true;
        if (user?.doctorId) {
            api.get(`/doctors/${user.doctorId}/absences`)
                .then(response => { if (active) setData(response.data); })
                .catch(() => { })
                .finally(() => { if (active) setLoading(false); });
        }
        return () => { active = false; };
    }, [user?.doctorId]); // ✅ Primitive stable


    const c = data.counters;

    const statusIcon = (s) => {
        if (s === 'Validé') return <CheckCircle size={16} className="text-success" />;
        if (s === 'Refusé') return <XCircle size={16} className="text-danger" />;
        return <Clock size={16} className="text-warning" />;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!dateDebut || !dateFin) return toast.error('Veuillez renseigner les dates de début et de fin');
        if (!motif.trim()) return toast.error('Le motif est obligatoire');

        setSubmitting(true);
        try {
            await api.post('/absences', {
                typeAbsence,
                dateDebut,
                dateFin,
                motif
            });
            toast.success('Demande d\'absence soumise avec succès !');
            setDateDebut('');
            setDateFin('');
            setMotif('');
            loadAbsences();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la soumission de la demande');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title">Mes Absences & Congés</h1>
                    <p className="text-muted text-sm mt-1">Gerez vos demandes de conge et consultez votre solde.</p>
                </div>
            </div>

            {/* Compteurs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                    { label: 'Conges annuels', used: c.annual?.used || 0, total: c.annual?.total || 25, color: 'primary' },
                    { label: 'Conges maladie', used: c.sick?.used || 0, total: c.sick?.total || 30, color: 'warning' },
                    { label: 'Formations', used: c.training?.used || 0, total: c.training?.total || 5, color: 'info' },
                ].map((item, i) => {
                    const pct = Math.round((item.used / item.total) * 100);
                    return (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                                <span className={`text-xs font-bold text-${item.color}`}>{item.used} / {item.total} jours</span>
                            </div>
                            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full bg-${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-muted mt-2">{item.total - item.used} jours restants</p>
                        </div>
                    );
                })}
            </div>

            {/* Formulaire de demande */}
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
                    <CalendarOff size={20} className="text-primary" /> Soumettre une demande
                </h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Type de conge</label>
                        <select 
                            value={typeAbsence}
                            onChange={e => setTypeAbsence(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                            <option value="conge_annuel">Conge annuel</option>
                            <option value="maladie">Maladie</option>
                            <option value="formation">Formation</option>
                            <option value="conge_sans_solde">Conge sans solde</option>
                            <option value="autre">Autre</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date debut</label>
                            <input 
                                type="date" 
                                value={dateDebut}
                                onChange={e => setDateDebut(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date fin</label>
                            <input 
                                type="date" 
                                value={dateFin}
                                onChange={e => setDateFin(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                            />
                        </div>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Motif (obligatoire)</label>
                        <textarea 
                            rows={3} 
                            value={motif}
                            onChange={e => setMotif(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" 
                            placeholder="Decrivez le motif de votre absence..." 
                        />
                    </div>
                    <div className="col-span-2 flex justify-end">
                        <button 
                            type="submit"
                            disabled={submitting}
                            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition shadow-md shadow-primary/25 disabled:opacity-50"
                        >
                            {submitting ? 'Envoi...' : 'Soumettre la demande'}
                        </button>
                    </div>
                </div>
            </form>

            {/* Liste des demandes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">Historique de mes demandes</h2>
                </div>
                {loading ? (
                    <div className="p-12 text-center text-muted">Chargement...</div>
                ) : data.absences.length === 0 ? (
                    <div className="p-12 text-center text-muted">Aucune demande enregistree.</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase">Dates</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase">Duree</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase">Motif</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase">Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.absences.map(a => (
                                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                    <td className="px-6 py-4 text-sm font-medium">{a.type}</td>
                                    <td className="px-6 py-4 text-sm text-muted">{a.startDate} → {a.endDate}</td>
                                    <td className="px-6 py-4 text-sm font-bold">{a.days} jour{a.days > 1 ? 's' : ''}</td>
                                    <td className="px-6 py-4 text-sm text-muted max-w-xs truncate">{a.reason}</td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1.5">
                                            {statusIcon(a.status)}
                                            <span className={`text-sm font-semibold ${a.status === 'Validé' ? 'text-success' : a.status === 'Refusé' ? 'text-danger' : 'text-warning'}`}>
                                                {a.status}
                                            </span>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
