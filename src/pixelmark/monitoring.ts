// Monitoring and Alerts definitions

export type MonitoringEvent = 
  | 'proxy_asset_failure'
  | 'webgl_detection_success'
  | 'webgl_detection_failure'
  | 'marker_create_failure'
  | 'share_link_resolve_failure'
  | 'session_page_visit_failure'
  | 'heavy_render_fallback';

export interface MetricData {
  event: MonitoringEvent;
  metadata?: Record<string, string | number | boolean>;
  timestamp: number;
}

// Alert Thresholds Configuration
export const AlertThresholds = {
  proxy_asset_failure: { limit: 50, windowMs: 60000 }, // 50 failures / min
  marker_create_failure: { limit: 20, windowMs: 60000 }, // 20 failures / min
  heavy_render_fallback: { limit: 100, windowMs: 60000 }, // 100 fallbacks / min
  share_link_resolve_failure: { limit: 10, windowMs: 60000 } // 10 failures / min
};

class MonitoringSystem {
  private metrics: MetricData[] = [];
  
  logEvent(event: MonitoringEvent, metadata?: Record<string, string | number | boolean>) {
    const data: MetricData = {
      event,
      metadata,
      timestamp: Date.now()
    };
    
    // Structured logging (lightweight)
    console.log(JSON.stringify({ type: 'pixelmark_metric', ...data }));
    
    this.metrics.push(data);
    this.evaluateAlerts(event);
    
    // Keep memory bounded
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
  }

  private evaluateAlerts(event: MonitoringEvent) {
    const threshold = AlertThresholds[event as keyof typeof AlertThresholds];
    if (!threshold) return;

    const now = Date.now();
    const recentEvents = this.metrics.filter(m => 
      m.event === event && now - m.timestamp < threshold.windowMs
    );

    if (recentEvents.length >= threshold.limit) {
      this.triggerAlert(event, recentEvents.length);
    }
  }

  private triggerAlert(event: MonitoringEvent, count: number) {
    console.error(`ALERT: High failure rate for ${event}. Count: ${count} within window.`);
    // In production, this would bridge to Datadog/Sentry/PagerDuty
  }
}

export const monitor = new MonitoringSystem();
