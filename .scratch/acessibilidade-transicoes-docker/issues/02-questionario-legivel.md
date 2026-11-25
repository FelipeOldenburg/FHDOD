# 02: Questionário legível e fácil de tocar

**What to build:** permitir leitura e interação com baixa visão ou dificuldade motora, aproveitando a identidade visual atual.

**Blocked by:** None (can start immediately).

**Status:** implemented

- [x] Contraste suficiente para textos, campos e foco; seleção não depende somente de cor.
- [x] Alvos de toque têm pelo menos 44 pixels e não se sobrepõem.
- [x] Texto ampliado a 200%, viewport de 320 pixels e zoom de 400% mantêm conteúdo e ações acessíveis.
- [x] Verificar celular, tablet e estilos para alto contraste do sistema.

**Validação:** viewports de 320 e 768 pixels; texto a 200% em viewport de 320 pixels, sem rolagem horizontal e com notas NPS sem quebra. O reflow de 320 pixels cobre a largura equivalente a zoom de 400% em 1280 pixels. Estilos de cores forçadas revisados; modo de alto contraste do sistema não foi acionado.
