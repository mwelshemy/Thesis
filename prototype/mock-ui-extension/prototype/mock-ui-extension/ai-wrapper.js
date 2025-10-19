// ai-wrapper.js
const path = require("path");
const { spawn } = require("child_process");

function runCallAI(prompt) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, "src/ai/ai_prototype_run.ts");

        const process = spawn("npx", ["ts-node", scriptPath, prompt], {
            cwd: path.join(__dirname, "../../"), // root of the project
            shell: true,
        });

        let output = "";
        let error = "";

        process.stdout.on("data", (data) => {
            output += data.toString();
        });

        process.stderr.on("data", (data) => {
            error += data.toString();
        });

        process.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`AI process exited with code ${code}: ${error}`));
            } else {
                resolve(output.trim());
            }
        });
    });
}

function log(msg) {
    console.log(`[AI Bridge] ${msg}`);
}

module.exports = { runCallAI, log };
