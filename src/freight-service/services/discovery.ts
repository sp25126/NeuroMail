const ISO_LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19,
  J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29,
  S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38
};

/**
 * Validates a container number against ISO 6346 check digit algorithm.
 * A container number consists of 4 uppercase letters followed by 7 digits.
 */
export function validateContainerNumber(containerNumber: string): boolean {
  const cleaned = containerNumber.trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{7}$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = cleaned[i];
    let val: number;
    if (i < 4) {
      val = ISO_LETTER_VALUES[char];
    } else {
      val = parseInt(char, 10);
    }
    sum += val * Math.pow(2, i);
  }

  const calculatedCheckDigit = (sum % 11) % 10;
  const actualCheckDigit = parseInt(cleaned[10], 10);

  return calculatedCheckDigit === actualCheckDigit;
}

/**
 * Checks if the subject contains high confidence keywords related to shipping/freight.
 */
export function isFreightRelatedSubject(subject: string): boolean {
  const pattern = /(shipment|freight|container|bill of lading|booking|tracking|bol|vessel|ocean|air cargo)/i;
  return pattern.test(subject);
}

/**
 * Validates context around a matched string in email body.
 * Looks for keywords indicating actual shipment status within 100 characters.
 */
export function validateBodyContext(body: string, matchIndex: number, matchLength: number): boolean {
  const contextRange = 100;
  const start = Math.max(0, matchIndex - contextRange);
  const end = Math.min(body.length, matchIndex + matchLength + contextRange);
  const contextText = body.substring(start, end).toLowerCase();

  const contextKeywords = ["eta", "vessel", "discharge", "port", "carrier", "shipping", "freight", "destination", "origin", "arrival", "departure"];
  return contextKeywords.some(keyword => contextText.includes(keyword));
}

export interface DiscoveredEntities {
  containerNumbers: string[];
  billsOfLading: string[];
}

/**
 * Parses email subject and body to discover container numbers and bills of lading.
 */
export function parseEmailEntities(subject: string, body: string): DiscoveredEntities {
  const containerNumbers: string[] = [];
  const billsOfLading: string[] = [];

  // 1. Scan subject for container numbers
  const containerRegex = /\b([A-Z]{4}[0-9]{7})\b/g;
  let match;
  while ((match = containerRegex.exec(subject)) !== null) {
    const container = match[1];
    if (validateContainerNumber(container)) {
      containerNumbers.push(container);
    }
  }

  // 2. Scan subject for Bills of Lading
  // Prefix SCAC (4 letters) + 8-12 alphanumeric characters
  const bolRegex = /\b([A-Z]{4}[A-Z0-9]{8,12})\b/g;
  while ((match = bolRegex.exec(subject)) !== null) {
    const bol = match[1];
    // Exclude if it happens to match a valid container number format to prevent duplication
    if (!/^[A-Z]{4}[0-9]{7}$/.test(bol)) {
      billsOfLading.push(bol);
    }
  }

  // 3. Scan body if subject contains keywords or if we found nothing in the subject
  const shouldScanBody = isFreightRelatedSubject(subject) || (containerNumbers.length === 0 && billsOfLading.length === 0);

  if (shouldScanBody) {
    // Scan body for container numbers
    containerRegex.lastIndex = 0;
    while ((match = containerRegex.exec(body)) !== null) {
      const container = match[1];
      if (validateContainerNumber(container)) {
        if (validateBodyContext(body, match.index, container.length)) {
          containerNumbers.push(container);
        }
      }
    }

    // Scan body for Bills of Lading
    bolRegex.lastIndex = 0;
    while ((match = bolRegex.exec(body)) !== null) {
      const bol = match[1];
      if (!/^[A-Z]{4}[0-9]{7}$/.test(bol)) {
        if (validateBodyContext(body, match.index, bol.length)) {
          billsOfLading.push(bol);
        }
      }
    }
  }

  // Unique elements only
  return {
    containerNumbers: Array.from(new Set(containerNumbers)),
    billsOfLading: Array.from(new Set(billsOfLading))
  };
}
