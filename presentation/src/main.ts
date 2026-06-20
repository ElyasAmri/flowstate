import Reveal from "reveal.js";
import Highlight from "reveal.js/plugin/highlight";
import Notes from "reveal.js/plugin/notes";

// reveal.js core styles + theme.
import "reveal.js/reveal.css";
import "reveal.js/theme/black.css";
// Code-highlight theme for <pre><code> blocks.
import "reveal.js/plugin/highlight/monokai.css";

// Local overrides.
import "./style.css";

const deck = new Reveal({
  hash: true,
  slideNumber: true,
  plugins: [Highlight, Notes],
});

void deck.initialize();
