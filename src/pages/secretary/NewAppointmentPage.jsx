import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import {
    CreditCard, User, Calendar, Stethoscope, Bed, CheckCircle,
    ChevronRight, ChevronLeft, Search, Clock, AlertTriangle, Pill
} from 'lucide-react';

const STEPS = [
    { n: 1, label: 'Patient', icon: CreditCard },
    { n: 2, label: 'Médecin', icon: Stethoscope },
    { n: 3, label: 'Motif & Créneau', icon: Calendar },
    { n: 4, label: 'Chambre', icon: Bed },
    { n: 5, label: 'Confirmation', icon: CheckCircle },
];

const TYPES_CONSULTATION = [
    { label: 'Première consultation', value: 'premiere', prix: 300 },
    { label: 'Suivi',                 value: 'suivi',    prix: 100 },
    { label: 'Consultation urgente',  value: 'urgente',  prix: 200 },
    { label: 'Pré-opératoire',        value: 'preoperation', prix: 0 }, // chambre × jours
];

// Calcul du prix de la consultation selon le type
function getPrixConsultation(typeValue, room, dateAdmission, dateSortie) {
    if (typeValue === 'preoperation' && room?.price && dateAdmission && dateSortie) {
        const jours = Math.max(1, Math.ceil((new Date(dateSortie) - new Date(dateAdmission)) / 86400000));
        return room.price * jours;
    }
    const t = TYPES_CONSULTATION.find(t => t.value === typeValue);
    return t ? t.prix : 300;
}

const HORAIRES = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
];

