import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Microscope, Activity, CheckCircle, Clock, XCircle, FileText, Droplet } from 'lucide-react';
import { ouvrirFichierProtege } from '../../utils/fichiers';

export default function LaboratoryPage() {
    const [examens, setExamens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statutFilter, setStatutFilter] = useState('');
    const [updatingId, setUpdatingId] = useState(null);
    const [resultatsText, setResultatsText] = useState({});
    const [selectedFiles, setSelectedFiles] = useState({});
    const [prixFacture, setPrixFacture] = useState({});
    const [dateResultatPrevue, setDateResultatPrevue] = useState({});

    const fetchExamens = useCallback(() => {
            const url = statutFilter ? `/examens?statut=${statutFilter}` : '/examens';
            return api.get(url).then(({ data }) => {
            setExamens(data);
        }).catch(() => {
            toast.error("Erreur lors du chargement des examens");
        }).finally(() => {
            setLoading(false);
        });
    }, [statutFilter]);

    useEffect(() => { fetchExamens(); }, [fetchExamens]);

    const updateStatut = async (id, nouveauStatut) => {
        setUpdatingId(id);
        try {
            const formData = new FormData();
            formData.append('statut', nouveauStatut);
            if (resultatsText[id]) formData.append('resultats', resultatsText[id]);
            if (selectedFiles[id]) formData.append('fichier', selectedFiles[id]);
            if (prixFacture[id] !== undefined) formData.append('prixFacture', prixFacture[id]);
            if (dateResultatPrevue[id] !== undefined) formData.append('dateResultatPrevue', dateResultatPrevue[id]);

            await api.patch(`/examens/${id}/statut`, formData);

            toast.success("Mise à jour réussie");
            fetchExamens();
        } catch {
            toast.error("Erreur lors de la mise à jour");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleFileChange = (id, file) => {
        setSelectedFiles(prev => ({ ...prev, [id]: file }));
    };

    const handleResultatsChange = (id, value) => {
        setResultatsText(prev => ({ ...prev, [id]: value }));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <Microscope className="text-primary" /> Laboratoire & Radiologie
                    </h1>
                    <p className="text-sm text-muted">Gestion des demandes d'examens</p>
                </div>
                <div>
                    <select
                        value={statutFilter}
                        onChange={(e) => { setLoading(true); setStatutFilter(e.target.value); }}
                        className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                        <option value="">Tous les statuts</option>
                        <option value="en_attente">En attente</option>
                        <option value="preleve">Prélevé</option>
                        <option value="en_cours">En cours</option>
                        <option value="termine">Terminés</option>
                        <option value="annule">Annulés</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-muted text-sm">Chargement des examens...</div>
                ) : examens.length === 0 ? (
                    <div className="p-8 text-center text-muted text-sm">Aucun examen trouvé.</div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-xs text-muted uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date & Réf.</th>
                                <th className="px-6 py-4 font-medium">Patient</th>
                                <th className="px-6 py-4 font-medium">Examen</th>
                                <th className="px-6 py-4 font-medium">Prescripteur</th>
                                <th className="px-6 py-4 font-medium">Statut</th>
                                <th className="px-6 py-4 font-medium text-right">Actions / Résultats</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/80">
                            {examens.map(ex => {
                                const isLabo = ex.examenDetails?.type === 'laboratoire';
                                const parsedDate = new Date(ex.createdAt);

                                return (
                                    <tr key={ex.id} className="hover:bg-gray-50/50 transition duration-150">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-900 font-medium">{parsedDate.toLocaleDateString('fr-FR')}</div>
                                            <div className="text-xs text-muted">{parsedDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                                            <div className="text-xs text-brand-400 font-mono mt-1">#{ex.id}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{ex.Patient?.prenom} {ex.Patient?.nom}</div>
                                            <div className="text-xs text-muted font-mono">{ex.Patient?.cinNumero}</div>
                                            <div className="text-xs text-muted mt-0.5">Dossier: {ex.Patient?.numeroDossier}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {isLabo ? <Activity size={16} className="text-brand-500" /> : <Activity size={16} className="text-purple-500" />}
                                                <div>
                                                    <div className="font-medium text-gray-900">{ex.examenDetails?.nom || 'Inconnu'}</div>
                                                    <div className="flex gap-2 text-xs mt-1">
                                                        <span className={`px-2 py-0.5 rounded border ${isLabo ? 'bg-brand-50 text-brand-700 border-brand-100' : 'bg-purple-50 text-purple-700 border-purple-100'}`}>
                                                            {isLabo ? 'Laboratoire' : 'Radiologie'}
                                                        </span>
                                                        <span className="text-muted">{ex.examenDetails?.categorie}</span>
                                                    </div>
                                                    {ex.dateResultatPrevue && (
                                                        <div className="text-xs text-orange-600 font-medium flex items-center gap-1 mt-1.5">
                                                            <Clock size={12} />
                                                            Prévu: {new Date(ex.dateResultatPrevue).toLocaleString('fr-FR', {
                                                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {ex.notesObligatoires && (
                                                <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded-lg border border-amber-100 flex gap-2 items-start">
                                                    <FileText size={14} className="shrink-0 mt-0.5" />
                                                    <span>{ex.notesObligatoires}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-900 text-sm">Dr. {ex.Medecin?.User?.prenom} {ex.Medecin?.User?.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                                                ${ex.statut === 'en_attente' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    ex.statut === 'preleve' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                                    ex.statut === 'en_cours' ? 'bg-brand-50 text-brand-700 border-brand-200' :
                                                        ex.statut === 'termine' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                            'bg-red-50 text-red-700 border-red-200'}`}
                                            >
                                                {ex.statut === 'en_attente' && <Clock size={12} />}
                                                {ex.statut === 'preleve' && <Droplet size={12} />}
                                                {ex.statut === 'en_cours' && <Activity size={12} />}
                                                {ex.statut === 'termine' && <CheckCircle size={12} />}
                                                {ex.statut === 'annule' && <XCircle size={12} />}
                                                {ex.statut === 'en_attente' ? 'En attente' :
                                                    ex.statut === 'preleve' ? 'Prélevé' :
                                                    ex.statut === 'en_cours' ? 'En cours' :
                                                        ex.statut === 'termine' ? 'Terminé' : 'Annulé'}
                                            </span>
                                            {ex.estFacture && (
                                                <div className="mt-2 inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold tracking-wider uppercase">
                                                    Facturé
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right space-y-2">
                                            {isLabo && ex.statut === 'en_attente' && (
                                                <div className="text-xs bg-brand-50 text-brand-700 border border-brand-100 rounded-xl p-3 flex items-center gap-2 justify-end">
                                                    <Droplet size={14} /> En attente de prélèvement (infirmier)
                                                </div>
                                            )}

                                            {(ex.statut === 'preleve' || ex.statut === 'en_cours' || (!isLabo && ex.statut === 'en_attente')) && (
                                                <div className="bg-white p-3 rounded-xl border border-gray-200">
                                                    <div className="grid grid-cols-2 gap-2 mb-3 text-left">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Prix (MAD)</label>
                                                            <input
                                                                type="number"
                                                                placeholder="ex: 300"
                                                                value={prixFacture[ex.id] !== undefined ? prixFacture[ex.id] : (ex.prixFacture || ex.examenDetails?.prixStandard || '')}
                                                                onChange={e => setPrixFacture({ ...prixFacture, [ex.id]: e.target.value })}
                                                                className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 bg-gray-50/50"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Prêt pour le</label>
                                                            <input
                                                                type="datetime-local"
                                                                value={dateResultatPrevue[ex.id] !== undefined ? dateResultatPrevue[ex.id] : (ex.dateResultatPrevue ? new Date(ex.dateResultatPrevue).toISOString().slice(0, 16) : '')}
                                                                onChange={e => setDateResultatPrevue({ ...dateResultatPrevue, [ex.id]: e.target.value })}
                                                                className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 bg-gray-50/50"
                                                            />
                                                        </div>
                                                    </div>

                                                    <textarea
                                                        placeholder="Saisir les résultats ici (optionnel)..."
                                                        rows={2}
                                                        value={resultatsText[ex.id] || ex.resultats || ''}
                                                        onChange={(e) => handleResultatsChange(ex.id, e.target.value)}
                                                        className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary/30 outline-none resize-none mb-2"
                                                    />

                                                    {ex.statut === 'en_cours' && (
                                                        <div className="mb-2">
                                                            <input
                                                                type="file"
                                                                id={`file-${ex.id}`}
                                                                className="hidden"
                                                                onChange={(e) => handleFileChange(ex.id, e.target.files[0])}
                                                            />
                                                            <label
                                                                htmlFor={`file-${ex.id}`}
                                                                className="flex items-center gap-2 cursor-pointer text-[10px] bg-gray-100 p-2 rounded border border-gray-200 hover:bg-gray-200 transition"
                                                            >
                                                                <FileText size={12} />
                                                                {selectedFiles[ex.id] ? selectedFiles[ex.id].name : 'Attacher Scan/Radio/PDF'}
                                                            </label>
                                                        </div>
                                                    )}

                                                    <div className="flex justify-end gap-2">
                                                        {ex.statut !== 'en_cours' && (
                                                            <button
                                                                onClick={() => updateStatut(ex.id, 'en_cours')}
                                                                disabled={updatingId === ex.id}
                                                                className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition flex items-center justify-center flex-1"
                                                            >
                                                                ✓ Accepter (En cours)
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => updateStatut(ex.id, 'termine')}
                                                            disabled={updatingId === ex.id}
                                                            className="px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg text-xs font-bold transition flex items-center justify-center flex-1"
                                                        >
                                                            ✓ Terminer
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {ex.statut === 'termine' && (
                                                <div className="text-left text-xs bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                                                    {ex.prixFacture > 0 && (
                                                        <div className="font-bold text-primary flex justify-between border-b pb-1 mb-1">
                                                            <span>💰 Prix facturé :</span>
                                                            <span>{ex.prixFacture} MAD</span>
                                                        </div>
                                                    )}
                                                    <span className="font-semibold text-gray-500 block">Cpte Rendu / Résultats:</span>
                                                    {ex.resultats ? <p className="text-gray-700 whitespace-pre-wrap">{ex.resultats}</p> : <span className="italic text-gray-400">Aucun résultat textuel</span>}

                                                    {ex.fichierResultat && (
                                                        <button
                                                            type="button"
                                                            onClick={() => ouvrirFichierProtege(`/examens/${ex.id}/fichier`)}
                                                            className="mt-2 flex w-full items-center gap-2 p-2 bg-brand-50 text-brand-700 rounded border border-brand-100 hover:bg-brand-100 transition"
                                                        >
                                                            <FileText size={14} /> Voir le fichier (Scan/Radio)
                                                        </button>
                                                    )}
                                                </div>
                                            )}
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
