/* ============================================================================
 * VIZIO Consórcio · Módulo de cálculo (canônico, sem juros)
 * ----------------------------------------------------------------------------
 * Consórcio é autofinanciamento em grupo: NÃO há juros compostos.
 * A parcela é a carta diluída no prazo, acrescida de taxa de administração,
 * fundo de reserva e (opcional) seguro. Reajuste anual incide sobre a carta.
 * O lance pós-contemplação abate o saldo e permite reduzir prazo OU parcela.
 *
 * Fonte da lógica: protótipo 05_Demo_Consorcio/consorcio.html (provado).
 * Este módulo é puro (sem DOM), validado e reutilizável no app e em testes.
 * Compatível com browser (window.ConsorcioCalc) e Node (module.exports).
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node/testes
  if (root) root.ConsorcioCalc = api;                                     // Browser
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Converte para número finito; lança em entrada inválida. */
  function num(v, campo) {
    var n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
    if (!Number.isFinite(n)) throw new TypeError('Valor inválido para "' + campo + '": ' + v);
    return n;
  }

  /** Arredonda para 2 casas (centavos) evitando erro de ponto flutuante. */
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /**
   * Parcela base do consórcio (sem juros).
   * parcela = carta × (1 + taxaAdm% + fundoReserva%) / prazo  (+ seguro)
   * @param {{valor_carta:number,prazo_meses:number,taxa_adm_pct?:number,
   *          fundo_reserva_pct?:number,seguro_mensal?:number}} cota
   * @returns {number} parcela mensal, 2 casas
   */
  function parcelaBase(cota) {
    if (!cota || typeof cota !== 'object') throw new TypeError('cota é obrigatória');
    var carta = num(cota.valor_carta, 'valor_carta');
    var prazo = num(cota.prazo_meses, 'prazo_meses');
    if (carta <= 0) throw new RangeError('valor_carta deve ser > 0');
    if (prazo <= 0) throw new RangeError('prazo_meses deve ser > 0');
    var taxa   = cota.taxa_adm_pct      != null ? num(cota.taxa_adm_pct, 'taxa_adm_pct') : 0;
    var fr     = cota.fundo_reserva_pct != null ? num(cota.fundo_reserva_pct, 'fundo_reserva_pct') : 0;
    var seguro = cota.seguro_mensal     != null ? num(cota.seguro_mensal, 'seguro_mensal') : 0;
    if (taxa < 0 || fr < 0 || seguro < 0) throw new RangeError('percentuais/seguro não podem ser negativos');
    return round2(carta * (1 + taxa / 100 + fr / 100) / prazo + seguro);
  }

  /**
   * Saldo a pagar = parcelas restantes × parcela (sem reajuste futuro).
   * @param {number} parcela  valor da parcela atual
   * @param {number} prazo    prazo total em meses
   * @param {number} pagas    parcelas já pagas
   * @returns {number} saldo, 2 casas (nunca negativo)
   */
  function saldoAPagar(parcela, prazo, pagas) {
    var p = num(parcela, 'parcela'), t = num(prazo, 'prazo'), q = num(pagas, 'pagas');
    var restantes = Math.max(0, t - q);
    return round2(p * restantes);
  }

  /**
   * Reajuste anual acumulado sobre a parcela (carta reajustada 1×/ano).
   * anos completos = floor((numeroParcela - 1) / 12).
   * @param {number} parcela     parcela base
   * @param {number} numeroParcela  índice 1..prazo
   * @param {number} taxaAnualPct   % de reajuste ao ano (ex.: 6 = 6%)
   * @returns {number} parcela reajustada, 2 casas
   */
  function parcelaReajustada(parcela, numeroParcela, taxaAnualPct) {
    var p = num(parcela, 'parcela'), i = num(numeroParcela, 'numeroParcela');
    var taxa = taxaAnualPct != null ? num(taxaAnualPct, 'taxaAnualPct') : 0;
    if (i < 1) throw new RangeError('numeroParcela deve ser >= 1');
    var anos = Math.floor((i - 1) / 12);
    return round2(p * Math.pow(1 + taxa / 100, anos));
  }

  /**
   * Simulação de lance. O lance abate o saldo; escolhe-se reduzir prazo OU parcela.
   * @param {{parcela:number,prazo:number,pagas:number,lance:number,
   *          modo:('prazo'|'parcela')}} entrada
   * @returns {object} resultado detalhado da simulação
   */
  function simularLance(entrada) {
    if (!entrada || typeof entrada !== 'object') throw new TypeError('entrada é obrigatória');
    var parcela = num(entrada.parcela, 'parcela');
    var prazo   = num(entrada.prazo, 'prazo');
    var pagas   = num(entrada.pagas, 'pagas');
    var modo    = entrada.modo === 'parcela' ? 'parcela' : 'prazo';
    if (parcela <= 0) throw new RangeError('parcela deve ser > 0');

    var restantes = Math.max(0, prazo - pagas);
    var saldo = round2(parcela * restantes);
    var lance = Math.max(0, num(entrada.lance, 'lance'));
    lance = Math.min(lance, saldo); // não abate mais que o saldo

    var base = {
      modo: modo, saldoAtual: saldo, lanceAplicado: lance,
      restantesAntes: restantes, parcelaAntes: parcela
    };

    if (restantes === 0) { // cota já quitada
      return Object.assign(base, {
        restantesDepois: 0, parcelaDepois: parcela,
        parcelasReduzidas: 0, economiaMensal: 0
      });
    }

    if (modo === 'prazo') {
      var novoRest = Math.ceil((saldo - lance) / parcela);
      return Object.assign(base, {
        restantesDepois: novoRest,
        parcelaDepois: parcela,                 // mantém
        parcelasReduzidas: restantes - novoRest,
        economiaMensal: 0
      });
    } else {
      var novaParcela = round2((saldo - lance) / restantes);
      return Object.assign(base, {
        restantesDepois: restantes,             // mantém
        parcelaDepois: novaParcela,
        parcelasReduzidas: 0,
        economiaMensal: round2(parcela - novaParcela)
      });
    }
  }

  /** Formata BRL. */
  function brl(n) {
    return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return {
    parcelaBase: parcelaBase,
    saldoAPagar: saldoAPagar,
    parcelaReajustada: parcelaReajustada,
    simularLance: simularLance,
    brl: brl,
    round2: round2
  };
});
