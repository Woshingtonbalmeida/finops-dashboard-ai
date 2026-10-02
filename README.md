# Observabilidade de IA — demo

Demonstração do painel de custo e consumo de tokens do Azure OpenAI (Foundry Models).
**Os dados são fictícios** (`app/src/demo/aiUsageDemo.ts`) e a aplicação é publicada sem
login: o build com `VITE_DEMO=true` não chama a API.

```bash
cd app && npm install
npm run dev:demo      # localhost com os dados fictícios
npm run build:demo    # build publicado (app/dist)
```

O deploy (`.github/workflows/deploy-demo.yml`) roda a cada push em `main` e publica
`app/dist` numa Azure Static Web App (plano Free). O token de deploy da SWA fica no secret
`AZURE_STATIC_WEB_APPS_API_TOKEN` do repositório.

Para ligar dados reais é preciso a API (`api/`), os exports FOCUS e autenticação: o
restante deste README descreve essa implantação completa.

---

# FinOps Dashboard — base para implantação por cliente

Dashboard de FinOps para Azure: custo, governança de tags, oportunidades de economia,
inventário de recursos e análise de variação mês a mês. Roda como Static Web App (React)
mais Function App (Node/TypeScript), lendo exports FOCUS do Cost Management.

Esta é a **base customizável**. Nenhum identificador de cliente está cravado no código:
tudo vem de configuração. Implantar para um cliente novo é preencher a configuração,
provisionar os recursos Azure e apontar o CI.

## Onde fica a configuração

Só dois arquivos. Se precisar escrever um ID de subscription, um tenant ou um domínio em
qualquer outro lugar, ele pertence a um destes:

| Arquivo | O que controla |
|---|---|
| `api/src/config/client.ts` | Subscriptions monitoradas, containers, tenant/client do Entra, export de custo, políticas de tag |
| `app/src/config/brand.ts` | Nome do produto, nome do cliente, logo, rótulos das subscriptions |

Ambos leem variáveis de ambiente, então o mesmo código serve para dev e produção sem
rebuild manual.

## App settings da Function App

| Setting | Obrigatória | Exemplo |
|---|---|---|
| `MONITORED_SUBSCRIPTIONS` | sim | `contoso:0000...,fabrikam:1111...` |
| `AAD_TENANT_ID` | sim | `00000000-0000-0000-0000-000000000000` |
| `AAD_CLIENT_ID` | sim | ID do App Registration |
| `AAD_APP_ID_URI` | não | `api://finops.cliente.com.br` |
| `COST_EXPORT_NAME` | não | padrão `finops-export-daily` |
| `TAG_POLICY_INITIATIVES` | não | `<subId>=<policySetDefinitionId>;...` |
| `GOVERNED_TAG_KEYS` | não | padrão `OWNER,ENV,PRODUTO,CLIENTE` |
| `DATA_STORAGE_ACCOUNT_NAME` | sim | conta de storage dos exports |

O formato de `MONITORED_SUBSCRIPTIONS` é `<slug>:<subscriptionId>`, separado por vírgula.
O slug vira o nome do container de exports (`contoso` → `exports-contoso`) e é usado para
registrar um blob trigger por subscription. **Escolha o slug no onboarding e não mude
depois** — trocar abandona o container anterior.

## Variáveis do build do frontend

Definidas como *repository variables* no GitHub (não são segredo):

`PRODUCT_NAME`, `CLIENT_NAME`, `LOGO_PATH`, `LOGO_ALT`, `SUBSCRIPTION_LABELS`,
`FUNCTION_APP_BASE_URL`, `FUNCTION_APP_NAME`, `FUNCTION_APP_RESOURCE_GROUP`.

A logo é `app/public/client-logo.png`. Substitua o arquivo mantendo o nome, ou aponte
`LOGO_PATH` para outro.

## Segredos do GitHub Actions

| Segredo | Para quê |
|---|---|
| `AZURE_CLIENT_ID` | Login OIDC no Azure |
| `AZURE_TENANT_ID` | Login OIDC e substituição do issuer no `staticwebapp.config.json` |
| `AZURE_SUBSCRIPTION_ID` | Login OIDC |
| `SWA_DEPLOYMENT_TOKEN` | Deploy da Static Web App |

### Autenticação do CI

O workflow usa OIDC com credencial federada, sem client secret guardado no GitHub. Antes
da primeira execução, crie a credencial federada no App Registration usada pelo CI e dê à
identidade permissão de deploy na subscription (Contributor, ou algo mais restrito).

Três detalhes que fazem a diferença entre funcionar e não funcionar:

**O subject precisa ser idêntico ao que o token apresenta.** O job de deploy declara
`environment: production`, então o GitHub emite `...:environment:production`, e **não**
`...:ref:refs/heads/main`. Se o repositório usar identificadores imutáveis do OIDC
(Settings → Actions → OIDC), o subject ainda carrega os IDs numéricos do usuário e do
repositório. Não adivinhe o formato: dispare o deploy uma vez e leia o subject exato na
linha `subject claim` do log do `azure/login`.

