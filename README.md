# Website + marcações + dashboard de gestão — Adriana Martins

Website de estética em português de Portugal com marcações online, lista de espera, avaliações verificadas e um **dashboard de gestão privado** para a esteticista (marcações, clientes, serviços e pagamentos), pensado para o telemóvel.

**Stack:** Node.js 20+ · Express · SQLite (ficheiro persistente) · HTML/CSS/JS sem build. O site e o dashboard usam **a mesma base de dados e a mesma agenda**.

## Regra base: sem duração dos serviços

Cada marcação ocupa **um horário** (a hora de início) da profissional. Não há duração nem hora de fim em nenhum ecrã, formulário, cartão ou detalhe — nem no site, nem no dashboard, nem nos emails.

- A esteticista abre os horários dia a dia (Agenda → Disponibilidade). O site só oferece essas horas, e só as livres.
- O mesmo horário nunca é marcado duas vezes para a mesma profissional (ver "Proteção contra reservas duplicadas").
- Outros horários podem ser bloqueados à mão (um horário, um dia inteiro ou um período: pausa, folga, férias, encerramento, bloqueio pontual).

## Arranque rápido

```bash
npm install
npm run criar-admin -- email@oseuespaco.pt "Adriana"   # pede a palavra-passe (mín. 10 caracteres)
npm start                                              # site: http://localhost:3000 · dashboard: /admin/
```

Testes: `npm test` (API, regras, concorrência, dashboard) · `node tests/e2e.js` (browser: telemóvel e computador; requer Playwright).

## Dashboard (`/admin/`)

Privado, com email e palavra-passe (endereço curto: `/painel`). Visual premium e minimalista: branco `#FFFFFF`, bege `#F7F3EE`, castanho `#6B4F3F`, dourado `#C5A46D` e cinzento para textos secundários. Barra lateral no computador, com fotografia, nome e "Terminar sessão" no rodapé; no telemóvel, navegação inferior (Dashboard · Marcações · Calendário · Clientes · **Mais**). Datas em DD/MM/AAAA, horas de 24 h, preços em euros.

| Secção | O que faz |
|---|---|
| **Dashboard** | "Bom dia, Adriana! Aqui está o resumo do teu negócio." com a data e "+ Nova marcação". Cartões: marcações de hoje · pendentes · faturação do mês (pagamentos registados) · clientes deste mês (distintas atendidas) · próxima marcação. Gráfico de faturação (7 dias, 30 dias, 12 meses) com dica ao passar o rato/tocar e vista em tabela. Marcações de hoje com hora, cliente, serviço, estado e detalhe. Ações rápidas: nova marcação, adicionar cliente, bloquear horário, ver calendário. Aviso de aniversários do dia. |
| **Marcações** | Lista com filtros por período (próximas, hoje, semana, mês, histórico de 90 dias, intervalo), cliente, serviço e estado, e exportação CSV. Separadores: Pedidos pendentes (aprovar · recusar · sugerir outro horário) · Lista de espera. |
| **Calendário** | Vistas dia, semana (grelha por horas) e mês. **Arrastar e largar** uma marcação noutro dia/hora para reagendar (computador), com verificação de conflitos e bloqueios. Horas livres visíveis (clicar = marcar) e bloqueadas. Pedidos pendentes sempre à mão ao lado. Separadores: Horários para marcação (abrir horas por dia) · Bloqueios, folgas e férias (pausas, folgas, férias, encerramentos; marcações já confirmadas nunca são canceladas automaticamente — o painel avisa). |
| **Detalhe da marcação** | Painel lateral (computador) ou folha inferior (telemóvel): contactos, notas internas, aprovar/recusar/sugerir, reagendar, cancelar, concluir, "Não compareceu", pagamento, presença, histórico e mensagens. |
| **Clientes** | Pesquisa e filtros: frequentes · sem voltar há 90+ dias · novas · com marcação. **Indicador de fidelização** (Nova, Regular, Frequente, Fiel) pela frequência de visitas. Ficha: contactos, primeira e última visita, visitas, frequência média, total gasto, próximas marcações, histórico, serviços realizados, notas, aniversário (dia e mês). Duplicados só por telefone/email. Apagar dados pessoais (RGPD). Separadores Aniversários e Formulário. |
| **Serviços** | Nome, categoria, descrição, preço, fotografia (opcional), ativo/inativo. Reflete-se logo no site. Sem duração (cada marcação ocupa um horário). |
| **Financeiro** | Hoje · semana · mês · ano · média por atendimento · resultado do mês (receitas − despesas). Gráficos: evolução da faturação e comparação entre meses (receitas e despesas). Por período: recebido, despesas, resultado estimado, por receber, serviços com maior faturação, receitas por categoria e por método, pagamentos pendentes, histórico de pagamentos, **despesas** (registar, editar, apagar) e exportação CSV. Uma marcação só conta como faturação depois de registado o pagamento. |
| **Avaliações** | Classificação média e total, distribuição por estrelas, filtros (por aprovar, publicadas, ocultas), aprovar/publicar, ocultar (só spam, ofensivo ou dados pessoais), responder. Tudo fica registado. |
| **Notificações** | Atividade das clientes e do sistema (nova marcação, pedido pendente, cancelamento, reagendamento, resposta a propostas, presença confirmada, pedido expirado) com contador de novas. "Amanhã": marcações do dia seguinte com lembrete por WhatsApp já escrito. Registo real dos emails enviados/falhados/não configurados. |
| **Definições** | Negócio e contactos (nome, logótipo, fotografia de perfil, morada, contactos, redes sociais) · horário de funcionamento · regras e políticas (antecedência mínima e máxima, cancelamento) · notificações e lembretes · textos e fotografias do site · profissionais · dados das clientes (RGPD, exportar CSV) · conta e acesso. |

