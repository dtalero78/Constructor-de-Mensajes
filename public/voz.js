/**
 * Entrevista por voz — cliente de OpenAI Realtime sobre WebRTC.
 *
 * El navegador nunca ve la OPENAI_API_KEY: pide a /agente/voz/token un token
 * efímero que además llega con la sesión ya configurada (instrucciones de
 * Living Room, voz, transcripción y la tool del briefing). Aquí solo se abre
 * el canal, se enchufa el micrófono y se escuchan los eventos.
 *
 * El briefing NO se saca parseando la conversación: el agente llama a la
 * función `entregar_briefing`, que es mucho más fiable y devuelve los seis
 * campos exactos que ya usa el flujo de texto.
 *
 * Sin dependencias.
 */
(function (global) {
  'use strict';

  const URL_LLAMADAS = 'https://api.openai.com/v1/realtime/calls';

  function crear(opciones) {
    const o = Object.assign({
      onEstado: () => {},
      onTranscripcion: () => {},   // (quien, texto, esFinal)
      onBriefing: () => {},
      onError: () => {}
    }, opciones || {});

    let pc = null;          // RTCPeerConnection
    let canal = null;       // RTCDataChannel
    let microfono = null;   // MediaStream
    let audioEl = null;     // <audio> con la voz del agente
    let cerrada = false;
    let briefingEntregado = false;

    const estado = (e) => { if (!cerrada || e === 'cerrada') o.onEstado(e); };

    function enviar(evento) {
      if (canal && canal.readyState === 'open') canal.send(JSON.stringify(evento));
    }

    function manejarEvento(ev) {
      switch (ev.type) {
        // --- lo que dice el predicador ---
        case 'conversation.item.input_audio_transcription.delta':
          if (ev.delta) o.onTranscripcion('usuario', ev.delta, false);
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (ev.transcript) o.onTranscripcion('usuario', ev.transcript, true);
          break;

        // --- lo que dice el agente ---
        case 'response.output_audio_transcript.delta':
        case 'response.audio_transcript.delta':
          if (ev.delta) o.onTranscripcion('agente', ev.delta, false);
          break;
        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done':
          if (ev.transcript) o.onTranscripcion('agente', ev.transcript, true);
          break;

        // --- turnos ---
        case 'input_audio_buffer.speech_started':
          estado('escuchando');
          break;
        case 'input_audio_buffer.speech_stopped':
          estado('pensando');
          break;
        case 'response.created':
          estado('hablando');
          break;
        case 'response.done':
          revisarBriefing(ev);
          if (!briefingEntregado) estado('esperando');
          break;

        case 'error':
          console.error('Realtime error:', ev.error);
          o.onError(ev.error?.message || 'Error en la sesión de voz.');
          break;
      }
    }

    /** El agente cierra llamando a entregar_briefing; los argumentos son el briefing. */
    function revisarBriefing(ev) {
      const salidas = ev.response?.output || [];
      const llamada = salidas.find(x => x.type === 'function_call' && x.name === 'entregar_briefing');
      if (!llamada || briefingEntregado) return;

      let datos;
      try {
        datos = JSON.parse(llamada.arguments || '{}');
      } catch (e) {
        o.onError('El agente entregó un briefing ilegible.');
        return;
      }

      briefingEntregado = true;

      // Se le confirma para que no se quede esperando la respuesta de la tool.
      enviar({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: llamada.call_id,
          output: JSON.stringify({ ok: true })
        }
      });

      estado('listo');
      o.onBriefing(datos);
    }

    async function iniciar() {
      estado('conectando');
      try {
        // 1. Token efímero (el servidor ya dejó la sesión configurada)
        const r = await fetch('/agente/voz/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: '{}'
        });
        const datos = await r.json();
        if (!r.ok) throw new Error(datos.error || 'No se pudo abrir la sesión de voz.');

        // 2. Micrófono
        try {
          microfono = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          throw new Error('No se pudo usar el micrófono. Dale permiso al navegador e inténtalo otra vez.');
        }

        // 3. Conexión
        pc = new RTCPeerConnection();

        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

        microfono.getTracks().forEach(t => pc.addTrack(t, microfono));

        canal = pc.createDataChannel('oai-events');
        canal.addEventListener('message', (e) => {
          try { manejarEvento(JSON.parse(e.data)); } catch (err) { /* evento no-JSON */ }
        });
        canal.addEventListener('open', () => {
          estado('esperando');
          // Arranca el agente: sin esto espera a que hable el predicador.
          enviar({ type: 'response.create' });
        });

        pc.addEventListener('connectionstatechange', () => {
          if (['failed', 'disconnected'].includes(pc.connectionState) && !cerrada) {
            o.onError('Se perdió la conexión de voz.');
            terminar();
          }
        });

        const oferta = await pc.createOffer();
        await pc.setLocalDescription(oferta);

        const respuesta = await fetch(`${URL_LLAMADAS}?model=${encodeURIComponent(datos.modelo)}`, {
          method: 'POST',
          body: oferta.sdp,
          headers: {
            Authorization: `Bearer ${datos.token}`,
            'Content-Type': 'application/sdp'
          }
        });
        if (!respuesta.ok) {
          const t = await respuesta.text();
          console.error('SDP rechazado:', respuesta.status, t.slice(0, 300));
          throw new Error('OpenAI rechazó la conexión de voz.');
        }

        await pc.setRemoteDescription({ type: 'answer', sdp: await respuesta.text() });
      } catch (error) {
        o.onError(error.message || 'No se pudo iniciar la entrevista por voz.');
        terminar();
      }
    }

    /** "Ya tengo suficiente": se le pide al agente que cierre con lo que tenga. */
    function pedirCierre() {
      if (briefingEntregado) return;
      enviar({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Ya no quiero más preguntas. Cierra ahora y llama a entregar_briefing con lo que tengas.' }]
        }
      });
      enviar({ type: 'response.create' });
      estado('cerrando');
    }

    function terminar() {
      if (cerrada) return;
      cerrada = true;
      try { canal && canal.close(); } catch (e) {}
      try { pc && pc.close(); } catch (e) {}
      if (microfono) microfono.getTracks().forEach(t => t.stop());
      if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
      canal = pc = microfono = audioEl = null;
      o.onEstado('cerrada');
    }

    return { iniciar, terminar, pedirCierre, get activa() { return !cerrada; } };
  }

  global.VozLivingRoom = { crear, soportado: !!(global.RTCPeerConnection && navigator.mediaDevices?.getUserMedia) };
})(window);
