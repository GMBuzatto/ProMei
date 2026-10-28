import { describe, expect, it } from 'vitest';
import {
  GLOBAL_MODELS,
  TENANT_SCOPED_MODELS,
  applyTenantScope,
  isUniqueOnlyOperation,
  matchesTenant,
  shouldScope,
} from '../../src/shared/tenant/tenant.extension';

const COMPANY = 'company-a';

describe('escopo de tenant (ADR-0003)', () => {
  describe('quais models sofrem escopo', () => {
    it('escopa os models de negócio', () => {
      expect(shouldScope('Item')).toBe(true);
      expect(shouldScope('StockMovement')).toBe(true);
      expect(shouldScope('User')).toBe(true);
    });

    it('não escopa models globais da plataforma', () => {
      expect(shouldScope('Permission')).toBe(false);
      expect(shouldScope('Plan')).toBe(false);
    });

    it('não escopa model desconhecido — e portanto novo model precisa ser declarado', () => {
      expect(shouldScope('ModeloQueAlguemAdicionouSemPensar')).toBe(false);
    });

    it('não há model listado nas duas categorias ao mesmo tempo', () => {
      const intersection = [...TENANT_SCOPED_MODELS].filter((model) => GLOBAL_MODELS.has(model));
      expect(intersection).toEqual([]);
    });
  });

  describe('leitura', () => {
    it('combina o where original com o escopo via AND', () => {
      const { args } = applyTenantScope('Item', 'findMany', { where: { name: 'x' } }, COMPANY);
      expect(args.where).toEqual({ AND: [{ name: 'x' }, { companyId: COMPANY }] });
    });

    it('injeta companyId mesmo quando não havia where', () => {
      const { args } = applyTenantScope('Item', 'findMany', {}, COMPANY);
      expect(args.where).toEqual({ companyId: COMPANY });
    });

    it('pedir outra empresa vira condição impossível — devolve vazio, não dados alheios', () => {
      const { args } = applyTenantScope(
        'Item',
        'findMany',
        { where: { companyId: 'company-b' } },
        COMPANY,
      );

      // companyId = B AND companyId = A nunca é satisfeito.
      expect(args.where).toEqual({
        AND: [{ companyId: 'company-b' }, { companyId: COMPANY }],
      });
    });

    it('escopa count e aggregate', () => {
      expect(applyTenantScope('Item', 'count', {}, COMPANY).args.where).toEqual({
        companyId: COMPANY,
      });
      expect(applyTenantScope('Item', 'aggregate', {}, COMPANY).args.where).toEqual({
        companyId: COMPANY,
      });
    });

    it('usa id como campo de escopo em Company', () => {
      const { args } = applyTenantScope('Company', 'findMany', {}, COMPANY);
      expect(args.where).toEqual({ id: COMPANY });
    });
  });

  describe('findUnique', () => {
    it('é tratado por filtragem do resultado, não pelo where', () => {
      expect(isUniqueOnlyOperation('findUnique')).toBe(true);
      expect(isUniqueOnlyOperation('findUniqueOrThrow')).toBe(true);
      expect(isUniqueOnlyOperation('findFirst')).toBe(false);

      const { args } = applyTenantScope('Item', 'findUnique', { where: { id: 'x' } }, COMPANY);
      expect(args.where).toEqual({ id: 'x' });
    });

    it('aceita registro da própria empresa', () => {
      expect(matchesTenant('Item', { id: 'i1', companyId: COMPANY }, COMPANY)).toBe(true);
    });

    it('rejeita registro de outra empresa', () => {
      expect(matchesTenant('Item', { id: 'i1', companyId: 'company-b' }, COMPANY)).toBe(false);
    });

    it('rejeita registro sem companyId quando o escopo é exigido', () => {
      expect(matchesTenant('Item', { id: 'i1' }, COMPANY)).toBe(false);
    });

    it('não quebra com resultado nulo', () => {
      expect(matchesTenant('Item', null, COMPANY)).toBe(true);
    });
  });

  describe('escrita', () => {
    it('injeta companyId no create', () => {
      const { args } = applyTenantScope('Item', 'create', { data: { name: 'x' } }, COMPANY);
      expect(args.data).toEqual({ name: 'x', companyId: COMPANY });
    });

    it('injeta companyId em cada item do createMany', () => {
      const { args } = applyTenantScope(
        'Item',
        'createMany',
        { data: [{ name: 'a' }, { name: 'b' }] },
        COMPANY,
      );
      expect(args.data).toEqual([
        { name: 'a', companyId: COMPANY },
        { name: 'b', companyId: COMPANY },
      ]);
    });

    it('update/delete singulares usam spread — WhereUniqueInput nao aceita AND', () => {
      expect(
        applyTenantScope('Item', 'update', { where: { id: 'i1' } }, COMPANY).args.where,
      ).toEqual({ id: 'i1', companyId: COMPANY });
      expect(
        applyTenantScope('Item', 'delete', { where: { id: 'i1' } }, COMPANY).args.where,
      ).toEqual({ id: 'i1', companyId: COMPANY });
      expect(applyTenantScope('Item', 'deleteMany', { where: {} }, COMPANY).args.where).toEqual({
        companyId: COMPANY,
      });
    });

    it('upsert recebe escopo só no create — o where dele exige campo único', () => {
      const { args } = applyTenantScope(
        'Item',
        'upsert',
        {
          where: { companyId_sku: { companyId: COMPANY, sku: 'S1' } },
          create: { name: 'x' },
          update: {},
        },
        COMPANY,
      );

      expect(args.create).toEqual({ name: 'x', companyId: COMPANY });
      // where intacto: cabe a quem chama usar a chave composta com a empresa.
      expect(args.where).toEqual({ companyId_sku: { companyId: COMPANY, sku: 'S1' } });
    });
  });
});
