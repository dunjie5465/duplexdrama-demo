# DuplexDrama — Deployment Guide

This document covers the multi-platform release of DuplexDrama's demo page
and full dataset. The total release footprint is split across three
platforms to stay within each platform's free-tier limits.

---

## Quick Reference

| Platform | Asset | Size | URL |
|---|---|---|---|
| **GitHub Pages** | Demo page + 105 MB curated samples | ~110 MB total | https://duplexdrama.github.io/ |
| **Hugging Face Datasets** | Full 2,881-dialogue dataset (Opus + M4A + WAV) | ~8 GB total | https://huggingface.co/datasets/DuplexDrama/duplexdrama |
| **Zenodo** | Archival WAV + DOI for citation | ~7 GB | (DOI minted on first upload) |

---

## 1. GitHub Pages (Demo Page)

The demo page is a **plain HTML** site hosted on GitHub Pages at
`https://<org>.github.io/duplexdrama-demo/` or a custom domain.

### One-time setup

```bash
# Create the org (or use an existing personal account)
gh repo create DuplexDrama/duplexdrama-demo --public \
  --description "DuplexDrama demo page"

# Enable GitHub Pages on the main branch
gh repo edit --enable-pages --pages-source main
```

### Per-release deployment

```bash
# From the local duplexdrama-demo/ directory:
git add -A
git commit -m "release: 2026-09-02 snapshot"
git push origin main
# GitHub Pages rebuilds automatically (~ 30 s)
```

### Custom domain (optional)

If you own `duplexdrama.org` or similar:

```bash
# Create CNAME file
echo "duplexdrama.org" > CNAME

# Configure DNS:
#   apex (duplexdrama.org)     → A records → 185.199.108.153 / .109.153 / .110.153 / .111.153
#   www.duplexdrama.org        → CNAME → <org>.github.io

# Enable HTTPS in repo Settings → Pages → Enforce HTTPS
```

### Notes

- This repo **must contain a `.nojekyll` file** (see repo root) to prevent
  GitHub Pages from running Jekyll on the `index.html` (which would break
  the page).
- Stay under **1 GB** for the published site.
- Stay under **~100 GB/month** for bandwidth; if traffic spikes, mirror
  the audio to Cloudflare R2 (free egress).

---

## 2. Hugging Face Datasets (Full Dataset)

The full 2,881-dialogue dataset is published as a Hugging Face Dataset for
the ML research community.

### One-time setup

```bash
# Install HF CLI
pip install huggingface_hub[cli]

# Login (creates ~/.cache/huggingface/token)
huggingface-cli login

# Create the dataset repo
huggingface-cli repo create DuplexDrama/duplexdrama --type dataset
```

### Per-release upload

```bash
cd /path/to/full_dataset

# Init the repo locally
git init
huggingface-cli lfs-enable
git remote add origin https://huggingface.co/datasets/DuplexDrama/duplexdrama

# Push everything (LFS handles the .wav / .opus / .m4a files)
git add -A
git commit -m "release: 2026-09-02 snapshot (2,881 dialogues, 378.39 h)"
git push origin main
```

### Dataset card

The dataset card is `docs/README_HF.md` in this repo. It must be copied to
the HF dataset repo's `README.md` after each release.

```bash
# After upload:
cp docs/README_HF.md /tmp/hf_dataset_README.md

# Copy to the HF repo
cd /tmp/clone_hf_dataset
cp /tmp/hf_dataset_README.md README.md
git add README.md
git commit -m "docs: update dataset card 2026-09-02"
git push origin main
```

### Tags for HF search (in README.md YAML frontmatter)

```yaml
tags:
  - audio
  - dialogue
  - emotion
  - speech
  - text-to-speech
  - full-duplex
  - conversation
  - arxiv:2606.xxxxx    # update with paper arXiv ID
  - license:cc-by-4.0
  - size_categories:100K<n<1M
```

---

## 3. Zenodo (Archival + DOI)

Zenodo provides a **citable DOI** that survives GitHub repo moves or
renames. We use Zenodo for the **archival WAV files** + dataset card.

### One-time setup

1. Sign in at https://zenodo.org/ with GitHub OAuth.
2. Enable the DuplexDrama GitHub repo in Zenodo's GitHub integration.

### Per-release deposition

Zenodo automatically creates a new DOI per GitHub release. Steps:

1. Create a GitHub release on the **archival repo** (e.g.,
   `DuplexDrama/duplexdrama-archive`):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   gh release create v1.0.0 --generate-notes
   ```
2. Zenodo picks up the release and mints a DOI automatically.
3. Update the BibTeX in the demo page + paper + HF dataset card to
   include the new DOI.

### Why a separate archive repo?

- Keeps the GitHub Pages demo repo small (1 GB limit).
- Allows Zenodo to mint DOIs from a clean repo history.
- Avoids exposing the 8 GB of WAVs to anyone cloning the demo repo.

---

## 4. Timing — When to Deploy Each Platform

| Phase | What to deploy | Where |
|---|---|---|
| **Submission time** | Demo page + curated samples | GitHub Pages |
| **Submission time** | "Demo on HF" placeholder card with `data_pending: true` | Hugging Face Datasets |
| **After acceptance** | Full dataset on HF | Hugging Face Datasets |
| **After acceptance** | Archival WAV deposit + DOI | Zenodo |
| **Post-acceptance** | Add citation, dataset links | All |

The "submission time" deployment is critical — reviewers need the demo
page to evaluate the dataset. The full release on HF + Zenodo happens
**only after acceptance** to keep the dataset anonymous during review.

---

## 5. Multi-Platform Bandwidth Math

For reference, here's the math that motivates the three-platform split:

| Platform | Hard limit | DuplexDrama usage | Margin |
|---|---|---|---|
| GitHub Pages (site size) | **1 GB** | 110 MB (demo + samples) | **11%** |
| GitHub Pages (bandwidth) | **~100 GB/month** | 105 MB × ~1k visitors = 105 GB | ~ tight; use R2 mirror if exceeded |
| HF Datasets (storage) | Unlimited for public | 8 GB | OK |
| HF Datasets (bandwidth) | Unlimited for public | 8 GB × ~10k visitors = 80 TB | OK (HF is designed for this) |
| Zenodo (storage) | 50 GB per record | 7 GB | 14% margin |

If GitHub Pages bandwidth spikes (e.g., demo goes viral on Hacker News),
mirror the demo audio to **Cloudflare R2** (free egress) and update the
audio paths in `index.html` to point to R2 URLs.

---

## 6. CI / Automation (optional)

A simple GitHub Actions workflow (`.github/workflows/deploy.yml`) can
auto-deploy the demo page on every push to `main`:

```yaml
name: Deploy demo page
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
```

This is optional — manual `git push` works equally well for a paper-artifact
release.

---

## 7. Verification Checklist

Before announcing the deployment:

- [ ] Demo page loads at https://duplexdrama.github.io/ (or custom domain)
- [ ] All 12 Tier 1 audio files play in Chrome, Firefox, Safari, Edge
- [ ] All 100 Tier 2 audio files play in the same browsers
- [ ] All 6 Tier 3 audio files play
- [ ] wavesurfer.js dual-channel waveforms render correctly
- [ ] BibTeX copy button works (clipboard write succeeds)
- [ ] LICENSE and ETHICS.md links are reachable from the demo page
- [ ] HF dataset card renders correctly with audio viewer
- [ ] AudioSeal watermark detection succeeds on a sample clip
- [ ]  DOI is citable in BibTeX
- [ ] ORCID IDs of all co-authors are confirmed (23 Sep 2026 deadline)

---

Last updated: 2026-09-02