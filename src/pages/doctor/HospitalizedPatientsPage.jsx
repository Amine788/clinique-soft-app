import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../hooks/useSocket';
import { useAuthStore } from '../../store/authStore';
import {
    Activity, CheckCircle,
    Plus, Trash2,
    ChevronRight, RefreshCw,
    Thermometer, Heart, Wind, Droplets,
    PlusCircle, Pill, TriangleAlert, Siren, FlaskConical, Hourglass, DoorOpen, BedDouble
} from 'lucide-react';

import { useSearchParams } from 'react-router-dom';
import { nomMedicament, posologieMedicament } from '../../utils/posologie';

// ─── Helper états ────────────────────────────────────────────
const etatConfig = {
    stable:       { label: 'Stable',       badge: 'bg-green-100 text-green-800 border border-green-200',  dot: 'bg-green-500' },
    surveillance: { label: 'Surveillance', badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200', dot: 'bg-yellow-500 animate-pulse' },
    critique:     { label: 'Critique',     badge: 'bg-red-100 text-red-800 border border-red-200',         dot: 'bg-red-500 animate-pulse' },
};

export default function DoctorHospitalizedPage() {
    // POST /examens est réservé au rôle doctor côté serveur : l'admin ne voit pas l'onglet Examens
    const canPrescribeExams = useAuthStore(s => s.user?.role) === 'doctor';
    const [searchParams] = useSearchParams();
    const urlTab = searchParams.get('tab');

    const [patients, setPatients] = useState([]);
    const [selectedHosp, setSelectedHosp] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(urlTab || 'resume');

    useEffect(() => {
        if (urlTab) {
            setActiveTab(urlTab);
        }
    }, [urlTab]);

    // Treatment
    const [treatmentList, setTreatmentList] = useState([]);
    const [newMedName, setNewMedName] = useState('');
    const [newMedDose, setNewMedDose] = useState('1 comprimé');
    const [newMedFreq, setNewMedFreq] = useState(3);
    const [newMedMoment] = useState('Après repas');

    // Exam
    const [examCatalog, setExamCatalog] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [examNotes, setExamNotes] = useState('');

    // État patient
    const [changingEtat, setChangingEtat] = useState(false);

    // ── Socket ──────────────────────────────────────────────
    useSocket({
        hosp_alert: (data) => {
            toast.error(`Alerte — ${data.patientNom} : ${data.message}`, { duration: 8000 });
            loadPatients();
            if (selectedHosp?.id === data.id) loadHospDetails(data.id);
        },
        treatment_updated: (data) => {
            if (selectedHosp?.id === data.hospitalisationId) loadHospDetails(data.hospitalisationId);
        },
        hosp_validated: () => { loadPatients(); },
        chambre_status_changed: () => { loadPatients(); },
    });

    useEffect(() => { loadPatients(); loadExamCatalog(); }, []);

    // ── Chargement ──────────────────────────────────────────
    const loadPatients = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/hospitalisations/active');
            setPatients(data);
        } catch {
            toast.error('Impossible de charger les patients hospitalisés');
        } finally {
            setLoading(false);
        }
    };

    const loadExamCatalog = async () => {
        try {
            const { data } = await api.get('/examens/catalog');
            setExamCatalog(data.catalog || data || []);
        } catch {
            setExamCatalog([
                { id: 1, nom: 'Radio Thorax Face', type: 'radiologie', categorie: 'Radiographie' },
                { id: 2, nom: 'Scanner Abdominal', type: 'radiologie', categorie: 'Scanner' },
                { id: 3, nom: 'IRM Cérébrale', type: 'radiologie', categorie: 'IRM' },
                { id: 4, nom: 'ECG de repos', type: 'radiologie', categorie: 'ECG' },
                { id: 5, nom: 'NFS / Hémogramme', type: 'laboratoire', categorie: 'Hématologie' },
                { id: 6, nom: 'Bilan Métabolique', type: 'laboratoire', categorie: 'Biochimie' },
            ]);
        }
    };

    const loadHospDetails = async (id) => {
        try {
            const { data } = await api.get(`/hospitalisations/${id}`);
            setSelectedHosp(data);
            setTreatmentList(data.activePrescription?.medicaments || []);
        } catch {
            toast.error('Erreur de chargement du dossier');
        }
    };

    const selectPatient = (hosp) => {
        setActiveTab('resume');
        loadHospDetails(hosp.id);
    };

    // ── Traitement ──────────────────────────────────────────
    const updateTreatment = async (newItems) => {
        try {
            await api.put(`/hospitalisations/${selectedHosp.id}/treatment`, { medicaments: newItems });
            toast.success('Traitement mis à jour et synchronisé chez la nurse');
            setTreatmentList(newItems);
            loadHospDetails(selectedHosp.id);
        } catch { toast.error('Erreur lors de la mise à jour du traitement'); }
    };

    const addMedication = () => {
        if (!newMedName.trim()) return toast.error('Nom du médicament requis');
        const newMed = {
            id: Date.now(),
            nom: newMedName,
            posologie: newMedDose,
            timesPerDay: newMedFreq,
            moment: newMedMoment
        };
        updateTreatment([...treatmentList, newMed]);
        setNewMedName('');
        setNewMedDose('1 comprimé');
    };

    const removeMedication = (id) => {
        if (!window.confirm('Arrêter ce médicament ?')) return;
        updateTreatment(treatmentList.filter(m => m.id !== id));
    };

    // ── Changer état patient ─────────────────────────────────
    const changeEtat = async (newEtat) => {
        setChangingEtat(true);
        try {
            await api.put(`/hospitalisations/${selectedHosp.id}/treatment`, {
                medicaments: treatmentList,
                etat: newEtat
            });
            toast.success(`État mis à jour : ${newEtat}`);
            loadHospDetails(selectedHosp.id);
            loadPatients();
        } catch { toast.error('Erreur de mise à jour de l\'état'); }
        finally { setChangingEtat(false); }
    };

    // ── Examens ──────────────────────────────────────────────
    const prescribeExam = async () => {
        if (!selectedExamId) return toast.error('Sélectionnez un examen');
        try {
            const exam = examCatalog.find(e => e.id.toString() === selectedExamId);
            await api.post('/examens', {
                patientCin: selectedHosp.Patient?.cinNumero,
                examensIds: [parseInt(selectedExamId)],
                notesObligatoires: examNotes
            });
            toast.success(`Examen prescrit : ${exam?.nom}`);
            setSelectedExamId('');
            setExamNotes('');
        } catch { toast.error("Erreur de prescription d'examen"); }
    };

    // ── Alertes ──────────────────────────────────────────────
    const resolveAlert = async (alertId) => {
        try {
            await api.put(`/hospitalisations/alertes/${alertId}/resolve`);
            toast.success('Alerte résolue');
            loadHospDetails(selectedHosp.id);
            loadPatients();
        } catch { toast.error("Impossible de résoudre l'alerte"); }
    };

    // ── Sortie ──────────────────────────────────────────────
    const handleDischarge = async () => {
        if (!window.confirm(`Confirmer la demande de sortie pour ${selectedHosp.Patient?.prenom} ${selectedHosp.Patient?.nom} ?\n\nLa secrétaire sera notifiée pour finaliser les documents.`)) return;
        try {
            await api.put(`/hospitalisations/${selectedHosp.id}/discharge`);
            toast.success('Demande de sortie envoyée à la secrétaire');
            setSelectedHosp(null);
            loadPatients();
        } catch { toast.error("Erreur d'envoi"); }
    };

    // ─────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden font-sans">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <BedDouble size={22} className="text-primary" aria-hidden="true" /> Patients Hospitalisés
                    </h1>
                    <p className="text-gray-500 text-sm">
                        Supervision médicale et collaboration temps réel · {patients.length} patient{patients.length > 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={loadPatients} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition shadow-sm text-gray-600">
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                {/* ── Liste patients ── */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
                    <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Sous votre responsabilité</span>
                            <span className="ml-2 px-2 py-0.5 bg-brand-50 text-brand-700 font-bold text-xs rounded-full">{patients.length}</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-gray-400 text-sm">Chargement...</div>
                        ) : patients.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <BedDouble size={36} strokeWidth={1.5} className="mx-auto mb-2" aria-hidden="true" />
                                <div className="text-sm font-medium">Aucun patient hospitalisé</div>
                                <div className="text-xs mt-1">Les hospitalisations créées lors des consultations apparaîtront ici</div>
                            </div>
                        ) : (
                            patients.map(p => {
                                const activeAlerts = p.alertes?.length || 0;
                                const isSelected = selectedHosp?.id === p.id;
                                const ec = etatConfig[p.etat] || etatConfig.stable;
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => selectPatient(p)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-primary-dark text-white border-transparent shadow-lg'
                                                : 'bg-white hover:bg-gray-50 border-gray-100'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-sm truncate">
                                                    {p.Patient?.prenom} {p.Patient?.nom}
                                                </h3>
                                                <p className={`text-xs mt-1 ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    Ch. {p.Chambre?.numero || '—'} · {p.lit || '—'}
                                                </p>
                                                {p.diagnostic && (
                                                    <p className={`text-[10px] mt-1 italic ${isSelected ? 'text-gray-400' : 'text-gray-400'}`}>
                                                        {p.diagnostic}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-1.5 mt-2">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${ec.dot}`}></span>
                                                    <span className={`text-[10px] font-bold uppercase ${
                                                        isSelected ? 'text-gray-300' : 'text-gray-600'
                                                    }`}>{ec.label}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {activeAlerts > 0 && (
                                                    <span className="px-2 py-0.5 bg-red-600 text-white font-bold text-xs rounded-full animate-bounce">
                                                        {activeAlerts}
                                                    </span>
                                                )}
                                                <ChevronRight size={16} className={isSelected ? 'text-white' : 'text-gray-400'} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ── Fiche détaillée ── */}
                <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
                    {selectedHosp ? (
                        <>
                            {/* Header fiche */}
                            <div className="p-6 bg-primary-dark text-white rounded-t-2xl">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-lg font-bold">
                                            {selectedHosp.Patient?.prenom} {selectedHosp.Patient?.nom}
                                        </h2>
                                        <p className="text-gray-400 text-xs mt-1">
                                            Ch. {selectedHosp.Chambre?.numero || '—'} · {selectedHosp.lit || '—'} · {selectedHosp.diagnostic || 'Pas de diagnostic'}
                                        </p>
                                        <p className="text-gray-500 text-[10px] mt-0.5">
                                            Nurse : {selectedHosp.nurse ? `${selectedHosp.nurse.prenom} ${selectedHosp.nurse.nom}` : 'Non assignée'}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 items-end">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                            selectedHosp.statut === 'sortie_demandee' ? 'bg-yellow-500 text-white' :
                                            'bg-green-600 text-white'
                                        }`}>
                                            {selectedHosp.statut === 'sortie_demandee' ? 'Sortie demandée' : 'Hospitalisé'}
                                        </span>
                                        {/* Quick état change */}
                                        <div className="flex gap-1">
                                            {['stable', 'surveillance', 'critique'].map(e => (
                                                <button
                                                    key={e}
                                                    onClick={() => changeEtat(e)}
                                                    disabled={changingEtat || selectedHosp.etat === e}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                                                        selectedHosp.etat === e
                                                            ? etatConfig[e]?.badge + ' opacity-100 cursor-default'
                                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 opacity-70'
                                                    }`}
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-gray-100 bg-gray-50/50 px-4 overflow-x-auto">
                                {[
                                    { id: 'resume',    label: 'Résumé' },
                                    { id: 'treatment', label: 'Traitement' },
                                    { id: 'vitals',    label: 'Constantes' },
                                    { id: 'alertes',   label: `Alertes${selectedHosp.alertes?.filter(a => a.statut === 'active').length > 0 ? ` (${selectedHosp.alertes.filter(a => a.statut === 'active').length})` : ''}` },
                                    { id: 'examens',   label: 'Examens' },
                                    { id: 'sortie',    label: 'Sortie' },
                                ].filter(tab => tab.id !== 'examens' || canPrescribeExams).map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                                            activeTab === tab.id
                                                ? 'border-gray-900 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab content */}
                            <div className="flex-1 overflow-y-auto p-6 min-h-0">

                                {/* ── RÉSUMÉ ── */}
                                {activeTab === 'resume' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-gray-50 p-5 rounded-2xl space-y-3">
                                            <h3 className="font-bold text-xs text-gray-700 uppercase tracking-wider">Patient</h3>
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                {[
                                                    { label: 'Dossier', val: selectedHosp.Patient?.numeroDossier },
                                                    { label: 'CIN', val: selectedHosp.Patient?.cinNumero },
                                                    { label: 'Sexe', val: selectedHosp.Patient?.sexe === 'M' ? 'Masculin' : 'Féminin' },
                                                    { label: 'Âge', val: selectedHosp.age ? `${selectedHosp.age} ans` : '—' },
                                                ].map(({ label, val }) => (
                                                    <div key={label}>
                                                        <span className="text-gray-400 block mb-0.5">{label}</span>
                                                        <span className="font-bold text-gray-800">{val || '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 p-5 rounded-2xl space-y-3">
                                            <h3 className="font-bold text-xs text-gray-700 uppercase tracking-wider">Hospitalisation</h3>
                                            <div className="space-y-2.5 text-xs">
                                                <div>
                                                    <span className="text-gray-400 block mb-0.5">Date d'admission</span>
                                                    <span className="font-bold text-gray-800">
                                                        {new Date(selectedHosp.dateAdmission).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 block mb-0.5">Infirmier(ère)</span>
                                                    <span className="font-bold text-gray-800">
                                                        {selectedHosp.nurse ? `${selectedHosp.nurse.prenom} ${selectedHosp.nurse.nom}` : 'Non assigné(e)'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 block mb-0.5">Motif</span>
                                                    <span className="font-semibold text-gray-700 italic">
                                                        "{selectedHosp.motif || 'Non spécifié'}"
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dernières constantes */}
                                        {selectedHosp.vitals && selectedHosp.vitals.length > 0 && (() => {
                                            const last = selectedHosp.vitals[0];
                                            const vitalsDisplay = [
                                                { icon: <Thermometer size={14} />, label: 'Temp', val: last.temperature ? `${last.temperature} °C` : '—', alert: parseFloat(last.temperature) > 38.5 || parseFloat(last.temperature) < 35.5 },
                                                { icon: <Activity size={14} />, label: 'Tension', val: last.tension || '—', alert: false },
                                                { icon: <Wind size={14} />, label: 'SpO₂', val: last.saturation ? `${last.saturation}%` : '—', alert: parseInt(last.saturation) < 94 },
                                                { icon: <Heart size={14} />, label: 'Pouls', val: last.pouls ? `${last.pouls} bpm` : '—', alert: parseInt(last.pouls) > 100 || parseInt(last.pouls) < 50 },
                                                { icon: <Droplets size={14} />, label: 'Glycémie', val: last.glycemie ? `${last.glycemie} g/L` : '—', alert: parseFloat(last.glycemie) > 1.4 || parseFloat(last.glycemie) < 0.7 },
                                            ];
                                            return (
                                                <div className="md:col-span-2 bg-gray-50 p-5 rounded-2xl">
                                                    <h3 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-3">
                                                        Dernières constantes <span className="text-gray-400 font-normal normal-case ml-1">({new Date(last.prisAt).toLocaleString('fr-FR')})</span>
                                                    </h3>
                                                    <div className="grid grid-cols-5 gap-3">
                                                        {vitalsDisplay.map((v, i) => (
                                                            <div key={i} className={`p-3 rounded-xl text-center text-xs ${v.alert ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-100'}`}>
                                                                <div className={`flex justify-center mb-1 ${v.alert ? 'text-red-600' : 'text-gray-500'}`}>{v.icon}</div>
                                                                <span className={`font-bold block ${v.alert ? 'text-red-700' : 'text-gray-800'}`}>{v.val}</span>
                                                                <span className="text-[10px] text-gray-400">{v.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* ── TRAITEMENT ── */}
                                {activeTab === 'treatment' && (
                                    <div className="space-y-6">
                                        {/* Formulaire ajout */}
                                        <div className="bg-gray-50 p-5 rounded-2xl space-y-3">
                                            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                                <PlusCircle size={16} /> Ajouter un médicament
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                <input
                                                    type="text"
                                                    placeholder="Médicament..."
                                                    value={newMedName}
                                                    onChange={e => setNewMedName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && addMedication()}
                                                    className="px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Dosage..."
                                                    value={newMedDose}
                                                    onChange={e => setNewMedDose(e.target.value)}
                                                    className="px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                                                />
                                                <select
                                                    value={newMedFreq}
                                                    onChange={e => setNewMedFreq(parseInt(e.target.value))}
                                                    className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none"
                                                >
                                                    <option value={1}>1×/jour</option>
                                                    <option value={2}>2×/jour</option>
                                                    <option value={3}>3×/jour</option>
                                                    <option value={4}>4×/jour</option>
                                                </select>
                                                <button
                                                    onClick={addMedication}
                                                    className="bg-primary text-white font-bold text-xs py-2 px-4 rounded-lg hover:bg-primary-hover flex items-center justify-center gap-1"
                                                >
                                                    <Plus size={14} /> Ajouter
                                                </button>
                                            </div>
                                        </div>

                                        {/* Liste traitements */}
                                        <div className="space-y-2">
                                            <h3 className="font-bold text-sm text-gray-800">
                                                Traitement en cours
                                                <span className="ml-2 text-gray-400 font-normal text-xs">
                                                    (synchronisé en temps réel chez l'infirmier(ère))
                                                </span>
                                            </h3>
                                            {treatmentList.length === 0 ? (
                                                <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded-xl">
                                                    Aucun traitement actif — ajoutez un médicament ci-dessus
                                                </p>
                                            ) : (
                                                <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
                                                    {treatmentList.map((m, idx) => (
                                                        <div key={m.id || idx} className="flex justify-between items-center p-4 text-xs hover:bg-gray-50 transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center text-primary">
                                                                    <Pill size={14} aria-hidden="true" />
                                                                </div>
                                                                <div>
                                                                    <span className="font-bold text-gray-900 block">{nomMedicament(m)}</span>
                                                                    <span className="text-gray-500">
                                                                        {posologieMedicament(m)} · {m.timesPerDay}×/jour · {m.moment}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => removeMedication(m.id)}
                                                                className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition"
                                                                title="Arrêter ce médicament"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── CONSTANTES ── */}
                                {activeTab === 'vitals' && (
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-sm text-gray-800">
                                            Historique des constantes vitales
                                            <span className="ml-2 text-xs font-normal text-gray-400">(saisies par l'infirmier(ère))</span>
                                        </h3>
                                        {!selectedHosp.vitals || selectedHosp.vitals.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded-xl">
                                                Aucune constante enregistrée — l'infirmier(ère) doit saisir les premières mesures
                                            </p>
                                        ) : (
                                            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-gray-50 text-gray-400 border-b border-gray-100">
                                                            <th className="p-3">Date/Heure</th>
                                                            <th className="p-3">Temp</th>
                                                            <th className="p-3">Tension</th>
                                                            <th className="p-3">SpO₂</th>
                                                            <th className="p-3">Pouls</th>
                                                            <th className="p-3">Glycémie</th>
                                                            <th className="p-3">Pris par</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {selectedHosp.vitals.map(v => {
                                                            const tempAlert = parseFloat(v.temperature) > 38.5 || parseFloat(v.temperature) < 35.5;
                                                            const sat = parseInt(v.saturation);
                                                            const satAlert = !isNaN(sat) && sat < 94;
                                                            return (
                                                                <tr key={v.id} className="hover:bg-gray-50/50">
                                                                    <td className="p-3 font-semibold">{new Date(v.prisAt).toLocaleString('fr-FR')}</td>
                                                                    <td className={`p-3 font-bold ${tempAlert ? 'text-red-600' : ''}`}>{v.temperature || '—'} °C</td>
                                                                    <td className="p-3 font-bold text-brand-700">{v.tension || '—'}</td>
                                                                    <td className={`p-3 font-bold ${satAlert ? 'text-red-600' : 'text-green-700'}`}>{v.saturation || '—'} %</td>
                                                                    <td className="p-3 font-bold">{v.pouls || '—'}</td>
                                                                    <td className="p-3 font-bold">{v.glycemie || '—'}</td>
                                                                    <td className="p-3 text-gray-500">
                                                                        {v.nurseActorVitals ? `${v.nurseActorVitals.prenom} ${v.nurseActorVitals.nom}` : 'Nurse'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── ALERTES ── */}
                                {activeTab === 'alertes' && (
                                    <div className="space-y-5">
                                        {/* Alertes actives */}
                                        <div>
                                            <h3 className="font-bold text-sm text-gray-800 mb-3">Alertes actives</h3>
                                            {selectedHosp.alertes?.filter(a => a.statut === 'active').length === 0 ? (
                                                <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs flex items-center gap-2">
                                                    <CheckCircle size={16} /> Aucune alerte active.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {selectedHosp.alertes.filter(a => a.statut === 'active').map(a => (
                                                        <div key={a.id} className={`p-4 rounded-xl border flex justify-between items-start text-xs ${
                                                            a.urgency === 'critique' ? 'bg-red-50 border-red-300' :
                                                            a.urgency === 'urgent' ? 'bg-orange-50 border-orange-200' :
                                                            'bg-yellow-50 border-yellow-200'
                                                        }`}>
                                                            <div>
                                                                <span className={`font-bold uppercase tracking-wider block mb-1 ${
                                                                    a.urgency === 'critique' ? 'text-red-900' : 'text-orange-900'
                                                                }`}>
                                                                    {a.urgency === 'critique'
                                                                        ? <Siren size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                                                                        : <TriangleAlert size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />}
                                                                    {a.typeAlerte} — {a.urgency}
                                                                </span>
                                                                <span className="text-gray-700">{a.description}</span>
                                                                <span className="text-gray-400 block mt-1 text-[10px]">
                                                                    {new Date(a.creeAt).toLocaleString('fr-FR')}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() => resolveAlert(a.id)}
                                                                className="bg-primary hover:bg-primary-hover text-white font-bold px-3 py-1.5 rounded-lg text-[10px] ml-4 shrink-0 transition"
                                                            >
                                                                Résoudre
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {/* Alertes résolues */}
                                        {selectedHosp.alertes?.filter(a => a.statut === 'resolue').length > 0 && (
                                            <div>
                                                <h3 className="font-bold text-sm text-gray-800 mb-3">Alertes résolues</h3>
                                                <div className="space-y-2">
                                                    {selectedHosp.alertes.filter(a => a.statut === 'resolue').map(a => (
                                                        <div key={a.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-500 flex justify-between items-center">
                                                            <div>
                                                                <span className="font-semibold block">{a.typeAlerte} · {a.description}</span>
                                                                {a.resoluAt && (
                                                                    <span className="text-[10px]">
                                                                        Résolue le {new Date(a.resoluAt).toLocaleString('fr-FR')}
                                                                        {a.resolvingDoctor ? ` par Dr. ${a.resolvingDoctor.nom}` : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-green-600 font-bold">Résolue</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── EXAMENS ── */}
                                {activeTab === 'examens' && canPrescribeExams && (
                                    <div className="space-y-4">
                                        <div className="bg-gray-50 p-5 rounded-2xl space-y-4">
                                            <h3 className="font-bold text-sm text-gray-800">Prescrire un examen</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Type d'examen *</label>
                                                    <select
                                                        value={selectedExamId}
                                                        onChange={e => setSelectedExamId(e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none"
                                                    >
                                                        <option value="">Sélectionner un examen...</option>
                                                        {examCatalog.map(e => (
                                                            <option key={e.id} value={e.id}>
                                                                {e.type === 'laboratoire' ? 'Labo' : 'Radio'} — {e.nom}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Indications cliniques</label>
                                                    <textarea
                                                        value={examNotes}
                                                        onChange={e => setExamNotes(e.target.value)}
                                                        placeholder="Notes pour le laboratoire ou la radiologie..."
                                                        rows={2}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none resize-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={prescribeExam}
                                                    className="bg-primary hover:bg-primary-hover text-white text-xs font-bold py-2.5 px-4 rounded-xl transition"
                                                >
                                                    <FlaskConical size={14} className="inline -mt-0.5 mr-1.5" aria-hidden="true" />Envoyer la prescription
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── SORTIE ── */}
                                {activeTab === 'sortie' && (
                                    <div className="max-w-md mx-auto">
                                        {selectedHosp.statut === 'sortie_demandee' ? (
                                            <div className="p-6 border border-yellow-200 bg-yellow-50 rounded-2xl text-center space-y-3">
                                                <Hourglass size={28} strokeWidth={1.75} className="mx-auto text-yellow-700" aria-hidden="true" />
                                                <h3 className="font-bold text-sm text-yellow-800">Sortie en cours de traitement</h3>
                                                <p className="text-xs text-yellow-700">
                                                    La secrétaire finalise les documents administratifs et la facturation du séjour.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="p-6 border border-orange-100 bg-orange-50/50 rounded-2xl text-center space-y-4">
                                                <DoorOpen size={28} strokeWidth={1.75} className="mx-auto text-orange-700" aria-hidden="true" />
                                                <h3 className="font-bold text-sm text-orange-800">Demande de Sortie Médicale</h3>
                                                <p className="text-xs text-orange-700 leading-relaxed">
                                                    En validant la sortie, la secrétaire recevra une notification pour finaliser les documents et la facturation. La chambre passera ensuite en nettoyage.
                                                </p>
                                                <button
                                                    onClick={handleDischarge}
                                                    className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition"
                                                >
                                                    Valider et autoriser la sortie du patient
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-gray-400 py-20">
                            <BedDouble size={44} strokeWidth={1.5} className="mb-3" aria-hidden="true" />
                            <p className="text-sm font-semibold">Sélectionnez un patient</p>
                            <p className="text-xs mt-1">pour voir son dossier clinique complet</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
