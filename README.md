# OpsBoard — Gestão macro de projetos + Analisador de CSV do Trello

Aplicação web **100% estática**: HTML, CSS e JavaScript puros. Sem backend, sem banco de dados, sem
autenticação, sem chamadas de rede. Abra o `index.html` e ela funciona — inclusive offline.

Duas frentes na mesma plataforma:

1. **Gestão macro de projetos** — visão executiva do portfólio, com status, criticidade, flags,
   itens em andamento, pontos de atenção, próximos passos, realizado e histórico de atualizações.
2. **Analisador de CSV do Trello** — leitura local de um export do Trello, com dashboard temporário
   de produtividade da equipe de produção. O arquivo nunca sai do navegador.

---

## 1. Estrutura dos arquivos

```
opsboard/
├── index.html                 Casca da SPA: sidebar, topbar, sprite de ícones SVG, contêineres
├── data/
│   └── projetos.js            Snapshot publicado (opcional) — gerado em Configurações
├── staticwebapp.config.json   Config do Azure Static Web Apps (fallback de rota)
├── web.config                 Config do Azure App Service / IIS (MIME types, documento padrão)
├── css/
│   ├── base.css               Tokens de design, temas claro/escuro, reset, utilitários
│   ├── layout.css             Grid da aplicação, sidebar (off-canvas no celular), topbar, impressão
│   ├── components.css         Botões, cartões, tabelas, campos, modais, toasts, abas, paginação
│   ├── dashboard.css          Blocos específicos do dashboard executivo
│   ├── projects.css           Tabela de projetos, quadro de itens, formulário, histórico
│   └── trello.css             Dropzone, mapeamento de colunas, insights, tabela de dados brutos
└── js/
    ├── utils.js               Formatação, datas, ordenação, exportação de arquivos, helpers
    ├── storage.js             Camada de dados sobre o localStorage (projetos + configurações)
    ├── ui.js                  Modais, confirmações, toasts, badges, dropdowns, campo de chips
    ├── charts.js              Gráficos em SVG próprio (barras, linhas, rosca, área, sparkline)
    ├── seed.js                Cinco projetos de demonstração
    ├── projects.js            Lista, filtros, detalhe, quadro de itens, formulário, histórico
    ├── dashboard.js           KPIs, projetos que precisam de atenção, distribuições
    ├── csv-parser.js          Leitor de CSV próprio (RFC 4180 tolerante, detecção de separador)
    ├── analytics.js           Motor de métricas do Trello (o coração da análise)
    ├── trello.js              Telas do analisador: upload, mapeamento, abas, exportações
    ├── settings.js            Personalização, preferências e backup/restauração
    └── app.js                 Roteador por hash, tema, inicialização
```

**Sem CDN e sem dependências externas.** O pedido original sugeria Chart.js, PapaParse e Lucide.
Optei por implementações próprias equivalentes (`charts.js`, `csv-parser.js` e o sprite SVG inline)
porque a aplicação promete que nada trafega para fora do navegador — carregar scripts de terceiros
contradiria isso, criaria dependência de rede e quebraria o uso offline. Resultado: nenhuma
requisição externa em runtime.

---

## 2. Execução local

**Opção A — abrir direto:** dê duplo clique em `index.html`. Funciona no `file://` porque não há
módulos ES nem `fetch` de arquivos locais.

**Opção B — servidor local** (recomendado para testar como ficará publicado):

```bash
# Python 3
python -m http.server 8080

# ou Node
npx serve .
```

Depois acesse `http://localhost:8080`.

Navegadores suportados: versões atuais de Chrome, Edge, Firefox e Safari.

---

## 3. Publicação no GitHub Pages

1. Crie o repositório e envie os arquivos com o `index.html` **na raiz**:

   ```bash
   git init
   git add .
   git commit -m "OpsBoard"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git push -u origin main
   ```

2. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   selecione `main` e a pasta `/ (root)`. Salve.
3. Em um a dois minutos o site fica em `https://SEU-USUARIO.github.io/SEU-REPO/`.

Não é preciso criar `.nojekyll` (não há pastas iniciadas por `_`), nem ajustar caminhos: todos os
`href`/`src` são relativos, então a aplicação funciona em subdiretório.

---

## 4. Publicação no Azure

### 4.1 Azure Static Web Apps (opção mais simples e gratuita no tier Free)

