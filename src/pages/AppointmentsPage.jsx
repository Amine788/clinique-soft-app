import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, MapPin, Clock, RefreshCw, X, Save } from 'lucide-react';

// ── Constantes ──────────────────────────────────────────────────────────────
const TYPE_COLORS = {
    urgente: '#ef4444', teleconsultation: '#3b82f6', premiere: '#8b5cf6',
    suivi: '#10b981', bilan: '#f59e0b', vaccination: '#06b6d4',
};
const TYPE_LABELS = {
    urgente: 'Urgence', teleconsultation: 'Téléconsultation', premiere: 'Première consult.',
    suivi: 'Suivi', bilan: 'Bilan', vaccination: 'Vaccination',
};
const TYPES_OPTIONS = [
    { value: 'premiere', label: 'Première consultation' },
    { value: 'suivi', label: 'Suivi' },
    { value: 'urgente', label: 'Consultation urgente' },
    { value: 'bilan', label: 'Bilan de santé' },
    { value: 'vaccination', label: 'Vaccination' },
];
const STATUTS_OPTIONS = [
    { value: 'planifie', label: '📅 Planifié' },
    { value: 'confirme', label: '✅ Confirmé' },
    { value: 'en_cours', label: '🔄 En cours' },
    { value: 'termine', label: '✔️ Terminé' },
    { value: 'annule', label: '❌ Annulé' },
    { value: 'non_presente', label: '🚫 Non présenté' },
];
const HORAIRES = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
];

function getWeekDays(baseDate) {
    const days = [];
    const day = new Date(baseDate);
    const dow = day.getDay() === 0 ? 6 : day.getDay() - 1;
    day.setDate(day.getDate() - dow);
    for (let i = 0; i < 6; i++) { days.push(new Date(day)); day.setDate(day.getDate() + 1); }
    return days;
}
function toISO(date) { return date.toISOString().split('T')[0]; }
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

