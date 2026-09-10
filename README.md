# 🎭 DuplexDrama — Demo Page

> **TTS-synthesized full-duplex spoken dialogue dataset with persona, full-duplex behaviour, expressive speech, and sound events.**

This repository hosts the **demo page** for the DuplexDrama paper. It
shows curated audio samples, statistics, and methodology.

**The full 6,400-dialogue dataset (800 h) is NOT in this repository.**
The full release lives on Hugging Face Datasets and Zenodo (see
[DEPLOYMENT.md](DEPLOYMENT.md) for the multi-platform distribution plan).

---

## Quick Links

| | |
|---|---|
| 🎧 **Listen to samples** | [duplexdrama.github.io](https://duplexdrama.github.io/) |
| 📄 **Paper** | arXiv:XXXX.XXXXX (link after submission) |
| 💻 **Code** | [github.com/DuplexDrama/duplexdrama-code](https://github.com/DuplexDrama/duplexdrama-code) |
| 🤗 **Full dataset** | [huggingface.co/datasets/DuplexDrama/duplexdrama](https://huggingface.co/datasets/DuplexDrama/duplexdrama) |
| ⚖️ **License** | [LICENSE](LICENSE) (CC BY 4.0 audio + Apache 2.0 code) |
| 🛡️ **Ethics** | [ETHICS.md](ETHICS.md) (VCTK-style rider + takedown policy) |
| 🚀 **Deployment** | [DEPLOYMENT.md](DEPLOYMENT.md) |

---

## What's in This Repo

```
duplexdrama-demo/
├── index.html              ← The entire demo page (one file, hand-rolled HTML)
├── assets/
│   ├── css/style.css       ← Custom theme (purple #5E60CE + cyan #48BFE3)
│   ├── js/main.js          ← wavesurfer.js v7 + IntersectionObserver + copy button
│   ├── images/             ← Pipeline diagram, etc.
│   └── audio/
│       ├── _tier1/         ← 12 headline excerpts (60s each, wavesurfer)
│       ├── _tier2/         ← ~100 grid clips (60s each, native HTML5 audio)
│       └── _tier3/         ← 6 full dialogues (7.88 min each, wavesurfer)
├── scripts/
│   ├── encode_samples.sh   ← ffmpeg: WAV → Opus + AAC (loudnorm, trim head/tail)
│   ├── extract_samples.py  ← Select representative clips from the full dataset
│   ├── watermark_audioseal.py  ← AudioSeal inaudible watermark embedder
│   └── build_demo.py       ← Generates the Tier 2 sample-grid table HTML
├── LICENSE                 ← Dual-license notice (CC BY 4.0 + Apache 2.0)
├── ETHICS.md               ← Ethical-use rider + takedown policy
├── README.md              ← You are here
└── DEPLOYMENT.md          ← Deployment guide (GitHub Pages + HF + Zenodo)
```

Total demo-page footprint: **~105 MB** (well under GitHub Pages 1 GB
limit).

---

## Design Decisions

See [`docs/research/2026-09-02-demo-plan.md`](../research/2026-09-02-demo-plan.md)
for the full rationale. Highlights:

| Decision | Choice | Why |
|---|---|---|
| **Template stack** | Plain HTML + Bulma 0.9 + Font Awesome + custom CSS | Matches field convention (NaturalSpeech 3, VoiceCraft, Seed-TTS, DuplexGen, dGSLM) — no SSG, no build step |
| **Color palette** | `#5E60CE` purple + `#48BFE3` cyan | Differentiates from Moshi / Sommelier / NVIDIA green |
| **Audio codec (primary)** | Opus 48 kbps stereo | Best size/quality tradeoff for speech |
| **Audio codec (fallback)** | AAC in MP4 container (`.m4a`) | Universal macOS/iOS compatibility (replaces MP3 since `libmp3lame` is unavailable in our ffmpeg) |
| **Audio player** | wavesurfer.js v7.12.11 for dual-channel + HTML5 `<audio>` for grid | Dual-channel visualisation where it matters; native audio everywhere else (zero JS dependency) |
| **Lazy init** | IntersectionObserver | Avoid decoding 12 × 7.88 min dialogues on page load |
| **License** | CC BY 4.0 (audio) + Apache 2.0 (code) | LibriSpeech / Moshi / LibriTTS precedent |
| **Speaker identity** | SPK-A01..A32 pseudonymised | GDPR Art. 9 + right-of-publicity risk mitigation |
| **Watermarking** | AudioSeal (Meta AI) per-file | EU AI Act Article 50 compliance |

---

## Local Preview

```bash
# From this directory
python3 -m http.server 8000
# Then open http://localhost:8000/
```

> ℹ️ The page renders correctly even without any audio files loaded —
> the wavesurfer blocks will simply show an empty waveform placeholder,
> and the grid will show a stub row.

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deployment guide
(GitHub Pages + Hugging Face Datasets + Zenodo).

---

## When New Data Is Ready

**Read [`docs/DEMO_BUILD_SPEC.md`](docs/DEMO_BUILD_SPEC.md) first.** It is the
authoritative build contract: the three-step pipeline, the selection guards,
the audio spec, what each card shows and where that data comes from, the data
pitfalls hit during the v1 build, what a better showcase drop should contain,
and the post-rebuild verification checklist.

Short version — three commands, in order:

```bash
PY=/data/conda_gqx/miniconda3/envs/paper_writing/bin/python
LST=/path/to/<subset>_dur.lst
ANN=/path/to/<subset>_annotations.jsonl

# 1. pick the clips
$PY scripts/v1_select_10_clips.py --lst "$LST" --annotations "$ANN" \
    --output samples_selection.json

# 2. build the audio (proxy needed on first run, to fetch AudioSeal weights)
HTTPS_PROXY=socks5h://127.0.0.1:1080 HTTP_PROXY=socks5h://127.0.0.1:1080 \
$PY scripts/v1_rebuild_clips.py samples_selection.json \
    --annotations "$ANN" --output assets/audio/_showcase

# 3. render the page
$PY scripts/v1_inject_showcase.py samples_selection.json \
    --index index.html --audio-dir assets/audio/_showcase

# 4. preview (loopback only)
python3 -m http.server 8765 --bind 127.0.0.1
```

`extract_samples.py`, `encode_samples.sh`, `build_demo.py` and
`v1_extract_encode.sh` belong to the superseded Tier 1/2/3 design and the
two-stage encode chain. They are kept for reference only — using them
reintroduces the double-lossy-encode and mono-collapse defects described in
§5 of the build spec.

---

## Contributing

This is a paper-artifact release. Bug reports and
suggestions are welcome via GitHub Issues.

---

## Citation

Citation information will be added once the paper is published.

---

Last updated: 2026-09-02