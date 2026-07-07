type TodoPlaceholderPanelProps = {
  title: string;
  note: string;
};

export function TodoPlaceholderPanel({ title, note }: TodoPlaceholderPanelProps) {
  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>{title}</h1>
          <p>To do</p>
        </div>
      </header>

      <section className="portal-card-compact">
        <h2>Nog niet ingericht</h2>
        <p>{note}</p>
      </section>
    </div>
  );
}
