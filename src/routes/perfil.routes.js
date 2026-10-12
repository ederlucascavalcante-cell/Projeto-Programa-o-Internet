// src/routes/perfil.routes.js
// Dados da conta do usuário logado (nome, e-mail) e registro de peso corporal.
// Estatísticas de treino ficam em estatisticas.routes.js: são leituras
// agregadas sobre o histórico, uma responsabilidade diferente de "cuidar dos
// dados da conta".
const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');
const { emailValido } = require('../validacao');

const router = express.Router();
router.use(exigirLogin);

const NOME_MAX = 120;   // VARCHAR(120) em usuarios.nome
const EMAIL_MAX = 190;  // VARCHAR(190) em usuarios.email
const PESO_MIN_KG = 20;
const PESO_MAX_KG = 500;

// GET /api/perfil — nome, e-mail e total de treinos finalizados (a métrica
// do hero). /api/auth/me não serve aqui: só devolve id e nome.
router.get('/', async (req, res) => {
    try {
        const [linhas] = await pool.query(
            `SELECT u.nome, u.email,
                    (SELECT COUNT(*) FROM treinos_realizados t
                     WHERE t.usuario_id = u.id AND t.finalizado_em IS NOT NULL) AS total_treinos
             FROM usuarios u
             WHERE u.id = ?`,
            [req.session.usuarioId]
        );
        if (linhas.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        res.json(linhas[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar perfil.' });
    }
});

// PUT /api/perfil — atualiza nome e e-mail. Senha fica de fora de propósito:
// ninguém pediu troca de senha nesta tela (YAGNI).
router.put('/', async (req, res) => {
    const nome = ((req.body || {}).nome || '').trim();
    const email = ((req.body || {}).email || '').trim().toLowerCase();

    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
    if (nome.length > NOME_MAX) return res.status(400).json({ erro: 'Nome muito longo.' });
    if (!emailValido(email) || email.length > EMAIL_MAX) {
        return res.status(400).json({ erro: 'Email inválido.' });
    }

    try {
        await pool.query(
            'UPDATE usuarios SET nome = ?, email = ? WHERE id = ?',
            [nome, email, req.session.usuarioId]
        );
        // /api/auth/me lê o nome da sessão; sem atualizar aqui, o "Bem-vindo,
        // {nome}" de usuario.html continuaria mostrando o nome antigo.
        req.session.usuarioNome = nome;
        res.json({ nome, email });
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Já existe uma conta com esse email.' });
        }
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
    }
});

// GET /api/perfil/peso — histórico completo, do mais antigo pro mais novo
// (a ordem que o gráfico de linha precisa). O "peso atual" é só o último
// elemento: derivar no front evita guardar o mesmo dado duas vezes.
router.get('/peso', async (req, res) => {
    try {
        const [linhas] = await pool.query(
            `SELECT peso_kg, registrado_em
             FROM registros_peso_corporal
             WHERE usuario_id = ?
             ORDER BY registrado_em ASC`,
            [req.session.usuarioId]
        );
        // DECIMAL chega como string no mysql2; converte aqui pra o front não precisar.
        res.json(linhas.map(l => ({ peso_kg: Number(l.peso_kg), registrado_em: l.registrado_em })));
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar histórico de peso.' });
    }
});

// POST /api/perfil/peso — registra o peso de HOJE; se já existe registro de
// hoje, sobrescreve. Casa com o UNIQUE (usuario_id, registrado_em) do schema:
// "registrar" e "atualizar" são a mesma operação do ponto de vista do usuário.
// A data vem do banco (CURDATE) e não do cliente: o relógio do navegador não
// é fonte confiável pra um dado que vai pro histórico.
router.post('/peso', async (req, res) => {
    const peso = Number((req.body || {}).peso_kg);

    if (!Number.isFinite(peso) || peso < PESO_MIN_KG || peso > PESO_MAX_KG) {
        return res.status(400).json({ erro: `Informe um peso entre ${PESO_MIN_KG} e ${PESO_MAX_KG} kg.` });
    }

    try {
        await pool.query(
            `INSERT INTO registros_peso_corporal (usuario_id, peso_kg, registrado_em)
             VALUES (?, ?, CURDATE())
             ON DUPLICATE KEY UPDATE peso_kg = ?`,
            [req.session.usuarioId, peso, peso]
        );
        res.status(201).json({ peso_kg: peso });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao registrar peso.' });
    }
});

module.exports = router;
