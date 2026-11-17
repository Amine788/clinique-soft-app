import { useState } from 'react';
import { ArrowRight, ChevronDown, CircleHelp, Mail } from 'lucide-react';
import { contact, faqs } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';
import Button from './ui/Button';

export default function Faq() {
  const [open, setOpen] = useState(null);

  return (
    <Section id="faq" className="bg-slate-50" containerClassName="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div>
        <SectionHeader
          align="left"
          badge="FAQ"
          icon={CircleHelp}
          title="Questions fréquentes."
          subtitle="L’essentiel à savoir avant de passer à NextClinic ERP."
        />
        {/* Contact */}
        <Reveal className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="font-bold text-slate-900">Une autre question ?</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Écrivez-nous ou demandez une démonstration : nous répondons sur vos cas concrets.
          </p>
          <a
            href={`mailto:${contact.email}`}
            className="mt-4 inline-flex items-center gap-2 rounded text-sm font-semibold break-all text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            {contact.email}
          </a>
          <Button href="#demo" size="sm" className="mt-5 flex w-full sm:inline-flex sm:w-auto">
            Demander une démo
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </Reveal>
      </div>

      <Reveal as="ul" className="space-y-3 lg:pt-2">
        {faqs.map((f, i) => {
          const expanded = open === i;
          return (
            <li
              key={f.q}
              className={`rounded-2xl border bg-white transition-[border-color,box-shadow] duration-200 ${expanded ? 'border-brand-200 shadow-lg shadow-brand-900/5' : 'border-slate-200'}`}
            >
              <h3>
                <button
                  type="button"
                  id={`faq-q-${i}`}
                  aria-expanded={expanded}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl px-6 py-5 text-left text-base font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {f.q}
                  <ChevronDown
                    className={`size-5 shrink-0 text-brand-700 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              <div
                id={`faq-a-${i}`}
                role="region"
                aria-labelledby={`faq-q-${i}`}
                inert={!expanded}
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="overflow-hidden">
                  <p className="px-6 pb-6 leading-relaxed text-slate-600">{f.a}</p>
                </div>
              </div>
            </li>
          );
        })}
      </Reveal>
    </Section>
  );
}