export default function NewAppointmentPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Données patient
    const [cinInput, setCinInput] = useState('');
    const [patient, setPatient] = useState(null);
    const [cinStatus, setCinStatus] = useState(null);

    // Données médecin
    const [doctors, setDoctors] = useState([]);
    const [specialite, setSpecialite] = useState('');
    const [selectedDoctor, setSelectedDoctor] = useState(null);

    // Créneau
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedHeure, setSelectedHeure] = useState('');
    const [slotsOccupes, setSlotsOccupes] = useState([]);

    // Détails
    const [typeConsultation, setTypeConsultation] = useState('premiere');

    // Hospitalisation
    const [hospitalisation, setHospitalisation] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [dateAdmission, setDateAdmission] = useState(new Date().toISOString().split('T')[0]);
    const [dateSortie, setDateSortie] = useState('');

    // ── Charger médecins ───────────────────────────────────────────────────────
    useEffect(() => {
        api.get('/doctors').then(r => setDoctors(r.data)).catch(() => { });
    }, []);

    useEffect(() => {
        if (hospitalisation) {
            api.get('/rooms').then(r => setRooms(r.data.filter(c => c.status === 'available'))).catch(() => { });
        }
    }, [hospitalisation]);

    // ── Charger créneaux occupés ───────────────────────────────────────────────
    useEffect(() => {
        if (selectedDoctor && selectedDate) {
            api.get(`/appointments?doctorId=${selectedDoctor.id}&date=${selectedDate}`)
                .then(r => {
                    // Heure renvoyée par le back (« HH:MM ») ; mêmes statuts ignorés que le contrôle de conflit (409)
                    const heures = (r.data || [])
                        .filter(a => !['annule', 'non_presente'].includes(a.status))
                        .map(a => a.time)
                        .filter(Boolean);
                    setSlotsOccupes(heures);
                }).catch(() => setSlotsOccupes([]));
        }
    }, [selectedDoctor, selectedDate]);

    // ── Recherche CIN ──────────────────────────────────────────────────────────
    const searchByCin = async () => {
        if (!cinInput.trim()) return;
        setCinStatus('checking');
        try {
            const { data } = await api.get(`/patients/check-cin/${cinInput.toUpperCase()}`);
            // Format refusé par le back : 200 avec valid: false
            if (data.valid === false) {
                setCinStatus('invalid');
                setPatient(null);
            } else if (data.exists) {
                setPatient(data.patient);
                setCinStatus('found');
            } else {
                setCinStatus('not_found');
                setPatient(null);
            }
        } catch {
            setCinStatus('error');
        }
    };

    // ── Confirmation finale ────────────────────────────────────────────────────
    const handleConfirm = async () => {
        setLoading(true);
        try {
            const payload = {
                patientCin: patient.cin?.numero || cinInput.toUpperCase(),
                doctorId: selectedDoctor.id,
                date: selectedDate,
                heure: selectedHeure,
                typeConsultation,
                mode: 'presentiel',
                motif: TYPES_CONSULTATION.find(t => t.value === typeConsultation)?.label || typeConsultation,
                // Hospitalisation : le back crée une demande d'admission (chambre proposée, occupée à l'admission)
                hospitalisation,
                chambreId: hospitalisation ? selectedRoom?.id || null : null,
                dateAdmission: hospitalisation ? dateAdmission : null,
                dateSortieEstimee: hospitalisation ? dateSortie || null : null,
            };
            const { data } = await api.post('/appointments', payload);
            toast.success(`RDV confirmé — ${selectedDate} à ${selectedHeure}`);
            if (data.hospitalisationId) toast.success("Demande d'hospitalisation transmise aux admissions");
            navigate('/appointments');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la création du RDV');
        } finally {
            setLoading(false);
        }
    };

    const specialites = [...new Set(doctors.map(d => d.speciality).filter(Boolean))];
    const doctorsFiltered = specialite ? doctors.filter(d => d.speciality === specialite) : doctors;
    const today = new Date().toISOString().split('T')[0];

    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title">Nouveau Rendez-vous</h1>
                    <p className="text-sm text-muted mt-0.5">Identification CIN obligatoire avant réservation</p>
                </div>
                <button onClick={() => navigate('/appointments')} className="text-sm text-muted hover:text-gray-700">← Retour</button>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-1">
                {STEPS.map(({ n, label }, i) => (
                    <React.Fragment key={n}>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${step === n ? 'bg-primary text-white shadow-md shadow-primary/25' :
                                step > n ? 'bg-success text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                {step > n ? <CheckCircle size={13} /> : n}
                            </div>
                            <span className={`text-xs font-medium hidden sm:block ${step >= n ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
                        </div>
                        {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded mx-1 ${step > n ? 'bg-success' : 'bg-gray-200'}`} />}
                    </React.Fragment>
                ))}
            </div>

            {/* ─── ÉTAPE 1 : Patient par CIN ─────────────────────────────────────── */}
            {step === 1 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <CreditCard size={20} className="text-primary" /> Identifier le patient par CIN
                    </h2>

                    <div className="flex gap-3">
                        <input
                            value={cinInput} onChange={e => { setCinInput(e.target.value.toUpperCase()); setCinStatus(null); }}
                            onKeyDown={e => e.key === 'Enter' && searchByCin()}
                            placeholder="Ex: A123456 ou BK789012"
                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary uppercase font-mono"
                        />
                        <button onClick={searchByCin} disabled={cinStatus === 'checking'}
                            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition flex items-center gap-2">
                            <Search size={15} /> {cinStatus === 'checking' ? '...' : 'Rechercher'}
                        </button>
                    </div>

                    {/* Résultat recherche */}
                    {cinStatus === 'found' && patient && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                                <CheckCircle size={16} /> Patient trouvé
                            </div>
                            <div className="text-sm text-gray-700 font-bold">{patient.prenom} {patient.nom}</div>
                            <div className="text-xs text-muted">Dossier : {patient.id} • Né le : {patient.dateNaissance}</div>
                            {patient.allergies?.length > 0 && (
                                <div className="flex items-center gap-1 text-orange-600 text-xs font-semibold">
                                    <AlertTriangle size={13} /> Allergie(s) : {patient.allergies.join(', ')}
                                </div>
                            )}
                            {patient.insurance && <div className="text-xs text-muted">Assurance : {patient.insurance}</div>}
                        </div>
                    )}

                    {cinStatus === 'invalid' && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-sm text-red-700 font-medium">Format de CIN invalide (ex. : AB123456).</p>
                        </div>
                    )}

                    {cinStatus === 'not_found' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-sm text-amber-800 font-medium mb-3">Patient introuvable avec ce CIN.</p>
                            <button onClick={() => navigate(`/patients/create?cin=${cinInput}`)}
                                className="text-sm text-primary font-semibold underline">
                                + Créer un nouveau dossier patient
                            </button>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button onClick={() => setStep(2)} disabled={!patient}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition">
                            Continuer <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── ÉTAPE 2 : Sélection médecin ──────────────────────────────────── */}
            {step === 2 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Stethoscope size={20} className="text-primary" /> Choisir un médecin
                    </h2>

                    {/* Filtre spécialité */}
                    {specialites.length > 0 && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Spécialité</label>
                            <select value={specialite} onChange={e => setSpecialite(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20">
                                <option value="">Toutes les spécialités</option>
                                {specialites.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Liste médecins */}
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {doctorsFiltered.map(doc => (
                            <div key={doc.id}
                                onClick={() => setSelectedDoctor(doc)}
                                className={`border rounded-xl p-4 cursor-pointer transition hover:bg-gray-50 ${selectedDoctor?.id === doc.id ? 'border-primary bg-primary-light/20' : 'border-gray-200'}`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-semibold text-gray-900 text-sm">👨‍⚕️ {doc.name || doc.user?.name}</div>
                                        <div className="text-xs text-muted mt-0.5">{doc.speciality}</div>
                                    </div>
                                    <div className="text-right">
                                        {doc.tarif && <div className="text-sm font-bold text-primary">{doc.tarif} MAD</div>}
                                        {selectedDoctor?.id === doc.id && <CheckCircle size={16} className="text-primary ml-auto mt-1" />}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between pt-2">
                        <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted hover:text-gray-700"><ChevronLeft size={15} /> Retour</button>
                        <button onClick={() => setStep(3)} disabled={!selectedDoctor}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition">
                            Suivant <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── ÉTAPE 3 : Type de consultation & Créneau ──────────────────────── */}
            {step === 3 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Stethoscope size={20} className="text-primary" /> Type de consultation & Créneau
                    </h2>

                    {/* Type de consultation */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Type de consultation *</label>
                        <div className="grid grid-cols-2 gap-2">
                            {TYPES_CONSULTATION.map(t => (
                                <label key={t.value} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${typeConsultation === t.value ? 'border-primary bg-primary-light/20' : 'border-gray-200 hover:bg-gray-50'}`}>
                                    <input type="radio" name="type" value={t.value} checked={typeConsultation === t.value} onChange={() => setTypeConsultation(t.value)} className="accent-primary" />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium">{t.label}</div>
                                        <div className="text-xs text-primary font-bold">
                                            {t.value === 'preoperation' ? 'Prix chambre × nuits' : `${t.prix} DH`}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Créneau */}
                    <div className="border-t border-gray-100 pt-5 space-y-4">
                        <div className="text-sm text-gray-600">
                            Médecin : <span className="font-semibold">{selectedDoctor?.name || selectedDoctor?.user?.name}</span>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Date *</label>
                            <input type="date" value={selectedDate} min={today}
                                onChange={e => { setSelectedDate(e.target.value); setSelectedHeure(''); }}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20" />
                        </div>

                        {selectedDate && (
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Horaire disponible *</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {HORAIRES.map(h => {
                                        const isOccupe = slotsOccupes.includes(h);
                                        return (
                                            <button key={h}
                                                disabled={isOccupe}
                                                onClick={() => setSelectedHeure(h)}
                                                className={`py-2 rounded-xl text-sm font-medium transition border ${isOccupe ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' :
                                                    selectedHeure === h ? 'bg-primary text-white border-primary' :
                                                        'bg-white text-gray-700 border-gray-200 hover:bg-primary-light/20 hover:border-primary'
                                                    }`}>
                                                {isOccupe ? '🔒' : '✅'} {h}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between pt-2">
                        <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-muted hover:text-gray-700"><ChevronLeft size={15} /> Retour</button>
                        <button onClick={() => setStep(4)} disabled={!selectedDate || !selectedHeure}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition">
                            Suivant <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── ÉTAPE 4 : Hospitalisation ─────────────────────────────────────── */}
            {step === 4 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Bed size={20} className="text-primary" /> Hospitalisation
                    </h2>

                    <div className="flex gap-3">
                        {[{ val: false, label: '🏃 Non — Consultation ambulatoire', desc: 'Le patient repart après la consultation' },
                        { val: true, label: '🛏️ Oui — Hospitalisation prévue', desc: "Demande d'admission avec chambre proposée" }].map(opt => (
                            <label key={String(opt.val)} onClick={() => setHospitalisation(opt.val)}
                                className={`flex-1 p-4 rounded-xl border cursor-pointer transition ${hospitalisation === opt.val ? 'border-primary bg-primary-light/20' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <div className="font-medium text-sm">{opt.label}</div>
                                <div className="text-xs text-muted mt-1">{opt.desc}</div>
                            </label>
                        ))}
                    </div>

                    {hospitalisation && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Date d'admission</label>
                                    <input type="date" value={dateAdmission} onChange={e => setDateAdmission(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Sortie prévue</label>
                                    <input type="date" value={dateSortie} min={dateAdmission} onChange={e => setDateSortie(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>

                            {rooms.length > 0 ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    <label className="text-sm font-medium text-gray-700 block">Chambres disponibles</label>
                                    {rooms.map(room => (
                                        <div key={room.id} onClick={() => setSelectedRoom(room)}
                                            className={`border rounded-xl p-3 cursor-pointer transition ${selectedRoom?.id === room.id ? 'border-primary bg-primary-light/20' : 'border-gray-200 hover:bg-gray-50'}`}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className="font-semibold text-sm">🟢 {room.number || room.numero} — {room.type}</span>
                                                    <div className="text-xs text-muted mt-0.5">{room.description || room.features}</div>
                                                </div>
                                                {room.price && <span className="text-primary font-bold text-sm">{room.price} MAD/nuit</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-muted bg-gray-50 p-3 rounded-xl">Aucune chambre disponible actuellement.</div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between pt-2">
                        <button onClick={() => setStep(3)} className="flex items-center gap-1 text-sm text-muted hover:text-gray-700"><ChevronLeft size={15} /> Retour</button>
                        <button onClick={() => setStep(5)}
                            disabled={hospitalisation && !selectedRoom && rooms.length > 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition">
                            Récapitulatif <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── ÉTAPE 5 : Récapitulatif ────────────────────────────────────────── */}
            {step === 5 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <CheckCircle size={20} className="text-success" /> Récapitulatif du rendez-vous
                    </h2>

                    <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted">Patient</span><span className="font-semibold">{patient?.cin?.numero || cinInput} — {patient?.prenom} {patient?.nom}</span></div>
                        <div className="flex justify-between"><span className="text-muted">Médecin</span><span className="font-semibold">{selectedDoctor?.name || selectedDoctor?.user?.name}</span></div>
                        <div className="flex justify-between"><span className="text-muted">Date & heure</span><span className="font-semibold">{selectedDate} à {selectedHeure}</span></div>
                        <div className="flex justify-between"><span className="text-muted">Type</span><span className="font-semibold">{TYPES_CONSULTATION.find(t => t.value === typeConsultation)?.label || typeConsultation} — Présentiel</span></div>
                        {selectedRoom && <div className="flex justify-between"><span className="text-muted">Chambre</span><span className="font-semibold">{selectedRoom.number || selectedRoom.numero} — {selectedRoom.type}</span></div>}
                        {patient?.allergies?.length > 0 && (
                            <div className="flex justify-between text-orange-600">
                                <span className="flex items-center gap-1"><AlertTriangle size={13} /> Allergie</span>
                                <span className="font-semibold">{patient.allergies.join(', ')}</span>
                            </div>
                        )}
                    </div>

                    {/* Estimation financière */}
                    {(() => {
                        const jours = (selectedRoom?.price && dateAdmission && dateSortie)
                            ? Math.max(1, Math.ceil((new Date(dateSortie) - new Date(dateAdmission)) / 86400000))
                            : 0;
                        const prixConsult = getPrixConsultation(typeConsultation, selectedRoom, dateAdmission, dateSortie);
                        const prixChambre = (typeConsultation === 'preoperation' && selectedRoom?.price && jours > 0)
                            ? selectedRoom.price * jours : 0;
                        const total = typeConsultation === 'preoperation' ? prixChambre : prixConsult;
                        return (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-1">
                                <div className="font-semibold text-blue-700 mb-2">💰 Estimation financière</div>
                                {typeConsultation === 'preoperation' ? (
                                    <>
                                        <div className="flex justify-between"><span>Chambre ({jours} nuit(s) × {selectedRoom?.price || '?'} DH)</span><span className="font-bold">{prixChambre} DH</span></div>
                                    </>
                                ) : (
                                    <div className="flex justify-between"><span>Consultation</span><span className="font-bold">{prixConsult} DH</span></div>
                                )}
                                <div className="flex justify-between border-t border-blue-200 pt-1 mt-1 font-bold text-blue-800">
                                    <span>Total estimé</span><span>{total} DH</span>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="flex justify-between pt-2">
                        <button onClick={() => setStep(4)} className="flex items-center gap-1 text-sm text-muted hover:text-gray-700"><ChevronLeft size={15} /> Modifier</button>
                        <button onClick={handleConfirm} disabled={loading}
                            className="flex items-center gap-2 px-6 py-2.5 bg-success hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition shadow-md disabled:opacity-50">
                            {loading ? <span className="animate-spin">⏳</span> : <CheckCircle size={16} />}
                            {loading ? 'Confirmation...' : '✅ Confirmer le rendez-vous'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