// ── Modal d'édition ──────────────────────────────────────────────────────────
function EditModal({ rdv, onClose, onSaved }) {
    const [form, setForm] = useState({
        date: rdv.date || '',
        heure: rdv.time || '',
        typeConsultation: rdv.type || 'premiere',
        motif: rdv.motif || '',
        statut: rdv.status || 'planifie',
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch(`/appointments/${rdv.id}`, form);
            toast.success('Rendez-vous modifié avec succès');
            onSaved();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la modification');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '16px', padding: '28px',
                width: '480px', maxWidth: '95vw', boxShadow: 'var(--shadow-xl)',
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>✏️ Modifier le rendez-vous</h2>
                        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '4px 0 0' }}>
                            {rdv.patient} · {rdv.doctor}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Infos patient (lecture seule) */}
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 14px', marginBottom: '18px', fontSize: '0.82rem', color: '#374151' }}>
                    <div><strong>Patient :</strong> {rdv.patient}</div>
                    <div><strong>Médecin :</strong> {rdv.doctor}</div>
                    {rdv.patientPhone && <div><strong>Tél :</strong> {rdv.patientPhone}</div>}
                    <div><strong>N° RDV :</strong> <span style={{ fontFamily: 'monospace', color: '#004AAD' }}>{rdv.id}</span></div>
                </div>

                {/* Formulaire */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Date */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>📅 Date *</label>
                        <input type="date" value={form.date}
                            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.875rem', outline: 'none' }} />
                    </div>

                    {/* Heure */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>⏰ Horaire *</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                            {HORAIRES.map(h => (
                                <button key={h} onClick={() => setForm(f => ({ ...f, heure: h }))}
                                    style={{
                                        padding: '6px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                        border: form.heure === h ? '2px solid #004AAD' : '1px solid #e5e7eb',
                                        background: form.heure === h ? '#004AAD' : 'white',
                                        color: form.heure === h ? 'white' : '#374151',
                                        transition: 'all 0.15s',
                                    }}>
                                    {h}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Type de consultation */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>🩺 Type de consultation</label>
                        <select value={form.typeConsultation}
                            onChange={e => setForm(f => ({ ...f, typeConsultation: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.875rem' }}>
                            {TYPES_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    {/* Motif */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>📝 Motif</label>
                        <textarea value={form.motif}
                            onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
                            rows={2} placeholder="Motif de la consultation..."
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.875rem', resize: 'none', outline: 'none' }} />
                    </div>

                    {/* Statut */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>🔖 Statut</label>
                        <select value={form.statut}
                            onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.875rem' }}>
                            {STATUTS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                    <button onClick={onClose}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '12px', background: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#6b7280' }}>
                        Annuler
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '12px', background: saving ? '#7FAAE6' : '#004AAD', color: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {saving ? '⏳ Enregistrement...' : <><Save size={15} /> Enregistrer</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function AppointmentsPage() {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [weekBase, setWeekBase] = useState(new Date());
    const [editRdv, setEditRdv] = useState(null); // RDV en cours d'édition

    const weekDays = getWeekDays(weekBase);

    const fetchAppointments = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/appointments');
            setAppointments(data);
        } catch {
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

    const prevWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); };
    const nextWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); };
    const goToday = () => setWeekBase(new Date());

    const rdvsForDay = (dayDate) => {
        const iso = toISO(dayDate);
        return appointments.filter(a => a.date === iso);
    };

    const monthLabel = weekDays[0].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const todayISO = toISO(new Date());

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Agenda & Rendez-vous</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Double-cliquez sur un RDV pour le modifier.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-outline" onClick={fetchAppointments} title="Rafraîchir" style={{ padding: '0.5rem' }}>
                        <RefreshCw size={18} />
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/appointments/new')}>
                        <Plus size={18} /> Nouveau RDV
                    </button>
                </div>
            </div>

            <div className="card-smartdoc" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Toolbar navigation */}
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="btn btn-outline" style={{ padding: '0.4rem' }} onClick={prevWeek}><ChevronLeft size={20} /></button>
                        <h2 style={{ width: '220px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: 0, textTransform: 'capitalize' }}>
                            <CalendarIcon size={20} color="var(--primary)" />{monthLabel}
                        </h2>
                        <button className="btn btn-outline" style={{ padding: '0.4rem' }} onClick={nextWeek}><ChevronRight size={20} /></button>
                        <button className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={goToday}>Aujourd'hui</button>
                    </div>
                    {loading && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chargement...</span>}
                </div>

                {/* Grille calendrier */}
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', backgroundColor: 'var(--bg-color)' }}>
                    {/* Colonne heures */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-card)',
                        position: 'sticky', left: 0, zIndex: 5, borderRight: '1px solid var(--border)',
                        width: '70px', minWidth: '70px'
                    }}>
                        <div style={{ height: '52px', borderBottom: '1px solid var(--border)' }} />
                        {HOURS.map(h => (
                            <div key={h} style={{
                                minHeight: '80px', borderBottom: '1px solid var(--border)',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                                padding: '0.4rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500
                            }}>{h}:00</div>
                        ))}
                    </div>

                    {/* Colonnes jours */}
                    <div style={{ flex: 1, display: 'flex', minWidth: '700px' }}>
                        {weekDays.map((dayDate) => {
                            const iso = toISO(dayDate);
                            const isToday = iso === todayISO;
                            const dayRdvs = rdvsForDay(dayDate);
                            const dayLabel = dayDate.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') + ' ' + dayDate.getDate();

                            return (
                                <div key={iso} style={{ flex: 1, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                    {/* En-tête jour */}
                                    <div style={{
                                        height: '52px', borderBottom: '1px solid var(--border)',
                                        backgroundColor: isToday ? 'var(--primary-light)' : 'var(--bg-card)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: isToday ? 700 : 500, fontSize: '0.8rem',
                                        color: isToday ? 'var(--primary)' : 'inherit',
                                        position: 'sticky', top: 0, zIndex: 5, textTransform: 'capitalize'
                                    }}>{dayLabel}</div>

                                    {/* Cellules heures */}
                                    {HOURS.map(h => (
                                        <div key={h} style={{
                                            minHeight: '80px', borderBottom: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            backgroundColor: isToday ? 'rgba(99,102,241,0.02)' : 'white',
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--primary-light)'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = isToday ? 'rgba(99,102,241,0.02)' : 'white'}
                                        />
                                    ))}

                                    {/* RDV positionnés */}
                                    {dayRdvs.map(rdv => {
                                        const [h, m] = (rdv.time || '08:00').split(':').map(Number);
                                        const topPx = 52 + (h - 8) * 80 + (m / 60) * 80;
                                        const color = TYPE_COLORS[rdv.type] || 'var(--primary)';
                                        const [eh, em] = (rdv.endTime || `${h + 1}:00`).split(':').map(Number);
                                        const durationH = (eh * 60 + em - h * 60 - m) / 60;
                                        const heightPx = Math.max(durationH * 80 - 6, 38);

                                        return (
                                            <div key={rdv.id}
                                                onDoubleClick={() => setEditRdv(rdv)}
                                                title="Double-cliquez pour modifier"
                                                style={{
                                                    position: 'absolute',
                                                    top: `${topPx}px`,
                                                    height: `${heightPx}px`,
                                                    left: '3px', right: '3px',
                                                    borderRadius: '6px', padding: '0.35rem 0.4rem',
                                                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                                                    border: `1px solid ${color}`,
                                                    borderLeftWidth: '4px',
                                                    backgroundColor: 'white',
                                                    cursor: 'pointer', overflow: 'hidden',
                                                    display: 'flex', flexDirection: 'column', gap: '1px',
                                                    transition: 'transform 0.1s, box-shadow 0.1s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)'; }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rdv.patient}</span>
                                                    <MapPin size={11} />
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 500 }}>
                                                    {TYPE_LABELS[rdv.type] || rdv.type}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: 'auto', fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                                                    <Clock size={9} /> {rdv.time} – {rdv.endTime || ''}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {appointments.length === 0 && !loading && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Aucun rendez-vous pour cette semaine.
                        <br />
                        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/appointments/new')}>
                            <Plus size={16} /> Créer un rendez-vous
                        </button>
                    </div>
                )}
            </div>

            {/* Modal d'édition (double-clic) */}
            {editRdv && (
                <EditModal
                    rdv={editRdv}
                    onClose={() => setEditRdv(null)}
                    onSaved={fetchAppointments}
                />
            )}
        </div>
    );
}
