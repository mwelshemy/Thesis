/**
 * Calls Hugging Face AI API with the given prompt.
 * Uses Node.js 18+ built-in fetch.
 */
export async function callAI(
  prompt: string,
  model: string = 'bigcode/starcoder',
  temperature: number = 0.7
): Promise<string> {
  try {
    const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN;

    if (!HF_TOKEN) {
      return 'ERROR: HUGGINGFACE_API_TOKEN not set. Please set your API token.';
    }

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 500,
            temperature,
          },
          options: {
            wait_for_model: true,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;
    if (data.generated_text) return data.generated_text;
    if (data.error) return `ERROR: ${data.error}`;

    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    console.error('AI Call Error:', error);
    return `ERROR: ${error.message || 'Unknown error occurred'}`;
  }
}

/**
 * Mock version for testing without a real API token.
 */
export async function callAIMock(prompt: string): Promise<string> {
  return `MOCK RESPONSE: This is a mock AI response for: "${prompt.substring(0, 100)}..."\n\nIn production, this would call the actual Hugging Face API.`;
}
