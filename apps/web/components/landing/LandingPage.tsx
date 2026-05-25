import { LandingNav } from "./LandingNav";
import { HeroSection } from "./HeroSection";
import { TickerBar } from "./TickerBar";
import { ProblemSection } from "./ProblemSection";
import { SolutionSection } from "./SolutionSection";
import { MetricsSection } from "./MetricsSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { ChannelsSection } from "./ChannelsSection";
import { PackagesSection } from "./PackagesSection";
import { PricingSection } from "./PricingSection";
import { ComplianceSection } from "./ComplianceSection";
import { CompareSection } from "./CompareSection";
import { CtaSection } from "./CtaSection";
import { LandingFooter } from "./LandingFooter";
import { RevealScript } from "./RevealScript";

export function LandingPage(): React.ReactElement {
  return (
    <div className="landing-root">
      <RevealScript />
      <LandingNav />
      <main>
        <HeroSection />
        <TickerBar />
        <ProblemSection />
        <SolutionSection />
        <MetricsSection />
        <HowItWorksSection />
        <ChannelsSection />
        <PackagesSection />
        <PricingSection />
        <ComplianceSection />
        <CompareSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
