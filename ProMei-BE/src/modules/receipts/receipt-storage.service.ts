import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config';

/**
 * Armazenamento dos PDFs — disco local no MVP (docs/07-stack.md).
 *
 * A interface é propositalmente estreita (guardar/ler/localizar por chave) para
 * que a troca por um bucket S3-compatível na fase 2 seja a substituição desta
 * classe, sem tocar em quem a usa. Por isso o que fica gravado em
 * `receipts.pdf_url` é uma **chave relativa**, e não um caminho absoluto do host:
 * caminho absoluto quebra na primeira mudança de volume ou de máquina.
 */
@Injectable()
export class ReceiptStorageService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Chave estável e derivável: o mesmo comprovante sempre grava no mesmo lugar. */
  buildKey(companyId: string, receiptId: string): string {
    return `${companyId}/${receiptId}.pdf`;
  }

  async save(key: string, content: Buffer): Promise<string> {
    const destination = this.resolvePath(key);

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);

    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await readFile(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  private resolvePath(key: string): string {
    const base: string = this.config.get('RECEIPT_STORAGE_DIR', { infer: true });
    const root = isAbsolute(base) ? base : resolve(process.cwd(), base);
    const destination = resolve(join(root, key));

    // A chave é montada aqui a partir de UUIDs, nunca de entrada do usuário —
    // mas a conferência custa nada e impede que uma chave futura vinda de outro
    // caminho escreva fora do diretório de comprovantes.
    if (!destination.startsWith(root)) {
      throw new Error(`Chave de comprovante fora do diretório de armazenamento: ${key}`);
    }

    return destination;
  }
}
