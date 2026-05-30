import { describe, it, expect } from "vitest";
import { validateContainerNumber, isFreightRelatedSubject, parseEmailEntities } from "../services/discovery";

describe("Container Checksum Validation (ISO 6346)", () => {
  it("should validate correct container numbers", () => {
    // Standard test containers (validated with checksum algorithm)
    expect(validateContainerNumber("MSCU1234566")).toBe(true);
    expect(validateContainerNumber("CSQU3054383")).toBe(true);
    expect(validateContainerNumber("MAEU1234568")).toBe(false); // Invalid check digit
  });

  it("should return false for invalid formats", () => {
    expect(validateContainerNumber("abc")).toBe(false);
    expect(validateContainerNumber("MSCU123456")).toBe(false); // Too short
    expect(validateContainerNumber("MSCU12345678")).toBe(false); // Too long
    expect(validateContainerNumber("12345678901")).toBe(false); // No prefix
  });
});

describe("Subject Keyword Detection", () => {
  it("should detect freight keywords", () => {
    expect(isFreightRelatedSubject("Shipment status update")).toBe(true);
    expect(isFreightRelatedSubject("New container loading plan")).toBe(true);
    expect(isFreightRelatedSubject("Random topic")).toBe(false);
  });
});

describe("Email Parser", () => {
  it("should parse entities from subject", () => {
    const subject = "Shipment update for MSCU1234566 and MSCU2222222"; // MSCU1234566 has correct checksum
    const body = "Nothing here.";
    const result = parseEmailEntities(subject, body);
    expect(result.containerNumbers).toContain("MSCU1234566");
    expect(result.containerNumbers).not.toContain("MSCU2222222"); // Should fail checksum
  });

  it("should fallback to body context validation when keywords match", () => {
    const subject = "Urgent Shipment Details";
    const body = "Here is the container MSCU1234566 on vessel CMA CGM.";
    const result = parseEmailEntities(subject, body);
    expect(result.containerNumbers).toContain("MSCU1234566");
  });

  it("should ignore body matches if no context keywords are present", () => {
    const subject = "Hello Friend";
    const body = "I was looking at MSCU1234566 today.";
    const result = parseEmailEntities(subject, body);
    expect(result.containerNumbers).not.toContain("MSCU1234566");
  });
});
