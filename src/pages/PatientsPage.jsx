import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import {
    Search, Plus, Users, AlertCircle,
    Filter, Download, ChevronRight, UserPlus,
    Calendar, Activity, ArrowUpRight, Heart, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import LoadingScreen from '../components/LoadingScreen';
import { useAuthStore } from '../store/authStore';

// ─── Stat Card ───────────────────────────────────────────────────────────────
const StatCard = ({ label, value, trend, icon, accent }) => (
    <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        cursor: 'default',
    }}
        onMouseEnter={e => {
            e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,74,173,0.10)`;
            e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
            e.currentTarget.style.transform = 'translateY(0)';
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: accent + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {React.createElement(icon, { size: 20, color: accent })}
            </div>
            {trend && (
                <span style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', fontWeight: 700, color: '#16a34a',
                    background: '#f0fdf4', padding: '4px 8px', borderRadius: '20px',
                }}>
                    <ArrowUpRight size={11} /> {trend}
                </span>
            )}
        </div>
        <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                {label}
            </p>
            <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                {value}
            </h3>
        </div>
    </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PatientsPage() {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const urlQuery = searchParams.get('q') || '';
    const [searchQuery, setSearchQuery] = useState(urlQuery);

    // Recherche lancée depuis la barre du haut alors que la page est déjà ouverte
    const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
    if (urlQuery !== lastUrlQuery) {
        setLastUrlQuery(urlQuery);
        setSearchQuery(urlQuery);
    }
    const [deletingId, setDeletingId] = useState(null);
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const canDelete = user?.role === 'secretary' || user?.role === 'admin';

    // Consultations du jour (jour de la clinique) : RDV réels du jour, hors annulés, reportés et absents
    const [consultationsJour, setConsultationsJour] = useState(null);

    const fetchPatients = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/patients');
            setPatients(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Impossible de charger les patients");
        } finally {
            setLoading(false);
        }
        const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
        api.get('/appointments', { params: { date: jour } })
            .then(({ data }) => setConsultationsJour((data || []).filter(r => !['annule', 'reporte', 'non_presente'].includes(r.status)).length))
            .catch(() => setConsultationsJour(null));
    }, []);

    useEffect(() => { fetchPatients(); }, [fetchPatients]);

    const handleDelete = async (e, patient) => {
        e.stopPropagation();
        if (!window.confirm(`Supprimer définitivement le dossier de ${patient.prenom} ${patient.nom} ?\nCette action est irréversible.`)) return;
        setDeletingId(patient.id);
        try {
            await api.delete(`/patients/${patient.numeroDossier || patient.id}`);
            setPatients(prev => prev.filter(p => p.id !== patient.id));
            toast.success(`Dossier de ${patient.prenom} ${patient.nom} supprimé`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la suppression');
        } finally {
            setDeletingId(null);
        }
    };

    const isCINExpired = (dateExp) => dateExp && new Date(dateExp) < new Date();

    const filteredPatients = patients.filter(p =>
        (p.nom + ' ' + p.prenom).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.cin?.numero || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const stats = {
        total: patients.length,
        newThisMonth: patients.filter(p => new Date(p.createdAt) > new Date(Date.now() - 30 * 86400000)).length,
        cinExpired: patients.filter(p => isCINExpired(p.cin?.dateExpiration)).length,
        activity: consultationsJour ?? '—',
    };

    if (loading) return <LoadingScreen message="Chargement du registre médical..." />;

    return (
        <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* ── Header ── */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#004AAD', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '6px' }}>
                        NextClinic · Registre Médical
                    </p>
                    <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.2 }}>
                        Dossiers Patients
                    </h1>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
                        Gérez et consultez l'ensemble des dossiers médicaux
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                        <Download size={16} /> Exporter
                    </button>
                    <button
                        onClick={() => navigate('/patients/create')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                            border: 'none', background: '#004AAD', color: '#fff',
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,74,173,0.25)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#003D8F'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#004AAD'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <UserPlus size={16} /> Nouveau Dossier
                    </button>
                </div>
            </header>

            {/* ── Stats ── */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <StatCard label="Total Patients" value={stats.total} trend="+12%" icon={Users} accent="#004AAD" />
                <StatCard label="Nouveaux (30j)" value={stats.newThisMonth} trend="+5%" icon={Calendar} accent="#2ECC71" />
                <StatCard label="CIN Expirées" value={stats.cinExpired} icon={AlertCircle} accent="#EF4444" />
                <StatCard label="Consultations Aujourd'hui" value={stats.activity} icon={Activity} accent="#F59E0B" />
            </section>

            {/* ── Table Card ── */}
            <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                overflow: 'hidden',
            }}>

                {/* Search & Filter Bar */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex', flexWrap: 'wrap', gap: '12px',
                    justifyContent: 'space-between', alignItems: 'center',
                    background: '#fafafa',
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '420px' }}>
                        <Search size={17} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Rechercher par nom, CIN..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%', paddingLeft: '42px', paddingRight: '16px',
                                height: '40px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                                border: '1px solid #e5e7eb', background: '#fff', color: '#111827',
                                outline: 'none', boxSizing: 'border-box',
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer',
                        }}>
                            <Filter size={15} /> Filtrer
                        </button>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', padding: '0 4px' }}>
                            {filteredPatients.length} résultat{filteredPatients.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f9fafb' }}>
                                {['Patient', 'N° Dossier', 'CIN', 'Contact', 'Groupe sanguin', 'Statut CIN', 'Actions'].map((h, i) => (
                                    <th key={i} style={{
                                        padding: '12px 20px', textAlign: i === 6 ? 'right' : 'left',
                                        fontSize: '11px', fontWeight: 700, color: '#9ca3af',
                                        textTransform: 'uppercase', letterSpacing: '0.07em',
                                        borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPatients.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '64px 24px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '64px', height: '64px', borderRadius: '50%',
                                                background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Users size={28} color="#d1d5db" />
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Aucun patient trouvé</p>
                                                <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Essayez une autre recherche ou créez un nouveau dossier.</p>
                                            </div>
                                            <button
                                                onClick={() => navigate('/patients/create')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    padding: '9px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                                    background: '#004AAD', color: '#fff', border: 'none', cursor: 'pointer',
                                                    marginTop: '4px',
                                                }}
                                            >
                                                <Plus size={15} /> Ajouter un patient
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredPatients.map((patient, idx) => {
                                    const initials = `${patient.prenom?.[0] || ''}${patient.nom?.[0] || ''}`.toUpperCase();
                                    const isExpired = isCINExpired(patient.cin?.dateExpiration);
                                    const colors = ['#004AAD', '#7c3aed', '#0891b2', '#059669', '#d97706'];
                                    const color = colors[idx % colors.length];

                                    return (
                                        <tr
                                            key={patient.id}
                                            onClick={() => navigate(`/patients/${patient.id}/profil`)}
                                            style={{
                                                borderBottom: '1px solid #f9fafb',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {/* Patient */}
                                            <td style={{ padding: '14px 20px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '38px', height: '38px', borderRadius: '10px',
                                                        background: color + '15', color: color,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 800, fontSize: '13px', flexShrink: 0,
                                                    }}>
                                                        {initials}
                                                    </div>
                                                    <div>
                                                        <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#111827' }}>
                                                            {patient.nom} {patient.prenom}
                                                        </p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9ca3af' }}>
                                                            {patient.sexe === 'M' ? 'Homme' : 'Femme'}
                                                            {patient.dateNaissance && ` · ${new Date().getFullYear() - new Date(patient.dateNaissance).getFullYear()} ans`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* N° Dossier */}
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{
                                                    fontSize: '12px', fontWeight: 700, color: '#004AAD',
                                                    background: '#EEF4FC', padding: '3px 8px', borderRadius: '6px',
                                                    fontFamily: 'monospace', letterSpacing: '0.05em',
                                                }}>
                                                    {patient.numeroDossier || `#${patient.id}`}
                                                </span>
                                            </td>

                                            {/* CIN */}
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', fontFamily: 'monospace' }}>
                                                    {patient.cin?.numero || patient.cinNumero || '—'}
                                                </span>
                                            </td>

                                            {/* Contact */}
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                                    {patient.telephonePrincipal || patient.phone || '—'}
                                                </span>
                                            </td>

                                            {/* Groupe sanguin */}
                                            <td style={{ padding: '14px 20px' }}>
                                                {patient.bloodType || patient.dossierMedical?.groupeSanguin ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontSize: '12px', fontWeight: 700, color: '#dc2626',
                                                        background: '#fef2f2', padding: '3px 8px', borderRadius: '6px',
                                                    }}>
                                                        <Heart size={11} />
                                                        {patient.bloodType || patient.dossierMedical?.groupeSanguin}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#d1d5db' }}>NC</span>
                                                )}
                                            </td>

                                            {/* Statut CIN */}
                                            <td style={{ padding: '14px 20px' }}>
                                                {isExpired ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        fontSize: '11px', fontWeight: 700,
                                                        color: '#dc2626', background: '#fef2f2',
                                                        padding: '4px 10px', borderRadius: '20px',
                                                    }}>
                                                        <AlertCircle size={11} /> Expirée
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        fontSize: '11px', fontWeight: 700,
                                                        color: '#16a34a', background: '#f0fdf4',
                                                        padding: '4px 10px', borderRadius: '20px',
                                                    }}>
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                                                        Valide
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    {canDelete && (
                                                        <button
                                                            onClick={e => handleDelete(e, patient)}
                                                            disabled={deletingId === patient.id}
                                                            title="Supprimer ce dossier"
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                width: '32px', height: '32px', borderRadius: '8px',
                                                                border: '1px solid #fee2e2', background: '#fff',
                                                                color: '#ef4444', cursor: 'pointer', transition: 'all 0.15s',
                                                                opacity: deletingId === patient.id ? 0.5 : 1,
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#ef4444'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fee2e2'; }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={e => { e.stopPropagation(); navigate(`/patients/${patient.id}/profil`); }}
                                                        title="Voir le dossier"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            width: '32px', height: '32px', borderRadius: '8px',
                                                            border: '1px solid #e5e7eb', background: '#fff',
                                                            color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#004AAD'; e.currentTarget.style.color = '#004AAD'; e.currentTarget.style.background = '#EEF4FC'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = '#fff'; }}
                                                    >
                                                        <ChevronRight size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: '1px solid #f3f4f6',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#fafafa',
                }}>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                        © 2026 NextClinic · Système de Gestion Médicale
                    </p>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                        Sync : {new Date().toLocaleTimeString('fr-FR')}
                    </p>
                </div>
            </div>
        </div>
    );
}
