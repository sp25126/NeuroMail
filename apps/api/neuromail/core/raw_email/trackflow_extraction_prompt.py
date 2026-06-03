from typing import List, Any
import json

def build(raw_email: Any, partial_result: Any, tenant_rules: List[str]) -> str:
    """
    Builds a structured prompt instructing the model to extract freight shipment fields,
    taking into account partial results from the deterministic parser.
    """
    subject = getattr(raw_email, "subject", "") or ""
    sender = getattr(raw_email, "from_address", getattr(raw_email, "sender", "")) or ""
    body = getattr(raw_email, "raw_body", getattr(raw_email, "body", "")) or ""

    # Format partial results
    partial_dict = {}
    if partial_result and hasattr(partial_result, "fields"):
        for k, f in partial_result.fields.items():
            if f.value:
                partial_dict[k] = {
                    "value": f.value,
                    "confidence": f.confidence,
                    "method": f.method
                }

    # Format tenant subject patterns
    rules_context = ", ".join(tenant_rules) if tenant_rules else "None configured"

    prompt = f"""You are a high-precision logistics extraction assistant.
Analyze the following freight email and extract structured shipment details.

FIELD INSTRUCTIONS:
Extract ONLY the following fields:
- booking_ref: Booking reference or Booking number
- container_id: Standard ISO container number (usually 4 uppercase letters followed by 7 digits, e.g. MSKU1234567)
- bl_number: Bill of Lading (B/L or BoL) number
- po_number: Purchase Order (PO) number
- carrier: Ocean carrier or shipping line name (e.g. Maersk, MSC, Hapag-Lloyd, CMA CGM, Evergreen)
- origin_port: Port of Loading (POL) or Origin Port
- destination_port: Port of Discharge (POD) or Destination Port
- vessel: Ship or Vessel name
- eta: Estimated Time of Arrival (format as YYYY-MM-DD if possible)

CONTEXT & HINTS:
- Tenant Subject Matching Rules (hints for what to look for): {rules_context}
- Sender: {sender}

PARTIAL RESULTS FROM DETERMINISTIC PARSER:
We have already run a deterministic regex parser. If any of the following fields are already found with high confidence, verify them against the email body. Focus heavily on filling in the missing (null/empty) fields, and correcting any errors or low-confidence values.
{json.dumps(partial_dict, indent=2)}

EMAIL CONTENT TO PARSE:
Subject: {subject}
Sender Address: {sender}

Email Body:
---
{body}
---

OUTPUT FORMAT REQUIREMENT:
You must output a single JSON object matching the following structure:
{{
  "booking_ref": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "container_id": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "bl_number": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "po_number": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "carrier": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "origin_port": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "destination_port": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "vessel": {{ "value": "extracted_value or null", "confidence": float_between_0_and_1 }},
  "eta": {{ "value": "YYYY-MM-DD or null", "confidence": float_between_0_and_1 }}
}}

Do not include any free-form conversational text, explanations, or markdown fences in the response. Return ONLY valid JSON.
"""
    return prompt
