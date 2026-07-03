/* ============================================================================
 * VIZIO Consórcio · Motor de domínio (schemas + geração + resumos)
 * ----------------------------------------------------------------------------
 * Equivale ao "cérebro" do app-crud.js do Financiamento, porém para consórcio
 * (SEM juros). Reusa o consorcio-calc.js (validado) para toda a matemática.
 *
 * Responsabilidades:
 *   - SCHEMAS_CS: definição de campos/tipos por módulo (cotas, parcelas, eventos)
 *   - gerarParcelas(cota, opts): cria o cronograma de uma cota
 *   - resumoCota(cota, parcelas): situação de uma cota (parcela, saldo, %)
 *   - resumoCarteira(cotas, parcelasPorCota): KPIs da carteira (profissional)
 *
 * Puro (sem DOM). Browser: window.ConsorcioCRUD. Node/testes: module.exports.
 * ========================================================================== */
(function (root, factory) {
  var Calc = (typeof require === 'function') ? require('./consorcio-calc.js')
           : (root && root.ConsorcioCalc);
  if (!Calc) throw new Error('consorcio-crud.js requer consorcio-calc.js carregado antes.');
  var api = factory(Calc);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ConsorcioCRUD = api;
})(typeof self !== 'undefined' ? self : this, function (Calc) {
  'use strict';

  /* ---- Schemas de UI (tipos: text|number|money|pct|date|select|check|status) ---- */
  var SCHEMAS_CS = {
    cotas: {
      label: 'Cota', rep: 'Cotas de consórcio',
      fields: [
        { k: 'cliente_nome',      l: 'Cliente',          t: 'text' },
        { k: 'administradora',    l: 'Administradora',   t: 'text', req: true },
        { k: 'grupo',             l: 'Grupo',            t: 'text' },
        { k: 'cota',              l: 'Cota',             t: 'text' },
        { k: 'bem',               l: 'Bem',              t: 'select', opts: ['Imóvel', 'Automóvel', 'Serviços', 'Outro'] },
        { k: 'valor_carta',       l: 'Carta de crédito', t: 'money', req: true },
        { k: 'prazo_meses',       l: 'Prazo (meses)',    t: 'number', req: true },
        { k: 'taxa_adm_pct',      l: 'Taxa adm. (%)',    t: 'pct' },
        { k: 'fundo_reserva_pct', l: 'Fundo reserva (%)',t: 'pct' },
        { k: 'seguro_mensal',     l: 'Seguro mensal',    t: 'money' },
        { k: 'indice_reajuste',   l: 'Índice',           t: 'select', opts: ['INCC', 'IPCA', 'IGP-M', 'OUTRO'] },
        { k: 'data_adesao',       l: 'Adesão',           t: 'date' },
        { k: 'contemplada',       l: 'Contemplada?',     t: 'check' },
        { k: 'status',            l: 'Status',           t: 'status' }
      ]
    },
    parcelas: {
      label: 'Parcela', rep: 'Cronograma de parcelas',
      fields: [
        { k: 'numero',            l: '#',            t: 'number' },
        { k: 'vencimento',        l: 'Vencimento',   t: 'date' },
        { k: 'valor_previsto',    l: 'Previsto',     t: 'money' },
        { k: 'valor_pago',        l: 'Pago',         t: 'money' },
        { k: 'reajuste_aplicado', l: 'Reajuste (%)', t: 'pct' },
        { k: 'quitado',           l: 'Pago?',        t: 'check' },
        { k: 'status',            l: 'Status',       t: 'status' }
      ]
    },
    eventos: {
      label: 'Evento', rep: 'Assembleias e contemplação',
      fields: [
        { k: 'tipo',        l: 'Tipo',       t: 'select', opts: ['assembleia', 'lance', 'contemplacao', 'reajuste'] },
        { k: 'data',        l: 'Data',       t: 'date' },
        { k: 'valor_lance', l: 'Lance',      t: 'money' },
        { k: 'tipo_lance',  l: 'Tipo lance', t: 'select', opts: ['', 'livre', 'fixo', 'embutido'] },
        { k: 'resultado',   l: 'Resultado',  t: 'text' },
        { k: 'obs',         l: 'Obs.',       t: 'text' }
      ]
    }
  };

  /* ---- datas ---- */
  function addMonths(iso, k) {
    // iso 'YYYY-MM-DD' -> soma k meses, mantém o dia (limitado ao fim do mês)
    var base = iso && /^\d{4}-\d{2}/.test(iso) ? iso : new Date().toISOString().slice(0, 10);
    var p = base.split('-'), y = +p[0], m = (+p[1] - 1) + k, d = +(p[2] || 8);
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var lastDay = new Date(y, m + 1, 0).getDate();
    if (d > lastDay) d = lastDay;
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /**
   * Gera o cronograma de parcelas de uma cota.
   * @param {object} cota  registro cs_cotas
   * @param {{reajusteAnualPct?:number, pagas?:number}} [opts]
   *        reajusteAnualPct: projeção de reajuste anual da carta (default 0 = sem projeção)
   *        pagas: nº de parcelas já pagas (marca as primeiras como quitadas)
   * @returns {Array<object>} linhas cs_parcelas
   */
  function gerarParcelas(cota, opts) {
    opts = opts || {};
    var prazo = Number(cota.prazo_meses) || 0;
    if (prazo <= 0) throw new RangeError('prazo_meses deve ser > 0 para gerar parcelas');
    var base = Calc.parcelaBase(cota);                 // valida carta/prazo/taxas
    var taxaAno = Number(opts.reajusteAnualPct) || 0;
    var pagas = Math.max(0, Math.min(prazo, Number(opts.pagas) || 0));
    var adesao = cota.data_adesao || new Date().toISOString().slice(0, 10);
    var out = [];
    for (var n = 1; n <= prazo; n++) {
      var previsto = Calc.parcelaReajustada(base, n, taxaAno);
      var anos = Math.floor((n - 1) / 12);
      var reajPct = taxaAno ? Calc.round2((Math.pow(1 + taxaAno / 100, anos) - 1) * 100) : 0;
      var quitado = n <= pagas;
      out.push({
        numero: n,
        vencimento: addMonths(adesao, n - 1),
        valor_previsto: previsto,
        valor_pago: quitado ? previsto : 0,
        reajuste_aplicado: reajPct,
        quitado: quitado,
        status: quitado ? 'pago' : 'aberto'
      });
    }
    return out;
  }

  /**
   * Situação de uma cota a partir da própria cota + parcelas (se houver).
   * Sem parcelas, deriva de prazo/pagas informados.
   */
  function resumoCota(cota, parcelas) {
    var parcela = Calc.parcelaBase(cota);
    var prazo = Number(cota.prazo_meses) || 0;
    var pagas, pago;
    if (Array.isArray(parcelas) && parcelas.length) {
      pagas = parcelas.filter(function (p) { return p.quitado === true; }).length;
      pago = parcelas.reduce(function (s, p) { return s + (Number(p.valor_pago) || 0); }, 0);
    } else {
      pagas = Math.max(0, Math.min(prazo, Number(cota.pagas) || 0));
      pago = Calc.round2(parcela * pagas);
    }
    var saldo = Calc.saldoAPagar(parcela, prazo, pagas);
    return {
      parcela: parcela,
      prazo: prazo,
      pagas: pagas,
      restantes: Math.max(0, prazo - pagas),
      pago: Calc.round2(pago),
      saldo: saldo,
      pct: prazo ? Calc.round2(pagas / prazo * 100) : 0,
      contemplada: cota.contemplada === true || cota.status === 'contemplada'
    };
  }

  /**
   * KPIs agregados da carteira (perfil Profissional).
   * @param {Array<object>} cotas
   * @param {Object<string,Array>} [parcelasPorCota]  mapa cotaId -> parcelas
   */
  function resumoCarteira(cotas, parcelasPorCota) {
    parcelasPorCota = parcelasPorCota || {};
    var totalCartas = 0, jaPago = 0, parcelaMes = 0, nAVencer = 0;
    var ativas = 0, contempladas = 0, quitadas = 0, admins = {};
    (cotas || []).forEach(function (c) {
      var r = resumoCota(c, parcelasPorCota[c.id]);
      totalCartas += Number(c.valor_carta) || 0;
      jaPago += r.pago;
      if (c.administradora) admins[c.administradora] = 1;
      if (c.status === 'quitada' || r.restantes === 0) { quitadas++; }
      else { parcelaMes += r.parcela; nAVencer++; if (r.contemplada) contempladas++; else ativas++; }
    });
    return {
      totalCartas: Calc.round2(totalCartas),
      jaPago: Calc.round2(jaPago),
      parcelaMes: Calc.round2(parcelaMes),
      parcelasAVencer: nAVencer,
      cotasAtivas: ativas + contempladas,
      contempladas: contempladas,
      quitadas: quitadas,
      nCotas: (cotas || []).length,
      nAdministradoras: Object.keys(admins).length
    };
  }

  return {
    SCHEMAS_CS: SCHEMAS_CS,
    gerarParcelas: gerarParcelas,
    resumoCota: resumoCota,
    resumoCarteira: resumoCarteira,
    addMonths: addMonths
  };
});
