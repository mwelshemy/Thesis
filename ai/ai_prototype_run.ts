import { callAI, callAIMock } from './callAI';

/**
 * Test script to verify AI integration works
 */
async function testAI() {
  console.log('🧪 Testing AI Integration...\n');

  const testPrompt = "Explain this code: function hello() { return 'world'; }";

  console.log('📤 Test Prompt:', testPrompt);
  console.log('---');

  // Try real API first, fall back to mock
  let response: string;

  if (process.env.HUGGINGFACE_API_TOKEN) {
    console.log('🔐 Using real Hugging Face API...');
    response = await callAI(testPrompt);
  } else {
    console.log('🎭 No API token found, using mock response...');
    response = await callAIMock(testPrompt);
  }

  console.log('📥 AI Response:');
  console.log(response);
  console.log('---');

  if (response.startsWith('ERROR:')) {
    console.log('❌ AI test failed with error');
    process.exit(1);
  } else {
    console.log('✅ AI test completed successfully!');
  }
}

// Run the test
testAI().catch(console.error);
