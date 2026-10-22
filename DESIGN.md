---
name: FHDOD
description: Sistema visual implementado para o painel e a pesquisa de experiência do paciente.
colors:
  primary: "#d92742"
  primary-dark: "#b91e36"
  primary-soft: "#faebef"
  patient-primary: "#e51e36"
  patient-primary-hover: "#c91831"
  paper: "#ffffff"
  surface: "#f5f5f6"
  exterior: "#e4e5e8"
  ink: "#26272b"
  muted: "#686a73"
  line: "#ececef"
  positive: "#347f6b"
typography:
  headline:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.3px"
  field:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "13px"
  label:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  patient-question:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "clamp(29px, 3.2vw, 42px)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.035em"
rounded:
  field: "10px"
  patient-button: "11px"
  choice: "12px"
  card: "20px"
  shell: "0px"
  pill: "999px"
spacing:
  small: "8px"
  control: "14px"
  medium: "16px"
  section: "20px"
  card: "22px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
    padding: "10px 19px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "#b52540"
    rounded: "{rounded.pill}"
    padding: "10px 19px"
  button-patient:
    backgroundColor: "{colors.patient-primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.patient-button}"
    padding: "18px 28px"
  input:
    backgroundColor: "#f6f6f7"
    textColor: "#303037"
    rounded: "{rounded.field}"
    typography: "{typography.field}"
    padding: "11px 14px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
---

# Design System: FHDOD

## Overview

**Creative North Star: "Referência hospitalar FHDOD"**

Este documento registra o visual já implementado a partir do Figma fornecido pelo usuário e dos ajustes solicitados. O painel ocupa toda a tela, sem moldura exterior ou cantos arredondados no contorno e no cabeçalho. Reúne cartões brancos sobre uma base cinza, ações vermelhas e navegação em cápsulas. O login mantém a marca sem o ícone decorativo de chave. A pesquisa do paciente amplia texto e controles sobre uma página branca, com uma pergunta por tela.

A marca oficial é um PNG local; Inter também é local. Os rostos de avaliação são SVGs autorados por aproximação visual. A inspeção do Figma ocorreu no navegador, sem exportação automática de assets; os SVGs originais são necessários para conferir os detalhes dessas ilustrações.

A marca padrão usa símbolo de 44px, sigla de 28px e nome institucional de 9px à direita, separado por uma linha vertical. Até 1250px, a sigla passa para 26px; até 650px, símbolo e sigla passam para 36px e 24px, e o cabeçalho administrativo oculta o nome institucional. A variante do paciente preserva seus tamanhos e breakpoints próprios, sem separador.

**Key Characteristics:**

- Cartões brancos, cantos arredondados e separação por fundos.
- Vermelho nas ações e estados selecionados, com texto e ícones de apoio.
- Densidade administrativa e controles maiores no fluxo do paciente.

## Colors

Os valores do frontmatter são normativos e refletem `src/styles.css` e `src/patient.css`.

### Primary

- **Vermelho FHDOD:** ações administrativas e destaque do NPS; a variante escura indica hover.
- **Rosa de seleção:** ações secundárias, avatares e itens selecionados.
- **Vermelho do paciente:** botão principal do formulário público, com seu próprio hover.

### Neutral

- **Branco:** cartões, cabeçalho e página do paciente.
- **Cinza de superfície:** fundo do painel em toda a tela.
- **Tinta:** texto principal; o cinza atenuado identifica descrições, rótulos auxiliares, cabeçalhos de tabela, apoio da marca, rodapé, placeholders e o denominador da satisfação.
- **Linha:** divisórias de tabelas e bordas de opções.

O verde identifica informação positiva. Situações também recebem rótulos; a cor não deve ser sua única indicação.

## Typography

**Display Font:** Inter, com Arial e sans-serif como alternativas.
**Body Font:** Inter, com os mesmos fallbacks.

A instalação carrega os pesos 400, 500, 600 e 700. Títulos administrativos usam `headline` e `title`; campos usam `field` e ações usam `label`. Tabelas usam texto de 12px e cabeçalhos de 11px. A pergunta pública usa `patient-question`; no celular passa para 28px. A abertura pública usa `clamp(42px, 4.6vw, 64px)`, com altura de linha 1.13.

## Layout

