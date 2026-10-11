// cadastro.js
// Validação no cliente é só feedback rápido — quem decide de verdade se o
// cadastro é aceito é o servidor (POST /api/auth/cadastro), que repete essas
// mesmas regras. Ver comentário em src/routes/auth.routes.js sobre por quê.

document.getElementById('forms').addEventListener('submit', async function (evento) {
    evento.preventDefault();

    limparErros();

    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;

    let valido = true;

    if (!nome) {
        mostrarErro('nome-erro', 'Campo obrigatório');
        valido = false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mostrarErro('email-erro', 'Email inválido');
        valido = false;
    }
    if (senha.trim().length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(senha.trim())) {
        mostrarErro('senha-erro', 'A senha precisa ter 8+ caracteres, com letras e números');
        valido = false;
    }

    if (!valido) return;

    try {
        const resposta = await fetch('/api/auth/cadastro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            // Erro mais comum aqui é email duplicado (409) — mostra no campo certo
            // em vez de um alert genérico.
            mostrarErro('email-erro', dados.erro || 'Não foi possível cadastrar.');
            return;
        }

        window.location.href = 'usuario.html';
    } catch (erro) {
        console.error(erro);
        alert('Não foi possível conectar ao servidor. Tente novamente.');
    }
});

function mostrarErro(idSpan, mensagem) {
    const span = document.getElementById(idSpan);
    if (span) span.textContent = mensagem;
}

function limparErros() {
    document.querySelectorAll('.erro').forEach(function (span) { span.textContent = ''; });
}
