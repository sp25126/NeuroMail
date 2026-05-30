# Phase 4 — Tracking Engine Specification

This document details the tracking adapter abstractions, provider integrations, milestone mapping, status synchronizer workers, retry behaviors, and DLQ pathways for tracking.

---

## 🔌 TrackingAdapter Interface

The core tracking module uses standard adapter interfaces defined under `src/freight-service/services/tracking/`:

```typescript
export interface ShipmentIdentifierContext {
    tenantId: string;
    shipmentId: string;
    carrier: string;
    containerNumber?: string;
    bol?: string;
    bookingNumber?: string;
    providerTrackingId?: string;
}

export interface ProviderEvent {
    eventId: string;
    milestoneCode: string; // Carrier-specific code
    eventTime: string;
    locationName?: string;
    rawPayload: any;
}

export type DCSA_Milestone = 
    | "DEPARTURE" 
    | "ARRIVAL" 
    | "AVAILABLE_FOR_PICKUP" 
    | "GATE_IN" 
    | "GATE_OUT";

export interface TrackingResult {
    shipmentId: string;
    tenantId: string;
    currentStatus: "IN_TRANSIT" | "ARRIVED_PORT" | "AVAILABLE_PICKUP" | "DELIVERED" | "UNKNOWN";
    latestEta?: string;
    events: ProviderEvent[];
}

export interface TrackingAdapter {
    fetchStatus(context: ShipmentIdentifierContext): Promise<TrackingResult>;
    batchFetchStatus(contexts: ShipmentIdentifierContext[]): Promise<TrackingResult[]>;
}
```

---

## 🚢 Aggregator Client (Project44)

The primary aggregator tracking client (`Project44Client`) targets the unified API endpoints:
- Exposes `getStatusByContainer(container)` and `getStatusByBol(bol)` methods.
- **Error Handling**: Reads HTTP status codes and handles rate-limiting (`429 Too Many Requests`). Extracts headers like `X-RateLimit-Reset` to execute backoff strategies.

---

## 🔀 MilestoneMapper Pure Function

Resolves carrier or aggregator events to standardized DCSA (Digital Container Shipping Association) milestones:

```typescript
export function mapToDCSAMilestone(eventCode: string): DCSA_Milestone {
    const code = eventCode.toUpperCase().trim();
    if (code.includes("ARRIV") || code.includes("ARRI")) return "ARRIVAL";
    if (code.includes("DEPAR") || code.includes("DEPA")) return "DEPARTURE";
    if (code.includes("PICK") || code.includes("AVAIL")) return "AVAILABLE_FOR_PICKUP";
    if (code.includes("GATEIN") || code.includes("INB")) return "GATE_IN";
    if (code.includes("GATEOUT") || code.includes("OUB")) return "GATE_OUT";
    return "ARRIVAL"; // Fallback default
}
```

---

## 🕒 F2 Status Sync Worker & Scheduling

The status synchronization task (`runStatusSync`) is invoked periodically (default: 30 minutes, or customized per tenant in `freight_settings`):
1. Filters active shipments that are not marked as `DELIVERED` or `CANCELLED`.
2. Gathers tracking identifiers (Container, BOL, or Booking number).
3. Calls the `TrackingAdapter` to download latest status.
4. Appends new events chronologically to `shipment_events`.
5. Updates the master `shipments` status, ETA, and Free Day values.

---

## ⚠️ Retries & DLQ (Dead Letter Queue)

If a tracking update fails due to carrier API errors:
- **Transient Failures (500/503/429)**: Retried with exponential backoff ($2^{\text{retry}} \times 1000$ milliseconds).
- **Persistent Failures**: If retries exceed 5, the shipment is logged to `dlq_failed_tracking` table.
- **Admin Requeue API**: Exposes `POST /api/admin/freight/dlq/requeue` to clear the error state and retry tracking.
