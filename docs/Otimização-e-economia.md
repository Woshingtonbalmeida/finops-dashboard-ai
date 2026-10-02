# Otimização & economia

Oito páginas cobrindo oportunidades de redução de custo — de recomendações prontas do Azure até um workflow próprio pra rastrear exclusões e recursos parados.

## Visão geral de oportunidades

Rota: `/opportunities`

Consolida **todas** as fontes de oportunidade num lugar só: Advisor, recursos órfãos, VMs paradas e Candidatos à exclusão — filtrável por fonte, com economia potencial por mês e gráfico de economia por fonte. O [Resumo executivo](Resumo) mostra só o top 3; aqui dá pra ver a lista inteira.

**Reserved Instances e Savings Plans não entram aqui** — são compromissos já contratados, não oportunidades de economia (têm suas próprias páginas abaixo). A economia do Advisor é anualizada dividida por 12 pra ficar comparável com o custo mensal real dos outros itens.

## Recomendações do Advisor

Rota: `/advisor`

Recomendações de custo do Azure Advisor com economia estimada, agrupadas por tipo — o mesmo conteúdo do portal Azure, só que centralizado pras duas subscriptions. Só entram recomendações com economia quantificada (muita recomendação do Advisor, tipo confiabilidade/monitoramento, não tem valor de economia associado e fica de fora). Valores convertidos de USD pra BRL usando a cotação implícita das faturas de Reserved Instances.

## Instâncias reservadas

Rota: `/reservations`

Reservas de capacidade ativas na billing account (compromisso já contratado, não oportunidade). Mostra compromisso mensal recorrente, valor total do contrato (termo completo, ex: os 3 anos inteiros), plano de cobrança e data de expiração.

## Planos de economia

Rota: `/savings-plans`

Savings Plans contratados na billing account — nome, termo, compromisso por hora e status.

## Recursos órfãos

Rota: `/orphaned-resources`

Discos gerenciados, IPs públicos e interfaces de rede que não estão conectados a nada, mas continuam gerando custo. Detectados via Azure Resource Graph (discos sem VM associada, IPs sem configuração, NICs sem VM ou private endpoint), com custo real do mês cruzado por `ResourceId`.

## VMs paradas

Rota: `/stopped-vms`

Máquinas virtuais desligadas — dois estados possíveis:

- **Deallocated**: não cobra compute, mas discos e IPs anexados continuam sendo cobrados.
- **Stopped** (sem desalocar): ainda cobra compute normalmente — vale a pena desligar/desalocar de verdade.

## AKS parados

Rota: `/stopped-aks`

Clusters AKS parados via `az aks stop` — os nós já não custam compute (ficam deallocated), mas o cluster continua existindo, e o **control plane no tier Standard/Premium continua sendo cobrado** mesmo com todos os nós parados (tier Free não cobra control plane). Essa é a informação que essa página existe pra expor: parar o AKS nem sempre zera o custo.

- Detectado direto pelo campo `powerState` do próprio cluster (o mesmo que `az aks stop` seta) — não precisa inferir pelo estado das VMs.
- Botão **"Atualizar agora"** força buscar o estado real no Azure na hora, sem esperar o ciclo diário (~03h56 BRT).
- Toda mudança de estado (parou / retomou) fica registrada num histórico, que alimenta a tabela "Ações realizadas" do [Relatório executivo semanal](Resumo).

## Candidatos à exclusão

Rota: `/marked-for-deletion`

O workflow de rastreamento de recursos marcados pra exclusão — detectados pela tag **`AÇÃO=DELETAR`** aplicada diretamente no recurso. **Nenhuma ação de exclusão é feita por aqui, é só acompanhamento** — a exclusão de verdade ainda é manual, no portal do Azure.

- **Status do workflow**: Identificado → Em análise → Aprovado → Agendado → Parado → Excluir. Cada recurso tem um dropdown de status; a última opção aparece como "Excluir" (é a ação que você está tomando), mas fica salva internamente como "Excluído" (o estado resultante).
- **Busca**: filtra por nome do recurso, resource group, dono ou produto, com os grupos correspondentes já expandidos automaticamente.
- **Coluna de status por resource group**: mesmo com o grupo fechado, dá pra ver a mistura de status dos recursos dele (bolinhas coloridas + contagem, com tooltip do detalhe ao passar o mouse).
- **Aplicar a todos**: dropdown na linha do resource group pra definir o mesmo status pra **todos** os recursos daquele grupo de uma vez, com confirmação antes de aplicar — evita ter que clicar recurso por recurso.
- Quando um recurso vira "Excluir", o custo mensal dele naquele momento fica registrado no histórico como economia validada, mesmo depois que o recurso for realmente apagado do Azure e sumir da lista.
