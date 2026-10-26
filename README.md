# Fintech Recurring Intelligence

**Hackathon:** hackFront India 2026
**Problem:** T4.1 — The Auto Debits Nobody Can Find
**Team:** CTRL+SLOTH
**Stage:** Research and specification

## Vision

Help people understand recurring financial commitments that are hidden
behind confusing transaction descriptions, irregular renewals, and
unclear cancellation processes.

## Planned capabilities

- Merchant descriptor normalisation and alias matching
- Monthly, quarterly, annual and irregular recurrence detection
- Evidence-backed price-change alerts
- Candidate trial-to-paid and resumed-charge detection
- Annualised spending estimates
- Confidence scores and explanations
- Payment-mechanism-aware cancellation guidance
- Evaluation against labelled synthetic data
- Optional Hindi/English explanations through Sarvam AI

## Principles

1. Synthetic financial data only for the prototype.
2. Show the transactions supporting each prediction.
3. Separate observed facts from inferred commitments.
4. Never equate recurring payments with confirmed active mandates.
5. Never infer non-use from payment history alone.
6. Never claim cancellation has occurred unless independently verified.

## Development status

- [x] Initial folder structure created
- [ ] Research and requirements documented
- [ ] Dataset specification finalised
- [ ] Synthetic dataset generated and labelled
- [ ] Baseline detection engine implemented
- [ ] Evaluation metrics and edge-case tests
- [ ] Advanced detection comparison
- [ ] Interface and cancellation guide
- [ ] Partner-track qualification verified
- [ ] Final prototype and submission package

## Local setup

Python version and dependencies will be documented after the implementation
stack is selected. Follow the setup instructions added during development.

## Documentation

See `research/` for research and sources, `docs/` for architecture and
decisions, `data/dataset_specification.md` for the dataset contract,
and `tests/evaluation_plan.md` for evaluation methodology.

## Limitations

The prototype analyses supplied transaction records. Unless independently
connected to a verified mandate source, it cannot guarantee that a payment
is an active subscription, establish service usage, or cancel a commitment.
