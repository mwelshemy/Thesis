from typing import Optional
from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncio
import os
import traceback
from concurrent.futures import ThreadPoolExecutor

# Keep heavy ML imports inside load_models() to avoid import-time crashes.
# This file intentionally uses lazy imports and robust fallbacks so uvicorn
# can import the module even if the environment lacks transformers/torch.

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DeepSeek AI API", description="AI-powered code analysis and generation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration
MODEL_CONFIG = {
    "model_name": "deepseek-ai/deepseek-coder-1.3b-instruct",
    "max_length": 2048,
    "max_new_tokens": 512,
    "temperature": 0.7,
    "embedding_dim": 4096,
    # Safety timeout for generation (seconds)
    "generation_timeout_s": 30,
    # Allow generation concurrency or serialize
    "allow_concurrent_generations": False
}

# Globals
tokenizer = None
model = None
embedding_model = None
model_loaded: bool = False
_model_import_error: Optional[str] = None

# Lock to serialize heavy generation (optional)
_generation_lock = asyncio.Lock()
# ThreadPool to run synchronous model.generate off the event loop
_thread_pool = ThreadPoolExecutor(max_workers=1)

class CodeRequest(BaseModel):
    prompt: str

class EmbeddingRequest(BaseModel):
    text: str

class AnalysisRequest(BaseModel):
    code: str
    analysis_type: str = "general"

async def load_models():
    """
    Lazy-load ML libraries and models. Any import/load error is captured and
    the server stays up with mock behavior.
    """
    global tokenizer, model, embedding_model, model_loaded, _model_import_error

    logger.info("Starting background model loading...")
    try:
        try:
            # Lazy import: transformers and torch may not be present in dev env
            from transformers import AutoTokenizer, AutoModel, AutoModelForCausalLM  # type: ignore
            import torch  # type: ignore
        except Exception as imp_err:
            _model_import_error = f"Failed to import transformers/torch: {imp_err}"
            logger.exception(_model_import_error)
            model_loaded = False
            return

        # device & dtype selection
        def _select_device_and_dtype():
            if torch.cuda.is_available():
                return torch.device("cuda"), torch.float16
            else:
                return torch.device("cpu"), torch.float32

        device, dtype = _select_device_and_dtype()
        logger.info(f"Device chosen: {device}, dtype: {dtype}")

        # tokenizer
        try:
            tokenizer = AutoTokenizer.from_pretrained(MODEL_CONFIG["model_name"], trust_remote_code=True)
            if tokenizer.pad_token is None and getattr(tokenizer, "eos_token", None) is not None:
                tokenizer.pad_token = tokenizer.eos_token
            logger.info("Tokenizer loaded")
        except Exception as e:
            _model_import_error = f"Tokenizer load error: {e}"
            logger.exception(_model_import_error)
            model_loaded = False
            return

        # try causal LM, fallback to base AutoModel
        try:
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_CONFIG["model_name"],
                trust_remote_code=True,
                dtype=dtype,
                low_cpu_mem_usage=True,
            )
            model.to(device)
            model.eval()
            logger.info("Causal LM loaded")
        except Exception as e:
            logger.warning(f"AutoModelForCausalLM load failed: {e}; trying AutoModel fallback")
            try:
                model = AutoModel.from_pretrained(
                    MODEL_CONFIG["model_name"],
                    trust_remote_code=True,
                    dtype=dtype,
                    low_cpu_mem_usage=True,
                )
                model.to(device)
                model.eval()
                logger.info("Base AutoModel loaded")
            except Exception as e2:
                _model_import_error = f"Model load error: {e2}"
                logger.exception(_model_import_error)
                model_loaded = False
                return

        # embedding_model (reuse if possible)
        try:
            if hasattr(model, "__class__") and "AutoModel" in model.__class__.__name__ and not hasattr(model, "generate"):
                embedding_model = model
            else:
                embedding_model = AutoModel.from_pretrained(
                    MODEL_CONFIG["model_name"],
                    trust_remote_code=True,
                    dtype=dtype,
                    low_cpu_mem_usage=True,
                )
                embedding_model.to(device)
                embedding_model.eval()
            logger.info("Embedding model ready")
        except Exception as e:
            logger.exception(f"Embedding model load failed (non-fatal): {e}")
            embedding_model = None

        model_loaded = True
        _model_import_error = None
        logger.info("All models loaded successfully (or at least as much as possible).")

    except Exception as e:
        _model_import_error = f"Unexpected error in load_models: {e}\n{traceback.format_exc()}"
        logger.exception(_model_import_error)
        model_loaded = False

@app.on_event("startup")
async def startup_event():
    # Run model loading in background so server starts quickly.
    asyncio.create_task(load_models())

def get_mock_response(prompt: str, error: str = "") -> str:
    prompt_lower = (prompt or "").lower()
    if "function" in prompt_lower and "typescript" in prompt_lower:
        return (
            "Here's a TypeScript function based on your request:\n\n"
            "```typescript\n"
            "function exampleFunction(input: string): string {\n"
            "  const processed = input.trim().toLowerCase();\n"
            "  return processed ? processed : \"default\";\n"
            "}\n"
            "```\n"
            "Note: this is a mock response."
        )
    return f"MOCK RESPONSE: {prompt}\n\n{error}"

@app.get("/health")
async def health():
    """
    Health endpoint - always available. Returns model status and import/load errors
    to help diagnose start/import failures.
    """
    status = "healthy" if model_loaded else ("mock_mode" if _model_import_error else "degraded")
    return {"status": status, "model_loaded": model_loaded, "import_error": _model_import_error}

