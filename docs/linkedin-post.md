# LinkedIn post

Draft announcement post. English, plain language, honest tone (no inflated
claims). Opens with the timeless problem, not regulation; the browser/local
angle is the star; the EU AI Act is an urgency beat near the end; the KB
comparison is a one-line trust anchor.

---

Most companies want to use AI. Most companies also handle personal data. Those two things don't always mix.

I couldn't find an open Swedish model built for this, so I trained one.

It's called maskera. It finds and hides sensitive info (names, ID numbers, addresses) in your text before it reaches the AI.

The important part: everything happens inside your browser. Your data never leaves your device, not even to me. No cloud, no server, nothing to leak.

To make that practical, the model has to be small: 40 MB, small enough to run on your laptop, yet nearly on par with the National Library of Sweden's full-size model.

And on August 2, the EU AI Act's rules for high-risk AI kick in, so "we'll be careful" stops being enough.

Free and open. Swedish-first, for healthcare, law, support and the public sector.

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
  Keep the AI Act as the urgency beat lower down (drives launch engagement without
  dating the whole post).
- **The browser/local point is the real differentiator**, so it gets the spotlight,
  not the benchmark. Normies care about "my data never leaves my computer", not F1.
- **KB is a trust anchor on one line only.** "National Library of Sweden" lends
  authority; don't make KB the hero of the post.
- **No npm link on purpose**: `@maskera/core` / `@maskera/ner` are not published
  to npm yet. Don't link what doesn't exist.
- **Check the GitHub repo is public and pushed** before posting, or the code link 404s.
- **AI Act dates** (for accuracy if anyone asks): in force since Aug 1 2024;
  prohibitions Feb 2 2025; GPAI rules Aug 2 2025; most rules + high-risk
  requirements Aug 2 2026.
