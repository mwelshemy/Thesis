#from fastapi import FastAPI
#from pydantic import BaseModel
#from transformers import AutoTokenizer, AutoModelForCausalLM
#import torch

#app = FastAPI()

#model_name = "deepseek-ai/deepseek-coder-1.3b-instruct"
#tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
#model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True)
#class CodeRequest(BaseModel):
#    prompt: str

#@app.post("/generate_code")
#async def generate_code(req: CodeRequest):
#    inputs = tokenizer(req.prompt, return_tensors="pt")
#    outputs = model.generate(**inputs, max_new_tokens=512)
#    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
#    return {"generated_code": generated_text}


from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JUST ONE MODEL FOR EMBEDDINGS
model_name = "deepseek-ai/deepseek-coder-1.3b-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
model = AutoModel.from_pretrained(model_name, trust_remote_code=True)

class EmbeddingRequest(BaseModel):
    text: str

@app.post("/generate_embedding")
async def generate_embedding(req: EmbeddingRequest):
    try:
        inputs = tokenizer(
            req.text, 
            return_tensors="pt", 
            truncation=True, 
            max_length=512,
            padding=True
        )
        
        with torch.no_grad():
            outputs = model(**inputs)
            last_hidden_state = outputs.last_hidden_state
            embeddings = last_hidden_state.mean(dim=1).squeeze()
            
            embedding_list = embeddings.numpy().tolist()
            embedding_array = np.array(embedding_list)
            norm = np.linalg.norm(embedding_array)
            if norm > 0:
                embedding_array = embedding_array / norm
            
            return {"embedding": embedding_array.tolist()}
            
    except Exception as e:
        print(f"Embedding generation error: {e}")
        return {"error": str(e), "embedding": []}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model": model_name}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)