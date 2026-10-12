// src/routes/exercicios.routes.js
const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();

// GET /api/exercicios — catálogo global + personalizados do usuário logado,
// cada um já com o array de grupos secundários embutido (evita o front-end
// ter que fazer N+1 chamadas pra montar as badges de cada exercício).
router.get('/', exigirLogin, async (req, res) => {
    try {
        const [exercicios] = await pool.query(
            `SELECT e.id, e.nome, e.usuario_id,
                    gp.chave AS grupo_primario_chave, gp.rotulo AS grupo_primario_rotulo
             FROM exercicios e
             JOIN grupos_musculares gp ON gp.id = e.grupo_primario_id
             WHERE e.ativo = 1 AND (e.usuario_id IS NULL OR e.usuario_id = ?)
             ORDER BY e.nome`,
            [req.session.usuarioId]
        );

        const [secundarios] = await pool.query(
            `SELECT egs.exercicio_id, gm.chave, gm.rotulo
             FROM exercicio_grupos_secundarios egs
             JOIN grupos_musculares gm ON gm.id = egs.grupo_id
             WHERE egs.exercicio_id IN (?)
             ORDER BY egs.exercicio_id, egs.ordem`,
            [exercicios.length > 0 ? exercicios.map(e => e.id) : [0]]
        );

        const secundariosPorExercicio = {};
        secundarios.forEach(s => {
            if (!secundariosPorExercicio[s.exercicio_id]) secundariosPorExercicio[s.exercicio_id] = [];
            secundariosPorExercicio[s.exercicio_id].push({ chave: s.chave, rotulo: s.rotulo });
        });

        const resposta = exercicios.map(e => ({
            id: e.id,
            nome: e.nome,
            personalizado: e.usuario_id !== null,
            primario: { chave: e.grupo_primario_chave, rotulo: e.grupo_primario_rotulo },
            secundarios: secundariosPorExercicio[e.id] || []
        }));

        res.json(resposta);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao listar exercícios.' });
    }
});

// GET /api/exercicios/grupos-musculares — os 14 grupos, pra montar os
// <select> de agrupamento sem precisar manter uma cópia hardcoded no front.
router.get('/grupos-musculares', exigirLogin, async (req, res) => {
    try {
        const [grupos] = await pool.query('SELECT id, chave, rotulo FROM grupos_musculares ORDER BY id');
        res.json(grupos);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao listar grupos musculares.' });
    }
});

// POST /api/exercicios — cadastra exercício PERSONALIZADO (sempre com
// usuario_id do usuário logado; não existe rota pra criar exercício global
// pela API — isso é dado de catálogo, curado, não input de usuário final).
router.post('/', exigirLogin, async (req, res) => {
    const { nome, grupo_primario_chave, secundarios, descricao } = req.body;

    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome do exercício é obrigatório.' });
    if (!grupo_primario_chave) return res.status(400).json({ erro: 'Agrupamento primário é obrigatório.' });

    const conexao = await pool.getConnection();
    try {
        const [grupoPrimario] = await conexao.query(
            'SELECT id FROM grupos_musculares WHERE chave = ?', [grupo_primario_chave]
        );
        if (grupoPrimario.length === 0) {
            return res.status(400).json({ erro: 'Agrupamento primário inválido.' });
        }

        await conexao.beginTransaction();

        const [resultado] = await conexao.query(
            'INSERT INTO exercicios (usuario_id, nome, grupo_primario_id, descricao) VALUES (?, ?, ?, ?)',
            [req.session.usuarioId, nome.trim(), grupoPrimario[0].id, descricao || null]
        );
        const exercicioId = resultado.insertId;

        const chavesSecundarias = Array.isArray(secundarios)
            ? secundarios.filter(chave => chave !== grupo_primario_chave)
            : [];

        for (let i = 0; i < chavesSecundarias.length; i++) {
            const [grupoSecundario] = await conexao.query(
                'SELECT id FROM grupos_musculares WHERE chave = ?', [chavesSecundarias[i]]
            );
            if (grupoSecundario.length === 0) continue; // ignora chave desconhecida em vez de abortar tudo
            await conexao.query(
                'INSERT INTO exercicio_grupos_secundarios (exercicio_id, grupo_id, ordem) VALUES (?, ?, ?)',
                [exercicioId, grupoSecundario[0].id, i + 1]
            );
        }

        await conexao.commit();
        res.status(201).json({ id: exercicioId });
    } catch (erro) {
        console.error(erro);
        await conexao.rollback().catch(() => {});
        res.status(500).json({ erro: 'Erro ao cadastrar exercício.' });
    } finally {
        conexao.release();
    }
});

module.exports = router;
