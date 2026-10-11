// login.js
document.getElementById('forms').addEventListener('submit', async function (evento) {
    evento.preventDefault();

    document.querySelectorAll('.erro').forEach(function (span) { span.textContent = ''; });

    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;

    if (!email || !senha) {
        if (!email) document.getElementById('email-erro').textContent = 'Campo obrigatório';
        if (!senha) document.getElementById('senha-erro').textContent = 'Campo obrigatório';
        return;
    }

    try {
        const resposta = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            // Mensagem genérica de propósito (ver auth.routes.js): não dá pra
            // saber pelo retorno se foi o email ou a senha que errou.
            document.getElementById('senha-erro').textContent = dados.erro || 'Não foi possível entrar.';
            return;
        }

        window.location.href = 'usuario.html';
    } catch (erro) {
        console.error(erro);
        alert('Não foi possível conectar ao servidor. Tente novamente.');
    }
});
