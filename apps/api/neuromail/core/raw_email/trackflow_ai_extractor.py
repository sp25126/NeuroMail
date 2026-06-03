import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from neuromail.core.llm.client import LLMClient, LLMProviderError

logger = logging.getLogger("TrackFlow.AIExtractor")

class AIExtractionError(Exception):
    """Custom exception for AI extraction pipeline failures."""
    pass

@dataclass
class AIExtractionResponse:
    raw_response: str
    prompt_tokens: int
    completion_tokens: int

class AIExtractionProvider(ABC):
    @abstractmethod
    def extract(
        self,
        prompt: str,
        schema: Any,
        raw_email_context: str
    ) -> AIExtractionResponse:
        pass

class OpenAIExtractionProvider(AIExtractionProvider):
    def __init__(self, db: Session, model_name: str, api_key: str = None, temperature: float = 0.0, max_tokens: int = 2000):
        self.db = db
        self.model_name = model_name
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens

    def extract(self, prompt: str, schema: Any, raw_email_context: str) -> AIExtractionResponse:
        client = LLMClient(self.db)
        try:
            response_text, prompt_tokens, completion_tokens = client._call_openai(
                api_key=self.api_key,
                model_name=self.model_name,
                system_instruction="You are a logistics extraction specialist. Parse email contents into structured data.",
                prompt=prompt,
                schema=schema,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return AIExtractionResponse(
                raw_response=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens
            )
        except Exception as e:
            raise AIExtractionError(f"OpenAI extraction call failed: {e}")

class AnthropicExtractionProvider(AIExtractionProvider):
    def __init__(self, db: Session, model_name: str, api_key: str = None, temperature: float = 0.0, max_tokens: int = 2000):
        self.db = db
        self.model_name = model_name
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens

    def extract(self, prompt: str, schema: Any, raw_email_context: str) -> AIExtractionResponse:
        client = LLMClient(self.db)
        try:
            response_text, prompt_tokens, completion_tokens = client._call_anthropic(
                api_key=self.api_key,
                model_name=self.model_name,
                system_instruction="You are a logistics extraction specialist. Parse email contents into structured data.",
                prompt=prompt,
                schema=schema,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return AIExtractionResponse(
                raw_response=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens
            )
        except Exception as e:
            raise AIExtractionError(f"Anthropic extraction call failed: {e}")

class GeminiExtractionProvider(AIExtractionProvider):
    def __init__(self, db: Session, model_name: str, api_key: str = None, temperature: float = 0.0, max_tokens: int = 2000):
        self.db = db
        self.model_name = model_name
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens

    def extract(self, prompt: str, schema: Any, raw_email_context: str) -> AIExtractionResponse:
        client = LLMClient(self.db)
        try:
            response_text, prompt_tokens, completion_tokens = client._call_gemini(
                api_key=self.api_key,
                model_name=self.model_name,
                system_instruction="You are a logistics extraction specialist. Parse email contents into structured data.",
                prompt=prompt,
                schema=schema,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return AIExtractionResponse(
                raw_response=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens
            )
        except Exception as e:
            raise AIExtractionError(f"Gemini extraction call failed: {e}")

class OllamaExtractionProvider(AIExtractionProvider):
    def __init__(self, db: Session, model_name: str, temperature: float = 0.0, max_tokens: int = 2000):
        self.db = db
        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens

    def extract(self, prompt: str, schema: Any, raw_email_context: str) -> AIExtractionResponse:
        client = LLMClient(self.db)
        try:
            response_text, prompt_tokens, completion_tokens = client._call_ollama(
                model_name=self.model_name,
                system_instruction="You are a logistics extraction specialist. Parse email contents into structured data.",
                prompt=prompt,
                schema=schema,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return AIExtractionResponse(
                raw_response=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens
            )
        except Exception as e:
            raise AIExtractionError(f"Ollama extraction call failed: {e}")

# Pydantic schema for structured output validation
class AIExtractionFieldSchema(BaseModel):
    value: Optional[str] = None
    confidence: float = 0.0

class AIExtractionResultSchema(BaseModel):
    booking_ref: Optional[AIExtractionFieldSchema] = None
    container_id: Optional[AIExtractionFieldSchema] = None
    bl_number: Optional[AIExtractionFieldSchema] = None
    po_number: Optional[AIExtractionFieldSchema] = None
    carrier: Optional[AIExtractionFieldSchema] = None
    origin_port: Optional[AIExtractionFieldSchema] = None
    destination_port: Optional[AIExtractionFieldSchema] = None
    vessel: Optional[AIExtractionFieldSchema] = None
    eta: Optional[AIExtractionFieldSchema] = None

class TrackflowAIExtractor:
    def __init__(self, db: Session):
        self.db = db

    def get_provider(self, provider_name: str, model_name: str) -> AIExtractionProvider:
        """
        Loads API keys and instantiates the correct provider class.
        """
        llm_client = LLMClient(self.db)
        
        # Determine standard provider string
        p_name = provider_name.lower()
        if "openai" in p_name or "gpt" in model_name.lower():
            p_name = "openai"
        elif "anthropic" in p_name or "claude" in model_name.lower():
            p_name = "anthropic"
        elif "gemini" in p_name or "gemini" in model_name.lower():
            p_name = "gemini"
        elif "ollama" in p_name or ":" in model_name:
            p_name = "ollama"
        
        # Fallback keys loading
        import os
        from services.vault import decrypt_token
        from models import TenantLLMConfig
        
        api_key = None
        if p_name != "ollama":
            tenant_llm = self.db.query(TenantLLMConfig).filter(TenantLLMConfig.provider == p_name).first()
            if tenant_llm and tenant_llm.encrypted_api_key:
                try:
                    api_key = decrypt_token(tenant_llm.encrypted_api_key)
                except Exception as e:
                    logger.error(f"Failed to decrypt api key for provider {p_name}: {e}")
            
            if not api_key:
                api_key = os.environ.get(f"{p_name.upper()}_API_KEY")

        if p_name == "openai":
            return OpenAIExtractionProvider(self.db, model_name, api_key)
        elif p_name == "anthropic":
            return AnthropicExtractionProvider(self.db, model_name, api_key)
        elif p_name == "gemini":
            return GeminiExtractionProvider(self.db, model_name, api_key)
        elif p_name == "ollama":
            return OllamaExtractionProvider(self.db, model_name)
        else:
            # Fallback/mock support for local/testing
            return OpenAIExtractionProvider(self.db, model_name, api_key)

    def extract(self, raw_email: Any, partial_result: Any, tenant_config: Any) -> Dict[str, Any]:
        """
        Orchestrates structured LLM extraction. Attempts primary model first, falls back to secondary on failure.
        """
        from neuromail.core.raw_email import trackflow_extraction_prompt
        
        # Build prompt
        tenant_rules = getattr(tenant_config, "freight_subject_patterns", []) or []
        prompt = trackflow_extraction_prompt.build(raw_email, partial_result, tenant_rules)
        
        # Limit character cap
        max_chars = getattr(tenant_config, "max_email_body_chars_for_ai", 8000) or 8000
        email_body = getattr(raw_email, "raw_body", getattr(raw_email, "body", "")) or ""
        email_context = f"Subject: {getattr(raw_email, 'subject', '')}\nBody: {email_body[:max_chars]}"

        # Primary Model attempt
        primary_model = getattr(tenant_config, "primary_ai_model", "gpt-4o")
        fallback_model = getattr(tenant_config, "fallback_ai_model", "claude-3-5-sonnet")

        # Determine provider name from model name
        primary_provider = "openai"
        if "claude" in primary_model.lower():
            primary_provider = "anthropic"
        elif "gemini" in primary_model.lower():
            primary_provider = "gemini"
        elif ":" in primary_model:
            primary_provider = "ollama"

        fallback_provider = "anthropic"
        if "gpt" in fallback_model.lower():
            fallback_provider = "openai"
        elif "gemini" in fallback_model.lower():
            fallback_provider = "gemini"
        elif ":" in fallback_model:
            fallback_provider = "ollama"

        response = None
        selected_model = primary_model

        try:
            logger.info(f"Attempting primary AI extraction with model {primary_model}...")
            provider = self.get_provider(primary_provider, primary_model)
            response = provider.extract(prompt, AIExtractionResultSchema, email_context)
        except Exception as e:
            logger.warning(f"Primary model extraction failed: {e}. Attempting fallback model {fallback_model}...")
            try:
                selected_model = fallback_model
                provider = self.get_provider(fallback_provider, fallback_model)
                response = provider.extract(prompt, AIExtractionResultSchema, email_context)
            except Exception as e2:
                logger.error(f"Fallback model extraction failed: {e2}")
                raise AIExtractionError(f"AI extraction failed for both primary and fallback models: {e2}")

        # Parse & Validate
        try:
            cleaned_text = response.raw_response.strip()
            # Clean markdown formatting if present
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            elif cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            cleaned_text = cleaned_text.strip()
            
            parsed_json = json.loads(cleaned_text)
            validated = AIExtractionResultSchema.model_validate(parsed_json)
            
            # Convert back to standard dict and stamp chosen model
            res = validated.model_dump()
            res["_model_used"] = selected_model
            res["_raw_response"] = response.raw_response
            return res
        except Exception as ve:
            logger.error(f"Structured output schema validation failed: {ve}. Raw response: {response.raw_response}")
            raise AIExtractionError(f"Schema validation failed: {ve}")
