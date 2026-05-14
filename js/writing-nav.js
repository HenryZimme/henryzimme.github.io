// central navigation sequence for all subpages.
// to add a page: append one object to the array below.
// prev/next links on every page update automatically.
//
// section values: 'writing' | 'research'
// slug must match the filename without .html
const nav_pages = [
  { slug: 'descartes',       title: 'Disproving Descartes',          section: 'writing'  },
  { slug: 'believingbelief', title: 'Believing Belief',              section: 'writing'  },
  { slug: 'borderlands',     title: 'New Mestiza, Old Divisions',    section: 'writing'  },
  { slug: 'lisbon',          title: 'The Lisbon Catalyst',           section: 'writing'  },
  { slug: 'calls',           title: 'Calls',                        section: 'writing'  },
  { slug: 'afonso',          title: 'King Afonso I',                 section: 'writing'  },
  { slug: 'ccd_calibration', title: 'CCD Characterization',         section: 'research' },
];

(function () {
  // derive slug from current url, stripping leading slash and .html extension
  const slug = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index';
  const idx = nav_pages.findIndex(p => p.slug === slug);

  // page not in sequence (e.g. index, special pages) — do nothing
  if (idx === -1) return;

  const current = nav_pages[idx];
  const prev    = idx > 0              ? nav_pages[idx - 1] : null;
  const next    = idx < nav_pages.length - 1 ? nav_pages[idx + 1] : null;

  const nav_el = document.querySelector('footer.footer-nav');
  if (!nav_el) return;

  const section_href  = `index.html#${current.section}`;
  const section_label = current.section === 'research' ? 'Research' : 'Writing';

  let html = `<a href="${section_href}" class="nav-back">← Back to ${section_label}</a>`;
  if (next) {
    html += `\n  <a href="/${next.slug}.html" class="nav-back">Next: ${next.title} →</a>`;
  }

  nav_el.innerHTML = html;
})();