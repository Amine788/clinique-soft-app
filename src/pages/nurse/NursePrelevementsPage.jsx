import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Droplet, Clock, FileText, CheckCircle2 } from 'lucide-react';

export default function NursePrelevementsPage() {
    const [examens, setExamens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);

    useEffect(() => {
        fetchExamens();
    }, []);

    const fetchExamens = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/examens?statut=en_attente');
            setExamens(data.filter(ex => ex.examenDetails?.type === 'laboratoire'));
        } catch {
            toast.error("Erreur lors du chargement des prélèvements à effectuer");
        } finally {
            setLoading(false);
        }
    };

    const marquerPreleve = async (id) => {
        setUpdatingId(id);
        try {
            const formData = new FormData();
            formData.append('statut', 'preleve');
            await api.patch(`/examens/${id}/statut`, formData);
            toast.success('Prélèvement enregistré — envoyé au laboratoire');
            setExamens(prev => prev.filter(ex => ex.id !== id));
        } catch (error) {
            toast.error(error.response?.data?.error || "Erreur lors de l'enregistrement du prélèvement");
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title flex items-center gap-2">
                    <Droplet className="text-primary" /> Prélèvements Laboratoire
                </h1>
                <p className="text-sm text-muted">Examens de laboratoire prescrits en attente de prélèvement</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-muted text-sm">Chargement...</div>
                ) : examens.length === 0 ? (
                    <div className="p-8 text-center text-muted text-sm">Aucun prélèvement en attente. 🎉</div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-xs text-muted uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Patient</th>
                                <th className="px-6 py-4 font-medium">Examen</th>
                                <th className="px-6 py-4 font-medium">Prescripteur</th>
                                <th className="px-6 py-4 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/80">
                            {examens.map(ex => {
                                const parsedDate = new Date(ex.createdAt);
                                return (
                                    <tr key={ex.id} className="hover:bg-gray-50/50 transition duration-150">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-900 font-medium">{parsedDate.toLocaleDateString('fr-FR')}</div>
                                            <div className="text-xs text-muted">{parsedDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{ex.Patient?.prenom} {ex.Patient?.nom}</div>
                                            <div className="text-xs text-muted font-mono">{ex.Patient?.cinNumero}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{ex.examenDetails?.nom || 'Inconnu'}</div>
                                            {ex.notesObligatoires && (
                                                <div className="mt-1 text-xs bg-amber-50 text-amber-800 p-2 rounded-lg border border-amber-100 flex gap-2 items-start max-w-xs">
                                                    <FileText size={14} className="shrink-0 mt-0.5" />
                                                    <span>{ex.notesObligatoires}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                                            Dr. {ex.Medecin?.User?.prenom} {ex.Medecin?.User?.nom}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => marquerPreleve(ex.id)}
                                                disabled={updatingId === ex.id}
                                                className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                <CheckCircle2 size={14} /> Marquer prélevé
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
