import { Controller, Get, Header, Ip, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import { ReceiptsService, type ReceiptSummary } from './receipts.service';

/**
 * Comprovantes de saída (RF-33). Rota de tenant: comprovante pertence a uma
 * empresa, e a numeração é sequencial dentro dela (RN-24).
 *
 * Não existe POST de criação: comprovante nasce da saída de estoque, nunca
 * avulso — criar um número solto abriria buraco na sequência.
 */
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get(':id')
  @RequirePermission('receipts:read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReceiptSummary> {
    return this.receiptsService.findOne(id, user.company_id as string);
  }

  /**
   * PDF para impressão/download. Gera na hora se ainda estiver pendente, então
   * responde o documento mesmo quando a geração assíncrona falhou.
   */
  @Get(':id/pdf')
  @RequirePermission('receipts:read')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const { content, filename } = await this.receiptsService.getPdfFile(
      id,
      user.company_id as string,
    );

    void reply.header('Content-Disposition', `inline; filename="${filename}"`);

    return content;
  }

  /**
   * Regeneração explícita do PDF, mantendo o número (aceite do épico).
   *
   * `receipts:update` e não `receipts:create`: nada é criado — o comprovante e
   * seu número já existem, o que muda é o arquivo.
   */
  @Post(':id/regenerate')
  @RequirePermission('receipts:update')
  regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<ReceiptSummary> {
    return this.receiptsService.regenerate(id, user.company_id as string, user.sub, ip);
  }
}