Pelo portal:

1. **Criar recurso → Static Web App**.
2. Origem: **GitHub** → escolha o repositório e a branch.
3. Em *Build Details*, use o preset **Custom** e preencha:
   - *App location:* `/`
   - *Api location:* (vazio)
   - *Output location:* (vazio)
4. Criar. O Azure gera um workflow do GitHub Actions e publica a cada push.

O arquivo `staticwebapp.config.json` já acompanha o projeto e redireciona qualquer rota
desconhecida para o `index.html`, o que mantém o roteador por hash funcionando.

Pela CLI:

```bash
npm install -g @azure/static-web-apps-cli
swa deploy ./ --env production
```

### 4.2 Azure App Service

1. Crie um **App Service** (Windows ou Linux; qualquer runtime serve, pois só há arquivos estáticos).
2. Publique o conteúdo da pasta para `/site/wwwroot` — via **Deployment Center** (GitHub Actions),
   FTPS ou ZIP Deploy:

   ```bash
   # ZIP deploy
   zip -r opsboard.zip .
   az webapp deploy --resource-group MEU-GRUPO --name MEU-APP --src-path opsboard.zip --type zip
   ```

3. No Windows/IIS o `web.config` incluído define `index.html` como documento padrão e registra os
   MIME types. No Linux, configure o *Startup Command* como:

   ```
   pm2 serve /home/site/wwwroot --no-daemon
   ```

Em qualquer cenário, use **HTTPS**: o `localStorage` fica isolado por origem, então trocar de
domínio significa começar com a base vazia.

---

## 5. Armazenamento local

- Tudo é gravado no `localStorage` do navegador, sob as chaves `opsboard.v1.projects`,
  `opsboard.v1.settings` e `opsboard.v1.meta`.
- **Os dados pertencem ao par navegador + domínio.** Trocar de máquina, de navegador, usar janela
  anônima ou limpar os dados de navegação zera a base. Não há sincronização — é uma consequência
  direta de não existir backend.
- Se o navegador bloquear o armazenamento (modo restrito, cookies de terceiros desativados em
  alguns contextos), a aplicação detecta a situação, avisa na tela e passa a operar em memória:
  tudo funciona, mas se perde ao fechar a aba. Nesse caso, exporte um backup antes de sair.
- Em **Configurações → Seus dados** você vê quantos KB estão ocupados.
- Os cinco projetos de demonstração são criados apenas na primeira visita. Há botões para
  **remover os dados de demonstração** (preservando os seus) e para recarregá-los.
- O CSV do Trello **não** é persistido. A análise vive apenas na sessão: ao recarregar a página,
  basta enviar o arquivo novamente. Isso é intencional — o export costuma conter dados de pessoas.

---

## 6. Importação e exportação

Em **Configurações → Seus dados**:

| Ação | O que faz |
|---|---|
| **Exportar backup (JSON)** | Gera `opsboard-backup-AAAA-MM-DD-HHMM.json` com todos os projetos, o histórico e as personalizações (status, criticidades, flags, áreas, preferências). |
| **Restaurar backup** | Lê um JSON e pergunta como aplicá-lo: **substituir tudo** ou **mesclar**. Na mesclagem, quando o mesmo projeto existe dos dois lados, vence a versão com `updatedAt` mais recente; o relatório informa quantos foram importados e quantos foram ignorados por serem mais antigos. |
| **Exportar projetos (CSV)** | Planilha com uma linha por projeto (status, criticidade, responsável, contagem de itens, datas), separada por `;` e com BOM — abre corretamente no Excel em português. |

Todo arquivo importado passa por normalização: campos ausentes recebem valores padrão e tipos
inesperados são corrigidos, de modo que backups de versões futuras ou editados à mão não quebram a
aplicação.

No analisador, o menu **Exportar** oferece: JSON com o resultado completo da análise, CSV dos cards
já filtrados, CSV dos dados brutos, relatório HTML autocontido e impressão/PDF.

---

## 7. Como o analisador interpreta o CSV

**Passo 1 — leitura.** O arquivo é lido no navegador com `FileReader`. Tenta-se UTF-8 e, se o
resultado apresentar caracteres corrompidos, refaz-se a leitura em Windows-1252 (comum em arquivos
que passaram pelo Excel). O separador é detectado entre `,` `;` tabulação e `|`, escolhendo o que
produz o número de colunas mais consistente entre as linhas. Aspas, quebras de linha dentro de
células e aspas duplicadas seguem a RFC 4180. Cabeçalhos repetidos são renomeados
(`Membros`, `Membros (2)`) para não se sobrescreverem.

