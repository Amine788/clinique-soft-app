import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../hooks/useSocket';
import { CalendarOff, CheckCircle, XCircle, Clock, CalendarClock, RefreshCw } from 'lucide-react';

// Validation des absences des médecins (secrétaire, admin) : une absence validée bloque la prise de RDV
// du médecin sur la période ; les RDV déjà pris (« RDV impactés ») sont à reprogrammer.

const TYPES = {
    conge_annuel: 'Congé annuel',
    maladie: 'Maladie',
    formation: 'Formation',
    conge_sans_solde: 'Congé sans solde',
    autre: 'Autre',
};

const STATUTS = {
    en_attente: { label: 'En attente', className: 'bg-amber-50 text-amber-700', Icon: Clock },
    validee: { label: 'Validée', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle },
    refusee: { label: 'Refusée', className: 'bg-red-50 text-red-600', Icon: XCircle },
};

const FILTRES = [
    { value: 'en_attente', label: 'À traiter' },
    { value: 'validee', label: 'Validées' },
    { value: 'refusee', label: 'Refusées' },
    { value: '', label: 'Toutes' },
];

const dateFr = d => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const nbJours = (debut, fin) => Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1;

export default function AbsencesPage() {
    const [absences, setAbsences] = useState([]);
    const [filtre, setFiltre] = useState('en_attente');
    const [loading, setLoading] = useState(true);
    const [enCours, setEnCours] = useState(null);

    const charger = useCallback(() => {
        setLoading(true);
        return api.get('/absences', { params: filtre ? { statut: filtre } : {} })
            .then(r => setAbsences(r.data || []))
            .catch(err => toast.error(err.response?.data?.error || 'Impossible de charger les absences'))
            .finally(() => setLoading(false));
    }, [filtre]);

    useEffect(() => { charger(); }, [charger]);

    // Nouvelle demande d'un médecin : liste rafraîchie
    useSocket({ absence_request: () => charger() });

    const decider = async (absence, statut) => {
        setEnCours(absence.id);
        try {
            const { data } = await api.patch(`/absences/${absence.id}`, { statut });
            if (statut === 'validee') {
                toast.success(data.rdvImpactes
                    ? `Absence validée — ${data.rdvImpactes} RDV à reprogrammer`
                    : 'Absence validée — aucun RDV concerné');
            } else {
                toast.success('Absence refusée');
            }
            await charger();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la décision');
        } finally {
            setEnCours(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <CalendarOff size={24} className="text-primary" /> Absences des médecins
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Une absence validée bloque la prise de rendez-vous du médecin sur la période.
                    </p>
                </div>
                <button onClick={charger} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                    <RefreshCw size={15} /> Actualiser
                </button>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les absences">
                {FILTRES.map(f => (
                    <button key={f.value} role="tab" aria-selected={filtre === f.value} onClick={() => setFiltre(f.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${filtre === f.value ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-primary" /></div>
            ) : absences.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-500">
                    Aucune absence {filtre === 'en_attente' ? 'à traiter' : 'dans cette liste'}.
                </div>
            ) : (
                <div className="space-y-3">
                    {absences.map(a => {
                        const statut = STATUTS[a.statut] || STATUTS.en_attente;
                        return (
                            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-gray-900">Dr. {a.medecinNom || '—'}</span>
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">{TYPES[a.typeAbsence] || a.typeAbsence}</span>
                                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg ${statut.className}`}>
                                            <statut.Icon size={12} aria-hidden="true" /> {statut.label}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 mt-1">
                                        Du <strong>{dateFr(a.dateDebut)}</strong> au <strong>{dateFr(a.dateFin)}</strong> · {nbJours(a.dateDebut, a.dateFin)} jour(s)
                                    </p>
                                    {a.motif && <p className="text-sm text-gray-500 mt-0.5">{a.motif}</p>}
                                    {a.rdvImpactes > 0 && (
                                        <Link to="/appointments" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline">
                                            <CalendarClock size={13} aria-hidden="true" /> {a.rdvImpactes} RDV déjà pris sur la période{a.statut === 'validee' ? ' — à reprogrammer' : ''}
                                        </Link>
                                    )}
                                </div>
                                {a.statut === 'en_attente' && (
                                    <div className="flex gap-2">
                                        <button onClick={() => decider(a, 'validee')} disabled={enCours === a.id}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60">
                                            <CheckCircle size={15} /> Valider
                                        </button>
                                        <button onClick={() => decider(a, 'refusee')} disabled={enCours === a.id}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 disabled:opacity-60">
                                            <XCircle size={15} /> Refuser
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
