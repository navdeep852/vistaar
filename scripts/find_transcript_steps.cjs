const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:/Users/Navdeep/.gemini/antigravity/brain/423c1909-bce8-42f9-9315-a88782e7ecfb/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('288,892') || line.includes('288892')) {
      const parsed = JSON.parse(line);
      console.log('Step index:', parsed.step_index, 'Type:', parsed.type);
      console.log('Thinking snippet:', (parsed.thinking || '').slice(0, 300));
    }
  }
}
main();

