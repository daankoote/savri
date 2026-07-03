type FaqItemProps = {
  question: string;
  answer: string;
};

export function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <article className="faq-item">
      <h3>{question}</h3>
      <p>{answer}</p>
    </article>
  );
}
