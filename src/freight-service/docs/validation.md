# Validation Utilities and ISO 6346 Specification

This document details the validation algorithms used to normalize and verify freight identifiers.

## 🔢 ISO 6346 Check Digit Algorithm

An ISO 6346 container number consists of:
- **Owner Code**: 3 letters (e.g. `MSC`).
- **Equipment Category Identifier**: 1 letter (`U`, `J`, or `Z`).
- **Serial Number**: 6 digits.
- **Check Digit**: 1 digit.

### Conversion Table
Letters are assigned values:
- `A` = 10, `B` to `K` = 12 to 21 (skipping multiples of 11: 11, 22, 33).
- `L` to `U` = 23 to 32.
- `V` to `Z` = 34 to 38.

### Mathematical Weight
Each character at position $i$ (from 0 to 9) is multiplied by $2^i$:
$$\text{Sum} = \sum_{i=0}^{9} \text{Value}(char_i) \times 2^i$$

The Check Digit is:
$$\text{Check Digit} = \text{Sum} \pmod{11} \pmod{10}$$

---

## 🛠️ Validation Functions

### 1. `validateContainerNumber(containerNo: string): boolean`
Verifies formatting (`^[A-Z]{4}\d{7}$`) and checks the calculated ISO 6346 check digit.

- **Valid Examples**:
  - `MSCU1234566` (Check digit: 6)
  - `CSQU3054383` (Check digit: 3)
- **Invalid Examples**:
  - `MSCU1234567` (Failed check digit check)
  - `ABC1234` (Incorrect format)

### 2. `validateBillOfLading(bol: string): boolean`
Ensures standard BOL formatting:
- Pattern: `^[A-Z0-9]{8,16}$`

### 3. `validateBookingNumber(booking: string): boolean`
Validates booking references:
- Pattern: `^[A-Z0-9\-]{6,25}$`

---

## ⚠️ Quarantine & Error Handling Codes

If any identifier fails validation or matching fails:
- **`validation_failed`**: The extracted container number failed the ISO 6346 check digit sum.
- **`unmatched_template`**: No parsing rule regex matched the incoming email layout.
- **`empty_payload`**: Email body lacked plain text or HTML content.
- **`missing_mandatory_fields`**: Parsed record lacked required identifiers (e.g., both Booking and BOL numbers are missing).
