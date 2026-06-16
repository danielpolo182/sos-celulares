---
name: feedback_nunca_remover_funcoes
description: Nunca remover funcionalidades do código sem o usuário pedir explicitamente
metadata:
  type: feedback
---

Nunca remover campos, funções, lógica ou funcionalidades do código. Sempre adicionar ou ajustar.

**Why:** O usuário quer preservar todas as funcionalidades existentes. Se algo está quebrando por falta de uma coluna no banco, a solução correta é adicionar a coluna, não remover o campo do código.

**How to apply:** Quando um campo não existe no banco mas o código o usa, adicionar a coluna no banco via SQL. Só remover código se o usuário pedir explicitamente.
