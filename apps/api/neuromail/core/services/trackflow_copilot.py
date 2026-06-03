import uuid
import datetime
import logging
import json
from typing import List, Dict, Any, Optional, Callable, Literal
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from models import (
    TrackflowCopilotConversation,
    TrackflowCopilotMessage,
    TrackflowCopilotAction,
    FreightShipment,
    FreightAlert,
    FreightReportRun,
    FreightRawEmail,
    FreightApproval,
    FreightTenantConfig,
    Tenant,
    User
)
from neuromail.core.llm.client import LLMClient
import schemas

logger = logging.getLogger("TrackFlow.Copilot")

class CopilotTool(BaseModel):
    name: str
    description: str
    input_schema: Dict[str, Any]
    requires_approval: bool
    handler: Callable

class ToolResult(BaseModel):
    status: Literal["success", "failed", "approval_required", "skipped"]
    summary: str
    object_refs: List[schemas.ObjectRef] = []
    approval_id: Optional[str] = None

class CopilotPlannerOutput(BaseModel):
    intent: str
    reasoning_summary: str
    tools: List[Dict[str, Any]]
    requires_approval: bool

class TrackflowCopilotService:
    def __init__(self, db: Session):
        self.db = db
        self.tool_registry: Dict[str, CopilotTool] = {}
        self._register_tools()

    def _register_tools(self):
        # Register core tools
        self.tool_registry["tool_read_dashboard_summary"] = CopilotTool(
            name="tool_read_dashboard_summary",
            description="Get a high-level summary of the freight dashboard including shipment counts and alert status.",
            input_schema={},
            requires_approval=False,
            handler=self._handle_dashboard_summary
        )
        self.tool_registry["tool_search_shipments"] = CopilotTool(
            name="tool_search_shipments",
            description="Search for shipments by status, carrier, or reference.",
            input_schema={"status": "string", "query": "string"},
            requires_approval=False,
            handler=self._handle_search_shipments
        )
        self.tool_registry["tool_get_shipment_detail"] = CopilotTool(
            name="tool_get_shipment_detail",
            description="Get full details for a specific shipment.",
            input_schema={"shipment_id": "string"},
            requires_approval=False,
            handler=self._handle_shipment_detail
        )
        self.tool_registry["tool_list_alerts"] = CopilotTool(
            name="tool_list_alerts",
            description="List recent operational alerts.",
            input_schema={"severity": "string", "status": "string"},
            requires_approval=False,
            handler=self._handle_list_alerts
        )
        self.tool_registry["tool_generate_report"] = CopilotTool(
            name="tool_generate_report",
            description="Trigger generation of an operational report.",
            input_schema={"report_type": "string", "parameters": "object"},
            requires_approval=False,
            handler=self._handle_generate_report
        )
        self.tool_registry["tool_draft_customer_update"] = CopilotTool(
            name="tool_draft_customer_update",
            description="Draft a customer update email based on shipment status.",
            input_schema={"shipment_id": "string", "tone": "string"},
            requires_approval=False,
            handler=self._handle_draft_update
        )
        self.tool_registry["tool_send_email"] = CopilotTool(
            name="tool_send_email",
            description="Send an email to a customer (requires approval).",
            input_schema={"recipient": "string", "subject": "string", "body": "string", "shipment_id": "string"},
            requires_approval=True,
            handler=self._handle_send_email
        )

    # --- Tool Handlers ---

    def _handle_dashboard_summary(self, tenant_id: str, args: Dict) -> ToolResult:
        from services.freight_service import get_dashboard_summary
        summary = get_dashboard_summary(self.db, tenant_id)
        return ToolResult(
            status="success",
            summary=f"Dashboard: {summary['total_shipments']} shipments total, {summary['shipments_delayed']} delayed, {summary['quarantine_count']} in quarantine.",
            object_refs=[]
        )

    def _handle_search_shipments(self, tenant_id: str, args: Dict) -> ToolResult:
        query = self.db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id)
        if args.get("status"):
            query = query.filter(FreightShipment.last_known_status == args["status"])
        if args.get("query"):
            q = f"%{args['query']}%"
            query = query.filter(or_(
                FreightShipment.primary_reference.ilike(q),
                FreightShipment.carrier.ilike(q)
            ))
        shipments = query.limit(5).all()
        refs = [schemas.ObjectRef(record_type="SHIPMENT", record_id=s.id, reference=s.primary_reference) for s in shipments]
        return ToolResult(
            status="success",
            summary=f"Found {len(shipments)} shipments matching criteria.",
            object_refs=refs
        )

    def _handle_shipment_detail(self, tenant_id: str, args: Dict) -> ToolResult:
        s_id = args.get("shipment_id")
        shipment = self.db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id, FreightShipment.id == s_id).first()
        if not shipment:
            return ToolResult(status="failed", summary="Shipment not found.")
        return ToolResult(
            status="success",
            summary=f"Shipment {shipment.primary_reference}: Carrier {shipment.carrier}, ETA {shipment.eta}, Status {shipment.last_known_status}.",
            object_refs=[schemas.ObjectRef(record_type="SHIPMENT", record_id=shipment.id, reference=shipment.primary_reference)]
        )

    def _handle_list_alerts(self, tenant_id: str, args: Dict) -> ToolResult:
        query = self.db.query(FreightAlert).filter(FreightAlert.tenant_id == tenant_id)
        if args.get("severity"):
            query = query.filter(FreightAlert.severity == args["severity"])
        alerts = query.order_by(desc(FreightAlert.created_at)).limit(5).all()
        refs = [schemas.ObjectRef(record_type="ALERT", record_id=a.id, reference=a.message) for a in alerts]
        return ToolResult(
            status="success",
            summary=f"Retrieved {len(alerts)} recent alerts.",
            object_refs=refs
        )

    def _handle_generate_report(self, tenant_id: str, args: Dict) -> ToolResult:
        from services.report_service import trigger_report_run
        report_type = args.get("report_type", "OPERATIONS_DAILY")
        run = trigger_report_run(self.db, tenant_id, report_type, args.get("parameters", {}))
        return ToolResult(
            status="success",
            summary=f"Report {report_type} generation started.",
            object_refs=[schemas.ObjectRef(record_type="REPORT", record_id=run.id, reference=report_type)]
        )

    def _handle_draft_update(self, tenant_id: str, args: Dict) -> ToolResult:
        s_id = args.get("shipment_id")
        shipment = self.db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id, FreightShipment.id == s_id).first()
        if not shipment:
            return ToolResult(status="failed", summary="Shipment not found for drafting.")
        
        # Simple draft generation logic
        subject = f"Update on your shipment: {shipment.primary_reference}"
        body = f"Hello, your shipment {shipment.primary_reference} with {shipment.carrier} is currently {shipment.last_known_status}. Estimated arrival: {shipment.eta}."
        
        return ToolResult(
            status="success",
            summary="Prepared draft update.",
            object_refs=[schemas.ObjectRef(record_type="SHIPMENT", record_id=shipment.id, reference=shipment.primary_reference)]
        )

    def _handle_send_email(self, tenant_id: str, args: Dict) -> ToolResult:
        # This requires approval, so we just return the pending state
        # Approval request will be created by the orchestrator
        return ToolResult(
            status="approval_required",
            summary=f"Approval requested to send email to {args.get('recipient')}.",
            object_refs=[]
        )

    # --- Core Orchestration ---

    def handle_message(self, tenant_id: str, user_id: str, message: str, conversation_id: Optional[str] = None) -> schemas.CopilotResponse:
        # 1. Ensure conversation exists
        if not conversation_id:
            conv = TrackflowCopilotConversation(id=str(uuid.uuid4()), tenant_id=tenant_id, user_id=user_id)
            self.db.add(conv)
            self.db.flush()
            conversation_id = conv.id
        
        # 2. Persist user message
        user_msg = TrackflowCopilotMessage(id=str(uuid.uuid4()), conversation_id=conversation_id, role="user", content=message)
        self.db.add(user_msg)
        self.db.commit()

        # 3. Deterministic check
        det_response = self._check_deterministic_intents(tenant_id, message)
        if det_response:
            self._persist_assistant_response(conversation_id, det_response.response_text)
            # Log actions from tool calls
            for t in det_response.tool_calls:
                self._log_action(
                    conversation_id, tenant_id, user_id, 
                    intent="deterministic_intent", 
                    mode="deterministic", 
                    tool_name=t.tool_name, 
                    args=t.arguments, 
                    status=t.status,
                    cited_refs=[obj.dict() for obj in det_response.cited_objects]
                )
            self.db.commit()
            return det_response

        # 4. LLM Planning
        try:
            plan = self._plan_actions(tenant_id, message)
            response_mode = "ai_assisted"
        except Exception as e:
            logger.warning(f"AI planning failed: {e}. Falling back to limited mode.")
            fallback_text = "TrackFlow AI is in limited mode right now. I can still answer using direct data queries."
            self._persist_assistant_response(conversation_id, fallback_text)
            return schemas.CopilotResponse(
                response_text=fallback_text,
                response_mode="fallback_unavailable",
                cited_objects=[],
                tool_calls=[],
                approval_requests=[]
            )

        # 5. Execute Tools
        tool_records = []
        approval_refs = []
        all_cited_refs = []
        executed_summaries = []

        for tool_call in plan.tools:
            t_name = tool_call.get("name")
            t_args = tool_call.get("arguments", {})
            
            tool = self.tool_registry.get(t_name)
            if not tool:
                tool_records.append(schemas.ToolCallRecord(tool_name=t_name, arguments=t_args, status="failed", result_summary="Unknown tool."))
                continue

            if tool.requires_approval:
                # Create approval request
                appr = FreightApproval(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    approval_type="copilot_action",
                    target_id=conversation_id,
                    requested_by=user_id,
                    status="pending",
                    payload={"tool_name": t_name, "arguments": t_args}
                )
                self.db.add(appr)
                self.db.flush()
                
                tool_records.append(schemas.ToolCallRecord(tool_name=t_name, arguments=t_args, status="approval_required", result_summary=f"Approval required for {t_name}."))
                approval_refs.append(schemas.ApprovalRef(approval_id=appr.id, description=f"Execute {t_name}"))
                
                # Log action
                self._log_action(conversation_id, tenant_id, user_id, plan.intent, response_mode, t_name, t_args, "approval_required", approval_request_id=appr.id)
            else:
                # Execute tool
                try:
                    res = tool.handler(tenant_id, t_args)
                    tool_records.append(schemas.ToolCallRecord(
                        tool_name=t_name, arguments=t_args, status=res.status, result_summary=res.summary, object_refs=res.object_refs
                    ))
                    if res.status == "success":
                        executed_summaries.append(res.summary)
                        all_cited_refs.extend(res.object_refs)
                    
                    self._log_action(conversation_id, tenant_id, user_id, plan.intent, response_mode, t_name, t_args, res.status)
                except Exception as te:
                    logger.error(f"Tool execution failed: {te}")
                    tool_records.append(schemas.ToolCallRecord(tool_name=t_name, arguments=t_args, status="failed", result_summary=str(te)))
                    self._log_action(conversation_id, tenant_id, user_id, plan.intent, response_mode, t_name, t_args, "failed")

        # 6. Final response grounding
        if executed_summaries:
            final_text = self._ground_response(tenant_id, message, executed_summaries)
        else:
            final_text = plan.reasoning_summary

        if approval_refs:
            final_text += "\n\nI've prepared the sensitive actions and submitted them for approval."

        self._persist_assistant_response(conversation_id, final_text)
        self.db.commit()

        return schemas.CopilotResponse(
            response_text=final_text,
            response_mode=response_mode,
            cited_objects=all_cited_refs,
            tool_calls=tool_records,
            approval_requests=approval_refs
        )

    def _check_deterministic_intents(self, tenant_id: str, message: str) -> Optional[schemas.CopilotResponse]:
        msg = message.lower()
        if "attention" in msg or "needs attention" in msg:
            res = self._handle_dashboard_summary(tenant_id, {})
            return schemas.CopilotResponse(
                response_text=f"Here's what needs attention: {res.summary}",
                response_mode="deterministic",
                cited_objects=[],
                tool_calls=[schemas.ToolCallRecord(tool_name="tool_read_dashboard_summary", arguments={}, status="success", result_summary=res.summary)],
                approval_requests=[]
            )
        if "at risk" in msg or "delayed" in msg:
            res = self._handle_search_shipments(tenant_id, {"status": "DELAYED"})
            return schemas.CopilotResponse(
                response_text=f"I found {len(res.object_refs)} shipments currently delayed or at risk.",
                response_mode="deterministic",
                cited_objects=res.object_refs,
                tool_calls=[schemas.ToolCallRecord(tool_name="tool_search_shipments", arguments={"status": "DELAYED"}, status="success", result_summary=res.summary, object_refs=res.object_refs)],
                approval_requests=[]
            )
        if "quarantine" in msg or "review" in msg:
            # Mock quarantine check
            from models import FreightRawEmail
            q_count = self.db.query(FreightRawEmail).filter(FreightRawEmail.tenant_id == tenant_id, FreightRawEmail.parsing_status == "quarantined").count()
            return schemas.CopilotResponse(
                response_text=f"There are currently {q_count} quarantined emails awaiting review.",
                response_mode="deterministic",
                cited_objects=[],
                tool_calls=[],
                approval_requests=[]
            )
        return None

    def _plan_actions(self, tenant_id: str, message: str) -> CopilotPlannerOutput:
        client = LLMClient(self.db)
        
        # Build tool description for prompt
        tools_desc = ""
        for t in self.tool_registry.values():
            tools_desc += f"- {t.name}: {t.description}. Schema: {json.dumps(t.input_schema)}\n"

        prompt = (
            f"User message: '{message}'\n\n"
            f"Available tools:\n{tools_desc}\n"
            f"Task: Plan which tools to call to answer the user. Use JSON output."
        )

        plan: CopilotPlannerOutput = client.generate(
            tenant_id=tenant_id,
            system_instruction="You are a TrackFlow AI planner. Break down user requests into tool calls.",
            prompt=prompt,
            schema=CopilotPlannerOutput,
            feature_name="copilot_planning"
        )
        return plan

    def _ground_response(self, tenant_id: str, original_query: str, tool_summaries: List[str]) -> str:
        client = LLMClient(db=self.db)
        prompt = (
            f"Original query: {original_query}\n"
            f"Information retrieved:\n" + "\n".join(tool_summaries) + "\n\n"
            f"Generate a concise, helpful response to the user grounded in this data."
        )
        
        try:
            # Simple text generation for final response
            config = client.get_tenant_config(tenant_id)
            # Use raw generate for text
            from neuromail.core.llm.client import LLMProviderError
            response_text, _, _ = client._call_openai(
                api_key=config["api_key"],
                model_name=config["model_name"],
                system_instruction="You are TrackFlow AI. Answer the user based on the tool results provided.",
                prompt=prompt,
                schema=None,
                temperature=0.0,
                max_tokens=500
            )
            return response_text
        except Exception as e:
            return f"Retrieved data: {'. '.join(tool_summaries)}"

    def _persist_assistant_response(self, conversation_id: str, text: str):
        msg = TrackflowCopilotMessage(id=str(uuid.uuid4()), conversation_id=conversation_id, role="assistant", content=text)
        self.db.add(msg)

    def _log_action(self, conversation_id: str, tenant_id: str, user_id: str, intent: str, mode: str, tool_name: str, args: Dict, status: str, cited_refs: List = None, approval_request_id: str = None):
        action = TrackflowCopilotAction(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            tenant_id=tenant_id,
            user_id=user_id,
            intent=intent,
            response_mode=mode,
            tool_name=tool_name,
            tool_args=args,
            status=status,
            cited_refs=cited_refs,
            approval_request_id=approval_request_id
        )
        self.db.add(action)

