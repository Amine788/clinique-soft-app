import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";
import { useSocket } from "../../hooks/useSocket";
import toast from "react-hot-toast";
import {
  Syringe, Users, CircleCheck, Hourglass, TriangleAlert, Activity, HeartPulse, Thermometer,
  Scale, Wind, Droplet, Stethoscope, ShieldCheck, ClipboardList, Pill, LoaderCircle, BedDouble
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const initiales = (n = "") => n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
const PALETTE = ["#2563eb", "#0891b2", "#7c3aed", "#d97706", "#059669", "#dc2626"];
const avatarColor = (n = "") => PALETTE[(n.charCodeAt(0) || 0) % PALETTE.length];

const BLOOD_COLOR = {
  "A+": "#ef4444", "A-": "#f97316",
  "B+": "#3b82f6", "B-": "#6366f1",
  "AB+": "#8b5cf6", "AB-": "#ec4899",
  "O+": "#10b981", "O-": "#14b8a6",
};

const STATUS_CFG = {
  pending:      { label: "En attente",    color: "#f59e0b", bg: "#fffbeb", dot: "#f59e0b" },
  prepared:     { label: "Préparée",      color: "#3b82f6", bg: "#eff6ff", dot: "#3b82f6" },
  delivered:    { label: "Remise",        color: "#7c3aed", bg: "#f5f3ff", dot: "#7c3aed" },
  administered: { label: "Administrée",   color: "#10b981", bg: "#f0fdf4", dot: "#10b981" },
};

const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/* ─── SVG Icons ───────────────────────────────────────────────────────────── */
const Icon = {
  Pill:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:16,height:16}}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>,
  Check:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>,
  Clock:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:13,height:13}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Alert:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  User:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Bed:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>,
  Send:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Close:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{width:14,height:14}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Refresh:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Heart:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:13,height:13}}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Lock:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:12,height:12}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
};

/* ─── Vitals Badge ────────────────────────────────────────────────────────── */
function VitalItem({ icon, label, value, unit }) {
  const Ico = icon;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#f8fafc", borderRadius:10 }}>
      <div style={{ width:34, height:34, borderRadius:10, background:"#EEF4FC", color:"#004AAD", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Ico size={16} aria-hidden="true" /></div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>{label}</div>
        <div style={{ fontSize:16, fontWeight:700, color:"#0f172a", marginTop:1 }}>{value || <span style={{color:"#cbd5e1",fontWeight:400,fontSize:13}}>—</span>} {value && <span style={{fontSize:11,fontWeight:500,color:"#64748b"}}>{unit}</span>}</div>
      </div>
    </div>
  );
}

/* ─── Slot Badge ──────────────────────────────────────────────────────────── */
function SlotBadge({ slot, onAdminister, locked }) {
  const isLate = !slot.done && slot.time < now();
  return (
    <div
      onClick={() => !slot.done && !locked && onAdminister()}
      style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"9px 13px", borderRadius:10, cursor: slot.done || locked ? "default" : "pointer",
        background: slot.done ? "#f0fdf4" : isLate ? "#fff1f2" : "#f8fafc",
        border: `1.5px solid ${slot.done ? "#86efac" : isLate ? "#fca5a5" : "#e2e8f0"}`,
        transition:"all .2s", minWidth:140
      }}
    >
      <div style={{
        width:28, height:28, borderRadius:8, flexShrink:0,
        background: slot.done ? "#10b981" : isLate ? "#fee2e2" : "#e2e8f0",
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"background .2s"
      }}>
        {slot.done ? <Icon.Check /> : isLate ? <span style={{color:"#ef4444",fontSize:12}}>!</span> : <Icon.Clock />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color: slot.done ? "#059669" : isLate ? "#dc2626" : "#374151" }}>
          {slot.label}
        </div>
        <div style={{ fontSize:11, color:"#94a3b8" }}>
          {slot.time}
          {slot.done && slot.doneAt && <span style={{color:"#10b98180"}}> · {slot.doneAt}</span>}
        </div>
      </div>
      {slot.done && <Icon.Lock />}
    </div>
  );
}

