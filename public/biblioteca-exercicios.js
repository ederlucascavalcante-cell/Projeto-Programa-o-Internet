// biblioteca-exercicios.js
// Módulo compartilhado por treino-ativo.js e rotina-editor.js: catálogo de
// exercícios (GET /api/exercicios), painel da biblioteca (busca + filtro por
// músculo) e modal de exercício personalizado (POST /api/exercicios).
//
// Antes isso morava dentro do treino-ativo.js. Foi extraído pra que a tela de
// editar rotina use exatamente o mesmo código em vez de uma cópia (DRY).
//
// Depende de AbrirMenu.js (comportamento dos .custom-select), carregado ANTES.
// A página que usar precisa ter no HTML o mesmo painel e o mesmo modal
// (ids: widget-adicionar-exercicio, biblioteca-painel, modal-personalizado-overlay...).
//
// Uso:
//   const autenticado = await Biblioteca.iniciar({ aoSelecionar: function (exercicio) { ... } });
//   if (!autenticado) return;

const Biblioteca = (function () {

    let exerciciosDisponiveis = [];
    const exerciciosPorId = {};

    // ==========================================================================
    // HELPERS
    // ==========================================================================
    function normalizar(texto) {
        return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function montarBadges(primario, secundarios) {
        const grupos = [primario].concat(secundarios || []);
        return grupos.filter(function (g) { return g && g.rotulo; }).map(function (g, i) {
            return '<span class="tag-musculo' + (i === 0 ? ' tag-primario' : '') + '">' + g.rotulo + '</span>';
        }).join('');
    }

    // Cabeçalho do card de exercício (nome + badges + botão remover). É a única
    // parte que o card do treino ativo e o card do editor de rotina têm em
    // comum; o corpo de cada um (tabela de séries / metas) é diferente.
    function criarCabecalhoCard(nome, primario, secundarios) {
        const cabecalho = document.createElement('div');
        cabecalho.className = 'exercicio-treino-header';
        cabecalho.innerHTML =
            '<h3></h3>' +
            '<div class="badges-exercicio">' + montarBadges(primario, secundarios) + '</div>' +
            '<button type="button" class="btn-remover-exercicio" aria-label="Remover exercício">✕</button>';
        cabecalho.querySelector('h3').textContent = nome;
        return cabecalho;
    }

    function resetarCustomSelect(container, textoPlaceholder) {
        container.querySelectorAll('.option').forEach(function (opt) { opt.classList.remove('active'); });
        const placeholder = container.querySelector('.option[data-value=""]');
        if (placeholder) placeholder.classList.add('active');
        container.querySelector('.selected-text').textContent = textoPlaceholder;
    }

    function resetarCustomSelectMulti(container, textoPlaceholder) {
        container.querySelectorAll('.option').forEach(function (opt) { opt.classList.remove('active'); });
        container.querySelector('.selected-text').textContent = textoPlaceholder;
    }

    function valorFiltroAtivo(containerSelect) {
        const ativo = containerSelect.querySelector('.option.active');
        return ativo ? ativo.getAttribute('data-value') : '';
    }

    // ==========================================================================
    // CATÁLOGO
    // ==========================================================================
    // Retorna false se o usuário não está logado (já redirecionou pro login).
    async function carregarCatalogo() {
        try {
            const resposta = await fetch('/api/exercicios');
            if (resposta.status === 401) {
                window.location.href = 'login.html';
                return false;
            }
            exerciciosDisponiveis = await resposta.json();
            exerciciosDisponiveis.forEach(function (ex) { exerciciosPorId[ex.id] = ex; });
        } catch (erro) {
            console.error(erro);
            alert('Não foi possível carregar a biblioteca de exercícios.');
        }
        return true;
    }

    // ==========================================================================
    // PAINEL DA BIBLIOTECA (sidebar)
    // ==========================================================================
    function ligarPainel(aoSelecionar) {
        const widgetAdicionar = document.getElementById('widget-adicionar-exercicio');
        const painel = document.getElementById('biblioteca-painel');
        const listaEl = document.getElementById('biblioteca-lista');
        const inputBusca = document.getElementById('input-busca-exercicio');
        const selectMusculo = document.getElementById('select-filtro-musculo');

        function alternarPainel(abrir) {
            painel.hidden = !abrir;
            painel.style.display = abrir ? 'flex' : 'none';
            widgetAdicionar.hidden = abrir;
            widgetAdicionar.style.display = abrir ? 'none' : 'block';
        }

        function renderizarLista() {
            const musculoFiltro = valorFiltroAtivo(selectMusculo);
            const busca = normalizar(inputBusca.value);

            const filtrados = exerciciosDisponiveis.filter(function (ex) {
                if (musculoFiltro) {
                    const bateComPrimario = ex.primario.chave === musculoFiltro;
                    const bateComSecundario = ex.secundarios.some(function (s) { return s.chave === musculoFiltro; });
                    if (!bateComPrimario && !bateComSecundario) return false;
                }
                if (busca && normalizar(ex.nome).indexOf(busca) === -1) return false;
                return true;
            });

            listaEl.innerHTML = '';

            if (filtrados.length === 0) {
                listaEl.innerHTML = '<p class="biblioteca-vazio">Nenhum exercício encontrado.</p>';
                return;
            }

            filtrados.forEach(function (ex) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'biblioteca-item';
                item.dataset.id = ex.id;
                item.innerHTML =
                    '<span class="biblioteca-item-icone">🏋️</span>' +
                    '<span class="biblioteca-item-info">' +
                        '<span class="biblioteca-item-nome"></span>' +
                        '<span class="badges-exercicio">' + montarBadges(ex.primario, ex.secundarios) + '</span>' +
                    '</span>';
                item.querySelector('.biblioteca-item-nome').textContent = ex.nome;
                listaEl.appendChild(item);
            });
        }

        function resetarFiltros() {
            resetarCustomSelect(selectMusculo, 'Todos os músculos');
            inputBusca.value = '';
            renderizarLista();
        }

        alternarPainel(false); // estado inicial: só o botão "Adicionar Exercício"

        document.getElementById('btn-abrir-biblioteca').addEventListener('click', function (e) {
            e.stopPropagation();
            alternarPainel(true);
            renderizarLista();
            inputBusca.focus();
        });

        document.getElementById('btn-fechar-biblioteca').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            alternarPainel(false);
        });

        inputBusca.addEventListener('input', renderizarLista);

        document.getElementById('btn-limpar-busca').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            inputBusca.value = '';
            renderizarLista();
            inputBusca.focus();
        });

        selectMusculo.querySelectorAll('.option').forEach(function (opt) {
            opt.addEventListener('click', renderizarLista);
        });

        listaEl.addEventListener('click', function (e) {
            const item = e.target.closest('.biblioteca-item');
            if (!item) return;

            const exercicio = exerciciosPorId[item.dataset.id];
            if (!exercicio) return;

            aoSelecionar(exercicio);

            const nomeEl = item.querySelector('.biblioteca-item-nome');
            const textoOriginal = nomeEl.textContent;
            nomeEl.textContent = '✓ Adicionado — ' + textoOriginal;
            item.disabled = true;
            setTimeout(function () { nomeEl.textContent = textoOriginal; item.disabled = false; }, 1200);
        });

        return { resetarFiltros: resetarFiltros };
    }

    // ==========================================================================
    // MODAL: EXERCÍCIO PERSONALIZADO — grava via POST /api/exercicios
    // ==========================================================================
    function ligarModalPersonalizado(aoCadastrar) {
        const modalOverlay = document.getElementById('modal-personalizado-overlay');
        const form = document.getElementById('form-exercicio-personalizado');
        const nomeInput = document.getElementById('pers-nome-exercicio');
        const selectPrimario = document.getElementById('pers-select-primario');
        const selectSecundario = document.getElementById('pers-select-secundario');
        const descInput = document.getElementById('pers-desc-exercicio');
        const nomeErroEl = document.getElementById('pers-nome-erro');
        const primarioErroEl = document.getElementById('pers-primario-erro');

        function resetarForm() {
            form.reset();
            nomeErroEl.textContent = '';
            primarioErroEl.textContent = '';
            resetarCustomSelect(selectPrimario, 'Selecione um agrupamento');
            resetarCustomSelectMulti(selectSecundario, 'Nenhum agrupamento selecionado');
        }

        function abrir() {
            modalOverlay.hidden = false;
            modalOverlay.style.display = 'flex';
            nomeInput.focus();
        }

        function fechar() {
            modalOverlay.hidden = true;
            modalOverlay.style.display = 'none';
            resetarForm();
        }

        document.getElementById('btn-abrir-personalizado').addEventListener('click', abrir);
        document.getElementById('btn-fechar-modal').addEventListener('click', fechar);
        modalOverlay.addEventListener('click', function (e) { if (e.target === modalOverlay) fechar(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modalOverlay.hidden) fechar(); });

        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            nomeErroEl.textContent = '';
            primarioErroEl.textContent = '';
            let valido = true;

            const nome = nomeInput.value.trim();
            if (!nome) { nomeErroEl.textContent = 'Campo obrigatório'; valido = false; }

            const opcaoPrimarioAtiva = selectPrimario.querySelector('.option.active');
            const primarioChave = opcaoPrimarioAtiva ? opcaoPrimarioAtiva.getAttribute('data-value') : '';
            const primarioRotulo = opcaoPrimarioAtiva ? opcaoPrimarioAtiva.textContent : '';
            if (!primarioChave) { primarioErroEl.textContent = 'Selecione um agrupamento primário'; valido = false; }

            if (!valido) return;

            const opcoesSecundarias = Array.from(selectSecundario.querySelectorAll('.option.active'))
                .filter(function (opt) { return opt.getAttribute('data-value') !== primarioChave; });
            const secundariosChaves = opcoesSecundarias.map(function (opt) { return opt.getAttribute('data-value'); });

            try {
                const resposta = await fetch('/api/exercicios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: nome,
                        grupo_primario_chave: primarioChave,
                        secundarios: secundariosChaves,
                        descricao: descInput.value.trim()
                    })
                });
                const dados = await resposta.json();
                if (!resposta.ok) {
                    nomeErroEl.textContent = dados.erro || 'Não foi possível cadastrar.';
                    return;
                }

                const novoExercicio = {
                    id: dados.id,
                    nome: nome,
                    personalizado: true,
                    primario: { chave: primarioChave, rotulo: primarioRotulo },
                    secundarios: opcoesSecundarias.map(function (opt) {
                        return { chave: opt.getAttribute('data-value'), rotulo: opt.textContent };
                    })
                };
                exerciciosDisponiveis.unshift(novoExercicio);
                exerciciosPorId[novoExercicio.id] = novoExercicio;

                aoCadastrar();
                fechar();
            } catch (erro) {
                console.error(erro);
                nomeErroEl.textContent = 'Não foi possível conectar ao servidor.';
            }
        });
    }

    // ==========================================================================
    // API PÚBLICA
    // ==========================================================================
    // Retorna false se o usuário não está autenticado (a página deve parar).
    async function iniciar(opcoes) {
        const autenticado = await carregarCatalogo();
        if (!autenticado) return false;

        const painel = ligarPainel(opcoes.aoSelecionar);
        ligarModalPersonalizado(painel.resetarFiltros);
        return true;
    }

    function obterExercicio(id) {
        return exerciciosPorId[id];
    }

    return {
        iniciar: iniciar,
        obterExercicio: obterExercicio,
        montarBadges: montarBadges,
        criarCabecalhoCard: criarCabecalhoCard
    };
})();
