import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { ease } from './motion';

const defaultFormat = (n) => Math.round(n).toLocaleString('fr-FR');

/** Compteur animé de 0 à `to`, déclenché à l'entrée dans le viewport. */
export default function CountUp({ to, duration = 1.6, delay = 0, format = defaultFormat }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return undefined;
    const controls = animate(0, to, { duration, delay, ease, onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduce, to, duration, delay]);

  return <span ref={ref} className="tabular-nums">{format(reduce ? to : value)}</span>;
}
