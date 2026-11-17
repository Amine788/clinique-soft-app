import { motion, useScroll, useSpring } from 'motion/react';

/** Barre de progression de lecture, en haut de l'écran. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-brand-gradient"
      style={{ scaleX }}
    />
  );
}
