import { useState, useMemo, useEffect, useCallback } from "react";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";
import { useSocket } from "../../hooks/useSocket";
import toast from "react-hot-toast";

// ── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{width:15,height:15}}><polyline points="20 6 9 17 4 12"/></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  User: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:16,height:16}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Pill: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:15,height:15}}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>,
  Home: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Alert: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};

// ── Composant SlotBadge ──────────────────────────────────────────────────────
function SlotBadge({ slot, onToggle }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", borderRadius: 8,
      background: slot.done ? "#f0fdf4" : "#f8fafc",
      border: `1px solid ${slot.done ? "#bbf7d0" : "var(--border)"}`,
      transition: "all .15s", cursor: "pointer",
      minWidth: 140
    }} onClick={onToggle}>
      <div style={{
        width: 24, height: 24, borderRadius: 6,
        background: slot.done ? "#16a34a" : "#e2e8f0",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", flexShrink: 0, transition: "background .15s"
      }}>
        {slot.done
          ? <Ic.Check />
          : <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>—</span>
        }
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: slot.done ? "#15803d" : "var(--text)" }}>
          {slot.label}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {slot.time}
          {slot.done && slot.doneAt && <span> · {slot.doneAt}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function NurseMedicationTracking() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const user = useAuthStore(s => s.user);
  const nurseName = user?.name || "Infirmier·ère";

  const fetchPrescriptions = useCallback(async () => {
    try {
      const res = await api.get('/nurse/medications');
      setPrescriptions(res.data);
    } catch (err) {
      console.error("Error fetching medications:", err);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/nurse/medications', { signal: controller.signal })
      .then(response => setPrescriptions(response.data))
      .catch(error => { if (!controller.signal.aborted) console.error('Error fetching medications:', error); });
    return () => controller.abort();
  }, []);

  // Notifié en temps réel dès que le pharmacien remet des médicaments
  useSocket({
    meds_delivered: (data) => {
      toast(data.message || 'Médicaments remis par la pharmacie', { icon: '💊', duration: 6000 });
      fetchPrescriptions();
    },
  });

  const PATIENTS = useMemo(() => {
    const list = [];
    const seen = new Set();
    prescriptions.forEach(p => {
      if (p.status === 'delivered' || p.status === 'administered') {
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
      }
    });
    return list;
  }, [prescriptions]);

  const schedules = useMemo(() => {
    const list = [];
    prescriptions.forEach(p => {
      if (p.status === 'delivered' || p.status === 'administered') {
        p.items.forEach(item => {
          const itemSlots = p.slots.filter(sl => sl.itemId === item.id);
          list.push({
            id: `${p.id}-${item.id}`,
            prescriptionId: p.id,
            itemId: item.id,
            patientId: p.patientId,
            med: item.med,
            dose: item.dose,
            moment: item.moment,
            timesPerDay: item.timesPerDay,
            slots: itemSlots
          });
        });
      }
    });
    return list;
  }, [prescriptions]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const patientSchedules = (pid) => schedules.filter(s => s.patientId === pid);

  const patientProgress = (pid) => {
    const pScheds = patientSchedules(pid);
    const total = pScheds.reduce((s, sc) => s + sc.slots.length, 0);
    const done = pScheds.reduce((s, sc) => s + sc.slots.filter(sl => sl.done).length, 0);
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  const pendingNow = useMemo(() => {
    return schedules.reduce((acc, sc) => {
      sc.slots.forEach((sl, si) => {
        if (!sl.done) {
          const patient = PATIENTS.find(p => p.id === sc.patientId);
          acc.push({ scheduleId: sc.id, slotIndex: si, patient, slot: sl, med: sc.med, dose: sc.dose, moment: sc.moment });
        }
      });
      return acc;
    }, []);
  }, [schedules, PATIENTS]);

  const handleToggle = async (scheduleId, slotIndex) => {
    const sc = schedules.find(s => s.id === scheduleId);
    const slot = sc.slots[slotIndex];
    if (!slot.done) {
      setConfirmModal({ scheduleId, slotIndex, sc, slot });
    } else {
      // unmark
      try {
        await api.post(`/nurse/prescriptions/${sc.prescriptionId}/administer`, {
          itemId: sc.itemId,
          slotIndex,
          done: false
        });
        fetchPrescriptions();
      } catch (err) {
        console.error("Unmark slot error:", err);
      }
    }
  };

  const confirmAdministration = async () => {
    const { sc, slotIndex } = confirmModal;
    try {
      await api.post(`/nurse/prescriptions/${sc.prescriptionId}/administer`, {
        itemId: sc.itemId,
        slotIndex,
        done: true
      });
      setConfirmModal(null);
      fetchPrescriptions();
    } catch (err) {
      console.error("Administer slot error:", err);
    }
  };

  const displayedPatients = selectedPatient
    ? PATIENTS.filter(p => p.id === selectedPatient)
    : PATIENTS;

  return (
    <>
      {/* Variables limitées à la page : aucune règle globale (elles écrasaient la mise en page de l'application) */}
      <style>{`
        .suivi-prises {
          --bg: #f4f6fa;
          --card: #ffffff;
          --card2: #f8fafc;
          --border: #e6eaf0;
          --text: #0f172a;
          --muted: #64748b;
          --accent: #004AAD;
        }
        .suivi-prises *, .suivi-prises *::before, .suivi-prises *::after { box-sizing: border-box; }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes pop     { 0%{transform:scale(.97)} 100%{transform:scale(1)} }
        .card-hover { transition: box-shadow .15s, border-color .15s; }
        .card-hover:hover { box-shadow: 0 2px 12px rgba(15,23,42,.06); border-color: #cbd5e1; }
      `}</style>

      <div className="suivi-prises" style={{ color: "var(--text)", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Top Bar ── */}
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16,
          padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 12, marginBottom: 20, boxShadow: "0 1px 2px rgb(16 24 40 / .04)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff"
            }}><Ic.Pill /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-.01em" }}>Suivi des Prises</div>
              <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "capitalize" }}>{dateStr}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {pendingNow.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#fef3c7", color: "#92400e",
                padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600
              }}>
                <Ic.Alert />
                {pendingNow.length} prise{pendingNow.length > 1 ? "s" : ""} en attente
              </div>
            )}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--card2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "6px 12px"
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: "#fff", fontWeight: 700
              }}>{nurseName.charAt(0).toUpperCase()}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{nurseName}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Infirmier·ère</div>
              </div>
            </div>
            <div style={{
              fontFamily: "monospace",
              fontSize: 18, fontWeight: 500,
              color: "var(--text)", letterSpacing: ".02em"
            }}>{timeStr}</div>
          </div>
        </div>

        <div>

          {/* ── KPI Row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginBottom: 28 }}>
            {[
              { label: "Patients hospitalisés", value: PATIENTS.length },
              { label: "Prises effectuées", value: schedules.reduce((s, sc) => s + sc.slots.filter(sl => sl.done).length, 0) },
              { label: "Prises en attente", value: pendingNow.length },
              { label: "Médicaments actifs", value: schedules.length },
            ].map((k, i) => (
              <div key={i} style={{
                background: "var(--card)", borderRadius: 12, padding: "16px 18px",
                border: "1px solid var(--border)",
                animation: `slideUp .25s ease both`, animationDelay: `${i * .04}s`
              }}>
                <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{k.label}</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "var(--text)" }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── Filter patients ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            <button onClick={() => setSelectedPatient(null)} style={{
              padding: "7px 16px", borderRadius: 8, cursor: "pointer",
              background: !selectedPatient ? "var(--accent)" : "var(--card)",
              color: !selectedPatient ? "#fff" : "var(--muted)",
              fontWeight: 600, fontSize: 13, fontFamily: "inherit",
              border: `1px solid ${!selectedPatient ? "var(--accent)" : "var(--border)"}`,
              transition: "all .15s"
            }}>Tous les patients</button>
            {PATIENTS.map(p => {
              const prog = patientProgress(p.id);
              const active = selectedPatient === p.id;
              return (
                <button key={p.id} onClick={() => setSelectedPatient(active ? null : p.id)} style={{
                  padding: "7px 16px", borderRadius: 8, cursor: "pointer",
                  background: active ? "var(--accent)" : "var(--card)",
                  color: active ? "#fff" : "var(--text)",
                  fontWeight: 600, fontSize: 13, fontFamily: "inherit",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", gap: 6, transition: "all .15s"
                }}>
                  <span>{(p.name || "Patient").split(" ")[0]}</span>
                  <span style={{
                    padding: "2px 7px", borderRadius: 6, fontSize: 11,
                    background: active ? "rgba(255,255,255,.25)" : prog.pct === 100 ? "#dcfce7" : "#f1f5f9",
                    color: active ? "#fff" : prog.pct === 100 ? "#15803d" : "var(--muted)",
                    fontWeight: 700
                  }}>{prog.pct}%</span>
                </button>
              );
            })}
          </div>

          {/* ── Patient Cards ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {displayedPatients.length === 0 ? (
              <div style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "48px 24px", textAlign: "center",
                color: "var(--muted)"
              }}>
                <div style={{ fontSize: 32, marginBottom: 12, color: "var(--muted)" }}><Ic.Pill /></div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Aucune prise à effectuer</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Les médicaments apparaîtront ici dès que les ordonnances auront été préparées par la pharmacie et remises à l'infirmerie.
                </div>
              </div>
            ) : (
              displayedPatients.map((patient, pi) => {
                const prog = patientProgress(patient.id);
                const pScheds = patientSchedules(patient.id);
                return (
                  <div key={patient.id} className="card-hover" style={{
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 12, overflow: "hidden",
                    animation: `slideUp .25s ease both`, animationDelay: `${pi * .05}s`
                  }}>
                    {/* Patient Header */}
                    <div style={{
                      padding: "16px 22px", borderBottom: "1px solid var(--border)",
                      display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center",
                      background: "var(--card2)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 10,
                          background: "var(--accent)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, color: "#fff", fontWeight: 700
                        }}>{(patient.name || "P").charAt(0)}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.name || "Patient sans nom"}</div>
                          <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
                            <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                              <Ic.Home /> {patient.room || 'Ambulatoire'}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                              <Ic.User /> {patient.doctor}{patient.age != null && ` · ${patient.age} ans`}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Progress */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 500 }}>
                          {prog.done}/{prog.total} prises aujourd'hui
                        </div>
                        <div style={{ width: 160, height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 99, transition: "width .4s ease",
                            width: `${prog.pct}%`,
                            background: prog.pct === 100 ? "#16a34a" : "var(--accent)"
                          }} />
                        </div>
                        <div style={{
                          fontSize: 12, fontWeight: 700, marginTop: 4,
                          color: prog.pct === 100 ? "#16a34a" : "var(--accent)"
                        }}>{prog.pct}%</div>
                      </div>
                    </div>

                    {/* Medications */}
                    <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                      {pScheds.map(sc => {
                        const allDone = sc.slots.every(sl => sl.done);
                        return (
                          <div key={sc.id} style={{
                            border: `1px solid ${allDone ? "#bbf7d0" : "var(--border)"}`,
                            borderRadius: 10, padding: "14px 16px",
                            background: allDone ? "#f0fdf4" : "var(--card2)",
                            transition: "all .15s"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: 8,
                                  background: "#eef2ff", color: "var(--accent)", display: "flex",
                                  alignItems: "center", justifyContent: "center"
                                }}><Ic.Pill /></div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{sc.med}</div>
                                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                                    {sc.dose} · {sc.moment} · {sc.timesPerDay}x/jour
                                  </div>
                                </div>
                              </div>
                              {allDone && (
                                <span style={{
                                  padding: "4px 12px", borderRadius: 6,
                                  background: "#dcfce7", color: "#15803d",
                                  fontSize: 11, fontWeight: 700
                                }}>✓ Terminé</span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {sc.slots.length === 0 ? (
                                <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                                  Aucun créneau généré — en attente de la remise pharmacie.
                                </span>
                              ) : sc.slots.map((slot, si) => (
                                <SlotBadge key={si} slot={slot} onToggle={() => handleToggle(sc.id, si)} />
                              ))}
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
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      {confirmModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn .15s ease"
        }}>
          <div style={{
            background: "var(--card)", borderRadius: 14, padding: 28,
            width: "100%", maxWidth: 400, boxShadow: "0 20px 50px rgba(0,0,0,.15)",
            animation: "pop .15s ease"
          }}>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: "#eef2ff", color: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px"
              }}><Ic.Pill /></div>
              <h3 style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Confirmer l'administration</h3>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                Vous confirmez avoir administré :
              </p>
            </div>
            <div style={{
              background: "var(--card2)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "14px 16px", marginBottom: 22
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{confirmModal.sc.med}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {confirmModal.sc.dose} · {confirmModal.sc.moment}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <Ic.User />
                {PATIENTS.find(p => p.id === confirmModal.sc.patientId)?.name || "Patient"}
                · {confirmModal.slot.label} ({confirmModal.slot.time})
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmModal(null)} style={{
                flex: 1, padding: "10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted)", fontWeight: 600, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit"
              }}>Annuler</button>
              <button onClick={confirmAdministration} style={{
                flex: 2, padding: "10px", borderRadius: 8, border: "none",
                background: "var(--accent)",
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit"
              }}>✓ Confirmer l'administration</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
