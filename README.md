# IF Fitness — Backend Node

## Setup

1. **Banco de dados** — precisa de um MySQL/MariaDB rodando. Importe o schema
   com o charset certo (senão os acentos corrompem, ver comentário no topo
   do arquivo):

   ```bash
   mysql -u root --default-character-set=utf8mb4 < db/schema.sql
   ```

   Isso cria o banco `if_fitness`, as tabelas, o catálogo de 122 exercícios
   E o usuário de aplicação `if_fitness_app` (com uma senha de exemplo —
   troque antes de usar fora da sua máquina, é a última seção do arquivo).

2. **Variáveis de ambiente**:

   ```bash
   cp .env.example .env
   ```

   Ajuste `DB_PASSWORD` pra bater com a senha que você usou (ou deixou) no
   `CREATE USER` do schema.sql, e troque `SESSION_SECRET` por algo aleatório.

3. **Dependências e execução**:

   ```bash
   npm install
   npm start
   ```

   Servidor sobe em `http://localhost:3000` — front-end e API na mesma
   origem (ver comentário em `server.js` sobre por quê).

4. **Testar tudo de uma vez**: `bash test_api.sh` — recria o banco do zero e
   roda toda a API via curl (cadastro, login, rotinas, treino completo,
   histórico, checagem de autorização entre usuários). Mesmo padrão de
   script auto-contido que já existia pro `test_api.sh` de outra etapa do
   projeto.

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
