# LinkedIn post

Draft announcement post, for AFTER the demo is deployed and the npm packages are
published. English, plain language, honest tone. Opens with the timeless problem;
the browser/local angle is the star; a live "try it now" demo is the main CTA;
npm is the developer line; the EU AI Act is a plain factual beat; the KB
comparison is a one-line trust anchor.

DO NOT POST until: (1) the demo is deployed and the [DEMO LINK] is filled in,
(2) the npm packages are published, (3) the GitHub repo is public and pushed.
Any of those missing turns a CTA into a broken promise.

---

Most companies want to use AI. Most companies also handle personal data. Those two things don't always mix.

I couldn't find an open Swedish model built for this, so I built one.

It's called maskera. It finds and hides sensitive info (names, ID numbers, addresses) in your text before it reaches the AI.

Everything happens inside your browser.

Your data never leaves your device. Not even to me.

The model is just 40 MB, small enough to run on your laptop, yet nearly on par with the National Library of Sweden's full-size model. It's fully open, so you can check that yourself.

And on August 2, the EU AI Act's rules for high-risk AI come into effect, raising the bar for how organizations handle personal data.

Swedish-first and free to use. Useful anywhere personal data meets AI, especially healthcare, law, support and the public sector.

You can try it right now, in your browser. Nothing to install: [DEMO LINK]

For developers, it's one npm install to drop into your app. If your team wants help integrating, I'm glad to talk.

Would something like this be useful where you work? 👇

---

Links (consider putting these in the first comment, not the post body, since
external links can suppress LinkedIn reach):

- Demo: [DEMO LINK]
- Code: https://github.com/joelhagvall/maskera
- Model: https://huggingface.co/joelhagvall/maskera-sv-ner
- npm: `npm i @maskera/ner @huggingface/transformers`

---

## Notes

- **Ship before you post.** Deploy the demo, publish npm, push the repo public.
  "Try it now" and "one npm install" must be true, or the first person who clicks
  loses trust. This is the same honesty rule as everywhere else in the project.
- **The live demo is the main CTA, not npm.** A LinkedIn audience is mostly
  non-developers; they will paste text into a browser, not run `npm install`.
- **Never write "beats KB".** We match KB (0.92 vs 0.92 F1 at fp32); the shipped
  40 MB q4 is a few points below. Say "nearly on par" / "at a tenth the size".
- **Open with the human problem, not the AI Act.** Leading with regulation reads
  like a compliance vendor. The AI Act sits near the end with a neutral connector
  back to the theme ("raising the bar for how organizations handle personal
  data"), NOT a salesy tail like "stops being enough" or buzzwords like
  "privacy-first AI workflows".
- **"It's fully open, so you can check that yourself"** sits right after the KB
  claim on purpose: it turns the benchmark into something auditable, which is the
  social proof, not a boast.
- **The browser/local point is the differentiator**, so it stands alone, and
  "Not even to me." is the line people remember. Keep it bare, no markdown bold
  (LinkedIn plain text does not render it).
- **Soft availability signal, not a pitch.** "one npm install" plus "I'm glad to
  talk" opens the door to companies who want to integrate, framed as value to
  them, not a hunt for work.
- **KB is a trust anchor on one line only.** Don't make KB the hero of the post.
- **AI Act dates** (if anyone asks): in force since Aug 1 2024; prohibitions Feb 2
  2025; GPAI rules Aug 2 2025; most rules + high-risk requirements Aug 2 2026.
