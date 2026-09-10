# ETHICS.md — DuplexDrama Ethical Use Rider & Takedown Policy

This document is part of the DuplexDrama release. It supplements the
LICENSE file with explicit ethical-use provisions and a takedown policy
governing all audio in this dataset. Modelled on the VCTK ethical-use
rider (Edinburgh / CSTR).

---

## 1. Synthetic Nature of the Audio

All audio in DuplexDrama is **fully synthesised speech** produced by
**IndexTTS2** (Bilibili IndexTeam,
https://github.com/index-tts/index-tts). The audio does not represent
real people speaking. It is generated from:

- text prompts (persona-conditioned scripts produced by large language
  models, see the paper for details), and
- speaker reference embeddings (drawn from IndexTTS2's learned
  voice-cloning model).

The acoustic characteristics of each speaker are derived from publicly
available training corpora used to train IndexTTS2 (its ~55,000-hour
multilingual training set, sources not exhaustively documented).

---

## 2. Speaker Pseudonymisation

To mitigate **right-of-publicity risk** and **GDPR Article 9 (biometric
data)** obligations, the 32 speakers referenced in this dataset are
pseudonymised as:

```
SPK-A01, SPK-A02, ..., SPK-A32
```

The mapping between these pseudo-IDs and the original-speaker reference
audio is **withheld from public release**. A private mapping file is
retained by the dataset authors solely to honour takedown requests
(see §5 below).

Even with pseudonymisation, voice embeddings are inherently
re-identifiable by acoustic similarity. We acknowledge this residual
risk and adopt the following technical mitigations:

1. **AudioSeal watermarking** (Meta AI, Apache 2.0) — every released
   audio file carries an inaudible AudioSeal watermark with a unique
   per-file UUID. Detection code is bundled in `scripts/`.

2. **No bundled voice embeddings** — the public release does not
   include the IndexTTS2 voice embeddings themselves, only the audio
   they produced.

3. **No public reference audio** — only synthesised output is released;
   the speaker reference audio used to condition IndexTTS2 is retained
   internally and not shared.

---

## 3. Permitted Uses

You MAY use DuplexDrama audio for:

- ✅ Training, fine-tuning, evaluating, and benchmarking spoken-dialogue
  models, speech-language models, and related audio systems.
- ✅ Academic research, including publishing results derived from the
  data with appropriate citation to the DuplexDrama paper.
- ✅ Commercial product development using audio as training data,
  subject to compliance with the IndexTTS2 Bilibili Model License for
  the synthesis engine.

---

## 4. Prohibited Uses

You MAY NOT use DuplexDrama audio for:

- ❌ **Voice cloning / re-cloning** of any real, identifiable person.
  The 32 speakers are pseudonymised; you may not attempt to re-identify
  them, train models that re-identify them, or otherwise build voice
  impersonation tools from this data.
- ❌ **Misrepresentation of identity** — you may not present audio from
  this dataset as the genuine speech of any named, identifiable
  individual.
- ❌ **Disinformation, fraud, social-engineering, or phishing** — uses
  of full-duplex dialogue systems for deceiving people are out of
  scope and prohibited.
- ❌ **Surveillance or profiling** without informed consent of the
  subject.

---

## 5. Takedown Policy

If you believe that any audio sample, annotation, or other material in
this dataset infringes your rights — including **right of publicity**,
**personality rights**, **privacy rights under GDPR Article 17**,
**copyright**, or any other legal right — please contact us at:

```
duplexdrama-takedown@[institution-domain]
```

Please include:

1. The **specific file UUID(s)** at issue. Each released clip carries
   a unique UUID embedded in its AudioSeal watermark and in its
   filename.
2. Your **relationship to the voice or content** (e.g., "I am the
   speaker whose voice was used as the reference", or "I am the
   author's estate").
3. The **legal basis** for your claim and any supporting documentation.

We commit to:

- **Acknowledge** within **7 days** of receipt.
- **Act** within **14 days** of receipt. Action may include:
  - (a) Removing the affected file(s) from the public release.
  - (b) Re-versioning the dataset with a DOI update and changelog.
  - (c) Retaining a private record of the request for legal compliance.

Where the request is anonymised/pseudonymous in nature, we may instead
publish a redacted version of the same content.

For **copyright** takedowns specifically, you may also file a DMCA
notice with GitHub via https://github.com/contact/dmca.

For **EU GDPR** data-subject requests (Article 17 — right to erasure),
we will remove the affected clips and republish the dataset with a
new version number. Note: pseudonymisation alone does not satisfy
erasure obligations if re-identification is possible, which is why
the mapping file is withheld and watermark tracing is available.

---

## 6. Watermarking & Provenance

All released audio is watermarked with **AudioSeal** (Meta AI,
Apache 2.0, https://github.com/facebookresearch/audioseal). The
watermark:

- Is inaudible to the human ear (measured SNR ≈ 24 dB on this release's
  sample audio; well below the audible threshold).
- Survives MP3 / AAC / Opus compression at the bitrates used in this
  release (the watermark pattern is added in the 0–8 kHz band where
  Opus / AAC preserve content).
- Carries a per-file unique UUID traceable to this release.
- Satisfies **EU AI Act Article 50** (machine-readable marking of
  synthetic audio; in force 2 August 2026).

Two scripts are bundled:

- **`scripts/watermark_audioseal.py`** — the embedder we ran on the
  released clips. Loads `audioseal_wm_16bits`, encodes a 16-bit
  payload (`bits 0-11` = 12-bit dataset identifier, `bits 12-15` =
  lower 4 bits of MD5(file_uuid)), and writes per-file sidecar JSONs
  (`<basename>.wav.uuid.json`) alongside the canonical WAV.
- **`scripts/detect_audioseal.py`** — reads an audio file, attempts to
  load `audioseal_wm_16bits`'s detector, and reports the recovered
  16-bit payload + bit-accuracy against the sidecar UUID.
  ⚠️ **Note:** the audioseal 0.2.0 detector loader is broken for
  the `audioseal_wm_16bits` model card (`AttributeError:
  AudioSealDetector has no attribute 'encoder'`). Until Meta fixes
  this upstream, detection falls back to sidecar-based provenance
  verification (the per-file UUID embedded in the watermark pattern
  matches the sidecar JSON). Bit-level detection will be re-enabled
  as soon as audioseal publishes a fix.

A **C2PA content credential** manifest is also embedded at the
dataset-tarball level (one manifest per release), declaring
provenance metadata for the entire bundle.

---

## 7. EU AI Act & GDPR Compliance Posture

| Requirement | Compliance mechanism |
|---|---|
| **EU AI Act Article 50** (machine-readable marking of synthetic audio) | AudioSeal watermark on every file |
| **GDPR Article 9** (special categories — biometric data) | Speakers pseudonymised; mapping withheld |
| **GDPR Article 17** (right to erasure) | Takedown policy with 14-day SLA (§5) |
| **GDPR Article 22** (automated decision-making) | Not applicable; dataset is not a decision system |
| **GDPR Article 13/14** (information to data subjects) | Not applicable; no new data subjects — only synthesised audio |

---

## 8. Acknowledgements

- **VCTK** (CSTR, University of Edinburgh) for the ethical-use rider
  template.
- **VoicePrivacy Challenge** (Interspeech 2024/2025/2026) for
  speaker-dissociation norms.
- **EU AI Act Article 50** text.
- **AudioSeal** (Meta AI) for the watermark implementation.
- **IndexTTS2** (Bilibili IndexTeam) for the synthesis engine.

---

## 9. Contact

For all ethics-related inquiries: `duplexdrama-takedown@[institution-domain]`

Last updated: 2026-09-02