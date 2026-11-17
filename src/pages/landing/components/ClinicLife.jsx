import { HeartHandshake } from 'lucide-react';
import Section from './ui/Section';
import SectionHeader from './ui/SectionHeader';
import Reveal from './ui/Reveal';

/* Photos d'ambiance, chacune reliée aux modules qu'elle illustre. */
const moments = [
  {
    image: 'accueil',
    alt: 'Hall d’accueil lumineux d’une clinique, avec fauteuils et plantes',
    title: 'Un accueil plus fluide',
    desc: 'Rendez-vous, salle d’attente et enregistrement du patient par lecture de sa carte nationale.',
    modules: 'Agenda · Check-in',
  },
  {
    image: 'consultation',
    alt: 'Mains d’un médecin saisissant sur un ordinateur portable, un stéthoscope posé à côté',
    title: 'Des consultations bien documentées',
    desc: 'Le médecin retrouve l’historique, rédige ses ordonnances et complète le dossier médical.',
    modules: 'Dossier médical · Ordonnances',
  },
  {
    image: 'collaboration',
    alt: 'Deux médecins échangent devant des écrans dans un bureau lumineux',
    title: 'Des équipes coordonnées',
    desc: 'Chaque rôle a son espace et reçoit les alertes utiles : arrivée d’un patient, résultat disponible, ordonnance prête.',
    modules: 'Espaces par rôle · Temps réel',
  },
];

export default function ClinicLife() {
  return (
    <Section id="quotidien">
      <SectionHeader
        badge="Au quotidien"
        icon={HeartHandshake}
        title="Pensé pour le quotidien de la clinique"
        subtitle="De l’arrivée du patient au suivi entre services, NextClinic ERP accompagne chaque étape du parcours."
      />

      <ul className="mt-14 grid gap-8 sm:mt-16 md:grid-cols-3 md:gap-6 lg:gap-8">
        {moments.map((m, i) => (
          <Reveal as="li" key={m.image} delay={i * 100}>
            <img
              src={`/images/landing/${m.image}-800.webp`}
              srcSet={`/images/landing/${m.image}-480.webp 480w, /images/landing/${m.image}-800.webp 800w, /images/landing/${m.image}-1200.webp 1200w`}
              sizes="(min-width: 768px) 33vw, calc(100vw - 2rem)"
              width="1200"
              height="900"
              alt={m.alt}
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full rounded-2xl object-cover ring-1 ring-slate-200"
            />
            <p className="mt-5 text-xs font-semibold tracking-wide text-brand-700 uppercase">{m.modules}</p>
            <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{m.title}</h3>
            <p className="mt-2 leading-relaxed text-slate-600">{m.desc}</p>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
