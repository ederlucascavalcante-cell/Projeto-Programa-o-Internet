// meu-treino.js

document.addEventListener('DOMContentLoaded', async function () {

    try {
        const respostaMe = await fetch('/api/auth/me');
        if (!respostaMe.ok) { window.location.href = 'login.html'; return; }
    } catch (erro) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('link-sair').addEventListener('click', async function (e) {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
    });

    const listaEl = document.getElementById('lista-historico');

    function formatarData(dataHoraSql) {
        // treinos_realizados.finalizado_em vem como "YYYY-MM-DD HH:MM:SS"
        // (dateStrings: true no pool — ver src/db.js) já na hora local do
        // servidor, então só reformata visualmente, sem conversão de fuso.
        if (!dataHoraSql) return '';
        const [data, hora] = dataHoraSql.split(' ');
        const [ano, mes, dia] = data.split('-');
        return dia + '/' + mes + '/' + ano + ' às ' + hora.slice(0, 5);
    }

    try {
        const resposta = await fetch('/api/treinos');
        const treinos = await resposta.json();

        if (!resposta.ok) {
            listaEl.innerHTML = '<p class="rotinas-vazio">Não foi possível carregar o histórico.</p>';
            return;
        }

        if (treinos.length === 0) {
            listaEl.innerHTML = '<p class="rotinas-vazio">Você ainda não fechou nenhum treino.</p>';
            return;
        }

        listaEl.innerHTML = '';
        treinos.forEach(function (treino) {
            listaEl.appendChild(criarItemHistorico(treino));
        });
    } catch (erro) {
        console.error(erro);
        listaEl.innerHTML = '<p class="rotinas-vazio">Não foi possível conectar ao servidor.</p>';
    }

    function criarItemHistorico(treino) {
        const item = document.createElement('div');
        item.className = 'historico-item';
        item.innerHTML =
            '<button type="button" class="historico-item-cabecalho">' +
                '<div>' +
                    '<h3></h3>' +
                    '<span class="historico-item-data"></span>' +
                '</div>' +
                '<div class="historico-item-resumo">' +
                    '<span>' + treino.total_exercicios + ' exercícios</span>' +
                    '<span>' + treino.total_series + ' séries</span>' +
                    '<strong>' + Number(treino.volume_total_kg || 0).toLocaleString('pt-BR') + ' kg</strong>' +
                '</div>' +
            '</button>' +
            '<div class="historico-item-detalhe" hidden></div>';

        item.querySelector('h3').textContent = treino.nome_treino;
        item.querySelector('.historico-item-data').textContent = formatarData(treino.finalizado_em);

        const botaoCabecalho = item.querySelector('.historico-item-cabecalho');
        const detalheEl = item.querySelector('.historico-item-detalhe');
        let carregado = false;

        botaoCabecalho.addEventListener('click', async function () {
            detalheEl.hidden = !detalheEl.hidden;
            if (detalheEl.hidden || carregado) return;
            carregado = true;

            try {
                const respostaDetalhe = await fetch('/api/treinos/' + treino.id);
                const detalhe = await respostaDetalhe.json();
                detalheEl.innerHTML = detalhe.exercicios.map(function (ex) {
                    const linhasSeries = ex.series.map(function (s, i) {
                        const status = s.concluida ? '✓' : '—';
                        const peso = s.peso_kg !== null ? s.peso_kg + ' kg' : '—';
                        const reps = s.repeticoes !== null ? s.repeticoes + ' reps' : '—';
                        return '<tr><td>' + (i + 1) + '</td><td>' + peso + '</td><td>' + reps + '</td><td>' + status + '</td></tr>';
                    }).join('');

                    return '<div class="historico-exercicio">' +
                        '<h4></h4>' +
                        '<table class="tabela-series-historico">' +
                            '<thead><tr><th>Série</th><th>Kg</th><th>Reps</th><th>✓</th></tr></thead>' +
                            '<tbody>' + linhasSeries + '</tbody>' +
                        '</table>' +
                    '</div>';
                }).join('');

                // nome do exercício via textContent pra cada <h4> (evita innerHTML com dado do usuário)
                detalheEl.querySelectorAll('.historico-exercicio h4').forEach(function (h4, i) {
                    h4.textContent = detalhe.exercicios[i].nome;
                });
            } catch (erro) {
                console.error(erro);
                detalheEl.innerHTML = '<p class="rotinas-vazio">Não foi possível carregar os detalhes.</p>';
            }
        });

        return item;
    }
});
