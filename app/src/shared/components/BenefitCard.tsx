type BenefitCardProps = {
  title: string;
  description: string;
};

export function BenefitCard({ title, description }: BenefitCardProps) {
  return (
    <article className="benefit-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
