import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../hooks/useSocket';
import { User, AlertTriangle, Sparkles, Plus, Check, X, Pill, ClipboardList, ArrowLeft, CheckCircle, Download, FileText } from 'lucide-react';
import { generatePrescriptionPDF } from '../../utils/pdfGenerator';
import { PRISES_PAR_JOUR } from '../../utils/posologie';
import { ouvrirFichierProtege } from '../../utils/fichiers';

export default function ConsultationPage() {
    const { rdvId } = useParams();
    const navigate = useNavigate();

    const [rdv, setRdv] = useState(null);
    const [patient, setPatient] = useState(null);
    const [loadingDossier, setLoadingDossier] = useState(true);
    const [dossierError, setDossierError] = useState(null);

    // Ordonnance
    const [medicamentInput, setMedicamentInput] = useState('');
    const [posologie, setPosologie] = useState('1 comprimé');
    const [frequence, setFrequence] = useState('3 fois/jour');
    const [duree, setDuree] = useState('7 jours');
    const [instructions, setInstructions] = useState('');
    const [medicaments, setMedicaments] = useState([]);
    const [stockInfo, setStockInfo] = useState({});
    const [allergyAlert, setAllergyAlert] = useState(null);

    // Examens
    const [examensCatalog, setExamensCatalog] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [examNotes, setExamNotes] = useState('');
    const [examensPrescrits, setExamensPrescrits] = useState([]);
    const [examensEnvoyes, setExamensEnvoyes] = useState(false);

    // Consultation
    const [diagnostique, setDiagnostique] = useState('');
    const [notesPharmacie, setNotesPharmacie] = useState('');
    const [examenHistory, setExamenHistory] = useState([]);

    // Hospitalisation
    const [hospDiagnostic, setHospDiagnostic] = useState('');
    const [hospMotif, setHospMotif] = useState('');
    const [hospEtat, setHospEtat] = useState('stable');
    const [hospCreee, setHospCreee] = useState(false);

    const [activeTab, setActiveTab] = useState('ordonnance');
    const [submitting, setSubmitting] = useState(false);
    const [ordonnanceCreee, setOrdonnanceCreee] = useState(null);
    const [endingConsultation, setEndingConsultation] = useState(false);
    const [clinicInfo, setClinicInfo] = useState(null);

    useSocket({
        prescription_ready: (data) => {
            toast.success(`Le pharmacien a préparé l'ordonnance ${data.data?.numero || ''} pour ce patient !`, { icon: '✅', duration: 8000 });
        },
        examen_ready: (data) => {
            toast.success(`Résultats d'examen disponibles pour ${data.patientNom} : ${data.examenNom}`, {
                icon: '🧪',
                duration: 10000,
                style: { background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1' }
            });
            // Recharger l'historique si on est sur la fiche du patient
            fetchExamHistory();
        },
        nurse_alert: (data) => {
            const urgencyIcon = data.urgency === 'critique' ? '🚨' : data.urgency === 'urgent' ? '⚠️' : '💬';
            const urgencyStyle = data.urgency === 'critique'
                ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }
                : data.urgency === 'urgent'
                    ? { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }
                    : { background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1' };
            toast(`🏥 Alerte infirmier(e) — ${data.patientNom}\n${data.message}`, {
                icon: urgencyIcon,
                duration: 12000,
                style: urgencyStyle,
            });
        }
    });

    useEffect(() => {
        let active = true;
        setLoadingDossier(true);
        setDossierError(null);
        (async () => {
            try {
                const { data: visit } = await api.get(`/appointments/${rdvId}`);
                const { data: dossier } = await api.get(`/patients/check-cin/${visit.patientCin}`);
                if (!dossier.patient) throw new Error('Dossier patient introuvable');
                if (['arrive', 'pret'].includes(visit.statut)) {
                    await api.put(`/appointments/${rdvId}/status`, { status: 'en_cours' });
                    visit.statut = 'en_cours';
                }
                if (active) { setRdv(visit); setPatient(dossier.patient); }
            } catch (error) {
                if (active) setDossierError(error.response?.data?.error || error.message || 'Consultation indisponible');
            } finally { if (active) setLoadingDossier(false); }
        })();

        // Charger le catalogue d'examens
        api.get('/examens/catalog').then(r => setExamensCatalog(r.data)).catch(() => { });

        // Charger les infos de la clinique
        api.get('/clinic').then(r => setClinicInfo(r.data)).catch(() => { });

        return () => { active = false; };
    }, [rdvId]);


    const fetchExamHistory = useCallback(() => {
        const cin = patient?.cin?.numero || rdv?.patientCin;
        if (!cin) return;
        return api.get(`/examens/patient/${cin}`).then(({ data }) => {
            setExamenHistory(data);
        }).catch(() => { /* L'historique est facultatif. */ });
    }, [patient?.cin?.numero, rdv?.patientCin]);

    useEffect(() => { fetchExamHistory(); }, [fetchExamHistory]);

    // Vérif allergie quand on tape un médicament
    useEffect(() => {
        if (medicamentInput && patient?.allergies?.length > 0) {
            const molSearch = medicamentInput.toLowerCase();
            const alert = patient.allergies.find(a => {
                const allergie = a.toLowerCase();
                return molSearch.includes(allergie) ||
                    (allergie === 'pénicilline' && (molSearch.includes('amoxicilline') || molSearch.includes('ampicilline')));
            });
            setAllergyAlert(alert || null);
        } else {
            setAllergyAlert(null);
        }
    }, [medicamentInput, patient]);

    // Vérifier le stock du médicament
    const checkStock = async (nom) => {
        if (!nom.trim() || stockInfo[nom]) return;
        try {
            const { data } = await api.get(`/pharmacy/stock?search=${encodeURIComponent(nom)}`);
            const item = (data.products || data || [])[0];
            if (item) setStockInfo(prev => ({ ...prev, [nom]: item.stockActuel || item.stock || 0 }));
        } catch { /* facultatif : l'échec est sans conséquence ici */ }
    };

    const addMedicament = () => {
        if (!medicamentInput.trim()) return;
        if (allergyAlert) {
            if (!window.confirm(`⚠️ ALERTE ALLERGIE — Ce patient est allergique à ${allergyAlert}. Confirmer quand même ?`)) return;
        }
        const med = { nom: medicamentInput, posologie, frequence, timesPerDay: PRISES_PAR_JOUR[frequence], duree, instructions };
        setMedicaments(prev => [...prev, med]);
        setMedicamentInput('');
        setInstructions('');
        checkStock(medicamentInput);
    };

    const removeMedicament = (i) => setMedicaments(prev => prev.filter((_, idx) => idx !== i));

    const submitOrdonnance = async () => {
        if (!medicaments.length) return toast.error('Ajoutez au moins un médicament');
        const patientCin = patient?.cin?.numero || rdv?.patientCin || 'DEMO';
        setSubmitting(true);
        try {
            const { data } = await api.post('/prescriptions', {
                patientCin,
                rdvId: rdvId !== 'demo' ? rdvId : null,
                medicaments,
                notes: notesPharmacie,
                diagnostique
            });
            setOrdonnanceCreee(data.ordonnance);
            toast.success(`Ordonnance ${data.ordonnance.numero} envoyée au pharmacien ! 💊`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur création ordonnance');
        } finally {
            setSubmitting(false);
        }
    };

    const submitExamens = async () => {
        if (!examensPrescrits.length) return toast.error("Ajoutez au moins un examen");
        setSubmitting(true);
        try {
            const patientCin = patient?.cin?.numero || rdv?.patientCin;
            await api.post('/examens', {
                patientCin,
                rdvId: rdvId !== 'demo' ? rdvId : null,
                examensIds: examensPrescrits.map(e => e.id),
                notesObligatoires: examNotes
            });
            setExamensEnvoyes(true);
            toast.success("Demande d'examens envoyée !");
        } catch (err) {
            toast.error(err.response?.data?.error || "Erreur lors de la prescription d'examens");
        } finally {
            setSubmitting(false);
        }
    };

    const submitHospitalisation = async () => {
        if (!hospDiagnostic.trim()) {
            return toast.error("Le diagnostic est obligatoire pour demander une hospitalisation");
        }
        setSubmitting(true);
        try {
            // ✅ Utiliser patient.dbId (entier PK) — patient.id retourne le numeroDossier (string)
            const patientDbId = patient?.dbId || patient?.id;
            await api.post('/hospitalisations', {
                patientId: patientDbId,
                diagnostic: hospDiagnostic,
                motif: hospMotif,
                etat: hospEtat
            });
            setHospCreee(true);
            toast.success("Demande d'hospitalisation créée ! La secrétaire a été notifiée. 🏥");
        } catch (err) {
            toast.error(err.response?.data?.error || "Erreur lors de la création de la demande");
        } finally {
            setSubmitting(false);
        }
    };

    const terminerConsultation = async () => {
        setEndingConsultation(true);
        try {
            // Notifier la secrétaire via le backend
            await api.put(`/appointments/${rdvId}/status`, { status: 'termine' });
            toast.success('Consultation terminée — La secrétaire a été notifiée pour la facturation');
            navigate('/doctor/agenda');
        } catch {
            navigate('/doctor/agenda');
        } finally {
            setEndingConsultation(false);
        }
    };

    const patientNom = patient ? `${patient.prenom} ${patient.nom}` : rdv?.patientNom || 'Patient';
    const patientCin = patient?.cin?.numero || rdv?.patientCin || '—';

    if (dossierError) return <div role="alert" className="card p-6 space-y-4"><p>{dossierError}</p><button className="btn btn-outline" onClick={() => navigate('/dashboard')}>Retour au tableau de bord</button></div>;

    return (
        <div className="space-y-5 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/doctor/agenda')} className="p-1.5 hover:bg-gray-100 rounded-xl text-muted"><ArrowLeft size={18} /></button>
                    <div>
                        <h1 className="page-title">🩺 Consultation en cours</h1>
                        <p className="text-sm text-muted">{rdv?.typeConsultation} — {rdv?.motif}</p>
                    </div>
                </div>
                <button onClick={terminerConsultation} disabled={endingConsultation}
                    className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
                    <CheckCircle size={15} /> {endingConsultation ? 'Clôture...' : 'Terminer la consultation'}
                </button>
            </div>

            {/* Bannière patient */}
            {loadingDossier ? (
                <div className="bg-white rounded-2xl border p-4 text-muted text-sm">Chargement du dossier...</div>
            ) : (
                <div className={`rounded-2xl border p-4 flex items-start gap-4 ${patient?.allergies?.length ? 'bg-orange-50 border-orange-200' : 'bg-brand-50 border-brand-100'}`}>
                    <div className="w-10 h-10 rounded-full bg-primary text-white font-bold flex items-center justify-center text-sm flex-shrink-0">
                        {patientNom.charAt(0)}
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-gray-900">{patientNom}</div>
                        <div className="text-xs text-muted mt-0.5">
                            CIN : {patientCin}
                            {patient?.dateNaissance && ` • ${new Date().getFullYear() - new Date(patient.dateNaissance).getFullYear()} ans`}
                            {patient?.bloodType && ` • Groupe ${patient.bloodType}`}
                        </div>
                        {patient?.allergies?.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 text-orange-700 text-xs font-semibold">
                                <AlertTriangle size={12} />
                                ALLERGIE(S) : {patient.allergies.join(', ')}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Onglets */}
            <div className="flex gap-2 border-b border-gray-100">
                {[
                    { id: 'ordonnance', label: '💊 Ordonnance' },
                    { id: 'examens', label: '🧪 Examens Labo/Radio' },
                    { id: 'hospitalisation', label: '🏥 Hospitalisation' },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium transition border-b-2 ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-gray-700'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>



            {/* ── ONGLET ORDONNANCE ──────────────────────────────────────────────── */}
            {activeTab === 'ordonnance' && (
                <div className="space-y-4">
                    {ordonnanceCreee ? (
                        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-4">
                            <div>
                                <div className="flex items-center gap-2 text-green-700 font-bold">
                                    <CheckCircle size={18} /> Ordonnance {ordonnanceCreee.numero} envoyée au pharmacien
                                </div>
                                <div className="text-sm text-green-600 mt-1">Le pharmacien a été notifié en temps réel et peut préparer les médicaments.</div>
                            </div>
                            <button onClick={() => generatePrescriptionPDF(ordonnanceCreee, null, patient, clinicInfo)}

                                className="flex items-center gap-2 px-4 py-2 bg-white border border-green-300 text-green-700 rounded-xl text-sm font-semibold hover:bg-green-100 transition shadow-sm">
                                <Download size={16} /> Générer le document PDF
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Ajout médicament */}
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Pill size={16} className="text-primary" /> Ajouter un médicament</h3>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Médicament *</label>
                                        <input value={medicamentInput} onChange={e => setMedicamentInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addMedicament()}
                                            placeholder="Nom du médicament (ex: Doliprane 1000mg)"
                                            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 ${allergyAlert ? 'border-orange-400 focus:ring-orange-200 bg-orange-50' : 'border-gray-200 focus:ring-primary/20'}`} />
                                        {allergyAlert && (
                                            <div className="flex items-center gap-1.5 mt-1.5 text-orange-600 text-xs font-semibold bg-orange-100 rounded-lg px-3 py-1.5">
                                                <AlertTriangle size={13} />
                                                ⚠️ ALERTE ALLERGIE — Ce patient est allergique à <strong>{allergyAlert}</strong>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-muted block mb-1">Posologie</label>
                                            <select value={posologie} onChange={e => setPosologie(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm">
                                                {['1/2 comprimé', '1 comprimé', '2 comprimés', '1 gélule', '5ml', '10ml'].map(v => <option key={v}>{v}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted block mb-1">Fréquence</label>
                                            <select value={frequence} onChange={e => setFrequence(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm">
                                                {Object.keys(PRISES_PAR_JOUR).map(v => <option key={v}>{v}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted block mb-1">Durée</label>
                                            <select value={duree} onChange={e => setDuree(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm">
                                                {['3 jours', '5 jours', '7 jours', '10 jours', '14 jours', '30 jours', '3 mois', 'Continu'].map(v => <option key={v}>{v}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-medium text-muted block mb-1">Instructions (optionnel)</label>
                                        <input value={instructions} onChange={e => setInstructions(e.target.value)}
                                            placeholder="Ex: Prendre pendant les repas"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20" />
                                    </div>

                                    <button onClick={addMedicament} disabled={!medicamentInput}
                                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition">
                                        <Plus size={14} /> Ajouter ce médicament
                                    </button>
                                </div>
                            </div>

                            {/* Liste médicaments prescrits */}
                            {medicaments.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
                                    <h3 className="font-semibold text-gray-900">Médicaments prescrits ({medicaments.length})</h3>
                                    {medicaments.map((m, i) => {
                                        const stock = stockInfo[m.nom];
                                        return (
                                            <div key={i} className="flex items-start justify-between border border-gray-100 rounded-xl p-3">
                                                <div className="flex-1">
                                                    <div className="font-semibold text-sm text-gray-900">💊 {m.nom}</div>
                                                    <div className="text-xs text-muted mt-0.5">{m.posologie} — {m.frequence} — {m.duree}</div>
                                                    {m.instructions && <div className="text-xs text-muted italic mt-0.5">{m.instructions}</div>}
                                                    {stock !== undefined && (
                                                        <div className={`text-xs font-semibold mt-1 ${stock > 20 ? 'text-green-600' : stock > 5 ? 'text-orange-500' : 'text-red-500'}`}>
                                                            {stock > 20 ? '🟢' : stock > 5 ? '🟡' : '🔴'} Stock : {stock} unités
                                                        </div>
                                                    )}
                                                </div>
                                                <button onClick={() => removeMedicament(i)} className="text-red-400 hover:text-red-600 ml-2"><X size={15} /></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Diagnostic : imprimé sur l'ordonnance, visible du médecin et de la pharmacie */}
                            {medicaments.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                    <label htmlFor="consultation-diagnostic" className="text-sm font-semibold text-gray-800 mb-2 block">Diagnostic</label>
                                    <input id="consultation-diagnostic" value={diagnostique} onChange={e => setDiagnostique(e.target.value)}
                                        placeholder="Ex : Infection respiratoire aiguë"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                                </div>
                            )}

                            {/* Notes pour le pharmacien */}
                            {medicaments.length > 0 && (
                                <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-4">
                                    <label className="text-sm font-semibold text-yellow-800 flex items-center gap-2 mb-2">
                                        <AlertTriangle size={15} /> Notes pour le pharmacien (Optionnel)
                                    </label>
                                    <textarea value={notesPharmacie} onChange={e => setNotesPharmacie(e.target.value)} rows={2}
                                        placeholder="Ex: Patient diabétique, vérifier les interactions..."
                                        className="w-full px-3 py-2 border border-yellow-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 bg-white resize-none" />
                                </div>
                            )}

                            {/* Bouton valider ordonnance */}
                            {medicaments.length > 0 && (
                                <button onClick={submitOrdonnance} disabled={submitting}
                                    className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-primary/20">
                                    {submitting ? <span className="animate-spin">⏳</span> : <ClipboardList size={16} />}
                                    {submitting ? 'Envoi en cours...' : `✅ Valider et envoyer l'ordonnance au pharmacien (${medicaments.length} médicament${medicaments.length > 1 ? 's' : ''})`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── ONGLET EXAMENS ──────────────────────────────────────────────── */}
            {activeTab === 'examens' && (
                <div className="space-y-4">
                    {examensEnvoyes ? (
                        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 text-brand-700 font-bold">
                                <CheckCircle size={18} /> Demande d'examens envoyée au laboratoire/radiologie
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                                <h3 className="font-semibold text-gray-900">Prescrire un examen</h3>
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Examen *</label>
                                        <select
                                            value={selectedExamId}
                                            onChange={e => setSelectedExamId(e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                                        >
                                            <option value="">Sélectionner un examen...</option>
                                            {examensCatalog.map(ex => (
                                                <option key={ex.id} value={ex.id}>
                                                    {ex.type === 'laboratoire' ? '🧪' : '☢️'} {ex.nom} ({ex.categorie})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        disabled={!selectedExamId}
                                        onClick={() => {
                                            const ex = examensCatalog.find(e => e.id.toString() === selectedExamId);
                                            if (ex && !examensPrescrits.find(e => e.id === ex.id)) {
                                                setExamensPrescrits(prev => [...prev, ex]);
                                            }
                                            setSelectedExamId('');
                                        }}
                                        className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                                    >
                                        Ajouter
                                    </button>
                                </div>
                            </div>

                            {examensPrescrits.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
                                    <h3 className="font-semibold text-gray-900">Examens sélectionnés ({examensPrescrits.length})</h3>
                                    {examensPrescrits.map(ex => (
                                        <div key={ex.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl mb-2">
                                            <div>
                                                <div className="font-semibold text-sm">{ex.nom}</div>
                                                <div className="text-xs text-muted">{ex.categorie} — {ex.type}</div>
                                            </div>
                                            <button onClick={() => setExamensPrescrits(prev => prev.filter(e => e.id !== ex.id))} className="text-red-400 hover:text-red-600">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="pt-3">
                                        <label className="text-xs font-medium text-muted block mb-1">Notes ou indications pour le labo/radio (optionnel)</label>
                                        <textarea
                                            value={examNotes}
                                            onChange={e => setExamNotes(e.target.value)}
                                            rows={2}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                    <button
                                        onClick={submitExamens} disabled={submitting}
                                        className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-bold text-sm transition mt-3"
                                    >
                                        {submitting ? 'Envoi...' : `Envoyer la demande (${examensPrescrits.length})`}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Historique des examens */}
                    {examenHistory.length > 0 && (
                        <div className="mt-8 space-y-4">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <ClipboardList size={18} className="text-primary" /> Historique médical (Examens)
                            </h3>
                            <div className="grid gap-3">
                                {examenHistory.map(ex => (
                                    <div key={ex.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-gray-900">{ex.examenDetails?.nom}</div>
                                                <div className="text-xs text-muted">
                                                    Prescrit le {new Date(ex.createdAt).toLocaleDateString()} par Dr. {ex.Medecin?.User?.nom}
                                                </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                                                ${ex.statut === 'termine' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {ex.statut}
                                            </span>
                                        </div>
                                        {ex.resultats && (
                                            <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 italic">
                                                "{ex.resultats}"
                                            </div>
                                        )}
                                        {ex.fichierResultat && (
                                            <button
                                                type="button"
                                                onClick={() => ouvrirFichierProtege(`/examens/${ex.id}/fichier`)}
                                                className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"
                                            >
                                                <FileText size={14} /> Voir le document (Scan/Radio/PDF)
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── ONGLET HOSPITALISATION ────────────────────────────────────────── */}
            {activeTab === 'hospitalisation' && (
                <div className="space-y-4">
                    {hospCreee ? (
                        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 text-brand-700 font-bold">
                                <CheckCircle size={18} /> Demande d'hospitalisation envoyée
                            </div>
                            <div className="text-sm text-brand-600 mt-1">La secrétaire a été notifiée en temps réel et peut affecter un lit et une Nurse.</div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">🏥 Créer une demande d'hospitalisation</h3>
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Diagnostic *</label>
                                    <input 
                                        type="text" 
                                        value={hospDiagnostic} 
                                        onChange={e => setHospDiagnostic(e.target.value)} 
                                        placeholder="Ex: Appendicite aiguë, Insuffisance cardiaque congestive..."
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Motif / Indications (optionnel)</label>
                                    <textarea 
                                        value={hospMotif} 
                                        onChange={e => setHospMotif(e.target.value)} 
                                        placeholder="Ex: Nécessite surveillance ECG continue, perfusion IV d'antibiotiques..."
                                        rows={3}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">État initial</label>
                                    <select 
                                        value={hospEtat} 
                                        onChange={e => setHospEtat(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                                    >
                                        <option value="stable">🟢 Stable</option>
                                        <option value="surveillance">🟡 À Surveiller</option>
                                        <option value="critique">🔴 Critique</option>
                                    </select>
                                </div>

                                <button
                                    onClick={submitHospitalisation}
                                    disabled={submitting}
                                    className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-bold text-sm transition shadow-md flex items-center justify-center gap-2"
                                >
                                    {submitting ? 'Envoi...' : '🏥 Confirmer et envoyer la demande d\'hospitalisation'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
