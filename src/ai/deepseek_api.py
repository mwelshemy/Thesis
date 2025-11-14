from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

app = FastAPI()

model_name = "deepseek-ai/deepseek-coder-1.3b-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True)
class CodeRequest(BaseModel):
    prompt: str

@app.post("/generate_code")
async def generate_code(req: CodeRequest):
    inputs = tokenizer(req.prompt, return_tensors="pt")
    outputs = model.generate(**inputs, max_new_tokens=512)
    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return {"generated_code": generated_text}
