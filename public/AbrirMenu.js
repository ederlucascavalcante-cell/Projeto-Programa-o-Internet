document.querySelectorAll('.custom-select').forEach(select => {
  const btn = select.querySelector('.select-btn');
  const optionsList = select.querySelector('.select-options');
  const selectedText = select.querySelector('.selected-text');
  const isMulti = select.classList.contains('multi-select');

  // Abre e fecha o dropdown clicado
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Fecha outros dropdowns abertos
    document.querySelectorAll('.select-options').forEach(list => {
      if (list !== optionsList) list.classList.remove('show');
    });
    optionsList.classList.toggle('show');
  });

  // Lógica de Seleção — delegada na lista, e não em cada <li>, pra que opções
  // adicionadas depois (ex: carregadas da API) também funcionem.
  optionsList.addEventListener('click', (e) => {
    const option = e.target.closest('.option');
    if (!option) return;
    e.stopPropagation();

    const options = optionsList.querySelectorAll('.option');

    if (isMulti) {
      // --- SELEÇÃO MÚLTIPLA ---
      option.classList.toggle('active');

      // Pega todos os itens marcados
      const selected = Array.from(options)
        .filter(opt => opt.classList.contains('active'))
        .map(opt => opt.textContent.trim());

      if (selected.length === 0) {
        selectedText.textContent = 'Nenhum selecionado';
      } else {
        selectedText.textContent = selected.join(', ');
      }
    } else {
      // --- SELEÇÃO ÚNICA ---
      options.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      selectedText.textContent = option.textContent.trim();
      optionsList.classList.remove('show');
    }
  });
});

// Fecha qualquer dropdown se clicar fora
document.addEventListener('click', () => {
  document.querySelectorAll('.select-options').forEach(list => {
    list.classList.remove('show');
  });
});