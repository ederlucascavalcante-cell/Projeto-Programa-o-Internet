// src/routes/rotinas.routes.js
const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

// Toda query abaixo filtra por "AND usuario_id = ?" além do id da rotina.
// Isso não é redundância — sem isso, qualquer usuário logado poderia editar
// ou apagar a rotina de outro só adivinhando o id (autenticação garante
// "alguém está logado", não garante "esse alguém pode mexer nisso aqui";
// essa segunda checagem é autorização, e cada rota precisa da sua).

// GET /api/rotinas — lista as rotinas do usuário logado, com contadores
// (o "4 Exercícios / 12 Séries Totais" que já existe nos cards de usuario.html)
router.get('/', async (req, res) => {
    try {
        const [linhas] = await pool.query(
            `SELECT r.id, r.nome, r.descricao, r.criado_em,
                    COUNT(re.id) AS total_exercicios,
                    COALESCE(SUM(re.series_alvo), 0) AS total_series_alvo
             FROM rotinas r
             LEFT JOIN rotina_exercicios re ON re.rotina_id = r.id
             WHERE r.usuario_id = ?
             GROUP BY r.id
             ORDER BY r.criado_em DESC`,
            [req.session.usuarioId]
        );
        res.json(linhas);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao listar rotinas.' });
    }
});

// GET /api/rotinas/:id — detalhe de uma rotina com seus exercícios em ordem
router.get('/:id', async (req, res) => {
    try {
        const [rotinas] = await pool.query(
            'SELECT id, nome, descricao FROM rotinas WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.usuarioId]
        );
        if (rotinas.length === 0) return res.status(404).json({ erro: 'Rotina não encontrada.' });

        const [exercicios] = await pool.query(
            `SELECT re.id AS rotina_exercicio_id, re.ordem, re.series_alvo,
                    re.reps_alvo_min, re.reps_alvo_max,
                    e.id AS exercicio_id, e.nome, e.grupo_primario_id
             FROM rotina_exercicios re
             JOIN exercicios e ON e.id = re.exercicio_id
             WHERE re.rotina_id = ?
             ORDER BY re.ordem`,
            [req.params.id]
        );

        res.json({ ...rotinas[0], exercicios });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar rotina.' });
    }
});

// POST /api/rotinas — cria rotina + lista de exercícios numa transação:
// se a inserção de um exercício falhar no meio, a rotina inteira não fica
// meio-criada no banco (rollback), em vez de deixar um registro inconsistente.
router.post('/', async (req, res) => {
    const { nome, descricao, exercicios } = req.body;

    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome da rotina é obrigatório.' });

    const conexao = await pool.getConnection();
    try {
        if (!(await exerciciosPermitidos(conexao, req.session.usuarioId, exercicios))) {
            return res.status(400).json({ erro: 'A lista contém um exercício inválido.' });
        }

        await conexao.beginTransaction();

        const [resultado] = await conexao.query(
            'INSERT INTO rotinas (usuario_id, nome, descricao) VALUES (?, ?, ?)',
            [req.session.usuarioId, nome.trim(), descricao || null]
        );
        const rotinaId = resultado.insertId;

        await inserirExerciciosDaRotina(conexao, rotinaId, exercicios);

        await conexao.commit();
        res.status(201).json({ id: rotinaId });
    } catch (erro) {
        console.error(erro);
        await conexao.rollback().catch(() => {});
        res.status(500).json({ erro: 'Erro ao criar rotina.' });
    } finally {
        conexao.release();
    }
});

// PUT /api/rotinas/:id — atualiza nome/descrição e SUBSTITUI a lista de
// exercícios inteira (apaga os antigos, insere os novos). É mais simples e
// menos sujeito a bug do que tentar calcular um "diff" entre lista antiga e
// nova (quem mudou de posição, quem foi removido, quem é novo) — pra uma
// rotina com no máximo umas duas dezenas de exercícios, o custo de recriar
// tudo a cada edição é irrelevante.
router.put('/:id', async (req, res) => {
    const { nome, descricao, exercicios } = req.body;

    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome da rotina é obrigatório.' });

    const conexao = await pool.getConnection();
    try {
        const [rotinas] = await conexao.query(
            'SELECT id FROM rotinas WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.usuarioId]
        );
        if (rotinas.length === 0) {
            return res.status(404).json({ erro: 'Rotina não encontrada.' });
        }

        if (!(await exerciciosPermitidos(conexao, req.session.usuarioId, exercicios))) {
            return res.status(400).json({ erro: 'A lista contém um exercício inválido.' });
        }

        await conexao.beginTransaction();

        await conexao.query('UPDATE rotinas SET nome = ?, descricao = ? WHERE id = ?', [
            nome.trim(), descricao || null, req.params.id
        ]);
        await conexao.query('DELETE FROM rotina_exercicios WHERE rotina_id = ?', [req.params.id]);
        await inserirExerciciosDaRotina(conexao, req.params.id, exercicios);

        await conexao.commit();
        res.json({ id: Number(req.params.id) });
    } catch (erro) {
        console.error(erro);
        await conexao.rollback().catch(() => {});
        res.status(500).json({ erro: 'Erro ao atualizar rotina.' });
    } finally {
        conexao.release();
    }
});

// DELETE /api/rotinas/:id
router.delete('/:id', async (req, res) => {
    try {
        const [resultado] = await pool.query(
            'DELETE FROM rotinas WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.usuarioId]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ erro: 'Rotina não encontrada.' });
        res.status(204).end();
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao excluir rotina.' });
    }
});

// Garante que todo exercicio_id da lista é do catálogo global ou do PRÓPRIO
// usuário. A FK do banco só confirma que o exercício existe — sem esta checagem,
// quem chamasse a API direto poderia colocar na sua rotina o exercício
// personalizado de outro usuário (mesma lógica de "autenticação não é
// autorização" explicada no topo deste arquivo).
// Não filtra por `ativo`: um exercício desativado pode continuar numa rotina
// antiga, e editar essa rotina não pode passar a falhar por causa disso.
async function exerciciosPermitidos(conexao, usuarioId, exercicios) {
    if (!Array.isArray(exercicios) || exercicios.length === 0) return true;

    const ids = Array.from(new Set(exercicios.map(ex => Number(ex.exercicio_id))));
    if (ids.some(id => !Number.isInteger(id) || id < 1)) return false;

    const [linhas] = await conexao.query(
        'SELECT id FROM exercicios WHERE id IN (?) AND (usuario_id IS NULL OR usuario_id = ?)',
        [ids, usuarioId]
    );
    return linhas.length === ids.length;
}

async function inserirExerciciosDaRotina(conexao, rotinaId, exercicios) {
    if (!Array.isArray(exercicios) || exercicios.length === 0) return;

    for (let i = 0; i < exercicios.length; i++) {
        const ex = exercicios[i];
        await conexao.query(
            `INSERT INTO rotina_exercicios
                (rotina_id, exercicio_id, ordem, series_alvo, reps_alvo_min, reps_alvo_max)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                rotinaId,
                ex.exercicio_id,
                i + 1,
                ex.series_alvo || null,
                ex.reps_alvo_min || null,
                ex.reps_alvo_max || null
            ]
        );
    }
}

module.exports = router;