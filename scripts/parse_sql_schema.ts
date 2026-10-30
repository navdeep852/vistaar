import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

interface TableDefinition {
  name: string;
  primaryKey: string[];
  columns: string[];
  foreignKeys: Record<string, string>;
  file: string;
}

const tables: Record<string, TableDefinition> = {};

for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  // Match CREATE TABLE
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];

    if (!tables[tableName]) {
      const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--'));
      const columns: string[] = [];
      const primaryKey: string[] = [];
      const foreignKeys: Record<string, string> = {};

      for (const line of lines) {
        // Check PRIMARY KEY constraint
        const pkConstraintMatch = line.match(/CONSTRAINT\s+\w+\s+PRIMARY\s+KEY\s*\(([^)]+)\)/i) ||
                                  line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkConstraintMatch) {
          primaryKey.push(...pkConstraintMatch[1].split(',').map(c => c.trim().replace(/["']/g, '')));
          continue;
        }

        // Column definition
        const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_()]+)/);
        if (colMatch) {
          const colName = colMatch[1];
          columns.push(colName);
          if (line.toUpperCase().includes('PRIMARY KEY')) {
            primaryKey.push(colName);
          }
          const fkMatch = line.match(/REFERENCES\s+public\.([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_]+)\)/i);
          if (fkMatch) {
            foreignKeys[colName] = `${fkMatch[1]}.${fkMatch[2]}`;
          }
        }
      }

      tables[tableName] = {
        name: tableName,
        primaryKey,
        columns,
        foreignKeys,
        file,
      };
    }
  }
}

console.log('=== PARSED SQL SCHEMA DEFINITIONS ===\n');
for (const [name, def] of Object.entries(tables)) {
  console.log(`Table: ${name}`);
  console.log(`  File: ${def.file}`);
  console.log(`  Primary Key: [${def.primaryKey.join(', ')}]`);
  console.log(`  Columns (${def.columns.length}): ${def.columns.join(', ')}`);
  console.log(`  Foreign Keys:`, def.foreignKeys);
  console.log('');
}

