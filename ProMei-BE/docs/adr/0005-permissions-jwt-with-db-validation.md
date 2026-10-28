# ADR-0005: Permissões no JWT com Validação em Banco de Dados

**Data:** 2026-08-19  
**Status:** Aceito  
**Decisores:** xlag5, Design Review (Sonnet)

## Contexto

O frontend precisa exibir controles de UI baseados em permissões sem fazer chamadas extras de API para buscar permissões do usuário. A decodificação do JWT já acontece no lado do cliente, então incluir permissões diretamente no token é eficiente.

Porém, ProMei tem um requisito rigoroso (**RF-13**): toda rota deve validar permissões, e mudanças de permissão devem ser efetivas imediatamente quando uma permissão é revogada.

Adicionar permissões ao JWT cria uma **janela de revogação** igual a `JWT_ACCESS_TTL` (15 minutos):
- Se o guard confiar no JWT cegamente, uma permissão revogada levará até 15 minutos para surtir efeito
- Isso viola o princípio "validar a cada request" e pode criar brechas de segurança

## Decisão

**Adicionar array `permissions[]` ao payload do JWT para eficiência do frontend, mas manter o guard backend como autoridade do banco de dados.**

O guard irá:
1. Extrair permissões do token (para UI do frontend)
2. Sempre validar contra o banco de dados a cada request (por segurança)
3. Se permissão estiver ausente no BD mas presente no token → rejeitar (permissão foi revogada)

## Consequências

### Positivas
✅ Frontend decodifica JWT uma vez, usa permissões localmente para decisões de UI (sem chamadas extras)  
✅ Revogação de permissão é imediata (guard valida contra BD a cada request)  
✅ Sem janela de segurança — permissões revogadas têm efeito instantaneamente  
✅ Alinhado com requisito RF-13

### Negativas
❌ Guard faz uma query extra de banco de dados por request (trade-off aceitável por segurança)  
❌ Latência ligeiramente aumentada vs. confiar cegamente no token  
❌ Payload do JWT um pouco maior (array de permissões adicionado)

## Alternativas Consideradas

### Opção B: Confiar 100% no JWT (Rejeitada)
- Guard usa apenas permissões do JWT, sem consulta ao BD
- Pros: Stateless, máxima eficiência
- Contras: Revogação de permissão atrasada em 15 minutos, viola RF-13
- **Decisão:** Rejeitada por requisitos de segurança

### Opção C: Token Mínimo, Lookup Completo em BD (Rejeitada)
- Não incluir permissões no JWT
- Contras: Frontend deve buscar permissões via chamada API, derrota o propósito
- **Decisão:** Rejeitada, menos eficiente que Opção A

## Detalhes de Implementação

1. **Payload do JWT** — Adicionar `permissions?: string[]` a `AuthenticatedUser`
   - Formato: `"resource:action"` (ex: `["items:create", "inventory:read"]`)

2. **Geração de Token** — No login/refresh:
   - Buscar roles do usuário (existente)
   - Buscar permissões dessas roles (nova query)
   - Incluir array de permissões no JWT

3. **Validação do Guard** — Em `JwtAuthGuard`:
   - Extrair permissões do token (para frontend)
   - Sempre consultar BD para verificar permissões atuais do usuário
   - Comparar permissões do token com BD
   - Se houver diferença (permissão revogada) → rejeitar

4. **Uso no Frontend** — Lado do cliente:
   - Decodificar JWT uma vez
   - Usar `user.permissions` para visibilidade da UI
   - Backend garante que permissões sejam sempre validadas server-side

## Requisitos Relacionados
- RF-13: Toda rota valida permissão; toda query é filtrada por tenant
- RN-01: Permissões são aplicadas via formato `resource:action`
- RF-12: Papéis suportam permissões customizáveis por recurso e ação

## Referências
- docs/03-requisitos.md (RF-13, RF-12)
- docs/04-regras-de-negocio.md (RN-01)
- docs/09-seguranca.md (Autorização dupla)
