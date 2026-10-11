// usuario.js

document.addEventListener('DOMContentLoaded', async function () {

    // ---------- Guarda de autenticação ----------
    // Toda página que mostra dado de usuário logado precisa checar /me antes
    // de tentar carregar qualquer outra coisa — sem isso, alguém sem sessão
    // válida veria a tela vazia/quebrada em vez de ser mandado pro login.
    let usuario;
    try {
        const respostaMe = await fetch('/api/auth/me');
        if (!respostaMe.ok) {
            window.location.href = 'login.html';
            return;
        }
        usuario = await respostaMe.json();
    } catch (erro) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('nome-usuario').textContent = usuario.nome;

    // ---------- Logout ----------
    document.getElementById('link-sair').addEventListener('click', async function (e) {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
    });

    // ---------- Treino livre (sem rotina) ----------
    document.getElementById('btn-treino-livre').addEventListener('click', async function () {
        await iniciarTreino(null, 'Treino Livre');
    });

    document.getElementById('btn-ver-historico').addEventListener('click', function () {
        window.location.href = 'meu-treino.html';
    });

    document.getElementById('btn-nova-rotina').addEventListener('click', function () {
        window.location.href = 'rotina-editor.html';
    });

    async function iniciarTreino(rotinaId, nomeTreino) {
        try {
            const resposta = await fetch('/api/treinos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rotina_id: rotinaId, nome_treino: nomeTreino })
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                alert(dados.erro || 'Não foi possível iniciar o treino.');
                return;
            }
            window.location.href = 'treino-ativo.html?treino=' + dados.id;
        } catch (erro) {
            console.error(erro);
            alert('Não foi possível conectar ao servidor.');
        }
    }

    // ---------- Lista de rotinas ----------
    const listaRotinasEl = document.getElementById('lista-rotinas');

    async function carregarRotinas() {
        try {
            const resposta = await fetch('/api/rotinas');
            const rotinas = await resposta.json();

            if (!resposta.ok) {
                listaRotinasEl.innerHTML = '<p class="rotinas-vazio">Não foi possível carregar suas rotinas.</p>';
                return;
            }

            if (rotinas.length === 0) {
                listaRotinasEl.innerHTML = '<p class="rotinas-vazio">Você ainda não tem rotinas salvas.</p>';
                return;
            }

            listaRotinasEl.innerHTML = '';
            rotinas.forEach(function (rotina) {
                listaRotinasEl.appendChild(criarCardRotina(rotina));
            });
        } catch (erro) {
            console.error(erro);
            listaRotinasEl.innerHTML = '<p class="rotinas-vazio">Não foi possível conectar ao servidor.</p>';
        }
    }

    function criarCardRotina(rotina) {
        const card = document.createElement('div');
        card.className = 'card-rotina';
        // Não existe (ainda) um ícone por rotina — nenhuma coluna no banco guarda
        // isso, então todo card usa o mesmo emoji genérico em vez de fingir uma
        // variedade que não existe nos dados.
        card.innerHTML =
            '<div class="rotina-info">' +
                '<div class="rotina-icone">🏋️‍♂️</div>' +
                '<div>' +
                    '<h3></h3>' +
                '</div>' +
            '</div>' +
            '<div class="rotina-meta">' +
                '<span>' + rotina.total_exercicios + ' Exercícios</span>' +
                '<span>' + rotina.total_series_alvo + ' Séries Totais</span>' +
            '</div>' +
            '<div class="cartao-botoes-row">' +
                '<button class="btn-iniciar-treino btn-iniciar-rotina">Iniciar Treino</button>' +
                '<button class="botao-editar">Editar</button>' +
                '<button class="botao-excluir">Excluir</button>' +
            '</div>';

        card.querySelector('h3').textContent = rotina.nome; // textContent, não innerHTML: nome vem do usuário

        card.querySelector('.btn-iniciar-rotina').addEventListener('click', function () {
            iniciarTreino(rotina.id, rotina.nome);
        });

        card.querySelector('.botao-editar').addEventListener('click', function () {
            window.location.href = 'rotina-editor.html?rotina=' + rotina.id;
        });

        card.querySelector('.botao-excluir').addEventListener('click', async function () {
            const confirmar = confirm('Excluir a rotina "' + rotina.nome + '"? Isso não apaga o histórico de treinos já feitos com ela.');
            if (!confirmar) return;

            const resposta = await fetch('/api/rotinas/' + rotina.id, { method: 'DELETE' });
            if (resposta.ok) {
                carregarRotinas();
            } else {
                alert('Não foi possível excluir a rotina.');
            }
        });

        return card;
    }

    carregarRotinas();
});