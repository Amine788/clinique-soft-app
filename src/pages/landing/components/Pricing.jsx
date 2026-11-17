import { Check, Star, Wallet } from 'lucide-react';
import { plans } from '../data';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';
import Button from './ui/Button';

export default function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeader
        badge="Tarifs"
        icon={Wallet}
        title="Simple, transparent, sans surprise"
        subtitle={
          <>
            Créez votre clinique gratuitement et testez-la pendant <strong className="font-semibold text-slate-900">24 heures</strong>. Passé ce délai, l’accès est suspendu tant que l’abonnement de <strong className="font-semibold text-slate-900">2 000 DH / an</strong> n’est pas réglé.
          </>
        }
      />

      <ul className="mx-auto mt-16 grid max-w-md grid-cols-1 gap-6 lg:max-w-none lg:grid-cols-3 lg:items-center">
        {plans.map((p, i) => (
          <Reveal as="li" key={p.id} delay={i * 110} className={p.highlight ? 'relative rounded-2xl p-[1.5px] shadow-2xl shadow-brand-900/30' : ''}>
            {/* Faisceau lumineux qui tourne autour de l'offre recommandée */}
            {p.highlight && (
              <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl bg-brand-700">
                <div className="absolute inset-0 border-beam motion-safe:animate-border-spin" />
              </div>
            )}
            <div
              className={`relative flex flex-col p-8 transition-[translate,box-shadow,border-color] duration-300 ${
                p.highlight
                  ? 'rounded-[calc(1rem-1.5px)] bg-brand-900 text-white lg:py-12'
                  : 'rounded-2xl border border-slate-200 bg-white text-slate-900 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/8 motion-safe:hover:-translate-y-1'
              }`}
            >
              {p.highlight && (
                <>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                    <div className="absolute -top-24 -right-24 size-64 rounded-full bg-radial from-brand-500/40 to-transparent" />
                  </div>
                  <span className="absolute -top-3.5 left-8 inline-flex items-center gap-1 rounded-full bg-accent-600 px-3 py-1 text-xs font-bold text-white">
                    <Star className="size-3.5 fill-current" aria-hidden="true" />
                    Recommandé
                  </span>
                </>
              )}
              <h3 className={`relative text-lg font-bold ${p.highlight ? 'text-white' : 'text-slate-900'}`}>{p.name}</h3>
              <p className={`relative mt-1 text-sm ${p.highlight ? 'text-brand-100' : 'text-slate-600'}`}>{p.desc}</p>
              <p className="relative mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                {p.period && <span className={`text-sm ${p.highlight ? 'text-brand-100' : 'text-slate-600'}`}>{p.period}</span>}
              </p>
              <ul className="relative mt-8 flex-1 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${p.highlight ? 'bg-white/10 text-brand-200' : 'bg-brand-50 text-brand-700'}`}>
                      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span className={p.highlight ? 'text-brand-50' : 'text-slate-700'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                {...p.action}
                variant={p.highlight ? 'inverse' : 'secondary'}
                size="lg"
                className="relative mt-9 w-full"
              >
                {p.cta}
              </Button>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
