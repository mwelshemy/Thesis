# Import the settings object from your config package
from config import settings
import openai

def setup_ai_client():
    """Initializes and returns the OpenAI client using the configured API key."""
    try:
        # Use the API key from the settings module
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        print("✅ OpenAI client initialized successfully!")
        return client
    except Exception as e:
        print(f"❌ Error initializing OpenAI client: {e}")
        return None

def main():
    """A simple function to demonstrate using the config settings."""
    print("--- Project Configuration ---")
    # Best practice: Never print your full API key! Just show it's loaded.
    print(f"OpenAI Key Loaded: {bool(settings.OPENAI_API_KEY)}")
    print(f"Using GPT Model: {settings.GPT_MODEL}")
    print(f"Using Embedding Model: {settings.EMBEDDING_MODEL}")
    print("-" * 29)

    ai_client = setup_ai_client()

    if ai_client:
        # Now you're ready to use the client for API calls
        print("Ready to interact with the AI.")
        # For example:
        # response = ai_client.chat.completions.create(...)

if __name__ == "__main__":
    main()