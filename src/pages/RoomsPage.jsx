import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { Bed, Plus, X, Trash2 } from 'lucide-react';
import LoadingScreen from '../components/LoadingScreen';

const TYPES = ['suite', 'privee', 'double', 'commune', 'urgences', 'usi'];
const TYPE_LABELS = {
    suite: 'Suite', privee: 'Privée', double: 'Double',
    commune: 'Commune', urgences: 'Urgences', usi: 'USI',
};

// 'val' = statut renvoyé par l'API (formatRoom, server/routes/rooms.js : en anglais)
// 'api' = valeur attendue par PUT /rooms/:id/status (en français)
// 'maintenance' couvre hors_service et nettoyage ; 'reserved' n'est pas modifiable ici
const STATUTS = [
    { val: 'available', api: 'disponible', label: 'Disponible' },
    { val: 'occupied', api: 'occupee', label: 'Occupée' },
    { val: 'maintenance', api: 'hors_service', label: 'Maintenance' },
    { val: 'reserved', api: null, label: 'Réservée' },
];

const STCOL = {
    'available': { bg: "#ECFDF5", color: "#065F46", dot: "#10B981" },
    'occupied': { bg: "#EFF6FF", color: "#1E40AF", dot: "#3B82F6" },
    'maintenance': { bg: "#FEF3C7", color: "#92400E", dot: "#F59E0B" },
    'reserved': { bg: "#F5F3FF", color: "#5B21B6", dot: "#8B5CF6" },
};

function QrIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3M17 14v3h3M14 20h3" />
        </svg>
    );
}

function StatCard({ icon, label, value, color }) {
    return (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #F1F5F9", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 110 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div>
                <p style={{ color: "#94A3B8", fontSize: 10, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: ".8px" }}>{label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color, margin: "2px 0 0" }}>{value}</p>
            </div>
        </div>
    );
}

