/* =========================================================
   seed.js — projetos de demonstração da primeira execução
   Exposto globalmente como window.Seed
   ========================================================= */
(function (global) {
  'use strict';

  const daysAgo = n => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(9 + (n % 8), (n * 7) % 60, 0, 0);
    return d.toISOString();
  };
  const dateOnly = n => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return U.toDateInput(d);
  };
  const items = (texts, done) => texts.map((t, i) => ({
    id: U.uid('it'), text: t, done: !!done, createdAt: daysAgo(20 - i)
  }));

  const DEMO = [
    {
      id: 'demo_bi',
      name: 'Implantação BI Operacional',
      description: 'Consolidar os indicadores de produção em um painel único, substituindo as planilhas manuais enviadas por e-mail toda segunda-feira.',
      owner: 'Marina Alves',
      area: 'Tecnologia',
      statusId: 'st_active',
      criticalityId: 'cr_attention',
      startDate: dateOnly(-58),
      dueDate: dateOnly(24),
      tags: ['dados', 'indicadores', 'q3'],
      flags: ['fl_ti', 'fl_prio'],
      items: {
        doing: items(['Modelagem da camada de dados', 'Validação dos indicadores com a operação', 'Ajuste de performance das consultas']),
        risks: items(['Acesso ao banco de produção ainda pendente com a TI', 'Regras de cálculo divergentes entre áreas']),
        next: items(['Homologação com os gestores', 'Treinamento das equipes', 'Publicação da versão 1.0']),
        done: items(['Levantamento de requisitos concluído', 'Definição do dicionário de indicadores', 'Protótipo aprovado pela diretoria'], true)
      },
      createdAt: daysAgo(58),
      updatedAt: daysAgo(1),
      history: [
        { id: U.uid('hst'), ts: daysAgo(1), changes: ['Ponto de atenção adicionado: acesso ao banco de produção', 'Item concluído: protótipo aprovado'] },
        { id: U.uid('hst'), ts: daysAgo(8), changes: ['Próximo passo atualizado: homologação com os gestores'] },
        { id: U.uid('hst'), ts: daysAgo(16), changes: ['Projeto criado'] }
      ]
    },
    {
      id: 'demo_trello',
      name: 'Automação do fluxo no Trello',
      description: 'Padronizar listas, etiquetas e automações do quadro de produção para permitir extração confiável de métricas.',
      owner: 'Rafael Nunes',
      area: 'Operações',
      statusId: 'st_active',
      criticalityId: 'cr_normal',
      startDate: dateOnly(-31),
      dueDate: dateOnly(12),
      tags: ['processos', 'automacao'],
      flags: [],
      items: {
        doing: items(['Padronização das listas do quadro', 'Configuração das automações de movimentação']),
        risks: items(['Equipe ainda usa nomenclaturas diferentes nos cards']),
        next: items(['Documentar o novo fluxo', 'Rodar piloto por duas semanas']),
        done: items(['Mapeamento do fluxo atual', 'Definição do padrão de nomenclatura'], true)
      },
      createdAt: daysAgo(31),
      updatedAt: daysAgo(3),
      history: [
        { id: U.uid('hst'), ts: daysAgo(3), changes: ['Item concluído: definição do padrão de nomenclatura'] },
        { id: U.uid('hst'), ts: daysAgo(12), changes: ['Projeto criado'] }
      ]
    },
    {
      id: 'demo_canvas',
      name: 'Integração Canvas × ERP',
      description: 'Sincronizar matrículas e turmas entre o Canvas e o ERP acadêmico, eliminando a digitação dupla feita pela secretaria.',
      owner: 'Camila Duarte',
      area: 'Tecnologia',
      statusId: 'st_paused',
      criticalityId: 'cr_critical',
      startDate: dateOnly(-96),
      dueDate: dateOnly(-9),
      tags: ['integracao', 'academico'],
      flags: ['fl_dep', 'fl_forn', 'fl_prazo'],
      items: {
        doing: items(['Testes de carga da API do fornecedor']),
        risks: items([
          'Fornecedor sem previsão de entrega do endpoint de turmas',
          'Prazo original já ultrapassado',
          'Sem ambiente de homologação disponível'
        ]),
        next: items(['Reunião de escalonamento com o fornecedor', 'Revisar o cronograma com a diretoria']),
        done: items(['Mapeamento dos campos entre sistemas', 'Contrato de integração assinado'], true)
      },
      createdAt: daysAgo(96),
      updatedAt: daysAgo(18),
      history: [
        { id: U.uid('hst'), ts: daysAgo(18), changes: ['Status alterado para Pausado', 'Ponto de atenção adicionado: fornecedor sem previsão'] },
        { id: U.uid('hst'), ts: daysAgo(40), changes: ['Criticidade alterada para Crítico'] }
      ]
    },
    {
      id: 'demo_padrao',
      name: 'Padronização Operacional',
      description: 'Revisar e publicar os procedimentos operacionais das equipes de produção, com checklists por tipo de demanda.',
      owner: 'Rafael Nunes',
      area: 'Qualidade',
      statusId: 'st_stopped',
      criticalityId: 'cr_attention',
      startDate: dateOnly(-140),
      dueDate: dateOnly(-30),
      tags: ['processos', 'documentacao'],
      flags: ['fl_block'],
      items: {
        doing: [],
        risks: items(['Parado desde a saída do analista responsável', 'Sem substituto definido']),
        next: items(['Definir novo responsável', 'Retomar a revisão dos procedimentos']),
        done: items(['Diagnóstico das lacunas de documentação'], true)
      },
      createdAt: daysAgo(140),
      updatedAt: daysAgo(46),
      history: [
        { id: U.uid('hst'), ts: daysAgo(46), changes: ['Status alterado para Parado'] }
      ]
    },
    {
      id: 'demo_indicadores',
      name: 'Painel de Indicadores da Diretoria',
      description: 'Ciclo mensal de indicadores estratégicos apresentados na reunião de diretoria.',
      owner: 'Marina Alves',
      area: 'Operações',
      statusId: 'st_done',
      criticalityId: 'cr_normal',
      startDate: dateOnly(-180),
      dueDate: dateOnly(-20),
      tags: ['indicadores', 'diretoria'],
      flags: [],
      items: {
        doing: [],
        risks: [],
        next: items(['Avaliar a evolução para automação trimestral']),
        done: items([
          'Definição dos indicadores estratégicos',
          'Construção do painel',
          'Primeira apresentação realizada',
          'Ciclo mensal estabilizado'
        ], true)
      },
      createdAt: daysAgo(180),
      updatedAt: daysAgo(22),
      history: [
        { id: U.uid('hst'), ts: daysAgo(22), changes: ['Status alterado para Concluído', 'Item concluído: ciclo mensal estabilizado'] }
      ]
    }
  ];

  global.Seed = {
    projects() { return JSON.parse(JSON.stringify(DEMO)); },
    ids() { return DEMO.map(p => p.id); }
  };
})(window);