### Marcações e pedidos

Estados: **Pendente · Confirmada · Concluída · Cancelada · Não compareceu**.

- Pedido feito no site → aparece como **pendente** (todas as marcações online são confirmadas pela Adriana) e o horário fica reservado durante o prazo definido (24 h).
- **Aprovar** revalida o horário (bloqueio criado entretanto, hora já passada) e confirma numa única transação: aparece logo na agenda.
- **Sugerir outro horário** move o pedido para a nova hora (reservada para a cliente) e mantém-no pendente até a cliente aceitar pelo link (ou até a esteticista aprovar depois de falar com ela). A hora antiga fica livre.
- **Nova marcação** (telefone, mensagem, presencial): procurar a cliente existente ou criar ficha; se o telefone/email já existir, o dashboard pergunta se é a mesma pessoa. Pode usar uma hora aberta ou "outra hora".
- Cancelar ou reagendar liberta o horário de imediato. Uma hora com marcação não pode ser fechada na Disponibilidade.
- **Histórico de alterações** em cada marcação: quem (cliente, painel, sistema), quando e o quê.
- **Lista de espera:** cliente, contacto, serviço e preferências (dias, período, datas). Quando há vaga compatível, o dashboard assinala-a para a esteticista contactar a cliente (as ofertas automáticas por email só funcionam com email configurado).

### Formulário de registo de clientes (`/registo.html`)

Página à parte (não aparece no menu do site), para partilhar nas redes sociais: nome completo, email, telemóvel, aniversário (só dia e mês) e consentimento para a mensagem de aniversário.

- O registo cria a ficha em Clientes, com a origem (ex.: `?origem=instagram`) e a data de registo.
- **Sem duplicados:** se o email já existir, a ficha é a mesma. Um formulário público nunca substitui o nome ou o telefone de uma ficha existente, só preenche campos vazios, e a resposta é igual exista ou não a ficha (não revela quem é cliente).
- **Marcação mais rápida:** depois do registo (ou da primeira marcação), o site lembra os dados **nesse aparelho** e preenche-os na marcação seguinte ("Não és tu?" limpa). Os dados nunca são devolvidos pelo servidor a partir de um email.
- **Mensagem de aniversário:** pelo botão WhatsApp/email no dashboard; envio automático por email no próprio dia, opcional, só com email configurado e consentimento. 29/02 é celebrado a 28/02 nos anos comuns.
- O link usa o "Endereço público do site" (Definições → Espaço e contactos) assim que o domínio estiver definido.

### Pagamentos

- Registados à mão por marcação: valor, data, método (numerário, MB WAY, multibanco, cartão, transferência, outro) e estado (pago/anulado).
- Uma marcação confirmada ou concluída **nunca** conta como paga até haver pagamento registado.
- Cada formulário tem uma chave única: repetir o envio (duplo clique, rede lenta) **não regista o mesmo pagamento duas vezes**. Um valor acima do preço acordado pede confirmação explícita.
- Pagamentos não se apagam: anulam-se com motivo e ficam no histórico.

## Proteção contra reservas duplicadas

