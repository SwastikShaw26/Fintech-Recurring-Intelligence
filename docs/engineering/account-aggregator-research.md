# India Account Aggregator integration research

Reviewed 12 November 2026. FinSight currently analyzes user-provided CSVs. This note records the eligibility and consent questions a future bank-data integration must resolve.

## Roles and eligibility

- A Financial Information Provider (FIP) holds and supplies eligible financial information. An Account Aggregator (AA) manages consent and transfers that information. A Financial Information User (FIU) receives the information for the consented purpose. RBI defines an FIU as registered with and regulated by a financial sector regulator. FinSight's current project status establishes no FIU eligibility. [RBI NBFC–Account Aggregator Directions, 2025](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12936) · [Department of Financial Services overview](https://www.financialservices.gov.in/account-aggregator-framework)
- An NBFC-AA has a separate RBI registration process and responsibilities, including restrictions on third parties undertaking aggregation business on its behalf. The AA may share authorized information with the customer or intended FIU and may not retain the accessed financial information. RBI-regulated entities joining as FIUs must also join as FIPs when they hold covered data and qualify as FIPs. [RBI Directions, paragraphs 12–14 and 27–30](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12936)

## Path to validate before implementation

1. Identify the regulated entity that would receive the data and the licensed AA that would manage consent. Have the proposed FIU confirm the permitted purpose, its own regulatory and vendor responsibilities, and whether FinSight may act as its technology provider. A commercial agreement alone does not establish FIU eligibility.
2. Define the minimal data and retention required for recurring-payment analysis. Build a sandbox flow for consent purpose, data scope, recipient, expiry, revocation, and auditable use. Use synthetic fixtures until partner authorization and agreements are in place.
3. Obtain explicit approval and authorized sandbox credentials before any live connection. Keep bank login credentials and PINs out of FinSight. Keep mandate withdrawal and payment execution separate from the data-access flow. [RBI Directions, paragraphs 14–30](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12936)

The production integration decision depends on verified partner eligibility, permitted processing terms, and approval. This research does not establish that a partner has agreed to participate.

## October 2026 update

RBI's October 7 announcement originally targeted December 31, 2026 for its interoperability and consolidated statement measures. ReBIT published interoperability API 1.0.0 on October 14 and subsequently reported a revised interoperability adoption deadline of December 1, 2026. Confirm implementation status with any proposed regulated partner. The 2025 FIU eligibility requirement still governs the participation assessment above. [RBI announcement](https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=63743) · [ReBIT interoperability specification](https://api.rebit.org.in/spec/iopaa) · [ReBIT adoption notice](https://api.rebit.org.in/) · [Sahamati implementation update](https://sahamati.org.in/interoperability-on-account-aggregator/)
