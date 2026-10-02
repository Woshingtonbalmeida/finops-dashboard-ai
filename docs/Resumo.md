# Resumo

Duas páginas de visão de alto nível — pra quando você quer o panorama sem entrar em cada detalhe.

## Resumo executivo

Rota: `/executive-summary`

Painel único com os números que mais importam pra uma leitura rápida do estado atual:

- **Gasto no mês (Actual cost)** com variação vs. mês anterior, e um gráfico de tendência dos últimos 60 dias.
- **Forecast do mês** — projeção de fechamento (dias já fechados + estimativa dos dias restantes), a mesma lógica do Cost Management do portal Azure — com o gasto atual por subscription ao lado.
- **KPIs de oportunidade**: economia potencial identificada pelo Advisor, desperdício em recursos órfãos, valor comprometido em Reserved Instances (recorrente/mês), e quantas subscriptions estão sendo monitoradas.
- **Consumo dos últimos 3 meses por subscription** — gráfico de barras comparando as subscriptions monitoradas mês a mês.
- **Top 3 oportunidades de economia** — as três recomendações do Advisor com maior economia anual estimada.

Esta página é só leitura — nenhuma ação é tomada por aqui.

## Relatório executivo semanal

Rota: `/weekly-report`

Pensado pra responder três perguntas específicas: *quanto gastamos essa semana, o que mudou, e quais ações a gente tomou (e o resultado delas)*. É a página certa pra levar pra reunião de diretoria ou pra revisão semanal do time.

- **Cabeçalho**: período coberto, escopo (as duas subscriptions), moeda, quando os dados foram atualizados, e um **status por subscription** vs. o orçamento configurado (ver [Orçamentos & alertas](Planejamento-e-controle)) — cada subscription aparece com seu próprio selo colorido, em vez de uma média que esconderia se só uma delas estourou.
- **KPIs**: custo dos últimos 7 dias (com variação vs. semana anterior), custo acumulado no mês, previsão de fechamento, e economia validada nesta semana.
- **"O que mudou nos últimos 7 dias"**: uma cascata estilo waterfall — custo da semana anterior, os serviços que mais subiram, os que mais caíram, e o custo da semana atual. Isso já é calculado automaticamente a partir do mesmo export de custo diário, sem nenhuma ação manual.
- **"Ações realizadas nesta semana"**: combina duas fontes de ação real — mudanças de status na página [Candidatos à exclusão](Otimização-e-economia) (quando um recurso vira "Excluir", o custo mensal dele naquele momento entra como economia validada) e clusters [AKS parados](Otimização-e-economia)/retomados (mostra o custo residual do cluster no momento da mudança, mas **não** conta como economia validada — porque o valor real da economia de parar um AKS já aparece sozinho na cascata de custo acima, quando o gasto de compute cai).
- **"Principais oportunidades pendentes"**: top 5 da [Visão geral de oportunidades](Otimização-e-economia).

**Importante:** os números de custo (cascata, KPIs) sempre têm a defasagem D-1 explicada na página inicial desta wiki. Já a tabela de "Ações realizadas" aparece em tempo real, assim que alguém muda um status ou para/retoma um AKS.
