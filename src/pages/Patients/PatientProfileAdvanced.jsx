import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ArrowLeft, Download, Shield, Activity, Calendar, FileText, Heart, User, Sparkles, Plus, Trash, Pencil,
  HeartPulse, Wind, Thermometer, Scale, Droplet, TriangleAlert, LoaderCircle, Pill, CalendarDays, X
} from 'lucide-react';
import api from "../../api/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "../../store/authStore";
import { PRISES_PAR_JOUR, nomMedicament, posologieMedicament } from "../../utils/posologie";
import EditPatientModal from "./EditPatientModal";
import DocumentsPatient from "./DocumentsPatient";

// ─── PALETTE THÈME NAVY BLUE ──────────────────────────────────────────────
const G = {
  primary: "#004AAD",
  primaryL: "#1a1a8c",
  primaryD: "#003D8F",
  accent: "#EEF4FC",
  bg: "#f8fafc",
  surface: "#ffffff",
  surfaceL: "#f1f5f9",
  border: "#e6eaf0",
  borderL: "rgba(0,74,173,0.25)",
  text: "#0f172a",
  muted: "#64748b",
  info: "#3b82f6",
  success: "#10b981",
  warn: "#f59e0b",
  danger: "#ef4444",
};

// ─── MICRO COMPONENTS ────────────────────────────────────────────────────────
function NavyDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 16px" }}>
      <div style={{ flex: 1, height: 1, background: G.border }} />
      <div style={{ width: 4, height: 4, background: G.primary, transform: "rotate(45deg)", flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, background: G.border }} />
    </div>
  );
}

function Tag({ children, color = G.primary, bg }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600,
      padding: "3px 10px", borderRadius: 20, letterSpacing: "0.02em",
      border: `0.5px solid ${color}33`, background: bg || `${color}10`, color,
    }}>{children}</span>
  );
}

