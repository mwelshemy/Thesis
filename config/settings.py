import os
from dotenv import load_dotenv

# Load the environment variables from the .env file
load_dotenv()

# --- API Keys (loaded securely from .env) ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# --- Model Names (non-secret constants) ---
GPT_MODEL = "gpt-4o"
EMBEDDING_MODEL = "text-embedding-3-small"

# --- API Endpoints (non-secret constants) ---
# Example for a hypothetical service
DATA_PROCESSING_ENDPOINT = "https://api.your-service.com/v1/data"

# --- Sanity Check ---
# A good practice is to check if essential keys were loaded
if not OPENAI_API_KEY:
    raise ValueError("FATAL ERROR: OPENAI_API_KEY is not set in the .env file.")