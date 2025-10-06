"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const callAI_1 = require("./callAI");
async function testAI() {
    console.log('🧪 Testing AI Integration...\n');
    const testPrompt = "Explain this code: function hello() { return 'world'; }";
    console.log('📤 Test Prompt:', testPrompt);
    console.log('---');
    let response;
    if (process.env.HUGGINGFACE_API_TOKEN) {
        console.log('🔐 Using real Hugging Face API...');
        response = await (0, callAI_1.callAI)(testPrompt);
    }
    else {
        console.log('🎭 No API token found, using mock response...');
        response = await (0, callAI_1.callAIMock)(testPrompt);
    }
    console.log('📥 AI Response:');
    console.log(response);
    console.log('---');
    if (response.startsWith('ERROR:')) {
        console.log('❌ AI test failed with error');
        process.exit(1);
    }
    else {
        console.log('✅ AI test completed successfully!');
    }
}
testAI().catch(console.error);
//# sourceMappingURL=ai_prototype_run.js.map