**Passo 2 — identificação das colunas.** O analisador **não depende da posição das colunas**. Cada
papel (nome, lista, membros, etiquetas, datas…) tem uma lista de sinônimos em português e inglês, e
a busca acontece em três passadas: correspondência exata, depois por início do texto, depois por
conteúdo — sempre ignorando acentos e maiúsculas. Reconhece tanto `Card Name`, `List Name`,
`Members`, `Due Date`, `Last Activity Date` quanto `Nome do cartão`, `Lista`, `Membros`,
`Data de vencimento`, `Data da última atividade`.

**Passo 3 — conferência.** Antes de gerar qualquer número, a tela **"Colunas identificadas"** mostra
o que foi encontrado, o que ficou de fora e o que é obrigatório, com uma prévia de cinco linhas.
Qualquer associação pode ser corrigida manualmente num seletor. Se faltar coluna essencial, o aviso
é explícito e diz qual métrica ficará indisponível.

**Passo 4 — normalização dos cards.** Para cada linha:

- **Datas:** a ordem dia/mês vs mês/dia é detectada por coluna (procurando valores acima de 12 na
  primeira ou na segunda posição). Aceita ISO, `dd/mm/aaaa`, `mm/dd/aaaa`, com ou sem hora, AM/PM,
  serial do Excel e timestamp Unix. Valor irreconhecível vira "sem data" — nunca uma data inventada.
- **Data de criação:** se o export não trouxer a coluna, ela é derivada do ID do card — os
  8 primeiros dígitos hexadecimais de um ObjectId de 24 caracteres são o timestamp de criação. A
  interface informa quantos cards usaram essa derivação.
- **Situação:** um card é **concluído** se tiver data de conclusão, se a lista contiver uma das
  palavras-chave de conclusão (padrão: `concluído, concluido, done, finalizado, entregue, publicado`),
  se estiver marcado como *due complete* ou, opcionalmente, se estiver arquivado. É **em produção**
  se a lista contiver palavras de produção (`produção, doing, em andamento, execução, fazendo`).
  Caso contrário, é **pendente**. Todas essas listas de palavras são editáveis em Configurações.
- **Data de conclusão:** quando não existe coluna própria, usa-se a última atividade do card como
  aproximação — e isso fica marcado como **estimativa** em todo lugar onde aparece.
- **Membros e etiquetas:** separados por vírgula ou `|`; espaços em branco descartados. Cards sem
  membro entram na categoria explícita "sem responsável", nunca são distribuídos entre pessoas.

**Princípio que atravessa tudo:** quando uma métrica não pode ser calculada, ela aparece como
**"indisponível neste CSV"** com o motivo — nunca como zero, nunca com dado estimado sem aviso.

---

## 8. Métricas calculadas

### Visão geral
Total de cards, concluídos, em produção, pendentes, atrasados, sem responsável, número de pessoas e
tempo médio de conclusão. Acompanham um resumo operacional em texto (gerado a partir dos números
reais) e insights automáticos sobre produção, backlog, concentração e cards parados.

### Filtros estratégicos
Uma barra acima das abas recorta **toda** a análise: busca pelo nome do card, colaborador, lista,
etiqueta, situação (concluído, em produção, pendente, atrasado, sem responsável) e uma janela de
datas com início e fim. Os seletores de colaborador, lista e etiqueta são preenchidos com os valores
reais do arquivo e mostram quantos cards cada um tem. Quando a janela de datas é preenchida, ela
substitui o seletor de 7/30/90 dias e passa a definir também as séries temporais e a comparação com
o período anterior. O rodapé da barra informa quantos cards restaram no recorte, e o relatório HTML
e o JSON exportados registram quais filtros estavam aplicados.

### Comparação de períodos
O período selecionado (7, 30, 90 dias ou tudo) é comparado com o período imediatamente anterior de
mesmo tamanho, com variação percentual em cada indicador.

### Performance por produtor
Por pessoa: cards concluídos, em produção, pendentes, total, participação percentual e lead time
médio. Tabela ordenável por qualquer coluna, mais gráficos de barras. Cards com vários responsáveis
são contados para cada um — por isso a soma pode superar o total, e isso está declarado na tela.

