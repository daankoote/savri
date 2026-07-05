import { AppHeader } from "../shared/components/AppHeader";
import { BenefitCard } from "../shared/components/BenefitCard";
import { CTASection } from "../shared/components/CTASection";
import { FaqItem } from "../shared/components/FaqItem";
import { HeroSection } from "../shared/components/HeroSection";
import { SectionHeader } from "../shared/components/SectionHeader";
import { StepCard } from "../shared/components/StepCard";
import { RevenueCalculator } from "../features/calculator/RevenueCalculator";
import type { RoutedPageProps } from "../routes/types";

const steps = [
  {
    step: "01",
    title: "Check",
    description: "Bekijk of je situatie past.",
  },
  {
    step: "02",
    title: "Meld aan",
    description: "Laat je gegevens achter.",
  },
  {
    step: "03",
    title: "Upload info",
    description: "Lever laadpunt- en factuurinformatie aan.",
  },
  {
    step: "04",
    title: "Geef jaarkWh op",
    description: "Aan het einde van het jaar geef je je kWh door.",
  },
  {
    step: "05",
    title: "Uitbetaling + jaaroverzicht",
    description: "Bij resultaat ontvang je uitbetaling en een jaaroverzicht.",
  },
];

const benefits = [
  {
    title: "10% success fee",
    description: "Je betaalt bij resultaat, volgens de voorwaarden.",
  },
  {
    title: "Eenvoudig proces",
    description: "Van check tot jaaroverzicht.",
  },
  {
    title: "Controleerbaar",
    description: "Je documenten en keuzes blijven herleidbaar.",
  },
];

const eligibilityItems = [
  {
    title: "Ik laad thuis",
    description: "Je laadt je elektrische auto op je eigen adres.",
  },
  {
    title: "Ik heb laadpaalgegevens",
    description: "Je kunt je laadpunt en verbruik onderbouwen.",
  },
  {
    title: "Ik kan documenten aanleveren",
    description: "Facturen en relevante gegevens zijn beschikbaar.",
  },
];

const faqs = [
  {
    question: "Betaal ik vooraf?",
    answer: "Nee. Je betaalt bij resultaat, volgens de voorwaarden.",
  },
  {
    question: "Is resultaat gegarandeerd?",
    answer: "Nee. Geen garantie op toekenning, opbrengst of termijn.",
  },
  {
    question: "Wat heb ik nodig?",
    answer: "Laadpuntgegevens en factuurdocumenten.",
  },
];

export function HomePage({ currentPath, navigate }: RoutedPageProps) {
  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <main>
        <HeroSection navigate={navigate} />
        <RevenueCalculator />

        <section className="section" id="aanmerking" aria-labelledby="eligibility-title">
          <div className="container">
            <SectionHeader eyebrow="Aanmerking" title="Kom ik in aanmerking?" />
            <div className="benefit-grid">
              {eligibilityItems.map((item) => (
                <BenefitCard key={item.title} title={item.title} description={item.description} />
              ))}
            </div>
            <div className="section-actions">
              <a
                className="button button-primary"
                href="/aanmelden"
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/aanmelden");
                }}
              >
                Check mijn situatie
              </a>
            </div>
          </div>
        </section>

        <section className="section" id="werkwijze" aria-labelledby="steps-title">
          <div className="container">
            <SectionHeader eyebrow="Werkwijze" title="Vijf stappen." />
            <div className="step-grid">
              {steps.map((item) => (
                <StepCard
                  key={item.step}
                  step={item.step}
                  title={item.title}
                  description={item.description}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="section section-muted" id="waarom" aria-labelledby="benefits-title">
          <div className="container">
            <SectionHeader eyebrow="Waarom ENVAL" title="Lager tarief. Minder gedoe." />
            <div className="benefit-grid">
              {benefits.map((item) => (
                <BenefitCard key={item.title} title={item.title} description={item.description} />
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="container">
            <SectionHeader eyebrow="FAQ" title="Korte antwoorden." />
            <div className="faq-list">
              {faqs.map((item) => (
                <FaqItem key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </section>

        <CTASection
          eyebrow="Start"
          title="Start met de check."
          description="Check eerst of je situatie past."
          actionLabel="Check mijn situatie"
          actionHref="/#aanmerking"
          navigate={navigate}
          secondaryActionLabel="Aanmelden"
          secondaryActionHref="/aanmelden"
        />
      </main>
    </div>
  );
}
