# FinOps Dashboard — Guia do usuário

Painel de custos Azure para as subscriptions monitoradas deste ambiente.

**Acesso:** o endereço do dashboard do seu ambiente — login com conta Microsoft Entra ID. O acesso é restrito a quem está no grupo do Entra ID definido na implantação; se não conseguir entrar, peça pra ser incluído nesse grupo.

## Como o dashboard é organizado

O menu lateral segue os 5 domínios do [FinOps Framework](https://www.finops.org/framework/):

| Grupo no menu | O que cobre |
|---|---|
| **Resumo** | Panorama executivo e relatório semanal — visão de alto nível pra quem não quer entrar no detalhe |
| **Custos & alocação** | Quanto está sendo gasto e onde — por assinatura, resource group, tag e serviço |
| **Planejamento & controle** | Orçamentos, metas e alertas de anomalia — saber quando o gasto está saindo do esperado |
| **Otimização & economia** | Oportunidades de redução de custo — recomendações, recursos ociosos e workflow de exclusão |
| **Governança, risco & compliance** | Governança de tags e postura de segurança (Microsoft Defender for Cloud) |

Cada grupo tem sua própria página nesta wiki com o detalhe de cada tela.

## Como os dados chegam no dashboard

Todo dia, o Azure gera um export de custo (FOCUS 1.0) pra cada subscription, que cai num Storage Account. Um pipeline automático processa esse export e recalcula os dados agregados que o dashboard mostra. Isso significa duas coisas importantes:

- **Os números de custo têm defasagem de ~1 dia (D-1).** O que você vê hoje reflete o fechamento de ontem — o próprio Azure Cost Management leva até 24h pra consolidar o consumo do dia corrente. Isso não é uma limitação do dashboard, é como a Cost Management API do Azure funciona.
- **A maior parte dos dados só atualiza uma vez por dia**, normalmente entre 03h e 04h (horário de Brasília). Algumas páginas têm um botão **"Atualizar agora"** que busca o dado mais recente direto do Azure na hora, sem esperar esse ciclo — ver a página [Perguntas frequentes](Perguntas-frequentes) pra saber quais.

## Índice

- [Resumo](Resumo)
- [Custos & alocação](Custos-e-alocação)
- [Planejamento & controle](Planejamento-e-controle)
- [Otimização & economia](Otimização-e-economia)
- [Governança, risco & compliance](Governança,-risco-e-compliance)
- [Perguntas frequentes](Perguntas-frequentes)
