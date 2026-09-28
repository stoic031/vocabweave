import type { App, ButtonComponent, SettingDefinitionItem } from 'obsidian';
import { Notice, PluginSettingTab, Setting, SettingPage } from 'obsidian';
import type VocabWeavePlugin from '../main';
import {
	DEFAULT_ANKI_CONNECT_URL,
	DEFAULT_MEDIA_PREFIX,
	LANGUAGES,
} from '../utils/constants';
import { isValidMediaPrefix, isValidUrl } from '../utils/validation';
import { resolveAnkiConnectUrl } from '../settings';
import { AnkiConnectClient } from '../sync/ankiConnect';
import { renderProfilesSection, type ProfilesSection } from './profilesSection';
import { renderImageProviderSection } from './imageProviderSection';
import { renderTextProviderSection } from './textProviderSection';
import { toastError, toastSuccess } from './toast';

// A declarative page whose body is one of our imperative section renderers. `render`
// may return a cleanup, run when the user leaves the page.
export class SectionPage extends SettingPage {
	private cleanup?: () => void;

	constructor(
		title: string,
		private renderBody: (el: HTMLElement) => (() => void) | void,
	) {
		super();
		this.title = title;
	}

	display(): void {
		this.containerEl.empty();
		this.cleanup = this.renderBody(this.containerEl) ?? undefined;
	}

	hide(): void {
		this.cleanup?.();
		this.cleanup = undefined;
		super.hide();
	}
}

// docs/design/06-settings.md — simple settings are declarative controls (they show up
// in Obsidian's settings search); profiles and providers keep their imperative UIs,
// mounted as pages.
export class VocabWeaveSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: VocabWeavePlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const plugin = this.plugin;
		return [
			{
				type: 'group',
				heading: 'Anki',
				items: [
					{
						type: 'page',
						name: 'Connection & profiles',
						desc: 'AnkiConnect URL, and profiles: deck, note type and save folder.',
						page: () =>
							new SectionPage('Connection & profiles', (el) => {
								const profiles = renderConnectionSection(
									el,
									plugin,
								);
								return () => profiles.dispose();
							}),
					},
				],
			},
			{
				type: 'group',
				heading: 'AI',
				items: [
					{
						name: 'Your language',
						desc: 'Used as AI generation context, alongside each profile’s learning language.',
						control: {
							type: 'dropdown',
							key: 'nativeLanguage',
							options: {
								'': 'Select your language…',
								...Object.fromEntries(
									LANGUAGES.map((l) => [l, l]),
								),
							},
						},
					},
					{
						type: 'page',
						name: 'AI text provider',
						desc: 'OpenAI, Anthropic, Gemini, Groq, OpenRouter, Together or Ollama. Fills fields and writes image prompts.',
						page: () =>
							new SectionPage('AI text provider', (el) =>
								renderTextProviderSection(el, plugin),
							),
					},
					{
						type: 'page',
						name: 'AI image provider',
						desc: 'Pollinations, OpenAI, Gemini, OpenRouter, Automatic1111 or ComfyUI. Draws images for your cards.',
						page: () =>
							new SectionPage('AI image provider', (el) =>
								renderImageProviderSection(el, plugin),
							),
					},
				],
			},
			{
				type: 'group',
				heading: 'Sync & media',
				items: [
					{
						name: 'Auto sync on save',
						desc: 'Sync the active note to Anki automatically whenever you save it.',
						control: { type: 'toggle', key: 'autoSyncOnSave' },
					},
					{
						name: 'Media prefix',
						desc: "Prepended to generated media filenames so Anki doesn't delete them when checking media.",
						control: {
							type: 'text',
							key: 'mediaPrefix',
							placeholder: DEFAULT_MEDIA_PREFIX,
							validate: (value) =>
								isValidMediaPrefix(value)
									? undefined
									: 'It cannot be empty or contain special or path characters.',
						},
					},
				],
			},
		];
	}
}

// docs/design/06-settings.md §6.1
export function renderConnectionSection(
	containerEl: HTMLElement,
	plugin: VocabWeavePlugin,
): ProfilesSection {
	let connectButton!: ButtonComponent;

	new Setting(containerEl)
		.setName('AnkiConnect URL')
		.setDesc(`Leave blank to use ${DEFAULT_ANKI_CONNECT_URL}.`)
		.addText((text) =>
			text
				.setPlaceholder(DEFAULT_ANKI_CONNECT_URL)
				.setValue(plugin.settings.ankiConnectUrl)
				.onChange(async (value) => {
					const trimmed = value.trim();
					if (trimmed !== '' && !isValidUrl(trimmed)) {
						new Notice(
							'❌ Invalid URL. Please check the AnkiConnect URL.',
						);
						return;
					}
					plugin.settings.ankiConnectUrl = trimmed;
					await plugin.saveSettings();
				}),
		)
		.addButton((button) => {
			connectButton = button;
			button
				.setButtonText('🔗 Connect')
				.onClick(
					() => void handleConnect(plugin, profiles, connectButton),
				);
		});

	const profiles = renderProfilesSection(containerEl, plugin);
	// Load Anki's deck/model names on open so the pickers are full without pressing
	// Connect. Silent on failure — Connect is what reports connection problems.
	void loadAnkiNames(plugin, profiles);
	return profiles;
}

async function loadAnkiNames(
	plugin: VocabWeavePlugin,
	profiles: ProfilesSection,
): Promise<void> {
	try {
		const client = new AnkiConnectClient(
			resolveAnkiConnectUrl(plugin.settings),
		);
		const [deckNames, modelNames] = await Promise.all([
			client.deckNames(),
			client.modelNames(),
		]);
		profiles.setAnkiNames(deckNames, modelNames);
	} catch {
		// Anki offline: pickers keep showing the saved values.
	}
}

async function handleConnect(
	plugin: VocabWeavePlugin,
	profiles: ProfilesSection,
	button: ButtonComponent,
): Promise<void> {
	button.setDisabled(true);
	button.setButtonText('⏳ Connecting...');

	try {
		const client = new AnkiConnectClient(
			resolveAnkiConnectUrl(plugin.settings),
		);
		const [deckNames, modelNames] = await Promise.all([
			client.deckNames(),
			client.modelNames(),
		]);

		profiles.setAnkiNames(deckNames, modelNames);
		toastSuccess('✅ Connected to Anki!');
	} catch {
		toastError(
			'❌ Cannot connect to Anki. Please check URL and AnkiConnect.',
		);
	} finally {
		button.setButtonText('🔗 Connect');
		button.setDisabled(false);
	}
}
