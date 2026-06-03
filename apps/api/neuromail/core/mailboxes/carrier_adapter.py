from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List, Any
from datetime import datetime, timedelta
import os
import httpx
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger("Freight.CarrierAdapter")

@dataclass
class CarrierStatusResult:
    reference: str
    carrier_status: str
    location: Optional[str]
    eta: Optional[datetime]
    vessel_name: Optional[str]
    last_event: Optional[str]
    last_event_at: Optional[datetime]
    raw_response: dict
    is_arrived: bool
    is_delayed: bool
    events: Optional[List[dict]] = None # Helper for event syncing

class BaseCarrierAdapter(ABC):
    @abstractmethod
    def fetch_status(
        self, reference: str, identifier_type: str, db: Optional[Session] = None, tenant_id: Optional[str] = None
    ) -> CarrierStatusResult:
        pass

    @abstractmethod
    def supports_identifier_type(self, identifier_type: str) -> bool:
        pass

    @property
    @abstractmethod
    def carrier_name(self) -> str:
        pass

    def _get_mock_result(self, reference: str, carrier: str) -> CarrierStatusResult:
        """
        Helper to return realistic mock responses for testing and fallback scenarios.
        """
        ref_lower = reference.lower()
        now = datetime.utcnow()
        
        status = "IN_TRANSIT"
        eta = now + timedelta(days=7)
        location = "Port of Rotterdam"
        vessel = "MSC Oscar"
        is_arrived = False
        is_delayed = False
        last_event = "DEPARTURE"
        last_event_at = now - timedelta(days=1)
        
        events = [
            {"event_id": f"ev-gatein-{reference}", "milestone_code": "GATE_IN", "event_time": now - timedelta(days=2), "location_name": "Port of Shanghai", "raw_payload": {}},
            {"event_id": f"ev-depart-{reference}", "milestone_code": "DEPARTURE", "event_time": now - timedelta(days=1), "location_name": "Port of Shanghai", "raw_payload": {}}
        ]
        
        if "transit" in ref_lower:
            status = "IN_TRANSIT"
        elif "delay" in ref_lower:
            status = "IN_TRANSIT"
            eta = now + timedelta(days=9)
            is_delayed = True
        elif "arrive" in ref_lower:
            status = "ARRIVED_PORT"
            is_arrived = True
            location = "Port of Rotterdam"
            last_event = "ARRIVAL"
            last_event_at = now
            events.append(
                {"event_id": f"ev-arrive-{reference}", "milestone_code": "ARRIVAL", "event_time": now, "location_name": "Port of Rotterdam", "raw_payload": {}}
            )
        elif "pickup" in ref_lower:
            status = "AVAILABLE_PICKUP"
            is_arrived = True
            location = "Rotterdam Terminal 1"
            last_event = "AVAILABLE_FOR_PICKUP"
            last_event_at = now - timedelta(hours=12)
            events.extend([
                {"event_id": f"ev-arrive-{reference}", "milestone_code": "ARRIVAL", "event_time": now - timedelta(days=1), "location_name": "Port of Rotterdam", "raw_payload": {}},
                {"event_id": f"ev-pickup-{reference}", "milestone_code": "AVAILABLE_FOR_PICKUP", "event_time": now - timedelta(hours=12), "location_name": "Rotterdam Terminal 1", "raw_payload": {}}
            ])
        elif "delivered" in ref_lower:
            status = "DELIVERED"
            is_arrived = True
            location = "Warehouse Amsterdam"
            last_event = "GATE_OUT"
            last_event_at = now
            events.extend([
                {"event_id": f"ev-arrive-{reference}", "milestone_code": "ARRIVAL", "event_time": now - timedelta(days=2), "location_name": "Port of Rotterdam", "raw_payload": {}},
                {"event_id": f"ev-pickup-{reference}", "milestone_code": "AVAILABLE_FOR_PICKUP", "event_time": now - timedelta(days=1), "location_name": "Rotterdam Terminal 1", "raw_payload": {}},
                {"event_id": f"ev-outgate-{reference}", "milestone_code": "GATE_OUT", "event_time": now, "location_name": "Rotterdam Terminal 1", "raw_payload": {}}
            ])

        return CarrierStatusResult(
            reference=reference,
            carrier_status=status,
            location=location,
            eta=eta,
            vessel_name=vessel,
            last_event=last_event,
            last_event_at=last_event_at,
            raw_response={"mocked": True, "carrier": carrier, "timestamp": now.isoformat()},
            is_arrived=is_arrived,
            is_delayed=is_delayed,
            events=events
        )


def get_carrier_credential(db: Optional[Session], tenant_id: Optional[str], provider_type: str, credential_key: str) -> Optional[str]:
    if not db or not tenant_id:
        return None
    try:
        from models import FreightProviderConnection
        from services.vault import decrypt_token
        conn = db.query(FreightProviderConnection).filter(
            FreightProviderConnection.tenant_id == tenant_id,
            FreightProviderConnection.provider_type == provider_type,
            FreightProviderConnection.status == "connected"
        ).first()
        if conn and conn.connection_metadata:
            val = conn.connection_metadata.get(credential_key)
            if val and isinstance(val, str) and val.startswith("vault:"):
                return decrypt_token(val[6:])
            return val
    except Exception as e:
        logger.error(f"Error fetching connection credential for {provider_type}: {e}")
    return None

