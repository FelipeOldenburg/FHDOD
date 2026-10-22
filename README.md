# FHDOD — experiência do paciente

Aplicação local em React/TypeScript, API Node e SQLite para pesquisas por setor da Fundação Hospitalar Dr. Oswaldo Diesel.

## Executar

Requer Node.js **24 ou superior** e npm.

```sh
npm install
npm run dev
```

Abra [http://127.0.0.1:5173](http://127.0.0.1:5173). O Vite encaminha `/api` para a API em `127.0.0.1:3001`. O banco padrão é `data/fhdod.sqlite`.

Na primeira abertura, informe nome, e-mail e senha temporária para criar o Super Admin da instalação. A configuração inicial exige acesso local ao servidor. A senha deve ter entre 12 e 128 caracteres; a troca é obrigatória antes de acessar o painel, inclusive para o Super Admin. Não existem credenciais fixas.

Para explorar dados fictícios, encerre a execução anterior e use:

```sh
npm run dev:demo
```

Esse modo usa **`data/demo.sqlite`**, separado do banco padrão, e identifica a demonstração na interface. Também exige a criação do primeiro administrador. Não use `FHDOD_DB` apontando para dados reais no modo demo.

Para executar o build local:

```sh
npm run build
npm start
```

Abra [http://127.0.0.1:3001](http://127.0.0.1:3001); a API serve os arquivos de `dist/`. Os servidores escutam somente no endereço local.

## Recursos

- Autenticação com cinco perfis: Super Admin, Admin de Setor, Gestão, Ouvidoria e Visualizador; permissões e isolamento de setores aplicados na API.
- Setores, formulários, perguntas com versões e uma URL pública por setor, com QR Code. O paciente responde sem login, uma pergunta por tela.
- Salvamento parcial, horário de cada resposta e data de atendimento separada. Apenas o NPS de 0 a 10 é obrigatório.
- Respostas enviadas e comentários originais imutáveis; Ouvidoria com situação, notas internas e histórico próprios.
- Indicadores sobre os dados da instalação, filtros, registro de auditoria e exportação XLSX gerada no navegador conforme perfil e filtros.

## Configuração e verificações

As variáveis são lidas do ambiente do processo; o servidor não carrega arquivos `.env` automaticamente.

| Variável | Uso |
| --- | --- |
| `FHDOD_DB` | Caminho alternativo do SQLite; substitui o caminho padrão, inclusive no demo. |
| `FHDOD_DEMO=1` | Ativa a demonstração; `dev:demo` já configura essa variável. |
| `PORT` | Porta da API; padrão `3001`. O proxy do Vite está configurado para `3001`. |
| `FHDOD_ORIGIN` | Origem adicional aceita na proteção contra requisições entre sites. |
| `FHDOD_COOKIE_SECURE=1` | Exige HTTPS para envio do cookie de sessão. |

```sh
npm test
```

O teste integrado cobre os cinco perfis, isolamento de setores, troca e redefinição de senha, preservação de respostas e versões, NPS e distribuição de avaliações, proteção contra requisições entre sites, datas em São Paulo e auditoria de exportações. O XLSX carrega ExcelJS sob demanda; o override de `uuid` mantém a correção da dependência transitiva sem reduzir a versão do ExcelJS.

## Referência visual e limites

[Figma fornecido pelo usuário](https://www.figma.com/design/KarxSPvzNUwEGQgLbMbhB2), inspecionado pelo navegador: o conector exigia acesso de editor e não forneceu contexto nem assets automaticamente. A marca em `public/assets/fhdod-logo.png` veio do [site oficial](https://www.fhdod.com.br/images/logo.png); Inter é servida localmente por `@fontsource/inter`. Os rostos em SVG são aproximações vetoriais autoradas; fidelidade fina exige os SVGs originais do Figma. Os tokens implementados estão em [DESIGN.md](DESIGN.md).

Esta entrega é uma implementação local. Permanecem pendentes importação de escalas e associação a profissionais, TV Wall, backup e retenção institucionais, HTTPS e hospedagem, e-mail automático e relatórios PDF. O contexto do produto está em [PRODUCT.md](PRODUCT.md); esses itens pendentes não estão implementados.
