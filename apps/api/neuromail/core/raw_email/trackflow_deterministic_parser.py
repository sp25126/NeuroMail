import re
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
from services.freight_service import parse_date_robustly

logger = logging.getLogger("TrackFlow.DeterministicParser")

@dataclass
class ExtractedIdentifier:
    identifier_type: str  # container_id, booking_ref, bl_number, po_number
    identifier_value: str
    confidence: float = 1.0

@dataclass
class ExtractedPort:
    port_type: str  # origin, destination
    port_name: str
    confidence: float = 1.0

@dataclass
class ExtractedField:
    value: Optional[str]
    confidence: float
    method: str = "deterministic"

@dataclass
class DeterministicExtractionResult:
    primary_reference: Optional[str]
    carrier: Optional[str]
    identifiers: List[ExtractedIdentifier]
    ports: List[ExtractedPort]
    eta: Optional[datetime]
    confidence: float  # 0.0 to 1.0
    fields: Dict[str, ExtractedField]  # name -> ExtractedField
    extraction_method: str = "deterministic"

KNOWN_CARRIERS = {
    "maersk": "Maersk",
    "msc": "MSC",
    "hapag-lloyd": "Hapag-Lloyd",
    "cma cgm": "CMA CGM",
    "evergreen": "Evergreen",
    "cosco": "COSCO",
    "one": "ONE",
    "dhl": "DHL",
    "fedex": "FedEx",
    "oocl": "OOCL",
    "yang ming": "Yang Ming",
    "zim": "ZIM",
    "hmm": "HMM"
}

CARRIER_DOMAINS = {
    "maersk.com": "Maersk",
    "msc.com": "MSC",
    "hapag-lloyd.com": "Hapag-Lloyd",
    "cma-cgm.com": "CMA CGM",
    "evergreen-marine.com": "Evergreen",
    "coscoshipping.com": "COSCO",
    "coscon.com": "COSCO",
    "one-line.com": "ONE",
    "dhl.com": "DHL",
    "fedex.com": "FedEx"
}

