const fs = require('fs');
const content = fs.readFileSync('midihexdebug.csv', 'utf8');
const lines = content.split('\n');

const uniquePrefixes = new Set();

lines.forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.split(',');
    if (parts.length < 7) return;
    const hex = parts.slice(6).join(',').trim();
    const prefix = hex.substring(0, 20); // First ~7 bytes
    uniquePrefixes.add(prefix);
});

console.log('Unique prefixes found:');
uniquePrefixes.forEach(p => console.log(p));

