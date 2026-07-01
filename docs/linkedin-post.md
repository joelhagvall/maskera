# LinkedIn post

Draft announcement post. English, plain language, honest tone (no inflated
claims). Opens with the timeless problem, not regulation; the browser/local
angle is the star (its own stanza); the EU AI Act is a plain factual beat near
the end; the KB comparison is a one-line trust anchor.

---

Most companies want to use AI. Most companies also handle personal data. Those two things don't always mix.

I couldn't find an open Swedish model built for this, so I built one.

It's called maskera. It finds and hides sensitive info (names, ID numbers, addresses) in your text before it reaches the AI.

The important part: everything happens inside your browser.

Your data never leaves your device. Not even to me.

To make that practical, the model has to be small: 40 MB, small enough to run on your laptop, yet nearly on par with the National Library of Sweden's full-size model.

And on August 2, the EU AI Act's rules for high-risk AI take effect.

Free and open. Swedish-first, for healthcare, law, support and the public sector.

It's built to drop into your own product. If your team wants to integrate it, I'm glad to help.

Would something like this be useful where you work? 👇

Model: https://huggingface.co/joelhagvall/maskera-sv-ner
Code: https://github.com/joelhagvall/maskera

---

## Notes

- **Never write "beats KB".** We match KB (0.92 vs 0.92 F1 at fp32); the shipped
  40 MB q4 is a few points below. Say "nearly on par" / "matches at a tenth the
  size". Claiming to beat it is false and anyone with KB's model can disprove it.
- **Open with the human problem, not the AI Act.** Leading with regulation reads
  like a compliance vendor; the problem-first opener is timeless and on-brand.
  Keep the AI Act as a plain factual line near the end (state the milestone, no
  editorial tail like "stops being enough" or "matters more than ever").
- **The browser/local point is the real differentiator**, so it gets its own
  stanza and the memorable line ("Not even to me."). Normies care about "my data
  never leaves my computer", not F1.
- **"I built one", not "I trained one"** covers the distillation, quantization and
  engineering, not just training, and stays true.
- **KB is a trust anchor on one line only.** "National Library of Sweden" lends
  authority; don't make KB the hero of the post.
- **Soft availability signal, not a pitch.** "built to drop into your own product"
  frames it as a dev tool, and "I'm glad to help" opens the door to companies who
  want to integrate (the paid-services intent) without selling. Frame it as value
  to them (help integrating), not value to you (looking for work).
- **No npm link on purpose**: `@maskera/core` / `@maskera/ner` are not published
  to npm yet. Don't link what doesn't exist.
- **Check the GitHub repo is public and pushed** before posting, or the code link 404s.
- **AI Act dates** (for accuracy if anyone asks): in force since Aug 1 2024;
  prohibitions Feb 2 2025; GPAI rules Aug 2 2025; most rules + high-risk
  requirements Aug 2 2026.
