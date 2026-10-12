## Setup

1. Link hospedado pelo render: https://projeto-programacao-internet.onrender.com/inicio.html

## O que NÃO foi feito

- **RF01** - Consistência Semanal: Permitir editar a aba de consistência semanal, selecionando quais dias devem ser contabilizados.
- **RF02** - Catálogo de Exercícios: Desenvolver as páginas contendo todos os exercícios, incluindo imagens, descrições e detalhes completos.
- **RF03** - Rotina em Segundo Plano: O sistema deve manter a rotina de treino e os temporizadores ativos e com o estado preservado quando o usuário sair da tela, mas não abandonar a execução.
- **RNF01** - Compatibilidade e Suporte Mobile: O sistema deve ser compatível e otimizado para execução em dispositivos móveis (smartphones), garantindo interface responsiva e bom desempenho
- **RF04** - Alerta Personalizado: Implementar o componente de alerta customizado com as opções de OK / Cancelar.
- **RF05** - Ícone de Cabeçalho (Favicon): Ajustar o ícone no <head> da página.
- **RF06** - Agrupamento em Rotinas: Estruturar as rotinas de treino para conterem os agrupamentos principais de exercícios.
- **RF07** - Tipagem de Séries: Incluir a exigência do tipo de série suportada durante o cadastro do exercício.

## Segurança — pontos que valem atenção antes de considerar isso pronto

- `express-session` está usando o `MemoryStore` padrão. Funciona para desenvolvimento, mas todo mundo é
  deslogado se o processo reiniciar, e não escala pra mais de um processo
  Node. Para produção, trocar por `connect-mysql2` ou similar.
