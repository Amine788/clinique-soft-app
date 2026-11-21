import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { CreditCard, Search, CheckCircle, AlertTriangle, Clock, User, Stethoscope, XCircle, QrCode, RefreshCw, LogIn } from 'lucide-react';

export default function CheckinPage() {
    const [cin, setCin] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [result, setResult] = useState(null);
    const [expectedToday, setExpectedToday] = useState([]);
    const [queue, setQueue] = useState([]);

    const CIN_REGEX = /^[A-Z]{1,2}[0-9]{6}$/;

    const fetchExpected = useCallback(async () => {
        setFetching(true);
        try {
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const { data } = await api.get('/appointments', { params: { date: today } });
            // Filter only those who haven't arrived yet
            setExpectedToday(data.filter(a => a.status === 'planifie' || a.status === 'confirme'));
            // Also update current queue (those who have arrived)
            setQueue(data.filter(a => a.status === 'arrive' || a.status === 'pret' || a.status === 'en_cours'));
        } catch (err) {
            console.error("Error fetching expected appointments", err);
        } finally {
            setFetching(false);
        }
    }, []);

    useSocket({ queue_updated: fetchExpected });
    useEffect(() => {
        fetchExpected();
        // Refresh every 2 minutes
        const timer = setInterval(fetchExpected, 15000);
        return () => clearInterval(timer);
    }, [fetchExpected]);

    const handleCheckin = async (providedCin, rdvId) => {
        const targetCin = (providedCin || cin).toUpperCase();
        if (!CIN_REGEX.test(targetCin)) {
            toast.error('Format CIN invalide');
            return;
        }

        setLoading(true);
        try {
            const { data } = await api.post('/patients/checkin', { cin: targetCin, mode: 'saisie_cin', rdvId });
            setResult(data);
            toast.success(`✅ ${data.patient.name} pointé avec succès !`);
            setCin('');
            fetchExpected(); // Refresh lists
        } catch (err) {
            const msg = err.response?.data?.error || 'Erreur de pointage';
            toast.error(msg);
            setResult({ error: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="page-title">🏥 Accueil — Pointage & Salle d'Attente</h1>
                    <p className="text-muted text-sm mt-1">Gérez les arrivées et la file d'attente en temps réel.</p>
                </div>
                <button onClick={fetchExpected} disabled={fetching} className="btn btn-outline btn-sm flex gap-2">
                    <RefreshCw size={14} className={fetching ? "animate-spin" : ""} />
                    Actualiser
                </button>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* ============================================================ */}
                {/* Zone de Pointage Rapide */}
                {/* ============================================================ */}
                <div className="col-span-12 lg:col-span-4 space-y-5">
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <SectionTitle icon={<CreditCard size={18} className="text-primary" />} title="Pointage Rapide" />
                        
                        <div className="flex gap-2 mb-4">
                            <button className="flex-1 py-2 bg-primary/10 text-primary text-xs font-bold rounded-lg border border-primary/20">Saisie CIN</button>
                            <button className="flex-1 py-2 bg-gray-50 text-gray-500 text-xs font-bold rounded-lg border border-gray-100">Scan QR</button>
                        </div>

                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={cin} onChange={e => setCin(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && handleCheckin()}
                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-lg font-mono font-bold tracking-widest focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                placeholder="CIN..."
                                maxLength={8}
                            />
                        </div>
                        <button onClick={() => handleCheckin()} disabled={loading || !CIN_REGEX.test(cin.toUpperCase())}
                            className="mt-3 w-full py-3 bg-success hover:bg-green-600 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 disabled:opacity-40">
                            {loading ? <span className="animate-spin">⏳</span> : <CheckCircle size={18} />}
                            {loading ? 'Pointage...' : 'Pointer l\'arrivée'}
                        </button>
                    </div>

                    {/* Résultat du dernier pointage */}
                    {result && !result.error && (
                        <div className={`rounded-2xl border p-5 shadow-sm animate-in fade-in slide-in-from-top-2 ${result.cinExpiree ? 'border-warning/30 bg-warning-light/20' : 'border-success/30 bg-success-light/20'}`}>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-lg font-bold text-primary">
                                        {result.patient.prenom?.[0]}{result.patient.nom?.[0]}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-gray-900">{result.patient.name}</div>
                                        <div className="text-xs text-muted font-mono">{result.patient.cin}</div>
                                        {result.rdv ? (
                                            <div className="mt-1 badge badge-success text-[10px]">RDV Confirmé : {result.rdv.id}</div>
                                        ) : (
                                            <div className="mt-1 badge badge-warning text-[10px]">Pas de RDV aujourd'hui</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {result.alertes?.allergies && (
                                <div className="mt-3 p-2 bg-danger-light border border-danger/20 rounded-lg flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-danger" />
                                    <span className="text-[11px] font-bold text-danger">ALLERGIES : {result.alertes.allergiesListe.join(', ')}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ============================================================ */}
                {/* Attendu Aujourd'hui */}
                {/* ============================================================ */}
                <div className="col-span-12 lg:col-span-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <SectionTitle icon={<Clock size={18} className="text-warning" />} title="Attendu Aujourd'hui" />
                            <span className="bg-warning/10 text-warning px-2 py-0.5 rounded text-[11px] font-bold">{expectedToday.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto min-h-[400px]">
                            {expectedToday.length === 0 ? (
                                <div className="p-8 text-center text-muted text-sm flex flex-col items-center gap-2 opacity-60">
                                    <Clock size={32} strokeWidth={1.5} />
                                    Plus aucun patient attendu
                                </div>
                            ) : expectedToday.map((rdv) => (
                                <div key={rdv.id} className="p-4 border-b border-gray-50 hover:bg-gray-50 transition group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-gray-900 text-sm">{rdv.patient}</div>
                                            <div className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                                                <span className="font-mono text-primary font-bold">{rdv.time}</span>
                                                <span>·</span>
                                                <span className="truncate">{rdv.doctor}</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleCheckin(rdv.patientCin, rdv.id)}
                                            className="p-2 bg-gray-100 text-gray-500 hover:bg-success hover:text-white rounded-lg transition-all"
                                            title="Pointer l'arrivée"
                                        >
                                            <LogIn size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ============================================================ */}
                {/* File d'attente (En cours) */}
                {/* ============================================================ */}
                <div className="col-span-12 lg:col-span-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <SectionTitle icon={<Stethoscope size={18} className="text-success" />} title="Salle d'Attente" />
                            <span className="bg-success/10 text-success px-2 py-0.5 rounded text-[11px] font-bold">{queue.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto min-h-[400px]">
                            {queue.length === 0 ? (
                                <div className="p-8 text-center text-muted text-sm flex flex-col items-center gap-2 opacity-60">
                                    <User size={32} strokeWidth={1.5} />
                                    Salle d'attente vide
                                </div>
                            ) : queue.map((p, i) => (
                                <div key={p.id} className="p-4 border-b border-gray-50 flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                        p.status === 'en_cours' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' :
                                        p.status === 'pret' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-gray-900 truncate">{p.patient}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                                                {p.status === 'arrive' ? 'En salle d’attente' : p.status === 'pret' ? 'Prêt pour consultation' : 'En consultation'}
                                            </span>
                                            <span className="text-[10px] text-muted">{p.time}</span>
                                        </div>
                                    </div>
                                    {p.status === 'en_cours' && (
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionTitle({ icon, title }) {
    return (
        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-sm uppercase letter-spacing-wide">
            {icon} {title}
        </h2>
    );
}
