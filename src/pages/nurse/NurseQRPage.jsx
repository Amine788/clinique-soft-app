import { useState, useRef, useCallback, useEffect, createElement } from "react";
import api from "../../api/axios";
import {
    Camera, TriangleAlert, LoaderCircle, Folder, IdCard, Droplet, CalendarDays, HeartPulse, Cake, Phone, Mail,
    House, ShieldCheck, CircleCheck, Activity, Thermometer, Scale, Wind, Syringe, Check, ScanLine, ClipboardList, X
} from "lucide-react";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const initiales = (n = "") => n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
const PALETTE = ["#2563eb", "#0891b2", "#7c3aed", "#d97706", "#dc2626"];
const avatarBg = (n = "") => PALETTE[n.charCodeAt(0) % PALETTE.length];

const BLOOD_COLOR = {
    "A+": "#ef4444", "A-": "#f97316",
    "B+": "#3b82f6", "B-": "#6366f1",
    "AB+": "#8b5cf6", "AB-": "#ec4899",
    "O+": "#10b981", "O-": "#14b8a6",
};

const STATUT_MAP = {
    arrive: { label: "Arrivé", color: "#2563eb", bg: "#eff6ff" },
    pret: { label: "Prêt", color: "#059669", bg: "#f0fdf4" },
    planifie: { label: "Planifié", color: "#d97706", bg: "#fffbeb" },
    confirme: { label: "Confirmé", color: "#7c3aed", bg: "#f5f3ff" },
    en_consultation: { label: "En consultation", color: "#0891b2", bg: "#f0f9ff" },
};

/* ─── QR Scanner via caméra ─────────────────────────────────────────────── */
function QrCameraScanner({ onResult, onClose }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const animRef = useRef(null);
    const [ready, setCameraReady] = useState(false);
    const [error, setError] = useState(null);
    const [jsQRLoaded, setJsQRLoaded] = useState(!!window.jsQR);

    // Charger jsQR dynamiquement
    useEffect(() => {
        if (window.jsQR) return;
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
        s.onload = () => setJsQRLoaded(true);
        s.onerror = () => setError("Impossible de charger le scanner QR.");
        document.head.appendChild(s);
    }, []);

    // Démarrer la caméra
    useEffect(() => {
        if (!jsQRLoaded) return;
        navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                    setCameraReady(true);
                }
            })
            .catch(err => {
                console.error(err);
                setError("Caméra inaccessible. Vérifiez les permissions ou utilisez la saisie manuelle.");
            });
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            cancelAnimationFrame(animRef.current);
        };
    }, [jsQRLoaded]);

    // Boucle de lecture QR
    useEffect(() => {
        if (!ready || !jsQRLoaded) return;
        const tick = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
                animRef.current = requestAnimationFrame(tick);
                return;
            }
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR?.(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            if (code?.data) {
                onResult(code.data);
                return; // stop
            }
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
    }, [ready, jsQRLoaded, onResult]);

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,28,.92)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
            <div style={{ background: "#0d1b2a", borderRadius: 20, overflow: "hidden", width: "90%", maxWidth: 420, boxShadow: "0 32px 64px rgba(0,0,0,.6)" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.08)", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}><Camera size={16} aria-hidden="true" /></div>
                        <div>
                            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14 }}>Scanner QR Patient</div>
                            <div style={{ color: "#64748b", fontSize: 11 }}>Pointez la caméra vers le QR code</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 8, width: 32, height: 32, color: "#94a3b8", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Fermer"><X size={16} aria-hidden="true" /></button>
                </div>

                {/* Vidéo */}
                <div style={{ position: "relative", background: "#000", minHeight: 280 }}>
                    {error ? (
                        <div style={{ padding: 24, textAlign: "center", color: "#f87171", fontSize: 13 }}>
                            <TriangleAlert size={28} style={{ display: "block", margin: "0 auto 8px" }} aria-hidden="true" />
                            {error}
                        </div>
                    ) : (
                        <>
                            <video ref={videoRef} style={{ width: "100%", display: "block" }} playsInline muted />
                            <canvas ref={canvasRef} style={{ display: "none" }} />
                            {/* Viseur animé */}
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                                <div style={{ width: 200, height: 200, position: "relative" }}>
                                    {["tl", "tr", "bl", "br"].map(c => (
                                        <div key={c} style={{
                                            position: "absolute", width: 28, height: 28,
                                            top: c[0] === "t" ? 0 : undefined, bottom: c[0] === "b" ? 0 : undefined,
                                            left: c[1] === "l" ? 0 : undefined, right: c[1] === "r" ? 0 : undefined,
                                            borderTop: c[0] === "t" ? "3px solid #7FAAE6" : undefined,
                                            borderBottom: c[0] === "b" ? "3px solid #7FAAE6" : undefined,
                                            borderLeft: c[1] === "l" ? "3px solid #7FAAE6" : undefined,
                                            borderRight: c[1] === "r" ? "3px solid #7FAAE6" : undefined,
                                        }} />
                                    ))}
                                    <style>{`@keyframes scanAnim{0%{top:8%}50%{top:82%}100%{top:8%}}`}</style>
                                    <div style={{ position: "absolute", left: "8%", right: "8%", height: 2, background: "linear-gradient(90deg,transparent,#7FAAE6,transparent)", animation: "scanAnim 1.8s ease-in-out infinite" }} />
                                </div>
                            </div>
                            {!ready && (
                                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                                    <LoaderCircle size={16} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} aria-hidden="true" />
                                    Initialisation de la caméra…
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ padding: "12px 18px 18px", color: "#64748b", fontSize: 12, textAlign: "center" }}>
                    Le QR code sera détecté automatiquement
                </div>
            </div>
        </div>
    );
}