function QrModal({ data, onClose }) {
    const imgRef = useRef(null);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=190x190&color=1E1B4B&bgcolor=ffffff&data=${encodeURIComponent(data.text)}`;

    function handleDownload() {
        const link = document.createElement("a");
        link.download = `qr-${data.id}.png`;
        link.href = qrUrl;
        link.target = "_blank";
        link.click();
    }

    return (
        <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(15,15,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, borderRadius: 12 }}
        >
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: "26px 24px", width: 300, textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                    <div style={{ textAlign: "left" }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", margin: 0 }}>QR Code</p>
                        <p style={{ fontSize: 12, color: "#64748B", margin: "3px 0 0" }}>{data.label}</p>
                    </div>
                    <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 30, height: 30, fontSize: 18, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>×</button>
                </div>

                {/* QR image */}
                <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220 }}>
                    <img ref={imgRef} src={qrUrl} alt="QR Code" width={190} height={190} style={{ borderRadius: 8 }} />
                </div>

                {/* Data preview */}
                <div style={{ background: "#EEF2FF", borderRadius: 8, padding: "8px 12px", marginBottom: 14, textAlign: "left" }}>
                    <p style={{ fontSize: 10, color: "#4F46E5", fontWeight: 600, margin: 0, wordBreak: "break-all", lineHeight: 1.5 }}>{data.text}</p>
                </div>

                <button onClick={handleDownload} style={{ width: "100%", background: "#4F46E5", color: "#fff", border: "none", borderRadius: 10, padding: 10, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    ⬇ Télécharger PNG
                </button>
            </div>
        </div>
    );
}

export default function RoomsPage() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    
    // Droits alignés sur server/routes/rooms.js : création / suppression → secretary ;
    // changement de statut → secretary, nurse. L'admin consulte seulement.
    const role = useAuthStore(s => s.user?.role);
    const canManageRooms = role === 'secretary';
    const canChangeStatus = role === 'secretary' || role === 'nurse';

    // UI state
    const [filter, setFilter] = useState("Toutes");
    const [selId, setSelId] = useState(null);
    const [qrModal, setQrModal] = useState(null);

    // Formulaire nouvelle chambre
    const [form, setForm] = useState({
        numero: '', typeChambre: 'privee', nbLits: 1, tarifTtc: '',
    });
    const [saving, setSaving] = useState(false);

    const fetchRooms = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/rooms');
            setRooms(data);
        } catch {
            toast.error('Impossible de charger les chambres');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRooms(); }, [fetchRooms]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.numero.trim()) return toast.error('Le numéro de chambre est requis');
        setSaving(true);
        try {
            await api.post('/rooms', {
                numero: form.numero.trim(),
                typeChambre: form.typeChambre,
                nbLits: parseInt(form.nbLits) || 1,
                tarifTtc: form.tarifTtc ? parseFloat(form.tarifTtc) : null,
            });
            toast.success(`Chambre "${form.numero}" créée avec succès`);
            setShowModal(false);
            setForm({ numero: '', typeChambre: 'privee', nbLits: 1, tarifTtc: '' });
            fetchRooms();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la création');
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (roomId, newStatut, e) => {
        if(e) e.stopPropagation();
        try {
            await api.put(`/rooms/${roomId}/status`, { statut: newStatut });
            setRooms(prev => prev.map(r => r.id === roomId
                ? { ...r, statusFr: STATUTS.find(s => s.api === newStatut)?.label, status: STATUTS.find(s => s.api === newStatut)?.val || r.status }
                : r
            ));
            toast.success('Statut mis à jour');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur mise à jour statut');
        }
    };

    const handleDelete = async (room, e) => {
        if(e) e.stopPropagation();
        if (!confirm(`Supprimer la chambre "${room.number}" ?`)) return;
        try {
            await api.delete(`/rooms/${room.id}`);
            toast.success(`Chambre "${room.number}" supprimée`);
            fetchRooms();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Impossible de supprimer');
        }
    };

    function openQr(id, label, text, e) {
        if(e) e.stopPropagation();
        setQrModal({ id, label, text });
    }

    const dispo = rooms.filter(c => c.status === "available").length;
    const occ = rooms.filter(c => c.status === "occupied").length;
    const maint = rooms.filter(c => c.status === "maintenance").length;

    const filters = ["Toutes", "Disponible", "Occupée", "Maintenance"];
    const filterCount = { Disponible: dispo, Occupée: occ, Maintenance: maint };

    const filteredRooms = rooms.filter(c => {
        if (filter === "Toutes") return true;
        if (filter === "Disponible") return c.status === "available";
        if (filter === "Occupée") return c.status === "occupied";
        if (filter === "Maintenance") return c.status === "maintenance";
        return true;
    });

    const currentDate = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const capitalizedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

    return (
        <div style={{ padding: "24px 0", maxWidth: 1200, margin: "0 auto" }}>
            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1E293B" }}>Chambres</h1>
                    <p style={{ margin: "3px 0 0", color: "#64748B", fontSize: 13 }}>{capitalizedDate}</p>
                </div>
                {canManageRooms && <button onClick={() => setShowModal(true)} style={{ background: "#4F46E5", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>+ Nouvelle chambre</button>}
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                <StatCard icon="🛏" label="Total" value={rooms.length} color="#4F46E5" />
                <StatCard icon="✅" label="Disponibles" value={dispo} color="#10B981" />
                <StatCard icon="🔵" label="Occupées" value={occ} color="#3B82F6" />
                <StatCard icon="⚠️" label="Maintenance" value={maint} color="#F59E0B" />
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
                {filters.map(f => {
                    const active = filter === f;
                    const count = filterCount[f];
                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: "7px 14px", borderRadius: 20,
                                border: active ? "none" : "1px solid #E2E8F0",
                                background: active ? "#4F46E5" : "#fff",
                                color: active ? "#fff" : "#64748B",
                                fontWeight: active ? 600 : 400,
                                fontSize: 13, cursor: "pointer",
                            }}
                        >
                            {f}
                            {count != null && (
                                <span style={{ marginLeft: 5, background: active ? "rgba(255,255,255,.25)" : "#F1F5F9", borderRadius: 99, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Grid */}
            {loading ? (
                <div className="py-12"><LoadingScreen message="Chargement des chambres..." /></div>
            ) : filteredRooms.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94A3B8', padding: '3rem', background: '#fff', borderRadius: 13, border: "1px solid #E2E8F0" }}>Aucune chambre trouvée.</div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 13 }}>
                    {filteredRooms.map(c => {
                        const st = STCOL[c.status] || STCOL['available'];
                        const sel = selId === c.id;
                        const txt = `CLINIQUE HÉLIA | Chambre ${c.number} | ID:${c.id} | Type:${TYPE_LABELS[c.type]}`;
                        const toggle = () => setSelId(sel ? null : c.id);
                        
                        const labelStatut = STATUTS.find(s => s.val === c.status)?.label || 'Inconnu';

                        return (
                            <div key={c.id} style={{ background: "#fff", borderRadius: 13, border: sel ? "2px solid #4F46E5" : "1px solid #E2E8F0", padding: 16 }}>
                                {/* Top row */}
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                                    <div onClick={toggle} style={{ cursor: "pointer" }}>
                                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#1E293B" }}>Chambre {c.number}</p>
                                        <p style={{ margin: "2px 0 0", color: "#94A3B8", fontSize: 11 }}>{TYPE_LABELS[c.type]}</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <button
                                            onClick={(e) => openQr(c.id, c.number, txt, e)}
                                            title="QR Code"
                                            style={{ background: "#EEF2FF", border: "none", borderRadius: 7, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "#4F46E5", cursor: "pointer" }}
                                        >
                                            <QrIcon />
                                        </button>
                                        <span
                                            onClick={toggle}
                                            style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600, borderRadius: 20, padding: "3px 8px", display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}
                                        >
                                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
                                            {labelStatut}
                                        </span>
                                    </div>
                                </div>

                                {/* Content */}
                                <div onClick={toggle} style={{ cursor: "pointer" }}>
                                    <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC", borderRadius: 9, marginBottom: 9, color: c.status === "available" ? "#CBD5E1" : "#64748B", fontSize: 12, fontWeight: c.status !== "available" ? 600 : 400 }}>
                                        {c.status === "maintenance" ? "🔧 En maintenance" : c.status === "occupied" ? "👤 Occupée" : c.status === "reserved" ? "📌 Réservée" : "Chambre libre"}
                                    </div>

                                    {/* Footer */}
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 7, borderTop: "1px solid #F1F5F9" }}>
                                        <span style={{ fontSize: 10, color: "#94A3B8" }}>Tarif : {c.price ? `${c.price} MAD` : '-'}</span>
                                        <span style={{ fontSize: 10, color: "#64748B", fontWeight: 600 }}>{c.status === 'occupied' ? c.beds : 0}/{c.beds} lit{c.beds > 1 ? "s" : ""}</span>
                                    </div>
                                </div>

                                {/* Actions (expanded) */}
                                {sel && (canChangeStatus || canManageRooms) && (
                                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E2E8F0", display: "flex", gap: 6 }}>
                                        {canChangeStatus && <>
                                        {c.status === "available" && <button onClick={(e) => handleStatusChange(c.id, 'occupee', e)} style={{ flex: 1, background: "#4F46E5", color: "#fff", border: "none", borderRadius: 7, padding: 7, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Marquer occupée</button>}
                                        {c.status === "occupied" && <button onClick={(e) => handleStatusChange(c.id, 'disponible', e)} style={{ flex: 1, background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: 7, padding: 7, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Libérer</button>}
                                        
                                        {c.status !== "maintenance" && <button onClick={(e) => handleStatusChange(c.id, 'hors_service', e)} style={{ flex: 1, background: "#FFFBEB", color: "#92400E", border: "none", borderRadius: 7, padding: 7, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Maintenance</button>}
                                        {c.status === "maintenance" && <button onClick={(e) => handleStatusChange(c.id, 'disponible', e)} style={{ flex: 1, background: "#ECFDF5", color: "#065F46", border: "none", borderRadius: 7, padding: 7, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Fin maint.</button>}
                                        </>}

                                        {canManageRooms && <button onClick={(e) => handleDelete(c, e)} style={{ background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: 7, padding: "7px 10px", fontWeight: 600, fontSize: 12, cursor: "pointer" }} title="Supprimer">
                                            <Trash2 size={14} />
                                        </button>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal création chambre */}
            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        backgroundColor: 'white', borderRadius: '20px', padding: '2rem',
                        width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-xl)',
                        position: 'relative',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', color: '#1E293B' }}>
                                <Bed size={20} style={{ color: '#4F46E5' }} /> Nouvelle chambre
                            </h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                            {/* Numéro */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: '#475569' }}>
                                    Numéro / Nom de la chambre *
                                </label>
                                <input
                                    value={form.numero}
                                    onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                                    placeholder="Ex : 101, A-12..."
                                    required
                                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #E2E8F0', borderRadius: '8px', outline: 'none' }}
                                />
                            </div>

                            {/* Type */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: '#475569' }}>
                                    Type de chambre *
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                    {TYPES.map(t => (
                                        <label key={t} style={{
                                            padding: '0.5rem', borderRadius: '8px', border: '1px solid',
                                            borderColor: form.typeChambre === t ? '#4F46E5' : '#E2E8F0',
                                            backgroundColor: form.typeChambre === t ? '#EEF2FF' : 'transparent',
                                            color: form.typeChambre === t ? '#4F46E5' : '#64748B',
                                            cursor: 'pointer', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600,
                                            transition: 'all 0.15s',
                                        }}>
                                            <input
                                                type="radio" name="type" value={t}
                                                checked={form.typeChambre === t}
                                                onChange={() => setForm(f => ({ ...f, typeChambre: t }))}
                                                style={{ display: 'none' }}
                                            />
                                            {TYPE_LABELS[t]}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Nb lits + Tarif */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: '#475569' }}>Nb de lits</label>
                                    <input
                                        type="number" min="1" max="10"
                                        value={form.nbLits}
                                        onChange={e => setForm(f => ({ ...f, nbLits: e.target.value }))}
                                        style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #E2E8F0', borderRadius: '8px', outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: '#475569' }}>Tarif (MAD/nuit)</label>
                                    <input
                                        type="number" min="0" step="0.01"
                                        value={form.tarifTtc}
                                        onChange={e => setForm(f => ({ ...f, tarifTtc: e.target.value }))}
                                        placeholder="Optionnel"
                                        style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #E2E8F0', borderRadius: '8px', outline: 'none' }}
                                    />
                                </div>
                            </div>

                            {/* Boutons */}
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem' }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}>
                                    Annuler
                                </button>
                                <button type="submit" disabled={saving} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: '#4F46E5', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {saving ? '⏳ Création...' : <><Plus size={16} /> Créer</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* QR Modal */}
            {qrModal && <QrModal data={qrModal} onClose={() => setQrModal(null)} />}
        </div>
    );
}
