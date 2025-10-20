import { callAI } from "./callAI";

async function testAI() {
  const prompt = "Summarize: Artificial intelligence is transforming industries.";
  const response = await callAI(prompt);
  console.log("✅ AI Response:", response);
}

testAI().catch(console.error);
