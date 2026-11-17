import React, { useEffect, useState } from 'react';
import { FileText, IdCard, ExternalLink, RefreshCw, FolderOpen } from 'lucide-react';
import api from '../../api/axios';
import { ouvrirFichierProtege } from '../../utils/fichiers';

// Onglet Documents du dossier patient : scans de CIN et résultats d'examens enregistrés par la clinique.
// Chaque fichier est ouvert avec la session (jamais d'accès libre).
export default function DocumentsPatient({ numeroDossier }) {
    const [documents, setDocuments] = useState(null);
    const [erreur, setErreur] = useState(null);

    useEffect(() => {
        api.get(`/patients/${numeroDossier}/documents`)
            .then(r => setDocuments(r.data || []))
            .catch(err => setErreur(err.response?.data?.error || 'Impossible de charger les documents'));
    }, [numeroDossier]);

    if (erreur) return <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">{erreur}</div>;
    if (!documents) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-primary" /></div>;

    if (documents.length === 0) {
        return (
            <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
                <FolderOpen size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-400" aria-hidden="true" />
                <p className="font-bold text-gray-900">Aucun document pour ce patient</p>
                <p className="mt-1 text-sm text-gray-500">Les scans de CIN pris à la création du dossier et les fichiers de résultats déposés par le laboratoire apparaîtront ici.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Documents médicaux ({documents.length})</h3>
            <ul className="divide-y divide-gray-100">
                {documents.map(doc => {
                    const Icone = doc.type === 'cin' ? IdCard : FileText;
                    return (
                        <li key={`${doc.type}-${doc.id}`} className="flex items-center gap-4 py-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icone size={18} aria-hidden="true" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900">{doc.titre}</p>
                                <p className="text-xs text-gray-500">
                                    {doc.type === 'cin' ? 'Pièce d’identité' : `Résultat ${doc.categorie === 'radiologie' ? 'd’imagerie' : 'de laboratoire'}`}
                                    {doc.date && ` · ${new Date(doc.date).toLocaleDateString('fr-FR')}`}
                                </p>
                            </div>
                            <button type="button" onClick={() => ouvrirFichierProtege(doc.url)}
                                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">
                                <ExternalLink size={13} /> Ouvrir
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
