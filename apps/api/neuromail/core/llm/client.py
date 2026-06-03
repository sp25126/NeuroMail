import json
import os
import logging
import httpx
import uuid
import datetime
from typing import Type, Optional, Any, Dict, List
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from models import TenantLLMConfig, TenantTokenUsage
from services.vault import decrypt_token
from config import settings

logger = logging.getLogger("LLMClient")


class LLMProviderError(Exception):
    """Custom exception raised for LLM provider errors."""
    pass


class LLMClient:
    def __init__(self, db: Session):
        self.db = db

    def get_tenant_config(self, tenant_id: str) -> Dict[str, Any]:
        """
        Fetches the tenant-specific model configuration.
        Returns system defaults if no tenant config exists.
        """
        config = self.db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == tenant_id).first()
        if config:
            api_key = None
            if config.encrypted_api_key:
                try:
                    api_key = decrypt_token(config.encrypted_api_key)
                except Exception as e:
                    logger.error(f"Failed to decrypt API key for tenant {tenant_id}: {str(e)}")
            return {
                "provider": config.provider,
                "model_name": config.model_name,
                "api_key": api_key,
                "temperature": config.temperature,
                "max_tokens": config.max_tokens,
                "auto_routing_enabled": config.auto_routing_enabled
            }
        else:
            # Fallback to system env if no tenant config
            provider = os.environ.get("DEFAULT_LLM_PROVIDER", "openai").lower()
            return {
                "provider": provider,
                "model_name": os.environ.get("DEFAULT_LLM_MODEL", "gpt-4o"),
                "api_key": os.environ.get(f"{provider.upper()}_API_KEY"),
                "temperature": 0.0,
                "max_tokens": 1000,
                "auto_routing_enabled": False
            }

    def log_token_usage(self, tenant_id: str, provider: str, model_name: str, prompt_tokens: int, completion_tokens: int, feature_name: Optional[str] = None):
        """
        Logs token usage to the database.
        """
        usage = TenantTokenUsage(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            provider=provider,
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            feature_name=feature_name
        )
        self.db.add(usage)
        
        # Increment daily quota usage
        try:
            from services.quota_service import increment_token_usage
            increment_token_usage(self.db, tenant_id, prompt_tokens, completion_tokens)
        except Exception as e:
            logger.error(f"Failed to increment daily token usage quota: {str(e)}")
            
        self.db.commit()
        logger.info(f"Tenant {tenant_id} used {prompt_tokens + completion_tokens} tokens ({provider} / {model_name}) for feature: {feature_name}")

    def check_health(self, tenant_id: str = "system") -> bool:
        """
        Checks if the LLM provider for the tenant is responsive.
        """
        try:
            # We use a very small prompt and no schema for a fast health check
            self.generate(
                tenant_id=tenant_id,
                system_instruction="Health check",
                prompt="ping",
                feature_name="health_check",
                max_retries=1
            )
            return True
        except Exception as e:
            logger.error(f"LLM Health check failed for tenant {tenant_id}: {str(e)}")
            return False

    def generate(
        self,
        tenant_id: str,
        system_instruction: Optional[str],
        prompt: str,
        schema: Optional[Type[BaseModel]] = None,
        feature_name: Optional[str] = None,
        max_retries: int = 3
    ) -> Any:
        """
        Calls the LLM provider configured for the tenant.
        Enforces structured output if schema is provided.
        Retries on malformed/invalid JSON responses.
        Logs token usage.
        """
        # Check daily LLM token quota
        from services.quota_service import check_token_quota, QuotaExceededError
        if not check_token_quota(self.db, tenant_id):
            logger.warning(f"Tenant {tenant_id} LLM token quota exceeded.")
            raise QuotaExceededError(f"LLM token quota exceeded for tenant {tenant_id}")

        config = self.get_tenant_config(tenant_id)
        provider = config["provider"].lower()
        model_name = config["model_name"]
        api_key = config["api_key"]
        temperature = config["temperature"]
        max_tokens = config["max_tokens"]

        supported_providers = ["openai", "anthropic", "gemini", "openrouter", "ollama", "mock"]
        if provider not in supported_providers:
            raise ValueError(f"Unsupported LLM provider: {provider}")

        last_error = None
        for attempt in range(max_retries):
            try:
                response_text = ""
                prompt_tokens = 0
                completion_tokens = 0

                if provider == "openai":
                    response_text, prompt_tokens, completion_tokens = self._call_openai(
                        api_key, model_name, system_instruction, prompt, schema, temperature, max_tokens
                    )
                elif provider == "anthropic":
                    response_text, prompt_tokens, completion_tokens = self._call_anthropic(
                        api_key, model_name, system_instruction, prompt, schema, temperature, max_tokens
                    )
                elif provider == "gemini":
                    response_text, prompt_tokens, completion_tokens = self._call_gemini(
                        api_key, model_name, system_instruction, prompt, schema, temperature, max_tokens
                    )
                elif provider == "openrouter":
                    response_text, prompt_tokens, completion_tokens = self._call_openrouter(
                        api_key, model_name, system_instruction, prompt, schema, temperature, max_tokens
                    )
                elif provider == "ollama":
                    response_text, prompt_tokens, completion_tokens = self._call_ollama(
                        model_name, system_instruction, prompt, schema, temperature, max_tokens
                    )
                elif provider == "mock":
                    response_text, prompt_tokens, completion_tokens = self._call_mock(
                        model_name, system_instruction, prompt, schema, temperature, max_tokens, attempt
                    )

                if schema:
                    cleaned_text = self._clean_json_markdown(response_text)
                    try:
                        parsed_json = json.loads(cleaned_text)
                    except json.JSONDecodeError as je:
                        logger.warning(f"Malformed JSON on attempt {attempt + 1}: {cleaned_text[:100]}...")
                        raise je

                    try:
                        validated_data = schema.model_validate(parsed_json)
                    except ValidationError as ve:
                        logger.warning(f"Pydantic schema validation failed on attempt {attempt + 1}: {str(ve)}")
                        raise ve

                    self.log_token_usage(tenant_id, provider, model_name, prompt_tokens, completion_tokens, feature_name)
                    return validated_data
                else:
                    self.log_token_usage(tenant_id, provider, model_name, prompt_tokens, completion_tokens, feature_name)
                    return response_text

            except Exception as e:
                last_error = e
                logger.warning(f"Attempt {attempt + 1} failed for tenant {tenant_id} on provider {provider}: {str(e)}")
                if attempt == max_retries - 1:
                    break

        raise LLMProviderError(f"LLM generation failed after {max_retries} attempts. Last error: {str(last_error)}")

    def _clean_json_markdown(self, text: str) -> str:
        """Cleans markdown syntax like ```json ... ``` from the response."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    def _call_openai(self, api_key: str, model_name: str, system_instruction: Optional[str], prompt: str, schema: Optional[Type[BaseModel]], temperature: float, max_tokens: int) -> tuple[str, int, int]:
        if not api_key:
            api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise ValueError("OpenAI API key is missing")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        if schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "structured_output",
                    "strict": True,
                    "schema": schema.model_json_schema()
                }
            }

        response = httpx.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
        response.raise_for_status()
        data = response.json()

        response_text = data["choices"][0]["message"]["content"]
        prompt_tokens = data.get("usage", {}).get("prompt_tokens", 0)
        completion_tokens = data.get("usage", {}).get("completion_tokens", 0)

        return response_text, prompt_tokens, completion_tokens

    def _call_anthropic(self, api_key: str, model_name: str, system_instruction: Optional[str], prompt: str, schema: Optional[Type[BaseModel]], temperature: float, max_tokens: int) -> tuple[str, int, int]:
        if not api_key:
            api_key = settings.ANTHROPIC_API_KEY
        if not api_key:
            raise ValueError("Anthropic API key is missing")

        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }

        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if system_instruction:
            payload["system"] = system_instruction

        if schema:
            schema_str = json.dumps(schema.model_json_schema())
            schema_instruction = f"\nReturn ONLY a valid JSON object matching the following schema: {schema_str}"
            if "system" in payload:
                payload["system"] += schema_instruction
            else:
                payload["system"] = schema_instruction

        response = httpx.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=60.0)
        response.raise_for_status()
        data = response.json()

        response_text = data["content"][0]["text"]
        prompt_tokens = data.get("usage", {}).get("input_tokens", 0)
        completion_tokens = data.get("usage", {}).get("output_tokens", 0)

        return response_text, prompt_tokens, completion_tokens

    def _call_gemini(self, api_key: str, model_name: str, system_instruction: Optional[str], prompt: str, schema: Optional[Type[BaseModel]], temperature: float, max_tokens: int) -> tuple[str, int, int]:
        if not api_key:
            api_key = settings.GEMINI_API_KEY
        if not api_key:
            raise ValueError("Gemini API key is missing")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

        contents = [{"parts": [{"text": prompt}]}]

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }

        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        if schema:
            payload["generationConfig"]["responseMimeType"] = "application/json"
            payload["generationConfig"]["responseSchema"] = schema.model_json_schema()

        response = httpx.post(url, json=payload, timeout=60.0)
        response.raise_for_status()
        data = response.json()

        response_text = data["candidates"][0]["content"]["parts"][0]["text"]
        usage = data.get("usageMetadata", {})
        prompt_tokens = usage.get("promptTokenCount", 0)
        completion_tokens = usage.get("candidatesTokenCount", 0)

        return response_text, prompt_tokens, completion_tokens

    def _call_openrouter(self, api_key: str, model_name: str, system_instruction: Optional[str], prompt: str, schema: Optional[Type[BaseModel]], temperature: float, max_tokens: int) -> tuple[str, int, int]:
        if not api_key:
            api_key = settings.OPENROUTER_API_KEY
        if not api_key:
            raise ValueError("OpenRouter API key is missing")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://neuromail.io",
            "X-Title": "Neuromail",
            "Content-Type": "application/json"
        }

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        # OpenRouter supports OpenAI-style response_format for some models
        if schema:
            payload["response_format"] = {"type": "json_object"}
            prompt += f"\nReturn ONLY a valid JSON object matching the following schema: {json.dumps(schema.model_json_schema())}"
            messages[-1]["content"] = prompt

        response = httpx.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
        response.raise_for_status()
        data = response.json()

        response_text = data["choices"][0]["message"]["content"]
        prompt_tokens = data.get("usage", {}).get("prompt_tokens", 0)
        completion_tokens = data.get("usage", {}).get("completion_tokens", 0)

        return response_text, prompt_tokens, completion_tokens

    def _call_ollama(self, model_name: str, system_instruction: Optional[str], prompt: str, schema: Optional[Type[BaseModel]], temperature: float, max_tokens: int) -> tuple[str, int, int]:
        url = f"{settings.OLLAMA_BASE_URL}/api/chat"

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }

        if schema:
            payload["format"] = "json"
            prompt += f"\nReturn ONLY a valid JSON object matching the following schema: {json.dumps(schema.model_json_schema())}"
            messages[-1]["content"] = prompt

        response = httpx.post(url, json=payload, timeout=120.0)
        response.raise_for_status()
        data = response.json()

        response_text = data["message"]["content"]
        # Ollama usage names vary, but prompt_eval_count and eval_count are common
        prompt_tokens = data.get("prompt_eval_count", 0)
        completion_tokens = data.get("eval_count", 0)

        return response_text, prompt_tokens, completion_tokens

    def _call_mock(self, model_name: str, system_instruction: Optional[str], prompt: str, schema: Optional[Type[BaseModel]], temperature: float, max_tokens: int, attempt: int) -> tuple[str, int, int]:
        # Handle specific prompts for retry/validation tests
        if "simulate_malformed" in prompt and attempt == 0:
            return "{invalid_json: state}", 10, 10
        if "simulate_invalid_intent" in prompt and attempt == 0:
            # IntentClassificationSchema expects one of the allowed intents, return "invalid_label"
            return json.dumps({"intent": "invalid_label"}), 10, 10
            
        # Return mock JSON matching the requested schema
        if schema:
            schema_name = schema.__name__
            data = {}
            if schema_name == "EmailSummarySchema":
                # Check for specific entities in the prompt
                entities = []
                if "BOL-9908" in prompt:
                    entities.append("BOL-9908")
                else:
                    entities.append("BOL-55610")
                data = {
                    "key_action": "Verify delayed shipment",
                    "subject": "Shipment Update",
                    "entities_involved": entities,
                    "urgency_signal": "high",
                    "next_step_implied": "Contact carrier"
                }
            elif schema_name == "IntentClassificationSchema":
                data = {"intent": "status update"}
            elif schema_name == "UrgencyPrioritySchema":
                data = {
                    "urgency_score": 4, # (mock generator yields 4 for urgency_score field)
                    "priority_label": "high"
                }
            elif schema_name == "AIEntityExtractionSchema":
                data = {
                    "identifiers": [
                        {"identifier_type": "BOL", "identifier_value": "BOL-55610", "confidence": 0.85}
                    ]
                }
            elif schema_name == "SmartSuggestionSchema":
                data = {
                    "has_issue": True,
                    "message": "Anomaly detected in timeline",
                    "alert_type": "TIMELINE_STALE",
                    "severity": "HIGH",
                    "reason": "Timeline has not been updated in 5 days"
                }
            elif schema_name == "ResponseDraftSchema":
                data = {
                    "subject": "Re: Shipment Update",
                    "body": "Thank you for the update. We will resolve this."
                }
            elif schema_name == "DigestNarrativeSchema":
                data = {
                    "headline": "Daily Operations Summary",
                    "narrative_markdown": "We observed 3 alerts and 2 delayed shipments. Operational digest is stable."
                }
            elif schema_name == "CopilotResponseSchema":
                citations = []
                if "Local Scoped Database context:\n\n" not in prompt:
                    citations.append({"record_type": "ENTITY", "record_id": "entity-1", "reference": "Weather exception update email"})
                data = {
                    "answer": "Yes, container BOL-55610 is delayed due to weather.",
                    "citations": citations
                }
            elif schema_name == "ActionRoutingSchema":
                data = {
                    "should_act": True,
                    "action_type": "escalate_alert",
                    "parameters": {"alert_id": "alert-1"},
                    "reason": "High urgency exception requires escalation"
                }
            elif schema_name == "TestSchema":
                data = {
                    "name": "mock_test_name",
                    "value": 42
                }
            else:
                # Dynamically construct matching fields
                for field_name, field_info in schema.model_fields.items():
                    annotation = field_info.annotation
                    if annotation == str:
                        data[field_name] = "mock_string"
                    elif annotation == int:
                        data[field_name] = 1
                    elif annotation == float:
                        data[field_name] = 1.0
                    elif annotation == bool:
                        data[field_name] = True
                    elif getattr(annotation, "__origin__", None) is list:
                        data[field_name] = []
                    elif getattr(annotation, "__origin__", None) is dict:
                        data[field_name] = {}
                    else:
                        data[field_name] = None
            response_text = json.dumps(data)
        else:
            response_text = "mocked non-structured text response"
            
        return response_text, 10, 10
