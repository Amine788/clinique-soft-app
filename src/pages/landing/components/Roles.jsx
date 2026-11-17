import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, UsersRound } from 'lucide-react';
import { roles } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Highlight from './ui/Highlight';
import Reveal from './ui/Reveal';
import Button from './ui/Button';
import { ease } from './ui/motion';

export default function Roles() {
  const [active, setActive] = useState(0);
  const tabsRef = useRef([]);
  const role = roles[active];
  const RoleIcon = role.icon;
  const reduce = useReducedMotion();

  /* Navigation clavier des onglets (WAI-ARIA Tabs) */
  const onKeyDown = (e) => {
    const last = roles.length - 1;
    const moves = { ArrowRight: active === last ? 0 : active + 1, ArrowDown: active === last ? 0 : active + 1, ArrowLeft: active === 0 ? last : active - 1, ArrowUp: active === 0 ? last : active - 1, Home: 0, End: last };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setActive(moves[e.key]);
    tabsRef.current[moves[e.key]]?.focus();
  };

  return (
    <Section id="roles" className="bg-slate-50">
      <SectionHeader
        badge="Espaces utilisateurs"
        icon={UsersRound}
        title={<>Le bon espace pour <Highlight>chaque membre</Highlight> de l’équipe.</>}
        subtitle="Médecin, accueil, infirmerie, laboratoire, pharmacie ou direction : chacun travaille dans une interface dédiée, avec uniquement les outils dont il a besoin."
      />

      <Reveal className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr] lg:gap-8">
        <div
          role="tablist"
          aria-label="Rôles"
          onKeyDown={onKeyDown}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-1"
        >
          {roles.map((r, i) => {
            const Icon = r.icon;
            const selected = i === active;
            return (
              <button
                key={r.id}
                ref={(el) => { tabsRef.current[i] = el; }}
                role="tab"
                type="button"
                id={`role-tab-${r.id}`}
                aria-selected={selected}
                aria-controls={`role-panel-${r.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={`relative isolate flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  selected ? 'text-brand-600' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="role-active-pill"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-xl bg-white shadow-md shadow-brand-900/5 ring-1 ring-brand-200"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.55 }}
                  />
                )}
                <span className={`flex size-8 items-center justify-center rounded-lg transition-colors duration-300 ${selected ? 'bg-brand-600 text-white' : 'bg-slate-200/70 text-slate-600'}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {r.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`role-panel-${role.id}`}
          aria-labelledby={`role-tab-${role.id}`}
          tabIndex={0}
          className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500 sm:p-10"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-radial from-brand-100/80 to-transparent blur-2xl motion-safe:animate-aurora" />
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={role.id}
            className="relative grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center lg:gap-10"
            initial={reduce ? false : { opacity: 0, x: 24, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, x: -24, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease }}
          >
            <div>
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <RoleIcon className="size-6" aria-hidden="true" />
                </span>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">Espace {role.label}</h3>
              </div>
              <p className="mt-4 max-w-lg text-base text-slate-600">{role.summary}</p>
              <ul className="mt-6 space-y-3">
                {role.actions.map((a, i) => (
                  <motion.li
                    key={a}
                    className="flex items-start gap-3 text-slate-800"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease }}
                  >
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                    <span>{a}</span>
                  </motion.li>
                ))}
              </ul>
              <Button href="#demo" variant="secondary" className="mt-8">
                Essayer cet espace
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {/* Photo illustrant le rôle */}
            <img
              src={`/images/landing/${role.image}-1024.webp`}
              srcSet={`/images/landing/${role.image}-640.webp 640w, /images/landing/${role.image}-1024.webp 1024w`}
              sizes="(min-width: 1024px) 420px, (min-width: 768px) 45vw, calc(100vw - 4rem)"
              width="1024"
              height="768"
              alt={role.alt}
              loading="lazy"
              decoding="async"
              className="order-first aspect-[4/3] w-full rounded-2xl object-cover ring-1 ring-slate-200 md:order-none"
            />
          </motion.div>
          </AnimatePresence>
        </div>
      </Reveal>
    </Section>
  );
}
