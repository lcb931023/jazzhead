#!/usr/bin/env node
// Usage: node merge-standards.js jazz-standards-custom.json

const fs = require('fs');
const base = JSON.parse(fs.readFileSync('standards.json', 'utf8'));
const custom = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const incoming = custom.custom_standards || custom.standards || [];

const byId = new Map(base.standards.map(s => [s.id, s]));
incoming.forEach(s => byId.set(s.id, s));
base.standards = Array.from(byId.values());

fs.writeFileSync('standards.json', JSON.stringify(base, null, 2));
console.log(`Merged ${incoming.length} custom standard(s) into standards.json`);
