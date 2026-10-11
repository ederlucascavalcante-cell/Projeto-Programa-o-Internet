// src/middleware/auth.js
// Única responsabilidade: checar se existe um usuário na sessão e, se não
// existir, cortar a requisição com 401 antes que ela chegue na rota. Toda
// rota que precisa de usuário logado usa isso em vez de repetir o mesmo
// "if (!req.session.usuarioId)" em cada arquivo de rota (DRY).

function exigirLogin(req, res, next) {
    if (!req.session.usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado. Faça login novamente.' });
    }
    next();
}

module.exports = { exigirLogin };
