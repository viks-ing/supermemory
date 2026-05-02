const { saveMemory, getRelevantMemory, buildContext } = require('./memory');
const fs = require('fs');
const path = require('path');

// Helper to clear existing test memory file
const MEMORY_FILE = path.resolve('memory.json');
if (fs.existsSync(MEMORY_FILE)) {
  fs.unlinkSync(MEMORY_FILE);
}

console.log('--- TEST 1: Saving memories ---');
const entry1 = saveMemory({
  agent: 'React',
  model: 'gemini-3-flash',
  task: 'Create beautiful navigation bar component',
  output: 'Navbar created with custom styling and animations',
  timestamp: Date.now()
});
console.log('Saved entry 1:', entry1);

const entry2 = saveMemory({
  agent: 'Node',
  model: 'gemini-3-flash',
  task: 'Set up an Express server with CORS and error handling middleware',
  output: 'Server listening on port 5000 with CORS enabled.',
  timestamp: Date.now()
});
console.log('Saved entry 2:', entry2);

const entry3 = saveMemory({
  agent: 'CSS',
  model: 'gemini-3-flash',
  task: 'Apply animations to cards with glow effect',
  output: 'Glow effect and subtle transitions added.',
  timestamp: Date.now()
});
console.log('Saved entry 3:', entry3);

const entry4 = saveMemory({
  agent: 'React',
  model: 'gemini-3-flash',
  task: 'Build dynamic navbar with light/dark theme toggle',
  output: 'Theme toggle implemented using local storage and Context API.',
  timestamp: Date.now()
});
console.log('Saved entry 4:', entry4);

console.log('\n--- TEST 2: Testing keyword matching (top 3) ---');
console.log('Searching for "navbar":');
const navbarMemories = getRelevantMemory('navbar');
console.log(`Found ${navbarMemories.length} relevant entries.`);
navbarMemories.forEach((m, idx) => console.log(`${idx + 1}: ${m.task}`));

console.log('\n--- TEST 3: Context building ---');
const prompt = buildContext({
  agent: 'React',
  task: 'Create modern interactive responsive navbar'
});

console.log('\nGenerated Context Prompt:');
console.log('====================================');
console.log(prompt);
console.log('====================================');

console.log('\nAll tests completed successfully!');
