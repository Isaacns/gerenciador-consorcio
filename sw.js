/* Service worker do Gerenciador de Consórcio (VIZIO).
   Estratégia: network passthrough (sem cache) — habilita "Instalar app"
   sem risco de servir versão desatualizada de um app que depende de dados na nuvem.
   §14.2: skipWaiting no install + clients.claim no activate — é a alternativa canônica
   (e melhor) ao canal PULAR_ESPERA: o SW novo assume sem esperar todas as abas fecharem. */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  /* Guarda §14/§5 — a checagem de versão do push usa ?_v=<timestamp> sempre único.
     Este SW não mantém cache hoje, então não há o que poluir; a guarda fica explícita
     para que, se algum dia entrar cache aqui, essas URLs nunca sejam armazenadas
     (criariam uma entrada nova a cada 10 minutos, para sempre). */
  try { if (new URL(e.request.url).searchParams.has('_v')) return; } catch (_) {}
  /* deixa a rede resolver (sempre atualizado) */
});
