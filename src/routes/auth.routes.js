// src/routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { emailValido } = require('../validacao');

const router = express.Router();
const SALT_ROUNDS = 10;

// Mesma regra que já existia em Forms-Validar.js no front-end (senha com 8+
// caracteres, letras e números). Repito aqui de propósito: validação só no
// cliente é sugestão, não garantia — qualquer um pode chamar a API direto
// pulando o HTML inteiro. O front-end continua validando pra dar feedback
// rápido, mas quem decide o que entra no banco é o servidor.
function senhaValida(senha) {
    return typeof senha === 'string'
        && senha.trim().length >= 8
        && /(?=.*[a-zA-Z])(?=.*[0-9])/.test(senha.trim());
}

// POST /api/auth/cadastro
router.post('/cadastro', async (req, res) => {
    const nome = (req.body.nome || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const senha = req.body.senha || '';

    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
    if (!emailValido(email)) return res.status(400).json({ erro: 'Email inválido.' });
    if (!senhaValida(senha)) {
        return res.status(400).json({ erro: 'Senha precisa ter 8+ caracteres, com letras e números.' });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
        const [resultado] = await pool.query(
            'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
            [nome, email, senhaHash]
        );

        req.session.usuarioId = resultado.insertId;
        req.session.usuarioNome = nome;

        res.status(201).json({ id: resultado.insertId, nome, email });
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Já existe uma conta com esse email.' });
        }
        console.error(erro);
        res.status(500).json({ erro: 'Erro interno ao cadastrar usuário.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const senha = req.body.senha || '';

    if (!email || !senha) {
        return res.status(400).json({ erro: 'Email e senha são obrigatórios.' });
    }

    try {
        const [linhas] = await pool.query(
            'SELECT id, nome, senha_hash FROM usuarios WHERE email = ?',
            [email]
        );

        // Mensagem de erro genérica de propósito, tanto pra email inexistente
        // quanto pra senha errada — não dar dica de qual dos dois está errado
        // é o mínimo esperado pra não facilitar enumeração de emails cadastrados.
        if (linhas.length === 0) {
            return res.status(401).json({ erro: 'Email ou senha incorretos.' });
        }

        const usuario = linhas[0];
        const senhaConfere = await bcrypt.compare(senha, usuario.senha_hash);

        if (!senhaConfere) {
            return res.status(401).json({ erro: 'Email ou senha incorretos.' });
        }

        req.session.usuarioId = usuario.id;
        req.session.usuarioNome = usuario.nome;

        res.json({ id: usuario.id, nome: usuario.nome, email });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro interno ao fazer login.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(204).end();
    });
});

// GET /api/auth/me — usado pelas páginas pra saber se tem alguém logado
// (e pegar o nome, pro "Bem-vindo de volta, {nome}" de usuario.html)
router.get('/me', (req, res) => {
    if (!req.session.usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado.' });
    }
    res.json({ id: req.session.usuarioId, nome: req.session.usuarioNome });
});

module.exports = router;
