# Indian Payment Ecosystem Research

Research date: 2026-10-27
Project: hackFront India 2026 — Fintech T4.1

## 1. Problem context

Recurring commitments can appear in transaction histories as merchant
debits, card transactions, UPI AutoPay payments, or other payment flows.
A transaction descriptor alone may not identify the underlying service,
mandate, or cancellation route.

## 2. UPI AutoPay

Primary source:
https://www.npci.org.in/uploads/UPI_OC_No_223_FY_2025_26_Enhancement_of_UPI_Autopay_88b38535cb.pdf

NPCI circular dated 2025-10-07 describes enhancements including viewing
active mandates, mandate portability, and lifecycle management through
the relevant UPI app. It mentions existing operations such as revoke,
pause and modify.

Product implication:
- Distinguish a transaction-based recurring-payment candidate from a
  verified active UPI mandate.
- If the payment route is confirmed as UPI AutoPay, guide the user to
  the mandate-management section of their UPI app.
- Tell users to verify the merchant and mandate details before acting.
- Do not claim the prototype has retrieved a user's actual mandates.

## 3. RBI e-mandate framework

Primary source:
https://www.rbi.org.in/scripts/bs_circularindexdisplay.aspx/Scripts/BS_CircularIndexDisplay.aspx?Id=12722

RBI circular RBI/2024-25/64 dated 2024-08-22 discusses the recurring
e-mandate framework and pre-debit notifications. It also describes an
exception for threshold-based auto-replenishment of FASTag and NCMC.

Product implication:
- Do not assume all payment mechanisms have identical rules.
- Avoid making universal legal claims about notifications or cancellation.
- Verify current rules and service-specific instructions before publishing
  guidance for a real service.

## 4. Card-based recurring payments

Card recurring transactions and mandates may involve the card issuer,
payment network, merchant, or third-party billing platform.

Product implication:
- Treat the payment route as unknown unless the synthetic record or
  user-confirmed information establishes it.
- Provide a verified issuer or merchant route when known.
- Do not imply that blocking a payment instrument necessarily cancels
  the underlying service contract.

Reference for background:
https://www.rbi.org.in/scripts/RTGS_Notification.aspx?Id=11668

## 5. Evidence boundaries

Transaction data can support observations such as:
- Similar amounts charged at regular intervals.
- A change in the observed charge amount.
- A long gap followed by another similar charge.
- Similar descriptors that may map to a known merchant.

Transaction data alone cannot reliably prove:
- That an active mandate still exists.
- That the user stopped using the service.
- That a price change was intentional or unexplained by tax or usage.
- That a cancellation request has succeeded.

## 6. Research still required

- Verify official cancellation instructions for selected real services.
- Verify which Indian UPI apps expose mandate-management screens.
- Investigate ambiguity between merchant, payment aggregator and billing
  platform descriptors.
- Record the exact source and date checked for each cancellation guide.