/* ─── Fiche Patient Détaillée ──────────────────────────────────────────────── */
function PatientDetailCard({ patient, onClose, onSaveVitals }) {
    const [vitals, setVitals] = useState(patient.rdvAujourdhui?.vitals || { ta: "", pouls: "", temp: "", poids: "", spo2: "" });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(!!patient.rdvAujourdhui?.vitals);
    const [activeTab, setActiveTab] = useState("info");

    const statutInfo = patient.rdvAujourdhui ? STATUT_MAP[patient.rdvAujourdhui.statut] || { label: patient.rdvAujourdhui.statut, color: "#64748b", bg: "#f9fafb" } : null;

    const handleSave = async () => {
        if (!patient.rdvAujourdhui) return;
        setSaving(true);
        try {
            await api.post('/nurse/vitals', { rdvId: patient.rdvAujourdhui.id, vitals });
            setSaved(true);
            if (onSaveVitals) onSaveVitals();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const tabs = [
        { id: "info", label: "Identité" },
        { id: "medical", label: "Médical" },
        { id: "vitals", label: "Constantes" },
    ];

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 32px 64px rgba(0,0,0,.4)", display: "flex", flexDirection: "column" }}>

                {/* ── Header patient ── */}
                <div style={{ background: "#0f172a", padding: "20px 20px 16px", borderRadius: "20px 20px 0 0", position: "relative" }}>
                    <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.1)", border: "none", borderRadius: 8, width: 32, height: 32, color: "#94a3b8", fontSize: 16, cursor: "pointer" }} aria-label="Fermer"><X size={16} aria-hidden="true" /></button>

                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 58, height: 58, borderRadius: "50%", background: avatarBg(patient.nom) + "30", border: `2px solid ${avatarBg(patient.nom)}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: avatarBg(patient.nom), flexShrink: 0 }}>
                            {initiales(patient.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 18, marginBottom: 2 }}>{patient.prenom} {patient.nom}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                                <span style={{ background: "rgba(255,255,255,.1)", color: "#cbd5e1", fontSize: 11, padding: "2px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}><Folder size={11} aria-hidden="true" />{patient.id}</span>
                                <span style={{ background: "rgba(255,255,255,.1)", color: "#cbd5e1", fontSize: 11, padding: "2px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}><IdCard size={11} aria-hidden="true" />{patient.cin}</span>
                                {patient.bloodType && (
                                    <span style={{ background: (BLOOD_COLOR[patient.bloodType] || "#64748b") + "30", color: BLOOD_COLOR[patient.bloodType] || "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                        <Droplet size={11} aria-hidden="true" />{patient.bloodType}
                                    </span>
                                )}
                                {patient.sexe && (
                                    <span style={{ background: "rgba(255,255,255,.1)", color: "#cbd5e1", fontSize: 11, padding: "2px 8px", borderRadius: 6 }}>
                                        {patient.sexe === "M" ? "Masculin" : "Féminin"}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RDV du jour */}
                    {patient.rdvAujourdhui && (
                        <div style={{ marginTop: 14, background: "rgba(255,255,255,.06)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                            <CalendarDays size={18} color="#94a3b8" aria-hidden="true" />
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13 }}>{patient.rdvAujourdhui.medecin || "Médecin non assigné"}</span>
                                    <span style={{ background: statutInfo?.bg, color: statutInfo?.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{statutInfo?.label}</span>
                                </div>
                                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>
                                    {patient.rdvAujourdhui.heure} — {patient.rdvAujourdhui.motif || "Consultation"}
                                </div>
                            </div>
                        </div>
                    )}

                    {!patient.rdvAujourdhui && (
                        <div style={{ marginTop: 12, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
                            <TriangleAlert size={13} aria-hidden="true" />Aucun rendez-vous aujourd'hui — Consultation libre
                        </div>
                    )}

                    {/* Alertes CIN */}
                    {patient.cinExpiree && (
                        <div style={{ marginTop: 8, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 6 }}>
                            <TriangleAlert size={13} aria-hidden="true" />CIN expirée — Vérification requise
                        </div>
                    )}
                </div>

                {/* Alertes médicales urgentes */}
                {(patient.allergies?.length > 0 || patient.chronic?.length > 0) && (
                    <div style={{ padding: "12px 16px", background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
                        {patient.allergies?.length > 0 && (
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: patient.chronic?.length > 0 ? 8 : 0 }}>
                                <TriangleAlert size={15} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                                <div>
                                    <span style={{ fontWeight: 700, color: "#c2410c", fontSize: 12 }}>ALLERGIES : </span>
                                    <span style={{ color: "#9a3412", fontSize: 12 }}>{patient.allergies.join(", ")}</span>
                                </div>
                            </div>
                        )}
                        {patient.chronic?.length > 0 && (
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                <HeartPulse size={15} color="#92400e" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                                <div>
                                    <span style={{ fontWeight: 700, color: "#92400e", fontSize: 12 }}>CHRONIQUES : </span>
                                    <span style={{ color: "#78350f", fontSize: 12 }}>{patient.chronic.join(", ")}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tabs ── */}
                <div style={{ display: "flex", borderBottom: "1px solid #f1f5f9", padding: "0 16px", background: "#fafafa" }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                            padding: "12px 16px", background: "none", border: "none", cursor: "pointer",
                            fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
                            color: activeTab === t.id ? "#004AAD" : "#64748b",
                            borderBottom: activeTab === t.id ? "2px solid #004AAD" : "2px solid transparent",
                            marginBottom: -1, transition: "all .15s"
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Contenu tabs ── */}
                <div style={{ padding: 16, flex: 1 }}>

                    {/* ── TAB: Identité ── */}
                    {activeTab === "info" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {[
                                { icon: Cake, label: "Date de naissance", val: patient.dateNaissance ? `${new Date(patient.dateNaissance).toLocaleDateString("fr-FR")} (${patient.age} ans)` : "—" },
                                { icon: Phone, label: "Téléphone", val: patient.phone || "—" },
                                { icon: Mail, label: "Email", val: patient.email || "—" },
                                { icon: House, label: "Adresse", val: [patient.address, patient.ville].filter(Boolean).join(", ") || "—" },
                                { icon: ShieldCheck, label: "Assurance", val: patient.insurance || "Non renseignée" },
                            ].map(({ icon, label, val }) => (
                                <div key={label} style={{ display: "flex", gap: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, alignItems: "flex-start" }}>
                                    {createElement(icon, { size: 16, color: "#94a3b8", style: { flexShrink: 0, marginTop: 2 }, "aria-hidden": true })}
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginTop: 1 }}>{val}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── TAB: Médical ── */}
                    {activeTab === "medical" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {/* Groupe sanguin */}
                            <div style={{ padding: "12px 14px", background: patient.bloodType ? (BLOOD_COLOR[patient.bloodType] + "10") : "#f8fafc", border: `1px solid ${patient.bloodType ? (BLOOD_COLOR[patient.bloodType] + "30") : "#e2e8f0"}`, borderRadius: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Groupe sanguin</div>
                                {patient.bloodType
                                    ? <span style={{ fontSize: 26, fontWeight: 700, color: BLOOD_COLOR[patient.bloodType] || "#0f172a" }}>{patient.bloodType}</span>
                                    : <span style={{ fontSize: 13, color: "#94a3b8" }}>Non renseigné</span>
                                }
                            </div>

                            {/* Allergies */}
                            <div style={{ padding: "12px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><TriangleAlert size={12} aria-hidden="true" />Allergies ({patient.allergies?.length || 0})</div>
                                {patient.allergies?.length > 0
                                    ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {patient.allergies.map((a, i) => (
                                            <span key={i} style={{ background: "#fecaca", color: "#991b1b", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>{a}</span>
                                        ))}
                                    </div>
                                    : <span style={{ fontSize: 12, color: "#059669" }}>Aucune allergie connue</span>
                                }
                            </div>

                            {/* Chroniques */}
                            <div style={{ padding: "12px 14px", background: "#EEF4FC", border: "1px solid #D9E6F8", borderRadius: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#003D8F", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><HeartPulse size={12} aria-hidden="true" />Maladies chroniques ({patient.chronic?.length || 0})</div>
                                {patient.chronic?.length > 0
                                    ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {patient.chronic.map((c, i) => (
                                            <span key={i} style={{ background: "#D9E6F8", color: "#003D8F", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>{c}</span>
                                        ))}
                                    </div>
                                    : <span style={{ fontSize: 12, color: "#059669" }}>Aucune maladie chronique</span>
                                }
                            </div>
                        </div>
                    )}

                    {/* ── TAB: Constantes ── */}
                    {activeTab === "vitals" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {!patient.rdvAujourdhui && (
                                <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 12, color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}>
                                    <TriangleAlert size={13} style={{ flexShrink: 0 }} aria-hidden="true" />Pas de RDV aujourd'hui — les constantes ne peuvent pas être liées à un rendez-vous.
                                </div>
                            )}

                            {saved && (
                                <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, fontSize: 12, color: "#065f46", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                                    <CircleCheck size={14} aria-hidden="true" />Constantes enregistrées — Patient marqué "Prêt"
                                </div>
                            )}

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                {[
                                    { key: "ta", label: "Tension artérielle", ph: "120/80", unit: "mmHg", icon: Activity },
                                    { key: "pouls", label: "Pouls", ph: "72", unit: "bpm", icon: HeartPulse },
                                    { key: "temp", label: "Température", ph: "37.2", unit: "°C", icon: Thermometer },
                                    { key: "poids", label: "Poids", ph: "75", unit: "kg", icon: Scale },
                                    { key: "spo2", label: "Saturation O₂", ph: "98", unit: "%", icon: Wind },
                                ].map(f => (
                                    <div key={f.key}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
                                            <f.icon size={12} aria-hidden="true" />{f.label}
                                        </div>
                                        <div style={{ display: "flex" }}>
                                            <input
                                                type="text" placeholder={f.ph}
                                                value={vitals[f.key]}
                                                onChange={e => setVitals(v => ({ ...v, [f.key]: e.target.value }))}
                                                disabled={saved}
                                                style={{ flex: 1, border: "1px solid #e5e7eb", borderRight: "none", borderRadius: "8px 0 0 8px", padding: "8px 10px", fontSize: 13, outline: "none", background: saved ? "#f9fafb" : "#fff" }}
                                            />
                                            <span style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "0 8px 8px 0", padding: "0 8px", fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center" }}>{f.unit}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {!saved && patient.rdvAujourdhui && (
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", border: "none", borderRadius: 10, background: saving ? "#e5e7eb" : "#004AAD", color: saving ? "#9ca3af" : "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", transition: "all .15s" }}
                                >
                                    {saving ? "Enregistrement…" : "Enregistrer les constantes"}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={onClose} style={{ padding: "9px 20px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Page principale ──────────────────────────────────────────────────────── */
export default function NurseQRPage() {
    const [scanOpen, setScanOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [patient, setPatient] = useState(null);
    const [error, setError] = useState(null);
    const [manualId, setManualId] = useState("");
    const [queue, setQueue] = useState([]);
    const [history, setHistory] = useState([]);

    /* Charger la file d'attente */
    const fetchQueue = useCallback(async () => {
        try {
            const res = await api.get("/nurse/queue");
            setQueue(res.data);
        } catch { /* facultatif : l'échec est sans conséquence ici */ }
    }, []);

    useEffect(() => {
        fetchQueue();
        const iv = setInterval(fetchQueue, 30000);
        return () => clearInterval(iv);
    }, [fetchQueue]);

    /* Extraire le numéro de dossier depuis l'URL du QR */
    const extractDossierId = (raw) => {
        try {
            const url = new URL(raw);
            const id = url.searchParams.get("id");
            if (id) return id;
        } catch { /* facultatif : l'échec est sans conséquence ici */ }
        // Fallback: si c'est directement un PAT-XXXX-XXXXX
        if (/^PAT-\d{4}-\d+$/i.test(raw.trim())) return raw.trim();
        return null;
    };

    /* Lookup patient par numéro de dossier */
    const loadPatient = useCallback(async (raw) => {
        setScanOpen(false);
        setLoading(true);
        setError(null);
        setPatient(null);

        const dossierId = extractDossierId(raw);
        if (!dossierId) {
            setError(`QR non reconnu : "${raw.slice(0, 60)}". Attendu : URL contenant ?id=PAT-XXXX-XXXXX`);
            setLoading(false);
            return;
        }

        try {
            const res = await api.get(`/nurse/patient-by-dossier/${encodeURIComponent(dossierId)}`);
            setPatient(res.data);
            setHistory(prev => [{ id: Date.now(), dossierId, nom: `${res.data.prenom} ${res.data.nom}`, heure: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) }, ...prev.slice(0, 9)]);
        } catch (err) {
            const msg = err.response?.data?.error || "Patient non trouvé";
            setError(`${msg} (Dossier : ${dossierId})`);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleManual = () => {
        const v = manualId.trim();
        if (!v) return;
        loadPatient(v);
        setManualId("");
    };

    const arrives = queue.filter(p => p.statut === "arrive");
    const prets = queue.filter(p => p.statut === "pret");

    return (
        <div style={{ minHeight: "100vh" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: "#EEF4FC", color: "#004AAD", display: "flex", alignItems: "center", justifyContent: "center" }}><Syringe size={20} aria-hidden="true" /></div>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Infirmerie — Scanner QR Patient</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />
                    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>{arrives.length} en attente</span>
                </div>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]" style={{ gap: 16, alignItems: "start" }}>

                {/* ── Colonne gauche ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* Zone scanner */}
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Scanner le QR Code Patient</div>

                        {/* Bouton Scanner */}
                        <button
                            onClick={() => { setScanOpen(true); setError(null); setPatient(null); }}
                            disabled={loading}
                            style={{
                                width: "100%", padding: "14px", border: "none", borderRadius: 12,
                                background: loading ? "#e5e7eb" : "#004AAD",
                                color: loading ? "#9ca3af" : "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                boxShadow: loading ? "none" : "0 6px 14px -8px rgb(0 74 173 / .6)", transition: "all .2s"
                            }}
                        >
                            <Camera size={20} aria-hidden="true" />
                            {loading ? "Chargement des données…" : "Ouvrir la Caméra & Scanner"}
                        </button>

                        {/* Séparateur */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
                            <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
                            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>OU SAISIE MANUELLE</span>
                            <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
                        </div>

                        {/* Saisie manuelle */}
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                type="text"
                                placeholder="PAT-2026-00001 ou URL du QR…"
                                value={manualId}
                                onChange={e => setManualId(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleManual()}
                                style={{ flex: 1, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", fontFamily: "monospace", transition: "border-color .15s" }}
                                onFocus={e => e.target.style.borderColor = "#004AAD"}
                                onBlur={e => e.target.style.borderColor = "#e5e7eb"}
                            />
                            <button
                                onClick={handleManual}
                                disabled={!manualId.trim() || loading}
                                style={{ padding: "10px 16px", border: "none", borderRadius: 10, background: !manualId.trim() || loading ? "#e5e7eb" : "#0f172a", color: !manualId.trim() || loading ? "#9ca3af" : "#fff", fontSize: 13, fontWeight: 600, cursor: !manualId.trim() || loading ? "not-allowed" : "pointer", transition: "all .15s" }}
                            >
                                Rechercher
                            </button>
                        </div>

                        {/* Message d'erreur */}
                        {error && (
                            <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 13, color: "#dc2626" }}>
                                {error}
                            </div>
                        )}

                        {/* Loading */}
                        {loading && (
                            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#EEF4FC", border: "1px solid #D9E6F8", borderRadius: 10, fontSize: 13, color: "#004AAD" }}>
                                <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>
                                <LoaderCircle size={16} style={{ animation: "spin2 1s linear infinite", display: "inline-block" }} aria-hidden="true" />
                                Recherche du dossier patient…
                            </div>
                        )}
                    </div>

                    {/* Historique des scans */}
                    {history.length > 0 && (
                        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>Scans récents — cette session</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {history.map(h => (
                                    <button
                                        key={h.id}
                                        onClick={() => loadPatient(h.dossierId)}
                                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "all .15s" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#EEF4FC"}
                                        onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
                                    >
                                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarBg(h.nom) + "20", color: avatarBg(h.nom), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                            {initiales(h.nom)}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{h.nom}</div>
                                            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{h.dossierId}</div>
                                        </div>
                                        <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 }}>{h.heure}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Colonne droite : File d'attente ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                    {/* File arrivés */}
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>File d'attente · {arrives.length} patient(s)</div>
                        {arrives.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13 }}>Aucun patient en attente</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {arrives.map((p, i) => (
                                    <button
                                        key={p.id}
                                        onClick={() => p.patientId && loadPatient(p.patientId)}
                                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: i === 0 ? "#EEF4FC" : "#f9fafb", border: i === 0 ? "1.5px solid #D9E6F8" : "1px solid #f0f0f0", borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%", transition: "all .15s" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#EEF4FC"}
                                        onMouseLeave={e => e.currentTarget.style.background = i === 0 ? "#EEF4FC" : "#f9fafb"}
                                    >
                                        <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? "#004AAD" : "#9ca3af", width: 18, textAlign: "center", flexShrink: 0 }}>{i + 1}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</div>
                                            <div style={{ fontSize: 11, color: "#6b7280" }}>{p.rdv} · {p.motif || "Consultation"}</div>
                                        </div>
                                        <span style={{ fontSize: 17, flexShrink: 0 }}>→</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Prêts */}
                    {prets.length > 0 && (
                        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Prêts pour consultation</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {prets.map(p => (
                                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                                        <Check size={14} color="#10b981" style={{ flexShrink: 0 }} aria-hidden="true" />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.nom}</div>
                                            <div style={{ fontSize: 11, color: "#059669" }}>{p.medecin}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Légende */}
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Comment scanner ?</div>
                        {[
                            { icon: Camera, text: "Cliquez « Ouvrir la Caméra »" },
                            { icon: ScanLine, text: "Pointez vers le QR code du patient" },
                            { icon: CircleCheck, text: "La fiche s'ouvre automatiquement" },
                            { icon: ClipboardList, text: "Saisissez les constantes si besoin" },
                        ].map((s, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: i < 3 ? "1px solid #f8fafc" : "none", fontSize: 12, color: "#475569", alignItems: "center" }}>
                                <s.icon size={15} color="#94a3b8" style={{ flexShrink: 0 }} aria-hidden="true" />
                                {s.text}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal scanner caméra */}
            {scanOpen && (
                <QrCameraScanner
                    onResult={loadPatient}
                    onClose={() => setScanOpen(false)}
                />
            )}

            {/* Modal fiche patient */}
            {patient && (
                <PatientDetailCard
                    patient={patient}
                    onClose={() => setPatient(null)}
                    onSaveVitals={fetchQueue}
                />
            )}
        </div>
    );
}