function VitalCard({ label, value, unit, sub, color = G.primary, icon }) {
  const Ico = icon;
  return (
    <div style={{
      background: G.surface, border: `1px solid ${G.border}`,
      borderRadius: 14, padding: "14px 16px", position: "relative", overflow: "hidden",
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}14`, color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Ico size={16} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: G.text, lineHeight: 1 }}>
        {value || "—"}<span style={{ fontSize: 13, color: G.muted, marginLeft: 4, fontWeight: 400 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: G.muted, marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 700 }}>{sub}</div>}
    </div>
  );
}

function ScoreRing({ score, size = 100 }) {
  const [anim, setAnim] = useState(0);
  const r = 40, circ = 2 * Math.PI * r;
  useEffect(() => { setAnim(score); }, [score]);
  const dash = (anim / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke={`${G.primary}10`} strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={G.primary}
        strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: "stroke-dasharray 1.5s ease-out", transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      <text x="50" y="48" textAnchor="middle" fontSize="22" fontWeight="900" fill={G.primary}>{score}</text>
      <text x="50" y="62" textAnchor="middle" fontSize="9" fill={G.muted} fontWeight="700">SCORE</text>
    </svg>
  );
}

// ─── badge generator ─────────────────────────────────────────────────────────
// Carte patient : identité à gauche, QR code du dossier à droite (même lien que le QR imprimé à la création)
function drawPatientBadge(canvas, patient, qrCanvas) {
  const ctx = canvas.getContext("2d");
  const W = 720, H = 440;
  const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
  ctx.clearRect(0, 0, W, H);

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };

  // Fond et bordure
  roundRect(0.5, 0.5, W - 1, H - 1, 28); ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.strokeStyle = "#dbe3ee"; ctx.lineWidth = 1; ctx.stroke();

  // Bandeau
  ctx.save(); roundRect(0.5, 0.5, W - 1, H - 1, 28); ctx.clip();
  ctx.fillStyle = "#004AAD"; ctx.fillRect(0, 0, W, 72);
  ctx.restore();
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.font = `800 20px ${FONT}`;
  ctx.fillText("NextClinic", 40, 45);
  ctx.textAlign = "right"; ctx.font = `600 14px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText("Carte patient", W - 40, 45);

  // Avatar (initiales)
  ctx.beginPath(); ctx.arc(88, 150, 44, 0, Math.PI * 2);
  ctx.fillStyle = "#EEF4FC"; ctx.fill();
  ctx.fillStyle = "#004AAD"; ctx.font = `700 28px ${FONT}`; ctx.textAlign = "center";
  const initials = patient.name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
  ctx.fillText(initials, 88, 160);

  // Identité
  ctx.textAlign = "left";
  ctx.font = `800 26px ${FONT}`; ctx.fillStyle = "#0f172a";
  ctx.fillText(patient.name, 148, 145, 300);
  ctx.font = `600 14px ${FONT}`; ctx.fillStyle = "#64748b";
  ctx.fillText(`Dossier ${patient.id}`, 148, 171, 300);

  // Détails (2 colonnes, puis allergies sur toute la largeur)
  const field = (label, value, x, y, color = G.text, max = 190) => {
    ctx.font = `700 10px ${FONT}`; ctx.fillStyle = "#94a3b8"; ctx.fillText(label, x, y);
    ctx.font = `600 15px ${FONT}`; ctx.fillStyle = color; ctx.fillText(value, x, y + 21, max);
  };
  field("NÉ(E) LE", patient.dob || "Non renseigné", 44, 232);
  field("CIN", patient.cin || "Non renseigné", 250, 232);
  field("GROUPE SANGUIN", patient.bloodType || "Non affiché", 44, 292, patient.bloodType ? "#dc2626" : G.text);
  field("ASSURANCE", patient.insurance || "Non renseignée", 250, 292);
  const hasAllergies = patient.allergies?.length > 0;
  field("ALLERGIES", hasAllergies ? patient.allergies.join(", ") : "Non affichées", 44, 352, hasAllergies ? "#dc2626" : G.text, 396);

  // Séparateur
  ctx.fillStyle = "#e6eaf0"; ctx.fillRect(468, 100, 1, 290);

  // QR code du dossier
  if (qrCanvas) {
    roundRect(498, 98, 184, 184, 14); ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.strokeStyle = "#e6eaf0"; ctx.stroke();
    ctx.drawImage(qrCanvas, 502, 102, 176, 176);
  }
  ctx.textAlign = "center"; ctx.font = `600 13px ${FONT}`; ctx.fillStyle = "#475569";
  ctx.fillText("Scanner pour ouvrir", 590, 310);
  ctx.fillText("le dossier patient", 590, 328);
  ctx.font = `700 12px ${FONT}`; ctx.fillStyle = "#004AAD";
  ctx.fillText(patient.id, 590, 354, 190);

  // Pied de carte
  ctx.font = `500 12px ${FONT}`; ctx.fillStyle = "#94a3b8"; ctx.textAlign = "left";
  ctx.fillText(`Émise le ${new Date().toLocaleDateString("fr-FR")}`, 44, 412);
  ctx.textAlign = "right"; ctx.fillText("Données médicales confidentielles", W - 40, 412);
}

// ─── TABS ────────────────────────────────────────────────────────────────────
const TABS = ["Aperçu", "Médicaments", "Historique", "Badge", "Documents"];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function PatientProfileAdvanced() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(['doctor', 'nurse'].includes(useAuthStore.getState().user?.role) ? 0 : 2);
  const canvasRef = useRef(null);
  const qrWrapRef = useRef(null);

  const user = useAuthStore(s => s.user);
  const canDelete = user?.role === 'doctor';
  const canReadMedical = ['doctor', 'nurse'].includes(user?.role);
  // Modification du dossier (PUT /patients/:id) : tous les rôles qui ouvrent cette page
  const [showEdit, setShowEdit] = useState(false);
  // Seul le médecin prescrit, en son nom (POST /prescriptions réservé au rôle doctor)
  const canPrescribe = user?.role === 'doctor';
  const [deletingPatient, setDeletingPatient] = useState(false);

  const [patientData, setPatientData] = useState(null);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const patientKey = `${id}:${canReadMedical}`;
  const [loadedKey, setLoadedKey] = useState(null);
  const [error, setError] = useState(null);

  // New Prescription Form Modal States
  const [showAddPrescription, setShowAddPrescription] = useState(false);
  const [newMedicaments, setNewMedicaments] = useState([]);
  const [medInputName, setMedInputName] = useState("");
  const [medInputDosage, setMedInputDosage] = useState("1 comprimé");
  const [medInputFreq, setMedInputFreq] = useState("3 fois/jour");
  const [medInputDuree, setMedInputDuree] = useState("7 jours");
  const [medInputInstructions, setMedInputInstructions] = useState("");
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [prescriptionDiagnostique, setPrescriptionDiagnostique] = useState("");
  const [submittingPrescription, setSubmittingPrescription] = useState(false);

  const loadData = useCallback((signal) => {
      // 1. Fetch patient profile
      return api.get(`/patients/${id}`, { signal }).then(async patientRes => {
      const p = patientRes.data;
      let details = [{ data: [] }, { data: [] }, { data: [] }];

      // 2. Fetch associated details using CIN
      if (p?.cin?.numero) {
        const cin = p.cin.numero;
        details = await Promise.all([
          (canReadMedical ? api.get(`/nurse/vitals-history/${cin}`, { signal }) : Promise.resolve({ data: [] })).catch(() => ({ data: [] })),
          (canReadMedical ? api.get(`/prescriptions?patientCin=${cin}`, { signal }) : Promise.resolve({ data: [] })).catch(() => ({ data: [] })),
          api.get(`/appointments?patientCin=${cin}`, { signal }).catch(() => ({ data: [] }))
        ]);
      }
      if (signal?.aborted) return;
      setPatientData(p);
      setError(null);
      setVitalsHistory(details[0].data || []);
      setPrescriptions(details[1].data || []);
      setAppointments(details[2].data || []);
    }).catch(err => {
      if (signal?.aborted) return;
      console.error("Error loading patient profile:", err);
      setError(err.response?.data?.error || "Impossible de charger le profil de ce patient.");
    }).finally(() => {
      if (!signal?.aborted) { setLoading(false); setLoadedKey(patientKey); }
    });
  }, [id, canReadMedical, patientKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Derived values
  const patientName = patientData ? `${patientData.prenom} ${patientData.nom}` : "Fatima Amrani";
  const dobFormatted = patientData?.dateNaissance ? new Date(patientData.dateNaissance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "22 Juillet 1985";
  const patientAge = patientData?.dateNaissance ? Math.floor((new Date() - new Date(patientData.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000)) : 39;
  
  // Last vitals from history
  const latestVitals = vitalsHistory.length > 0 ? vitalsHistory[0].vitals : {};

  // Données réelles du dossier uniquement (aucune valeur de remplacement inventée)
  const patientForBadge = useMemo(() => ({
    name: patientName,
    id: patientData?.numeroDossier || id,
    dob: patientData?.dateNaissance ? dobFormatted : null,
    cin: patientData?.cin?.numero || null,
    bloodType: patientData?.bloodType || null,
    insurance: patientData?.insurance || null,
    allergies: patientData?.allergies || []
  }), [patientName, patientData, id, dobFormatted]);
  // Même lien que le QR imprimé à la création du dossier : lu par le scanner de l'infirmerie (paramètre id)
  const badgeQrValue = `${window.location.origin}/patients?id=${encodeURIComponent(patientForBadge.id || "")}`;

  useEffect(() => {
    if (tab !== 3 || !canvasRef.current) return;
    const draw = () => {
      if (canvasRef.current) drawPatientBadge(canvasRef.current, patientForBadge, qrWrapRef.current?.querySelector("canvas"));
    };
    draw();
    // Redessine une fois la police de l'application chargée
    document.fonts?.ready.then(draw);
  }, [tab, patientForBadge]);

  const downloadBadge = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `badge-${patientForBadge.id}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handleAddMedToDraft = () => {
    if (!medInputName.trim()) {
      toast.error("Veuillez saisir le nom du médicament");
      return;
    }
    const draft = {
      nom: medInputName.trim(),
      posologie: medInputDosage,
      frequence: medInputFreq,
      timesPerDay: PRISES_PAR_JOUR[medInputFreq],
      duree: medInputDuree,
      moment: medInputInstructions
    };
    setNewMedicaments([...newMedicaments, draft]);
    setMedInputName("");
    setMedInputInstructions("");
  };

  const handleRemoveMedFromDraft = (index) => {
    setNewMedicaments(newMedicaments.filter((_, i) => i !== index));
  };

  const handleSubmitPrescription = async (e) => {
    e.preventDefault();
    if (newMedicaments.length === 0) {
      toast.error("Veuillez ajouter au moins un médicament");
      return;
    }

    try {
      setSubmittingPrescription(true);
      const payload = {
        patientCin: patientData.cin.numero,
        medicaments: newMedicaments,
        notes: prescriptionNotes,
        diagnostique: prescriptionDiagnostique
      };
      await api.post("/prescriptions", payload);
      toast.success("Ordonnance créée avec succès !");
      setShowAddPrescription(false);
      setNewMedicaments([]);
      setPrescriptionNotes("");
      setPrescriptionDiagnostique("");
      
      // Reload medication list
      const presRes = await api.get(`/prescriptions?patientCin=${patientData.cin.numero}`);
      setPrescriptions(presRes.data || []);
    } catch (err) {
      console.error("Error creating prescription:", err);
      toast.error(err.response?.data?.error || "Une erreur est survenue lors de la création de l'ordonnance.");
    } finally {
      setSubmittingPrescription(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!window.confirm(`Supprimer définitivement le dossier de ${patientName} ?\nToutes les données seront perdues. Cette action est irréversible.`)) return;
    setDeletingPatient(true);
    try {
      await api.delete(`/patients/${patientData.numeroDossier || id}`);
      toast.success(`Dossier de ${patientName} supprimé avec succès`);
      navigate('/patients');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression');
      setDeletingPatient(false);
    }
  };

  if (loading || loadedKey !== patientKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <LoaderCircle size={30} color={G.primary} style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" />
        <p style={{ marginTop: 12, color: G.muted, fontWeight: 600 }}>Chargement du dossier médical...</p>
      </div>
    );
  }

  if (error || !patientData) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", padding: 24, background: "white", borderRadius: 16, border: `1px solid ${G.border}`, textAlign: "center" }}>
        <TriangleAlert size={40} color={G.danger} style={{ display: "block", margin: "0 auto 16px" }} aria-hidden="true" />
        <h3 style={{ fontWeight: 700, fontSize: 18, color: G.danger, marginBottom: 8 }}>Une erreur est survenue</h3>
        <p style={{ color: G.muted, fontSize: 14, marginBottom: 20 }}>{error || "Ce patient n'existe pas ou vous n'avez pas l'accès requis."}</p>
        <button onClick={() => navigate(-1)} style={{ padding: "10px 24px", background: G.primary, color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
          Retourner
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 0 40px" }}>
      {/* Header Navigation */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, cursor: "pointer", display: "flex" }}>
          <ArrowLeft size={20} color={G.primary} />
        </button>
        <div>
          <h1 className="page-title">Dossier Médical</h1>
          <p style={{ margin: 0, fontSize: 13, color: G.muted }}>Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Tag color={G.success} bg={`${G.success}15`}>● Actif</Tag>
          <Tag color={G.primary}>{patientData.id}</Tag>
          <button
            onClick={() => setShowEdit(true)}
            title="Modifier ce dossier"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${G.primary}`, background: '#fff', color: G.primary, cursor: 'pointer',
            }}
          >
            <Pencil size={14} /> Modifier
          </button>
          {canDelete && (
            <button
              onClick={handleDeletePatient}
              disabled={deletingPatient}
              title="Supprimer ce dossier"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                border: '1.5px solid #ef4444', background: deletingPatient ? '#fef2f2' : '#fff',
                color: '#ef4444', cursor: deletingPatient ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', opacity: deletingPatient ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!deletingPatient) { e.currentTarget.style.background = '#fef2f2'; }}}
              onMouseLeave={e => { if (!deletingPatient) { e.currentTarget.style.background = '#fff'; }}}
            >
              <Trash size={14} />
              {deletingPatient ? 'Suppression...' : 'Supprimer le dossier'}
            </button>
          )}
        </div>
      </div>

      {/* Identity Hero Card */}
      <div style={{ background: "white", borderRadius: 24, border: `1px solid ${G.border}`, padding: 32, marginBottom: 20, boxShadow: '0 10px 30px rgba(0,74,173,0.05)', position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: G.primary }} />
        
        <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 100, height: 100, borderRadius: "50%", background: G.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 700, color: "white" }}>
            {patientName.split(/\s+/).filter(Boolean).map(n => n[0]).join("").toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 250 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: G.text, letterSpacing: "-0.5px" }}>{patientName}</div>
            <div style={{ display: "flex", gap: 15, color: G.muted, fontSize: 14, marginTop: 4, fontWeight: 500 }}>
              <span>{dobFormatted} ({patientAge} ans)</span>
              <span>·</span>
              <span>{patientData.sexe === 'F' ? 'Femme' : 'Homme'}</span>
              <span>·</span>
              {canReadMedical && (<span style={{ color: G.danger, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><Droplet size={13} aria-hidden="true" />{patientData.bloodType || "N/A"}</span>)}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {patientData.insurance && <Tag>{patientData.insurance}</Tag>}
              <Tag color={G.info}>Général</Tag>
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "0 20px" }}>
            <ScoreRing score={patientData.bloodType ? 90 : 75} />
            <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginTop: 4 }}>COMPLÉTUDE DOSSIER</div>
          </div>
        </div>

        <NavyDivider />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
          {canReadMedical && (<div>
            <div style={{ fontSize: 10, fontWeight: 700, color: G.muted, letterSpacing: "0.05em", marginBottom: 6 }}>ALLERGIES</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {patientData.allergies?.length > 0 ? (
                patientData.allergies.map(a => <Tag key={a} color={G.danger}>{a}</Tag>)
              ) : (
                <span style={{ fontSize: 12, color: G.success, fontWeight: 600 }}>Aucune allergie connue</span>
              )}
            </div>
          </div>)}
          {user?.role === 'doctor' && (<div>
            <div style={{ fontSize: 10, fontWeight: 700, color: G.muted, letterSpacing: "0.05em", marginBottom: 6 }}>MALADIES CHRONIQUES</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {patientData.chronic?.length > 0 ? (
                patientData.chronic.map(c => <Tag key={c} color={G.warn}>{c}</Tag>)
              ) : (
                <span style={{ fontSize: 12, color: G.muted }}>Aucune maladie chronique déclarée</span>
              )}
            </div>
          </div>)}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, background: "#f1f5f9", padding: 5, borderRadius: 16, overflowX: "auto" }}>
        {TABS.map((t, i) => (canReadMedical || i >= 2) && (
          <button key={i} onClick={() => setTab(i)} style={{ flex: 1, padding: "10px 12px", whiteSpace: "nowrap", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "0.2s", background: tab === i ? "white" : "transparent", color: tab === i ? G.primary : G.muted, boxShadow: tab === i ? '0 4px 12px rgba(0,0,0,0.05)' : 'none' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {/* Tab 0: Aperçu (Constantes) */}
      {canReadMedical && tab === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <VitalCard icon={Activity} label="Tension Artérielle" value={latestVitals?.ta} unit="mmHg" color={G.danger} />
            <VitalCard icon={HeartPulse} label="Pulsations" value={latestVitals?.pouls} unit="bpm" color={G.primary} sub={latestVitals?.pouls ? "Stable" : null} />
            <VitalCard icon={Wind} label="SpO₂ (Saturation)" value={latestVitals?.spo2} unit="%" color={G.success} />
            <VitalCard icon={Thermometer} label="Température" value={latestVitals?.temp} unit="°C" color={G.info} />
            <VitalCard icon={Scale} label="Poids" value={latestVitals?.poids} unit="kg" color={G.warn} />
          </div>

          <div style={{ background: "white", borderRadius: 20, border: `1px solid ${G.border}`, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: G.primary }}>Historique des Mesures</div>
              <Tag color={G.success}>Suivi actif</Tag>
            </div>
            {vitalsHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: G.muted, fontSize: 14 }}>Aucun historique de constantes disponible pour ce patient.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {vitalsHistory.map((h, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: G.surfaceL, borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.text }}>{new Date(h.dateRdv).toLocaleDateString('fr-FR')}</div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: G.muted }}>
                      {h.vitals?.ta && <span>TA : {h.vitals.ta}</span>}
                      {h.vitals?.pouls && <span>Pouls : {h.vitals.pouls} bpm</span>}
                      {h.vitals?.temp && <span>Temp : {h.vitals.temp} °C</span>}
                      {h.vitals?.spo2 && <span>SpO₂ : {h.vitals.spo2} %</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 1: Médicaments */}
      {canReadMedical && tab === 1 && (
        <div style={{ background: "white", borderRadius: 20, border: `1px solid ${G.border}`, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: G.primary }}>Médicaments et Ordonnances</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {canPrescribe && (
              <button
                onClick={() => setShowAddPrescription(true)}
                style={{
                  background: G.primary, color: "white", border: "none", borderRadius: 10,
                  padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6
                }}
              >
                <Plus size={15} /> Nouvelle Ordonnance
              </button>
              )}
              <span style={{ fontSize: 12, color: G.muted, fontWeight: 600 }}>{prescriptions.length} Ordonnance(s)</span>
            </div>
          </div>

          {prescriptions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: G.muted }}>
              <Pill size={30} strokeWidth={1.5} style={{ display: "block", margin: "0 auto 8px" }} aria-hidden="true" />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Aucune prescription médicale enregistrée pour ce patient.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {prescriptions.map((pres) => (
                <div key={pres.id} style={{ border: `1px solid ${G.border}`, borderRadius: 16, padding: 20, background: G.surfaceL }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, borderBottom: "1px solid rgba(0,74,173,0.06)", paddingBottom: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: G.primary }}>Ordonnance N° {pres.numero}</div>
                      <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>Prescrit par {pres.medecinNom} ({pres.medecinSpecialite || "Médecin"})</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Tag color={pres.statut === 'administree' ? G.success : pres.statut === 'remise' ? G.info : G.warn}>
                        {pres.statut === 'en_attente' ? 'En attente' : pres.statut === 'en_preparation' ? 'En préparation' : pres.statut === 'preparee' ? 'Préparée' : pres.statut === 'remise' ? 'Remise' : 'Administrée'}
                      </Tag>
                      <div style={{ fontSize: 11, color: G.muted, marginTop: 4 }}>{new Date(pres.createdAt).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {pres.medicaments?.map((med, idx) => (
                      <div key={idx} style={{ background: "white", padding: 12, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: G.text }}>{nomMedicament(med)}</div>
                          <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>Dosage: {posologieMedicament(med) || "—"} · Moment: {med.moment || "—"}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: G.primary, background: `${G.primary}10`, padding: "2px 8px", borderRadius: 6 }}>
                            {med.frequence || `${med.timesPerDay || 1} fois/jour`}
                          </span>
                          <div style={{ fontSize: 11, color: G.muted, marginTop: 4 }}>Durée: {med.duree || "—"}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {pres.notes && (
                    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(245,158,11,0.06)", borderLeft: `3px solid ${G.warn}`, borderRadius: "0 10px 10px 0", fontSize: 12, color: G.text }}>
                      <strong>Note:</strong> {pres.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Historique (Timeline) */}
      {tab === 2 && (
        <div style={{ background: "white", borderRadius: 20, border: `1px solid ${G.border}`, padding: 24 }}>
          <h3 style={{ margin: "0 0 20px 0", fontSize: 18, fontWeight: 700, color: G.primary }}>Historique des Visites & Événements</h3>
          
          {appointments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: G.muted, fontSize: 14 }}>Aucun historique de rendez-vous ou de visites.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {appointments.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 20, position: "relative" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: G.accent, display: "flex", alignItems: "center", justifyContent: "center", color: G.primary, flexShrink: 0 }}>
                    <CalendarDays size={18} aria-hidden="true" />
                  </div>
                  <div style={{ flex: 1, paddingBottom: 20, borderBottom: i < appointments.length - 1 ? `1px solid ${G.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{e.motif || "Consultation médicale"}</div>
                      <div style={{ fontSize: 12, color: G.muted, fontWeight: 600 }}>{new Date(e.date).toLocaleDateString('fr-FR')}</div>
                    </div>
                    <div style={{ fontSize: 12, color: G.primary, fontWeight: 700, marginTop: 4 }}>{e.doctor}</div>
                    <div style={{ marginTop: 6 }}>
                      <Tag color={e.status === 'termine' ? G.success : G.info}>{e.status}</Tag>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Badge */}
      {tab === 3 && (
        <div style={{ background: "white", borderRadius: 20, border: `1px solid ${G.border}`, padding: 32, textAlign: "center" }}>
          {/* QR du dossier, rendu hors écran puis copié dans la carte */}
          <div ref={qrWrapRef} style={{ display: "none" }} aria-hidden="true">
            <QRCodeCanvas value={badgeQrValue} size={352} level="H" includeMargin={true} />
          </div>
          <canvas ref={canvasRef} width={720} height={440} role="img" aria-label={`Carte patient ${patientForBadge.name} avec QR code du dossier`} style={{ width: "100%", maxWidth: 600, borderRadius: 16, boxShadow: '0 12px 32px -12px rgba(15,23,42,0.18)', marginBottom: 24 }} />
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <button onClick={downloadBadge} style={{ background: G.primary, color: "white", border: "none", borderRadius: 12, padding: "12px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <Download size={18} /> Télécharger le Badge HD
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Documents */}
      {tab === 4 && <DocumentsPatient numeroDossier={patientData.numeroDossier || patientData.id} />}

      {showEdit && (
        <EditPatientModal
          patient={patientData}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); setLoading(true); loadData(); }}
        />
      )}

      {/* ── Modal: Nouvelle Prescription ── */}
      {showAddPrescription && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16
        }}>
          <div style={{
            background: "white", borderRadius: 16, width: "100%", maxWidth: 540,
            maxHeight: "90vh", overflowY: "auto", padding: 28, boxShadow: "0 24px 60px rgba(0,0,0,0.15)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: G.primary }}>Nouvelle Prescription</h3>
              <button onClick={() => setShowAddPrescription(false)} style={{ background: "none", border: "none", cursor: "pointer", color: G.muted, display: "flex" }} aria-label="Fermer"><X size={20} aria-hidden="true" /></button>
            </div>

            <form onSubmit={handleSubmitPrescription}>
              {/* Draft List */}
              {newMedicaments.length > 0 && (
                <div style={{ background: G.bg, borderRadius: 12, padding: 14, marginBottom: 20, border: `1.5px solid ${G.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, marginBottom: 8, textTransform: "uppercase" }}>Médicaments ajoutés :</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {newMedicaments.map((m, i) => (
                      <div key={i} style={{ background: "white", padding: "8px 12px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${G.border}` }}>
                        <div>
                          <strong style={{ fontSize: 13, color: G.text }}>{m.nom}</strong>
                          <div style={{ fontSize: 11, color: G.muted }}>{m.posologie} · {m.frequence} · {m.duree}</div>
                        </div>
                        <button type="button" onClick={() => handleRemoveMedFromDraft(i)} style={{ background: "none", border: "none", color: G.danger, cursor: "pointer", display: "flex" }}>
                          <Trash size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Medicament Form Section */}
              <div style={{ background: G.bg, borderRadius: 12, padding: 14, marginBottom: 20, border: `1px solid ${G.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: G.primary, marginBottom: 12, textTransform: "uppercase" }}>Formulaire Médicament</div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Nom du médicament</label>
                    <input 
                      type="text" placeholder="Ex: Amoxicilline 500mg" 
                      value={medInputName} onChange={e => setMedInputName(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Dosage</label>
                      <input 
                        type="text" value={medInputDosage} onChange={e => setMedInputDosage(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Fréquence</label>
                      <select
                        value={medInputFreq} onChange={e => setMedInputFreq(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box", background: "white" }}
                      >
                        {Object.keys(PRISES_PAR_JOUR).map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Durée</label>
                      <input 
                        type="text" value={medInputDuree} onChange={e => setMedInputDuree(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Moment de prise / Instructions</label>
                      <input 
                        type="text" placeholder="Ex: Avant les repas" 
                        value={medInputInstructions} onChange={e => setMedInputInstructions(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  <button 
                    type="button" onClick={handleAddMedToDraft}
                    style={{ background: G.accent, color: G.primary, border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, cursor: "pointer", marginTop: 6 }}
                  >
                    Ajouter le médicament à l'ordonnance
                  </button>
                </div>
              </div>

              {/* Notes & Diagnostics */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Diagnostic / Motif</label>
                  <input 
                    type="text" placeholder="Ex: Angine bactérienne" 
                    value={prescriptionDiagnostique} onChange={e => setPrescriptionDiagnostique(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Notes additionnelles</label>
                  <textarea 
                    placeholder="Instructions supplémentaires..." 
                    value={prescriptionNotes} onChange={e => setPrescriptionNotes(e.target.value)}
                    style={{ width: "100%", height: 60, padding: "8px 12px", border: `1.5px solid ${G.border}`, borderRadius: 8, marginTop: 4, outline: "none", boxSizing: "border-box", resize: "none" }}
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button 
                  type="button" onClick={() => setShowAddPrescription(false)} 
                  style={{ padding: "10px 20px", border: `1px solid ${G.border}`, borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                >
                  Annuler
                </button>
                <button 
                  type="submit" disabled={submittingPrescription || newMedicaments.length === 0}
                  style={{ 
                    padding: "10px 24px", border: "none", borderRadius: 8, background: G.primary, 
                    color: "white", cursor: (submittingPrescription || newMedicaments.length === 0) ? "not-allowed" : "pointer", 
                    fontSize: 13, fontWeight: 700, opacity: (submittingPrescription || newMedicaments.length === 0) ? 0.6 : 1 
                  }}
                >
                  {submittingPrescription ? "Création..." : "Créer l'ordonnance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
