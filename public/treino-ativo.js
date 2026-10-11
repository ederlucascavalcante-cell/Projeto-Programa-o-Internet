// treino-ativo.js
// Cronômetro, cálculo de volume/séries, edição do treino em andamento
// (adicionar/remover exercício e série) e finalização. Se o treino veio de uma
// rotina e a estrutura mudou, oferece atualizar a rotina ao finalizar.
//
// A biblioteca de exercícios (busca/filtro/modal de personalizado) agora vive
// em biblioteca-exercicios.js.
//
// Depende de AbrirMenu.js e biblioteca-exercicios.js, carregados ANTES deste arquivo.

document.addEventListener('DOMContentLoaded', async function () {

    const parametros = new URLSearchParams(window.location.search);
    const treinoId = parametros.get('treino');

    if (!treinoId) {
        // Esta página nunca cria um treino sozinha — quem cria é usuario.js,
        // que já redireciona pra cá com ?treino=ID. Chegar aqui sem id
        // significa que alguém abriu a URL direto, sem esse passo.
        alert('Nenhum treino em andamento. Volte e clique em "Iniciar Treino".');
        window.location.href = 'usuario.html';
        return;
    }

    // ==========================================================================
    // ELEMENTOS E ESTADO — tudo declarado ANTES de qualquer função ser chamada
    // (evita o ReferenceError de temporal dead zone que já aconteceu aqui)
    // ==========================================================================
    const listaExerciciosEl = document.getElementById('lista-exercicios');
    const tituloTreinoEl = document.getElementById('titulo-treino');
    const volumeTotalEl = document.getElementById('volume-total');
    const seriesConcluidasEl = document.getElementById('series-concluidas');
    const totalExerciciosEl = document.getElementById('total-exercicios');
    const cronometroEl = document.getElementById('cronometro');

    // Preenchida só se o treino veio de uma rotina. É a "foto" da rotina no
    // momento em que a tela abriu, usada pra detectar mudança de estrutura.
    let rotinaOriginal = null;
    let segundosDecorridos = 0;

    // ==========================================================================
    // SÉRIES E CARDS DE EXERCÍCIO
    // ==========================================================================
    function recalcularEstatisticas() {
        const cards = listaExerciciosEl.querySelectorAll('.exercicio-treino-card');
        let volumeTotal = 0, seriesFeitas = 0, seriesTotais = 0;

        cards.forEach(function (card) {
            card.querySelectorAll('.tabela-series tbody tr').forEach(function (linha) {
                seriesTotais++;
                const checkbox = linha.querySelector('.check-serie');
                if (checkbox && checkbox.checked) {
                    const peso = parseFloat(linha.querySelector('.input-peso').value) || 0;
                    const reps = parseFloat(linha.querySelector('.input-reps').value) || 0;
                    volumeTotal += peso * reps;
                    seriesFeitas++;
                }
            });
        });

        volumeTotalEl.textContent = volumeTotal.toLocaleString('pt-BR') + ' kg';
        seriesConcluidasEl.textContent = seriesFeitas + '/' + seriesTotais;
        totalExerciciosEl.textContent = cards.length;
    }

    function criarLinhaSerie(numero, peso, reps, concluida) {
        const linha = document.createElement('tr');
        linha.innerHTML =
            '<td>' + numero + '</td>' +
            '<td><input type="number" class="input-peso" placeholder="kg" min="0"></td>' +
            '<td><input type="number" class="input-reps" placeholder="reps" min="0"></td>' +
            '<td><input type="checkbox" class="check-serie"></td>' +
            '<td><button type="button" class="btn-remover-serie" aria-label="Remover série">✕</button></td>';

        if (peso !== null && peso !== undefined) linha.querySelector('.input-peso').value = peso;
        if (reps !== null && reps !== undefined) linha.querySelector('.input-reps').value = reps;
        linha.querySelector('.check-serie').checked = !!concluida;

        return linha;
    }

    function criarCardExercicio(exercicioId, nome, primario, secundarios) {
        const card = document.createElement('div');
        card.className = 'exercicio-treino-card';
        card.dataset.exercicioId = exercicioId; // usado na hora de salvar o treino
        card.appendChild(Biblioteca.criarCabecalhoCard(nome, primario, secundarios));
        card.insertAdjacentHTML('beforeend',
            '<table class="tabela-series">' +
                '<thead><tr><th>Série</th><th>Kg</th><th>Reps</th><th>✓</th><th></th></tr></thead>' +
                '<tbody></tbody>' +
            '</table>' +
            '<button class="btn-add-serie" type="button">+ Adicionar Série</button>');
        return card;
    }

    function adicionarExercicioAoTreino(exercicio) {
        const card = criarCardExercicio(exercicio.id, exercicio.nome, exercicio.primario, exercicio.secundarios);
        card.querySelector('tbody').appendChild(criarLinhaSerie(1, null, null, false));
        listaExerciciosEl.appendChild(card);
        recalcularEstatisticas();
    }

    // ==========================================================================
    // LEITURA DO ESTADO ATUAL DA TELA + REGRAS DE ATUALIZAÇÃO DA ROTINA
    // (funções que não mexem no DOM, só em dados — fáceis de testar isoladas)
    // ==========================================================================
    function lerExerciciosDoTreino() {
        return Array.from(listaExerciciosEl.querySelectorAll('.exercicio-treino-card')).map(function (card) {
            const series = Array.from(card.querySelectorAll('tbody tr')).map(function (linha) {
                return {
                    peso_kg: linha.querySelector('.input-peso').value || null,
                    repeticoes: linha.querySelector('.input-reps').value || null,
                    concluida: linha.querySelector('.check-serie').checked
                };
            });
            return { exercicio_id: Number(card.dataset.exercicioId), series: series };
        });
    }

    // "Mudou" = a lista/ordem de exercícios ou o número de séries de algum
    // exercício é diferente da rotina. Mudança só de peso/reps NÃO conta: se
    // contasse, quase todo treino dispararia a pergunta (reps nunca batem
    // exatamente com a faixa) e o usuário aprenderia a ignorá-la.
    // O "|| 1" espelha o backend: série_alvo nula vira 1 série ao iniciar o treino.
    function estruturaMudou(exerciciosTreino, exerciciosRotina) {
        if (exerciciosTreino.length !== exerciciosRotina.length) return true;
        return exerciciosTreino.some(function (ex, i) {
            const planejado = exerciciosRotina[i];
            return ex.exercicio_id !== planejado.exercicio_id
                || ex.series.length !== (planejado.series_alvo || 1);
        });
    }

    // Converte o treino na estrutura que PUT /api/rotinas espera.
    // series_alvo = quantidade de séries; reps = menor e maior valor preenchido.
    // Sem nenhuma rep preenchida, mantém a faixa que a rotina já tinha pra esse
    // exercício (em vez de apagar a meta só porque o usuário não digitou reps).
    function metasParaRotina(exerciciosTreino, exerciciosRotina) {
        const planejadoPorExercicio = {};
        exerciciosRotina.forEach(function (re) { planejadoPorExercicio[re.exercicio_id] = re; });

        return exerciciosTreino.map(function (ex) {
            const reps = ex.series.map(function (s) { return Number(s.repeticoes); })
                .filter(function (r) { return r > 0; });
            const planejado = planejadoPorExercicio[ex.exercicio_id];
            return {
                exercicio_id: ex.exercicio_id,
                series_alvo: ex.series.length,
                reps_alvo_min: reps.length ? Math.min.apply(null, reps) : (planejado ? planejado.reps_alvo_min : null),
                reps_alvo_max: reps.length ? Math.max.apply(null, reps) : (planejado ? planejado.reps_alvo_max : null)
            };
        });
    }

    // ==========================================================================
    // API
    // ==========================================================================
    async function buscarRotina(rotinaId) {
        try {
            const resposta = await fetch('/api/rotinas/' + rotinaId);
            return resposta.ok ? await resposta.json() : null;
        } catch (erro) {
            console.error(erro);
            return null; // sem a rotina o treino funciona igual, só não oferece atualizá-la
        }
    }

    async function carregarTreino() {
        try {
            const resposta = await fetch('/api/treinos/' + treinoId);
            if (resposta.status === 401) {
                window.location.href = 'login.html';
                return;
            }
            if (!resposta.ok) {
                alert('Treino não encontrado.');
                window.location.href = 'usuario.html';
                return;
            }
            const treino = await resposta.json();

            tituloTreinoEl.textContent = treino.nome_treino;

            treino.exercicios.forEach(function (ex) {
                const info = Biblioteca.obterExercicio(ex.exercicio_id);
                const primario = info ? info.primario : { chave: '', rotulo: '' };
                const secundarios = info ? info.secundarios : [];

                const card = criarCardExercicio(ex.exercicio_id, ex.nome, primario, secundarios);
                ex.series.forEach(function (serie, indice) {
                    card.querySelector('tbody').appendChild(
                        criarLinhaSerie(indice + 1, serie.peso_kg, serie.repeticoes, serie.concluida)
                    );
                });
                listaExerciciosEl.appendChild(card);
            });

            if (treino.rotina_id) rotinaOriginal = await buscarRotina(treino.rotina_id);

            recalcularEstatisticas();
        } catch (erro) {
            console.error(erro);
            alert('Não foi possível carregar o treino.');
        }
    }

    async function atualizarRotinaComTreino(exerciciosTreino) {
        try {
            const resposta = await fetch('/api/rotinas/' + rotinaOriginal.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                // nome e descrição são reenviados porque o PUT substitui os dois;
                // sem isso a descrição da rotina seria apagada.
                body: JSON.stringify({
                    nome: rotinaOriginal.nome,
                    descricao: rotinaOriginal.descricao,
                    exercicios: metasParaRotina(exerciciosTreino, rotinaOriginal.exercicios)
                })
            });
            if (resposta.ok) return;
        } catch (erro) {
            console.error(erro);
        }
        alert('O treino foi salvo, mas não foi possível atualizar a rotina.');
    }

    // ==========================================================================
    // EVENTOS DA LISTA DE EXERCÍCIOS (delegação)
    // ==========================================================================
    listaExerciciosEl.addEventListener('input', function (e) {
        if (e.target.classList.contains('input-peso') || e.target.classList.contains('input-reps')) {
            recalcularEstatisticas();
        }
    });
    listaExerciciosEl.addEventListener('change', function (e) {
        if (e.target.classList.contains('check-serie')) recalcularEstatisticas();
    });

    listaExerciciosEl.addEventListener('click', function (e) {
        if (e.target.classList.contains('btn-add-serie')) {
            const tbody = e.target.closest('.exercicio-treino-card').querySelector('tbody');
            const numeroSerie = tbody.querySelectorAll('tr').length + 1;
            tbody.appendChild(criarLinhaSerie(numeroSerie, null, null, false));
            recalcularEstatisticas();
            return;
        }

        if (e.target.classList.contains('btn-remover-serie')) {
            const linha = e.target.closest('tr');
            const tbody = linha.closest('tbody');
            if (tbody.querySelectorAll('tr').length <= 1) {
                alert('O exercício precisa ter pelo menos uma série. Use o ✕ no topo do exercício se não quiser mais fazê-lo.');
                return;
            }
            linha.remove();
            tbody.querySelectorAll('tr').forEach(function (l, i) { l.querySelector('td:first-child').textContent = i + 1; });
            recalcularEstatisticas();
            return;
        }

        if (e.target.classList.contains('btn-remover-exercicio')) {
            if (!confirm('Remover este exercício do treino? As séries preenchidas serão perdidas.')) return;
            e.target.closest('.exercicio-treino-card').remove();
            recalcularEstatisticas();
        }
    });

    // ==========================================================================
    // SALVAR E FINALIZAR — PUT /api/treinos/:id (+ PUT /api/rotinas/:id se o
    // usuário aceitar atualizar a rotina)
    // ==========================================================================
    document.getElementById('btn-fechar-treino').addEventListener('click', async function () {
        if (!confirm('Deseja encerrar e salvar este treino?')) return;

        const exercicios = lerExerciciosDoTreino();

        // Pergunta ANTES de qualquer chamada de rede: assim não existe um
        // segundo prompt depois do treino já salvo, e o treino nunca fica
        // salvo pela metade por causa de uma decisão pendente.
        const atualizarRotina = rotinaOriginal !== null
            && estruturaMudou(exercicios, rotinaOriginal.exercicios)
            && confirm('Você mudou os exercícios ou o número de séries.\nAtualizar a rotina "' + rotinaOriginal.nome + '" com essas mudanças?');

        try {
            const resposta = await fetch('/api/treinos/' + treinoId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exercicios: exercicios })
            });
            if (!resposta.ok) {
                const dados = await resposta.json();
                alert(dados.erro || 'Não foi possível salvar o treino.');
                return;
            }
        } catch (erro) {
            console.error(erro);
            alert('Não foi possível conectar ao servidor. O treino NÃO foi salvo.');
            return;
        }

        if (atualizarRotina) await atualizarRotinaComTreino(exercicios);

        window.location.href = 'meu-treino.html';
    });

    // ==========================================================================
    // DESCARTAR TREINO (sem salvar) — DELETE /api/treinos/:id
    // ==========================================================================
    document.getElementById('btn-descartar-treino').addEventListener('click', async function () {
        if (!confirm('Descartar este treino? O progresso será perdido e não poderá ser recuperado.')) return;

        try {
            await fetch('/api/treinos/' + treinoId, { method: 'DELETE' });
        } catch (erro) {
            console.error(erro);
        }
        window.location.href = 'usuario.html';
    });

    // ==========================================================================
    // CRONÔMETRO
    // ==========================================================================
    function formatarTempo(totalSegundos) {
        const h = String(Math.floor(totalSegundos / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSegundos % 3600) / 60)).padStart(2, '0');
        const s = String(totalSegundos % 60).padStart(2, '0');
        return h + ':' + m + ':' + s;
    }

    setInterval(function () {
        segundosDecorridos++;
        cronometroEl.textContent = formatarTempo(segundosDecorridos);
    }, 1000);

    // ==========================================================================
    // INICIALIZAÇÃO — só aqui as funções acima são chamadas
    // ==========================================================================
    // A biblioteca vem primeiro: carregarTreino() precisa do catálogo pra montar as badges.
    const autenticado = await Biblioteca.iniciar({ aoSelecionar: adicionarExercicioAoTreino });
    if (!autenticado) return;

    await carregarTreino();
});