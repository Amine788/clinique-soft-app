import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { formatMAD } from '../utils/helpers';
import api from '../api/axios';
import { useSocket } from '../hooks/useSocket';
import { Users, Calendar, TrendingUp, Activity, CreditCard, Pill, Bell, Stethoscope, Microscope, Droplet, Clock, PlayCircle, BedDouble, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';
import LoadingScreen from '../components/LoadingScreen';
import NurseDashboardPage from './nurse/NurseDashboardPage';

export default function DashboardPage() {
    const { user } = useAuthStore();

    // Données différentes selon le rôle
    if (user?.role === 'admin') return <AdminDashboard />;
    if (user?.role === 'doctor') return <DoctorDashboard />;
    if (user?.role === 'pharmacist') return <PharmacistDashboard />;
    if (user?.role === 'lab_technician') return <LaboratoryDashboard />;
    // Infirmier : le tableau de bord est le suivi des soins (filtrable par médecin)
    if (user?.role === 'nurse') return <NurseDashboardPage />;
    return <SecretaryDashboard />;
}

// Chargement d'un tableau de bord : données, erreur, rechargement manuel
function useDashboard(url) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);

    const load = useCallback(() => {
        return api.get(url)
            .then(r => { setData(r.data); setError(false); })
            .catch(err => { console.error(err); setError(true); });
    }, [url]);

    useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
    useSocket({ queue_updated: load });
    return { data, error, reload: load };
}

const STATUTS_RDV = {
    planifie: { label: 'Planifié', className: 'bg-gray-100 text-gray-600' },
    confirme: { label: 'Confirmé', className: 'bg-primary-light text-primary' },
    arrive: { label: 'En salle d’attente', className: 'bg-amber-50 text-amber-700' },
    pret: { label: 'Prêt', className: 'bg-emerald-50 text-emerald-700' },
    en_cours: { label: 'En consultation', className: 'bg-primary text-white' },
    termine: { label: 'Terminé', className: 'bg-gray-100 text-gray-500' },
    non_presente: { label: 'Absent', className: 'bg-red-50 text-red-600' },
};
const STATUTS_SALLE_ATTENTE = ['arrive', 'pret', 'en_cours'];

