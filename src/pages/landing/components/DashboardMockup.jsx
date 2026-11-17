import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Pill,
  Receipt,
  ScanLine,
  Users,
  FlaskConical,
} from 'lucide-react';
import CountUp from './ui/CountUp';
import { ease } from './ui/motion';

/* Valeurs de démonstration, purement illustratives. */
const kpis = [
  { label: 'RDV du jour', value: 24, icon: CalendarDays, tone: 'bg-brand-50 text-brand-700' },
  { label: 'En salle d’attente', value: 6, icon: Users, tone: 'bg-emerald-50 text-emerald-700' },
  { label: 'Alertes stock', value: 3, icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700' },
];

const waiting = [
  { name: 'Salma B.', reason: 'Consultation · Dr. Alaoui', status: 'En salle', tone: 'bg-emerald-50 text-emerald-700' },
  { name: 'Youssef K.', reason: 'Bilan sanguin · Labo', status: 'Prélèvement', tone: 'bg-brand-50 text-brand-700' },
  { name: 'Nadia E.', reason: 'Contrôle · Dr. Tazi', status: 'Arrivée', tone: 'bg-slate-100 text-slate-700' },
];

const nav = [
  { label: 'Tableau de bord', icon: LayoutDashboard, active: true },
  { label: 'Patients', icon: Users },
  { label: 'Agenda', icon: CalendarDays },
  { label: 'Pharmacie', icon: Pill },
  { label: 'Laboratoire', icon: FlaskConical },
  { label: 'Facturation', icon: Receipt },
];

const week = [
  { day: 'L', value: 62 },
  { day: 'M', value: 80 },
  { day: 'M', value: 48 },
  { day: 'J', value: 88 },
  { day: 'V', value: 72 },
  { day: 'S', value: 96 },
  { day: 'D', value: 30 },
];

/* Notifications temps réel qui défilent dans la carte flottante. */
const notifications = [
  { icon: ScanLine, tone: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', ping: 'bg-emerald-400', label: 'text-emerald-700', title: 'Nouveau patient enregistré par OCR', desc: 'CIN lue automatiquement' },
  { icon: FlaskConical, tone: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500', ping: 'bg-brand-400', label: 'text-brand-700', title: 'Résultats de laboratoire prêts', desc: 'Bilan sanguin · Youssef K.' },
  { icon: Receipt, tone: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500', ping: 'bg-violet-400', label: 'text-violet-700', title: 'Facture FAC-0143 réglée', desc: '350,00 MAD · Espèces' },
];

function LiveNotification() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % notifications.length), 3600);
    return () => clearInterval(id);
  }, [reduce]);

  const n = notifications[index];
  const Icon = n.icon;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.96 }}
        transition={{ duration: 0.35, ease }}
        className="flex items-start gap-3"
      >
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${n.tone}`}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${n.label}`}>
            <span className="relative flex size-1.5">
              <span className={`absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping ${n.ping}`} />
              <span className={`relative inline-flex size-1.5 rounded-full ${n.dot}`} />
            </span>
            Temps réel · à l’instant
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-900">{n.title}</div>
          <div className="text-[11px] text-slate-500">{n.desc}</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function DashboardMockup() {
  const reduce = useReducedMotion();

  /* Inclinaison 3D qui suit la souris */
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 150, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 150, damping: 18 });
  const onPointerMove = (e) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
  };
  const onPointerLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      className="relative mx-auto w-full max-w-xl lg:max-w-none"
      aria-hidden="true"
      style={{ transformPerspective: 1400 }}
      initial={reduce ? false : { opacity: 0, y: 70, rotateX: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ duration: 1.2, delay: 0.4, ease }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <motion.div className="relative" style={{ rotateX, rotateY, transformPerspective: 1400, transformStyle: 'preserve-3d' }}>
        {/* Lueur de marque derrière la fenêtre */}
        <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-gradient opacity-20 blur-3xl" />

        {/* Fenêtre */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-brand-900/15 ring-1 ring-slate-900/10">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
              app.clinicsoft.ma/dashboard
            </span>
          </div>

          <div className="flex bg-slate-50/60">
            {/* Barre latérale */}
            <div className="hidden w-44 shrink-0 flex-col gap-1 bg-brand-900 p-3 sm:flex">
              <div className="mb-3 px-2 pt-1 text-sm font-bold text-white">NextClinic</div>
              {nav.map(({ label, icon, active }) => {
                const Icon = icon;
                return (
                  <div
                    key={label}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${active ? 'bg-white/15 font-semibold text-white' : 'text-brand-100/80'}`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Contenu */}
            <div className="min-w-0 flex-1 space-y-3 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-900">Bonjour, Dr. Alaoui</div>
                  <div className="text-[11px] text-slate-500">Mardi · Clinique Atlas</div>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                  Données de démo
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {kpis.map(({ label, value, icon, tone }) => {
                  const Icon = icon;
                  return (
                    <div key={label} className="rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
                      <span className={`inline-flex size-6 items-center justify-center rounded-md ${tone}`}>
                        <Icon className="size-3.5" />
                      </span>
                      <div className="mt-1.5 text-lg leading-none font-extrabold text-slate-900">
                        <CountUp to={value} delay={0.9} />
                      </div>
                      <div className="mt-1 truncate text-[10px] text-slate-500">{label}</div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-5">
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 sm:col-span-3">
                  <div className="mb-2 text-xs font-semibold text-slate-900">Patients en salle d’attente</div>
                  <ul className="space-y-2">
                    {waiting.map((p, i) => (
                      <motion.li
                        key={p.name}
                        className="flex items-center justify-between gap-2"
                        initial={reduce ? false : { opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 1 + i * 0.12, ease }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                            {p.name[0]}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-semibold text-slate-800">{p.name}</div>
                            <div className="truncate text-[10px] text-slate-500">{p.reason}</div>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.tone}`}>{p.status}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 sm:col-span-2">
                  <div className="mb-2 text-xs font-semibold text-slate-900">Consultations</div>
                  <div className="flex h-20 items-end gap-1.5">
                    {week.map((d, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <motion.div
                          className={`w-full rounded-sm ${i === 5 ? 'bg-linear-to-t from-brand-700 to-brand-500' : 'bg-brand-100'}`}
                          initial={reduce ? false : { height: 0 }}
                          animate={{ height: d.value * 0.6 }}
                          transition={{ duration: 0.8, delay: 0.9 + i * 0.07, ease }}
                        />
                        <span className="text-[9px] text-slate-400">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <FileText className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-slate-800">Facture FAC-0142 générée</div>
                    <div className="text-[10px] text-slate-500">350,00 MAD · PDF prêt</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-semibold text-white">Télécharger</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carte flottante : notifications temps réel (défilantes) */}
        <motion.div
          className="absolute top-20 -left-3 hidden sm:block lg:-left-10"
          style={{ z: 60 }}
          initial={reduce ? false : { opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 1.3, ease }}
        >
          <div className="w-64 rounded-2xl bg-white/95 p-3 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 backdrop-blur motion-safe:animate-float">
            <LiveNotification />
          </div>
        </motion.div>

        {/* Carte flottante : alerte stock */}
        <motion.div
          className="absolute -right-3 -bottom-6 hidden sm:block lg:-right-6"
          style={{ z: 40 }}
          initial={reduce ? false : { opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 1.5, ease }}
        >
          <div className="w-56 rounded-2xl bg-white/95 p-3 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 backdrop-blur motion-safe:animate-float-slow">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Pill className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">Stock faible</div>
                <div className="text-[11px] text-slate-500">Amoxicilline 1 g · 8 boîtes</div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
