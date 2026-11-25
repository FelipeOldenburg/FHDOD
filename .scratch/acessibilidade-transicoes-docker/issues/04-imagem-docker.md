# 04: Executar a aplicação em uma imagem Docker

**What to build:** executar frontend e API em um contêiner conectado ao PostgreSQL, com instalação independente do ambiente Node.js da hospedagem.

**Blocked by:** None (can start immediately).

**Status:** implemented

- [x] Build em etapas usa Node.js 24 e lockfile; imagem final executa sem root.
- [x] Credenciais e dados locais ficam fora da imagem.
- [x] Rede, saúde e encerramento funcionam dentro do contêiner.
- [x] Primeiro Super Admin pode ser criado localmente, sem abrir a configuração inicial na rede.
- [x] Imagem aceita PostgreSQL externo por configuração de ambiente.