1. Marcar, aprovar, reagendar e sugerir correm em transações SQLite `BEGIN IMMEDIATE`: pedidos simultâneos (mesmo em processos diferentes) são serializados e o horário é revalidado já com o bloqueio.
2. A base de dados recusa uma segunda marcação ativa da mesma profissional à mesma hora: índice único parcial `ux_bookings_active_slot (staff_id, start_at) WHERE status IN ('pending','confirmed')` + gatilhos.
3. Pedidos pendentes expirados são libertados antes de cada verificação.

Testado com 25 pedidos simultâneos (site) e 20 simultâneos (site + dashboard) para o mesmo horário: fica sempre exatamente 1 marcação.

## Migrações (automáticas no arranque)

Ao iniciar, `src/db.js` atualiza uma base de dados existente sem perder dados:

- Novas tabelas: `payments` (pagamentos) e `booking_events` (histórico de alterações).
- Novas colunas: `bookings.proposed`, `bookings.attendance_confirmed_at`, `bookings.attendance_source`, `waitlist.contacted_at`, `waitlist.notes`, `waitlist.source`.
- Substitui os gatilhos antigos de sobreposição por duração (`trg_no_overlap_*`) pelos novos por horário (`trg_no_double_slot_*`) e cria o índice `ux_bookings_active_slot`.
- Novas colunas em `customers`: `birthday` (MM-DD), `birthday_consent`, `birthday_consent_at`, `source`, `registered_at`, `birthday_greeted_year`.
- Novas definições: `register_enabled`, `register_title`, `register_intro`, `birthday_message`, `birthday_email_enabled`.
- Novas definições: `timezone` (Europe/Lisbon por defeito; Madeira e Açores disponíveis) e `reminder_enabled`.
- As colunas `duration_min`/`end_at` mantêm-se por compatibilidade, mas deixaram de ser usadas e não são enviadas ao dashboard nem ao site.

Faça uma cópia de segurança antes de atualizar: `sqlite3 data/estetica.db ".backup antes-da-atualizacao.db"`.

## Configuração (variáveis de ambiente)

