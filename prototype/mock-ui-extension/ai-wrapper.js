// ai-wrapper.js — bridge used by extension.js

const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config();

/**
 * Run the TypeScript test runner that calls callAI.
 * We run ts-node to call the already-tested TS function and capture stdout.
 * This keeps extension code simple and reuses existing TS logic.
 */
function runCallAI(prompt) {
    const tsFile = path.join(__dirname, "src", "ai", "ai_prototype_run.ts");

    // Run ts-node to call the script and capture the output.
    // We pass the prompt as a single argument.
    const result = spawnSync("npx", ["ts-node", tsFile, prompt], {
        encoding: "utf-8",
        shell: true,
    });

    if (result.error) {
        console.error("[AI_WRAPPER] spawn error:", result.error);
        return `ERROR: AI wrapper failed: ${result.error.message || result.error}`;
    }

    // Prefer stdout (the script prints the AI response to console)
    const out = (result.stdout || "").trim();
    const err = (result.stderr || "").trim();

    // If stderr contains info, include it for debugging
    if (err && !out) return `ERROR (stderr): ${err}`;

    if (!out) return "(No response from AI)";

    return out;
}

function log(msg) {
    console.log(`[AI_WRAPPER] ${msg}`);
}

module.exports = { runCallAI, log };
