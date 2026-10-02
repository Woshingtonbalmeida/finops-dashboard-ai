# Perguntas frequentes

## Por que os números de custo parecem "atrasados" em um dia?

Isso é o **D-1**: os valores de custo refletem o fechamento do dia anterior, não o consumo de hoje. O próprio Azure Cost Management leva até 24h pra consolidar o uso do dia corrente — não é uma limitação do dashboard, é assim que a API de custo do Azure funciona. O [Relatório executivo semanal](Resumo) deixa isso explícito no cabeçalho.

## Quais páginas atualizam sozinhas, e com que frequência?

A maior parte dos dados é recalculada **uma vez por dia**, entre ~03h e ~04h (horário de Brasília), depois que o export diário de custo do Azure chega. Enquanto você está com a página aberta, alguns dados também fazem um polling leve em segundo plano (a cada 5-30 minutos, dependendo da página) — isso só busca o que já foi calculado, não força um recálculo novo.

## O que é o botão "Atualizar" vs. "Atualizar agora"?

São coisas diferentes:

- **"Atualizar"** (ex: na [Visão geral de custos](Custos-e-alocação)): só força buscar de novo o dado que já foi calculado, sem esperar o polling automático. Rápido, sem custo.
- **"Atualizar agora"** (ex: em [Orçamentos & alertas](Planejamento-e-controle) e [AKS parados](Otimização-e-economia)): dispara uma chamada real na API do Azure na hora do clique, recalculando o dado do zero. Existe especificamente nessas duas páginas porque elas dependem de dados que o Azure não deixa "forçar" de outra forma (budgets recém-criados, estado de power do AKS) — sem esse botão, uma mudança feita no Azure só apareceria no dashboard no ciclo automático do dia seguinte.

## Por que um budget que acabei de criar mostra R$ 0,00 de gasto?

A API de Budgets do próprio Azure demora alguns dias pra popular o campo de gasto (`currentSpend`) depois que um budget é criado — isso é do Azure, não do dashboard. A página de [Orçamentos & alertas](Planejamento-e-controle) já contorna isso usando o custo real que o dashboard calcula a partir do export FOCUS, mostrando uma nota quando os dois valores divergem.

## Parei um cluster AKS, mas o custo residual dele não é R$ 0,00. Por quê?

Parar o AKS (`az aks stop`) desaloca os nós (compute vai a zero), mas o **control plane continua cobrando se a subscription usa o tier Standard ou Premium**. Só o tier Free tem control plane gratuito. Ver [AKS parados](Otimização-e-economia).

## O dropdown de status em Candidatos à exclusão diz "Excluir", mas eu esperava "Excluído". Qual a diferença?

É só o texto exibido — "Excluir" descreve a ação que você está escolhendo (mais claro no momento de decidir). Por trás dos panos, o valor salvo continua sendo "Excluído" (o estado resultante), o que mantém o histórico e o cálculo de economia validada do [Relatório executivo semanal](Resumo) consistentes.

## Não consigo fazer login / não tenho acesso.

O acesso é restrito a um grupo do Entra ID definido na implantação. Peça pra alguém com permissão te incluir nesse grupo — depois de incluído, o acesso passa a funcionar no próximo login (não precisa esperar nenhum ciclo de sincronização).

## Os valores em USD dos Advisor/Reservations aparecem em BRL. Como é feita a conversão?

Advisor e Reserved Instances/Savings Plans nativamente reportam valores em USD. O dashboard converte pra BRL usando a cotação implícita nas próprias faturas (a razão entre o valor cobrado em BRL e o valor original em USD), não uma cotação de mercado em tempo real.
