from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging

from models import FreightShipment, FreightCarrierSnapshot, FreightTenantConfig, FreightAlert

logger = logging.getLogger("Freight.RulesEngine")

@dataclass
class RuleContext:
    tenant_id: str
    shipment: FreightShipment
    latest_snapshot: Optional[FreightCarrierSnapshot]
    previous_snapshot: Optional[FreightCarrierSnapshot]
    tenant_config: Optional[FreightTenantConfig]
    existing_alerts: List[FreightAlert]
    now: datetime

@dataclass
class RuleMatch:
    rule_type: str
    severity: str  # critical, high, medium, low
    title: str
    description: str

class BaseRule:
    @property
    def rule_type(self) -> str:
        raise NotImplementedError

    def matches(self, context: RuleContext) -> bool:
        raise NotImplementedError

    def evaluate(self, context: RuleContext) -> RuleMatch:
        raise NotImplementedError

class ArrivalNoticeRule(BaseRule):
    @property
    def rule_type(self) -> str:
        return "ARRIVAL_NOTICE"

    def matches(self, context: RuleContext) -> bool:
        # Check if arrived
        arrived = False
        if context.latest_snapshot and context.latest_snapshot.is_arrived:
            arrived = True
        elif context.shipment.last_known_status in ["ARRIVED_PORT", "AVAILABLE_PICKUP", "DELIVERED"]:
            arrived = True
            
        if not arrived:
            return False
            
        # Check if alert already exists
        has_alert = any(a.rule_type == self.rule_type for a in context.existing_alerts)
        return not has_alert

    def evaluate(self, context: RuleContext) -> RuleMatch:
        ref = context.shipment.primary_reference
        return RuleMatch(
            rule_type=self.rule_type,
            severity="high",
            title=f"Shipment {ref} Arrived",
            description=f"Shipment {ref} has arrived at destination/port."
        )

class EtaBreachRule(BaseRule):
    @property
    def rule_type(self) -> str:
        return "ETA_BREACH"

    def matches(self, context: RuleContext) -> bool:
        # Arrived check
        arrived = False
        if context.latest_snapshot and context.latest_snapshot.is_arrived:
            arrived = True
        elif context.shipment.last_known_status in ["ARRIVED_PORT", "AVAILABLE_PICKUP", "DELIVERED"]:
            arrived = True
            
        if arrived or context.shipment.is_closed:
            return False
            
        if not context.shipment.eta:
            return False
            
        # Check if current time has breached ETA
        is_breached = context.now > context.shipment.eta
        
        if not is_breached:
            return False
            
        has_alert = any(a.rule_type == self.rule_type for a in context.existing_alerts)
        return not has_alert

    def evaluate(self, context: RuleContext) -> RuleMatch:
        ref = context.shipment.primary_reference
        eta_str = context.shipment.eta.strftime("%Y-%m-%d %H:%M:%S")
        return RuleMatch(
            rule_type=self.rule_type,
            severity="high",
            title=f"Shipment {ref} ETA Breached",
            description=f"Shipment {ref} has breached its ETA ({eta_str}) and is still not arrived."
        )

class NoUpdateRule(BaseRule):
    @property
    def rule_type(self) -> str:
        return "NO_UPDATE"

    def matches(self, context: RuleContext) -> bool:
        if context.shipment.is_closed:
            return False
            
        # Get threshold from config or default to 24 hours
        threshold_hours = 24
        if context.tenant_config and context.tenant_config.no_update_threshold_hours:
            threshold_hours = context.tenant_config.no_update_threshold_hours
            
        last_update = context.shipment.last_status_at or context.shipment.created_at or context.now
        is_stale = context.now - last_update > timedelta(hours=threshold_hours)
        
        if not is_stale:
            return False
            
        has_alert = any(a.rule_type == self.rule_type for a in context.existing_alerts)
        return not has_alert

    def evaluate(self, context: RuleContext) -> RuleMatch:
        ref = context.shipment.primary_reference
        return RuleMatch(
            rule_type=self.rule_type,
            severity="medium",
            title=f"Shipment {ref} Stale - No Update",
            description=f"No tracking updates have been received for shipment {ref} in the last configured update window."
        )

class StorageRiskRule(BaseRule):
    @property
    def rule_type(self) -> str:
        return "STORAGE_RISK"

    def matches(self, context: RuleContext) -> bool:
        # Must be arrived but not picked up / delivered
        arrived = False
        if context.latest_snapshot and context.latest_snapshot.is_arrived:
            arrived = True
        elif context.shipment.last_known_status in ["ARRIVED_PORT", "AVAILABLE_PICKUP"]:
            arrived = True
            
        if not arrived or context.shipment.is_closed:
            return False
            
        # Check if status includes "picked up", "delivered", or "gate out"
        status_upper = (context.shipment.last_known_status or "").upper()
        if any(term in status_upper for term in ["PICKED UP", "DELIVERED", "GATE_OUT", "GATEOUT"]):
            return False
            
        # Storage risk threshold
        risk_days = 3
        if context.tenant_config and context.tenant_config.storage_risk_days:
            risk_days = context.tenant_config.storage_risk_days
            
        last_change = context.shipment.last_status_at or context.shipment.created_at or context.now
        dwell_duration = context.now - last_change
        
        is_risk = dwell_duration >= timedelta(days=risk_days)
        if not is_risk:
            return False
            
        has_alert = any(a.rule_type == self.rule_type for a in context.existing_alerts)
        return not has_alert

    def evaluate(self, context: RuleContext) -> RuleMatch:
        ref = context.shipment.primary_reference
        return RuleMatch(
            rule_type=self.rule_type,
            severity="high",
            title=f"Storage Risk Alert: {ref}",
            description=f"Shipment {ref} has arrived but not been picked up. Storage/demurrage fees may accumulate."
        )

class EtaChangedRule(BaseRule):
    @property
    def rule_type(self) -> str:
        return "ETA_CHANGED"

    def matches(self, context: RuleContext) -> bool:
        if not context.previous_snapshot or not context.latest_snapshot:
            return False
            
        prev_eta = context.previous_snapshot.eta
        curr_eta = context.latest_snapshot.eta
        
        # Trigger if ETA is modified
        if prev_eta and curr_eta and prev_eta != curr_eta:
            return True
        return False

    def evaluate(self, context: RuleContext) -> RuleMatch:
        ref = context.shipment.primary_reference
        prev_eta_str = context.previous_snapshot.eta.strftime("%Y-%m-%d") if context.previous_snapshot.eta else "N/A"
        curr_eta_str = context.latest_snapshot.eta.strftime("%Y-%m-%d") if context.latest_snapshot.eta else "N/A"
        return RuleMatch(
            rule_type=self.rule_type,
            severity="medium",
            title=f"ETA Modified for {ref}",
            description=f"ETA for shipment {ref} changed from {prev_eta_str} to {curr_eta_str}."
        )

RULE_REGISTRY = [
    ArrivalNoticeRule(),
    EtaBreachRule(),
    NoUpdateRule(),
    StorageRiskRule(),
    EtaChangedRule()
]

def evaluate_rules(context: RuleContext) -> List[RuleMatch]:
    """
    Pure rules engine evaluation.
    """
    matches = []
    for rule in RULE_REGISTRY:
        try:
            if rule.matches(context):
                match_result = rule.evaluate(context)
                matches.append(match_result)
        except Exception as e:
            logger.error(f"Error evaluating rule {rule.rule_type} on shipment {context.shipment.id}: {str(e)}")
    return matches
