type StepCardProps = {
  step: string;
  title: string;
  description: string;
};

export function StepCard({ step, title, description }: StepCardProps) {
  return (
    <article className="step-card">
      <span className="step-number">{step}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
