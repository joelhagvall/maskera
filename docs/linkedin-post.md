# LinkedIn post

Draft announcement post. English, plain language, honest tone (no inflated
claims). Swap the hook line for your actual posting date.

---

On August 2, the EU AI Act's rules for high-risk AI kick in. If your product touches people's personal data, "we'll be careful" no longer cuts it. 🔒

Everyone wants to use AI at work. Almost no one should paste personal data into it.

So I built maskera. It automatically hides sensitive info (names, ID numbers, addresses) in your text before it reaches the AI, right in your browser, so the data never leaves your computer.

The neat part: it's nearly as accurate as Sweden's leading NER model, but 10x smaller, so it runs on your own device with no server needed.

Free and open. Swedish-first, for healthcare, law, support and the public sector.

Does this help where you work? 👇

Model: https://huggingface.co/joelhagvall/maskera-sv-ner
Code: https://github.com/joelhagvall/maskera

---

## Notes

- **Hook variants**
  - Countdown (post in July): "On August 2, the EU AI Act's rules for high-risk AI kick in."
  - On the day (Aug 2): "As of today, the EU AI Act's rules for high-risk AI apply."
- **"nearly as accurate"** is deliberate: the shipped 40 MB (q4) model is ~3 F1
  points below KB; the full-precision version is on par. Only say "matches" if
  you lean on the fp32 number.
- **No npm link on purpose**: `@maskera/core` / `@maskera/ner` are not published
  to npm yet. Don't link what doesn't exist.
- **Check the GitHub repo is public and pushed** before posting, or the code
  link 404s.
- **AI Act dates** (for accuracy if anyone asks): in force since Aug 1 2024;
  prohibitions Feb 2 2025; GPAI rules Aug 2 2025; most rules + high-risk
  requirements Aug 2 2026.
