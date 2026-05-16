# Fluxo Casa

Aplicativo financeiro doméstico, mobile-first e local-first, para registrar entradas e saídas de dinheiro de forma simples. A ideia principal é acompanhar o mês atual, ver o saldo livre projetado e manter os dados funcionando mesmo quando o dispositivo estiver offline.

## Estado Atual

- Interface em React + Vite + TypeScript.
- Dados locais no navegador com IndexedDB/Dexie.
- Sincronização automática depois de salvar um lançamento, ao abrir o app, ao voltar para a tela, ao reconectar e a cada 15 minutos.
- Backend para Vercel em `/api`, usando Vercel Blob como sync log JSON.
- Backend local opcional com Fastify + SQLite, útil para desenvolvimento.
- PWA com manifest e service worker para abrir pelo atalho quando instalado em uma origem segura.

## Como Funciona

O app salva primeiro no IndexedDB do próprio navegador. Quando existe conexão com o backend, ele envia as alterações locais e baixa as alterações remotas.

Na Vercel, cada sincronização grava um arquivo JSON privado no Vercel Blob:

```txt
households/<SYNC_HOUSEHOLD_ID>/sync-log/<timestamp>-<device>.json
```

O merge usa `updatedAt` mais recente por registro. Se um dispositivo tenta enviar alterações sem antes baixar mudanças remotas recentes, a API responde `409 Conflict`; nesse caso, o app aplica o que veio do servidor, mantém as mudanças locais pendentes e tenta sincronizar novamente depois.

## Deploy Na Vercel

Configuração recomendada no painel da Vercel:

```txt
Project Name: fluxo-casa
Application Preset: Other
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Crie ou conecte um Vercel Blob Store ao projeto e configure as variáveis de ambiente em Production e Preview:

```txt
BLOB_READ_WRITE_TOKEN=<token-gerado-pela-vercel-blob>
ACCESS_PIN=<seu-pin-sem-espacos>
SYNC_HOUSEHOLD_ID=fluxo-casa
```

`ACCESS_PIN` fica apenas no backend. O app pede esse PIN ao abrir, salva uma sessão local por 7 dias e usa o PIN para autorizar a sincronização. Use somente letras e números, sem espaços.

Depois de alterar `ACCESS_PIN`, faça um novo deploy para a API usar o valor atualizado.

## Uso Offline

Depois de aberto ou instalado pela URL HTTPS da Vercel, o app consegue carregar pelo atalho e gravar lançamentos no IndexedDB mesmo sem internet. Quando a conexão voltar, a sincronização envia o que ficou pendente.

Em HTTP local na rede doméstica, navegadores móveis podem bloquear service worker e instalação offline. Para PWA/offline confiável no celular, use HTTPS confiável, como a URL da Vercel.

## Desenvolvimento Local

Instale as dependências e rode o app:

```bash
npm install
npm run dev
```

Esse comando sobe:

- Vite em `http://localhost:5173`;
- API local em `http://localhost:3333`;
- SQLite local em `data/fluxo-casa.sqlite`.

O Vite faz proxy de `/api` para a API local durante o desenvolvimento.

Para testar o app buildado localmente:

```bash
npm run build
npm run serve:all
```

## Scripts

```bash
npm run dev
npm run build
npm run serve:app
npm run serve:all
npm run preview
npm test
```

## Dados Sensíveis

Não versione arquivos `.env`, tokens reais, banco SQLite local, logs ou builds. O repositório deve conter somente placeholders de configuração.

Arquivos ignorados:

- `.env*`;
- `data/`;
- `dist/`;
- `node_modules/`;
- `*.log`.
