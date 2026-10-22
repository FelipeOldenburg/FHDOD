# FHDOD

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Delegada pelo usuário em 22/10/2026: React com TypeScript, API Node e SQLite para desenvolvimento local.

## Users
Super Admin administra usuários e todos os setores. Cada setor tem um único login de Admin de Setor, com e-mail e senha, que configura perguntas e acompanha respostas somente daquele setor. Gestão e Visualizador consultam indicadores; Ouvidoria acompanha manifestações. Pacientes respondem sem login por URL própria do setor, em celular ou tablet.

## Product Purpose
Substituir a pesquisa em papel, aumentar participação e organizar respostas, indicadores e manifestações da experiência do paciente da Fundação Hospitalar Dr. Oswaldo Diesel.

## Capabilities and Constraints
Formulários pertencem ao setor, com uma pergunta por tela. Apenas NPS de 0 a 10 é obrigatório. Perguntas restantes são opcionais, com opção de pular discreta e legível. Registro do momento de cada resposta; data de atendimento separada. Respostas e comentários de pacientes não podem ser editados por administradores. Histórico das perguntas deve preservar o sentido de respostas antigas. Senhas temporárias exigem alteração no primeiro acesso. Isolamento de setores deve ocorrer na API. Excel respeita filtros e permissões. QR Code por setor.

Na tela Setores, o Super Admin informa o setor e o e-mail do administrador; setor e conta são criados juntos, sem gravação parcial. A senha temporária é exibida uma vez. Setores existentes sem conta ficam pendentes de configuração, sem credenciais inventadas. Super Admin e Admin de Setor usam a mesma tela de login; a autenticação determina o acesso. Desativar a conta ou o setor bloqueia login e sessões; redefinir a senha invalida sessões anteriores.

A tela Usuários administra os demais perfis e permite editar acessos. O perfil e o vínculo de um Admin de Setor válido permanecem fixos. Contas antigas com vários setores ou vínculos duplicados podem ser corrigidas nessa tela, sem excluir contas nem alterar respostas.

## Evidence on Hand
PDF de levantamento consolidado de requisitos com 12 páginas, lido nesta conversa. Figma KarxSPvzNUwEGQgLbMbhB2: dashboard1:2, pesquisas3:2, editor3:85, setores3:173, resultados3:252, ouvidoria3:342, usuários3:427, relatórios3:503, configurações3:578, exportação14:4 e telas paciente8:54/8:2/8:79/11:2. Inspeção visual pela aba compartilhada: conector exige edição e não permitiu extração. Exemplos do Figma são fictícios, não representam dados reais.

## Product Principles
Facilidade para pacientes com pouca familiaridade digital; dados originais preservados; acesso restrito por perfil e setor; indicadores calculados sobre dados reais da instalação.

## Accessibility & Inclusion
Controles grandes, navegação por teclado, foco visível, contraste legível e adaptação para celular. Não usar cor como única indicação.

## Open Decisions
Hospedagem e banco de produção, política institucional de retenção, formato real das escalas e associação a profissionais. A primeira entrega deixa esses itens explicitamente pendentes.