class Project44Adapter(BaseCarrierAdapter):
    @property
    def carrier_name(self) -> str:
        return "Project44"

    def supports_identifier_type(self, identifier_type: str) -> bool:
        return identifier_type in ["bill_of_lading", "booking_number"]

    def fetch_status(self, reference: str, identifier_type: str, db: Optional[Session] = None, tenant_id: Optional[str] = None) -> CarrierStatusResult:
        api_key = get_carrier_credential(db, tenant_id, "project44", "api_key") or os.environ.get("PROJECT44_API_KEY")
        if not api_key:
            logger.info("Project44 API key missing, falling back to mock response.")
            return self._get_mock_result(reference, self.carrier_name)

        try:
            # Simulated real REST call logic
            headers = {"Authorization": f"Bearer {api_key}"}
            url = f"https://api.project44.com/api/v4/shipments/tracking?ref={reference}&type={identifier_type}"
            response = httpx.get(url, headers=headers, timeout=10.0)
            if response.status_code == 429:
                from neuromail.core.mailboxes.rate_limiter import RateLimitError
                raise RateLimitError("Project44 rate limit exceeded")
            response.raise_for_status()
            data = response.json()
            # Map P44 API fields here
            return CarrierStatusResult(
                reference=reference,
                carrier_status=data.get("status", "IN_TRANSIT"),
                location=data.get("location"),
                eta=datetime.fromisoformat(data["eta"]) if data.get("eta") else None,
                vessel_name=data.get("vesselName"),
                last_event=data.get("lastEvent"),
                last_event_at=datetime.fromisoformat(data["lastEventAt"]) if data.get("lastEventAt") else None,
                raw_response=data,
                is_arrived=data.get("isArrived", False),
                is_delayed=data.get("isDelayed", False)
            )
        except Exception as e:
            logger.error(f"Project44 fetch failed for reference {reference}: {str(e)}")
            # For resilience in local testing/fallback
            return self._get_mock_result(reference, self.carrier_name)


class Terminal49Adapter(BaseCarrierAdapter):
    @property
    def carrier_name(self) -> str:
        return "Terminal49"

    def supports_identifier_type(self, identifier_type: str) -> bool:
        return identifier_type in ["container_id"]

    def fetch_status(self, reference: str, identifier_type: str, db: Optional[Session] = None, tenant_id: Optional[str] = None) -> CarrierStatusResult:
        api_key = get_carrier_credential(db, tenant_id, "terminal49", "api_key") or os.environ.get("TERMINAL49_API_KEY")
        if not api_key:
            logger.info("Terminal49 API key missing, falling back to mock response.")
            return self._get_mock_result(reference, self.carrier_name)

        try:
            headers = {"Authorization": f"Token {api_key}"}
            url = f"https://api.terminal49.com/v2/containers/{reference}"
            response = httpx.get(url, headers=headers, timeout=10.0)
            if response.status_code == 429:
                from neuromail.core.mailboxes.rate_limiter import RateLimitError
                raise RateLimitError("Terminal49 rate limit exceeded")
            response.raise_for_status()
            data = response.json()
            # Map Terminal49 fields
            attributes = data.get("data", {}).get("attributes", {})
            return CarrierStatusResult(
                reference=reference,
                carrier_status=attributes.get("status", "IN_TRANSIT"),
                location=attributes.get("pod_port_name"),
                eta=datetime.fromisoformat(attributes["eta"]) if attributes.get("eta") else None,
                vessel_name=attributes.get("vessel_name"),
                last_event=attributes.get("last_event_name"),
                last_event_at=datetime.fromisoformat(attributes["last_event_at"]) if attributes.get("last_event_at") else None,
                raw_response=data,
                is_arrived=attributes.get("is_arrived", False),
                is_delayed=attributes.get("is_delayed", False)
            )
        except Exception as e:
            logger.error(f"Terminal49 fetch failed for reference {reference}: {str(e)}")
            return self._get_mock_result(reference, self.carrier_name)


class FallbackPollingAdapter(BaseCarrierAdapter):
    @property
    def carrier_name(self) -> str:
        return "Fallback"

    def supports_identifier_type(self, identifier_type: str) -> bool:
        return True

    def fetch_status(self, reference: str, identifier_type: str, db: Optional[Session] = None, tenant_id: Optional[str] = None) -> CarrierStatusResult:
        logger.info(f"Fallback polling for reference {reference} using {identifier_type}")
        return self._get_mock_result(reference, self.carrier_name)


class CarrierAdapterRegistry:
    def __init__(self):
        self._adapters = []

    def register(self, adapter: BaseCarrierAdapter):
        self._adapters.append(adapter)

    def resolve(self, carrier: str, identifier_type: str) -> Optional[BaseCarrierAdapter]:
        carrier_lower = carrier.lower() if carrier else ""
        
        # 1. Exact carrier + identifier match
        for adapter in self._adapters:
            adapter_name_lower = adapter.carrier_name.lower()
            if (adapter_name_lower in carrier_lower or carrier_lower in adapter_name_lower) and adapter.supports_identifier_type(identifier_type):
                return adapter
                
        # 2. Identifier match fallback
        for adapter in self._adapters:
            if adapter.supports_identifier_type(identifier_type) and not isinstance(adapter, FallbackPollingAdapter):
                return adapter
                
        # 3. Last resort fallback
        for adapter in self._adapters:
            if isinstance(adapter, FallbackPollingAdapter):
                return adapter
                
        return None

# Singleton instance
carrier_registry = CarrierAdapterRegistry()
carrier_registry.register(Project44Adapter())
carrier_registry.register(Terminal49Adapter())
carrier_registry.register(FallbackPollingAdapter())
