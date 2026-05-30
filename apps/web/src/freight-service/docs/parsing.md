# Deterministic Parsing Templates & DSL Specification

This document details the rule-based parsing engine structure, providing exact JSON extraction templates and validation payloads.

## ⚙️ Parsing Rule Engine Configuration

Templates are stored in the database to allow dynamic updates without modifying application code.
The first template matching the email subject and sender patterns is evaluated.

```json
{
  "carrier": "MSC",
  "email_type": "ARRIVAL_NOTICE",
  "subject_pattern": "(?i)arrival\\s*notice.*",
  "body_rules": [
    {
      "field": "container_number",
      "regex": "(?i)container\\s*(?:no|num|#)?\\s*:\\s*([A-Z]{4}\\d{7})",
      "group": 1
    },
    {
      "field": "eta",
      "regex": "(?i)eta\\s*:\\s*(\\d{4}-\\d{2}-\\d{2})",
      "group": 1
    }
  ]
}
```

---

## 📋 3 Carrier Extraction Templates

### 1. MSC Arrival Notice Template
- **Subject Pattern**: `(?i)Arrival Notice.*`
- **Body Rules**:
  - `container_number`: `(?i)container(?:\s*no|\s*num|\s*#)?\s*:\s*([A-Z]{4}\d{7})` (Group 1)
  - `eta`: `(?i)eta\s*:\s*(\d{4}-\\d{2}-\\d{2})` (Group 1)
  - `last_free_day`: `(?i)last\s*free\s*day\s*:\s*(\d{4}-\\d{2}-\\d{2})` (Group 1)

### 2. COSCO Booking Confirmation Template
- **Subject Pattern**: `(?i)Booking Confirmation.*`
- **Body Rules**:
  - `booking_number`: `(?i)booking\s*(?:no|num|#)?\s*:\s*([A-Z0-9\-]{6,20})` (Group 1)
  - `origin`: `(?i)port\s*of\s*loading\s*:\s*([A-Za-z\s]+)` (Group 1)
  - `destination`: `(?i)port\s*of\s*discharge\s*:\s*([A-Za-z\s]+)` (Group 1)

### 3. Maersk Pre-Advice Template
- **Subject Pattern**: `(?i)Pre-Advice.*`
- **Body Rules**:
  - `bol_number`: `(?i)bill\s*of\s*lading\s*(?:no|num|#)?\s*:\s*([A-Z0-9]{8,16})` (Group 1)
  - `container_number`: `(?i)container\s*:\s*([A-Z]{4}\d{7})` (Group 1)

---

## 🧪 Inbound Validation Payloads

### Payload 1: Valid MSC Arrival Notice (Happy Path)
```text
Subject: Arrival Notice: Shipment MSCU1234566
Dear Customer,
Please find your arrival details:
Container: MSCU1234566
ETA: 2026-06-05
Last Free Day: 2026-06-10
```
- **Expected Output**:
  - Container Number: `MSCU1234566`
  - ETA: `2026-06-05`
  - Last Free Day: `2026-06-10`

### Payload 2: COSCO Booking
```text
Subject: Booking Confirmation - Ref COSCO99283
Booking No: COSCO-Hamburg-992
Port of Loading: Port of Hamburg
Port of Discharge: Port of New York
```
- **Expected Output**:
  - Booking Number: `COSCO-Hamburg-992`
  - Origin: `Port of Hamburg`
  - Destination: `Port of New York`
