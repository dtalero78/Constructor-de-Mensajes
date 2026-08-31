/**
 * Calibración del mensaje — la curva emocional del corpus, aplicada al mensaje en curso.
 *
 * La FORMA de la curva es fija: es el molde que sale de medir 10 prédicas reales.
 * Lo que se mide del mensaje del predicador NO es "cuánta emoción tiene" (eso no se
 * puede medir con conteos y fingirlo sería falso rigor), sino algo más modesto y
 * verificable: si está presente el material que produce cada tramo.
 *
 * Cada señal dice en voz alta qué busca, para que se lea como lo que es —una
 * heurística de texto— y no como un juicio sobre la calidad del mensaje.
 *
 * Sin dependencias. Se usa en crear.html (compacta y completa).
 */
(function (global) {
  'use strict';

  const norm = (t) => String(t || '').trim();
  const palabras = (t) => norm(t).split(/\s+/).filter(Boolean).length;
  const cuenta = (t, re) => (norm(t).match(re) || []).length;
  const primerTercio = (t) => norm(t).split(/\s+/).slice(0, Math.max(40, Math.ceil(palabras(t) / 3))).join(' ');

  // Marcadores de escucha: el rasgo más frecuente del corpus (70 "escúchame", 34 "óyeme bien").
  const RE_MARCADOR = /esc[úu]chame|[óo]yeme bien|[óo]yelo bien|escucha esto|escucha bien|¿?te das cuenta|estamos claros/gi;
  const RE_SEGUNDA = /\b(tú|te|ti|tu|tus)\b/gi;
  const RE_CIFRA = /\b\d/g;

  /**
   * Los seis tramos. Cada uno declara de qué pilares se alimenta y qué señales busca.
   * `prueba` devuelve true si la señal está presente. `pista` explica cómo arreglarlo.
   */
  const TRAMOS = [
    {
      clave: 'complicidad',
      nombre: 'Complicidad',
      voz: 'risa',
      pilares: ['introduccion'],
      resumen: 'Abre en una anécdota que no le cobra nada a nadie.',
      señales: [
        {
          etiqueta: 'Entra directo a la escena',
          busca: 'que no empiece anunciando el tema',
          pista: 'Empieza dentro de la historia. Quita el "hoy quiero hablarte de…" y arranca por lo que pasó.',
          prueba: (s) => !/^\s*(hoy\s+(quiero|vamos|les)|quiero\s+(hablarte|compartir|contarles\s+que\s+hoy)|en\s+la\s+biblia|todos\s+hemos|la\s+palabra\s+de\s+dios\s+dice)/i.test(norm(s.introduccion))
        },
        {
          etiqueta: 'Historia en primera persona',
          busca: '"yo", "mi", "me" en el arranque',
          pista: 'La introducción del corpus casi siempre arranca con algo que le pasó al predicador.',
          prueba: (s) => cuenta(primerTercio(s.introduccion), /\b(yo|mi|mis|me)\b/gi) >= 2
        },
        {
          etiqueta: 'Escena con detalle físico',
          busca: 'una cifra, una hora, un precio o un diálogo',
          pista: 'Añade el dato concreto: la hora, cuánto costaba, qué dijo exactamente.',
          prueba: (s) => cuenta(s.introduccion, RE_CIFRA) >= 1 || /["“”]|\bme dijo\b|\byo le dije\b/i.test(s.introduccion)
        }
      ]
    },
    {
      clave: 'reconocimiento',
      nombre: 'Reconocimiento',
      voz: '"ese soy yo"',
      pilares: ['costura'],
      resumen: 'El oyente encuentra su casilla y se siente descrito.',
      señales: [
        {
          etiqueta: 'La costura es una sola frase',
          busca: 'un solo punto final y menos de 35 palabras',
          pista: 'La costura es un puente, no un párrafo. Déjala en una frase.',
          prueba: (s) => norm(s.costura) && palabras(s.costura) <= 35 && cuenta(s.costura, /[.!?]+/g) <= 2
        },
        {
          etiqueta: 'Apunta al oyente',
          busca: 'segunda persona del singular',
          pista: 'Termina la costura girando hacia "tú": la tensión tiene que aterrizar en quien escucha.',
          prueba: (s) => cuenta(s.costura, RE_SEGUNDA) >= 1
        }
      ]
    },
    {
      clave: 'incomodidad',
      nombre: 'Incomodidad',
      voz: '"esto me duele"',
      pilares: ['problematica'],
      critico: true,
      resumen: 'El tramo que casi todo el mundo se salta. Aquí se compra el alivio del final.',
      señales: [
        {
          etiqueta: 'Ráfaga de "quizás"',
          busca: 'tres o más "quizás" encadenados',
          pista: 'Abre el problema en abanico: cinco a ocho vidas concretas seguidas, encadenadas con "quizás".',
          prueba: (s) => cuenta(s.problematica, /quiz[áa]s/gi) >= 3
        },
        {
          etiqueta: 'Nombra conducta, no condición',
          busca: 'verbos en segunda persona del pasado',
          pista: 'No basta "vivimos distraídos". Di qué hizo: "revisaste el celular mientras te hablaba".',
          prueba: (s) => /\b\w+(aste|iste|ías|abas)\b/i.test(s.problematica) && cuenta(s.problematica, RE_SEGUNDA) >= 5
        },
        {
          etiqueta: 'Sin culpa ni condena',
          busca: 'que no aparezca vocabulario de castigo',
          pista: 'El oyente debe sentirse descrito, nunca acusado. La peor consecuencia es una vida ordinaria.',
          prueba: (s) => !/\b(castigo|condena(ci[óo]n)?|merecido|culpable|verg[üu]enza de ti)\b/i.test(s.problematica)
        }
      ]
    },
    {
      clave: 'tension',
      nombre: 'Tensión sostenida',
      voz: '"aún no veo"',
      pilares: ['desarrollo'],
      resumen: 'No resuelve todavía. Aguanta sin dar la salida.',
      señales: [
        {
          etiqueta: 'Tres puntos anunciados',
          busca: 'una serie de tres',
          pista: 'Anuncia tres puntos con la misma forma gramatical, como una serie.',
          prueba: (s) => /\b(tres|3)\b/i.test(s.desarrollo) ||
            (/\bprimer/i.test(s.desarrollo) && /\bsegund/i.test(s.desarrollo) && /\b(tercer|últim)/i.test(s.desarrollo))
        },
        {
          etiqueta: 'Marcadores de escucha',
          busca: '"escúchame", "óyeme bien", "¿te das cuenta?"',
          pista: 'Corta la frase antes de cada afirmación central. Con dos o tres por sección basta.',
          prueba: (s) => cuenta(s.desarrollo, RE_MARCADOR) >= 2
        },
        {
          etiqueta: 'La historia bíblica tiene cuerpo',
          busca: 'cifras o detalle físico dentro del desarrollo',
          pista: 'Cuenta la escena, no el resumen: qué comían, cuánto costaba, cuántos años esperó.',
          prueba: (s) => cuenta(s.desarrollo, RE_CIFRA) >= 3
        },
        {
          etiqueta: 'Tiene cuerpo suficiente',
          busca: 'al menos 700 palabras',
          pista: 'El desarrollo es la parte larga: sostiene la tensión un buen rato antes de resolver.',
          prueba: (s) => palabras(s.desarrollo) >= 700
        }
      ]
    },
    {
      clave: 'alivio',
      nombre: 'Alivio',
      voz: '"no dependía de mí"',
      pilares: ['conclusion'],
      critico: true,
      resumen: 'La carga se traslada del oyente a Dios. Es el giro que define el estilo.',
      señales: [
        {
          etiqueta: 'Ejecuta la descarga',
          busca: '"nunca se trató de ti", "no dependió de tu capacidad"',
          pista: 'Di explícitamente que esto nunca dependió de que el oyente lo hiciera bien.',
          // Amplio a propósito: el corpus dice esto de muchas formas ("nunca se trató",
          // "no depende", "nunca dependió", "no es por tu fuerza"). Un patrón estrecho
          // marcaba como ausente una descarga que sí estaba escrita.
          prueba: (s) => /\b(nunca|no|jam[áa]s)\b[^.!?]{0,50}\b(se\s+trat[óoa]|depend[eiíoó]\w*|por\s+tu\s+(fuerza|capacidad|m[ée]rito)|tu\s+(capacidad|fuerza|m[ée]rito))/i.test(s.conclusion)
        },
        {
          etiqueta: 'Cierra en futuro indicativo',
          busca: '"vas a…" al final',
          pista: 'Afirma lo que va a ocurrir, no lo que hay que hacer.',
          prueba: (s) => cuenta(s.conclusion, /\bvas a\b|\bvas\s+a\b/gi) >= 2
        },
        {
          etiqueta: 'No cae en moraleja',
          busca: 'que no cierre mandando una tarea',
          pista: 'Si la conclusión se resume en "pórtate mejor" o en una instrucción, hay que reescribirla.',
          prueba: (s) => {
            const cola = norm(s.conclusion).split(/\s+/).slice(-45).join(' ');
            return !/\b(recuerda|no olvides|haz|empieza a|dec[íi]dete|comprom[eé]tete|ponte a|aseg[úu]rate)\b/i.test(cola);
          }
        }
      ]
    },
    {
      clave: 'envio',
      nombre: 'Envío',
      voz: 'declaración',
      pilares: ['ministracion'],
      resumen: 'Breve, con un acto físico y una declaración que se dice en voz alta.',
      señales: [
        {
          etiqueta: 'Hay un acto físico',
          busca: 'ponerse de pie, levantar la mano, repetir en voz alta',
          pista: 'Ancla la respuesta en algo que el oyente hace ahora, no solo en algo que piensa.',
          prueba: (s) => /(p[oó]nte de pie|de pie|levanta|levanten|toma la mano|repite|repitan|cuenta de tres|en voz alta|cierra los ojos)/i.test(s.ministracion)
        },
        {
          etiqueta: 'Hay una frase para decir en voz alta',
          busca: 'una frase marcada (entre comillas o en negrita) junto a la orden de decirla',
          pista: 'Escribe la frase exacta que la gente va a repetir, no la que tú dices sobre ellos.',
          // Busca la ESTRUCTURA (orden de decir + frase marcada), no un formulario fijo:
          // las declaraciones del corpus no siempre empiezan por "yo creo" o "Señor, yo".
          prueba: (s) => /(en voz alta|repite|repitan|repitamos|dilo|d[íi]gan?lo|di conmigo|vamos a decir|a la cuenta de tres)/i.test(s.ministracion)
            && /(["“][^"”]{8,}["”]|\*\*[^*]{8,}\*\*)/.test(s.ministracion)
        },
        {
          etiqueta: 'Es breve',
          busca: 'menos de 450 palabras',
          pista: 'La ministración no recapitula el mensaje. Va al grano.',
          prueba: (s) => { const n = palabras(s.ministracion); return n > 0 && n <= 450; }
        }
      ]
    }
  ];

  /** Geometría de la curva canónica. Coordenadas en el viewBox 0 0 960 260. */
  const CURVA = 'M 60 150 C 130 120, 170 108, 220 112 S 320 128, 370 178 S 470 196, 520 168 S 620 150, 680 96 S 800 52, 900 44';
  const NODOS = [[60, 150], [220, 112], [370, 178], [520, 168], [680, 96], [900, 44]];

  /**
   * Evalúa el mensaje y devuelve un tramo por cada punto de la curva.
   * `guardados` es el mapa pilar -> texto que ya usa crear.html.
   */
  function calibrar(guardados) {
    const s = {};
    ['titulo', 'introduccion', 'costura', 'problematica', 'conector', 'desarrollo', 'conclusion', 'ministracion']
      .forEach(k => { s[k] = norm(guardados && guardados[k]); });

    const tramos = TRAMOS.map((t, i) => {
      const vacio = t.pilares.every(p => !s[p]);
      const señales = t.señales.map(sig => ({
        etiqueta: sig.etiqueta,
        busca: sig.busca,
        pista: sig.pista,
        ok: vacio ? false : !!sig.prueba(s)
      }));
      const cumplidas = señales.filter(x => x.ok).length;
      return {
        clave: t.clave, nombre: t.nombre, voz: t.voz, resumen: t.resumen,
        critico: !!t.critico, pilares: t.pilares, vacio,
        señales, cumplidas, total: señales.length,
        razon: vacio ? 0 : cumplidas / señales.length,
        x: NODOS[i][0], y: NODOS[i][1]
      };
    });

    const escritos = tramos.filter(t => !t.vacio);
    return {
      tramos,
      completo: escritos.length === tramos.length,
      escritos: escritos.length,
      razonGlobal: escritos.length ? escritos.reduce((a, t) => a + t.razon, 0) / escritos.length : 0,
      faltantes: tramos.filter(t => !t.vacio && t.razon < 1)
    };
  }

  /** Estado visual de un nodo: vacío, flojo, parcial o completo. */
  function estadoNodo(t) {
    if (t.vacio) return 'vacio';
    if (t.razon >= 1) return 'lleno';
    if (t.razon >= 0.5) return 'parcial';
    return 'flojo';
  }

  /**
   * Pinta la curva dentro de un <svg>. `modo` es 'compacta' o 'completa'.
   * Devuelve el resultado de calibrar() para que quien llama pueda usarlo.
   */
  function dibujar(svg, guardados, opciones) {
    const o = opciones || {};
    const res = o.resultado || calibrar(guardados);
    const compacta = o.modo === 'compacta';
    const ns = 'http://www.w3.org/2000/svg';

    svg.setAttribute('viewBox', compacta ? '0 40 960 190' : '0 0 960 268');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label',
      'Curva de calibración del mensaje: ' + res.tramos.map(t =>
        `${t.nombre}, ${t.vacio ? 'sin escribir' : t.cumplidas + ' de ' + t.total + ' señales'}`).join('; '));
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const el = (tag, attrs, texto) => {
      const n = document.createElementNS(ns, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (texto != null) n.textContent = texto;
      return n;
    };

    // Guías
    if (!compacta) {
      [85, 150, 215].forEach(y => svg.appendChild(el('line', {
        x1: 40, y1: y, x2: 920, y2: y, class: 'cal-guia' + (y === 215 ? ' cal-eje' : '')
      })));
    }

    // La forma del corpus, siempre igual: es el molde, no el resultado.
    svg.appendChild(el('path', { d: CURVA, class: 'cal-molde' }));

    res.tramos.forEach((t) => {
      const est = estadoNodo(t);
      const g = el('g', {
        class: 'cal-nodo cal-' + est + (t.critico ? ' cal-critico' : ''),
        tabindex: o.interactivo ? '0' : null,
        'data-tramo': t.clave
      });
      if (o.interactivo) {
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `${t.nombre}: ${t.vacio ? 'sin escribir' : t.cumplidas + ' de ' + t.total + ' señales presentes'}`);
      }

      // Anillo de progreso alrededor del nodo
      const r = compacta ? 7 : 9;
      const c = 2 * Math.PI * (r + 4);
      g.appendChild(el('circle', { cx: t.x, cy: t.y, r: r + 4, class: 'cal-anillo-fondo' }));
      if (!t.vacio) {
        g.appendChild(el('circle', {
          cx: t.x, cy: t.y, r: r + 4, class: 'cal-anillo',
          'stroke-dasharray': `${(c * t.razon).toFixed(2)} ${c.toFixed(2)}`,
          transform: `rotate(-90 ${t.x} ${t.y})`
        }));
      }
      g.appendChild(el('circle', { cx: t.x, cy: t.y, r: r, class: 'cal-punto' }));

      if (!compacta) {
        g.appendChild(el('text', { x: t.x, y: 245, class: 'cal-etq' }, t.nombre));
        g.appendChild(el('text', {
          x: t.x, y: t.y < 140 ? t.y - 22 : t.y + 30, class: 'cal-voz'
        }, t.vacio ? 'sin escribir' : `${t.cumplidas}/${t.total}`));
      }
      svg.appendChild(g);
    });

    return res;
  }

  global.Calibracion = { TRAMOS, calibrar, dibujar, estadoNodo };
})(window);
