# Henry Zimmerman | Portfolio Source

This repository contains the source code for my personal portfolio and research website, hosted at [henryzimmerman.net](https://henryzimmerman.net) (and served via GitHub Pages at `henryzimme.github.io`). I am currently a student at Phillips Academy Andover, Class of 2027. 

I built this site to be entirely self-contained and lightweight. There is no build step, no framework, and zero external dependencies beyond a few Google Fonts loaded via CDN. Everything runs on vanilla HTML, CSS, and JavaScript.

## Architecture & Features

* **Single-File Core:** The entire main portfolio lives inside a single `index.html` file. 
* **Interactive Starfield:** The background is a full-viewport HTML5 canvas that renders the Yale Bright Star Catalog. A script fetches `stars.json` at runtime, drawing an interactive starfield where clicking specific objects pulls up data from the SIMBAD astronomical database or the JPL Small-Body Database.
* **3D Orbital Visualization:** I built a standalone wrapper (`\docs\asteroid_3d.html`) for a Plotly-generated 3D model of asteroid 7605 Cindygraber. It visualizes phase angle and illumination geometry across my Jan–Mar 2026 observing campaign. This simulation is meant to show the challenges of observing when the frequency of the window function is harmonic with the ground truth frequency you're measuring.
## Repository Map

* `index.html` — The main portfolio site.
* `\docs\asteroid_3d.html` — Standalone interactive 3D orbital model for asteroid 7605 Cindygraber.
* `template.html` — The master article template.
* `japan.html`, `muralism.html`, `baghdad.html`, `descartes.html` — Standalone academic essays converted from docx with the template.
* `stars.json` — The Yale Bright Star Catalog dataset, converted to JSON for ease of use.
