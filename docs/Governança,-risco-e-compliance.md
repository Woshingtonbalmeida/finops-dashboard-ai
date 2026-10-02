# Governança, risco & compliance

Duas páginas — uma sobre disciplina de tags, outra sobre postura de segurança.

## Governança de tags

Rota: `/compliance`

Mede quantos recursos têm as 4 tags obrigatórias da política de governança: **`PRODUTO`, `CLIENTE`, `ENV`, `OWNER`**.

- **Compliance geral**: só conta como "em compliance" quando as 4 tags estão presentes ao mesmo tempo.
- **Cobertura por tag individual**: complementa o compliance geral mostrando o % que já tem cada tag aplicada, mesmo que ainda falte outra — assim dá pra ver progresso incremental, não só "tudo ou nada".
- A contagem considera só tag aplicada diretamente no recurso, não considera herança de tag do resource group.

## Segurança

Rota: `/security`

Postura de segurança via **Microsoft Defender for Cloud**, por subscription:

- **Secure Score** (nota geral de 0-100%).
- **Recomendações por severidade** (Alta/Média/Baixa) e principais achados de configuração pendentes.
- **Alertas de segurança ativos** dos últimos 30 dias.
- **Compliance regulatório** (ex: ISO 27001, PCI-DSS) — só disponível se a subscription estiver no plano Standard pago do Defender for Cloud; no plano gratuito, essa seção aparece como indisponível.