O painel ocupa 100% da largura e no mínimo toda a altura visível, sem largura máxima, margens externas ou centralização do contorno. O cabeçalho é horizontal e a coluna lateral de atalhos mede 52px. O corpo cresce para manter o rodapé na base quando há pouco conteúdo. O conteúdo usa grades com intervalos de 14–20px. Cartões básicos recebem `spacing.card`; em larguras menores o CSS reduz o preenchimento.

Até 1000px, o dashboard passa a duas colunas, resultados e editor ficam em uma coluna. Até 650px, a navegação superior permite rolagem horizontal e os atalhos ficam na base. Tabelas mantêm rolagem horizontal. Gestão empilha suas colunas em 1100px e relatórios em 720px.

A pesquisa usa cabeçalho e área de perguntas com largura máxima de 1320px. Em 640px, as avaliações ficam em três colunas e o NPS em seis; a numeração de 0 a 10 permanece completa. O botão público tem altura mínima de 72px no desktop e 62px no celular. Voltar e pular preservam áreas de interação próprias.

## Elevation & Depth

Cartões comuns usam a diferença entre branco e cinza para separar áreas. Menu de perfil, modal, aviso temporário e barra inferior móvel recebem sombras específicas. O modal aplica fundo escurecido com blur de 3px. Os valores exatos dessas exceções estão no sidecar.

Botões administrativos mudam cor em 0.18s e deslocam 1px ao pressionar. Controles públicos mudam cor em 0.15s. `prefers-reduced-motion` reduz as transições e animações.

## Shapes

Use `rounded.card` nos cartões comuns e `rounded.pill` nas ações administrativas e navegação. Campos usam `rounded.field`; alternativas e avaliações usam `rounded.choice`. O botão principal do paciente usa `rounded.patient-button`. O contorno do aplicativo e o cabeçalho usam `rounded.shell`, sem arredondamento em qualquer largura.

## Components

### Buttons

A ação administrativa principal combina vermelho, texto branco, altura mínima de 38px e formato de cápsula. A secundária usa rosa e texto vermelho. O botão público é maior, com texto de 24px no desktop e 20px no celular. Preserve os estados desabilitados e de espera.

### Chips

Situações usam cápsulas com texto de 10px e preenchimento de 5px por 10px. Verde, vermelho e âmbar complementam o rótulo.

### Cards / Containers

Cartões básicos usam branco, raio e preenchimento do frontmatter. O destaque de NPS é um bloco vermelho dentro do cartão. Notas e comentários originais usam superfícies cinza internas.

### Inputs / Fields

Campos administrativos usam fundo cinza claro, altura mínima de 42px e borda transparente em repouso; até 650px, a altura mínima passa para 44px. O foco muda a borda para vermelho e acrescenta um halo. Campos públicos usam bordas visíveis e altura mínima de 56px.

### Navigation

A navegação administrativa usa uma cápsula cinza de largura ajustada ao conteúdo, centralizada no cabeçalho, com intervalo de 4px entre os itens, item ativo branco e texto vermelho. Até 1000px, ocupa uma linha própria e mantém os itens agrupados; até 650px, permite rolagem horizontal. Os atalhos usam ícones com fundo rosa no estado ativo. Até 650px, os botões da navegação, ícones, perfil e ações em texto têm altura mínima de 44px; os atalhos inferiores medem 44px por 44px. O menu de perfil é um painel elevado alinhado à direita.

### Patient rating

As cinco avaliações combinam rosto e rótulo. Cada opção pública tem altura mínima de 208px no desktop; seleção e hover acrescentam borda vermelha e fundo rosa claro. O NPS usa botões numerados, com seleção indicada por borda, fundo e estado acessível.

## Do's and Don'ts

### Do:

- **Do** usar os tokens do frontmatter ao estender os componentes existentes.
- **Do** preservar foco visível, navegação por teclado e rótulos nas avaliações e situações.
- **Do** manter os controles maiores e a pergunta única no fluxo do paciente.
- **Do** respeitar a redução de movimento solicitada pelo sistema.

### Don't:

- **Don't** usar apenas a cor para comunicar seleção, situação ou avaliação.
- **Don't** reduzir os controles públicos à escala compacta do painel.
- **Don't** apresentar os rostos autorados como assets originais exportados do Figma.
