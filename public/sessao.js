// sessao.js
// Checagem de sessão e logout compartilhados. Esse mesmo bloco já está
// copiado em usuario.js e meu-treino.js; perfil.js seria a terceira cópia,
// então entra aqui em vez de repetir (DRY). Script clássico (sem módulos),
// como o resto do projeto: carregar ANTES do JS da página.

// Devolve { id, nome } do usuário logado, ou manda pro login e devolve null.
async function exigirSessao() {
    try {
        const resposta = await fetch('/api/auth/me');
        if (resposta.ok) return await resposta.json();
    } catch (erro) {
        console.error(erro);
    }
    window.location.href = 'login.html';
    return null;
}

function ligarLogout() {
    document.getElementById('link-sair').addEventListener('click', async function (e) {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
    });
}
