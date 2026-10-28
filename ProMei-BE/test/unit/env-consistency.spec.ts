import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { envValidationMap } from '../../src/shared/config/env.config';

/**
 * .env.example e envValidationMap (env.config.ts) sao duas fontes que
 * precisam listar exatamente as mesmas variaveis: a primeira e o template
 * que o dev copia (`cp .env.example .env`) e que env-compliance.ts usa pra
 * exigir preenchimento; a segunda define como cada uma e validada (tipo,
 * default, coerção). Nada força as duas a andarem juntas — uma feature que
 * mexe só numa delas não quebra em lugar nenhum, e a outra fica desatualizada
 * em silêncio. Este teste torna esse silêncio em falha de CI.
 */
function getExampleKeys(): string[] {
  const examplePath = path.resolve(__dirname, '../../.env.example');
  const content = fs.readFileSync(examplePath, 'utf-8');

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0]?.trim())
    .filter((key): key is string => Boolean(key));
}

describe('.env.example e env.config.ts (envValidationMap) em sincronia', () => {
  it('toda variável de .env.example tem entrada em envValidationMap', () => {
    const exampleKeys = getExampleKeys();
    const configKeys = new Set(Object.keys(envValidationMap));

    const missingFromConfig = exampleKeys.filter((key) => !configKeys.has(key));

    expect(
      missingFromConfig,
      `Variáveis em .env.example sem validação em env.config.ts: ${missingFromConfig.join(', ')}`,
    ).toEqual([]);
  });

  it('toda variável de envValidationMap está documentada em .env.example', () => {
    const exampleKeys = new Set(getExampleKeys());
    const configKeys = Object.keys(envValidationMap);

    const missingFromExample = configKeys.filter((key) => !exampleKeys.has(key));

    expect(
      missingFromExample,
      `Variáveis em env.config.ts sem exemplo em .env.example: ${missingFromExample.join(', ')}`,
    ).toEqual([]);
  });
});
