import { useState, useMemo, useEffect, useCallback } from "react";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";
import { ClipboardList, Pill, Truck, CircleCheck, Info, Syringe } from "lucide-react";

const STATUS_META = {
  pending:      { label: "En attente",  color: "#f59e0b", bg: "#f59e0b18", icon: ClipboardList, step: 0 },
  prepared:     { label: "Préparé",     color: "#3b82f6", bg: "#3b82f618", icon: Pill, step: 1 },
  delivered:    { label: "Livré",       color: "#0891b2", bg: "#0891b218", icon: Truck, step: 2 },
  administered: { label: "Administré",  color: "#10b981", bg: "#10b98118", icon: CircleCheck, step: 3 },
};

const MOMENT_COLOR = {
  "Avant repas": "#f59e0b", "Après repas": "#10b981",
  "Pendant repas": "#3b82f6", "Au coucher": "#0891b2",
};

const Ic = {
  Check: ({ s = 14 }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: s, height: s }}><polyline points="20 6 9 17 4 12" /></svg>,
  User:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 13, height: 13 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Home:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 13, height: 13 }}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 13, height: 13 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Pill:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></svg>,
};

function FlowStepper({ status }) {
  const steps = ["pending", "prepared", "delivered", "administered"];
  const cur = STATUS_META[status].step;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 6 }}>
      {steps.map((s, i) => {
        const m = STATUS_META[s];
        const done = cur > i;
        const active = cur === i;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: done ? m.color : active ? m.color + "33" : "#e2e8f0",
                border: `2px solid ${done || active ? m.color : "#cbd5e1"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: done ? "#fff" : active ? m.color : "#64748b",
                transition: "all .3s"
              }}>
                {done ? <Ic.Check s={11} /> : <m.icon size={12} aria-hidden="true" />}
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em",
                color: done || active ? m.color : "#94a3b8", whiteSpace: "nowrap"
              }}>{m.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 32, height: 2, margin: "0 3px 14px",
                background: done ? m.color : "#e2e8f0", transition: "background .3s"
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PrescCard({ presc, patient, role, canAct, onAction }) {
  const [open, setOpen] = useState(true);
  const m = STATUS_META[presc.status];

  const ACTION = {
    pharmacist: { pending:  { label: "Marquer comme préparé",   color: "#3b82f6", next: "prepared"  } },
    nurse:      { prepared: { label: "Confirmer la livraison",  color: "#0891b2", next: "delivered" } },
  };
  const myAction = canAct ? ACTION[role]?.[presc.status] : null;

  return (
    <div style={{
      background: "#ffffff", border: `1px solid ${m.color}33`,
      borderRadius: 16, overflow: "hidden",
      boxShadow: `0 4px 24px ${m.color}11`,
      animation: "slideUp .3s ease both"
    }}>
      {/* Header */}
      <div onClick={() => setOpen(o => !o)} style={{
        padding: "16px 20px", borderBottom: open ? "1px solid #e2e8f0" : "none",
        display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start",
        background: `${m.color}08`, cursor: "pointer"
      }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: "#EEF4FC",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 700, color: "#004AAD"
          }}>{patient.name.charAt(0)}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{patient.name}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><Ic.Home />{patient.room || 'Ambulatoire'}</span>
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><Ic.User />{presc.doctor}</span>
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><Ic.Clock />{presc.createdAt}</span>
            </div>
            <FlowStepper status={presc.status} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px",
            borderRadius: 99, fontSize: 12, fontWeight: 700, background: m.bg, color: m.color
          }}><m.icon size={13} aria-hidden="true" /> {m.label}</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>{presc.items.length} médicament{presc.items.length > 1 ? "s" : ""}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "16px 20px" }}>
          {/* Médicaments + slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {presc.items.map(item => {
              const mc = MOMENT_COLOR[item.moment] || "#64748b";
              const itemSlots = presc.slots.filter(sl => sl.itemId === item.id);
              return (
                <div key={item.id} style={{
                  background: "#f8fafc", border: "1px solid #e2e8f0",
                  borderRadius: 10, padding: "12px 14px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#3b82f6" }}><Ic.Pill /></span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{item.med}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {item.dose} · <span style={{ color: mc, fontWeight: 600 }}>{item.moment}</span> · {item.timesPerDay}×/jour
                        </div>
                      </div>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: "#eff6ff", color: "#2563eb"
                    }}>Qté : {item.qty}</span>
                  </div>
                  {itemSlots.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {itemSlots.map((sl, si) => (
                        <div key={si}
                          onClick={() => !sl.done && canAct && role === "nurse" && onAction("slot", presc.id, item.id, si)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 12px", borderRadius: 8,
                            cursor: !sl.done && canAct && role === "nurse" ? "pointer" : "default",
                            background: sl.done ? "#10b98118" : "#f1f5f9",
                            border: `1px solid ${sl.done ? "#10b98144" : "#e6eaf0"}`,
                            transition: "all .15s"
                          }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 6,
                            background: sl.done ? "#10b981" : "#e6eaf0",
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}>
                            {sl.done && <Ic.Check s={10} />}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: sl.done ? "#10b981" : "#0f172a" }}>{sl.label}</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>{sl.time}{sl.done && sl.doneAt ? ` · ${sl.doneAt}` : ""}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Traçabilité */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: myAction ? 14 : 0 }}>
            {presc.preparedAt && (
              <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 6, alignItems: "center" }}>
                <Pill size={12} color="#3b82f6" aria-hidden="true" />
                Préparé par <strong style={{ color: "#0f172a" }}>{presc.preparedBy}</strong> à {presc.preparedAt}
              </div>
            )}
            {presc.deliveredAt && (
              <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 6, alignItems: "center" }}>
                <Truck size={12} color="#0891b2" aria-hidden="true" />
                Livré par <strong style={{ color: "#0f172a" }}>{presc.deliveredBy}</strong> à {presc.deliveredAt}
              </div>
            )}
          </div>

          {/* Bouton action */}
          {myAction && (
            <button onClick={() => onAction("advance", presc.id, myAction.next)} style={{
              width: "100%", padding: "11px", borderRadius: 10, border: "none",
              background: myAction.color,
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
              fontFamily: "inherit"
            }}>{myAction.label}</button>
          )}

          {role === "nurse" && presc.status === "delivered" && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 10,
              background: "#0891b218", border: "1px solid #0891b233",
              fontSize: 12, color: "#0e7490", fontWeight: 600, display: "flex", alignItems: "center", gap: 8
            }}>
              <Info size={14} style={{ flexShrink: 0 }} aria-hidden="true" />Cliquez sur chaque créneau pour confirmer l'administration au patient.
            </div>
          )}
          {role === "nurse" && presc.status === "administered" && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "#10b98118", border: "1px solid #10b98133",
              fontSize: 12, color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: 8
            }}>
              <CircleCheck size={14} style={{ flexShrink: 0 }} aria-hidden="true" />Toutes les prises ont été administrées pour cette ordonnance.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MedicationFlowFull() {
  const [prescriptions, setPrescriptions] = useState([]);
  // Le pharmacien voit la vue pharmacie, l'infirmier la vue soins, sans pouvoir changer.
  // Médecin et admin peuvent consulter les deux vues, mais n'agissent que côté soins (comme le serveur).
  const userRole = useAuthStore(s => s.user?.role);
  const roleFixe = userRole === "pharmacist" || userRole === "nurse";
  const [role, setRole] = useState(userRole === "nurse" ? "nurse" : "pharmacist");
  const canAct = role === "pharmacist" ? userRole === "pharmacist" : userRole !== "pharmacist";
  const [confirmModal, setConfirmModal] = useState(null);

  const fetchPrescriptions = useCallback(async () => {
    try {
      const res = await api.get('/nurse/medications');
      setPrescriptions(res.data);
    } catch (err) {
      console.error("Error fetching prescriptions:", err);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/nurse/medications', { signal: controller.signal })
      .then(response => setPrescriptions(response.data))
      .catch(error => { if (!controller.signal.aborted) console.error('Error fetching prescriptions:', error); });
    return () => controller.abort();
  }, []);

  const PATIENTS = useMemo(() => {
    const list = [];
    const seen = new Set();
    prescriptions.forEach(p => {
      if (!seen.has(p.patientId)) {
        seen.add(p.patientId);
        list.push({
          id: p.patientId,
          name: p.patientNom,
          room: p.room,
          age: p.age,
          doctor: p.doctor
        });
      }
    });
    return list;
  }, [prescriptions]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const stats = useMemo(() => ({
    pending:      prescriptions.filter(p => p.status === "pending").length,
    prepared:     prescriptions.filter(p => p.status === "prepared").length,
    delivered:    prescriptions.filter(p => p.status === "delivered").length,
    administered: prescriptions.filter(p => p.status === "administered").length,
  }), [prescriptions]);

  const visible = useMemo(() => {
    if (role === "pharmacist") return prescriptions.filter(p => ["pending", "prepared"].includes(p.status));
    return prescriptions.filter(p => ["prepared", "delivered", "administered"].includes(p.status));
  }, [prescriptions, role]);

  const handleAction = async (type, prescId, ...args) => {
    if (type === "advance") {
      setConfirmModal({ prescId, nextStatus: args[0] });
    }
    if (type === "slot") {
      const [itemId, slotIndex] = args;
      try {
        await api.post(`/nurse/prescriptions/${prescId}/administer`, {
          itemId,
          slotIndex,
          done: true
        });
        fetchPrescriptions();
      } catch (err) {
        console.error("Administer slot error:", err);
      }
    }
  };

  const confirmAdvance = async () => {
    const { prescId, nextStatus } = confirmModal;
    try {
      await api.post(`/nurse/prescriptions/${prescId}/advance`, {
        nextStatus
      });
      setConfirmModal(null);
      fetchPrescriptions();
    } catch (err) {
      console.error("Advance status error:", err);
    }
  };

  const ROLE_META = {
    pharmacist: { label: "Pharmacien",          icon: Pill, color: "#3b82f6", desc: "Prépare les médicaments depuis le stock" },
    nurse:      { label: "Infirmière / Infirmier",icon: Syringe, color: "#004AAD", desc: "Livre et administre aux patients" },
  };

  return (
    <>
      {/* Variables limitées à la page (thème clair de l'application) : aucune règle globale */}
      <style>{`
        .flux-med { --bg:#f4f6fa; --card:#ffffff; --card2:#f1f5f9; --border:#e6eaf0; --text:#0f172a; --muted:#64748b; }
        .flux-med *, .flux-med *::before, .flux-med *::after { box-sizing:border-box; }
        @keyframes fadeIn  { from{opacity:0}to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes pop     { 0%{transform:scale(.94)}60%{transform:scale(1.03)}100%{transform:scale(1)} }
      `}</style>

      <div className="flux-med" style={{ color: "var(--text)", maxWidth: 1100, margin: "0 auto" }}>

        {/* Top Bar */}
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16,
          padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 12, marginBottom: 20, boxShadow: "0 1px 2px rgb(16 24 40 / .04)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: "#EEF4FC", color: "#004AAD",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}><Pill size={18} aria-hidden="true" /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Flux Médicamenteux</div>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "capitalize" }}>{dateStr}</div>
            </div>
          </div>

          {/* Toggle Rôle */}
          <div style={{ display: "flex", gap: 5, background: "var(--card2)", padding: 4, borderRadius: 12, border: "1px solid var(--border)" }}>
            {Object.entries(ROLE_META).filter(([r]) => !roleFixe || r === role).map(([r, meta]) => (
              <button key={r} onClick={() => setRole(r)} style={{
                padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                background: role === r ? meta.color : "transparent",
                color: role === r ? "#fff" : "var(--muted)",
                fontWeight: 700, fontSize: 13, fontFamily: "inherit",
                transition: "all .2s", display: "flex", alignItems: "center", gap: 6
              }}><meta.icon size={14} aria-hidden="true" /> {meta.label}</button>
            ))}
          </div>

          <div style={{ fontSize: 15, color: "var(--muted)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {timeStr}
          </div>
        </div>

        <div>

          {/* Pipeline KPI */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 1,
            background: "var(--border)", borderRadius: 16, overflow: "hidden",
            marginBottom: 24, border: "1px solid var(--border)"
          }}>
            {Object.entries(STATUS_META).map(([s, m], i) => (
              <div key={s} style={{
                padding: "16px 20px", background: "var(--card)",
                borderRight: i < 3 ? "1px solid var(--border)" : "none"
              }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                  <m.icon size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden="true" />{m.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{stats[s]}</div>
                <div style={{ height: 3, background: "var(--card2)", borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99, background: m.color,
                    width: `${prescriptions.length ? (stats[s] / prescriptions.length) * 100 : 0}%`,
                    transition: "width .5s"
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Contexte rôle */}
          <div style={{
            padding: "11px 18px", borderRadius: 12, marginBottom: 20,
            background: ROLE_META[role].color + "18",
            border: `1px solid ${ROLE_META[role].color}33`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, color: ROLE_META[role].color, fontWeight: 600
          }}>
            {(() => { const RoleIcon = ROLE_META[role].icon; return <RoleIcon size={18} style={{ flexShrink: 0 }} aria-hidden="true" />; })()}
            <span><strong>{ROLE_META[role].label}</strong> — {ROLE_META[role].desc}</span>
            <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 400 }}>
              {visible.length} ordonnance{visible.length > 1 ? "s" : ""} dans ta vue
            </span>
          </div>

          {/* Liste */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {visible.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 60,
                background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)"
              }}>
                <CircleCheck size={36} strokeWidth={1.5} color="#94a3b8" style={{ display: "block", margin: "0 auto 12px" }} aria-hidden="true" />
                <div style={{ fontWeight: 700, color: "var(--muted)" }}>Aucune action requise pour le moment</div>
              </div>
            ) : visible.map((presc, i) => (
              <div key={presc.id} style={{ animationDelay: `${i * .07}s` }}>
                <PrescCard
                  presc={presc}
                  patient={PATIENTS.find(p => p.id === presc.patientId)}
                  role={role}
                  canAct={canAct}
                  onAction={handleAction}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal confirmation */}
      {confirmModal && (() => {
        const presc = prescriptions.find(p => p.id === confirmModal.prescId);
        const patient = PATIENTS.find(p => p.id === presc.patientId);
        const next = STATUS_META[confirmModal.nextStatus];
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(5,10,20,.8)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn .15s ease"
          }}>
            <div style={{
              background: "var(--card)", borderRadius: 20, padding: 32,
              width: "100%", maxWidth: 430,
              border: `1px solid ${next.color}44`,
              boxShadow: "0 24px 48px -12px rgb(15 23 42 / .25)",
              animation: "pop .2s ease"
            }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: next.color + "18", color: next.color, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><next.icon size={26} aria-hidden="true" /></div>
                <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: "var(--text)" }}>Confirmer l'action</h3>
                <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
                  Vous allez marquer cette ordonnance comme<br />
                  <strong style={{ color: next.color }}>« {next.label} »</strong>
                </p>
              </div>
              <div style={{
                background: "var(--card2)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "14px 18px", marginBottom: 24
              }}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{patient.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{patient.room || 'Ambulatoire'} · {presc.doctor}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  {presc.items.map(i => i.med).join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmModal(null)} style={{
                  flex: 1, padding: "11px", borderRadius: 10,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted)", fontWeight: 700, fontSize: 14,
                  cursor: "pointer", fontFamily: "inherit"
                }}>Annuler</button>
                <button onClick={confirmAdvance} style={{
                  flex: 2, padding: "11px", borderRadius: 10, border: "none",
                  background: next.color,
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: "pointer", fontFamily: "inherit"
                }}>Confirmer</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
