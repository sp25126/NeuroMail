from neuromail.core.mailboxes.base_adapter import MailProviderAdapter
from neuromail.core.mailboxes.gmail_adapter import GmailAdapter
from neuromail.core.mailboxes.outlook_adapter import OutlookAdapter

class ProviderFactory:
    _registry = {
        "GMAIL": GmailAdapter,
        "OUTLOOK": OutlookAdapter
    }

    @classmethod
    def get_adapter(cls, provider_type: str) -> MailProviderAdapter:
        provider_type = provider_type.upper()
        if provider_type not in cls._registry:
            raise ValueError(f"Unsupported mail provider type: {provider_type}")
        return cls._registry[provider_type]()
        
    @classmethod
    def register_provider(cls, provider_type: str, adapter_cls):
        cls._registry[provider_type.upper()] = adapter_cls
