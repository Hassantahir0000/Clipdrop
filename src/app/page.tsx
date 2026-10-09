import { Landing } from "@/components/landing";
import { FAQ } from "@/lib/faq";
import { PLATFORMS } from "@/lib/platforms";
import { SITE } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      description: SITE.description,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE.url}/#app`,
      url: SITE.url,
      name: SITE.name,
      description: SITE.description,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: PLATFORMS.map((p) => `Download ${p.label} videos`),
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE.url}/#faq`,
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Escape "<" so no string in the payload can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Landing />
    </>
  );
}
