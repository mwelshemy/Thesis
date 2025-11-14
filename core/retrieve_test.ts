// core/retrieve_test.ts

import { retrieve } from "./retrieve";

console.log("Running retrieve() test...");

const query = "sort";

(async () => {
  try {
    const results = await retrieve(query);
    console.log("Test complete. Results:");
    console.log(results);
  } catch (err) {
    console.error("Error during retrieve() test:", err);
  }
})();
