import * as fs from 'fs';
import * as path from 'path';
import { envSchema } from './env.schema';

/**
 * Extrai variáveis opcionais do schema Zod dinamicamente.
 */
function getOptionalVars(): Set<string> {
  const optional = new Set<string>();
  const schemaShape = envSchema.shape;

  Object.entries(schemaShape).forEach(([key, schema]) => {
    if (typeof schema?.isOptional === 'function' && schema.isOptional()) {
      optional.add(key);
    }
  });

  return optional;
}

/**
 * Extrai as chaves das variáveis do .env.example dinamicamente.
 */
function getExampleKeys(): string[] {
  const examplePath = path.resolve(process.cwd(), '.env.example');

  if (!fs.existsSync(examplePath)) {
    throw new Error(
      `Arquivo .env.example não encontrado em ${examplePath}. ` +
        'Este arquivo é necessário para validação de conformidade.',
    );
  }

  const exampleContent = fs.readFileSync(examplePath, 'utf-8');

  return exampleContent
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const key = line.split('=')[0];
      return key ? key.trim() : '';
    })
    .filter(Boolean);
}

/**
 * Valida se o arquivo .env existe e contém todas as variáveis do .env.example preenchidas.
 * A aplicação não inicia se:
 * - .env não existe
 * - Alguma variável do .env.example está faltando no .env
 * - Alguma variável obrigatória está vazia no .env
 *
 * Variáveis opcionais podem estar vazias (definidas no schema Zod com .optional()).
 */
export function validateEnvCompliance(): void {
  const envPath = path.resolve(process.cwd(), '.env');

  // Verifica se .env existe
  if (!fs.existsSync(envPath)) {
    throw new Error(
      '❌ Arquivo .env não encontrado.\n\n' +
        'Solução:\n' +
        '  cp .env.example .env\n' +
        '  # Então preencha as variáveis necessárias\n\n' +
        `Caminho esperado: ${envPath}`,
    );
  }

  // Extrai chaves do .env.example dinamicamente
  const exampleKeys = getExampleKeys();
  const optionalVars = getOptionalVars();

  // Lê arquivo .env
  const envContent = fs.readFileSync(envPath, 'utf-8');

  // Cria mapa das variáveis no .env
  const envMap = new Map<string, string>();
  envContent.split('\n').forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return;

    const parts = line.split('=');
    const key = parts[0];

    if (key && key.trim()) {
      const value = parts.slice(1).join('=').trim();
      envMap.set(key.trim(), value);
    }
  });

  // Valida se todas as chaves do .env.example estão no .env e preenchidas
  const missingKeys: string[] = [];
  const emptyKeys: string[] = [];

  exampleKeys.forEach((key) => {
    if (!envMap.has(key)) {
      missingKeys.push(key);
    } else {
      const value = envMap.get(key) || '';
      if (!value && !optionalVars.has(key)) {
        emptyKeys.push(key);
      }
    }
  });

  // Se houver problemas, lança erro
  if (missingKeys.length > 0 || emptyKeys.length > 0) {
    let errorMessage = '\n❌ COMPLIANCE VALIDATION FAILED\n';
    errorMessage += '═'.repeat(50) + '\n\n';

    if (missingKeys.length > 0) {
      errorMessage += `Variáveis FALTANDO no .env (${missingKeys.length}):\n`;
      missingKeys.forEach((k) => {
        errorMessage += `  ❌ ${k}\n`;
      });
      errorMessage += '\n';
    }

    if (emptyKeys.length > 0) {
      errorMessage += `Variáveis VAZIAS no .env (${emptyKeys.length}):\n`;
      emptyKeys.forEach((k) => {
        errorMessage += `  ❌ ${k}\n`;
      });
      errorMessage += '\n';
    }

    errorMessage +=
      'Solução:\n' +
      `  1. cp .env.example .env\n` +
      `  2. Edite ${envPath}\n` +
      `  3. Preencha todas as variáveis obrigatórias\n` +
      `  4. Rode novamente\n\n` +
      '═'.repeat(50);

    throw new Error(errorMessage);
  }
}
