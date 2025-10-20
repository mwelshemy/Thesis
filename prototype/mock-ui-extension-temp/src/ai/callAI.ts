import fetch from "node-fetch";
import * as path from "path";
import * as dotenv from "dotenv";

// ✅ Load your .env file manually
dotenv.config({ path: path.join(__dirname, "../../.env") });

export async function callAI(prompt: string): Promise<string> {
  const apiToken = process.env.HUGGINGFACE_API_TOKEN;
  const model = process.env.AI_MODEL || "facebook/bart-large-cnn";

  if (!apiToken) {
    throw new Error("⚠️ Missing HUGGINGFACE_API_TOKEN in .env");
  }

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  // ✅ Fix the type error by casting
  const data = (await response.json()) as any;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.error || "Unknown error"}`);
  }

  if (Array.isArray(data) && data[0]?.summary_text) {
    return data[0].summary_text;
  }

  if (Array.isArray(data) && data[0]?.generated_text) {
    return data[0].generated_text;
  }

  return "⚠️ No valid output from model.";
}
