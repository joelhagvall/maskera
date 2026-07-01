# LinkedIn post

Draft announcement post. English, plain language, honest tone (no inflated
claims). The star is "runs in your browser, your data never leaves your device";
the KB comparison is a one-line trust anchor, not the headline. Swap the hook
line for your actual posting date.

---

On August 2, the EU AI Act's rules for high-risk AI kick in. If you build with AI and handle people's data, this just became your problem. 🔒

Everyone wants to use AI at work. Almost no one should paste personal data into it.

So I built maskera. It finds and hides sensitive info (names, ID numbers, addresses) in your text before it reaches the AI.

The key part: it runs inside your own browser. Your data never leaves your device, not even to me. No cloud, no server, nothing to leak.

To do that, the model has to be tiny. It is: 40 MB, small enough to run on your laptop, yet nearly on par with the National Library of Sweden's full-size Swedish model.

Free and open. Swedish-first, for healthcare, law, support and the public sector.

Does this help where you work? 👇

Model: https://huggingface.co/joelhagvall/maskera-sv-ner
Code: https://github.com/joelhagvall/maskera

---

## Notes

- **Never write "beats KB".** We match KB (0.92 vs 0.92 F1 at fp32); the shipped
  40 MB q4 is a few points below. Say "nearly on par" / "matches at a tenth the
  size". Claiming to beat it is false and anyone with KB's model can disprove it,
  which would sink the credibility this whole project is built on.
- **The browser/local point is the real differentiator**, so it gets the spotlight,
  not the benchmark. Normies care about "my data never leaves my computer", not F1.
- **KB is a trust anchor on one line only.** "National Library of Sweden" lends
  authority; don't make KB the hero of the post.
- **Hook variants**
  - Countdown (post in July): "On August 2, the EU AI Act's rules for high-risk AI kick in."
  - On the day (Aug 2): "As of today, the EU AI Act's rules for high-risk AI apply."
- **No npm link on purpose**: `@maskera/core` / `@maskera/ner` are not published
  to npm yet. Don't link what doesn't exist.
- **Check the GitHub repo is public and pushed** before posting, or the code link 404s.
- **AI Act dates** (for accuracy if anyone asks): in force since Aug 1 2024;
  prohibitions Feb 2 2025; GPAI rules Aug 2 2025; most rules + high-risk
  requirements Aug 2 2026.
