// src/routes/treinos.routes.js
const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

// POST /api/treinos — inicia um treino. Se vier rotina_id, copia os
// exercícios (e cria as linhas de série vazias, uma por series_alvo) da
// rotina pro treino, pra tela de treino ativo já abrir preenchida — é
// exatamente o que "Iniciar Treino Agora" em cima de um card de rotina
// precisa fazer. Sem rotina_id, o treino nasce vazio (o caso "treino em
// branco" que já era intencional na tela treino-ativo.html).
router.post('/', async (req, res) => {
    const { rotina_id, nome_treino } = req.body;

    if (!nome_treino || !nome_treino.trim()) {
        return res.status(400).json({ erro: 'Nome do treino é obrigatório.' });
    }

    const conexao = await pool.getConnection();
    try {
        let exerciciosDaRotina = [];
        if (rotina_id) {
            const [rotina] = await conexao.query(
                'SELECT id FROM rotinas WHERE id = ? AND usuario_id = ?', [rotina_id, req.session.usuarioId]
            );
            if (rotina.length === 0) {
                conexao.release();
                return res.status(404).json({ erro: 'Rotina não encontrada.' });
            }
            [exerciciosDaRotina] = await conexao.query(
                'SELECT exercicio_id, ordem, series_alvo FROM rotina_exercicios WHERE rotina_id = ? ORDER BY ordem',
                [rotina_id]
            );
        }

        await conexao.beginTransaction();

        const [resultadoTreino] = await conexao.query(
            'INSERT INTO treinos_realizados (usuario_id, rotina_id, nome_treino, iniciado_em) VALUES (?, ?, ?, NOW())',
            [req.session.usuarioId, rotina_id || null, nome_treino.trim()]
        );
        const treinoId = resultadoTreino.insertId;

        for (const ex of exerciciosDaRotina) {
            const [resultadoTreEx] = await conexao.query(
                'INSERT INTO treino_exercicios (treino_id, exercicio_id, ordem) VALUES (?, ?, ?)',
                [treinoId, ex.exercicio_id, ex.ordem]
            );
            const treinoExercicioId = resultadoTreEx.insertId;

            const numeroDeSeries = ex.series_alvo || 1; // sem meta definida, começa com 1 série em branco
            for (let n = 1; n <= numeroDeSeries; n++) {
                await conexao.query(
                    'INSERT INTO treino_series (treino_exercicio_id, numero_serie) VALUES (?, ?)',
                    [treinoExercicioId, n]
                );
            }
        }

        await conexao.commit();
        res.status(201).json({ id: treinoId });
    } catch (erro) {
        await conexao.rollback();
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao iniciar treino.' });
    } finally {
        conexao.release();
    }
});

// GET /api/treinos/:id — detalhe (usado tanto pra retomar um treino em
// andamento quanto pra abrir um item do histórico)
router.get('/:id', async (req, res) => {
    try {
        const [treinos] = await pool.query(
            'SELECT id, rotina_id, nome_treino, iniciado_em, finalizado_em, volume_total_kg, observacoes FROM treinos_realizados WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.usuarioId]
        );
        if (treinos.length === 0) return res.status(404).json({ erro: 'Treino não encontrado.' });

        const [exercicios] = await pool.query(
            `SELECT te.id AS treino_exercicio_id, te.ordem, e.id AS exercicio_id, e.nome
             FROM treino_exercicios te
             JOIN exercicios e ON e.id = te.exercicio_id
             WHERE te.treino_id = ?
             ORDER BY te.ordem`,
            [req.params.id]
        );

        const [series] = await pool.query(
            `SELECT s.treino_exercicio_id, s.numero_serie, s.peso_kg, s.repeticoes, s.concluida
             FROM treino_series s
             JOIN treino_exercicios te ON te.id = s.treino_exercicio_id
             WHERE te.treino_id = ?
             ORDER BY s.treino_exercicio_id, s.numero_serie`,
            [req.params.id]
        );

        const seriesPorExercicio = {};
        series.forEach(s => {
            if (!seriesPorExercicio[s.treino_exercicio_id]) seriesPorExercicio[s.treino_exercicio_id] = [];
            seriesPorExercicio[s.treino_exercicio_id].push(s);
        });

        const exerciciosComSeries = exercicios.map(ex => ({
            ...ex,
            series: seriesPorExercicio[ex.treino_exercicio_id] || []
        }));

        res.json({ ...treinos[0], exercicios: exerciciosComSeries });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar treino.' });
    }
});

