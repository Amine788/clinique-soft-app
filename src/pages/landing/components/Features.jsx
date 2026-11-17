import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BellRing, CheckCircle2, FlaskConical, LayoutGrid, Pill, ScanLine, Users } from 'lucide-react';
import { features } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';
import { ease, trackPointer } from './ui/motion';

const sizeClasses = {
  hero: 'sm:col-span-2 lg:row-span-2',
  wide: 'sm:col-span-2',
  sm: '',
};

/* Visuel : lecture OCR d'une CIN (illustratif) — ligne de scan + champs reconnus un à un */
function OcrVisual() {
  const reduce = useReducedMotion();
  const fields = [
    ['Nom', 'EL AMRANI'],
    ['Prénom', 'SALMA'],
    ['N° CIN', 'JB•••••'],
    ['Naissance', '12/04/1990'],
  ];
  return (
    <div className="mt-auto grid gap-4 pt-8 sm:grid-cols-[1fr_1.1fr] sm:items-center" aria-hidden="true">
      <div className="relative aspect-[1.6/1] overflow-hidden rounded-xl bg-linear-to-br from-brand-50 to-brand-100 p-3 ring-1 ring-brand-100">
        <div className="text-[9px] font-bold tracking-widest text-brand-700 uppercase">Carte nationale</div>
        <div className="mt-2 flex gap-3">
          <div className="h-14 w-11 rounded-md bg-white/80 ring-1 ring-brand-100" />
          <div className="flex-1 space-y-1.5 pt-1">
            <div className="h-1.5 w-4/5 rounded bg-brand-200" />
            <div className="h-1.5 w-3/5 rounded bg-brand-200" />
            <div className="h-1.5 w-2/3 rounded bg-brand-200" />
            <div className="h-1.5 w-1/2 rounded bg-brand-200" />
          </div>
        </div>
        {/* Faisceau de scan */}
        <div className="absolute inset-x-2 top-1/2 motion-safe:animate-scan">
          <div className="h-0.5 rounded-full bg-brand-500 shadow-[0_0_14px_2px] shadow-brand-500/70" />
          <div className="h-8 -translate-y-full bg-linear-to-t from-brand-400/25 to-transparent" />
        </div>
        <ScanLine className="absolute right-2 bottom-2 size-5 text-brand-600" />
      </div>
      <motion.dl
        className="space-y-1.5 rounded-xl bg-white p-3 ring-1 ring-slate-200"
        initial={reduce ? false : 'hidden'}
        whileInView="show"
        viewport={{ once: true, amount: 0.6 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.35, delayChildren: 0.3 } } }}
      >
        {fields.map(([k, v]) => (
          <motion.div
            key={k}
            className="flex items-center justify-between gap-3 text-xs"
            variants={{ hidden: { opacity: 0, x: 12 }, show: { opacity: 1, x: 0, transition: { duration: 0.4, ease } } }}
          >
            <dt className="text-slate-500">{k}</dt>
            <dd className="flex items-center gap-1.5 font-semibold text-slate-900">
              {v}
              <motion.span
                className="inline-flex"
                variants={{ hidden: { scale: 0 }, show: { scale: 1, transition: { type: 'spring', stiffness: 500, damping: 15, delay: 0.15 } } }}
              >
                <CheckCircle2 className="size-3.5 text-brand-600" />
              </motion.span>
            </dd>
          </motion.div>
        ))}
      </motion.dl>
    </div>
  );
}

/* Visuel : flux de notifications temps réel qui s'empilent en continu */
const feed = [
  { icon: Users, text: 'Patient arrivé en salle d’attente' },
  { icon: FlaskConical, text: 'Résultats de laboratoire disponibles' },
  { icon: Pill, text: 'Ordonnance prête à la pharmacie' },
  { icon: BellRing, text: 'Rappel de RDV envoyé au patient' },
];
const times = ['à l’instant', 'il y a 2 min'];

function RealtimeVisual() {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduce) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 2800);
    return () => clearInterval(id);
  }, [reduce]);

  const visible = [feed[tick % feed.length], feed[(tick + feed.length - 1) % feed.length]];

  return (
    <ul className="mt-6 space-y-2" aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map(({ icon, text }, i) => {
          const Icon = icon;
          return (
            <motion.li
              key={text}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: i === 0 ? 1 : 0.6, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.45, ease }}
              className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-slate-200"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">{text}</span>
              <span className="shrink-0 text-[10px] text-slate-500">{times[i]}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

const visuals = { ocr: OcrVisual, realtime: RealtimeVisual };

function FeatureCard({ feature, index }) {
  const { id, size, icon: Icon, title, desc } = feature;
  const Visual = visuals[id];
  const featured = size === 'hero' || Boolean(Visual);

  return (
    <Reveal
      as="li"
      delay={(index % 4) * 80}
      onPointerMove={trackPointer}
      className={`group relative isolate flex flex-col overflow-hidden rounded-2xl border bg-white p-6 transition-[box-shadow,border-color,translate] duration-300 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/8 motion-safe:hover:-translate-y-1 sm:p-7 ${
        featured ? 'border-brand-100 bg-linear-to-br from-white to-brand-50/50' : 'border-slate-200'
      } ${sizeClasses[size]}`}
    >
      {/* Halo qui suit le pointeur */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-spotlight opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {/* Liseré lumineux en haut au survol */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px scale-x-0 bg-brand-gradient transition-transform duration-500 group-hover:scale-x-100" />

      <span
        className={`flex size-11 items-center justify-center rounded-xl ring-1 transition-transform duration-500 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6 ${
          featured ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-brand-600' : 'bg-brand-50 text-brand-700 ring-brand-100'
        }`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      {featured && (
        <span className="absolute top-6 right-6 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100 sm:top-7 sm:right-7">
          Différenciateur
        </span>
      )}
      <h3 className={`mt-5 font-bold tracking-tight text-slate-900 ${size === 'hero' ? 'text-xl sm:text-2xl' : 'text-lg'}`}>{title}</h3>
      <p className={`mt-2 leading-relaxed text-slate-600 ${size === 'hero' ? 'text-base' : 'text-sm'}`}>{desc}</p>
      {Visual && <Visual />}
    </Reveal>
  );
}

export default function Features() {
  return (
    <Section id="features">
      <SectionHeader
        badge="Fonctionnalités"
        icon={LayoutGrid}
        title={<>Une plateforme <span className="whitespace-nowrap text-brand-600">tout-en-un</span> pour votre clinique</>}
        subtitle="Fini les outils dispersés. NextClinic ERP centralise l’activité de votre clinique dans une interface unifiée, claire et facile à prendre en main."
      />
      <ul className="mt-14 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {features.map((f, i) => (
          <FeatureCard key={f.id} feature={f} index={i} />
        ))}
      </ul>
    </Section>
  );
}
