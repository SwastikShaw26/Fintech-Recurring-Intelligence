# Architecture

## Design objective

Build an explainable, testable recurring-payment intelligence engine before
adding the web interface or optional integrations.

## Planned pipeline

Synthetic CSV
    -> Input validation
    -> Merchant descriptor normalisation
    -> Merchant alias resolution
    -> Candidate transaction grouping
    -> Temporal recurrence analysis
    -> Price-change and anomaly analysis
    -> Evidence and confidence calculation
    -> Annualised cost estimation
    -> Cancellation guidance
    -> User-facing report and evaluation metrics

## Initial modules

- `src/data_loader.py`: CSV loading and validation
- `src/merchant_resolver.py`: descriptor cleanup and alias matching
- `src/recurrence_detector.py`: recurrence candidate generation
- `src/anomaly_detector.py`: price changes and unusual gaps
- `src/cost_estimator.py`: annualised spend calculations
- `src/cancellation_guide.py`: verified guidance lookup
- `src/evaluation.py`: precision, recall, F1 and error analysis
- `src/main.py`: command-line entry point

These are planned module boundaries; create modules as each stage is
implemented rather than generating empty application code all at once.

## Detection strategy

Stage 1: Transparent rule-based baseline.
Stage 2: Feature engineering and difficult negative examples.
Stage 3: Compare alternative scoring or machine-learning approaches if
the labelled dataset is sufficient.
Stage 4: Evaluate on held-out cases and analyse false positives.

## Evidence model

Each candidate should retain:
- Matched transaction identifiers
- Original and normalised merchant descriptions
- Observed dates and amounts
- Estimated cadence and amount variability
- Confidence score and contributing signals
- Uncertainty or reasons for rejection
- Ground-truth label during evaluation only

## Privacy and safety

- Use synthetic records only.
- Do not store bank credentials.
- Do not initiate or execute payments.
- Do not claim a cancellation succeeded from displaying instructions.
- Keep test labels separate from model inputs to prevent leakage.

## Future integrations

Sarvam AI: optional multilingual explanations after core correctness tests.
Neo4j: consider only if graph relationships improve alias resolution or
commitment linking over a simpler baseline.
Frontend: added after stable input/output contracts exist.