### Análise temporal
Séries de criados × concluídos, throughput por período e backlog acumulado (criados até a data menos
concluídos até a data). Granularidade automática — dia para janelas curtas, semana para médias, mês
para longas — com opção de forçar manualmente.

### Backlog e aging
Cards abertos agrupados por tempo de espera: normal, atenção e crítico, com limites configuráveis
(padrão: 7 e 14 dias). Cards sem data de criação vão para um grupo "sem data" separado, em vez de
serem contados como novos. Inclui os mais antigos e os que estão sem responsável.

### Eficiência
Lead time (média, mediana, mínimo e máximo), taxa de conclusão, throughput por período, aging médio
do backlog e histograma de distribuição do lead time. Cada bloco traz a metodologia declarada.

### Dados brutos
Todas as linhas do arquivo original, com busca, ordenação, paginação, colunas ocultáveis e clique
para abrir o card em detalhe — incluindo os campos que o analisador não usou.

---

## 9. Campos necessários por métrica

| Métrica | Campos obrigatórios | Comportamento se faltar |
|---|---|---|
| Total de cards, dados brutos | nome do cartão | Sem o nome, o arquivo é recusado como export do Trello |
| Distribuição por lista, em produção, pendentes | lista | Cards ficam "sem etapa"; distribuição indisponível |
| Concluídos, taxa de conclusão | lista **ou** data de conclusão **ou** *due complete* | Métrica marcada como indisponível, com o motivo |
| Performance por produtor, sem responsável | membros | Aba de equipe indisponível |
| Etiquetas | etiquetas | Gráfico omitido |
| Atrasados | data de vencimento | Métrica indisponível |
| Análise temporal, backlog acumulado | data de criação (ou ID de 24 caracteres) | Séries indisponíveis; o motivo aparece no lugar do gráfico |
| Aging do backlog | data de criação | Cards vão para o grupo "sem data" |
| Lead time, tempo médio | data de criação **e** data de conclusão (esta pode ser estimada pela última atividade) | Métrica indisponível ou marcada como estimativa |
| Cards sem movimentação | data da última atividade | Insight não é gerado |

Como exportar do Trello: no quadro, **Menu → Mais → Imprimir e exportar → Exportar como CSV**
(requer Trello Premium ou Enterprise para o export CSV do quadro). Qualquer CSV com colunas
equivalentes também funciona, inclusive editado no Excel.

---

## Publicando um painel para a equipe ver (snapshot)

Como não há backend, os dados de cada pessoa ficam no navegador dela. Para que **todos vejam o mesmo
painel**, existe o snapshot publicado:

1. Cadastre e atualize os projetos normalmente, no seu navegador.
2. Vá em **Configurações → Publicar o painel**, dê um nome à versão (opcional) e clique em
   **Gerar snapshot para publicação**. Baixa um arquivo `projetos.js`.
3. Substitua o `data/projetos.js` do repositório por esse arquivo e faça o commit.
4. Em um ou dois minutos, quem abrir o endereço publicado verá os seus projetos.

Como se comporta para quem visita:

- Visitante novo, ou que nunca editou nada: recebe a versão publicada automaticamente.
- Visitante que fez alterações no próprio navegador: vê um aviso de que há versão mais recente, com
  a escolha entre atualizar (substituindo o que ele mexeu) e manter o dele. Nada é sobrescrito sem
  consentimento.
- A preferência de tema de cada pessoa é sempre preservada.

O snapshot é uma **foto**, não um painel colaborativo: edições feitas por quem visita ficam apenas
no navegador dessa pessoa e desaparecem quando você publica a próxima versão. Para edição
compartilhada de verdade seria preciso um banco de dados (por exemplo Supabase), substituindo a
camada `storage.js`.

Enquanto o `data/projetos.js` estiver com `publishedAt: null`, a aplicação ignora o snapshot e se
comporta de forma totalmente local, com os projetos de demonstração na primeira visita.

## Notas de privacidade

Nenhum dado é enviado para servidor algum. Não há analytics, telemetria, cookies de terceiros,
requisições externas ou uso de IA. A leitura do CSV, o cálculo das métricas e a geração dos
gráficos acontecem inteiramente no seu navegador.
