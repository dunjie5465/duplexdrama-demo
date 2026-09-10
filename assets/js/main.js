// ============================================================
// DuplexDrama demo page — main.js
// - wavesurfer.js v7.12.11 dual-channel rendering, two stacked
//   mono waveforms (HM on top, AI on the bottom).
// - IntersectionObserver lazy init (decode-on-scroll, not on load)
// - Exclusive playback (one sample at a time)
// - BibTeX copy button
// ============================================================

import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7.12.11/dist/wavesurfer.esm.js';

// ---------- Browser feature detection ----------
const canOpus = (() => {
  try {
    const a = document.createElement('audio');
    const res = a.canPlayType('audio/ogg; codecs=opus');
    return res === 'probably' || res === 'maybe';
  } catch {
    return false;
  }
})();

// ---------- Format timestamp ----------
const fmt = s => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// ---------- Button labels ----------
// Must match the label the markup ships for `.play`, otherwise a button
// changes language the first time it is clicked and the page mixes both.
const LABEL_PLAY = 'Play';
const LABEL_PAUSE = 'Pause';

// ---------- Exclusive playback ----------
// Each card registers ONE "player" entry, but each entry actually wraps
// TWO audio elements (HM + AI). Pausing on a different card needs to
// stop BOTH — otherwise one speaker keeps talking after the user has
// moved on.
const players = new Set();

function pauseOthers(except) {
  players.forEach(p => {
    if (p === except) return;
    try {
      p.pause();
    } catch {
      /* a card torn down mid-iteration is not worth failing over */
    }
  });
}

// ============================================================
// Per-card dual wavesurfer
//
// Each card owns two independent mono audio elements (HM + AI) and
// renders each into its own canvas (.wave-hm on top, .wave-ai below).
// Muting a channel flips that wavesurfer's internal `volume` property
// between 0 and 1, which writes directly to its gainNode — see the
// comment above the mute-toggle handler for why this works while
// `audio.muted` and `ws.setMuted()` do not.
//
// Why not the obvious stereo approach? wavesurfer.js v7, when given a
// `media` option, uses its WebAudio backend and internally calls
// createMediaElementSource on the element. Routing the same element
// through our own splitter+merger graph calls createMediaElementSource
// a second time, which throws InvalidStateError — so the gain graph
// never gets built, both toggle buttons disable themselves, and the
// user sees "click either mute = silence everything". Two mono
// elements sidestep the collision entirely: each element belongs to
// exactly one wavesurfer, with its own source node and gainNode.
// ============================================================