// PUT /api/treinos/:id — salva o estado final do treino (chamado quando o
// usuário clica "Fechar Treino") e marca finalizado_em. Assim como em
// rotinas, substitui exercícios/séries inteiros em vez de tentar diff —
// mesma justificativa: mais simples, e o volume de dados por treino é baixo.
router.put('/:id', async (req, res) => {
    const { exercicios, observacoes } = req.body;

    const conexao = await pool.getConnection();
    try {
        const [treinos] = await conexao.query(
            'SELECT id FROM treinos_realizados WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.usuarioId]
        );
        if (treinos.length === 0) {
            conexao.release();
            return res.status(404).json({ erro: 'Treino não encontrado.' });
        }

        await conexao.beginTransaction();

        await conexao.query('DELETE FROM treino_exercicios WHERE treino_id = ?', [req.params.id]);
        // treino_series é apagado em cascata pelo FK ON DELETE CASCADE (ver schema.sql)

        let volumeTotal = 0;

        if (Array.isArray(exercicios)) {
            for (let i = 0; i < exercicios.length; i++) {
                const ex = exercicios[i];
                const [resultadoTreEx] = await conexao.query(
                    'INSERT INTO treino_exercicios (treino_id, exercicio_id, ordem) VALUES (?, ?, ?)',
                    [req.params.id, ex.exercicio_id, i + 1]
                );
                const treinoExercicioId = resultadoTreEx.insertId;

                const seriesDoExercicio = Array.isArray(ex.series) ? ex.series : [];
                for (let n = 0; n < seriesDoExercicio.length; n++) {
                    const serie = seriesDoExercicio[n];
                    const peso = Number(serie.peso_kg) || null;
                    const reps = Number(serie.repeticoes) || null;
                    const concluida = !!serie.concluida;

                    await conexao.query(
                        'INSERT INTO treino_series (treino_exercicio_id, numero_serie, peso_kg, repeticoes, concluida) VALUES (?, ?, ?, ?, ?)',
                        [treinoExercicioId, n + 1, peso, reps, concluida]
                    );

                    if (concluida) volumeTotal += (peso || 0) * (reps || 0);
                }
            }
        }

        await conexao.query(
            'UPDATE treinos_realizados SET finalizado_em = NOW(), volume_total_kg = ?, observacoes = ? WHERE id = ?',
            [volumeTotal, observacoes || null, req.params.id]
        );

        await conexao.commit();
        res.json({ id: Number(req.params.id), volume_total_kg: volumeTotal });
    } catch (erro) {
        await conexao.rollback();
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao finalizar treino.' });
    } finally {
        conexao.release();
    }
});

// GET /api/treinos — histórico (só treinos já finalizados; um treino aberto
// e nunca fechado não deveria poluir a lista de histórico do usuário)
router.get('/', async (req, res) => {
    try {
        const [linhas] = await pool.query(
            `SELECT t.id, t.nome_treino, t.iniciado_em, t.finalizado_em, t.volume_total_kg,
                    COUNT(DISTINCT te.id) AS total_exercicios,
                    COUNT(s.id) AS total_series
             FROM treinos_realizados t
             LEFT JOIN treino_exercicios te ON te.treino_id = t.id
             LEFT JOIN treino_series s ON s.treino_exercicio_id = te.id AND s.concluida = 1
             WHERE t.usuario_id = ? AND t.finalizado_em IS NOT NULL
             GROUP BY t.id
             ORDER BY t.finalizado_em DESC`,
            [req.session.usuarioId]
        );
        res.json(linhas);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao listar histórico de treinos.' });
    }
});

// DELETE /api/treinos/:id — descarta um treino ainda não finalizado (usado
// por "Fechar Treino" sem salvar, na tela de treino ativo). Só apaga se
// finalizado_em for NULL: um treino já finalizado é histórico consumado,
// não resíduo — misturar "descartar rascunho" com "apagar histórico" no
// mesmo endpoint criaria uma operação com dois níveis de risco atrás do
// mesmo verbo HTTP.
//
// Um único DELETE em treinos_realizados basta: treino_exercicios e
// treino_series são apagados em cascata pelas FKs ON DELETE CASCADE
// definidas no schema (ver schema.sql) — não há necessidade de transação
// nem de deletar tabela por tabela aqui.
router.delete('/:id', async (req, res) => {
    try {
        const [resultado] = await pool.query(
            'DELETE FROM treinos_realizados WHERE id = ? AND usuario_id = ? AND finalizado_em IS NULL',
            [req.params.id, req.session.usuarioId]
        );
        if (resultado.affectedRows === 0) {
            return res.status(404).json({ erro: 'Treino não encontrado ou já finalizado.' });
        }
        res.status(204).end();
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao descartar treino.' });
    }
});

module.exports = router;
