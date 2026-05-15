# Fluxo Casa

App financeiro domestico mobile-first e local-first. Voce lanca entradas e saidas com titulo livre, valor, data e recorrencia mensal opcional.

## Rodar em desenvolvimento

```bash
npm install
npm run dev
```

- App dev: `http://localhost:5173`
- API local: `http://localhost:3333`
- SQLite: `data/fluxo-casa.sqlite`

Na rede local:

```txt
http://DESKTOP-H55EU4J:5173
http://DESKTOP-H55EU4J.local:5173
```

## Rodar como app buildado

```bash
npm run build
npm run serve:all
```

O `serve:all` roda a API SQLite e o app buildado.

## Offline no celular

O app salva dados no IndexedDB e tem service worker para abrir pelo atalho quando instalado como PWA.

Mas em celular isso exige origem segura. Em termos praticos:

- `http://DESKTOP-H55EU4J:5173` serve para testar na rede.
- Para abrir sem Wi-Fi/4G pelo atalho, o app precisa ser instalado via HTTPS confiavel.
- Com HTTP comum na rede local, o navegador pode bloquear o service worker/offline, mesmo que o codigo esteja correto.

O servidor do app aceita HTTPS se voce passar certificado e chave:

```bash
$env:APP_HTTPS_CERT="C:\caminho\cert.pem"
$env:APP_HTTPS_KEY="C:\caminho\key.pem"
npm run serve:app
```

Esse certificado precisa ser confiavel no celular. Sem isso, o navegador pode recusar instalar ou abrir offline.

## Deploy na Vercel

Este projeto esta pronto para Vercel:

- frontend Vite publicado como app estatico;
- `/api/status` para verificar o backend remoto;
- `/api/sync` como sync log em JSON;
- Vercel Blob como armazenamento dos logs.

O SQLite local nao e usado na Vercel. Ele continua existindo apenas para desenvolvimento/local.

### Variaveis de ambiente

Configure na Vercel:

```txt
BLOB_READ_WRITE_TOKEN=token do Vercel Blob
SYNC_TOKEN=um segredo seu
VITE_SYNC_TOKEN=o mesmo valor de SYNC_TOKEN
SYNC_HOUSEHOLD_ID=fluxo-casa
```

`SYNC_TOKEN` e `VITE_SYNC_TOKEN` precisam ser iguais. O valor fica embutido no app, entao ele nao e um segredo forte contra alguem com acesso ao app publicado; para uso domestico e suficiente. Se quiser autenticação real depois, a API precisa ganhar login.

### Como o sync log funciona

Cada sincronizacao grava um JSON privado no Vercel Blob:

```txt
households/<SYNC_HOUSEHOLD_ID>/sync-log/<timestamp>-<device>.json
```

Cada celular mantem os dados no IndexedDB. Quando sincroniza, envia as mudancas locais e baixa os logs remotos mais recentes. O merge usa `updatedAt` mais recente por registro.

## Sincronizacao

- Sincroniza ao abrir o app.
- Sincroniza ao voltar para a tela.
- Sincroniza quando o navegador fica online.
- Sincroniza a cada 15 minutos.
- Sincroniza logo depois de salvar um novo lancamento.
- Se estiver offline, salva localmente e envia depois.

## Scripts

```bash
npm run dev
npm run build
npm run serve:app
npm run serve:all
npm test
```
