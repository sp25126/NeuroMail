import threading
import logging
from typing import Dict, Any, List

logger = logging.getLogger("RawEmail.Observability")

class MetricsStore:
    def __init__(self):
        self._lock = threading.Lock()
        self.metrics = {
            "parsed_emails_total": 0,
            "parsed_emails_failed": 0,
            "entity_extractions_total": 0,
            "entity_extractions_failed": 0,
            "rules_evaluated_total": 0,
            "rules_hit_total": 0,
            "alerts_created_total": 0,
            "alerts_deduplicated_total": 0,
            "ai_enrichment_latency_ms": []
        }

    def increment(self, metric_name: str, value: int = 1):
        with self._lock:
            if metric_name in self.metrics:
                if isinstance(self.metrics[metric_name], int):
                    self.metrics[metric_name] += value
                else:
                    logger.warning(f"Metric {metric_name} is not a counter.")
            else:
                self.metrics[metric_name] = value

    def add_latency(self, latency_ms: float):
        with self._lock:
            self.metrics["ai_enrichment_latency_ms"].append(latency_ms)
            # Limit list size to last 100 entries to prevent memory overflow
            if len(self.metrics["ai_enrichment_latency_ms"]) > 100:
                self.metrics["ai_enrichment_latency_ms"].pop(0)

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            latency_list = self.metrics.get("ai_enrichment_latency_ms", [])
            avg_latency = sum(latency_list) / len(latency_list) if latency_list else 0.0
            
            return {
                "parsed_emails_total": self.metrics["parsed_emails_total"],
                "parsed_emails_failed": self.metrics["parsed_emails_failed"],
                "entity_extractions_total": self.metrics["entity_extractions_total"],
                "entity_extractions_failed": self.metrics["entity_extractions_failed"],
                "rules_evaluated_total": self.metrics["rules_evaluated_total"],
                "rules_hit_total": self.metrics["rules_hit_total"],
                "alerts_created_total": self.metrics["alerts_created_total"],
                "alerts_deduplicated_total": self.metrics["alerts_deduplicated_total"],
                "ai_enrichment_average_latency_ms": avg_latency,
                "ai_enrichment_samples_count": len(latency_list)
            }

# Global singleton store
metrics_store = MetricsStore()
