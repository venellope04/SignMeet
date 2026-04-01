function Card({ children, className = '', style }) {
  return (
    <section className={`glass-panel content-card ${className}`.trim()} style={style}>
      {children}
    </section>
  );
}

export default Card;
