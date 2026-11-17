import { MessageSquareQuote, Quote } from 'lucide-react';
import { testimonials, testimonialsAreExamples } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';
import { trackPointer } from './ui/motion';

export default function Testimonials() {
  return (
    <Section id="testimonials" className="bg-slate-50">
      <SectionHeader
        badge="Témoignages"
        icon={MessageSquareQuote}
        title="Ce que NextClinic change au quotidien"
      />
      {testimonialsAreExamples && (
        <p className="mt-4 text-center text-xs text-slate-500">Exemples illustratifs de retours d’usage.</p>
      )}

      <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <Reveal as="li" key={t.author} delay={i * 110}>
            <figure
              onPointerMove={trackPointer}
              className="group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 transition-[box-shadow,border-color,translate] duration-300 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/8 motion-safe:hover:-translate-y-1.5"
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-spotlight opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <Quote className="size-8 text-brand-200 transition-[color,rotate] duration-500 group-hover:text-brand-400 motion-safe:group-hover:-rotate-12" aria-hidden="true" />
              <blockquote className="mt-4 flex-1 leading-relaxed text-slate-700">« {t.text} »</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow-md shadow-brand-600/20">
                  {t.initials}
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">{t.author}</span>
                  <span className="block text-xs text-slate-600">{t.place}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
