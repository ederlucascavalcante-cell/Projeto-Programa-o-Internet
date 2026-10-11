# IF Fitness — Backend Node

## Setup

1. Link hospedado pelo render: https://projeto-programacao-internet.onrender.com/inicio.html

## O que foi implementado nesta rodada

- Cadastro e login reais (senha com bcrypt, sessão por cookie)
- CRUD de rotinas (`/api/rotinas`)
- Catálogo de exercícios + exercício personalizado (`/api/exercicios`)
- Treino ativo persistindo de verdade (`/api/treinos`) — iniciar (em branco
  ou a partir de rotina), fechar salvando séries, e histórico
- `usuario.html`, `treino-ativo.html` e a nova `meu-treino.html` conversando
  com essa API em vez de dado estático

## O que NÃO foi feito, de propósito (ficou de fora do escopo pedido)

- **"Meu Perfil"** — link no menu não vai a lugar nenhum, nenhuma tela existe.
- **Consistência semanal e meta de carga** na sidebar de `usuario.html` —
  continuam com número fixo de mockup. Dá pra calcular a consistência a
  partir de `treinos_realizados` e a meta já tem coluna em `usuarios`
  (`meta_volume_semanal_kg`), mas não tem rota de API pra nenhum dos dois.
- **"Registrar Peso Atual"** — a tabela `registros_peso_corporal` existe no
  banco, mas não tem rota nem tela.
- `cadastro_exercicio.html` foi **removido**: virou redundante depois que o
  modal de exercício personalizado dentro de `treino-ativo.html` passou a
  fazer a mesma coisa contra a mesma rota. Manter os dois seria duplicar o
  mesmo formulário em dois lugares.

## Segurança — pontos que valem atenção antes de considerar isso pronto

- `express-session` está usando o `MemoryStore` padrão (não configurei um
  store em banco/redis). Funciona para desenvolvimento, mas todo mundo é
  deslogado se o processo reiniciar, e não escala pra mais de um processo
  Node. Para produção, trocar por `connect-mysql2` ou similar.
- `cookie.secure` está desligado no `server.js` de propósito (comentário
  explica o porquê) — precisa ser reativado ao servir por HTTPS.
