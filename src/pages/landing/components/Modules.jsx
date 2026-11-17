import { useRef, useState } from 'react';
import { Boxes } from 'lucide-react';
import { moduleGroups } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';

/* Colonnes selon le nombre de modules du groupe, pour éviter les cases vides. */
const gridCols = { 2: 'lg:grid-cols-2 lg:max-w-3xl lg:mx-auto', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

export default function Modules() {
  const [active, setActive] = useState(0);
  const tabsRef = useRef([]);
  const group = moduleGroups[active];

  /* Navigation clavier des onglets (WAI-ARIA Tabs) */
  const onKeyDown = (e) => {
    const last = moduleGroups.length - 1;
    const moves = { ArrowRight: active === last ? 0 : active + 1, ArrowLeft: active === 0 ? last : active - 1, Home: 0, End: last };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setActive(moves[e.key]);
    tabsRef.current[moves[e.key]]?.focus();
  };

  return (
    <Section id="modules" className="bg-slate-50">
      <SectionHeader
        badge="Modules"
        icon={Boxes}
        title="Un module pour chaque étape du parcours."
        subtitle="Regroupés par grande étape, du premier rendez-vous jusqu’à la gestion de la clinique."
      />

      <Reveal className="mt-12">
        <div
          role="tablist"
          aria-label="Étapes"
          onKeyDown={onKeyDown}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
        >
          {moduleGroups.map((g, i) => {
            const selected = i === active;
            return (
              <button
                key={g.id}
                ref={(el) => { tabsRef.current[i] = el; }}
                role="tab"
                type="button"
                id={`module-tab-${g.id}`}
                aria-selected={selected}
                aria-controls={`module-panel-${g.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  selected ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:text-slate-900'
                }`}
              >
                <span className={`tabular-nums ${selected ? 'text-brand-100' : 'text-brand-600'}`}>{String(i + 1).padStart(2, '0')}</span>
                {g.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`module-panel-${group.id}`}
          aria-labelledby={`module-tab-${group.id}`}
          tabIndex={0}
          className="mt-8 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
        >
          <p className="text-center text-slate-600">
            <span className="font-semibold text-slate-900">{group.tagline}</span>{' '}
            <span className="text-sm text-brand-700">
              {group.modules.length} module{group.modules.length > 1 ? 's' : ''}
            </span>
          </p>
          <ul className={`mt-6 grid gap-4 sm:grid-cols-2 ${gridCols[group.modules.length] ?? 'lg:grid-cols-4'}`}>
            {group.modules.map(({ icon, title, desc }) => {
              const Icon = icon;
              return (
                <li key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </Reveal>
    </Section>
  );
}
