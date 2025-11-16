/**
 * Calls the local Python AI server.
 * Based on the logic from ai_prototype_run.ts
 */
export async function callAI(prompt: string): Promise<string> {
  try {
    const localApiUrl = 'http://localhost:8000/generate_code';

    const response = await fetch(localApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Send the body in the format your deepseek_api.py expects
      body: JSON.stringify({ prompt: prompt }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Parse the response from your deepseek_api.py
    if (data.generated_code) {
      // Your server sends the code back with the prompt,
      // so we can try to strip the prompt if it exists.
      if (data.generated_code.startsWith(prompt)) {
        return data.generated_code.substring(prompt.length).trim();
      }
      return data.generated_code;
    }

    // Handle any other unexpected response
    return JSON.stringify(data, null, 2);
    
  } catch (error: any) {
    console.error('AI Call Error:', error);
    
    // Provide a specific error if the server isn't running
    if (error.cause?.code === 'ECONNREFUSED') {
      return 'ERROR: Connection refused. Is your Python AI server (deepseek_api.py) running on http://localhost:8000?';
    }
    
    return `ERROR: ${error.message || 'Unknown error occurred'}`;
  }
}

/**
 * Mock version for testing. This remains unchanged.
 */
export async function callAIMock(prompt: string): Promise<string> {
  return `MOCK RESPONSE: This is a mock AI response for: "${prompt.substring(
    0,
    100
  )}..."\n\nIn production, this would call the actual Hugging Face API.`;
}