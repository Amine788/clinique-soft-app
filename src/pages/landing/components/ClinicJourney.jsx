import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Route } from 'lucide-react';
import { journeySteps as steps } from '../journey';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';
import Button from './ui/Button';
import { ease } from './ui/motion';

const N = steps.length;
const HUB = { x: 50, y: 62 };
const iconOf = Object.fromEntries(steps.map((s) => [s.service, s.icon]));
const capture = (name, w) => `/images/landing/parcours/${name}-${w}.webp`;

/* Vrai si la requête média correspond (mise à jour au redimensionnement). */
function useMedia(query) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

/* Navigation clavier commune aux onglets d'étape (flèches, Début, Fin). */
function nextIndexFromKey(key, i) {
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(N - 1, i + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, i - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return N - 1;
  return null;
}

/* ─── Plan des services (grand écran) ─── */
function JourneyMap({ active, onSelect, tabRefs }) {
  const reduce = useReducedMotion();
  const boxRef = useRef(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pos = (p) => ({ left: `${p.x}%`, top: `${(p.y / 130) * 100}%` });
  const node = steps[active].node;
  const unit = w / 100;

  return (
    <div ref={boxRef} className="relative mx-auto aspect-[100/130] w-full max-w-[400px]">
      <svg viewBox="0 0 100 130" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {/* Liaisons de chaque service au dossier central */}
        {steps.map((s, i) => (
          <line
            key={`spoke-${s.id}`}
            x1={s.node.x}
            y1={s.node.y}
            x2={HUB.x}
            y2={HUB.y}
            strokeWidth={i === active ? 0.6 : 0.35}
            strokeDasharray="1.2 1.6"
            className={`transition-colors duration-500 ${i === active ? 'stroke-brand-400' : 'stroke-slate-200'}`}
          />
        ))}
        {/* Parcours d'un service au suivant */}
        {steps.slice(0, -1).map((s, i) => {
          const t = steps[i + 1].node;
          return (
            <g key={`edge-${s.id}`}>
              <line x1={s.node.x} y1={s.node.y} x2={t.x} y2={t.y} strokeWidth={0.9} className="stroke-slate-200" strokeLinecap="round" />
              <motion.line
                x1={s.node.x}
                y1={s.node.y}
                x2={t.x}
                y2={t.y}
                strokeWidth={0.9}
                strokeLinecap="round"
                className="stroke-brand-500"
                initial={false}
                animate={{ pathLength: i < active ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.6, ease }}
              />
            </g>
          );
        })}
        {/* Donnée qui rejoint le dossier central */}
        {!reduce && (
          <motion.circle
            key={`pulse-${active}`}
            r={0.9}
            className="fill-brand-500"
            initial={{ cx: node.x, cy: node.y, opacity: 0 }}
            animate={{ cx: [node.x, HUB.x], cy: [node.y, HUB.y], opacity: [0, 1, 0] }}
            transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 }}
          />
        )}
      </svg>

      {/* Dossier patient central */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={pos(HUB)} aria-hidden="true">
        <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-center shadow-lg shadow-brand-900/10 ring-1 ring-slate-200">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <FileText className="size-4.5" />
          </span>
          <span className="text-[11px] leading-tight font-bold text-slate-900">Dossier unique</span>
          <span className="text-[10px] leading-tight text-slate-500">partagé par tous</span>
        </div>
      </div>

      {/* Services : onglets du parcours */}
      <div role="tablist" aria-label="Étapes du parcours" aria-orientation="vertical">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          const done = i < active;
          return (
            <button
              key={s.id}
              ref={(el) => (tabRefs.current[i] = el)}
              id={`journey-tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="journey-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                const n = nextIndexFromKey(e.key, i);
                if (n === null) return;
                e.preventDefault();
                onSelect(n);
                tabRefs.current[n]?.focus({ preventScroll: true });
              }}
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              style={pos(s.node)}
            >
              <span
                className={`relative flex size-12 items-center justify-center rounded-2xl transition-all duration-300 ${
                  isActive
                    ? 'scale-110 bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-brand-100'
                    : done
                      ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                      : 'bg-white text-slate-400 ring-1 ring-slate-200 group-hover:text-brand-600 group-hover:ring-brand-200'
                }`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {done && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white">
                    <Check className="size-2.5" aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className={`text-xs font-semibold whitespace-nowrap ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>{s.service}</span>
            </button>
          );
        })}
      </div>

      {/* Le patient, qui se déplace de service en service */}
      {w > 0 && (
        <motion.div
          className="pointer-events-none absolute top-0 left-0"
          initial={false}
          animate={{ x: node.x * unit, y: (node.y / 130) * (w * 1.3) - 74 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }}
          aria-hidden="true"
        >
          <div className="flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white py-1 pr-2.5 pl-1 shadow-md shadow-slate-900/10 ring-1 ring-slate-200">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <FileText className="size-3" />
            </span>
            <span className="text-[10px] font-semibold whitespace-nowrap text-slate-700">Dossier patient</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Barre d'étapes (mobile et tablette) ─── */
function JourneyStepper({ active, onSelect, tabRefs }) {
  const listRef = useRef(null);
  useEffect(() => {
    const el = tabRefs.current[active];
    const list = listRef.current;
    if (!el || !list) return;
    list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [active, tabRefs]);

  return (
    <div>
      <div ref={listRef} role="tablist" aria-label="Étapes du parcours" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          return (
            <button
              key={s.id}
              ref={(el) => (tabRefs.current[i] = el)}
              id={`journey-tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="journey-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                const n = nextIndexFromKey(e.key, i);
                if (n === null) return;
                e.preventDefault();
                onSelect(n);
                tabRefs.current[n]?.focus();
              }}
              className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                isActive ? 'bg-brand-600 text-white' : i < active ? 'bg-brand-50 text-brand-700' : 'bg-white text-slate-500 ring-1 ring-slate-200'
              }`}
            >
              <span className={`flex size-7 items-center justify-center rounded-full ${isActive ? 'bg-white/15' : 'bg-white'}`}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {s.service}
            </button>
          );
        })}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <motion.div className="h-full rounded-full bg-brand-600" animate={{ width: `${((active + 1) / N) * 100}%` }} transition={{ duration: 0.4, ease }} />
      </div>
    </div>
  );
}

/* ─── Point d'intérêt sur l'écran d'aperçu ─── */
function Hotspot({ n, x, y, text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const right = x > 55;
  const above = y > 60;
  return (
    <div className="absolute z-10" style={{ left: `${x}%`, top: `${y}%` }}>
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white shadow-md ring-4 ring-brand-600/20 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {n}
        <span className="sr-only">: détail</span>
      </button>
      <div
        id={id}
        role="tooltip"
        className={`absolute w-52 rounded-xl bg-slate-900 px-3 py-2 text-xs leading-snug text-white shadow-xl transition-opacity duration-150 sm:w-60 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${right ? 'right-4' : 'left-4'} ${above ? 'bottom-4' : 'top-4'}`}
      >
        {text}
      </div>
    </div>
  );
}

/* ─── Fenêtre d'application + capture réelle de l'étape ─── */
function JourneyScreen({ step }) {
  const reduce = useReducedMotion();

  // Précharge les captures voisines pour des transitions sans attente
  useEffect(() => {
    const i = steps.findIndex((s) => s.id === step.id);
    [steps[i + 1], steps[i - 1]].filter(Boolean).forEach((s) => {
      const img = new Image();
      img.src = capture(s.image, 1440);
    });
  }, [step.id]);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-brand-900/10 ring-1 ring-slate-900/10">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="ml-2 flex-1 truncate text-xs font-medium text-slate-500">
          NextClinic · {step.service} · {step.module}
        </span>
        <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 sm:inline">
          Données de démo
        </span>
      </div>
      <div className="relative aspect-[16/10] bg-slate-50">
        <AnimatePresence initial={false}>
          <motion.div
            key={step.id}
            initial={reduce ? false : { opacity: 0, scale: 1.015 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className="absolute inset-0"
          >
            <img
              src={capture(step.image, 1440)}
              srcSet={`${capture(step.image, 720)} 720w, ${capture(step.image, 1440)} 1440w`}
              sizes="(min-width: 1024px) 760px, calc(100vw - 2rem)"
              width="1440"
              height="900"
              alt={`Capture de l’écran « ${step.module} » de NextClinic ERP (données de démonstration)`}
              decoding="async"
              className="size-full object-cover object-top"
            />
            {step.hotspots.map((h, i) => (
              <Hotspot key={i} n={i + 1} {...h} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── « En coulisse » : ce que l'ERP transmet aux autres services ─── */
function BehindTheScenes({ step, floating }) {
  const reduce = useReducedMotion();
  const items = step.events.length
    ? step.events
    : [{ to: 'Direction', text: 'Tableau de bord à jour · aucune saisie supplémentaire' }];
  return (
    <div
      className={
        floating
          ? 'absolute -bottom-10 -left-6 w-72 rounded-2xl bg-white/95 p-3.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 backdrop-blur'
          : 'rounded-2xl bg-white p-3.5 ring-1 ring-slate-200'
      }
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
        <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
        En coulisse
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.ul key={step.id} className="space-y-2" initial={reduce ? false : 'hidden'} animate="show" exit={{ opacity: 0 }}>
          {items.map((ev, i) => {
            const Icon = iconOf[ev.to];
            const alert = ev.tone === 'alert';
            return (
              <motion.li
                key={ev.text}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { delay: 0.35 + i * 0.25, duration: 0.35, ease } } }}
                className="flex items-start gap-2.5"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${alert ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'}`}
                  aria-hidden="true"
                >
                  {Icon && <Icon className="size-3.5" />}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-500">→ {ev.to}</div>
                  <div className={`text-xs font-semibold ${alert ? 'text-red-700' : 'text-slate-800'}`}>{ev.text}</div>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}

/* ─── Section ─── */
export default function ClinicJourney() {
  const reduce = useReducedMotion();
  const isWide = useMedia('(min-width: 1024px)');
  // Récit au défilement : grand écran assez haut, sans préférence de mouvement réduit
  const tallEnough = useMedia('(min-height: 720px)');
  const scrollMode = isWide && tallEnough && !reduce;

  const [active, setActive] = useState(0);
  const trackRef = useRef(null);
  const tabRefs = useRef([]);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (!scrollMode) return;
    setActive(Math.min(N - 1, Math.max(0, Math.floor(v * N))));
  });

  const select = useCallback(
    (i) => {
      setActive(i);
      if (!scrollMode || !trackRef.current) return;
      // En mode défilement, la position de la page reste la source de vérité
      const el = trackRef.current;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const range = el.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + (range * (i + 0.5)) / N, behavior: 'smooth' });
    },
    [scrollMode]
  );

  const step = steps[active];

  const panel = (
    <div id="journey-panel" role="tabpanel" aria-labelledby={`journey-tab-${step.id}`} className="min-w-0">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-slate-500">
          <span className="text-2xl font-extrabold text-brand-600 tabular-nums">{String(active + 1).padStart(2, '0')}</span> / {String(N).padStart(2, '0')}
        </span>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{step.service}</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease }}
        >
          <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{step.title}</h3>
          <p className="mt-2 max-w-xl leading-relaxed text-pretty text-slate-600">{step.desc}</p>
        </motion.div>
      </AnimatePresence>

      <div className="relative mt-5">
        <JourneyScreen step={step} />
        {isWide && <BehindTheScenes step={step} floating />}
      </div>
      {!isWide && (
        <div className="mt-4">
          <BehindTheScenes step={step} />
        </div>
      )}
    </div>
  );

  return (
    <Section id="parcours" className="bg-linear-to-b from-white via-slate-50/70 to-white">
      <SectionHeader
        badge="Le parcours d’un dossier"
        icon={Route}
        title="Saisi une fois à l’accueil, retrouvé dans chaque service."
        subtitle="Suivez un dossier patient, de la prise de rendez-vous au tableau de bord de la direction. Chaque écran est une vraie page de NextClinic ERP ; à chaque étape, les bons services sont informés automatiquement."
      />

      {/* Annonce de l'étape pour les lecteurs d'écran (utile quand elle change au défilement) */}
      <p className="sr-only" aria-live="polite">
        Étape {active + 1} sur {N} : {step.service}, {step.title}
      </p>

      {isWide ? (
        <div ref={trackRef} className="mt-12" style={scrollMode ? { height: `${N * 55 + 45}vh` } : undefined}>
          <div className={scrollMode ? 'sticky top-16 flex h-[calc(100svh-4rem)] items-center' : ''}>
            <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] xl:gap-16">
              <JourneyMap active={active} onSelect={select} tabRefs={tabRefs} />
              <div className="pb-10">{panel}</div>
            </div>
          </div>
        </div>
      ) : (
        <Reveal className="mt-10">
          <JourneyStepper active={active} onSelect={select} tabRefs={tabRefs} />
          <div className="mt-6">{panel}</div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="secondary" size="sm" onClick={() => select(active - 1)} disabled={active === 0}>
              <ChevronLeft className="size-4" aria-hidden="true" /> Précédent
            </Button>
            <Button variant="secondary" size="sm" onClick={() => select(active + 1)} disabled={active === N - 1}>
              Suivant <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </Reveal>
      )}

      <Reveal className="mt-14 flex flex-col items-center gap-5 text-center sm:mt-16">
        <p className="text-lg font-semibold text-slate-900">
          <span className="text-brand-600">1 saisie</span> à l’accueil · <span className="text-brand-600">{N} services</span> informés automatiquement
        </p>
        <Button href="#demo" size="md">
          Voir NextClinic sur votre clinique <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </Reveal>
    </Section>
  );
}
