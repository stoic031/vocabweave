# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.0.1] - 2026-09-28

### Changed

- Settings now use Obsidian's declarative settings API, so VocabWeave's settings show
  up in Obsidian's settings search. Connection & profiles and the AI text/image
  providers each open as their own page; an invalid media prefix is flagged inline.

## [1.0.0] - 2026-09-25

Initial release of VocabWeave.

### Added

- **Sync** the active note to Anki through AnkiConnect. Each `## Heading` fills the
  Anki field of the same name (with common aliases), for any deck and note type.
- **Two-way edit detection:** if the card was edited in Anki, the next sync asks which
  version to keep.
- **Auto sync on save** (off by default) for notes that already have a deck and model.
- **Sidebar** with profile, deck and model pickers, **Sync / Rebuild / Delete** buttons,
  and **Text** and **Image** tabs for the active note.
- **Profiles** (deck + note type + save folder), with the commands **Create new note**
  and **Create note from selection**.
- The note name follows its main field.
- **AI text generation** (optional) into an editable preview, written to the note only
  when you press **Write**. Providers: OpenAI, Gemini, Anthropic, Groq, OpenRouter,
  Together, Ollama.
- **AI image generation** (optional), stored in Anki's media folder and shown in
  Obsidian while Anki is running. Providers: OpenAI, Gemini, OpenRouter, Pollinations,
  Automatic1111, ComfyUI.
- Learning language and native language settings that AI results follow.
- API keys kept in Obsidian's secret storage. No telemetry.

[1.0.1]: https://github.com/stoic031/vocabweave/releases/tag/1.0.1
[1.0.0]: https://github.com/stoic031/vocabweave/releases/tag/1.0.0
