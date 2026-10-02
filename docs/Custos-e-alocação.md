# Custos & alocação

Cinco páginas pra fatiar o gasto do mês corrente de diferentes ângulos. Todas usam o mesmo dado base (o export FOCUS diário), então os números batem entre si.

## Visão geral de custos

Rota: `/` (página inicial)

- KPIs: gasto no mês (MTD), mês anterior, variação percentual, e quantas subscriptions estão sendo monitoradas.
- Gráfico de tendência de custo diário dos últimos 60 dias.
- Ranking de custo por subscription e top serviços do mês atual.
- Mostra "Dados atualizados em: [data/hora]" no topo, com um botão **Atualizar** que força buscar o dado mais recente já calculado (não dispara um recálculo novo no Azure — só evita esperar o polling automático de 5 minutos).

## Custos por assinatura

Rota: `/subscriptions`

Ranking e detalhamento (Actual cost + Forecast + % do total) por subscription. O Forecast projeta o fechamento do mês (dias já fechados + estimativa dos dias restantes), igual ao Cost Management do portal. O "% do total" usa só o Actual cost, não o Forecast.

## Custos por grupo de recursos

Rota: `/resource-groups`

Top 15 resource groups em gráfico, com filtro por subscription e detalhamento completo em tabela. O resource group é extraído direto do `ResourceId` de cada linha do export FOCUS.

## Custos por tags

Rota: `/tags`

Agrega custo pelas tags aplicadas nos recursos. Por padrão mostra as tags de governança da empresa primeiro (`PRODUTO`, `CLIENTE`, `ENV`, `OWNER`), mas dá pra trocar pra qualquer outra tag key que apareça nos recursos. Um recurso sem a tag selecionada simplesmente não aparece na lista — não conta como "custo zero", só não é agregado ali.

## Maiores geradores de custo

Rota: `/services`

Top 15 serviços em gráfico (ex: Virtual Machines, Azure SQL Database), com filtro por subscription, e uma tabela completa com **Forecast** e **Target/mês editável** por serviço:

- Você define uma meta mensal pra qualquer serviço (por subscription, ou uma meta consolidada em "Todas as subscriptions").
- Quando o Forecast passa da meta, a linha fica destacada em vermelho; quando fica dentro, em verde.
- As metas ficam salvas e reaparecem toda vez que você volta na página — não precisa redefinir.
- Esse é o mesmo dado usado pelo status geral do [Relatório executivo semanal](Resumo).
