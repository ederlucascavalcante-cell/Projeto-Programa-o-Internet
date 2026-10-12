## Setup

1. Link hospedado pelo render: https://projeto-programacao-internet.onrender.com/inicio.html

## O que NÃO foi feito

- **Consistência semanal e remover meta de carga** na sidebar de `usuario.html`
- **"Registrar Peso Atual"**
- `cadastro_exercicio.html` foi **removido**: virou redundante depois que o
  modal de exercício personalizado dentro de `treino-ativo.html` passou a
  fazer a mesma coisa contra a mesma rota. Manter os dois seria duplicar o
  mesmo formulário em dois lugares.

## Segurança — pontos que valem atenção antes de considerar isso pronto

- `express-session` está usando o `MemoryStore` padrão. Funciona para desenvolvimento, mas todo mundo é
  deslogado se o processo reiniciar, e não escala pra mais de um processo
  Node. Para produção, trocar por `connect-mysql2` ou similar.