# Internal helper: run the blocking generation in a thread and return the text
def _sync_generate(prompt: str) -> str:
    """
    Synchronous generation wrapper to be executed in a ThreadPoolExecutor.
    Keeps local imports inside to avoid circular import issues at module load time.
    """
    try:
        # Local import to avoid top-level dependency issues if not loaded
        from transformers import AutoTokenizer  # type: ignore
        # If model does not support .generate -> fallback
        if not model or not hasattr(model, "generate") or tokenizer is None:
            logger.warning("No model.generate available in sync path; returning mock")
            return get_mock_response(prompt, error=_model_import_error or "")
        import torch  # type: ignore
        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=MODEL_CONFIG["max_length"],
            padding=True,
        )
        device = next(model.parameters()).device
        input_ids = inputs.input_ids.to(device)

        gen = model.generate(
            input_ids,
            max_new_tokens=MODEL_CONFIG.get("max_new_tokens", 512),
            temperature=MODEL_CONFIG.get("temperature", 0.7),
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )
        output = tokenizer.decode(gen[0], skip_special_tokens=True)
        return output
    except Exception as e:
        logger.exception("Sync generation failure")
        return get_mock_response(prompt, error=str(e))

@app.post("/generate")
async def generate(req: CodeRequest):
    """
    Main generation endpoint. Uses a timeout and fallback so requests don't hang forever.
    If model isn't ready, returns a mock response quickly.
    """
    global model_loaded

    # If model not loaded, return mock immediately (keeps client responsive)
    if not model_loaded or model is None or tokenizer is None:
        logger.info("Model not ready; returning mock generate response")
        return {"generated_text": get_mock_response(req.prompt, error=_model_import_error or "")}

    # If server is configured to serialize generation, acquire lock
    lock = _generation_lock if not MODEL_CONFIG.get("allow_concurrent_generations", True) else None

    try:
        if lock:
            await lock.acquire()
            logger.debug("Acquired generation lock")

        loop = asyncio.get_running_loop()
        gen_timeout = MODEL_CONFIG.get("generation_timeout_s", 30)

        logger.info("Starting generation (offloaded to thread)...")
        try:
            # Run the synchronous generation function in a thread with timeout
            future = loop.run_in_executor(_thread_pool, _sync_generate, req.prompt)
            output = await asyncio.wait_for(future, timeout=gen_timeout)
            logger.info("Generation completed successfully")
            return {"generated_text": output}
        except asyncio.TimeoutError:
            logger.warning("Generation timed out after %s seconds", gen_timeout)
            # Attempt to cancel the running thread future is not trivial; just return a controlled mock/failure
            return {"generated_text": get_mock_response(req.prompt, error=f"Generation timed out after {gen_timeout}s"), "error": "timeout"}
        except Exception as e:
            logger.exception("Generation failed with exception")
            return {"generated_text": get_mock_response(req.prompt, error=str(e)), "error": str(e)}
    finally:
        if lock:
            try:
                lock.release()
                logger.debug("Released generation lock")
            except Exception:
                pass

@app.post("/embed")
async def embed(req: EmbeddingRequest):
    """
    Embedding endpoint. Returns {embedding: [...]}. Uses model if available, otherwise deterministic mock.
    """
    global embedding_model, tokenizer

    if embedding_model is None or tokenizer is None:
        seeds = np.frombuffer(req.text.encode("utf-8"), dtype=np.uint8)
        rng = np.random.default_rng(int(np.sum(seeds) % 2**32))
        vec = rng.standard_normal(MODEL_CONFIG["embedding_dim"]).astype(float).tolist()
        return {"embedding": vec, "note": "mock"}

    try:
        import torch  # local import

        inputs = tokenizer(
            req.text,
            return_tensors="pt",
            truncation=True,
            max_length=MODEL_CONFIG["max_length"],
            padding=True,
        )
        device = next(embedding_model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = embedding_model(**inputs)
            last_hidden = getattr(outputs, "last_hidden_state", None)
            if last_hidden is None:
                pooled = getattr(outputs, "pooler_output", None)
                if pooled is None:
                    # fallback: use deterministic transform of token ids
                    return {"embedding": np.mean(np.array([tok.tolist() for tok in inputs["input_ids"].cpu().numpy()]), axis=0).tolist(), "note": "fallback"}
                embedding = pooled.cpu().numpy().squeeze().tolist()
            else:
                embedding = last_hidden.mean(dim=1).cpu().numpy().squeeze().tolist()
        return {"embedding": embedding}
    except Exception as e:
        logger.exception("Embedding failed; returning mock")
        seeds = np.frombuffer(req.text.encode("utf-8"), dtype=np.uint8)
        rng = np.random.default_rng(int(np.sum(seeds) % 2**32))
        vec = rng.standard_normal(MODEL_CONFIG["embedding_dim"]).astype(float).tolist()
        return {"embedding": vec, "error": str(e)}

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    res = get_mock_response(req.code)
    return {"analysis_type": req.analysis_type, "result": res}

# Backwards-compatible aliases for older clients
@app.post("/generate_code")
async def generate_code_alias(req: CodeRequest):
    # alias that mirrors older API expecting 'generated_code'
    resp = await generate(req)
    return {"generated_code": resp.get("generated_text"), **({k: v for k, v in resp.items() if k != "generated_text"})}

@app.post("/generate_embedding")
async def generate_embedding_alias(req: EmbeddingRequest):
    # alias for older clients expecting /generate_embedding
    resp = await embed(req)
    return {"embedding": resp.get("embedding"), **({k: v for k, v in resp.items() if k != "embedding"})}

# If executed directly, run uvicorn to make debugging import errors easier.
if __name__ == "__main__":
    import uvicorn
    print("Starting DeepSeek API on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)