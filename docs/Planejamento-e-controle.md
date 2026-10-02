# Planejamento & controle

Duas páginas pra acompanhar se o gasto está dentro do esperado, e ser avisado quando não está.

## Orçamentos & alertas

Rota: `/budgets`

Mostra o consumo vs. o orçamento configurado no Azure Budgets (Cost Management + Billing → Budgets), um medidor por budget/subscription:

- **Verde/Amarelo/Vermelho** conforme o % consumido do orçamento.
- O gasto exibido usa o custo MTD que o próprio dashboard já calcula a partir do export FOCUS — não o `currentSpend` que a API de Budgets do Azure devolve, porque esse valor demora dias pra ser populado depois que um budget é criado (às vezes fica em R$ 0,00 por um bom tempo). Se os dois valores divergirem, uma nota explica a diferença.
- Botão **"Atualizar agora"**: diferente do botão "Atualizar" de outras páginas, este de fato busca os budgets direto na API do Azure na hora do clique, sem precisar esperar o ciclo automático diário (~03h BRT). Útil logo depois de criar ou editar um budget no portal.
- Se nenhum budget estiver configurado pra uma subscription, aparece a mensagem "Nenhum budget configurado ainda" — crie um em Cost Management + Billing → Budgets no portal do Azure.

## Anomalias de custo

Rota: `/anomalies`

Detecta dias em que um serviço gastou bem mais que o normal, comparando com a média móvel dos 7 dias anteriores do mesmo serviço/subscription:

- Só entra na lista quando o desvio passa de **50% E R$ 100 ao mesmo tempo** — os dois critérios juntos, pra evitar ruído de serviços pequenos que naturalmente variam bastante em termos percentuais.
- "Novo" aparece quando o serviço não tinha custo nenhum nos 7 dias anteriores (não dá pra calcular desvio percentual de zero).
- Olha os últimos ~23 dias. Calculado a partir do mesmo export FOCUS diário já usado no resto do dashboard, sem chamada extra ao Azure — atualiza no mesmo ciclo diário de todo o resto.
