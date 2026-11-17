import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import StatsBand from './components/StatsBand';
import Audiences from './components/Audiences';
import ClinicLife from './components/ClinicLife';
import Features from './components/Features';
import ClinicJourney from './components/ClinicJourney';
import Modules from './components/Modules';
import Roles from './components/Roles';
import Security from './components/Security';
import Faq from './components/Faq';
import DemoSection from './components/DemoSection';
import Footer from './components/Footer';
import ScrollProgress from './components/ui/ScrollProgress';

export default function LandingPage() {
  const { hash } = useLocation();

  // Arrivée depuis une autre page avec une ancre (ex. /#demo) : on défile jusqu'à la section.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'instant' }));
  }, [hash]);

  return (
    <div className="min-h-screen overflow-x-clip bg-white font-display text-slate-900 antialiased">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>
      <ScrollProgress />
      <Navbar />
      <main id="main">
        <Hero />
        <StatsBand />
        <Audiences />
        <ClinicLife />
        <Features />
        <ClinicJourney />
        <Modules />
        <Roles />
        <Security />
        <Faq />
        <DemoSection />
      </main>
      <Footer />
    </div>
  );
}
