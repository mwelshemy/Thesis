"use strict";
async function testAI() {
    const testPrompts = [
        "function hello() { return 'world'; }",
        "const nums = [1,2,3]; const doubled = nums.map(n => n * 2);"
    ];
    for (const prompt of testPrompts) {
        try {
            const response = await fetch('http://localhost:8000/generate_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await response.json();
            console.log(`Prompt:\n${prompt}\nGenerated:\n${data.generated_code}\n---`);
        }
        catch (err) {
            console.error('Error querying backend:', err);
        }
    }
}
testAI();
//# sourceMappingURL=ai_prototype_run.js.map