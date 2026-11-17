import { ArrowRight, Phone } from 'lucide-react';
import { contact } from '../data';
import Reveal from './ui/Reveal';
import Button from './ui/Button';

export default function FinalCta() {
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-brand-900 px-6 py-16 text-center sm:px-12 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
          <div className="absolute -top-32 -left-32 size-96 rounded-full bg-radial from-brand-500/50 to-transparent blur-2xl motion-safe:animate-aurora" />
          <div className="absolute -right-32 -bottom-40 size-[28rem] rounded-full bg-radial from-accent-600/50 to-transparent blur-2xl motion-safe:animate-aurora-slow" />
          <div className="absolute top-1/2 left-1/2 size-[22rem] -translate-1/2 rounded-full bg-radial from-accent-500/20 to-transparent blur-3xl motion-safe:animate-aurora" />
        </div>
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">
            Prêt à moderniser votre clinique ?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-brand-100">
            Créez votre espace en quelques minutes et testez toutes les fonctionnalités gratuitement pendant 24 heures.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button href="#demo" variant="inverse" size="lg">
              Démarrer gratuitement
              <ArrowRight className="size-5 transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />
            </Button>
            <Button href={contact.phoneHref} variant="inverse-outline" size="lg">
              <Phone className="size-5" aria-hidden="true" />
              Nous appeler
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
