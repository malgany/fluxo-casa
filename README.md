# Fluxo Casa

Aplicativo financeiro domestico, mobile-first e local-first, para registrar entradas e saidas de dinheiro. O app usa IndexedDB/Dexie no navegador para continuar funcionando offline e sincroniza os dados com Supabase quando ha conexao.

## Estado Atual

- Interface em React + Vite + TypeScript.
- Autenticacao por e-mail e senha com Supabase Auth.
- Dados locais no navegador com IndexedDB/Dexie.
- Dados remotos no Supabase Postgres com RLS por casa.
- Cada usuario pode ter uma ou mais casas e convidar membros por e-mail.
- Backend `/api/invite` para enviar convites usando `SUPABASE_SERVICE_ROLE_KEY` sem expor essa chave no frontend.
- PWA com manifest e service worker para abrir pelo atalho quando instalado em uma origem segura.

## Configuracao

Crie um projeto no Supabase, aplique a migration em `supabase/migrations` e preencha `.env.local`:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_APP_URL=http://127.0.0.1:5173
```

No deploy da Vercel, configure as mesmas variaveis em Production e Preview. O app nao usa mais `ACCESS_PIN`, `SYNC_TOKEN`, `SYNC_HOUSEHOLD_ID` nem `BLOB_READ_WRITE_TOKEN`.

## Como Funciona

Ao entrar com e-mail e senha, o app aceita convites pendentes para o e-mail autenticado, carrega as casas do usuario e cria uma casa inicial automaticamente se nenhuma existir.

Os lancamentos, recorrencias e configuracoes sempre pertencem a uma casa (`householdId`). O IndexedDB filtra tudo pela casa selecionada. Alteracoes locais ficam marcadas como `dirty` e sao sincronizadas com o Supabase quando a conexao estiver disponivel.

## Desenvolvimento Local

Instale as dependencias e rode o app:

```bash
npm install
npm run dev
```

Esse comando sobe:

- Vite em `http://localhost:5173`;
- API local em `http://localhost:3333`.

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

## Dados Sensiveis

Nao versione arquivos `.env`, tokens reais, logs ou builds. O repositorio deve conter somente placeholders de configuracao.

Arquivos ignorados:

- `.env*`;
- `data/`;
- `dist/`;
- `node_modules/`;
- `*.log`.
