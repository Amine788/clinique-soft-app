import { motion, useReducedMotion } from 'motion/react';
import { ease } from './motion';

/**
 * Apparition au scroll (fondu + montée + flou). Transmet className, style et
 * toutes les autres props à l'élément rendu. Désactivé avec prefers-reduced-motion.
 */
export default function Reveal({ as = 'div', className = '', delay = 0, y = 28, children, ...rest }) {
  const Tag = motion[as];
  const reduce = useReducedMotion();

  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.8, delay: delay / 1000, ease }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
