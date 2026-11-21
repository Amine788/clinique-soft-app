import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { formatMAD } from '../../utils/helpers';
import api from '../../api/axios';
import { BarChart3, TrendingUp, Users, Calendar, Download } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#004AAD', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function DoctorStatsPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(Boolean(user?.doctorId));

    useEffect(() => {
        const doctorId = user?.doctorId;
        if (!doctorId) return;
        api.get(`/doctors/${doctorId}/stats`)
            .then(r => setStats(r.data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [user?.doctorId]); // ✅ Primitive stable


    if (loading) return <div className="flex items-center justify-center h-64 text-muted">Chargement des statistiques...</div>;
    if (!stats) return <div className="text-center text-muted py-12">Aucune donnée disponible</div>;

    const dailyData = stats.consultationsPerDay?.map((v, i) => ({ day: i + 1, consultations: v })) || [];
    const ecartNoShows = stats.noShows - stats.prevNoShows;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title">Mes Statistiques</h1>
                    <p className="text-muted text-sm mt-1">Analyse détaillée de votre activité — {stats.periode}</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition shadow-md shadow-primary/25">
                    <Download size={16} /> Exporter PDF
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Consultations', value: stats.totalConsultations, sub: `${stats.avgPerDay}/jour en moy.`, icon: Calendar, color: 'primary' },
                    { label: 'Taux de présence', value: stats.presenceRate === null ? '—' : `${stats.presenceRate}%`, sub: 'Ce mois', icon: Users, color: 'success' },
                    { label: 'No-shows', value: stats.noShows, sub: `${ecartNoShows > 0 ? '+' : ''}${ecartNoShows} vs mois dernier`, icon: BarChart3, color: 'warning' },
                    { label: 'Honoraires', value: formatMAD(stats.monthlyRevenue), sub: `Précédent: ${formatMAD(stats.prevMonthRevenue)}`, icon: TrendingUp, color: 'info' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <div className={`w-10 h-10 rounded-xl bg-${kpi.color}/10 text-${kpi.color} flex items-center justify-center mb-3`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className="text-sm text-muted font-medium">{kpi.label}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-0.5">{kpi.value}</p>
                        <p className="text-xs text-muted mt-1">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Consultations par jour */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4">Consultations par jour ({stats.periode})</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="consultations" fill="#004AAD" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Par type */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4">Répartition par type</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={stats.byType} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {stats.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Évolution mensuelle */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4">Évolution mensuelle</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={stats.monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="consultations" stroke="#004AAD" strokeWidth={2} dot={{ r: 4 }} />
                            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Répartition par âge */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4">Patients par tranche d'âge</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stats.byAge} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={50} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Diagnostics */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Top 10 — Motifs de consultation</h3>
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100">
                            <th className="pb-3 text-left text-xs font-semibold text-muted uppercase">#</th>
                            <th className="pb-3 text-left text-xs font-semibold text-muted uppercase">Motif</th>
                            <th className="pb-3 text-right text-xs font-semibold text-muted uppercase">Nombre</th>
                            <th className="pb-3 text-right text-xs font-semibold text-muted uppercase">% du total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.topDiagnoses?.map(d => (
                            <tr key={d.rank} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="py-3 text-sm font-bold text-primary">{d.rank}</td>
                                <td className="py-3 text-sm font-medium text-gray-900">{d.name}</td>
                                <td className="py-3 text-sm font-bold text-right">{d.count}</td>
                                <td className="py-3 text-sm text-right text-muted">{d.percent}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
