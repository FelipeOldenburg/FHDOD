# Voz Faber

Modelo neural Piper para português do Brasil, com frequência de 22.050 Hz. O FHDOD usa o ONNX quantizado em uint8 por Pedro Berbis Freire para gerar a fala no servidor. A síntese usa os arquivos locais e o ONNX Runtime Web em modo WASM. O eSpeak NG fornece os fonemas em português.

- [Ficha da voz original no catálogo MIT do Piper](https://huggingface.co/rhasspy/piper-voices/blob/661e39caff61dcfcbbd2178a7c2dd0144b858b0e/pt/pt_BR/faber/medium/MODEL_CARD). Faber foi treinada a partir da voz Lessac e de dados CC0 do [Nabu Casa Voice Datasets](https://github.com/NabuCasa/voice-datasets).
- [Revisão de origem da versão quantizada](https://github.com/Pedro21062014/vozz/tree/ef2303bf0eb8cc47d1449d1958f4fbe479437855). O autor identifica o modelo de voz como MIT na seção de licenças.

| Arquivo | SHA-256 |
| --- | --- |
| `faber.onnx` | `6186260add2c59a9ca3584ae72b98261c4ac1eb9d507d671b4eea80a706a931b` |
| `faber.json` | `7e694de195ae3fc36dd732c445eb04fb49b649854893cb5506b978f0d50a1d6f` |
