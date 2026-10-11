-- ============================================================================
-- IF FITNESS — SCHEMA DO BANCO DE DADOS (MySQL 5.7+ / MariaDB 10.3+)
-- ============================================================================
-- Este arquivo cobre: cadastro de usuário, biblioteca de exercícios (global +
-- personalizados por usuário), rotinas de treino (templates) e o histórico de
-- treinos realizados (semelhante ao "log" do Hevy).
--
-- NÃO inclui camada de acesso (nenhuma conexão, nenhuma query de aplicação) —
-- só o schema, como foi pedido. Também não modela a feature de "Personal",
-- porque ela foi removida do escopo.
--
-- Decisões de design (resumo, detalhes nos comentários de cada tabela):
--   - Agrupamentos musculares viram uma tabela de referência (grupos_musculares),
--     não um ENUM, porque enum em MySQL é essencialmente hardcoded: adicionar um
--     grupo novo exige ALTER TABLE. Isso viola aberto/fechado (a tabela devia
--     estar aberta pra extensão sem precisar ser modificada).
--   - "Exercícios" globais e "personalizados" moram na MESMA tabela
--     (exercicios.usuario_id nula = catálogo global). Criar duas tabelas
--     idênticas só pra separar "global" de "pessoal" seria duplicar a mesma
--     estrutura (viola DRY) pra resolver algo que uma coluna nula já resolve.
--   - Rotina (template) e Treino Realizado (execução/histórico) são entidades
--     SEPARADAS de propósito: uma é plano, a outra é fato consumado. Se fossem
--     a mesma tabela, editar uma rotina alteraria retroativamente o histórico
--     de treinos que a usaram — mistura responsabilidades que não deveriam
--     estar juntas (violaria responsabilidade única).
--   - Não criei tabela pra "meta de volume semanal" nem pra "frequência
--     semanal": a meta é um valor único por usuário (vira coluna em usuarios,
--     não justifica tabela própria — YAGNI) e a frequência semanal é 100%
--     derivável de treinos_realizados.data_inicio (calcular via query, não
--     duplicar o dado guardando de novo em outro lugar — DRY).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS railway; 

USE railway;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. USUÁRIOS
-- ============================================================================
-- Cadastro simples (nome, email, senha), sem papel de "personal" — removido
-- do escopo. `senha_hash` pressupõe hashing na aplicação (bcrypt/argon2) antes
-- do INSERT; o form atual (Pcadastro.html) usa <input type="text"> pra senha,
-- então além de não ter camada de acesso ainda, o próprio HTML vai precisar
-- virar type="password" quando essa parte for implementada — não é problema
-- do banco, mas fica registrado aqui pra não ser esquecido.
CREATE TABLE usuarios (
    id                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome                        VARCHAR(120)    NOT NULL,
    email                       VARCHAR(190)    NOT NULL,
    senha_hash                  VARCHAR(255)    NOT NULL,
    meta_volume_semanal_kg      DECIMAL(8,2)    NULL,
    criado_em                   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                 ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_usuarios_email UNIQUE (email)
) ENGINE=InnoDB;


-- ============================================================================
-- 2. GRUPOS MUSCULARES (tabela de referência)
-- ============================================================================
-- `chave` é o identificador estável usado em código (ex: 'peito', 'triceps') —
-- é o mesmo vocabulário já usado em exercicios-data.js no front-end, de
-- propósito, pra não ter duas fontes de verdade com nomes diferentes pra
-- mesma coisa. `rotulo` é só o texto de exibição (acentuado).
CREATE TABLE grupos_musculares (
    id      TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chave   VARCHAR(30)  NOT NULL,
    rotulo  VARCHAR(40)  NOT NULL,

    CONSTRAINT uq_grupos_chave UNIQUE (chave)
) ENGINE=InnoDB;


