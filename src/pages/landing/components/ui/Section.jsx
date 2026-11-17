export default function Section({ id, className = '', containerClassName = '', children, ...rest }) {
  return (
    <section id={id} className={`relative scroll-mt-20 py-20 sm:py-28 ${className}`} {...rest}>
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${containerClassName}`}>{children}</div>
    </section>
  );
}
