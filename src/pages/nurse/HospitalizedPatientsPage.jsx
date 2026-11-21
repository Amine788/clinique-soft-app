import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { nomMedicament, posologieMedicament } from '../../utils/posologie';
import { useSocket } from '../../hooks/useSocket';
import {
    Check, Clock, RefreshCw, ChevronRight, Bell, Syringe, UserRound, Pill, Stethoscope, TriangleAlert, Siren,
    Thermometer, Activity, Wind, Droplet, HeartPulse, Frown, CircleAlert, ArrowDown, Ban, Droplets
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────
const alertTypeIcons = {
    douleur: Frown, temperature: Thermometer, tension: Activity,
    saturation: Wind, malaise: CircleAlert, chute: ArrowDown,
    refus_traitement: Ban, perfusion: Droplets, urgence: Siren,
    pouls: HeartPulse, glycemie: Droplet
};

// ─────────────────────────────────────────────────────────────
export default function NurseHospitalizedPage() {
    const [patients, setPatients] = useState([]);
    const [selectedHosp, setSelectedHosp] = useState(null);
    const [loading, setLoading] = useState(true);

    // Constantes
    const [temp, setTemp] = useState('');
    const [tension, setTension] = useState('');
    const [sat, setSat] = useState('');
    const [glyc, setGlyc] = useState('');
    const [pouls, setPouls] = useState('');
    const [resp, setResp] = useState('');
    const [poids, setPoids] = useState('');
    const [submittingVitals, setSubmittingVitals] = useState(false);

    // Alertes
    const [alertType, setAlertType] = useState('douleur');
    const [alertDesc, setAlertDesc] = useState('');
    const [alertUrgency, setAlertUrgency] = useState('urgent');
    const [submittingAlert, setSubmittingAlert] = useState(false);

    // ── Socket ──────────────────────────────────────────────
    useSocket({
        hosp_alert: (data) => {
            if (selectedHosp?.id === data.id) loadHospDetails(data.id);
        },
        treatment_updated: (data) => {
            toast('Traitement mis à jour par le médecin', { duration: 5000 });
            loadPatients();
            if (selectedHosp?.id === data.hospitalisationId) loadHospDetails(data.hospitalisationId);
        },
        meds_delivered: () => { loadPatients(); if (selectedHosp) loadHospDetails(selectedHosp.id); },
        hosp_validated: () => { loadPatients(); }
    });

    useEffect(() => { loadPatients(); }, []);

    // ── Chargement ──────────────────────────────────────────
    const loadPatients = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/hospitalisations/active');
            setPatients(data);
        } catch {
            toast.error('Erreur de chargement des patients');
        } finally {
            setLoading(false);
        }
    };

    const loadHospDetails = async (id) => {
        try {
            const { data } = await api.get(`/hospitalisations/${id}`);
            setSelectedHosp(data);
        } catch {
            toast.error('Erreur lors du chargement du dossier');
        }
    };

    const selectPatient = (hosp) => loadHospDetails(hosp.id);

    // ── Constantes ──────────────────────────────────────────
    const submitVitals = async (e) => {
        e.preventDefault();
        setSubmittingVitals(true);
        try {
            const { data } = await api.post(`/hospitalisations/${selectedHosp.id}/vitals`, {
                temperature: temp, tension, saturation: sat,
                glycemie: glyc, pouls, respiration: resp, poids
            });
            toast.success('Constantes enregistrées');
            if (data.alertsGenerated > 0) {
                toast.error(`${data.alertsGenerated} alerte(s) envoyée(s) au médecin`, { duration: 6000 });
            }
            setTemp(''); setTension(''); setSat(''); setGlyc(''); setPouls(''); setResp(''); setPoids('');
            loadHospDetails(selectedHosp.id);
        } catch { toast.error('Erreur de sauvegarde'); }
        finally { setSubmittingVitals(false); }
    };

    // ── Alertes ──────────────────────────────────────────────
    const submitAlert = async () => {
        if (!alertDesc.trim()) return toast.error("Description de l'alerte requise");
        setSubmittingAlert(true);
        try {
            await api.post(`/hospitalisations/${selectedHosp.id}/alerts`, {
                typeAlerte: alertType, description: alertDesc, urgency: alertUrgency
            });
            toast.success('Alerte envoyée au médecin en temps réel');
            setAlertDesc('');
            loadHospDetails(selectedHosp.id);
        } catch { toast.error("Échec de l'envoi de l'alerte"); }
        finally { setSubmittingAlert(false); }
    };

    // ── Administration médicaments ───────────────────────────
    const handleMedAction = async (prescriptionId, itemId, slotIndex) => {
        try {
            await api.post(`/nurse/prescriptions/${prescriptionId}/administer`, {
                itemId, slotIndex, done: true
            });
            toast.success('Médicament administré');
            loadHospDetails(selectedHosp.id);
            loadPatients();
        } catch { toast.error("Erreur lors de l'administration"); }
    };

    const activeAlertsCount = selectedHosp?.alertes?.filter(a => a.statut === 'active').length || 0;

    // ─────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden font-sans">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <Syringe size={22} className="text-primary" aria-hidden="true" /> Mes Patients Hospitalisés
                    </h1>
                    <p className="text-gray-500 text-sm">
                        Médicaments, constantes et alertes médecin · {patients.length} patient{patients.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={loadPatients} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition shadow-sm text-gray-600">
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">

                {/* ── Liste patients ── */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
                    <div className="p-5 border-b border-gray-100">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Patients sous votre garde</span>
                        <span className="ml-2 px-2 py-0.5 bg-brand-50 text-brand-700 font-bold text-xs rounded-full">{patients.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-gray-400 text-sm">Chargement...</div>
                        ) : patients.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <UserRound size={36} strokeWidth={1.5} className="mx-auto mb-2" aria-hidden="true" />
                                <div className="text-sm font-medium">Aucun patient assigné</div>
                                <div className="text-xs mt-1 text-gray-300">La secrétaire vous assignera des patients</div>
                            </div>
                        ) : (
                            patients.map(p => {
                                const isSelected = selectedHosp?.id === p.id;
                                const activeAlerts = p.alertes?.length || 0;
                                const nextMed = p.activePrescription?.slots?.find(s => !s.done);
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
                                                <p className={`text-[10px] mt-1 font-semibold ${isSelected ? 'text-gray-300' : 'text-brand-600'}`}>
                                                    Dr. {p.Medecin?.User?.prenom} {p.Medecin?.User?.nom}
                                                </p>
                                                {nextMed && (
                                                    <p className={`text-[10px] mt-1 flex items-center gap-0.5 ${isSelected ? 'text-gray-400' : 'text-orange-600'}`}>
                                                        <Clock size={9} /> Prochain médicament : {nextMed.time}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {activeAlerts > 0 && (
                                                    <span className="px-1.5 py-0.5 bg-red-600 text-white font-bold text-[10px] rounded-full animate-bounce">
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

                {/* ── Fiche nurse — vue unique, tout lié sur un même écran ── */}
                <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
                    {selectedHosp ? (
                        <>
                            {/* Header fiche */}
                            <div className="p-6 bg-primary-dark text-white rounded-t-2xl shrink-0">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-lg font-bold">
                                            {selectedHosp.Patient?.prenom} {selectedHosp.Patient?.nom}
                                        </h2>
                                        <p className="text-gray-400 text-xs mt-1">
                                            Ch. {selectedHosp.Chambre?.numero || '—'} · {selectedHosp.lit || '—'} · {selectedHosp.diagnostic || '—'}
                                        </p>
                                        <p className="text-gray-500 text-[10px] mt-0.5">
                                            Médecin : Dr. {selectedHosp.Medecin?.User?.prenom} {selectedHosp.Medecin?.User?.nom}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                            selectedHosp.etat === 'critique' ? 'bg-red-500 text-white animate-pulse' :
                                            selectedHosp.etat === 'surveillance' ? 'bg-yellow-500 text-white' :
                                            'bg-green-600 text-white'
                                        }`}>
                                            {selectedHosp.etat}
                                        </span>
                                        {activeAlertsCount > 0 && (
                                            <span className="px-2 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-bold animate-pulse">
                                                {activeAlertsCount} alerte(s) active(s)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Contenu — sections liées, pas d'onglets */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">

                                {/* ── MÉDICAMENTS ── */}
                                <section className="space-y-3">
                                    <h3 className="font-bold text-sm text-gray-800">
                                        <Pill size={15} className="inline -mt-0.5 mr-1.5 text-primary" aria-hidden="true" />Médicaments à administrer
                                        <span className="ml-2 text-xs font-normal text-gray-400">(remis par la pharmacie, prescrits par le médecin)</span>
                                    </h3>
                                    {!selectedHosp.activePrescription ? (
                                        <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded-xl">
                                            Aucun médicament prescrit — le médecin n'a pas encore défini le traitement.
                                        </p>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedHosp.activePrescription.medicaments?.map((item, idx) => {
                                                const slots = (selectedHosp.activePrescription.slots || []).filter(s => s.itemId === item.id);
                                                return (
                                                    <div key={item.id || idx} className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50 space-y-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className="size-8 shrink-0 rounded-lg bg-primary-light text-primary flex items-center justify-center"><Pill size={16} aria-hidden="true" /></span>
                                                            <div>
                                                                <span className="font-bold text-xs text-gray-900 block">{nomMedicament(item)}</span>
                                                                <span className="text-[10px] text-gray-500">
                                                                    {posologieMedicament(item)} · {item.moment} · {item.timesPerDay}×/jour
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {slots.length === 0 && (
                                                                <p className="text-[10px] text-gray-400 italic">Aucun créneau généré — en attente de remise pharmacie</p>
                                                            )}
                                                            {slots.map((slot, sIdx) => {
                                                                const slotIndexInFullList = selectedHosp.activePrescription.slots.findIndex(
                                                                    s => s.itemId === item.id && s.time === slot.time
                                                                );
                                                                return (
                                                                    <div key={sIdx} className={`p-3 border rounded-xl flex items-center gap-2 text-xs transition-all ${
                                                                        slot.done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                                                                    }`}>
                                                                        <div>
                                                                            <span className="font-bold block">{slot.label}</span>
                                                                            <span className="text-[10px] text-gray-400">{slot.time}</span>
                                                                        </div>
                                                                        {!slot.done ? (
                                                                            <button
                                                                                onClick={() => handleMedAction(selectedHosp.activePrescription.id, item.id, slotIndexInFullList)}
                                                                                className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition ml-1"
                                                                                title="Administrer"
                                                                            >
                                                                                <Check size={11} />
                                                                            </button>
                                                                        ) : (
                                                                            <Check size={13} className="ml-1 text-green-700" aria-label="Administré" />
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <hr className="border-gray-100" />

                                {/* ── CONSTANTES ── */}
                                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <form onSubmit={submitVitals} className="space-y-4">
                                        <h3 className="font-bold text-sm text-gray-800"><Stethoscope size={15} className="inline -mt-0.5 mr-1.5 text-primary" aria-hidden="true" />Saisir des constantes</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { label: 'Température (°C)', val: temp, set: setTemp, ph: '37.2', icon: Thermometer },
                                                { label: 'Tension (mmHg)', val: tension, set: setTension, ph: '120/80', icon: Activity },
                                                { label: 'Saturation O₂ (%)', val: sat, set: setSat, ph: '98', icon: Wind },
                                                { label: 'Glycémie (g/L)', val: glyc, set: setGlyc, ph: '0.95', icon: Droplet },
                                                { label: 'Pouls (bpm)', val: pouls, set: setPouls, ph: '72', icon: HeartPulse },
                                                { label: 'Respiration (c/min)', val: resp, set: setResp, ph: '16', icon: Wind },
                                            ].map(({ label, val, set, ph, icon }) => (
                                                <div key={label}>
                                                    <label className="text-[10px] font-semibold text-gray-400 block mb-1">
                                                        {React.createElement(icon, { size: 11, className: "inline -mt-0.5 mr-1", "aria-hidden": true })}{label}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={val}
                                                        onChange={e => set(e.target.value)}
                                                        placeholder={ph}
                                                        className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-[10px] text-yellow-800">
                                            <TriangleAlert size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />Les valeurs anormales déclencheront automatiquement une alerte au médecin.
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={submittingVitals}
                                            className="w-full py-2.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-hover transition disabled:opacity-60"
                                        >
                                            {submittingVitals ? 'Enregistrement...' : 'Enregistrer les constantes'}
                                        </button>
                                    </form>

                                    <div className="space-y-3">
                                        <h3 className="font-bold text-sm text-gray-800">Prises récentes</h3>
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                            {(!selectedHosp.vitals || selectedHosp.vitals.length === 0) && (
                                                <p className="text-xs text-gray-400 italic">Aucune constante encore saisie</p>
                                            )}
                                            {selectedHosp.vitals?.slice(0, 8).map(v => (
                                                <div key={v.id} className="p-3 border border-gray-100 rounded-xl text-xs bg-gray-50/50">
                                                    <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                                                        <span>{new Date(v.prisAt).toLocaleString('fr-FR')}</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 font-semibold text-gray-700">
                                                        <span className="inline-flex items-center gap-1"><Thermometer size={12} className="text-gray-400" aria-hidden="true" />{v.temperature || '—'}°C</span>
                                                        <span className="inline-flex items-center gap-1"><Activity size={12} className="text-gray-400" aria-hidden="true" />{v.tension || '—'}</span>
                                                        <span className="inline-flex items-center gap-1"><Wind size={12} className="text-gray-400" aria-hidden="true" />{v.saturation || '—'}%</span>
                                                        <span className="inline-flex items-center gap-1"><HeartPulse size={12} className="text-gray-400" aria-hidden="true" />{v.pouls || '—'} bpm</span>
                                                        <span className="inline-flex items-center gap-1"><Droplet size={12} className="text-gray-400" aria-hidden="true" />{v.glycemie || '—'} g/L</span>
                                                        <span className="inline-flex items-center gap-1"><Wind size={12} className="text-gray-400" aria-hidden="true" />{v.respiration || '—'} c/min</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                                <hr className="border-gray-100" />

                                {/* ── ALERTES ── */}
                                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                            <Bell size={14} className="text-red-600" />
                                            Alerter le médecin
                                        </h3>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs font-semibold text-gray-400 block mb-1">Type de situation</label>
                                                <select
                                                    value={alertType}
                                                    onChange={e => setAlertType(e.target.value)}
                                                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none"
                                                >
                                                    <option value="douleur">Douleur importante</option>
                                                    <option value="temperature">Fièvre / Hypothermie</option>
                                                    <option value="malaise">Malaise</option>
                                                    <option value="chute">Chute</option>
                                                    <option value="refus_traitement">Refus traitement</option>
                                                    <option value="perfusion">Perfusion terminée</option>
                                                    <option value="urgence">Urgence critique</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-400 block mb-1">Niveau d'urgence</label>
                                                <select
                                                    value={alertUrgency}
                                                    onChange={e => setAlertUrgency(e.target.value)}
                                                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none"
                                                >
                                                    <option value="normal">Normal</option>
                                                    <option value="urgent">Urgent</option>
                                                    <option value="critique">Critique</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-400 block mb-1">Observation *</label>
                                                <textarea
                                                    value={alertDesc}
                                                    onChange={e => setAlertDesc(e.target.value)}
                                                    placeholder="Décrivez succinctement la situation..."
                                                    rows={2}
                                                    className="w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={submitAlert}
                                                disabled={submittingAlert}
                                                className="w-full py-2.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
                                            >
                                                {submittingAlert ? 'Envoi...' : <><Siren size={14} aria-hidden="true" /> Déclencher l'alerte</>}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="font-bold text-sm text-gray-800">Suivi des alertes</h3>
                                        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                                            {(!selectedHosp.alertes || selectedHosp.alertes.length === 0) && (
                                                <p className="text-xs text-gray-400 italic">Aucune alerte</p>
                                            )}
                                            {selectedHosp.alertes?.map(a => (
                                                <div key={a.id} className={`p-3 border rounded-xl text-xs flex justify-between items-start transition ${
                                                    a.statut === 'active' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'
                                                }`}>
                                                    <div>
                                                        <span className={`font-bold uppercase tracking-wider block mb-0.5 ${
                                                            a.statut === 'active' ? 'text-red-800' : 'text-gray-500'
                                                        }`}>
                                                            {(() => { const AlertIcon = alertTypeIcons[a.typeAlerte] || TriangleAlert; return <AlertIcon size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />; })()}{a.typeAlerte}
                                                        </span>
                                                        <span className={a.statut === 'active' ? 'text-red-700' : 'text-gray-500'}>
                                                            {a.description}
                                                        </span>
                                                    </div>
                                                    <span className={`font-bold text-[10px] shrink-0 ml-2 ${a.statut === 'active' ? 'text-red-600' : 'text-green-600'}`}>
                                                        {a.statut === 'active' ? 'Active' : 'Résolue'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-gray-400 py-20">
                            <UserRound size={44} strokeWidth={1.5} className="mb-3" aria-hidden="true" />
                            <p className="text-sm font-semibold">Sélectionnez un patient</p>
                            <p className="text-xs mt-1">pour voir médicaments, constantes et alertes</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