**O job precisa pedir a permissão.** O GitHub só emite o token federado para um job que
declara `permissions: id-token: write`. Sem isso o login falha com *"Unable to get
ACTIONS_ID_TOKEN_REQUEST_URL"*. Já está no `deploy.yml`, no job da API.

**O `npm ci` só vale para a API.** O frontend usa `npm install` de propósito: `rolldown` e
`oxlint` têm fallbacks WASM por plataforma, e um lock gerado no Windows nunca satisfaz
`npm ci` no runner Linux (`@emnapi/core` e `@emnapi/runtime` só sobem ao topo no Linux).

## App Registration do login do dashboard

Separado do App Registration do CI, e por um motivo concreto: a Static Web App precisa de
um **client secret** para o Easy Auth. A identidade de CI não tem secret nenhum, e colocar
um nela significaria que vazar o secret do dashboard dá poder de deploy na Azure.

| O quê | Valor |
|---|---|
| Supported account types | **Single tenant** (`AzureADMyOrg`) |
| Redirect URI (Web) | `https://<hostname>/.auth/login/aad/callback` |
| API permissions | Microsoft Graph → `User.Read` (delegada), com admin consent |
| Client secret | vai na app setting `AAD_CLIENT_SECRET` da SWA |

**Habilite ID tokens.** Authentication → *Implicit grant and hybrid flows* → marque
**ID tokens**. A Static Web App usa fluxo híbrido (`response_type=code+id_token`); sem essa
caixa o login falha com `AADSTS700054` **antes mesmo de perguntar qual conta usar** — a tela
simplesmente não avança. Criando o app pelo portal, essa caixa vem desmarcada.

**Um redirect URI por hostname.** Ao adicionar domínio customizado, registre o callback do
domínio novo também, ou o retorno falha com `AADSTS50011`. Vale manter o hostname
`*.azurestaticapps.net` na lista: é o que a SWA sempre responde, útil se o DNS falhar.

Para diagnosticar qualquer falha de login, vá em **Entra ID → Sign-in logs** e filtre pela
aplicação. O código `AADSTS` diz exatamente o que aconteceu — muito melhor do que deduzir
pela tela.

## Registro das funções

`api/src/index.ts` é o `main` do pacote, e o host do Functions registra **apenas** o que
esse arquivo importa. Uma função nova sem import ali nunca roda.

Pior: um import apontando para um módulo que não existe mais compila limpo — o `tsc` não
acusa import só de efeito colateral — e derruba **todas** as funções em runtime, não só a
que falta. O sintoma é o Function App reportando 0 funções com deploy verde.

`npm run build` roda `scripts/check-function-registry.js`, que falha o build quando
`index.ts` e `src/functions/` divergem. Não remova essa verificação.

## Recursos Azure necessários

- **Static Web App** — SKU **Standard**. O bloco `auth` customizado do
  `staticwebapp.config.json` não funciona no Free.
- **Function App** Linux, Node 20, identidade gerenciada (system-assigned).
- **Linked backend** ligando a Static Web App à Function App. Sem isso, `/api/*` não chega
  na API mesmo com o usuário autenticado. Não é criado pelo pipeline.
- **Storage Account** com os containers `curated` e um `exports-<slug>` por subscription.
- **Export do Cost Management** em cada subscription monitorada, no formato FOCUS,
  gravando no container correspondente.

### Permissões da identidade gerenciada

Dois planos, e é fácil esquecer o segundo:

- **ARM**, em cada subscription monitorada: `Reader`, `Cost Management Reader`,
  `Cost Management Contributor`, `Security Reader`.
- **Dados**, na Storage Account: `Storage Blob Data Contributor`.

As roles ARM não dão acesso a blob. O código usa `DefaultAzureCredential` para ler e
escrever no storage, então a role de dados é obrigatória.

## Desenvolvimento local

```bash
cd api && npm ci && npm run build
cd ../app && npm ci && npm run dev
```

O frontend sozinho sobe sem backend, mas as páginas ficam em "aguardando dados". Para
trabalhar com dados reais sem depender do Azure, sirva respostas de `/api/*` a partir de
arquivos locais no `vite.config.ts` — e reverta antes de commitar.

## Avisos herdados

- Node 20 chegou ao fim do suporte em 30/04/2026. Migrar para uma versão suportada é
  trabalho pendente nos dois ambientes.
- O timer `triggerExportRuns` dispara os exports de custo das subscriptions configuradas.
  **Se houver mais de um ambiente apontando para as mesmas subscriptions, desabilite esse
  timer em todos menos um** — dois disparos no mesmo minuto criam duas execuções do export
  com o mesmo `runTimestamp`, e o custo é contado em dobro.