-- ============================================================================
-- 3. EXERCÍCIOS (catálogo global + personalizados por usuário)
-- ============================================================================
-- usuario_id NULL  = exercício do catálogo global (visível pra todo mundo).
-- usuario_id != NULL = exercício personalizado, visível só pra esse usuário
--                       (é isso que a aplicação precisa garantir no WHERE:
--                       usuario_id IS NULL OR usuario_id = :usuario_logado).
--
-- Cada exercício tem exatamente UM grupo primário (por isso é coluna direta,
-- FK simples) e ZERO OU MAIS grupos secundários (por isso é tabela à parte,
-- exercicio_grupos_secundarios — cardinalidades diferentes merecem
-- modelagens diferentes, forçar os dois num único formato seria enganoso).
--
-- Repare que NÃO existe coluna de equipamento ainda. Isso foi decisão
-- explícita: o dado de equipamento no front-end hoje é inferido por
-- palavra-chave no nome (não confiável) e a busca por equipamento está
-- desativada de propósito na tela de treino ativo. Adicionar uma coluna
-- nullable "pra já deixar pronto" seria especular sobre um requisito que
-- ainda não foi validado — quando o dado de equipamento for confiável,
-- basta `ALTER TABLE exercicios ADD COLUMN equipamento_id ...`, é uma
-- migração trivial e não justifica antecipar agora (YAGNI).
--
-- `ativo`: soft delete. Um exercício pode estar em uso em treinos_realizados
-- passados; apagar a linha de verdade (DELETE) quebraria o histórico. Marcar
-- ativo=0 remove ele da biblioteca de busca sem destruir registros que
-- dependem dele.
CREATE TABLE exercicios (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id          INT UNSIGNED    NULL,
    nome                VARCHAR(150)    NOT NULL,
    grupo_primario_id   TINYINT UNSIGNED NOT NULL,
    descricao           TEXT            NULL,
    ativo               BOOLEAN         NOT NULL DEFAULT TRUE,
    criado_em           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_exercicios_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_exercicios_grupo_primario
        FOREIGN KEY (grupo_primario_id) REFERENCES grupos_musculares(id) ON DELETE RESTRICT,

    INDEX idx_exercicios_usuario (usuario_id),
    INDEX idx_exercicios_nome (nome)

    -- Limitação conhecida: não há UNIQUE(nome, usuario_id) impedindo nomes
    -- duplicados no catálogo global. Em MySQL, UNIQUE trata cada NULL como
    -- distinto dos outros, então dois exercícios globais (usuario_id NULL)
    -- com o mesmo nome passariam pelo índice sem erro. Resolver isso exigiria
    -- checagem na aplicação (ou um índice gerado/trigger) — não vale a pena
    -- adicionar essa complexidade agora sem ainda ter a camada de acesso.
) ENGINE=InnoDB;

