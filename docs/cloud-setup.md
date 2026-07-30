# Sincronização privada na Vercel

O Mesa Certa salva um único backup JSON por código secreto. O código funciona
como uma senha: quem tiver acesso a ele poderá carregar e substituir aquele
backup. O app não envia o código na URL nem o grava no Redis. Antes de acessar o
banco, o servidor normaliza o código e deriva uma chave irreversível com
SHA-256.

## 1. Criar o armazenamento

Há duas formas compatíveis:

1. No painel do projeto na Vercel, abra **Storage** ou **Marketplace** e conecte
   um banco Upstash Redis. Use as variáveis geradas pela integração:
   `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
2. Se o banco foi criado diretamente no Upstash, copie o REST URL e o REST
   Token e configure `UPSTASH_REDIS_REST_URL` e
   `UPSTASH_REDIS_REST_TOKEN`.

Use apenas um par completo. Se os dois pares existirem, o par `KV_*` tem
prioridade.

## 2. Configurar os ambientes da Vercel

Em **Project Settings → Environment Variables**, adicione o URL e o token ao
ambiente de produção. Adicione também a Preview e Development caso queira
testar a mesma integração nesses ambientes.

Não use o prefixo `NEXT_PUBLIC_`. O token precisa existir somente no servidor e
nunca deve entrar no JavaScript enviado ao navegador.

Depois de salvar as variáveis, faça um novo deploy. Uma implantação que já
estava pronta não recebe variáveis adicionadas posteriormente.

Para desenvolvimento local, copie `.env.example` para `.env.local`, preencha
um dos pares e mantenha `.env.local` fora do controle de versão.

## 3. Conferir a conexão

Com o site publicado, abra:

```text
https://SEU-DOMINIO/api/sync
```

Quando a conexão estiver configurada, a resposta será:

```json
{ "ok": true, "status": "ready" }
```

Sem um par completo de variáveis, a rota responde com HTTP `503` e o status
`not-configured`. Nenhuma URL ou token é devolvido na resposta.

## Comportamento e limites

- O payload deve ser JSON e pode ocupar no máximo **750 KB**.
- As respostas e requisições da API usam `Cache-Control: no-store`.
- Carregamentos com um código ainda não usado recebem `not-found`.
- A aplicação não escreve o código secreto em logs.
- Separadores, espaços e diferenças entre maiúsculas e minúsculas no código são
  ignorados antes da derivação da chave.
- O Redis guarda somente a versão mais recente de cada código.
- Cada backup expira após **180 dias** sem uma nova gravação.
- A API limita tentativas por minuto e responde `rate-limited` quando o limite
  é excedido.
- O botão **Apagar backup da nuvem** remove a cópia associada ao código.
- Não há recuperação de código. Gere outro código para um novo backup caso o
  segredo seja perdido ou compartilhado acidentalmente.

Para produção, mantenha o banco privado, restrinja o acesso ao projeto Vercel e
faça a rotação do REST Token caso ele seja exposto.