| Variável | Para quê |
|---|---|
| `PORT` | Porta do servidor (por defeito 3000) |
| `PUBLIC_BASE_URL` | Endereço público, usado nos links dos emails (ex.: `https://www.oseusite.pt`) |
| `DATA_DIR` | Pasta da base de dados, uploads e chave secreta (por defeito `./data`) — **tem de ser um disco persistente** |
| `APP_SECRET` | Chave para os links privados (opcional; se não existir é gerada em `data/secret.key`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de email |
| `NODE_ENV=production` | Cookie de sessão só por HTTPS |
| `TRUST_PROXY=true` | Se estiver atrás de um proxy (Render, Railway, Nginx) |
| `JOBS=off` | Desliga as tarefas automáticas (só para testes) |
| `BACKUPS=off`, `BACKUP_DIR`, `BACKUP_KEEP` | Cópias de segurança diárias (ligadas por defeito, em `data/backups`, guardam as últimas 14) |

Credenciais e chaves ficam apenas no servidor (variáveis de ambiente); nunca são enviadas ao browser. O dashboard só mostra se o email está configurado e o que falta.

## Integrações que faltam configurar

### Email (confirmações, lembretes na véspera, propostas de horário, avaliações) — necessário

Sem SMTP, o sistema funciona mas **nada é enviado**: cada mensagem fica registada como "Não enviado — email não configurado" (Definições → Lembretes e mensagens). Nunca é apresentada como enviada.

1. Criar uma caixa de envio (ex.: `marcacoes@oseudominio.pt`) no fornecedor de email do domínio, ou usar um serviço transacional (Brevo, Mailgun, Amazon SES, Postmark).
2. Definir no servidor:
   ```
   SMTP_HOST=smtp.fornecedor.pt
   SMTP_PORT=587
   SMTP_SECURE=false        # true se a porta for 465
   SMTP_USER=marcacoes@oseudominio.pt
   SMTP_PASS=********
   SMTP_FROM="Adriana Martins Estética <marcacoes@oseudominio.pt>"
   PUBLIC_BASE_URL=https://www.oseudominio.pt
   ```
3. Configurar SPF e DKIM do domínio (indicados pelo fornecedor) para os emails não irem para o spam.
4. Reiniciar o servidor e confirmar em Definições → Lembretes e mensagens que o estado passa a "Configurado".

Lembretes: ativos por defeito, enviados 24 h antes ("na véspera"), com link para a cliente **confirmar a presença**. A presença também pode ser registada à mão ("Confirmou presença") depois de um telefonema ou mensagem.

### WhatsApp / SMS automáticos — não incluídos

Exigem um fornecedor pago (WhatsApp Business Platform/Cloud API, Twilio, etc.) e aprovação de modelos de mensagem. O dashboard mostra-os como "Não incluído". O site e o dashboard têm apenas ligações "WhatsApp" que abrem a conversa no telemóvel (não enviam nada sozinhos).

## Publicar

Precisa de um alojamento Node **com disco persistente** (a base de dados é um ficheiro SQLite). Netlify/Vercel sozinhos não servem, porque não guardam ficheiros entre pedidos.

**Render (recomendado, já preparado):** o repositório inclui `Dockerfile` e `render.yaml`.
1. Pôr o projeto num repositório GitHub (sem `node_modules` nem `data`).
2. No Render: *New + → Blueprint* → escolher o repositório. Cria o serviço com um disco de 1 GB em `/data`.
3. Preencher as variáveis `PUBLIC_BASE_URL` (o domínio) e, quando houver, as `SMTP_*`.
4. Conta do painel: o `render.yaml` já traz `ADMIN_EMAIL` (email da Adriana); preencher `ADMIN_PASSWORD` no Render antes do primeiro arranque. A conta é criada automaticamente na primeira vez e, a partir daí, a palavra-passe muda-se no painel (Definições → Conta). Alternativa: `npm run criar-admin` na *Shell* do serviço.
5. Em *Settings → Custom Domains*, adicionar o domínio e apontar o DNS (o HTTPS é automático).

**VPS:** `docker build -t estetica . && docker run -d -p 3000:3000 -v /srv/estetica:/data --restart unless-stopped estetica`, com Nginx/Caddy à frente para o HTTPS.

**Cópias de segurança:** feitas automaticamente uma vez por dia em `data/backups` (últimas 14). Cópia manual: `npm run backup`. Para restaurar, parar o servidor e substituir `data/estetica.db` pela cópia. Recomenda-se copiar de vez em quando a pasta `backups` para fora do servidor.

## Painel no telemóvel (aplicação)

O painel é instalável (PWA): no iPhone, Safari → *Partilhar* → *Adicionar ao ecrã principal*; no Android, Chrome → menu ⋮ → *Instalar aplicação*. As instruções também estão em Definições → Conta. Fica com ícone próprio e abre em ecrã inteiro. Os dados da agenda vêm sempre do servidor (nunca de cache); sem rede, o painel abre mas avisa que não consegue carregar dados. Só funciona com HTTPS (ou em `localhost`).

## Google

`/robots.txt` e `/sitemap.xml` são gerados automaticamente (com `PUBLIC_BASE_URL`). A página inicial inclui dados estruturados (`BeautySalon`) com nome, morada, contactos e Instagram, só com os campos já preenchidos. Depois de publicar: registar o domínio no Google Search Console e enviar o sitemap; criar/atualizar o Perfil da Empresa no Google.

## Privacidade e segurança

Recolhe apenas nome, telefone e email (opcional no dashboard); sem dados clínicos (as notas internas avisam para não registar dados de saúde). Todas as rotas do dashboard exigem sessão (cookie HttpOnly/SameSite, palavra-passe com scrypt, limite de tentativas) e cabeçalho anti-CSRF nas alterações; a área pública não expõe dados de clientes. Links privados (gerir, avaliar) com tokens HMAC, só o hash fica na base de dados.

## Demonstração

`node demo/build.js` gera `demo/dist/demo.html`: o mesmo site e dashboard num único ficheiro, com a API simulada no browser. As clientes de exemplo estão identificadas como "Demo" (ex.: "Ana Demo"); nada é enviado nem chega a um servidor. Entrar no dashboard: `demo@exemplo.pt` / `demonstracao`.


## Publicar com Netlify (páginas) + Render (servidor)

O Netlify só serve páginas fixas; as marcações, o painel e a base de dados precisam do servidor no Render.

1. **Render primeiro:** New → Blueprint → este repositório. Preenche `ADMIN_PASSWORD` e `PUBLIC_BASE_URL` (o endereço do Netlify ou o domínio). Copia o endereço do serviço (ex.: `https://adriana-martins-estetica.onrender.com`).
2. **netlify.toml:** se o endereço do Render for diferente, troca `adriana-martins-estetica.onrender.com` pelo teu (5 sítios) e faz commit.
3. **Netlify:** Add new site → Import from GitHub → este repositório. Não é preciso mudar nada: o `netlify.toml` já diz para publicar a pasta `public` sem build.
4. O site abre pelo Netlify; tudo o que é `/api/...` é encaminhado para o Render. O painel fica em `/painel`.
