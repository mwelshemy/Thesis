What Has Been Done
    Selected Deepseek Coder 6.7B open-source code generation model for local inference.
    Built a Python FastAPI backend that loads the model locally using Hugging Face Transformers.
    Set up communication via HTTP API that receives prompts and returns generated code.
    Developed a TypeScript client script (ai_prototype_run.ts) to send prompts and display generated completions via this API.
    Successfully tested model downloading, loading, and inference pipeline end-to-end locally.
    Confirmed generation of context-aware code completions (e.g., adding module exports).
    
What Needs to Be Downloaded / Installed
    Deepseek Coder 6.7B model weights and tokenizer files: approx. 13.5 GB total, downloads managed by transformers caching.
    Python dependencies: transformers, torch (CPU or CUDA-enabled if GPU available), fastapi, uvicorn.
    Optionally, hf_xet package for improved download performance.
    TypeScript dependencies: node-fetch or axios for HTTP requests, along with ts-node for script execution.
