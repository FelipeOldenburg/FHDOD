# Implantação com Docker

A imagem executa a API Node.js 24 e serve a interface compilada no mesmo processo. O Compose acrescenta PostgreSQL 18 com volume persistente. Requer Docker Engine ou Docker Desktop e Docker Compose v2. Os comandos de exemplo desta página usam o shell de uma VPS Linux; no Windows, a cópia inicial também pode ser feita pelo Explorador.

## Instalação

1. Obtenha o projeto e, se ainda não existir `.env`, copie `.env.example` para `.env`. Preserve arquivos de ambiente existentes.
2. No `.env`, descomente e preencha `POSTGRES_PASSWORD` com uma senha longa e exclusiva. Valores com `$` ou `#` devem ficar entre aspas simples. `POSTGRES_USER` e `POSTGRES_DB` têm padrão `fhdod`.
3. Execute:

```sh
docker compose up -d --build --wait
docker compose ps
docker compose exec app node scripts/setup-admin.mjs
```

O último comando solicita nome, e-mail e senha pessoal de 12 a 128 caracteres. A senha não é exibida nem passada como argumento. A criação usa a mesma API e as mesmas validações da tela inicial, pela conexão local dentro do contêiner. Uma instalação já configurada recusa a criação de outro primeiro administrador. Não há credenciais fixas.

Abra `http://127.0.0.1:3001` e entre com a conta criada. Em uma VPS, use um túnel SSH para acessar localmente antes de publicar o domínio:

```sh
ssh -L 3001:127.0.0.1:3001 usuario@servidor
```

O Compose usa seu próprio banco no serviço `db`; a variável `DATABASE_URL` do desenvolvimento local não é utilizada nesse modo. Usuário e senha do banco são passados separadamente pela configuração nativa do driver PostgreSQL, evitando problemas com caracteres reservados na senha. `FHDOD_HTTP_PORT` altera a porta local publicada; não altera a porta interna da aplicação.

O PostgreSQL não publica porta na máquina. A aplicação publica apenas no endereço local. As migrações existentes são aplicadas na inicialização, depois de o banco estar pronto. A imagem executa com usuário sem privilégios de root e não inclui `.env`, dados locais ou dependências de desenvolvimento.

## Publicar com HTTPS

Configure o domínio e um proxy reverso com certificado TLS no servidor, encaminhando as requisições para `127.0.0.1:3001` (ou a porta escolhida). O proxy deve preservar `Host`, definir `X-Forwarded-Proto` a partir da conexão recebida e aceitar somente os domínios configurados.

No `.env`, configure a origem exata, sem caminho nem barra final:

```dotenv
FHDOD_ORIGIN=https://hospital.example
FHDOD_COOKIE_SECURE=1
```

Recrie o serviço com `docker compose up -d --wait` e verifique login, envio de respostas e acesso por QR Code no domínio HTTPS. A configuração inicial continua restrita à conexão local dentro do contêiner. O limite por IP utiliza o endereço da conexão com a API; atrás de um proxy, conexões compartilham os limites desse proxy. A implantação atual é para uma instância da aplicação.

## Saúde, logs e parada

```sh
docker compose ps
docker compose logs --tail=100 app db
docker compose stop
docker compose start --wait
```

`GET /api/health` verifica o banco e retorna `503` quando ele está indisponível. O Docker usa esse endpoint para informar a saúde da aplicação. O processo recebe os sinais de encerramento e fecha servidor e conexões. `docker compose down` remove contêineres e rede, mantendo o volume. **Não use `down -v` na instalação real:** essa opção remove os dados do PostgreSQL.

## Backup e restauração

Um volume persistente preserva dados entre recriações; mantenha também backups fora da VPS. Para gerar uma cópia consistente:

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/fhdod.dump'
docker compose cp db:/tmp/fhdod.dump ./fhdod.dump
```

Guarde o arquivo com acesso restrito e data identificada. Ele contém os dados da instalação. Para testar a restauração em um banco novo, sem substituir o banco em uso:

```sh
docker compose cp ./fhdod.dump db:/tmp/fhdod-restore.dump
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" fhdod_restore'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d fhdod_restore --exit-on-error /tmp/fhdod-restore.dump'
```

Valide usuários, setores e respostas no banco restaurado antes de usá-lo em uma recuperação. Para uma instalação de recuperação, pare a aplicação e configure `POSTGRES_DB=fhdod_restore` antes de recriá-la. Não altere `POSTGRES_USER` ou `POSTGRES_PASSWORD` para tentar modificar credenciais de um banco já inicializado: as variáveis da imagem PostgreSQL só criam a conta na primeira inicialização do volume.

## Atualização

1. Gere um backup e confirme que ele pode ser restaurado.
2. Atualize o código para a versão aprovada, mantendo o `.env` e o volume.
3. Execute `docker compose up -d --build --wait`.
4. Confira saúde, login, pesquisa pública e respostas no painel.

Mantenha a versão anterior e seu backup identificados. Migrações podem exigir restauração do banco para voltar a uma versão anterior; trocar apenas a imagem não desfaz migrações. Atualizações da versão principal do PostgreSQL exigem um procedimento próprio de migração, não somente a troca da tag da imagem.

## PostgreSQL externo

Em uma hospedagem com banco gerenciado, use a imagem da aplicação diretamente:

```sh
docker build -t fhdod:local .
docker run -d --name fhdod --init --restart unless-stopped \
  --env-file .env -p 127.0.0.1:3001:3001 fhdod:local
docker exec -it fhdod node scripts/setup-admin.mjs
```

Nesse modo, configure `DATABASE_URL` no `.env` com a conexão real e os parâmetros TLS exigidos pelo provedor. O hostname identifica o banco externo; `localhost` dentro do contêiner aponta para o próprio contêiner. Senhas na URL precisam de URL encoding. O procedimento do provedor deve cobrir backups e restauração.

## Dados antigos e testes

A migração de SQLite continua disponível na imagem com `npm run db:migrate -- /caminho/arquivo.sqlite`; monte o arquivo de origem somente para leitura e use um PostgreSQL vazio. A importação preserva o SQLite e recusa destinos com dados. Esse procedimento é opcional para instalações antigas.

Os testes integrados usam `FHDOD_TEST_DATABASE_URL` e criam schemas isolados. Execute-os em ambiente de desenvolvimento com banco exclusivo de testes; a imagem final contém somente dependências de produção. Dados de demonstração permanecem separados da instalação real.
