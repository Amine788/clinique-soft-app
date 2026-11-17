import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { Calendar, ChevronLeft, ChevronRight, Clock, User, PlayCircle, Lock, Plus } from 'lucide-react';

const HORAIRES = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];

function getWeekDays(date) {
    const d = new Date(date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 6 }, (_, i) => {
        const dd = new Date(monday);
        dd.setDate(monday.getDate() + i);
        return dd;
    });
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function DoctorAgendaPage() {
    const navigate = useNavigate();
    // Stocker une chaîne ISO stable (pas un objet Date qui change à chaque render)
    const [weekStart, setWeekStart] = useState(() => new Date().toISOString());
    const [appointments, setAppointments] = useState([]);
    const [loadedWeek, setLoadedWeek] = useState(null);
    const loading = loadedWeek !== weekStart;

    const days = getWeekDays(new Date(weekStart));

    useEffect(() => {
        let active = true;
        api.get('/appointments')
            .then(r => { if (active) setAppointments(r.data || []); })
            .catch(() => { })
            .finally(() => { if (active) setLoadedWeek(weekStart); });
        return () => { active = false; };
    }, [weekStart]);

    function prevWeek() {
        const d = new Date(weekStart);
        d.setDate(d.getDate() - 7);
        setWeekStart(d.toISOString()); // stocker string
    }

    function nextWeek() {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 7);
        setWeekStart(d.toISOString()); // stocker string
    }

    function getRdvForSlot(day, heure) {
        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, '0');
        const date = String(day.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${date}`;

        return appointments.find(a => {
            return a.date === dateStr && a.time === heure;
        });
    }

    const isToday = (day) => day.toDateString() === new Date().toDateString();
    const isPast = (day, heure) => {
        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, '0');
        const date = String(day.getDate()).padStart(2, '0');
        const dt = new Date(`${year}-${month}-${date}T${heure}`);
        return dt < new Date();
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Mon Agenda</h1>
                    <p className="text-sm text-muted">Vue semaine — cliquez sur un créneau pour démarrer la consultation</p>
                </div>
                <button onClick={() => navigate('/appointments/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-hover transition">
                    <Plus size={15} /> Nouveau RDV
                </button>
            </div>

            {/* Navigation semaine */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <button onClick={prevWeek} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><ChevronLeft size={18} /></button>
                    <div className="font-semibold text-sm text-gray-900">
                        Semaine du {days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au {days[5].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <button onClick={nextWeek} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><ChevronRight size={18} /></button>
                </div>

                {/* Grille agenda */}
                <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                        {/* En-têtes jours */}
                        <div className="grid grid-cols-7 border-b border-gray-100">
                            <div className="px-3 py-2 text-xs font-medium text-muted" />
                            {days.map((day, i) => (
                                <div key={i} className={`px-3 py-2 text-center border-l border-gray-100 ${isToday(day) ? 'bg-primary-light/30' : ''}`}>
                                    <div className="text-xs font-medium text-muted">{DAY_LABELS[i]}</div>
                                    <div className={`text-sm font-bold mt-0.5 ${isToday(day) ? 'text-primary' : 'text-gray-900'}`}>
                                        {day.getDate()}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Créneaux horaires */}
                        {loading ? (
                            <div className="flex items-center justify-center py-12 text-muted text-sm">Chargement des rendez-vous...</div>
                        ) : (
                            HORAIRES.map(heure => (
                                <div key={heure} className="grid grid-cols-7 border-b border-gray-50">
                                    <div className="px-3 py-1.5 text-xs text-muted flex items-center gap-1">
                                        <Clock size={11} /> {heure}
                                    </div>
                                    {days.map((day, i) => {
                                        const rdv = getRdvForSlot(day, heure);
                                        const past = isPast(day, heure);
                                        return (
                                            <div key={i}
                                                className={`border-l border-gray-50 px-1 py-1 min-h-[36px] ${isToday(day) ? 'bg-primary-light/10' : ''}`}>
                                                {rdv ? (
                                                    <button
                                                        onClick={() => navigate(`/consultation/${rdv.id}`)}
                                                        className="w-full text-left bg-primary text-white rounded-lg px-2 py-1 text-xs hover:bg-primary-hover transition group">
                                                        <div className="font-semibold truncate flex items-center gap-1">
                                                            <User size={9} /> {rdv.patient || 'Patient'}
                                                        </div>
                                                        <div className="text-primary-light text-[10px] truncate">{rdv.type || 'Consultation'}</div>
                                                        <PlayCircle size={10} className="hidden group-hover:block mt-0.5 text-white" />
                                                    </button>
                                                ) : past ? (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Lock size={11} className="text-gray-200" />
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Légende */}
            <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary rounded" /> RDV confirmé</span>
                <span className="flex items-center gap-1"><Lock size={11} /> Passé</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary-light/30 rounded border border-primary/20" /> Aujourd'hui</span>
            </div>
        </div>
    );
}
