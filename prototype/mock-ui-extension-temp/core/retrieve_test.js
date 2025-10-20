"use strict";
// core/retrieve_test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const retrieve_1 = require("./retrieve");
console.log("Running retrieve() test...");
const query = "sort";
(async () => {
    try {
        const results = await (0, retrieve_1.retrieve)(query);
        console.log("Test complete. Results:");
        console.log(results);
    }
    catch (err) {
        console.error("Error during retrieve() test:", err);
    }
})();
