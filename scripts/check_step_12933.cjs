const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:/Users/Navdeep/.gemini/antigravity/brain/423c1909-bce8-42f9-9315-a88782e7ecfb/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (parsed.step_index === 12932 || parsed.step_index === 12933) {
      console.log('Step index:', parsed.step_index);
      console.log('Thinking:', parsed.thinking);
    }
  }
}
main();