def parse(raw_email: Any, tenant_rules: List[str] = []) -> DeterministicExtractionResult:
    """
    Deterministic, template/regex-based extraction for freight emails.
    """
    # 1. Read email fields robustly
    subject = getattr(raw_email, "subject", "") or ""
    sender = getattr(raw_email, "from_address", getattr(raw_email, "sender", "")) or ""
    body = getattr(raw_email, "raw_body", getattr(raw_email, "body", "")) or ""
    raw_headers = getattr(raw_email, "raw_headers", {}) or {}

    combined_text = f"{subject}\n{body}"
    
    extracted_booking_ref = None
    extracted_container_id = None
    extracted_bl_number = None
    extracted_po_number = None
    extracted_vessel = None
    extracted_origin_port = None
    extracted_destination_port = None
    extracted_eta = None
    extracted_carrier = None

    # 1) Subject patterns matching
    for pattern in tenant_rules:
        try:
            # Check if it's a regex pattern or simple string
            if "(" in pattern and ")" in pattern:
                match = re.search(pattern, subject, re.IGNORECASE)
                if match and match.lastindex:
                    # Treat the first capture group as booking/primary reference
                    extracted_booking_ref = match.group(1).strip()
                    logger.info(f"Extracted booking reference from subject pattern group: {extracted_booking_ref}")
                    break
            elif pattern.lower() in subject.lower():
                # If it matches as simple string, try to grab whatever follows it
                escaped_pat = re.escape(pattern)
                match = re.search(escaped_pat + r'\s*[:\-#\s]*([A-Za-z0-9\-]+)', subject, re.IGNORECASE)
                if match:
                    extracted_booking_ref = match.group(1).strip()
                    logger.info(f"Extracted reference from subject pattern string match: {extracted_booking_ref}")
                    break
        except Exception as pe:
            logger.warning(f"Error executing tenant subject pattern '{pattern}': {pe}")

    # 2) Technical headers scan
    headers_dict = {}
    if isinstance(raw_headers, dict):
        headers_dict = {k.lower(): v for k, v in raw_headers.items()}
    elif isinstance(raw_headers, list):
        for h in raw_headers:
            if isinstance(h, dict) and "name" in h and "value" in h:
                headers_dict[h["name"].lower()] = h["value"]

    # Header overrides
    if "x-carrier" in headers_dict:
        extracted_carrier = headers_dict["x-carrier"].strip()
    if "x-booking-ref" in headers_dict:
        extracted_booking_ref = headers_dict["x-booking-ref"].strip()
    if "x-container-id" in headers_dict:
        extracted_container_id = headers_dict["x-container-id"].strip()
    if "x-bl-number" in headers_dict:
        extracted_bl_number = headers_dict["x-bl-number"].strip()
    if "x-po-number" in headers_dict:
        extracted_po_number = headers_dict["x-po-number"].strip()
    if "x-eta" in headers_dict:
        parsed_hdr_eta = parse_date_robustly(headers_dict["x-eta"])
        if parsed_hdr_eta:
            extracted_eta = parsed_hdr_eta

    # 3) Regex-based field extraction
    # Booking Reference: BK/REF/BOOKING + alphanumeric (6-20 characters)
    if not extracted_booking_ref:
        bk_match = re.search(r'\b(?:BOOKING|BK|REF|BOOKING\s*REF|REF\s*NO)[:\s\-#]*([A-Za-z0-9\-]{6,20})\b', combined_text, re.IGNORECASE)
        if bk_match:
            extracted_booking_ref = bk_match.group(1).strip()

    # Container ID: ISO ABCD1234567 (4 letters, 7 digits)
    if not extracted_container_id:
        cont_match = re.search(r'\b([A-Z]{4}\d{7})\b', combined_text)
        if cont_match:
            extracted_container_id = cont_match.group(1).strip()

    # B/L number: Bill of Lading
    if not extracted_bl_number:
        bl_match = re.search(r'\b(?:BOL|BL|B/L|BILL\s*OF\s*LADING)[:\s\-#]*([A-Za-z0-9\-]{8,20})\b', combined_text, re.IGNORECASE)
        if bl_match:
            extracted_bl_number = bl_match.group(1).strip()

    # PO Number
    if not extracted_po_number:
        po_match = re.search(r'\b(?:PO|P\.O\.|PURCHASE\s*ORDER)[:\s\-#]*([A-Za-z0-9\-]{5,15})\b', combined_text, re.IGNORECASE)
        if po_match:
            extracted_po_number = po_match.group(1).strip()

    # Vessel name
    if not extracted_vessel:
        vsl_match = re.search(r'(?:vessel|vsl|ship|vessel\s*name)[:\s\-#]+([A-Za-z0-9\s\.\-]{3,30})(?:\r?\n|/|,|;|\t|$)', combined_text, re.IGNORECASE)
        if vsl_match:
            extracted_vessel = vsl_match.group(1).strip()

    # Ports of origin / destination
    if not extracted_origin_port:
        pol_match = re.search(r'(?:pol|port\s*of\s*loading|loading\s*port|origin|origin\s*port)[:\s\-#]+([A-Za-z\s\.\,\-]{3,30})(?:\r?\n|/|;|\t|$)', combined_text, re.IGNORECASE)
        if pol_match:
            extracted_origin_port = pol_match.group(1).strip()

    if not extracted_destination_port:
        pod_match = re.search(r'(?:pod|port\s*of\s*discharge|discharge\s*port|destination|destination\s*port)[:\s\-#]+([A-Za-z\s\.\,\-]{3,30})(?:\r?\n|/|;|\t|$)', combined_text, re.IGNORECASE)
        if pod_match:
            extracted_destination_port = pod_match.group(1).strip()

    # ETA Robust date parsing
    if not extracted_eta:
        eta_match = re.search(r'(?:eta|arrival|estimated\s*arrival|estimated\s*time\s*of\s*arrival)[:\s\-#]+([0-9\-\/]{8,10}|\w+\s+\d+,\s+\d{4}|\d{4}-\d{2}-\d{2})', combined_text, re.IGNORECASE)
        if eta_match:
            parsed_val = parse_date_robustly(eta_match.group(1).strip())
            if parsed_val:
                extracted_eta = parsed_val

    # Carrier Name Keyword Match
    if not extracted_carrier:
        # Check known carrier domains from sender address
        sender_lower = sender.lower()
        for domain, carrier_name in CARRIER_DOMAINS.items():
            if f"@{domain}" in sender_lower or f".{domain}" in sender_lower:
                extracted_carrier = carrier_name
                break
        
        # Fallback to keyword match
        if not extracted_carrier:
            for kw, carrier_name in KNOWN_CARRIERS.items():
                if re.search(r'\b' + re.escape(kw) + r'\b', combined_text, re.IGNORECASE):
                    extracted_carrier = carrier_name
                    break

    # 4) Determine primary reference
    primary_reference = extracted_booking_ref or extracted_bl_number or extracted_container_id

    # 5) Build list of ExtractedIdentifiers and ExtractedPorts
    identifiers = []
    ports = []
    
    if extracted_booking_ref:
        identifiers.append(ExtractedIdentifier("booking_ref", extracted_booking_ref, 1.0))
    if extracted_container_id:
        identifiers.append(ExtractedIdentifier("container_id", extracted_container_id, 1.0))
    if extracted_bl_number:
        identifiers.append(ExtractedIdentifier("bl_number", extracted_bl_number, 1.0))
    if extracted_po_number:
        identifiers.append(ExtractedIdentifier("po_number", extracted_po_number, 1.0))

    if extracted_origin_port:
        ports.append(ExtractedPort("origin", extracted_origin_port, 1.0))
    if extracted_destination_port:
        ports.append(ExtractedPort("destination", extracted_destination_port, 1.0))

    # 6) Calculate Confidence Score
    confidence = 0.0
    if primary_reference:
        confidence += 0.5
    if extracted_carrier:
        confidence += 0.2
    if extracted_eta:
        confidence += 0.2
    
    # Check if there's any other field (PO, Vessel, ports, etc.)
    has_other_field = False
    if extracted_po_number:
        has_other_field = True
    if extracted_vessel:
        has_other_field = True
    if extracted_origin_port or extracted_destination_port:
        has_other_field = True
    
    # Also if both booking and container numbers were found (one serves as primary, the other is extra)
    extra_idents = [i for i in identifiers if i.identifier_value != primary_reference]
    if extra_idents:
        has_other_field = True

    if has_other_field:
        confidence += 0.1

    # Cap confidence at 1.0
    confidence = min(confidence, 1.0)

    # 7) Populate fields dictionary
    fields = {
        "booking_ref": ExtractedField(extracted_booking_ref, 1.0 if extracted_booking_ref else 0.0),
        "container_id": ExtractedField(extracted_container_id, 1.0 if extracted_container_id else 0.0),
        "bl_number": ExtractedField(extracted_bl_number, 1.0 if extracted_bl_number else 0.0),
        "po_number": ExtractedField(extracted_po_number, 1.0 if extracted_po_number else 0.0),
        "carrier": ExtractedField(extracted_carrier, 1.0 if extracted_carrier else 0.0),
        "origin_port": ExtractedField(extracted_origin_port, 1.0 if extracted_origin_port else 0.0),
        "destination_port": ExtractedField(extracted_destination_port, 1.0 if extracted_destination_port else 0.0),
        "vessel": ExtractedField(extracted_vessel, 1.0 if extracted_vessel else 0.0),
        "eta": ExtractedField(extracted_eta.isoformat() if extracted_eta else None, 1.0 if extracted_eta else 0.0)
    }

    return DeterministicExtractionResult(
        primary_reference=primary_reference,
        carrier=extracted_carrier,
        identifiers=identifiers,
        ports=ports,
        eta=extracted_eta,
        confidence=confidence,
        fields=fields
    )
