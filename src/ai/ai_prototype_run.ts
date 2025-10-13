import 'dotenv/config';
import { callAI, callAIMock } from './callAI';

/**
 * Test script to verify AI integration works for "Explain" and "Summarize" prompts.
 */
async function testAI() {
  console.log('🧪 Testing AI Integration...\n');

  // Two test prompts: explain + summarize
  const testPrompts = [
    { type: 'Explain', code: "function hello() { return 'world'; }" },
    { type: 'Summarize', code: "const nums = [1, 2, 3]; const doubled = nums.map(n => n * 2);" },
  ];

  const useRealAPI = !!process.env.HUGGINGFACE_API_TOKEN;
  const callFn = useRealAPI ? callAI : callAIMock;

  for (const prompt of testPrompts) {
    console.log(`📤 ${prompt.type} Prompt:`, prompt.code);
    console.log('---');

    const fullPrompt =
      prompt.type === 'Explain'
        ? `Explain what this code does:\n${prompt.code}`
        : `Summarize the purpose of this code:\n${prompt.code}`;

    if (useRealAPI) console.log('🔐 Using real Hugging Face API...');
    else console.log('🎭 No API token found, using mock response...');

    const response = await callFn(fullPrompt, "facebook/bart-large-cnn", 0.7);

    console.log('📥 AI Response:\n', response);
    console.log('---');

    if (response.startsWith('ERROR:')) {
      console.log('❌ AI test failed with error');
      process.exit(1);
    }
  }

  console.log('✅ AI test completed successfully!');
}

// Run the test
testAI().catch(console.error);