-- Grupos secundários de cada exercício (0 a N por exercício).
-- `ordem` existe porque o front-end sempre mostra o grupo primário como
-- primeira badge, mas entre os secundários a ordem também importa pra
-- manter consistência visual com o que já foi combinado (ex: "ombro, tríceps"
-- não é a mesma badge-order que "tríceps, ombro").
CREATE TABLE exercicio_grupos_secundarios (
    exercicio_id    INT UNSIGNED     NOT NULL,
    grupo_id        TINYINT UNSIGNED NOT NULL,
    ordem           TINYINT UNSIGNED NOT NULL DEFAULT 1,

    PRIMARY KEY (exercicio_id, grupo_id),

    CONSTRAINT fk_exsec_exercicio
        FOREIGN KEY (exercicio_id) REFERENCES exercicios(id) ON DELETE CASCADE,
    CONSTRAINT fk_exsec_grupo
        FOREIGN KEY (grupo_id) REFERENCES grupos_musculares(id) ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================================
-- 4. ROTINAS (templates de treino — o que aparece em "Minhas Rotinas")
-- ============================================================================
CREATE TABLE rotinas (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      INT UNSIGNED    NOT NULL,
    nome            VARCHAR(150)    NOT NULL,
    descricao       TEXT            NULL,
    criado_em       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_rotinas_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,

    INDEX idx_rotinas_usuario (usuario_id)
) ENGINE=InnoDB;

-- Exercícios planejados dentro de uma rotina, com meta de séries/reps.
-- series_alvo / reps_alvo_* são NULL-áveis de propósito: nem toda rotina
-- precisa nascer com metas definidas, e forçar valores obrigatórios aqui
-- bloquearia o caso de uso "só quero montar a lista de exercícios agora e
-- definir a meta depois".
CREATE TABLE rotina_exercicios (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rotina_id       INT UNSIGNED     NOT NULL,
    exercicio_id    INT UNSIGNED     NOT NULL,
    ordem           SMALLINT UNSIGNED NOT NULL,
    series_alvo     TINYINT UNSIGNED NULL,
    reps_alvo_min   TINYINT UNSIGNED NULL,
    reps_alvo_max   TINYINT UNSIGNED NULL,

    CONSTRAINT fk_rotex_rotina
        FOREIGN KEY (rotina_id) REFERENCES rotinas(id) ON DELETE CASCADE,
    CONSTRAINT fk_rotex_exercicio
        FOREIGN KEY (exercicio_id) REFERENCES exercicios(id) ON DELETE RESTRICT,

    CONSTRAINT uq_rotex_ordem UNIQUE (rotina_id, ordem),
    INDEX idx_rotex_exercicio (exercicio_id)
) ENGINE=InnoDB;


-- ============================================================================
-- 5. TREINOS REALIZADOS (histórico — a tela treino-ativo.html "fechada")
-- ============================================================================
-- rotina_id é NULL-ável porque a tela de treino ativo foi desenhada pra poder
-- começar em branco, sem nenhuma rotina associada (decisão já tomada no
-- front-end). `nome_treino` guarda uma CÓPIA do nome no momento do treino —
-- não um lookup ao vivo em rotinas.nome — porque se o usuário renomear ou
-- apagar a rotina depois, o histórico não pode mudar de nome ou virar
-- referência quebrada. Rotina é o plano; treino_realizado é o fato, e fato
-- não muda com o plano.
--
-- volume_total_kg é uma cache: dá pra recalcular somando
-- treino_series.peso_kg * repeticoes de todas as séries concluídas desse
-- treino, mas isso é caro de repetir toda vez que a tela de histórico lista
-- dezenas de treinos passados. Cache calculado uma vez, no fechamento do
-- treino, é uma troca consciente de DRY por performance de leitura — não é
-- a mesma coisa que duplicar dado por preguiça.
CREATE TABLE treinos_realizados (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id          INT UNSIGNED    NOT NULL,
    rotina_id           INT UNSIGNED    NULL,
    nome_treino         VARCHAR(150)    NOT NULL,
    iniciado_em         DATETIME        NOT NULL,
    finalizado_em       DATETIME        NULL,
    volume_total_kg     DECIMAL(10,2)   NULL,
    observacoes         TEXT            NULL,

    CONSTRAINT fk_treinos_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_treinos_rotina
        FOREIGN KEY (rotina_id) REFERENCES rotinas(id) ON DELETE SET NULL,

    INDEX idx_treinos_usuario_data (usuario_id, iniciado_em)
) ENGINE=InnoDB;

-- Exercícios que de fato entraram num treino realizado — não é o mesmo que
-- rotina_exercicios (aquilo é plano; isto é execução, pode ter exercícios
-- que nem estavam na rotina original, porque a tela permite adicionar
-- exercício avulso no meio do treino).
CREATE TABLE treino_exercicios (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    treino_id       INT UNSIGNED     NOT NULL,
    exercicio_id    INT UNSIGNED     NOT NULL,
    ordem           SMALLINT UNSIGNED NOT NULL,

    CONSTRAINT fk_trex_treino
        FOREIGN KEY (treino_id) REFERENCES treinos_realizados(id) ON DELETE CASCADE,
    CONSTRAINT fk_trex_exercicio
        FOREIGN KEY (exercicio_id) REFERENCES exercicios(id) ON DELETE RESTRICT,

    CONSTRAINT uq_trex_ordem UNIQUE (treino_id, ordem),
    INDEX idx_trex_exercicio (exercicio_id)
) ENGINE=InnoDB;

-- Cada linha da tabela de séries que aparece em treino-ativo.html
-- (peso, reps, se foi marcada como concluída). `concluida` existe porque o
-- front-end permite adicionar uma série e deixar peso/reps em branco sem
-- marcar o check — ela existe na UI mas não conta pro volume. Sem essa
-- coluna não daria pra distinguir "série feita com peso 0" de "série que o
-- usuário nem chegou a fazer".
CREATE TABLE treino_series (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    treino_exercicio_id INT UNSIGNED    NOT NULL,
    numero_serie        TINYINT UNSIGNED NOT NULL,
    peso_kg             DECIMAL(6,2)    NULL,
    repeticoes          SMALLINT UNSIGNED NULL,
    concluida           BOOLEAN         NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_treser_treino_exercicio
        FOREIGN KEY (treino_exercicio_id) REFERENCES treino_exercicios(id) ON DELETE CASCADE,

    CONSTRAINT uq_treser_numero UNIQUE (treino_exercicio_id, numero_serie)
) ENGINE=InnoDB;


-- ============================================================================
-- 6. REGISTROS DE PESO CORPORAL
-- ============================================================================
-- Suporta o botão "Registrar Peso Atual" que já existe na sidebar de
-- usuario.html. Um registro por (usuario, dia) — se a intenção futura for
-- permitir múltiplas pesagens no mesmo dia, é só remover o UNIQUE abaixo;
-- deixei porque hoje a UI sugere "peso do dia", não "peso da hora".
CREATE TABLE registros_peso_corporal (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      INT UNSIGNED    NOT NULL,
    peso_kg         DECIMAL(5,2)    NOT NULL,
    registrado_em   DATE            NOT NULL,

    CONSTRAINT fk_pesocorp_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,

    CONSTRAINT uq_pesocorp_usuario_dia UNIQUE (usuario_id, registrado_em)
) ENGINE=InnoDB;


-- ============================================================================
-- 7. SEED — dados iniciais
-- ============================================================================
-- Os 14 grupos musculares e os 122 exercícios do catálogo global vêm do MESMO
-- .txt que já virou exercicios-data.js no front-end (script Python usado só
-- pra gerar estes INSERTs a partir do JSON parseado, não reescrevi os dados
-- na mão) — evita ter duas listas divergentes de exercícios em lugares
-- diferentes do projeto.

INSERT INTO grupos_musculares (id, chave, rotulo) VALUES
(1, 'peito', 'Peito'),
(2, 'costas', 'Costas'),
(3, 'trapezio', 'Trapézio'),
(4, 'dorsais', 'Dorsais'),
(5, 'lombar', 'Lombar'),
(6, 'biceps', 'Bíceps'),
(7, 'triceps', 'Tríceps'),
(8, 'ombro', 'Ombro'),
(9, 'antebraco', 'Antebraço'),
(10, 'quadriceps', 'Quadríceps'),
(11, 'isquiotibiais', 'Isquiotibiais'),
(12, 'panturrilha', 'Panturrilha'),
(13, 'gluteos', 'Glúteos'),
(14, 'adutores', 'Adutores');

-- usuario_id NULL = catálogo global (visível pra todos os usuários)
INSERT INTO exercicios (id, usuario_id, nome, grupo_primario_id, descricao) VALUES
(1, NULL, 'Supino reto com barra', 1, NULL),
(2, NULL, 'Supino reto na máquina', 1, NULL),
(3, NULL, 'Supino reto no halter', 1, NULL),
(4, NULL, 'Supino inclinado com barra', 1, NULL),
(5, NULL, 'Supino inclinado na máquina', 1, NULL),
(6, NULL, 'Supino inclinado no halter', 1, NULL),
(7, NULL, 'Supino declinado na máquina', 1, NULL),
(8, NULL, 'Crucifixo na polia', 1, NULL),
(9, NULL, 'Crucifixo polia alta', 1, NULL),
(10, NULL, 'Crucifixo polia baixa', 1, NULL),
(11, NULL, 'Crucifixo no voador', 1, NULL),
(12, NULL, 'Peito na paralela', 1, NULL),
(13, NULL, 'Peito na paralela do graviton', 1, NULL),
(14, NULL, 'Pullover com halter', 1, NULL),
(15, NULL, 'Pullover na máquina', 1, NULL),
(16, NULL, 'Barra fixa', 4, NULL),
(17, NULL, 'Barra fixa no graviton', 4, NULL),
(18, NULL, 'Remada com halter', 2, NULL),
(19, NULL, 'Remada alta iso-lateral', 2, NULL),
(20, NULL, 'Puxada alta aberta na polia', 4, NULL),
(21, NULL, 'Puxada alta aberta na máquina', 4, NULL),
(22, NULL, 'Pulldown na polia', 4, NULL),
(23, NULL, 'Pulldown no pullover', 4, NULL),
(24, NULL, 'Remada curvada com barra', 2, NULL),
(25, NULL, 'Remada curvada com halteres', 2, NULL),
(26, NULL, 'Remada inclinada com halter e peito apoiado', 2, NULL),
(27, NULL, 'Remada baixa na polia', 2, NULL),
(28, NULL, 'Remada baixa na máquina', 2, NULL),
(29, NULL, 'Remada aberta na máquina', 2, NULL),
(30, NULL, 'Remada cavalinho', 2, NULL),
(31, NULL, 'Remada na barra T', 2, NULL),
(32, NULL, 'Encolhimento com halteres', 3, NULL),
(33, NULL, 'Encolhimento com barra', 3, NULL),
(34, NULL, 'Encolhimento na polia', 3, NULL),
(35, NULL, 'Encolhimento na máquina', 3, NULL),
(36, NULL, 'JM press com barra', 7, NULL),
(37, NULL, 'Tríceps francês na polia', 7, NULL),
(38, NULL, 'Tríceps francês com halter', 7, NULL),
(39, NULL, 'Tríceps press na máquina', 7, NULL),
(40, NULL, 'Tríceps testa com barra', 7, NULL),
(41, NULL, 'Tríceps testa com halter', 7, NULL),
(42, NULL, 'Tríceps testa na polia', 7, NULL),
(43, NULL, 'Extenção de tríceps na máquina', 7, NULL),
(44, NULL, 'Extenção de tríceps na polia', 7, NULL),
(45, NULL, 'Tríceps coice com halter', 7, NULL),
(46, NULL, 'Tríceps coice na polia', 7, NULL),
(47, NULL, 'Tríceps pulley', 7, NULL),
(48, NULL, 'Rosca 21', 6, NULL),
(49, NULL, 'Rosca direta com barra', 6, NULL),
(50, NULL, 'Rosca direta na polia', 6, NULL),
(51, NULL, 'Rosca direta com halter', 6, NULL),
(52, NULL, 'Rosca direta na máquina', 6, NULL),
(53, NULL, 'Rosca martelo com halter', 6, NULL),
(54, NULL, 'Rosca martelo na polia', 6, NULL),
(55, NULL, 'Rosca martelo alternada', 6, NULL),
(56, NULL, 'Rosca na polia alta', 6, NULL),
(57, NULL, 'Rosca scott com barra', 6, NULL),
(58, NULL, 'Rosca scott com halter', 6, NULL),
(59, NULL, 'Rosca scott na máquina', 6, NULL),
(60, NULL, 'Rosca inclinada no banco', 6, NULL),
(61, NULL, 'Rosca spider', 6, NULL),
(62, NULL, 'Rosca inversa na polia', 9, NULL),
(63, NULL, 'Rosca inversa com barra', 9, NULL),
(64, NULL, 'Flexão de punho com barra', 9, NULL),
(65, NULL, 'Flexão de punho na polia', 9, NULL),
(66, NULL, 'Rosca de punho com halter', 9, NULL),
(67, NULL, 'Extenção de punho com barra', 9, NULL),
(68, NULL, 'Extenção de punho na polia', 9, NULL),
(69, NULL, 'Desenvolvimento com halteres', 8, NULL),
(70, NULL, 'Desenvolvimento com barra', 8, NULL),
(71, NULL, 'Desenvolvimento na máquina', 8, NULL),
(72, NULL, 'Desenvolvimento Arnold', 8, NULL),
(73, NULL, 'Elevação frontal com barra', 8, NULL),
(74, NULL, 'Elevação frontal com halteres', 8, NULL),
(75, NULL, 'Elevação frontal na polia', 8, NULL),
(76, NULL, 'Elevação lateral na polia', 8, NULL),
(77, NULL, 'Elevação lateral com halter', 8, NULL),
(78, NULL, 'Elevação lateral na máquina', 8, NULL),
(79, NULL, 'Aberturas invertidas na polia', 8, NULL),
(80, NULL, 'Aberturas invertidas no voador', 8, NULL),
(81, NULL, 'Remada alta com barra', 8, NULL),
(82, NULL, 'Remada alta na polia', 8, NULL),
(83, NULL, 'Remada alta com halter', 8, NULL),
(84, NULL, 'Hiperextenção lombar', 5, NULL),
(85, NULL, 'Hiperextenção lombar na máquina', 5, NULL),
(86, NULL, 'Agachamento búlgaro', 10, NULL),
(87, NULL, 'Agachamento profundo', 10, NULL),
(88, NULL, 'Agachamento hack', 10, NULL),
(89, NULL, 'Agachamento pêndulo', 10, NULL),
(90, NULL, 'Agachamento na máquina', 10, NULL),
(91, NULL, 'Agachamento sumô', 10, NULL),
(92, NULL, 'Agachamento sumô com kettlebell', 10, NULL),
(93, NULL, 'Leg Press 45°', 10, NULL),
(94, NULL, 'Leg Press Articulado', 10, NULL),
(95, NULL, 'Leg Press Horizontal', 10, NULL),
(96, NULL, 'Afundo', 10, NULL),
(97, NULL, 'Afundo com barra', 10, NULL),
(98, NULL, 'Afundo com halter', 10, NULL),
(99, NULL, 'Sissy squat', 10, NULL),
(100, NULL, 'Cadeira extensora', 10, NULL),
(101, NULL, 'Cadeira flexora', 11, NULL),
(102, NULL, 'Mesa flexora', 11, NULL),
(103, NULL, 'Levantamento terra romeno (RDL) com barra', 11, NULL),
(104, NULL, 'Levantamento terra romeno (RDL) com halter', 11, NULL),
(105, NULL, 'Peso morto com pernas esticadas (stiff)', 11, NULL),
(106, NULL, 'Good morning', 11, NULL),
(107, NULL, 'Flexão nórdica', 11, NULL),
(108, NULL, 'Extenção de panturrilha no leg press 45°', 12, NULL),
(109, NULL, 'Extenção de panturrilha no leg vertical', 12, NULL),
(110, NULL, 'Elevação de panturrilha em pé com halter', 12, NULL),
(111, NULL, 'Elevação de panturrilha em pé com barra', 12, NULL),
(112, NULL, 'Elevação de panturrilha em pé na máquina', 12, NULL),
(113, NULL, 'Elevação de panturrilha sentado na máquina', 12, NULL),
(114, NULL, 'Cadeira adutora sentada', 14, NULL),
(115, NULL, 'Levantamento terra sumô', 13, NULL),
(116, NULL, 'Coice na máquina', 13, NULL),
(117, NULL, 'Coice na polia', 13, NULL),
(118, NULL, 'Elevação pélvica com barra', 13, NULL),
(119, NULL, 'Elevação pélvica na máquina', 13, NULL),
(120, NULL, 'Elevação de quadril na máquina', 13, NULL),
(121, NULL, 'Cadeira abdutora em pé', 13, NULL),
(122, NULL, 'Cadeira abdutora sentada', 13, NULL);

INSERT INTO exercicio_grupos_secundarios (exercicio_id, grupo_id, ordem) VALUES
(1, 7, 1),
(1, 8, 2),
(2, 7, 1),
(2, 8, 2),
(3, 7, 1),
(3, 8, 2),
(4, 8, 1),
(4, 7, 2),
(5, 8, 1),
(5, 7, 2),
(6, 8, 1),
(6, 7, 2),
(7, 7, 1),
(8, 8, 1),
(9, 8, 1),
(10, 8, 1),
(11, 8, 1),
(12, 7, 1),
(12, 8, 2),
(13, 7, 1),
(13, 8, 2),
(14, 4, 1),
(14, 7, 2),
(15, 4, 1),
(15, 7, 2),
(16, 6, 1),
(16, 2, 2),
(17, 6, 1),
(17, 2, 2),
(18, 6, 1),
(18, 4, 2),
(19, 6, 1),
(19, 3, 2),
(20, 6, 1),
(20, 2, 2),
(21, 6, 1),
(21, 2, 2),
(22, 7, 1),
(23, 7, 1),
(24, 6, 1),
(24, 5, 2),
(25, 6, 1),
(25, 5, 2),
(26, 6, 1),
(26, 3, 2),
(27, 6, 1),
(27, 4, 2),
(28, 6, 1),
(28, 4, 2),
(29, 3, 1),
(29, 8, 2),
(30, 6, 1),
(30, 5, 2),
(31, 6, 1),
(31, 5, 2),
(32, 9, 1),
(33, 9, 1),
(34, 9, 1),
(35, 9, 1),
(36, 1, 1),
(36, 8, 2),
(39, 1, 1),
(40, 9, 1),
(41, 9, 1),
(48, 9, 1),
(49, 9, 1),
(50, 9, 1),
(51, 9, 1),
(52, 9, 1),
(53, 9, 1),
(54, 9, 1),
(55, 9, 1),
(57, 9, 1),
(58, 9, 1),
(59, 9, 1),
(60, 9, 1),
(61, 9, 1),
(62, 6, 1),
(63, 6, 1),
(69, 7, 1),
(70, 7, 1),
(71, 7, 1),
(72, 7, 1),
(73, 1, 1),
(74, 1, 1),
(75, 1, 1),
(79, 3, 1),
(79, 2, 2),
(80, 3, 1),
(80, 2, 2),
(81, 3, 1),
(81, 6, 2),
(82, 3, 1),
(82, 6, 2),
(83, 3, 1),
(83, 6, 2),
(84, 13, 1),
(84, 11, 2),
(85, 13, 1),
(85, 11, 2),
(86, 13, 1),
(87, 13, 1),
(88, 13, 1),
(89, 13, 1),
(90, 13, 1),
(91, 13, 1),
(91, 14, 2),
(92, 13, 1),
(92, 14, 2),
(93, 13, 1),
(94, 13, 1),
(95, 13, 1),
(96, 13, 1),
(97, 13, 1),
(98, 13, 1),
(101, 12, 1),
(102, 12, 1),
(103, 13, 1),
(103, 5, 2),
(104, 13, 1),
(104, 5, 2),
(105, 13, 1),
(105, 5, 2),
(106, 13, 1),
(106, 5, 2),
(115, 10, 1),
(115, 14, 2),
(116, 11, 1),
(117, 11, 1),
(118, 11, 1),
(119, 11, 1),
(120, 11, 1);

-- Corrige o próximo AUTO_INCREMENT de exercicios, já que os 122 IDs acima
-- foram inseridos explicitamente (não via auto-incremento) para poderem ser
-- referenciados diretamente pelas linhas de exercicio_grupos_secundarios logo
-- acima, sem precisar de subqueries por nome.
ALTER TABLE exercicios AUTO_INCREMENT = 123;

SET FOREIGN_KEY_CHECKS = 1;
