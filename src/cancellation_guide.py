"""
Payment-mechanism-aware cancellation guidance for Indian recurring transactions.
Based on NPCI UPI AutoPay regulations (OC No. 223) and RBI e-mandate framework (RBI/2024-25/64).
"""

from typing import Dict, Any, List

GUIDANCE_BY_METHOD: Dict[str, Dict[str, Any]] = {
    "upi autopay": {
        "mechanism": "UPI AutoPay",
        "regulatory_framework": "NPCI UPI AutoPay Guidelines (OC No. 223)",
        "summary": "Manage or revoke the recurring mandate directly inside your UPI application.",
        "steps": [
            "Open your primary UPI app (Google Pay, PhonePe, Paytm, BHIM, or your bank app).",
            "Navigate to Profile / Settings > 'UPI AutoPay' or 'Recurring Mandates'.",
            "Locate the mandate matching this merchant or payment descriptor.",
            "Tap the mandate to view details, then select 'Pause' or 'Revoke / Cancel Mandate'.",
            "Enter your 4 or 6-digit UPI PIN to confirm the cancellation.",
            "Verify you receive an SMS or notification confirming the mandate status is 'Revoked'."
        ],
        "important_notes": [
            "Revoking an AutoPay mandate stops future automated debits immediately.",
            "If you have an active contract with the merchant, also check your merchant account to ensure you do not incur arrears.",
            "FinSight does not directly connect to your UPI app and cannot initiate cancellations on your behalf."
        ]
    },
    "card": {
        "mechanism": "Card E-Mandate (Credit / Debit Card)",
        "regulatory_framework": "RBI Recurring E-Mandate Framework (RBI/2024-25/64)",
        "summary": "Cancel recurring subscription via merchant billing or through your card issuer's e-mandate hub.",
        "steps": [
            "Merchant direct route: Log into the merchant website or app, navigate to 'Billing' or 'Subscription', and click 'Cancel Subscription'.",
            "Card issuer portal: Log into your bank's NetBanking or Mobile Banking app, go to Cards > 'Manage Recurring Payments / E-Mandates'.",
            "E-Mandate Hub: You can also use your bank's SI-Hub / Mastercard or Visa mandate management portal to revoke the specific merchant standing instruction.",
            "Optional safeguard: If the merchant continues unauthorized billing, set your card's online recurring transaction limit to zero or request card token deletion."
        ],
        "important_notes": [
            "RBI requires card issuers to send a pre-debit notification at least 24 hours prior to recurring card debits.",
            "Blocking a card token stops payment but does not unilaterally terminate contractual service agreements."
        ]
    },
    "bank mandate": {
        "mechanism": "Bank Direct Mandate (NACH / eNACH)",
        "regulatory_framework": "NPCI National Automated Clearing House (NACH) Regulations",
        "summary": "Cancel recurring ECS/NACH mandate via NetBanking or bank branch instruction.",
        "steps": [
            "Log into your bank's NetBanking portal.",
            "Navigate to Services / Accounts > 'NACH Mandates' or 'Standing Instructions'.",
            "Find the mandate using the Mandate UMRN (Unique Mandate Reference Number) or merchant name.",
            "Select 'Stop / Cancel Mandate' and authorize with OTP or NetBanking password.",
            "If online cancellation is unsupported by your bank, submit a physical Mandate Cancellation Request Form at your home branch."
        ],
        "important_notes": [
            "Banks are required by RBI/NPCI to accept mandate cancellation requests up to 2 working days before the scheduled debit date.",
            "Retain your mandate stop confirmation acknowledgment number."
        ]
    },
    "upi": {
        "mechanism": "Standard UPI (One-Off / Manual)",
        "regulatory_framework": "NPCI Unified Payments Interface",
        "summary": "This was paid via standard one-time UPI rather than an active recurring mandate.",
        "steps": [
            "Check whether this was a manual one-time payment rather than an automatic debit.",
            "If the merchant charges you repeatedly, check your UPI app's AutoPay section to confirm no active mandate was created.",
            "Contact merchant customer support or check your active account billing status."
        ],
        "important_notes": [
            "One-time UPI payments cannot automatically debit funds in the future without explicit UPI PIN entry."
        ]
    },
    "unknown": {
        "mechanism": "Unspecified Payment Mechanism",
        "regulatory_framework": "General Consumer Financial Protection",
        "summary": "Identify the payment route from your bank account statement or reference ID.",
        "steps": [
            "Review your original bank account or card statement to determine whether this payment cleared as UPI, Card, or NetBanking/ECS.",
            "Look up the merchant transaction descriptor in your bank mobile app to see the underlying payment channel.",
            "Log into the merchant's account profile to check active subscriptions and payment methods on file."
        ],
        "important_notes": [
            "Always verify payment status through your official financial institution before taking dispute actions."
        ]
    }
}


def get_cancellation_guidance(payment_method: str = "", merchant_name: str = "") -> Dict[str, Any]:
    key = str(payment_method or "").strip().lower()
    
    if "autopay" in key or "upi autopay" in key:
        guide = dict(GUIDANCE_BY_METHOD["upi autopay"])
    elif "card" in key:
        guide = dict(GUIDANCE_BY_METHOD["card"])
    elif "bank mandate" in key or "nach" in key or "ecs" in key:
        guide = dict(GUIDANCE_BY_METHOD["bank mandate"])
    elif "upi" in key:
        guide = dict(GUIDANCE_BY_METHOD["upi"])
    else:
        guide = dict(GUIDANCE_BY_METHOD["unknown"])
        
    guide["merchant_name"] = merchant_name or "Merchant"
    return guide
