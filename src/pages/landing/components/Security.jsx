import { LockKeyhole } from 'lucide-react';
import { roles, securityPoints } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';

export default function Security() {
  return (
    <Section id="securite">
      <SectionHeader
        badge="Sécurité"
        icon={LockKeyhole}
        title="Chacun voit ce qu’il doit voir."
        subtitle="Les dossiers médicaux, les ordonnances et les factures sont protégés par des droits précis."
      />

      <ul className="mt-14 grid gap-5 md:grid-cols-3">
        {securityPoints.map(({ icon, title, desc }, i) => {
          const Icon = icon;
          return (
            <Reveal as="li" key={title} delay={i * 80} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{desc}</p>
            </Reveal>
          );
        })}
      </ul>

      <Reveal className="mt-8 rounded-2xl bg-brand-950 p-6 text-white sm:p-8">
        <p className="text-lg font-bold">{roles.length} rôles aux accès distincts</p>
        <p className="mt-1 text-sm text-brand-200">Chaque rôle dispose de son espace et de ses propres droits.</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {roles.map((r) => (
            <li key={r.id} className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium ring-1 ring-white/15">
              {r.label}
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}