function buildDuplexPlayer(el) {
  if (el._ddPlayer) return;

  // Set the caption from data-label
  const cap = el.querySelector('.cap');
  if (cap && el.dataset.label) {
    cap.textContent = el.dataset.label;
  }

  // Pick the format the browser can play (opus preferred, m4a fallback).
  const urlFor = role => {
    const opus = el.dataset[`${role}Opus`];
    const m4a = el.dataset[`${role}M4a`];
    if (canOpus && opus) return opus;
    if (m4a) return m4a;
    // Legacy stereo fallback (older manifests) — read once and derive
    // both channels from it. This branch only fires if the injector
    // pre-dates the playback_files refactor.
    if (el.dataset.opus || el.dataset.m4a) {
      const legacy = canOpus && el.dataset.opus
        ? el.dataset.opus
        : el.dataset.m4a;
      // The legacy stereo has ch0=HM, ch1=AI — but we cannot split it
      // here without re-entering the Web Audio trap we just left. So
      // if the injector ever regresses to emitting data-opus only, we
      // just point BOTH players at it and the mute stops working.
      // Better to fail loudly so the regression is noticed.
      console.warn('[DuplexDrama] legacy stereo URL used for', role,
                   '— per-channel mute will not work');
      return legacy;
    }
    return null;
  };

  const url_hm = urlFor('hm');
  const url_ai = urlFor('ai');
  if (!url_hm || !url_ai) {
    console.warn('[DuplexDrama] missing audio URLs for', el);
    return;
  }

  // Two independent <audio> elements. Each owns its own playback clock,
  // its own wavesurfer, and its own gainNode — so flipping one
  // wavesurfer's `volume` to 0 mutes exactly that channel without
  // touching the other.
  const audio_hm = new Audio();
  audio_hm.preload = 'metadata';
  const audio_ai = new Audio();
  audio_ai.preload = 'metadata';

  // WaveSurfer instances: HM on top (blue), AI on the bottom (orange).
  // Each binds its own audio element so their playback never interferes.
  //
  // We hide wavesurfer's own cursors (cursorWidth: 0) and paint a single
  // shared playhead over both waves via the .shared-cursor element the
  // injector emits. Two independently-rendered wavesurfer cursors look
  // subtly misaligned even when their media clocks agree, because each
  // wavesurfer runs its own RAF cycle — one DOM line driven from HM's
  // currentTime is rock-steady. The progress-fill (progressColor) on each
  // wave is still keyed to that wave's own currentTime, which is fine:
  // forward-only drift correction keeps the two within 30 ms of each
  // other, so the fills look like a single gradient split by the midline.
  //
  // Bar geometry: we keep `fillParent: true` (the v7 default) so the
  // whole waveform is visible without horizontal scrolling, but use
  // 1 px bars with no gap so the canvas never has to draw sub-pixel
  // geometry. The previous barWidth: 2 + barGap: 1 (3 px per slot) made
  // every clip look blurred at our clip lengths; the longer the clip,
  // the worse it got, because wavesurfer keeps the same number of
  // audio peaks regardless of canvas width. With 1 px bars and zero
  // gap, peaks overdraw cleanly into a solid coloured fill, and short
  // excerpts stay sharp.
  //
  // Long clips (>= SCROLL_THRESHOLD_S, currently 3 min) flip into
  // scrollable-window mode via `minPxPerSec: SCROLL_PX_PER_SEC`, since
  // a 7-minute clip compressed into an 800 px container is just a
  // solid colour block — no structure is visible at all. The flip
  // happens AFTER wavesurfer's `ready` event so we know the actual
  // duration; short clips never see the scrollbar.
  const SCROLL_THRESHOLD_S = 180;
  const SCROLL_PX_PER_SEC = 15;

  const sharedWaveOpts = {
    height: 48,
    normalize: true,
    barWidth: 1,
    barGap: 0,
    barRadius: 0,
    barMinHeight: 1,
    cursorWidth: 0,
  };

  const wave_hm = el.querySelector('.wave-hm');
  const wave_ai = el.querySelector('.wave-ai');
  const cursorShared = el.querySelector('.shared-cursor');
  if (!wave_hm || !wave_ai) {
    console.warn('[DuplexDrama] missing .wave-hm / .wave-ai in', el);
    return;
  }

  const ws_hm = WaveSurfer.create({
    ...sharedWaveOpts,
    container: wave_hm,
    media: audio_hm,
    waveColor: '#9db8d2', progressColor: '#3b6ea5',
    url: url_hm,
  });

  const ws_ai = WaveSurfer.create({
    ...sharedWaveOpts,
    container: wave_ai,
    media: audio_ai,
    waveColor: '#e0bfa0', progressColor: '#b5651d',
    url: url_ai,
  });

  // After metadata loads, decide whether this clip is long enough to
  // warrant the scrollable window. The initial render happens at
  // minPxPerSec: 0 (full display) — that's fine because every short
  // clip never re-renders, and the long ones get a quick repaint
  // with the wider canvas. We have to call setOptions on BOTH
  // wavesurfer instances even though their durations are identical
  // (they share the same source file split into two mono halves), so
  // the stack stays in lock-step visually.
  function maybeEnableScroll(ws) {
    const dur = ws.getDuration();
    if (Number.isFinite(dur) && dur >= SCROLL_THRESHOLD_S) {
      ws.setOptions({ ...sharedWaveOpts, minPxPerSec: SCROLL_PX_PER_SEC });
    }
  }
  ws_hm.on('ready', () => maybeEnableScroll(ws_hm));
  ws_ai.on('ready', () => maybeEnableScroll(ws_ai));

  const btn = el.querySelector('.play');
  const tEl = el.querySelector('.t');

  // ---- Sync play / pause / seek ---------------------------------------
  // Each card drives BOTH audio elements together; the user only ever
  // touches one Play button. The drift correction below keeps the two
  // element clocks within ~50 ms of each other (HTMLMediaElement
  // playback drifts in practice — independent decoders, separate
  // scheduling).
  function playBoth() {
    // Play in parallel; a Promise.all + first-rejection would lose the
    // better-behaved side, so kick both off and let either fail
    // silently. Both halves are identical-length mono from the same
    // source, so one is not "ahead" of the other in any meaningful way.
    const p1 = audio_hm.play();
    const p2 = audio_ai.play();
    if (p1 && p1.catch) p1.catch(() => {});
    if (p2 && p2.catch) p2.catch(() => {});
  }

  function pauseBoth() {
    audio_hm.pause();
    audio_ai.pause();
  }

  function seekBoth(t) {
    // currentTime is settable on HTMLMediaElement. Setting both at once
    // is the standard pattern when two elements share a playhead.
    if (audio_hm.readyState >= 1) audio_hm.currentTime = t;
    if (audio_ai.readyState >= 1) audio_ai.currentTime = t;
  }

  // Drift correction: HTMLMediaElement playback on two independent
  // elements walks apart over time (independent decoders, separate
  // scheduling). The fix is forward-only — pull the LAGGING element
  // forward to match the leading one, never push the leader backward.
  //
  // Why not snap both backward to Math.min(...)? That re-plays a
  // 30–50 ms slice on both elements every check. Inaudible when both
  // channels play together (the replay is identical on both sides),
  // but the moment one channel is muted the replay on the *audible*
  // channel becomes a distinct echo — which is exactly the bug we
  // shipped last round. Forward-only skips a tiny slice on the laggard
  // (which the user does not notice when audio is continuous speech)
  // and never replays anything.
  let driftTimer = null;
  function startDriftWatch() {
    stopDriftWatch();
    driftTimer = setInterval(() => {
      if (audio_hm.paused && audio_ai.paused) return;
      const diff = audio_hm.currentTime - audio_ai.currentTime;
      if (Math.abs(diff) > 0.03) {
        if (diff > 0) audio_ai.currentTime = audio_hm.currentTime;
        else          audio_hm.currentTime = audio_ai.currentTime;
      }
    }, 200);
  }
  function stopDriftWatch() {
    if (driftTimer) clearInterval(driftTimer);
    driftTimer = null;
  }

  // ---- Transcript follow-along -----------------------------------------
  const turnEls = Array.from(el.querySelectorAll('ol.transcript .turn'));
  const turnSpans = turnEls.map(li => ({
    el: li,
    start: parseFloat(li.dataset.start),
    end: parseFloat(li.dataset.end),
  })).filter(t => Number.isFinite(t.start) && Number.isFinite(t.end));

  const transcriptBox = el.querySelector('.transcript-box');
  const scroller = el.querySelector('ol.transcript');
  let lastLead = null;

  function highlightAt(time) {
    if (!turnSpans.length) return;
    let lead = null;
    for (const t of turnSpans) {
      const active = time >= t.start && time < t.end;
      t.el.classList.toggle('is-playing', active);
      if (active && (lead === null || t.start < lead.start)) lead = t;
      t.el.classList.toggle('is-past', time >= t.end);
    }
    if (lead && lead !== lastLead && transcriptBox && transcriptBox.open && scroller) {
      const liTop = lead.el.offsetTop - scroller.offsetTop;
      const target = liTop - (scroller.clientHeight / 2) + (lead.el.clientHeight / 2);
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
    lastLead = lead;
  }

  function clearHighlight() {
    turnSpans.forEach(t => t.el.classList.remove('is-playing', 'is-past'));
    lastLead = null;
  }

  // Clicking a line seeks to it — the transcript doubles as a chapter list.
  turnSpans.forEach(t => {
    t.el.classList.add('is-seekable');
    t.el.addEventListener('click', () => {
      const dur = ws_hm.getDuration();
      if (dur > 0) seekBoth(Math.min(t.start, dur));
    });
  });

  // Sound-event chips seek to the moment the event was mixed in. Nudge
  // back slightly so the onset is heard rather than jumped over.
  el.querySelectorAll('.sound-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const at = parseFloat(chip.dataset.start);
      const dur = ws_hm.getDuration();
      if (Number.isFinite(at) && dur > 0) {
        seekBoth(Math.max(0, Math.min(at - 0.4, dur)));
        playBoth();
      }
    });
  });

  if (btn) {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (audio_hm.paused) playBoth();
      else pauseBoth();
    });
  }

  // ---- Per-channel mute toggles -----------------------------------------
  // data-ch="0" is HM (top waveform), data-ch="1" is AI (bottom).
  //
  // Why direct audio element writes instead of ws.setMuted / ws.volume:
  //   * WaveSurfer v7's WebAudio backend calls createMediaElementSource
  //     on the audio element we pass via `media:`, then routes through
  //     its own gainNode → destination graph.
  //   * ws.setMuted(t) just writes this.media.muted = t — and the muted
  //     flag on an HTMLMediaElement that is connected to a
  //     MediaElementAudioSourceNode is not reliably honoured by Chrome
  //     (the source node's output ignores the change). Verified by the
  //     previous round of testing.
  //   * ws.setVolume(t) and ws.volume = X are both no-ops or write to
  //     this.media.volume, which has the same propagation problem.
  //     The `gainNode` itself is a private member of the backend
  //     (WebAudioPlayer), with no public API to reach.
  //
  // What does work: setting `audio.volume = 0` directly. Chrome's
  // MediaElementAudioSourceProvider reads the element's volume to scale
  // the source-node output, so the change reaches the speakers. We
  // also flip `audio.muted = true` as belt-and-suspenders for browsers
  // where that flag DOES propagate (Safari, for instance).
  el.querySelectorAll('.ch-toggle').forEach(tgl => {
    tgl.addEventListener('click', () => {
      const ch = Number(tgl.dataset.ch);
      if (!Number.isInteger(ch)) return;

      const targetAudio = ch === 0 ? audio_hm : audio_ai;
      const wasAudible = targetAudio.volume > 0.01;
      targetAudio.volume = wasAudible ? 0 : 1;
      targetAudio.muted = wasAudible;        // safari fallback
      mutedMask = wasAudible
        ? (mutedMask | (1 << ch))
        : (mutedMask & ~(1 << ch));

      tgl.classList.toggle('is-muted', wasAudible);
      tgl.setAttribute('aria-pressed', String(wasAudible));

      // Grey the matching waveform so sight matches sound.
      const wave = ch === 0 ? wave_hm : wave_ai;
      if (wave) wave.classList.toggle('is-muted', wasAudible);

      refreshDriftWatch();
    });
  });

  // While any channel is muted, drift correction is suppressed. Without
  // that guard the muted element drifts naturally, then the next 200 ms
  // forward-snap pulls the AUDIBLE element forward in audible chunks —
  // the listener hears speech stutter. With drift correction paused the
  // two clocks walk apart by at most tens of milliseconds per minute
  // (natural decoder drift), which is inaudible and only desyncs the
  // two progress fills slightly. `refreshDriftWatch` re-evaluates every
  // time mute state or play state flips so the timer is exactly on
  // whenever both elements are playing AND nothing is muted.
  let mutedMask = 0;
  function refreshDriftWatch() {
    const anyMuted = mutedMask !== 0;
    const bothPlaying = !audio_hm.paused && !audio_ai.paused;
    if (anyMuted || !bothPlaying) stopDriftWatch();
    else startDriftWatch();
  }

  // ws_hm drives the displayed time (HM is the lead track — the user
  // hears it first; the transcript and timestamp share one clock).
  // We also reposition the shared DOM playhead on every wavesurfer
  // timeupdate. Both audio elements should be at the same currentTime
  // modulo a tiny drift, and rendering one cursor from HM's clock keeps
  // the two stacked waves in lock-step visually.
  function renderSharedCursor(current) {
    if (!cursorShared) return;
    const dur = ws_hm.getDuration();
    if (!dur || !isFinite(dur)) {
      cursorShared.style.transform = 'translateX(0)';
      return;
    }
    const ratio = Math.max(0, Math.min(1, current / dur));
    const parent = cursorShared.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    cursorShared.style.transform = `translateX(${ratio * w}px)`;
  }

  // Click-to-seek sync. The user can click either waveform to jump.
  // We listen on the wavesurfer `click` event — emitted by the
  // internal click handler AFTER `seekTo` has moved the element
  // attached to that wavesurfer. The argument is the fractional
  // position (0..1), so we multiply by the duration to get an
  // absolute time for the OTHER audio element.
  //
  // Why not the `seeking` event? We tried that first, and it kept
  // the cards stuck: wavesurfer's reactive state fires `seeking`
  // every time the seek event fires OR currentTime changes, and our
  // mirror assignment (`audio_ai.currentTime = t`) is itself a
  // currentTime write, which can cascade through both audios' reactive
  // graphs and leave them perpetually in `isSeeking=true`. With the
  // audio element stuck in seeking state, `audio.play()` returns a
  // promise that never resolves — the play button looks dead. The
  // `click` event fires exactly once per click and at a point where
  // the seek has already landed, so the cascade can't happen.
  ws_hm.on('click', (fraction) => {
    const dur = ws_hm.getDuration();
    if (Number.isFinite(fraction) && dur > 0) {
      audio_ai.currentTime = fraction * dur;
    }
  });
  ws_ai.on('click', (fraction) => {
    const dur = ws_ai.getDuration();
    if (Number.isFinite(fraction) && dur > 0) {
      audio_hm.currentTime = fraction * dur;
    }
  });

  ws_hm.on('ready', (duration) => {
    if (tEl) tEl.textContent = fmt(duration);
    renderSharedCursor(0);
  });

  ws_hm.on('timeupdate', (current) => {
    if (tEl) tEl.textContent = fmt(current);
    renderSharedCursor(current);
    highlightAt(current);
  });

  // One wavesurfer's 'play' event is enough — we already call playBoth()
  // from the button, which fires 'play' on both audio elements. Use any
  // source (whichever the browser reports first) to enforce exclusivity.
  const handlePlay = () => {
    pauseOthers(playerEntry);
    if (btn) {
      btn.innerHTML = '<span class="icon"><i class="fa-solid fa-pause"></i></span>'
                    + `<span>${LABEL_PAUSE}</span>`;
      btn.classList.remove('is-primary');
      btn.classList.add('is-warning');
      btn.setAttribute('aria-pressed', 'true');
    }
    refreshDriftWatch();
  };
  audio_hm.addEventListener('play', handlePlay);
  audio_ai.addEventListener('play', handlePlay);

  const handlePause = () => {
    // Only flip the button when BOTH sides have stopped — otherwise a
    // momentary hiccup on one element would relabel the button while
    // the other is still talking.
    if (!audio_hm.paused || !audio_ai.paused) return;
    if (btn) {
      btn.innerHTML = '<span class="icon"><i class="fa-solid fa-play"></i></span>'
                    + `<span>${LABEL_PLAY}</span>`;
      btn.classList.remove('is-warning');
      btn.classList.add('is-primary');
      btn.setAttribute('aria-pressed', 'false');
    }
    refreshDriftWatch();
  };
  audio_hm.addEventListener('pause', handlePause);
  audio_ai.addEventListener('pause', handlePause);

  const handleEnded = () => {
    if (tEl) tEl.textContent = fmt(ws_hm.getDuration());
    clearHighlight();
    stopDriftWatch();
  };
  audio_hm.addEventListener('ended', handleEnded);

  // ---- Error fallback ---------------------------------------------------
  // Graceful degradation: if wavesurfer fails (browser lacks WebCodecs,
  // etc.), drop a native <audio> element into the HM container so the
  // user still hears the clip.
  ws_hm.on('error', (err) => {
    console.error('[DuplexDrama] HM wavesurfer error', err);
    if (wave_hm) {
      wave_hm.innerHTML =
        `<audio controls preload="none" src="${url_hm}"></audio>`;
    }
  });
  ws_ai.on('error', (err) => {
    console.error('[DuplexDrama] AI wavesurfer error', err);
  });

  // Pause both when the card scrolls out of view — saves CPU and stops
  // a card the user has left behind from keeping the speaker going.
  if ('IntersectionObserver' in window) {
    const visObs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && (!audio_hm.paused || !audio_ai.paused)) {
        pauseBoth();
      }
    }, { threshold: 0.1 });
    visObs.observe(el);
  }

  // Register with the exclusive-playback set.
  const playerEntry = {
    ws_hm, ws_ai, audio_hm, audio_ai,
    pause() { pauseBoth(); },
  };
  el._ddPlayer = playerEntry;
  players.add(playerEntry);
}

