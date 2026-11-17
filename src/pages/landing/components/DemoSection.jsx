import { CalendarCheck } from 'lucide-react';
import { demoPerks } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Highlight from './ui/Highlight';
import Reveal from './ui/Reveal';
import DemoForm from './DemoForm';

export default function DemoSection() {
  return (
    <Section id="demo" containerClassName="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <SectionHeader
          align="left"
          badge="Démo gratuite"
          icon={CalendarCheck}
          title={<>Voyez NextClinic <Highlight>en action</Highlight></>}
          subtitle="Découvrez comment NextClinic peut simplifier la gestion de votre clinique. Créez votre espace en quelques secondes et testez-le gratuitement pendant 24 heures."
        />
        <ul className="mt-10 space-y-5">
          {demoPerks.map(({ icon, title, desc }, i) => {
            const Icon = icon;
            return (
            <Reveal as="li" key={title} delay={i * 90} className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{title}</span>
                <span className="mt-0.5 block text-sm text-slate-600">{desc}</span>
              </span>
            </Reveal>
            );
          })}
        </ul>
      </div>

      <Reveal delay={120}>
        <DemoForm />
      </Reveal>
    </Section>
  );
}