function StatutRdv({ status }) {
    const s = STATUTS_RDV[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
    return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

function PageHeader({ title, subtitle, children }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 className="page-title">{title}</h1>
                <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
            </div>
            {children}
        </div>
    );
}

function ErrorBanner({ onRetry }) {
    return (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <AlertCircle size={18} aria-hidden="true" />
            <span className="flex-1">Impossible de charger les données du tableau de bord.</span>
            <button type="button" onClick={onRetry} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100">
                Réessayer
            </button>
        </div>
    );
}

function Panel({ title, icon, children, className = '' }) {
    const Icon = icon;
    return (
        <section className={`bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm ${className}`}>
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                {Icon && <Icon size={18} className="text-primary" aria-hidden="true" />} {title}
            </h2>
            {children}
        </section>
    );
}

function KpiGrid({ children }) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function SecretaryDashboard() {
    const { data: stats, error, reload } = useDashboard('/dashboard/secretary');

    const occupation = !stats ? '—' : stats.tauxOccupation === null ? '—' : `${stats.tauxOccupation} %`;
    const occupationHint = !stats ? 'Chambres' : stats.chambresTotal === 0
        ? 'Aucune chambre enregistrée'
        : `${stats.chambresOccupees} / ${stats.chambresTotal} chambres occupées`;

    return (
        <div className="space-y-6">
            <PageHeader title="Tableau de bord" subtitle="Accueil et gestion — aujourd’hui" />
            <div className="flex flex-wrap gap-3">
                <Link className="btn btn-primary" to="/patients/create">Nouveau patient</Link>
                <Link className="btn btn-primary" to="/checkin">Accueil / Salle d’attente</Link>
                <Link className="btn btn-outline" to="/appointments/new">Prendre rendez-vous</Link>
            </div>
            {error && <ErrorBanner onRetry={reload} />}
            <KpiGrid>
                <KpiCard title="Encaissé aujourd’hui" value={stats ? formatMAD(stats.caJour) : '—'} icon={TrendingUp} color="primary" hint="Factures payées" />
                <KpiCard title="Consultations" value={stats?.consultations ?? '—'} icon={Users} color="info" hint="Rendez-vous du jour" />
                <KpiCard title="Occupation des chambres" value={occupation} icon={BedDouble} color="success" hint={occupationHint} />
                <KpiCard title="Impayés de plus de 30 jours" value={stats ? formatMAD(stats.impayes) : '—'} icon={CreditCard} color="danger" hint="Factures en attente" />
            </KpiGrid>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Panel title="Encaissements des 7 derniers jours" icon={TrendingUp} className="lg:col-span-2">
                    <RevenueChart days={stats?.revenus7j} />
                </Panel>
                <Panel title="Salle d’attente" icon={Users}>
                    <WaitingList items={stats?.salleAttente} showDoctor />
                </Panel>
            </div>
        </div>
    );
}

const jourCourt = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');

function RevenueChart({ days }) {
    if (!days) return <div className="h-48 animate-pulse rounded-xl bg-gray-50" />;
    const max = Math.max(...days.map(d => d.total));
    if (max === 0) {
        return <p className="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">Aucun encaissement sur les 7 derniers jours.</p>;
    }
    return (
        <figure>
            <ul className="flex h-48 items-end gap-2 sm:gap-3" aria-label="Montant encaissé par jour">
                {days.map((d, i) => {
                    const today = i === days.length - 1;
                    return (
                        <li key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${jourCourt(d.date)} : ${formatMAD(d.total)}`}>
                            <span className="sr-only">{jourCourt(d.date)} : {formatMAD(d.total)}</span>
                            <div
                                aria-hidden="true"
                                className={`rounded-t-md ${today ? 'bg-primary' : 'bg-primary/25'}`}
                                style={{ height: `${Math.max((d.total / max) * 100, d.total > 0 ? 3 : 0)}%` }}
                            />
                        </li>
                    );
                })}
            </ul>
            <div className="mt-2 flex gap-2 sm:gap-3 text-xs font-medium text-gray-500" aria-hidden="true">
                {days.map((d, i) => (
                    <span key={d.date} className={`flex-1 text-center capitalize ${i === days.length - 1 ? 'font-bold text-primary' : ''}`}>{jourCourt(d.date)}</span>
                ))}
            </div>
            <figcaption className="mt-3 text-xs text-gray-500">
                Total sur 7 jours : <strong className="text-gray-900">{formatMAD(days.reduce((s, d) => s + d.total, 0))}</strong>
            </figcaption>
        </figure>
    );
}

function WaitingList({ items, showDoctor = false, canStart = false }) {
    if (!items) return <div className="h-32 animate-pulse rounded-xl bg-gray-50" />;
    if (items.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-500">Personne en attente pour l’instant.</p>;
    }
    return (
        <ol className="space-y-2.5 max-h-[400px] overflow-y-auto">
            {items.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-primary shadow-sm">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-900">{p.patient}</div>
                        <div className="truncate text-xs text-gray-500">{p.time}{showDoctor && ` · ${p.doctor}`}</div>
                    </div>
                    <StatutRdv status={p.status} />
                    {canStart && ['arrive', 'pret', 'en_cours'].includes(p.status) && (
                        <Link
                            to={`/consultation/${p.numeroRdv || p.id}`}
                            aria-label={`Commencer la consultation de ${p.patient}`}
                            className="rounded-lg border border-emerald-200 bg-white p-2 text-emerald-600 shadow-sm transition hover:bg-emerald-600 hover:text-white"
                        >
                            <PlayCircle size={16} aria-hidden="true" />
                        </Link>
                    )}
                </li>
            ))}
        </ol>
    );
}

function DoctorDashboard() {
    const { data: stats, error, reload } = useDashboard('/dashboard/doctor');
    const [refreshing, setRefreshing] = useState(false);

    // Rafraîchissement automatique de la salle d'attente
    useEffect(() => {
        const timer = setInterval(reload, 60000);
        return () => clearInterval(timer);
    }, [reload]);

    const refresh = async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
    };

    const planning = stats?.planningJour;
    const waitingRoom = planning?.filter(a => STATUTS_SALLE_ATTENTE.includes(a.status));

    return (
        <div className="space-y-6">
            <PageHeader title="Mon tableau de bord" subtitle="Votre activité du mois et vos patients du jour">
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-primary hover:text-primary disabled:opacity-60"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
                    Actualiser
                </button>
            </PageHeader>
            {error && <ErrorBanner onRetry={reload} />}

            <KpiGrid>
                <KpiCard title="Consultations terminées" value={stats?.consultations ?? '—'} icon={Calendar} color="primary" hint="Ce mois" />
                <KpiCard title="Taux de présence" value={stats ? `${stats.presenceRate} %` : '—'} icon={Users} color="success" hint="Patients venus / attendus, ce mois" />
                <KpiCard title="Absences (no-shows)" value={stats?.noShows ?? '—'} icon={Activity} color="warning" hint="Ce mois" />
                <KpiCard title="Honoraires encaissés" value={stats ? formatMAD(stats.honoraires) : '—'} icon={TrendingUp} color="info" hint="Ce mois" />
            </KpiGrid>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Panel title="Planning du jour" icon={Calendar} className="lg:col-span-2">
                    {!planning ? (
                        <div className="h-40 animate-pulse rounded-xl bg-gray-50" />
                    ) : planning.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-500">Aucun rendez-vous aujourd’hui.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {planning.map(r => (
                                <li key={r.id} className="flex items-center gap-3 py-3">
                                    <span className="w-12 shrink-0 text-sm font-bold text-primary tabular-nums">{r.time}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold text-gray-900">{r.patient}</div>
                                        {r.motif && <div className="truncate text-xs text-gray-500">{r.motif}</div>}
                                    </div>
                                    <StatutRdv status={r.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
                <Panel title="Salle d’attente" icon={Users}>
                    <WaitingList items={waitingRoom} canStart />
                </Panel>
            </div>
        </div>
    );
}

function PharmacistDashboard() {
    const { data: stats, error, reload } = useDashboard('/dashboard/pharmacist');

    return (
        <div className="space-y-6">
            <PageHeader title="Tableau de bord pharmacie" subtitle="Vue d’ensemble du stock et des alertes" />
            {error && <ErrorBanner onRetry={reload} />}
            <KpiGrid>
                <KpiCard title="Produits en stock" value={stats?.produitsEnStock ?? '—'} icon={Pill} color="primary" hint="Catalogue" />
                <KpiCard title="Ruptures imminentes" value={stats?.rupturesImminentes ?? '—'} icon={Bell} color="danger" hint="Sous le seuil d’alerte" />
                <KpiCard title="Péremptions proches" value={stats?.peremptionsProches ?? '—'} icon={Activity} color="warning" hint="Moins de 60 jours" />
                <KpiCard title="Dispensations" value={stats?.dispensations ?? '—'} icon={Calendar} color="success" hint="Ce mois" />
            </KpiGrid>
            <QuickLinks links={[
                { to: '/pharmacy/dispensation', label: 'Ordonnances à délivrer', icon: Pill },
                { to: '/pharmacy/alerts', label: 'Alertes de stock', icon: Bell },
            ]} />
        </div>
    );
}

function LaboratoryDashboard() {
    const { data: stats, error, reload } = useDashboard('/dashboard/lab_technician');

    return (
        <div className="space-y-6">
            <PageHeader title="Tableau de bord laboratoire" subtitle="Prélèvements et analyses" />
            {error && <ErrorBanner onRetry={reload} />}
            <KpiGrid>
                <KpiCard title="À prélever" value={stats?.enAttente ?? '—'} icon={Clock} color="warning" hint="En attente de prélèvement" />
                <KpiCard title="Prélevés, à traiter" value={stats?.preleve ?? '—'} icon={Droplet} color="info" hint="Prêts pour le labo" />
                <KpiCard title="En cours d’analyse" value={stats?.enCours ?? '—'} icon={Activity} color="primary" hint="En traitement" />
                <KpiCard title="Terminés aujourd’hui" value={stats?.termineAujourdhui ?? '—'} icon={Microscope} color="success" hint="Aujourd’hui" />
            </KpiGrid>
            <QuickLinks links={[{ to: '/laboratory', label: 'Demandes d’examens et résultats', icon: Microscope }]} />
        </div>
    );
}

function QuickLinks({ links }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {links.map(({ to, label, icon }) => {
                const Icon = icon;
                return (
                <Link
                    key={to}
                    to={to}
                    className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
                >
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary-light text-primary"><Icon size={20} aria-hidden="true" /></span>
                    <span className="flex-1 font-semibold text-gray-900">{label}</span>
                    <ArrowRight size={18} className="text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
                );
            })}
        </div>
    );
}

function KpiCard({ title, value, icon, color, hint }) {
    const Icon = icon;
    const colors = {
        primary: { bg: 'bg-primary/10', text: 'text-primary' },
        info: { bg: 'bg-info/10', text: 'text-info' },
        success: { bg: 'bg-success/10', text: 'text-success' },
        danger: { bg: 'bg-danger/10', text: 'text-danger' },
        warning: { bg: 'bg-warning/10', text: 'text-warning' },
    };
    const c = colors[color] || colors.primary;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className={`w-11 h-11 shrink-0 rounded-xl ${c.bg} ${c.text} flex items-center justify-center`}>
                    <Icon size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm text-gray-600 font-medium">{title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-0.5 break-words">{value}</p>
                    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
                </div>
            </div>
        </div>
    );
}

function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [period, setPeriod] = useState('mois'); // jour, mois, annee
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(() => {
        api.get(`/dashboard/admin?period=${period}`)
            .then(r => { setStats(r.data); setError(false); })
            .catch(e => { console.error(e); setError(true); })
            .finally(() => setLoading(false));
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const changePeriod = (id) => {
        if (id === period) return;
        setLoading(true);
        setPeriod(id);
    };
    const retry = () => {
        setLoading(true);
        load();
    };

    const periodes = [
        { id: 'jour', label: 'Aujourd’hui' },
        { id: 'mois', label: 'Ce mois' },
        { id: 'annee', label: 'Cette année' },
    ];
    const revenus = [
        { label: 'Consultations', value: stats?.consultTotal, icon: Stethoscope },
        { label: 'Examens de laboratoire', value: stats?.examTotal, icon: Microscope },
        { label: 'Consultations pré-opératoires', value: stats?.hospitalizationTotal, icon: BedDouble },
        { label: 'Pharmacie', value: stats?.pharmacyTotal, icon: Pill },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="Tableau de bord direction" subtitle="Supervision financière de la clinique">
                <div role="group" aria-label="Période" className="flex gap-1 rounded-xl bg-gray-200/60 p-1">
                    {periodes.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => changePeriod(p.id)}
                            aria-pressed={period === p.id}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 ${period === p.id ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </PageHeader>

            {error && <ErrorBanner onRetry={retry} />}

            {loading ? (
                <LoadingScreen message="Chargement des données du tableau de bord..." />
            ) : stats && (
                <>
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                        <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-6 text-white shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-white/15 p-3"><TrendingUp size={24} aria-hidden="true" /></div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white/80">Chiffre d’affaires global</p>
                                    <p className="mt-1 text-3xl font-bold break-words">{formatMAD(stats.globalTotal || 0)}</p>
                                </div>
                            </div>
                            <p className="mt-4 inline-block rounded-lg bg-black/15 px-2.5 py-1.5 text-xs text-white/90">
                                Période : {periodes.find(p => p.id === period)?.label}
                            </p>
                            <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-4 text-sm">
                                <span className="text-white/80">Médecins actifs</span>
                                <span className="font-bold">{stats.doctors?.length || 0}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
                            {revenus.map(({ label, value, icon }) => {
                                const Icon = icon;
                                return (
                                <div key={label} className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary"><Icon size={22} aria-hidden="true" /></div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-600">{label}</p>
                                        <p className="text-2xl font-bold text-gray-900 break-words">{formatMAD(value || 0)}</p>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>

                    <ActivityTable
                        title="Activité et revenus par médecin"
                        empty="Aucune activité médicale enregistrée sur cette période."
                        rows={stats.doctors}
                        columns={['Médecin', 'Spécialité', 'Patients vus', 'Chiffre d’affaires']}
                    />
                    <ActivityTable
                        title="Activité et revenus par pharmacien"
                        empty="Aucune activité pharmaceutique enregistrée sur cette période."
                        rows={stats.pharmacists}
                        columns={['Pharmacien', 'Service', 'Ordonnances délivrées', 'Chiffre d’affaires']}
                    />
                </>
            )}
        </div>
    );
}

function ActivityTable({ title, empty, rows, columns }) {
    return (
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 px-6 py-4 font-semibold text-gray-900">{title}</h2>
            {!rows?.length ? (
                <p className="p-8 text-center text-gray-500">{empty}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left font-medium">{columns[0]}</th>
                                <th scope="col" className="px-6 py-3 text-left font-medium">{columns[1]}</th>
                                <th scope="col" className="px-6 py-3 text-center font-medium">{columns[2]}</th>
                                <th scope="col" className="px-6 py-3 text-right font-medium">{columns[3]}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-gray-50">
                                    <td className="px-6 py-4 font-semibold text-gray-900">{r.titre} {r.nom} {r.prenom}</td>
                                    <td className="px-6 py-4">
                                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{r.specialite}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-gray-900 tabular-nums">{r.patients}</td>
                                    <td className="px-6 py-4 text-right font-bold text-primary tabular-nums">{formatMAD(r.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
