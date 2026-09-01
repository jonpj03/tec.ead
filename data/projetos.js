/* =========================================================
   data/projetos.js — snapshot publicado
   Gerado pelo OpsBoard em 01/09/2026 às 16:07
   1 projeto.

   Substitua este arquivo no repositório e publique.
   ========================================================= */
window.OPSBOARD_SNAPSHOT = {
  "publishedAt": "2026-09-01T19:07:19.237Z",
  "label": "",
  "projects": [
    {
      "id": "prj_mtiyfkpo_fx1ixv",
      "name": "TESTE WALLACE DE DADOS",
      "description": "DEDED",
      "owner": "Marina Alves",
      "area": "Tecnologia",
      "statusId": "st_paused",
      "criticalityId": "cr_attention",
      "startDate": "2026-08-30",
      "dueDate": "2026-08-31",
      "tags": [
        "diretoria"
      ],
      "flags": [],
      "items": {
        "doing": [],
        "risks": [
          {
            "id": "it_mtiyh6cc_4a3ehb",
            "text": "1 MES PRA REALIZA",
            "done": false,
            "createdAt": "2026-09-01T17:43:17.340Z"
          }
        ],
        "next": [
          {
            "id": "it_mtiyh6cc_bz61kq",
            "text": "ENTREGAR DADOS COMPLETOS",
            "done": false,
            "createdAt": "2026-09-01T17:43:17.340Z"
          }
        ],
        "done": [
          {
            "id": "it_mtiyh6cc_5eafh0",
            "text": "TRATANDO DADOS",
            "done": true,
            "createdAt": "2026-09-01T17:43:17.340Z"
          },
          {
            "id": "it_mtiyh6cc_s0339l",
            "text": "BASE ENVIADA para WALLACE",
            "done": true,
            "createdAt": "2026-09-01T17:43:17.340Z"
          }
        ]
      },
      "history": [
        {
          "id": "hst_mtiyjjas_34dd8x",
          "ts": "2026-09-01T17:45:07.444Z",
          "changes": [
            "Prazo previsto: 31/08/2026",
            "Data de início: 30/08/2026"
          ]
        },
        {
          "id": "hst_mtiyilpg_zhcng4",
          "ts": "2026-09-01T17:44:23.908Z",
          "changes": [
            "Projeto revisado sem alterações de conteúdo"
          ]
        },
        {
          "id": "hst_mtiyhwud_ygm1dj",
          "ts": "2026-09-01T17:43:51.685Z",
          "changes": [
            "Status alterado de Concluído para Pausado"
          ]
        },
        {
          "id": "hst_mtiyhvdo_ez6pin",
          "ts": "2026-09-01T17:43:49.788Z",
          "changes": [
            "Status alterado de Pausado para Concluído"
          ]
        },
        {
          "id": "hst_mtiyhtnh_gouqrh",
          "ts": "2026-09-01T17:43:47.549Z",
          "changes": [
            "Status alterado de Ativo para Pausado"
          ]
        },
        {
          "id": "hst_mtiyhrcl_7bms9i",
          "ts": "2026-09-01T17:43:44.565Z",
          "changes": [
            "Status alterado de Parado para Ativo"
          ]
        },
        {
          "id": "hst_mtiyhg4l_9qqny9",
          "ts": "2026-09-01T17:43:30.021Z",
          "changes": [
            "Item concluído: TRATANDO DADOS"
          ]
        },
        {
          "id": "hst_mtiyh6cc_b7rq32",
          "ts": "2026-09-01T17:43:17.340Z",
          "changes": [
            "Projeto criado"
          ]
        }
      ],
      "createdAt": "2026-09-01T17:42:02.652Z",
      "updatedAt": "2026-09-01T17:45:07.444Z"
    }
  ],
  "settings": {
    "schema": 1,
    "theme": "light",
    "statuses": [
      {
        "id": "st_active",
        "label": "Ativo",
        "color": "#17805a",
        "kind": "active"
      },
      {
        "id": "st_paused",
        "label": "Pausado",
        "color": "#b8860b",
        "kind": "paused"
      },
      {
        "id": "st_stopped",
        "label": "Parado",
        "color": "#c03a3a",
        "kind": "stopped"
      },
      {
        "id": "st_done",
        "label": "Concluído",
        "color": "#6c7689",
        "kind": "done"
      }
    ],
    "criticalities": [
      {
        "id": "cr_normal",
        "label": "Normal",
        "color": "#17805a",
        "weight": 1
      },
      {
        "id": "cr_attention",
        "label": "Atenção",
        "color": "#b8860b",
        "weight": 2
      },
      {
        "id": "cr_critical",
        "label": "Crítico",
        "color": "#c03a3a",
        "weight": 3
      }
    ],
    "flags": [
      {
        "id": "fl_dep",
        "label": "Dependência externa",
        "color": "#7a4fd0"
      },
      {
        "id": "fl_ti",
        "label": "Aguardando TI",
        "color": "#2a6bb0"
      },
      {
        "id": "fl_forn",
        "label": "Aguardando fornecedor",
        "color": "#b4632c"
      },
      {
        "id": "fl_prazo",
        "label": "Risco de prazo",
        "color": "#c03a3a"
      },
      {
        "id": "fl_prio",
        "label": "Alta prioridade",
        "color": "#a3325f"
      },
      {
        "id": "fl_block",
        "label": "Bloqueado",
        "color": "#4b5468"
      }
    ],
    "areas": [
      "Operações",
      "Tecnologia",
      "Financeiro",
      "Comercial",
      "Qualidade"
    ],
    "prefs": {
      "staleDays": 7,
      "pageSize": 25,
      "confirmDelete": true,
      "demoDismissed": false
    },
    "trello": {
      "agingAttention": 7,
      "agingCritical": 14,
      "defaultPeriod": 30,
      "doneKeywords": "concluido, concluído, done, finalizado, entregue, publicado, completo, aprovado, finalizada",
      "doingKeywords": "producao, produção, doing, andamento, execucao, execução, em progresso, wip, revisao, revisão, review, edicao, edição",
      "treatArchivedAsDone": false
    }
  }
};
