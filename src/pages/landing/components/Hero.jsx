import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, LayoutGrid } from 'lucide-react';
import { heroGuarantees, heroJourney } from '../data';
import Button from './ui/Button';
import { fadeUp, stagger } from './ui/motion';

export default function Hero() {
  const reduce = useReducedMotion();

  return (
    <section
      id="top"
      className="relative isolate flex min-h-[44rem] items-center overflow-hidden pt-28 pb-20 sm:pt-32 lg:min-h-[100svh] lg:pb-24"
    >
      {/* Photo du laboratoire en arrière-plan, pleine largeur */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <img
          src="/images/landing/hero-fond-1440.webp"
          srcSet="/images/landing/hero-fond-960.webp 960w, /images/landing/hero-fond-1440.webp 1440w, /images/landing/hero-fond-2000.webp 2000w"
          sizes="100vw"
          width="2000"
          height="1125"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="size-full object-cover object-[70%_center]"
        />
        {/* Voile clair pour la lisibilité du texte */}
        <div className="absolute inset-0 bg-linear-to-b from-white/90 via-white/80 to-white/60 lg:bg-linear-to-r lg:from-white/95 lg:from-25% lg:via-white/70 lg:via-45% lg:to-white/0 lg:to-70%" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-white" />
      </div>

      <motion.div
        className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
        variants={stagger(0.1)}
        initial={reduce ? false : 'hidden'}
        animate="show"
      >
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-xl lg:text-left xl:max-w-2xl">
          <motion.p variants={fadeUp} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-500" />
            ERP médical pour cliniques et cabinets
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="mt-4 font-display text-4xl leading-[1.1] font-extrabold tracking-tight text-balance text-slate-900 sm:text-5xl xl:text-6xl"
          >
            Une clinique mieux coordonnée, <span className="text-brand-600">du <span className="whitespace-nowrap">rendez-vous</span> à la facture.</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-slate-700 lg:mx-0">
            NextClinic ERP rassemble l’accueil, les consultations, le laboratoire, la pharmacie et la facturation dans un
            seul outil. Chaque équipe suit le parcours du patient avec les mêmes informations.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Button href="#demo" size="lg">
              Demander une démo
              <ArrowRight className="size-5 transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />
            </Button>
            <Button href="#features" size="lg" variant="secondary">
              <LayoutGrid className="size-5 text-brand-700" aria-hidden="true" />
              Découvrir les modules
            </Button>
          </motion.div>

          {/* Étapes du parcours patient suivies dans NextClinic ERP */}
          <motion.div variants={fadeUp} className="mt-10">
            <p className="sr-only">Les étapes suivies dans NextClinic ERP :</p>
            <ol className="flex flex-wrap justify-center gap-x-1 gap-y-3 lg:justify-start">
              {heroJourney.map(({ icon, label }, i) => {
                const Icon = icon;
                return (
                  <li key={label} className="flex items-center gap-1">
                    <span className="flex w-20 flex-col items-center gap-1.5 text-xs font-medium text-slate-700">
                      <span className="grid size-10 place-items-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-brand-100">
                        <Icon className="size-4.5" aria-hidden="true" />
                      </span>
                      {label}
                    </span>
                    {i < heroJourney.length - 1 && (
                      <span aria-hidden="true" className="mb-5 hidden h-px w-4 bg-brand-200 sm:block" />
                    )}
                  </li>
                );
              })}
            </ol>
          </motion.div>

          <motion.ul
            variants={fadeUp}
            className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-700 lg:justify-start"
          >
            {heroGuarantees.map((g) => (
              <li key={g} className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" />
                {g}
              </li>
            ))}
          </motion.ul>
        </div>
      </motion.div>
    </section>
  );
}
