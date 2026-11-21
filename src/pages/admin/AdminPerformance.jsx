import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import {
    Bed, AlertTriangle, Activity, DollarSign, Star,
    ArrowUpRight, ArrowDownRight, RefreshCw
} from 'lucide-react';


export default function AdminPerformance() {
    const [overview, setOverview] = useState(null);
    const [activity, setActivity] = useState([]);
    const [indicators, setIndicators] = useState([]);
    const [finance, setFinance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('mois');

    const fetchAll = useCallback(() => {
        return Promise.all([
                api.get(`/performance/overview?period=${period}`),
                api.get('/performance/activity?months=6'),
                api.get('/performance/indicators'),
                api.get(`/performance/finance?period=${period}`)
            ]).then(([ov, act, ind, fin]) => {
            setOverview(ov.data);
            setActivity(act.data || []);
            setIndicators(ind.data || []);
            setFinance(fin.data);
        }).catch(e => {
            console.error('[PERF]', e);
        }).finally(() => {
            setLoading(false);
        });
    }, [period]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const kpis = overview ? [
        {
            label: 'Consultations', value: overview.consultationsJour, sub: "aujourd'hui",
            icon: Activity, color: 'text-brand-600', bg: 'bg-brand-50',
            trend: `${overview.consultationsPeriode} / ${period}`, up: true
        },
        {
            label: 'Taux occupation', value: `${overview.tauxOccupation}%`, sub: 'lits occupés',
            icon: Bed, color: 'text-teal-600', bg: 'bg-teal-50',
            trend: `${overview.litsOccupes}/${overview.totalLits} lits`, up: overview.tauxOccupation > 70
        },
        {
            label: 'Alertes actives', value: overview.alertes, sub: 'factures > 30j',
            icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50',
            trend: overview.alertes > 0 ? 'À traiter' : 'RAS', up: false
        },
        {
            label: 'Factures réglées', value: overview.caTotal?.toLocaleString('fr-FR'), sub: 'MAD',
            icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50',
            trend: '+vs mois préc.', up: true
        },
        {
            label: 'Satisfaction',
            value: overview.satisfaction != null ? `${overview.satisfaction}/5` : 'Non mesuré',
            sub: overview.satisfaction != null ? 'NPS patient' : 'Aucun questionnaire patient',
            icon: Star, color: 'text-violet-600', bg: 'bg-violet-50',
            trend: overview.satisfaction != null ? 'Stable' : null, up: true
        },
    ] : [];

    const actMaxCA = activity.length > 0 ? Math.max(...activity.map(d => d.ca), 1) : 1;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <RefreshCw size={28} className="animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Performance & Tableaux de bord</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Indicateurs clés en temps réel — Direction</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex border border-gray-200 rounded-xl overflow-hidden text-xs font-bold">
                        {[['jour', 'Jour'], ['mois', 'Mois'], ['annee', 'Année']].map(([k, l]) => (
                            <button key={k} onClick={() => { if (k !== period) { setLoading(true); setPeriod(k); } }}
                                className={`px-3 py-2 transition ${period === k ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => { setLoading(true); fetchAll(); }} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                        <RefreshCw size={14} /> Actualiser
                    </button>
                </div>
            </div>

            {/* KPI Banner */}
            <div className="grid grid-cols-5 gap-3">
                {kpis.map((k, i) => {
                    const Icon = k.icon;
                    return (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className={`w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center mb-3`}>
                                <Icon size={18} className={k.color} />
                            </div>
                            <div className="text-2xl font-bold text-gray-900">{k.value}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
                            {k.trend && <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${k.up ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {k.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {k.trend}
                            </div>}
                        </div>
                    );
                })}
            </div>

            {/* Graphiques */}
            <div className="grid grid-cols-3 gap-6">
                {/* Activité mensuelle */}
                <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="font-bold text-gray-900">Activité Mensuelle</div>
                            <div className="text-xs text-gray-400">Chiffre d'affaires (×1000 MAD)</div>
                        </div>
                        <div className="flex gap-3 text-xs font-semibold">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary inline-block" />CA</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-teal-400 inline-block" />Consult.</span>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 h-48">
                        {activity.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div className="w-full flex items-end gap-1 h-40">
                                    <div className="flex-1 bg-primary/10 hover:bg-primary/30 rounded-t-lg transition group relative cursor-pointer"
                                        style={{ height: `${Math.max(4, (d.ca / actMaxCA) * 100)}%` }}>
                                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                                            {d.ca}K MAD
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-teal-400/20 hover:bg-teal-400/40 rounded-t-lg transition"
                                        style={{ height: `${Math.max(4, (d.consultations / 60) * 100)}%` }} />
                                </div>
                                <div className="text-[10px] font-bold text-gray-400">{d.mois}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Occupancy */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="font-bold text-gray-900 mb-1">Occupation des lits</div>
                    <div className="text-xs text-gray-400 mb-6">état actuel des chambres</div>
                    {overview && (
                        <div className="space-y-4">
                            {[
                                { label: 'Occupées', val: overview.litsOccupes, total: overview.totalLits, color: 'bg-red-400' },
                                { label: 'Disponibles', val: overview.totalLits - overview.litsOccupes, total: overview.totalLits, color: 'bg-emerald-500' },
                            ].map((r, i) => {
                                const pct = overview.totalLits > 0 ? Math.round((r.val / overview.totalLits) * 100) : 0;
                                return (
                                    <div key={i}>
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="font-semibold text-gray-700">{r.label}</span>
                                            <span className="text-gray-400 font-bold">{r.val} lits ({pct}%)</span>
                                        </div>
                                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div className={`h-full ${r.color} rounded-full`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="mt-6 p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10">
                        <div className="text-xs font-bold text-gray-500 uppercase mb-1">Satisfaction NPS</div>
                        <div className="flex items-end gap-1">
                            <span className="text-3xl font-bold text-gray-900">{overview?.satisfaction || '—'}</span>
                            <span className="text-sm text-gray-400 mb-1">/5</span>
                        </div>
                        <div className="flex gap-0.5 mt-2">
                            {[1, 2, 3, 4, 5].map(s => (
                                <span key={s} className={`text-base ${s <= Math.round(overview?.satisfaction || 0) ? 'text-amber-400' : 'text-amber-200'}`}>★</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Indicateurs & Top médecins */}
            <div className="grid grid-cols-2 gap-6">
                {/* Indicateurs vs cibles */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="font-bold text-gray-900 mb-4">Indicateurs vs Objectifs</div>
                    <div className="space-y-4">
                        {indicators.map((ind, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-semibold text-gray-700 truncate">{ind.label}</span>
                                        <span className="text-gray-400 shrink-0 ml-2">{ind.val} / {ind.cible}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${ind.pct >= 90 ? 'bg-emerald-500' : ind.pct >= 75 ? 'bg-amber-400' : 'bg-red-400'}`}
                                            style={{ width: `${ind.pct ?? 0}%` }} />
                                    </div>
                                </div>
                                <div className={`text-xs font-bold w-10 text-right ${ind.pct == null ? 'text-gray-400' : ind.pct >= 90 ? 'text-emerald-600' : ind.pct >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {ind.pct == null ? '—' : `${ind.pct}%`}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top médecins (finance) */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="font-bold text-gray-900 mb-4">Top Médecins — {period === 'jour' ? "Aujourd'hui" : period === 'annee' ? 'Année' : 'Ce mois'}</div>
                    {finance?.medecins?.length > 0 ? (
                        <div className="space-y-3">
                            {finance.medecins.slice(0, 5).map((m, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-gray-900">{m.nom}</div>
                                        <div className="text-xs text-gray-400">{m.specialite} · {m.consultations} consult.</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-gray-900">{m.ca?.toLocaleString('fr-FR')} MAD</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 text-sm py-10">
                            Aucune donnée pour cette période.
                        </div>
                    )}
                    {finance && (
                        <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex justify-between text-sm">
                            <span className="text-emerald-700 font-semibold">Taux recouvrement</span>
                            <span className="font-bold text-emerald-800">{finance.tauxRecouvrement}%</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
