// src/validacao.js
// Regras de validação compartilhadas entre rotas. Antes, emailValido vivia
// dentro de auth.routes.js; como perfil.routes.js (editar e-mail) precisa da
// MESMA regra, extrair evita duas cópias que podem divergir (DRY).

function emailValido(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

module.exports = { emailValido };
