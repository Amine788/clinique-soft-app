import { Route } from 'lucide-react';
import { steps } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';

/** Parcours d'une information, du rendez-vous à la facture : une grande photo par étape. */
export default function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeader
        badge="Comment ça marche"
        icon={Route}
        title="Une information saisie une fois suit le patient jusqu’à la facture."
        subtitle="Le rendez-vous ouvre le parcours, la consultation déclenche les examens et les traitements, la facture reprend les actes réalisés."
      />

      <ol className="mt-16 space-y-16 sm:mt-20 lg:space-y-24">
        {steps.map((s, i) => {
          const reversed = i % 2 === 1;
          return (
            <li key={s.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <Reveal className={reversed ? 'lg:order-2' : ''}>
                <img
                  src={`/images/landing/${s.image}-1024.webp`}
                  srcSet={`/images/landing/${s.image}-640.webp 640w, /images/landing/${s.image}-1024.webp 1024w, /images/landing/${s.image}-1440.webp 1440w`}
                  sizes="(min-width: 1280px) 584px, (min-width: 1024px) 45vw, calc(100vw - 2rem)"
                  width="1440"
                  height="1080"
                  alt={s.alt}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg shadow-slate-900/10 ring-1 ring-slate-200"
                />
              </Reveal>

              <Reveal delay={100} className={reversed ? 'lg:order-1' : ''}>
                <p className="text-sm font-semibold text-slate-500">
                  <span className="text-4xl font-extrabold text-brand-600 tabular-nums">{String(i + 1).padStart(2, '0')}</span>{' '}
                  sur {steps.length}
                </p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{s.title}</h3>
                <p className="mt-4 max-w-lg text-lg leading-relaxed text-pretty text-slate-600">{s.desc}</p>
                <ul className="mt-6 flex flex-wrap gap-2" aria-label="Modules concernés">
                  {s.modules.map((m) => (
                    <li key={m} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-brand-100">
                      {m}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
