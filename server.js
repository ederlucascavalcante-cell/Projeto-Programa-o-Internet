// server.js
// Um único servidor Express serve tanto os arquivos estáticos (public/,
// que é o front-end HTML/CSS/JS que já existia) quanto a API (/api/...).
// Escolha deliberada: como front-end e back-end são a mesma origem
// (mesmo host:porta), o cookie de sessão funciona sem nenhuma configuração
// de CORS. Separar em dois servidores é a arquitetura "certa" pra um projeto
// que vai crescer e ter deploy independente de front/back, mas aqui isso
// seria complexidade que o projeto não pediu (YAGNI) — o objetivo agora é
// ter cadastro/login/rotinas/treinos funcionando de verdade.

const express = require('express');
const session = require('express-session');
require('dotenv').config();

const authRoutes = require('./src/routes/auth.routes');
const rotinasRoutes = require('./src/routes/rotinas.routes');
const exerciciosRoutes = require('./src/routes/exercicios.routes');
const treinosRoutes = require('./src/routes/treinos.routes');

const app = express();

// Sem isso, o Express gera ETag pra toda resposta (inclusive JSON de API) e,
// quando o navegador reenvia esse ETag num If-None-Match, responde 304 SEM
// corpo. Pra uma página estática isso é ótimo; pra uma rota de API que o
// front-end espera poder chamar `.json()` em cima, é exatamente o bug que
// derrubou o carregamento de treino-ativo.html — 304 chega sem corpo, o
// `.json()` explode com "Unexpected end of JSON input", cai no catch, e a
// pessoa só vê um alert genérico sem entender por quê.
app.set('etag', false);

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 8, // 8 horas
        httpOnly: true
        // 'secure: true' fica de fora de propósito: em desenvolvimento local
        // (http, não https) o cookie seria descartado pelo navegador se essa
        // flag estivesse ligada. Antes de ir pra produção com HTTPS, isso
        // precisa ser reativado — ver README.
    }
}));

app.use('/api/auth', authRoutes);
app.use('/api/rotinas', rotinasRoutes);
app.use('/api/exercicios', exerciciosRoutes);
app.use('/api/treinos', treinosRoutes);

app.use(express.static('public'));

app.use((req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`IF Fitness rodando em http://localhost:${PORT}`);
});