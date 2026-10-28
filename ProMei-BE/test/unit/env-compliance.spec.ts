import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnvCompliance } from '../../src/shared/config/env-compliance';

describe('validateEnvCompliance', () => {
  const tempDir = path.resolve(__dirname, '../../..', 'temp-test');
  const originalCwd = process.cwd();

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('deve falhar quando .env não existe', () => {
    fs.writeFileSync('.env.example', 'DATABASE_URL=postgresql://localhost/db\n');

    expect(() => validateEnvCompliance()).toThrow('Arquivo .env não encontrado');
  });

  it('deve falhar quando .env.example não existe', () => {
    fs.writeFileSync('.env', 'DATABASE_URL=postgresql://localhost/db\n');

    expect(() => validateEnvCompliance()).toThrow('Arquivo .env.example não encontrado');
  });

  it('deve falhar quando variável está faltando no .env', () => {
    fs.writeFileSync('.env.example', 'DATABASE_URL=postgresql://localhost/db\nPORT=3001\n');
    fs.writeFileSync('.env', 'DATABASE_URL=postgresql://localhost/db\n');

    expect(() => validateEnvCompliance()).toThrow('PORT');
    expect(() => validateEnvCompliance()).toThrow('Variáveis FALTANDO no .env');
  });

  it('deve falhar quando variável obrigatória está vazia no .env', () => {
    fs.writeFileSync('.env.example', 'DATABASE_URL=postgresql://localhost/db\nPORT=3001\n');
    fs.writeFileSync('.env', 'DATABASE_URL=\nPORT=3001\n');

    expect(() => validateEnvCompliance()).toThrow('DATABASE_URL');
    expect(() => validateEnvCompliance()).toThrow('Variáveis VAZIAS no .env');
  });

  it('deve ignorar linhas vazias e comentários', () => {
    fs.writeFileSync(
      '.env.example',
      `# Comentário
DATABASE_URL=postgresql://localhost/db

# Outro comentário
PORT=3001
`,
    );
    fs.writeFileSync(
      '.env',
      `# Comentário
DATABASE_URL=postgresql://localhost/db

# Outro comentário
PORT=3001
`,
    );

    expect(() => validateEnvCompliance()).not.toThrow();
  });

  it('deve validar com sucesso quando todas as variáveis estão preenchidas', () => {
    fs.writeFileSync(
      '.env.example',
      `DATABASE_URL=postgresql://localhost/db
PORT=3001
API_PREFIX=/api/v1
`,
    );
    fs.writeFileSync(
      '.env',
      `DATABASE_URL=postgresql://localhost/db
PORT=3001
API_PREFIX=/api/v1
`,
    );

    expect(() => validateEnvCompliance()).not.toThrow();
  });

  it('deve permitir variáveis opcionais vazias (SENTRY_DSN)', () => {
    fs.writeFileSync(
      '.env.example',
      `DATABASE_URL=postgresql://localhost/db
SENTRY_DSN=
`,
    );
    fs.writeFileSync(
      '.env',
      `DATABASE_URL=postgresql://localhost/db
SENTRY_DSN=
`,
    );

    expect(() => validateEnvCompliance()).not.toThrow();
  });

  it('deve validar valores com = no conteúdo', () => {
    fs.writeFileSync(
      '.env.example',
      `DATABASE_URL=postgresql://localhost/db?param=value
API_KEY=secret=withequals
`,
    );
    fs.writeFileSync(
      '.env',
      `DATABASE_URL=postgresql://localhost/db?param=value
API_KEY=secret=withequals
`,
    );

    expect(() => validateEnvCompliance()).not.toThrow();
  });
});
