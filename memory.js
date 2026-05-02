const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.resolve('memory.json');

/**
 * Reads memory entries from the JSON file.
 * Returns an empty array if the file doesn't exist or is invalid.
 */
function readMemories() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return [];
    }
    const data = fs.readFileSync(MEMORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

/**
 * Writes memory entries to the JSON file.
 */
function writeMemories(entries) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing memory file:', error);
  }
}

/**
 * Appends a new memory entry to memory.json.
 * 
 * @param {Object} entry 
 * @param {string} entry.agent
 * @param {string} entry.model
 * @param {string} entry.task
 * @param {string} entry.output
 * @param {number} entry.timestamp
 */
function saveMemory(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const entries = readMemories();

  const newEntry = {
    agent: entry.agent || '',
    model: entry.model || '',
    task: entry.task || '',
    output: entry.output || '',
    timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now()
  };

  entries.push(newEntry);
  writeMemories(entries);
  return newEntry;
}

/**
 * Returns relevant past entries using simple keyword matching (limited to top 3).
 * 
 * @param {string} task 
 * @returns {Array} Top 3 matching memories
 */
function getRelevantMemory(task) {
  if (!task || typeof task !== 'string') return [];

  const entries = readMemories();
  const queryWords = task
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length >= 2);

  if (queryWords.length === 0) {
    // If no distinct words of length 2+, perform fallback matching
    const fallback = task.toLowerCase().trim();
    if (!fallback) return [];

    return entries
      .filter(entry => (entry.task || '').toLowerCase().includes(fallback))
      .slice(0, 3);
  }

  const scoredEntries = entries.map(entry => {
    const entryTask = (entry.task || '').toLowerCase();
    const entryOutput = (entry.output || '').toLowerCase();
    
    let matches = 0;
    for (const word of queryWords) {
      if (entryTask.includes(word) || entryOutput.includes(word)) {
        matches++;
      }
    }
    return { entry, matches };
  });

  return scoredEntries
    .filter(item => item.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .map(item => item.entry)
    .slice(0, 3);
}

/**
 * Fetches relevant memory and builds a prompt.
 * 
 * @param {Object} params
 * @param {string} params.agent
 * @param {string} params.task
 * @returns {string} Formatted context prompt
 */
function buildContext({ agent, task }) {
  const agentRole = agent || 'software';
  const taskText = task || '';
  const relevantMemories = getRelevantMemory(taskText);

  let prevContextSection = '';
  if (relevantMemories && relevantMemories.length > 0) {
    prevContextSection = relevantMemories
      .map(m => `- Task: ${m.task}\n  Output: ${m.output}`)
      .join('\n');
  } else {
    prevContextSection = '- No relevant context found.';
  }

  return `You are a ${agentRole} developer.

Previous context:
${prevContextSection}

Task:
${taskText}`;
}

module.exports = {
  saveMemory,
  getRelevantMemory,
  buildContext
};