/* ─── Alert Modal ─────────────────────────────────────────────────────────── */
function AlertModal({ patient, onClose, onSend }) {
  const [msg, setMsg] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!msg.trim()) return;
    setSending(true);
    await onSend(msg, urgency);
    setSending(false);
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.5)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:460, boxShadow:"0 32px 64px rgba(0,0,0,.3)", overflow:"hidden" }}>
        <div style={{ background:"#dc2626", padding:"18px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"rgba(255,255,255,.2)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}><TriangleAlert size={18} aria-hidden="true" /></div>
            <div>
              <div style={{ color:"#fff", fontWeight:700, fontSize:15 }}>Envoyer une alerte au médecin</div>
              <div style={{ color:"rgba(255,255,255,.7)", fontSize:12 }}>{patient.name}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:8, width:32, height:32, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon.Close /></button>
        </div>
        <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:"#374151", marginBottom:6 }}>Niveau d'urgence</div>
            <div style={{ display:"flex", gap:8 }}>
              {[
                { v:"normal", label:"Normal", color:"#3b82f6", bg:"#eff6ff" },
                { v:"urgent", label:"Urgent", color:"#f59e0b", bg:"#fffbeb" },
                { v:"critique", label:"Critique", color:"#ef4444", bg:"#fef2f2" },
              ].map(u => (
                <button key={u.v} onClick={() => setUrgency(u.v)} style={{
                  flex:1, padding:"8px 0", borderRadius:8, cursor:"pointer",
                  border:`1.5px solid ${urgency === u.v ? u.color : "#e5e7eb"}`,
                  background: urgency === u.v ? u.bg : "#fff",
                  color: urgency === u.v ? u.color : "#6b7280",
                  fontWeight:700, fontSize:12, transition:"all .15s"
                }}>{u.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:"#374151", marginBottom:6 }}>Observation / Message</div>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder="Décrivez l'observation ou la situation nécessitant l'attention du médecin…"
              rows={4}
              style={{ width:"100%", border:"1.5px solid #e5e7eb", borderRadius:10, padding:"10px 12px", fontSize:13, outline:"none", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }}
              onFocus={e => e.target.style.borderColor="#ef4444"}
              onBlur={e => e.target.style.borderColor="#e5e7eb"}
            />
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onClose} style={{ flex:1, padding:"10px", border:"1px solid #e5e7eb", borderRadius:10, background:"#f9fafb", color:"#6b7280", fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
            <button
              onClick={handleSend}
              disabled={!msg.trim() || sending}
              style={{ flex:2, padding:"10px", border:"none", borderRadius:10, background: !msg.trim() || sending ? "#e5e7eb" : "#dc2626", color: !msg.trim() || sending ? "#9ca3af" : "#fff", fontSize:13, fontWeight:700, cursor: !msg.trim() || sending ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
            >
              <Icon.Send /> {sending ? "Envoi…" : "Envoyer l'alerte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Administration Modal ────────────────────────────────────────── */
function ConfirmModal({ data, onConfirm, onClose }) {
  const [confirming, setConfirming] = useState(false);
  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.5)", zIndex:2100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:400, boxShadow:"0 32px 64px rgba(0,0,0,.3)", padding:28 }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:"#EEF4FC", color:"#004AAD", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}><Pill size={26} aria-hidden="true" /></div>
          <h3 style={{ fontWeight:700, fontSize:18, color:"#0f172a", margin:0 }}>Confirmer l'administration</h3>
          <p style={{ color:"#64748b", fontSize:13, marginTop:6, lineHeight:1.5 }}>Cette action sera horodatée et irréversible.</p>
        </div>
        <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#0f172a" }}>{data.med}</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{data.dose} · {data.moment}</div>
          <div style={{ fontSize:12, color:"#94a3b8", marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
            <Icon.User />{data.patientName} · {data.slotLabel} ({data.slotTime})
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", border:"1px solid #e5e7eb", borderRadius:10, background:"#f9fafb", color:"#6b7280", fontWeight:600, fontSize:13, cursor:"pointer" }}>Annuler</button>
          <button onClick={handleConfirm} disabled={confirming} style={{ flex:2, padding:"10px", border:"none", borderRadius:10, background: confirming ? "#e5e7eb" : "#059669", color: confirming ? "#9ca3af" : "#fff", fontWeight:700, fontSize:13, cursor: confirming ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Icon.Check /> {confirming ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Patient Side Panel ──────────────────────────────────────────────────── */
function PatientPanel({ patient, onClose, onAlertClick, onAdminister, onSaveVitals, canSaveHospVitals }) {
  const [activeTab, setActiveTab] = useState("prescription");
  const [vitals, setVitals] = useState({ ta:"", pouls:"", temp:"", poids:"", spo2:"" });
  const [vitalsSaved, setVitalsSaved] = useState(false);
  const [savingVitals, setSavingVitals] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const prescriptions = patient.prescriptions || [];
  const pendingSlots = prescriptions.reduce((acc, p) => {
    (p.slots||[]).filter(s => !s.done).forEach(() => acc++);
    return acc;
  }, 0);

  // Patient hospitalisé : constantes de l'hospitalisation (nurse, admin) ; sinon celles du RDV du jour
  const handleSaveVitals = async () => {
    const hospId = canSaveHospVitals ? patient.hospitalisationId : null;
    if (!hospId && !patient.rdvAujourdhui?.id) {
      toast.error(patient.hospitalisationId
        ? "Constantes d'hospitalisation réservées à l'infirmier·ère : rien n'a été enregistré"
        : "Ni hospitalisation en cours ni RDV aujourd'hui : rien n'a été enregistré");
      return;
    }
    setSavingVitals(true);
    try {
      if (hospId) {
        const val = v => v === "" ? undefined : v;
        const { data } = await api.post(`/hospitalisations/${hospId}/vitals`, {
          tension: val(vitals.ta), pouls: val(vitals.pouls), temperature: val(vitals.temp),
          poids: val(vitals.poids), saturation: val(vitals.spo2)
        });
        if (data?.alertsGenerated > 0) {
          toast.error(`${data.alertsGenerated} alerte(s) envoyée(s) au médecin`, { duration: 6000 });
        }
      } else {
        await api.post("/nurse/vitals", { rdvId: patient.rdvAujourdhui.id, vitals });
      }
      setVitalsSaved(true);
      if (onSaveVitals) onSaveVitals();
      toast.success("Constantes enregistrées");
    } catch { toast.error("Erreur lors de la sauvegarde"); }
    finally { setSavingVitals(false); }
  };

  const handleAdminister = (prescriptionId, itemId, slotIndex, med, dose, moment, slotLabel, slotTime) => {
    setConfirmData({ prescriptionId, itemId, slotIndex, med, dose, moment, slotLabel, slotTime, patientName: patient.name });
  };

  const confirmAdminister = async () => {
    const { prescriptionId, itemId, slotIndex } = confirmData;
    await onAdminister(prescriptionId, itemId, slotIndex);
    setConfirmData(null);
  };

  const tabs = [
    { id:"prescription", label:"e-Prescription", badge: pendingSlots > 0 ? pendingSlots : null },
    { id:"vitals",       label:"Constantes" },
    { id:"medical",      label:"Médical" },
  ];

  const vitalsData = patient.rdvAujourdhui?.vitals;

  return (
    <>
      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.5)", zIndex:900, backdropFilter:"blur(2px)" }} onClick={onClose} />
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, width:"min(500px,100vw)",
        background:"#fff", zIndex:1000, display:"flex", flexDirection:"column",
        boxShadow:"-8px 0 40px rgba(0,0,0,.2)", overflowY:"auto"
      }}>
        {/* Header patient */}
        <div style={{ background:"#0f172a", padding:"20px 20px 16px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:avatarColor(patient.name)+"30", border:`2px solid ${avatarColor(patient.name)}60`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:700, color:avatarColor(patient.name) }}>
                {initiales(patient.name)}
              </div>
              <div>
                <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:17 }}>{patient.name}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:4 }}>
                  {patient.room && <span style={{ background:"rgba(255,255,255,.1)", color:"#cbd5e1", fontSize:11, padding:"2px 8px", borderRadius:6, display:"flex", alignItems:"center", gap:3 }}><Icon.Bed />{patient.room}</span>}
                  {patient.age && <span style={{ background:"rgba(255,255,255,.1)", color:"#cbd5e1", fontSize:11, padding:"2px 8px", borderRadius:6 }}>{patient.age} ans</span>}
                  {patient.bloodType && <span style={{ background:(BLOOD_COLOR[patient.bloodType]||"#64748b")+"30", color:BLOOD_COLOR[patient.bloodType]||"#fff", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6, display:"flex", alignItems:"center", gap:3 }}><Droplet size={11} aria-hidden="true" />{patient.bloodType}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,.1)", border:"none", borderRadius:8, width:32, height:32, color:"#94a3b8", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Icon.Close /></button>
          </div>

          {patient.doctor && (
            <div style={{ background:"rgba(255,255,255,.07)", borderRadius:10, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
              <Stethoscope size={16} color="#94a3b8" aria-hidden="true" />
              <div>
                <div style={{ color:"#f1f5f9", fontSize:13, fontWeight:600 }}>{patient.doctor}</div>
                <div style={{ color:"#64748b", fontSize:11 }}>Médecin référent</div>
              </div>
            </div>
          )}

          {/* Alertes */}
          {(patient.allergies?.length > 0 || patient.chronic?.length > 0) && (
            <div style={{ marginTop:10, background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.3)", borderRadius:10, padding:"8px 12px" }}>
              {patient.allergies?.length > 0 && (
                <div style={{ color:"#f87171", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}><TriangleAlert size={13} aria-hidden="true" />Allergies : {patient.allergies.join(", ")}</div>
              )}
              {patient.chronic?.length > 0 && (
                <div style={{ color:"#fbbf24", fontSize:12, fontWeight:500, marginTop:patient.allergies?.length > 0 ? 3 : 0, display:"flex", alignItems:"center", gap:5 }}><HeartPulse size={13} aria-hidden="true" />Chroniques : {patient.chronic.join(", ")}</div>
              )}
            </div>
          )}
        </div>

        {/* Action rapide alerte */}
        <div style={{ padding:"10px 16px", background:"#fef2f2", borderBottom:"1px solid #fecaca", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ fontSize:12, color:"#7f1d1d", fontWeight:600 }}>Synchronisation bidirectionnelle active</div>
          {onAlertClick && <button onClick={onAlertClick} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", background:"#ef4444", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            <Icon.Alert /> Alerter le médecin
          </button>}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #f1f5f9", background:"#fafafa", flexShrink:0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex:1, padding:"13px 8px", background:"none", border:"none", cursor:"pointer",
              fontSize:12, fontWeight: activeTab===t.id ? 700 : 500,
              color: activeTab===t.id ? "#004AAD" : "#64748b",
              borderBottom: activeTab===t.id ? "2px solid #004AAD" : "2px solid transparent",
              marginBottom:-1, transition:"all .15s", display:"flex", alignItems:"center", justifyContent:"center", gap:5
            }}>
              {t.label}
              {t.badge && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 5px" }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, padding:16, overflowY:"auto" }}>

          {/* ── e-Prescription ── */}
          {activeTab === "prescription" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {prescriptions.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 20px", color:"#94a3b8" }}>
                  <ClipboardList size={36} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 10px" }} aria-hidden="true" />
                  <div style={{ fontWeight:700, marginBottom:4 }}>Aucune ordonnance active</div>
                  <div style={{ fontSize:13 }}>Le médecin n'a pas encore émis de prescription.</div>
                </div>
              ) : (
                prescriptions.map(presc => {
                  const cfg = STATUS_CFG[presc.status] || STATUS_CFG.pending;
                  const totalSlots = (presc.slots||[]).length;
                  const doneSlots = (presc.slots||[]).filter(s=>s.done).length;
                  const pct = totalSlots ? Math.round((doneSlots/totalSlots)*100) : 0;

                  // Group slots by item
                  const itemSlots = {};
                  (presc.slots||[]).forEach(sl => {
                    if (!itemSlots[sl.itemId]) itemSlots[sl.itemId] = [];
                    itemSlots[sl.itemId].push(sl);
                  });

                  return (
                    <div key={presc.id} style={{ border:"1px solid #e2e8f0", borderRadius:14, overflow:"hidden" }}>
                      {/* Prescription header */}
                      <div style={{ padding:"12px 16px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div>
                          <div style={{ fontSize:11, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Ordonnance #{presc.numero || presc.id}</div>
                          <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>Dr. {presc.doctor || patient.doctor} · {presc.createdAt}</div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          <span style={{ background:cfg.bg, color:cfg.color, fontSize:10, fontWeight:700, padding:"2px 10px", borderRadius:99 }}>{cfg.label}</span>
                          <div style={{ fontSize:11, color:"#64748b" }}>{doneSlots}/{totalSlots} prises</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ height:4, background:"#e2e8f0" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background: pct===100 ? "#10b981" : pct>50 ? "#3b82f6" : "#f59e0b", transition:"width .4s ease", borderRadius:"0 2px 2px 0" }} />
                      </div>

                      {/* Medications */}
                      <div style={{ padding:12, display:"flex", flexDirection:"column", gap:10 }}>
                        {(presc.items||[]).map((item, idx) => {
                          const slots = itemSlots[item.id] || [];
                          const allItemDone = slots.length > 0 && slots.every(s=>s.done);
                          return (
                            <div key={item.id || idx} style={{ border:`1px solid ${allItemDone ? "#bbf7d0" : "#e2e8f0"}`, borderRadius:10, padding:"10px 12px", background: allItemDone ? "#f0fdf4" : "#fff" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                                <div style={{ width:32, height:32, borderRadius:8, background:allItemDone?"#dcfce7":"#EEF4FC", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                  <Icon.Pill />
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{item.med}</div>
                                  <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>
                                    {item.dose} · <span style={{ color:"#004AAD", fontWeight:600 }}>{item.moment}</span> · {item.timesPerDay}×/jour
                                  </div>
                                </div>
                                {allItemDone && <span style={{ background:"#dcfce7", color:"#15803d", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99 }}>Terminé</span>}
                              </div>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                                {slots.map((slot, si) => (
                                  <SlotBadge
                                    key={si}
                                    slot={slot}
                                    locked={presc.status !== "delivered" && presc.status !== "administered"}
                                    onAdminister={() => handleAdminister(presc.id, item.id, si, item.med, item.dose, item.moment, slot.label, slot.time)}
                                  />
                                ))}
                                {slots.length === 0 && (
                                  <div style={{ fontSize:12, color:"#94a3b8", padding:"6px 0" }}>Aucun créneau planifié — prescription non remise par la pharmacie</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Constantes ── */}
          {activeTab === "vitals" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {vitalsData && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>Dernières constantes enregistrées</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <VitalItem icon={Activity} label="Tension" value={vitalsData.ta} unit="mmHg" />
                    <VitalItem icon={HeartPulse} label="Pouls" value={vitalsData.pouls} unit="bpm" />
                    <VitalItem icon={Thermometer} label="Température" value={vitalsData.temp} unit="°C" />
                    <VitalItem icon={Scale} label="Poids" value={vitalsData.poids} unit="kg" />
                    <VitalItem icon={Wind} label="SpO₂" value={vitalsData.spo2} unit="%" />
                  </div>
                </div>
              )}

              <div style={{ borderTop: vitalsData ? "1px solid #f1f5f9" : "none", paddingTop: vitalsData ? 12 : 0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>
                  {vitalsData ? "Mettre à jour les constantes" : "Saisir les constantes"}
                </div>

                {vitalsSaved ? (
                  <div style={{ padding:"12px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, fontSize:13, color:"#065f46", fontWeight:600, display:"flex", alignItems:"center", gap:8 }}>
                    <CircleCheck size={16} aria-hidden="true" />Constantes enregistrées avec succès
                  </div>
                ) : (
                  <>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                      {[
                        { key:"ta",    label:"Tension artérielle", ph:"120/80",  unit:"mmHg" },
                        { key:"pouls", label:"Pouls",              ph:"72",      unit:"bpm"  },
                        { key:"temp",  label:"Température",        ph:"37.2",    unit:"°C"   },
                        { key:"poids", label:"Poids",              ph:"75",      unit:"kg"   },
                        { key:"spo2",  label:"Saturation O₂",      ph:"98",      unit:"%"    },
                      ].map(f => (
                        <div key={f.key}>
                          <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:3 }}>{f.label}</div>
                          <div style={{ display:"flex" }}>
                            <input type="text" placeholder={f.ph} value={vitals[f.key]}
                              onChange={e => setVitals(v => ({...v, [f.key]: e.target.value}))}
                              style={{ flex:1, border:"1px solid #e5e7eb", borderRight:"none", borderRadius:"7px 0 0 7px", padding:"7px 9px", fontSize:13, outline:"none" }}
                              onFocus={e => e.target.style.borderColor="#004AAD"}
                              onBlur={e => e.target.style.borderColor="#e5e7eb"}
                            />
                            <span style={{ background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:"0 7px 7px 0", padding:"0 7px", fontSize:11, color:"#6b7280", display:"flex", alignItems:"center" }}>{f.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleSaveVitals} disabled={savingVitals} style={{ width:"100%", padding:"10px", border:"none", borderRadius:10, background: savingVitals ? "#e5e7eb" : "#004AAD", color: savingVitals ? "#9ca3af" : "#fff", fontWeight:700, fontSize:13, cursor: savingVitals ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <Icon.Check /> {savingVitals ? "Enregistrement…" : "Enregistrer les constantes"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Médical ── */}
          {activeTab === "medical" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ padding:"12px 14px", background: patient.bloodType ? (BLOOD_COLOR[patient.bloodType]+"10"||"#f8fafc") : "#f8fafc", border:`1px solid ${patient.bloodType ? (BLOOD_COLOR[patient.bloodType]+"30"||"#e2e8f0") : "#e2e8f0"}`, borderRadius:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", marginBottom:4 }}>Groupe sanguin</div>
                {patient.bloodType
                  ? <span style={{ fontSize:28, fontWeight:700, color:BLOOD_COLOR[patient.bloodType]||"#0f172a" }}>{patient.bloodType}</span>
                  : <span style={{ fontSize:13, color:"#94a3b8" }}>Non renseigné</span>
                }
              </div>
              <div style={{ padding:"12px 14px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#c2410c", textTransform:"uppercase", marginBottom:8, display:"flex", alignItems:"center", gap:5 }}><TriangleAlert size={12} aria-hidden="true" />Allergies ({patient.allergies?.length||0})</div>
                {patient.allergies?.length > 0
                  ? <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{patient.allergies.map((a,i) => <span key={i} style={{ background:"#fecaca", color:"#991b1b", fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:99 }}>{a}</span>)}</div>
                  : <span style={{ fontSize:12, color:"#059669" }}>Aucune allergie connue</span>
                }
              </div>
              <div style={{ padding:"12px 14px", background:"#EEF4FC", border:"1px solid #D9E6F8", borderRadius:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#003D8F", textTransform:"uppercase", marginBottom:8, display:"flex", alignItems:"center", gap:5 }}><HeartPulse size={12} aria-hidden="true" />Maladies chroniques ({patient.chronic?.length||0})</div>
                {patient.chronic?.length > 0
                  ? <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{patient.chronic.map((c,i) => <span key={i} style={{ background:"#D9E6F8", color:"#003D8F", fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:99 }}>{c}</span>)}</div>
                  : <span style={{ fontSize:12, color:"#059669" }}>Aucune maladie chronique</span>
                }
              </div>
              {patient.insurance && (
                <div style={{ padding:"12px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#065f46", textTransform:"uppercase", marginBottom:4, display:"flex", alignItems:"center", gap:5 }}><ShieldCheck size={12} aria-hidden="true" />Assurance</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{patient.insurance}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmData && (
        <ConfirmModal data={confirmData} onConfirm={confirmAdminister} onClose={() => setConfirmData(null)} />
      )}
    </>
  );
}

/* ─── Patient Card (list item) ────────────────────────────────────────────── */
function PatientCard({ patient, onClick }) {
  const totalSlots = (patient.prescriptions||[]).reduce((s,p) => s+(p.slots||[]).length, 0);
  const doneSlots  = (patient.prescriptions||[]).reduce((s,p) => s+(p.slots||[]).filter(sl=>sl.done).length, 0);
  const pct = totalSlots ? Math.round((doneSlots/totalSlots)*100) : 0;
  const pending = totalSlots - doneSlots;
  const isLate = (patient.prescriptions||[]).some(p => (p.slots||[]).some(s => !s.done && s.time < now()));

  return (
    <div
      onClick={onClick}
      style={{
        background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"14px 16px",
        cursor:"pointer", transition:"all .2s", display:"flex", alignItems:"center", gap:14,
        boxShadow:"0 1px 8px rgba(0,0,0,.04)"
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow="0 6px 24px rgba(0,74,173,.10)"; e.currentTarget.style.borderColor="#B3CDF1"; e.currentTarget.style.transform="translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow="0 1px 8px rgba(0,0,0,.04)"; e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.transform="none"; }}
    >
      <div style={{ width:46, height:46, borderRadius:"50%", background:avatarColor(patient.name)+"20", border:`2px solid ${avatarColor(patient.name)}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:700, color:avatarColor(patient.name), flexShrink:0 }}>
        {initiales(patient.name)}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
          <div style={{ fontWeight:700, fontSize:14, color:"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{patient.name}</div>
          {isLate && <span style={{ background:"#fef2f2", color:"#ef4444", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:99, flexShrink:0 }}>En retard</span>}
        </div>
        <div style={{ display:"flex", gap:8, fontSize:11, color:"#64748b", flexWrap:"wrap" }}>
          {patient.room && <span style={{ display:"flex", alignItems:"center", gap:3 }}><Icon.Bed />{patient.room}</span>}
          {patient.doctor && <span style={{ display:"flex", alignItems:"center", gap:3 }}><Icon.User />{patient.doctor}</span>}
        </div>
        <div style={{ marginTop:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#94a3b8", marginBottom:3 }}>
            <span>{doneSlots}/{totalSlots} prises</span>
            <span style={{ fontWeight:700, color: pct===100 ? "#10b981" : pct>60 ? "#3b82f6" : "#f59e0b" }}>{pct}%</span>
          </div>
          <div style={{ height:5, background:"#f1f5f9", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background: pct===100 ? "#10b981" : pct>60 ? "#3b82f6" : "#f59e0b", borderRadius:99, transition:"width .5s ease" }} />
          </div>
        </div>
      </div>
      {pending > 0 && (
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:99, padding:"3px 8px", fontSize:11, fontWeight:700, color:"#ef4444", flexShrink:0 }}>
          {pending} restant{pending>1?"s":""}
        </div>
      )}
      {pct===100 && <CircleCheck size={20} color="#059669" style={{ flexShrink:0 }} aria-hidden="true" />}
    </div>
  );
}

/* ─── KPI Card ────────────────────────────────────────────────────────────── */
function KpiCard({ icon, label, value, color, sub }) {
  const Ico = icon;
  return (
    <div style={{ background:"#fff", borderRadius:14, padding:"18px 20px", border:"1px solid #e2e8f0", boxShadow:"0 2px 12px rgba(0,0,0,.04)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>{label}</div>
          <div style={{ fontSize:28, fontWeight:700, color }}>{value}</div>
          {sub && <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{sub}</div>}
        </div>
        <div style={{ width:38, height:38, borderRadius:10, background:color+"14", color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Ico size={18} aria-hidden="true" /></div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function NurseDashboardPage() {
  const user = useAuthStore(s => s.user);
  // POST /nurse/alert est réservé à nurse et admin côté serveur (le médecin reçoit les alertes)
  const canSendAlert = user?.role === 'nurse' || user?.role === 'admin';
  // POST /hospitalisations/:id/vitals : mêmes rôles
  const canSaveHospVitals = canSendAlert;
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  // Échec du dernier chargement : jamais de données de remplacement, les dernières données réelles restent affichées
  const [loadError, setLoadError] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null);
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Live clock
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", second:"2-digit" }));
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", second:"2-digit" })), 1000);
    return () => clearInterval(iv);
  }, []);

  /* WebSocket — nouvelle ordonnance ou alerte retour médecin */
  useSocket({
    // Émis par PATCH /prescriptions/:id/status à la remise ; charge utile dans data.data
    meds_delivered: (data) => {
      toast.success(`Nouvelle ordonnance remise pour ${data.data?.patientNom || 'un patient'}`, { duration:7000 });
      fetchPatients();
    }
  });

  const fetchPatients = useCallback(async () => {
    try {
      // Charger les médicaments (patients avec ordonnances)
      const res = await api.get("/nurse/medications");
      const prescriptions = res.data || [];

      // Grouper par patient
      const patientMap = {};
      prescriptions.forEach(p => {
        const pid = p.patientId || p.patientNom;
        if (!patientMap[pid]) {
          patientMap[pid] = {
            id: pid,
            name: p.patientNom,
            cin: p.patientCin,
            room: p.room,
            age: p.age,
            hospitalisationId: p.hospitalisationId,
            doctor: p.doctor,
            allergies: [],
            chronic: [],
            bloodType: null,
            insurance: null,
            rdvAujourdhui: null,
            prescriptions: []
          };
        }
        patientMap[pid].prescriptions.push(p);
      });

      // Enrichir avec les données de la file d'attente (vitals, rdv)
      try {
        const queueRes = await api.get("/nurse/queue");
        const queue = queueRes.data || [];
        queue.forEach(rdv => {
          // Par CIN (unique dans la clinique) : le nom affiché peut être partagé par des homonymes (V4)
          const match = rdv.patientCin && Object.values(patientMap).find(p => p.cin === rdv.patientCin);
          if (match) {
            match.rdvAujourdhui = { id: rdv.id, vitals: rdv.vitals };
          }
        });
      } catch { /* facultatif : l'échec est sans conséquence ici */ }

      setPatients(Object.values(patientMap));
      setLastRefresh(new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }));
      setLoadError(false);
    } catch (err) {
      console.error("[NURSE DASHBOARD] Fetch error:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
    const iv = setInterval(fetchPatients, 30000);
    return () => clearInterval(iv);
  }, [fetchPatients]);

  /* Administer un créneau */
  const handleAdminister = useCallback(async (prescriptionId, itemId, slotIndex) => {
    try {
      await api.post(`/nurse/prescriptions/${prescriptionId}/administer`, { itemId, slotIndex, done: true });
      toast.success("Administration enregistrée");
      await fetchPatients();
      // Refresh le panneau patient sélectionné
      if (selectedPatient) {
        setSelectedPatient(prev => {
          const updated = patients.find(p => p.id === prev?.id);
          return updated || prev;
        });
      }
    } catch { toast.error("Erreur lors de l'enregistrement"); }
  }, [fetchPatients, selectedPatient, patients]);

  /* Envoyer une alerte au médecin */
  const handleSendAlert = useCallback(async (message, urgency) => {
    try {
      await api.post("/nurse/alert", {
        patientId: alertTarget?.id,
        patientName: alertTarget?.name,
        message,
        urgency
      });
      toast.success("Alerte envoyée au médecin", { duration:5000 });
    } catch {
      toast.error("Erreur lors de l'envoi de l'alerte");
    }
  }, [alertTarget]);

  /* Trouver patient sélectionné avec données fraîches */
  const freshSelectedPatient = selectedPatient
    ? (patients.find(p => p.id === selectedPatient.id) || selectedPatient)
    : null;

  /* KPIs */
  const totalPrescriptions = patients.reduce((s, p) => s + p.prescriptions.length, 0);
  const totalSlots = patients.reduce((s, p) => s + p.prescriptions.reduce((s2, pr) => s2 + (pr.slots||[]).length, 0), 0);
  const doneSlots  = patients.reduce((s, p) => s + p.prescriptions.reduce((s2, pr) => s2 + (pr.slots||[]).filter(sl=>sl.done).length, 0), 0);
  const pendingSlots = totalSlots - doneSlots;
  const lateSlots = patients.reduce((s, p) => s + p.prescriptions.reduce((s2, pr) => s2 + (pr.slots||[]).filter(sl => !sl.done && sl.time < now()).length, 0), 0);

  /* Filtres */
  const doctors = [...new Set(patients.map(p=>p.doctor).filter(Boolean))];
  const filteredPatients = patients.filter(p => {
    if (filterDoctor !== "all" && p.doctor !== filterDoctor) return false;
    if (filterStatus === "complete") {
      const t = p.prescriptions.reduce((s,pr)=>s+(pr.slots||[]).length,0);
      const d = p.prescriptions.reduce((s,pr)=>s+(pr.slots||[]).filter(sl=>sl.done).length,0);
      return t > 0 && t === d;
    }
    if (filterStatus === "pending") {
      const t = p.prescriptions.reduce((s,pr)=>s+(pr.slots||[]).length,0);
      const d = p.prescriptions.reduce((s,pr)=>s+(pr.slots||[]).filter(sl=>sl.done).length,0);
      return t > d;
    }
    return true;
  });

  const dateStr = new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

  return (
    <>
      <style>{`
        .nurse-dash * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes ndSlideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes ndPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ndSpin { to{transform:rotate(360deg)} }
        .nd-card-anim { animation: ndSlideUp .3s ease both; }
        .nd-btn:hover { opacity:.88; transform:translateY(-1px); }

      `}</style>

      <div className="nurse-dash" style={{ minHeight:"100vh", color:"#0f172a" }}>

        {/* ── Top Bar ── */}
        <div style={{ background:"#fff", border:"1px solid #e6eaf0", borderRadius:16, padding:"14px 20px", position:"sticky", top:0, zIndex:40, boxShadow:"0 1px 2px rgb(16 24 40 / .04)", display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:"#EEF4FC", color:"#004AAD", display:"flex", alignItems:"center", justifyContent:"center" }}><Syringe size={20} aria-hidden="true" /></div>
            <div>
              <div style={{ fontWeight:700, fontSize:17, letterSpacing:"-.01em" }}>Plan de Soins Numérique</div>
              <div style={{ fontSize:12, color:"#64748b", textTransform:"capitalize" }}>{dateStr}</div>
            </div>
          </div>

          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:12 }}>
            {lateSlots > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:6, background:"#fef2f2", color:"#dc2626", padding:"6px 12px", borderRadius:99, fontSize:12, fontWeight:700 }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:"#dc2626", display:"inline-block" }} />
                {lateSlots} prise{lateSlots>1?"s":""} en retard
              </div>
            )}
            <button onClick={fetchPatients} className="nd-btn" style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", transition:"all .15s" }}>
              <Icon.Refresh /> Actualiser
            </button>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f8fafc", border:"1px solid #e2e8f0", padding:"7px 14px", borderRadius:99 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#EEF4FC", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#004AAD", fontWeight:700 }}>
                {initiales(user?.name||"Inf")}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>{user?.name||"Infirmier(e)"}</div>
                <div style={{ fontSize:10, color:"#94a3b8" }}>Service Infirmier</div>
              </div>
            </div>
            <div style={{ fontSize:15, fontWeight:600, color:"#475569", fontVariantNumeric:"tabular-nums", minWidth:70 }}>{clock}</div>
          </div>
        </div>

        <div style={{ padding:"24px 0", maxWidth:1200, margin:"0 auto" }}>

          {/* ── KPIs ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:24 }}>
            <div className="nd-card-anim" style={{ animationDelay:".0s" }}>
              <KpiCard icon={Users} label="Patients suivis" value={patients.length} color="#004AAD" sub={`${totalPrescriptions} ordonnance${totalPrescriptions>1?"s":""}`} />
            </div>
            <div className="nd-card-anim" style={{ animationDelay:".05s" }}>
              <KpiCard icon={CircleCheck} label="Prises effectuées" value={doneSlots} color="#10b981" sub={`sur ${totalSlots} au total`} />
            </div>
            <div className="nd-card-anim" style={{ animationDelay:".10s" }}>
              <KpiCard icon={Hourglass} label="Prises restantes" value={pendingSlots} color={pendingSlots>0?"#f59e0b":"#10b981"} sub={pendingSlots>0 ? "À administrer" : "Tout effectué"} />
            </div>
            <div className="nd-card-anim" style={{ animationDelay:".15s" }}>
              <KpiCard icon={TriangleAlert} label="En retard" value={lateSlots} color={lateSlots>0?"#ef4444":"#10b981"} sub={lastRefresh ? `Mise à jour ${lastRefresh}` : "En temps réel"} />
            </div>
          </div>

          {/* ── Filtres ── */}
          <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em" }}>Filtrer :</span>
            {/* Statut */}
            {[
              { v:"all",      label:"Tous" },
              { v:"pending",  label:"En attente" },
              { v:"complete", label:"Terminés" },
            ].map(f => (
              <button key={f.v} onClick={() => setFilterStatus(f.v)} style={{ padding:"6px 14px", borderRadius:99, cursor:"pointer", background: filterStatus===f.v ? "#004AAD" : "#fff", color: filterStatus===f.v ? "#fff" : "#64748b", fontSize:12, fontWeight:600, border:`1px solid ${filterStatus===f.v ? "transparent" : "#e2e8f0"}`, transition:"all .15s" }}>{f.label}</button>
            ))}
            {doctors.length > 0 && (
              <>
                <div style={{ width:1, height:18, background:"#e2e8f0" }} />
                <button onClick={() => setFilterDoctor("all")} style={{ padding:"6px 14px", borderRadius:99, cursor:"pointer", background: filterDoctor==="all" ? "#0f172a" : "#fff", color: filterDoctor==="all" ? "#fff" : "#64748b", fontSize:12, fontWeight:600, border:`1px solid ${filterDoctor==="all" ? "transparent" : "#e2e8f0"}`, transition:"all .15s" }}>Tous médecins</button>
                {doctors.map(d => (
                  <button key={d} onClick={() => setFilterDoctor(filterDoctor===d ? "all" : d)} style={{ padding:"6px 14px", borderRadius:99, cursor:"pointer", background: filterDoctor===d ? "#0f172a" : "#fff", color: filterDoctor===d ? "#fff" : "#64748b", fontSize:12, fontWeight:600, border:`1px solid ${filterDoctor===d ? "transparent" : "#e2e8f0"}`, transition:"all .15s" }}>{d}</button>
                ))}
              </>
            )}
          </div>

          {/* ── Erreur de chargement ── */}
          {!loading && loadError && (
            <div role="alert" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", padding:"12px 16px", marginBottom:12, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12, color:"#991b1b", fontSize:13, fontWeight:600 }}>
              <span>
                {patients.length > 0
                  ? `Impossible d'actualiser les données : affichage de la dernière mise à jour (${lastRefresh}).`
                  : "Impossible de charger les patients. Vérifiez la connexion au serveur."}
              </span>
              <button onClick={() => { setLoading(true); fetchPatients(); }} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #fca5a5", background:"#fff", color:"#991b1b", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                Réessayer
              </button>
            </div>
          )}

          {/* ── Liste patients ── */}
          {loading ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
              <LoaderCircle size={30} style={{ animation:"ndSpin 1s linear infinite", display:"inline-block", marginBottom:12 }} aria-hidden="true" />
              <div style={{ fontWeight:600 }}>Chargement des données…</div>
            </div>
          ) : loadError && patients.length === 0 ? null : filteredPatients.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", background:"#fff", borderRadius:16, border:"1px solid #e2e8f0" }}>
              <BedDouble size={40} strokeWidth={1.5} color="#94a3b8" style={{ display:"block", margin:"0 auto 12px" }} aria-hidden="true" />
              <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Aucun patient à afficher</div>
              <div style={{ fontSize:13, color:"#94a3b8" }}>Aucun patient hospitalisé avec ordonnance active pour le moment.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>
                  {filteredPatients.length} patient{filteredPatients.length>1?"s":""} — Plan de soins actif
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#94a3b8" }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background: loadError ? "#ef4444" : "#10b981", display:"inline-block", animation: loadError ? "none" : "ndPulse 2s infinite" }} />
                  {loadError ? "Synchronisation interrompue" : "Synchronisation temps réel active"}
                </div>
              </div>
              {filteredPatients.map((p, i) => (
                <div key={p.id} className="nd-card-anim" style={{ animationDelay:`${i*.04}s` }}>
                  <PatientCard patient={p} onClick={() => setSelectedPatient(p)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Side Panel ── */}
      {freshSelectedPatient && (
        <PatientPanel
          patient={freshSelectedPatient}
          onClose={() => setSelectedPatient(null)}
          onAlertClick={canSendAlert ? () => { setAlertTarget(freshSelectedPatient); } : undefined}
          onAdminister={handleAdminister}
          onSaveVitals={fetchPatients}
          canSaveHospVitals={canSaveHospVitals}
        />
      )}

      {/* ── Alert Modal ── */}
      {alertTarget && (
        <AlertModal
          patient={alertTarget}
          onClose={() => setAlertTarget(null)}
          onSend={handleSendAlert}
        />
      )}
    </>
  );
}
