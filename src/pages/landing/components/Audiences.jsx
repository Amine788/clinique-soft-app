import { Target } from 'lucide-react';
import { audiences } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';

export default function Audiences() {
  return (
    <Section id="pour-qui">
      <SectionHeader
        badge="Pour qui"
        icon={Target}
        title="Pensé pour les établissements de santé."
        subtitle="Clinique, cabinet, laboratoire ou pharmacie interne : chaque service retrouve ses étapes et ses documents."
      />
      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {audiences.map((a, i) => (
          <Reveal as="li" key={a.title} delay={i * 80} className="rounded-2xl border border-slate-200 bg-white p-6">
            <span className="text-sm font-bold text-brand-600 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900">{a.title}</h3>
            <p className="mt-2 leading-relaxed text-slate-600">{a.desc}</p>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
