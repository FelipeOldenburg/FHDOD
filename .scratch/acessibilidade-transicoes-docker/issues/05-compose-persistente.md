# 05: Subir aplicação e PostgreSQL com Docker Compose

**What to build:** disponibilizar uma instalação completa para VPS com dados persistentes e banco na rede interna.

**Blocked by:** 04: Executar a aplicação em uma imagem Docker.

**Status:** implemented

- [x] Aplicação aguarda banco saudável e aplica migrações existentes.
- [x] Credenciais vêm do ambiente e o PostgreSQL não publica porta no host.
- [x] Recriar os contêineres preserva usuários, setores e respostas.
- [x] Falha do banco é identificada pela saúde da aplicação.
