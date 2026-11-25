# 06: Validar a entrega e documentar a operação

**What to build:** entregar instalação reproduzível, operação documentada e fluxo hospitalar completo validado.

**Blocked by:** 01: Questionário acessível por teclado e leitor de tela; 02: Questionário legível e fácil de tocar; 03: Eliminar a piscada nas transições do painel; 05: Subir aplicação e PostgreSQL com Docker Compose.

**Status:** implemented

- [x] Documentar instalação, ambiente, primeiro administrador, logs, HTTPS e banco externo.
- [x] Testar atualização, backup e restauração em banco isolado.
- [x] Build e suíte existente passam com banco de testes separado.
- [x] Validar setor, pesquisa, envio e consulta no painel com dados fictícios.
- [x] Seguir PL-890 nas convenções Git, integrar à main e publicar após validação.

**Validação registrada:** build de produção; 28 testes de backend aprovados; imagem Docker e Compose saudáveis; primeiro administrador local com senha oculta; configuração pela rede recusada; cadastro de setor, pesquisa e envio; persistência após recriar contêineres; backup e restauração em banco separado; indisponibilidade do PostgreSQL com saúde HTTP 503 e recuperação para 200; nova tentativa no questionário sem perder a resposta.

**Limites:** homologação humana com NVDA/VoiceOver e teste em hospedagem final ainda pendentes. Não houve mudança de dependências nem do schema de negócio.