// Lazy-init via IntersectionObserver — CRITICAL because our dialogues are
// 7.88 min long; decoding 12 of them on page load would freeze the tab.
const playerObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      buildDuplexPlayer(entry.target);
      observer.unobserve(entry.target);
    }
  });
}, {
  rootMargin: '300px',  // start building 300px before entering viewport
});

// Observe all .duplex elements (Tier 1 + Tier 3)
document.querySelectorAll('.duplex').forEach(el => playerObserver.observe(el));

// ============================================================
// BibTeX copy button
// ============================================================
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const targetId = btn.dataset.target;
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    const text = target.textContent || target.innerText;

    try {
      await navigator.clipboard.writeText(text);
      btn.innerHTML = '<span class="icon"><i class="fa-solid fa-check"></i></span><span>Copied!</span>';
      btn.classList.add('is-success');

      setTimeout(() => {
        btn.innerHTML = '<span class="icon"><i class="fa-regular fa-copy"></i></span><span>Copy</span>';
        btn.classList.remove('is-success');
      }, 2000);
    } catch (err) {
      // Fallback for older browsers / insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        btn.innerHTML = '<span class="icon"><i class="fa-solid fa-check"></i></span><span>Copied!</span>';
        btn.classList.add('is-success');
        setTimeout(() => {
          btn.innerHTML = '<span class="icon"><i class="fa-regular fa-copy"></i></span><span>Copy</span>';
          btn.classList.remove('is-success');
        }, 2000);
      } catch (e2) {
        btn.innerHTML = '<span class="icon"><i class="fa-solid fa-times"></i></span><span>Failed</span>';
      }
      document.body.removeChild(ta);
    }
  });
});

// ============================================================
// Smooth-scroll for anchor links (Bulma navbar)
// ============================================================
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = link.getAttribute('href');
    if (target === '#' || target.length < 2) return;
    const el = document.querySelector(target);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL hash without jumping
      history.pushState(null, '', target);
    }
  });
});

// ============================================================
// Console banner — provenance disclosure (so reviewers see it)
// ============================================================
console.log(
  '%c🎭 DuplexDrama Demo',
  'color: #5E60CE; font-weight: 700; font-size: 16px;'
);
console.log(
  '%cAudio licensed CC BY 4.0 · Code licensed Apache 2.0\n' +
  'Synthesized using IndexTTS2 (Bilibili IndexTeam, non-commercial research license)\n' +
  'Watermarked with AudioSeal (Meta AI, Apache 2.0)\n' +
  'See https://duplexdrama.github.io/ETHICS.md for the full ethical-use rider',
  'color: #6B7280; font-size: 12px;'
);
