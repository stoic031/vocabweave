import { beforeEach, describe, expect, it, vi } from 'vitest';
import type VocabWeavePlugin from '../main';
import {
	DEFAULT_SETTINGS,
	type VocabWeaveSettings,
	type Profile,
} from '../settings';
import {
	DEFAULT_ANKI_CONNECT_URL,
	LANGUAGES,
	PROFILE_CHANGED_EVENT,
} from '../utils/constants';
import type {
	SettingDefinition,
	SettingDefinitionGroup,
	SettingDefinitionPage,
	SettingTextControl,
} from 'obsidian';

class FakeTextComponent {
	placeholder = '';
	value = '';
	private changeCb: ((v: string) => unknown) | null = null;
	private domChangeCb: (() => unknown) | null = null;
	inputEl = {
		addEventListener: (_event: string, cb: () => unknown) => {
			this.domChangeCb = cb;
		},
	};

	getValue() {
		return this.value;
	}
	// The real DOM 'change' event (blur/enter) — used by the profile name field.
	fireDomChange(v: string) {
		this.value = v;
		this.domChangeCb?.();
	}
	setPlaceholder(p: string) {
		this.placeholder = p;
		return this;
	}
	setValue(v: string) {
		this.value = v;
		return this;
	}
	onChange(cb: (v: string) => unknown) {
		this.changeCb = cb;
		return this;
	}
	async triggerChange(v: string) {
		this.value = v;
		await this.changeCb?.(v);
	}
}

class FakeButtonComponent {
	text = '';
	disabled = false;
	private clickCb: (() => unknown) | null = null;

	setButtonText(t: string) {
		this.text = t;
		return this;
	}
	setDisabled(d: boolean) {
		this.disabled = d;
		return this;
	}
	setDestructive() {
		return this;
	}
	onClick(cb: () => unknown) {
		this.clickCb = cb;
		return this;
	}
	async triggerClick() {
		await this.clickCb?.();
	}
}

class FakeDropdownComponent {
	options: Record<string, string> = {};
	optionOrder: string[] = [];
	value = '';
	selectEl: { empty: () => void };
	private changeCb: ((v: string) => unknown) | null = null;

	constructor() {
		this.selectEl = {
			empty: () => {
				this.options = {};
				this.optionOrder = [];
			},
		};
	}
	addOption(value: string, display: string) {
		this.options[value] = display;
		this.optionOrder.push(value);
		return this;
	}
	setValue(v: string) {
		this.value = v;
		return this;
	}
	onChange(cb: (v: string) => unknown) {
		this.changeCb = cb;
		return this;
	}
	async triggerChange(v: string) {
		this.value = v;
		await this.changeCb?.(v);
	}
}

class FakeSetting {
	name = '';
	desc = '';
	textComponents: FakeTextComponent[] = [];
	buttonComponents: FakeButtonComponent[] = [];
	dropdownComponents: FakeDropdownComponent[] = [];

	constructor(public containerEl: unknown) {}
	setName(n: string) {
		this.name = n;
		return this;
	}
	setDesc(d: string) {
		this.desc = d;
		return this;
	}
	addText(cb: (t: FakeTextComponent) => unknown) {
		const text = new FakeTextComponent();
		cb(text);
		this.textComponents.push(text);
		return this;
	}
	addButton(cb: (b: FakeButtonComponent) => unknown) {
		const button = new FakeButtonComponent();
		cb(button);
		this.buttonComponents.push(button);
		return this;
	}
	addDropdown(cb: (d: FakeDropdownComponent) => unknown) {
		const dropdown = new FakeDropdownComponent();
		cb(dropdown);
		this.dropdownComponents.push(dropdown);
		return this;
	}
}

interface FakeEl {
	createDiv(opts?: { cls?: string }): FakeEl;
	empty(): void;
}

function fakeDiv(): FakeEl {
	return {
		createDiv() {
			return fakeDiv();
		},
		empty() {},
	};
}

const { Notice, settings } = vi.hoisted(() => ({
	Notice: vi.fn(),
	settings: [] as FakeSetting[],
}));
vi.mock('obsidian', () => ({
	Notice,
	Setting: class {
		constructor(containerEl: unknown) {
			const s = new FakeSetting(containerEl);
			settings.push(s);
			return s;
		}
	},
	PluginSettingTab: class {},
	SettingPage: class {
		title = '';
		containerEl = fakeDiv();
		hide() {}
	},
}));

const { deckNames, modelNames } = vi.hoisted(() => ({
	deckNames: vi.fn(),
	modelNames: vi.fn(),
}));
vi.mock('../sync/ankiConnect', () => ({
	AnkiConnectClient: class {
		deckNames = deckNames;
		modelNames = modelNames;
	},
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));
vi.mock('./toast', () => ({ toastSuccess, toastError }));

import {
	SectionPage,
	VocabWeaveSettingTab,
	renderConnectionSection,
} from './settingsTab';

// Returns the spy as a plain local (not read back off `plugin`) so assertions like
// `expect(saveSettings).toHaveBeenCalled()` don't trip @typescript-eslint/unbound-method.
interface FakeFolder {
	path: string;
	name: string;
	parent: FakeFolder | null;
	isRoot: () => boolean;
}

// Matches real Obsidian: vault.getRoot().path is "/", not "", and every top-level
// folder's .parent is that root object, never null.
const fakeRoot: FakeFolder = {
	path: '/',
	name: '',
	parent: null,
	isRoot: () => true,
};

// parent defaults to the vault root object. Pass an explicit parent to build nested
// fixtures.
function fakeFolder(path: string, parent: FakeFolder = fakeRoot): FakeFolder {
	return {
		path,
		name: path.split('/').pop() ?? path,
		parent,
		isRoot: () => false,
	};
}

const profileA: Profile = {
	id: 'a',
	name: 'Japanese',
	deck: '',
	model: '',
	folder: '',
	mainField: '',
	targetLanguage: '',
};
const profileB: Profile = {
	id: 'b',
	name: 'Spanish',
	deck: '',
	model: '',
	folder: '',
	mainField: '',
	targetLanguage: '',
};

// The plugin's settings carry the given profiles (default: just profile A, active).
// setActiveProfile mirrors the real one: set id, save, then notify listeners.
function fakePlugin(
	overrides: Partial<VocabWeaveSettings> = {},
	folders: FakeFolder[] = [],
) {
	const saveSettings = vi.fn().mockResolvedValue(undefined);
	const handlers = new Set<() => void>();
	const settings: VocabWeaveSettings = {
		...DEFAULT_SETTINGS,
		ankiConnectUrl: '',
		profiles: [{ ...profileA }],
		activeProfileId: 'a',
		...overrides,
	};
	const allFolders: FakeFolder[] = [fakeRoot, ...folders];
	const setActiveProfile = vi.fn(async (id: string) => {
		settings.activeProfileId = id;
		await saveSettings();
		for (const h of handlers) h();
	});
	const plugin = {
		settings,
		saveSettings,
		setActiveProfile,
		app: {
			vault: { getAllFolders: () => allFolders },
			workspace: {
				on: (name: string, cb: () => void) => {
					if (name !== PROFILE_CHANGED_EVENT) throw new Error(name);
					handlers.add(cb);
					return cb;
				},
				offref: (cb: () => void) => handlers.delete(cb),
			},
		},
	} as unknown as VocabWeavePlugin;
	return { plugin, saveSettings, setActiveProfile, handlers };
}

// Settings are re-created on every render, so tests look at the most recent one.
function latest(name: string): FakeSetting {
	const matches = settings.filter((s) => s.name === name);
	const found = matches[matches.length - 1];
	if (!found) throw new Error(`no "${name}" setting rendered`);
	return found;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function render(plugin: VocabWeavePlugin) {
	return renderConnectionSection(fakeDiv() as unknown as HTMLElement, plugin);
}

beforeEach(() => {
	Notice.mockClear();
	settings.length = 0;
	deckNames.mockReset();
	modelNames.mockReset();
	toastSuccess.mockClear();
	toastError.mockClear();
});

describe('renderConnectionSection — URL field', () => {
	it('renders the URL field with the placeholder and the current saved value', () => {
		const { plugin } = fakePlugin({
			ankiConnectUrl: 'http://localhost:9999',
		});

		render(plugin);

		const text = settings[0]?.textComponents[0];
		expect(text?.placeholder).toBe(DEFAULT_ANKI_CONNECT_URL);
		expect(text?.value).toBe('http://localhost:9999');
	});

	it('saves a valid URL and calls plugin.saveSettings', async () => {
		const { plugin, saveSettings } = fakePlugin({ ankiConnectUrl: '' });

		render(plugin);
		await settings[0]?.textComponents[0]?.triggerChange(
			'http://localhost:1234',
		);

		expect(plugin.settings.ankiConnectUrl).toBe('http://localhost:1234');
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it('saves a blank value as-is (resolves to the default elsewhere)', async () => {
		const { plugin, saveSettings } = fakePlugin({
			ankiConnectUrl: 'http://localhost:1234',
		});

		render(plugin);
		await settings[0]?.textComponents[0]?.triggerChange('   ');

		expect(plugin.settings.ankiConnectUrl).toBe('');
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it('shows a Notice and does not save an invalid, non-blank URL', async () => {
		const { plugin, saveSettings } = fakePlugin({
			ankiConnectUrl: 'http://localhost:1234',
		});

		render(plugin);
		await settings[0]?.textComponents[0]?.triggerChange('not a url');

		expect(Notice).toHaveBeenCalledWith(
			'❌ Invalid URL. Please check the AnkiConnect URL.',
		);
		expect(plugin.settings.ankiConnectUrl).toBe('http://localhost:1234');
		expect(saveSettings).not.toHaveBeenCalled();
	});
});

describe('renderConnectionSection — Connect button', () => {
	function renderAndConnect(overrides: Partial<VocabWeaveSettings> = {}) {
		const { plugin, saveSettings } = fakePlugin({
			ankiConnectUrl: 'http://localhost:8765',
			...overrides,
		});
		render(plugin);
		const button = settings[0]?.buttonComponents[0];
		if (!button) throw new Error('expected the Connect button');
		return { plugin, saveSettings, button };
	}

	const hasSetting = (name: string) => settings.some((s) => s.name === name);

	it('always shows the Deck/Model pickers, listing only the saved value before Anki’s names load', () => {
		renderAndConnect({
			profiles: [{ ...profileA, deck: 'Japanese', model: 'Cloze' }],
		});

		expect(latest('Deck').dropdownComponents[0]?.optionOrder).toEqual([
			'',
			'Japanese',
		]);
		expect(latest('Deck').dropdownComponents[0]?.value).toBe('Japanese');
		expect(latest('Model').dropdownComponents[0]?.value).toBe('Cloze');
	});

	it('loads Anki’s names on open without pressing Connect, and without a toast', async () => {
		deckNames.mockResolvedValue(['Default', 'Japanese']);
		modelNames.mockResolvedValue(['Basic']);
		renderAndConnect({ profiles: [{ ...profileA, deck: 'Japanese' }] });
		await flush();

		expect(latest('Deck').dropdownComponents[0]?.optionOrder).toEqual([
			'',
			'Default',
			'Japanese',
		]);
		expect(latest('Deck').dropdownComponents[0]?.value).toBe('Japanese');
		expect(latest('Model').dropdownComponents[0]?.optionOrder).toEqual([
			'',
			'Basic',
		]);
		expect(toastSuccess).not.toHaveBeenCalled();
		expect(toastError).not.toHaveBeenCalled();
	});

	it('keeps the pickers and stays silent when Anki is offline on open', async () => {
		deckNames.mockRejectedValue(new Error('offline'));
		modelNames.mockRejectedValue(new Error('offline'));
		renderAndConnect({ profiles: [{ ...profileA, deck: 'Japanese' }] });
		await flush();

		expect(latest('Deck').dropdownComponents[0]?.value).toBe('Japanese');
		expect(toastError).not.toHaveBeenCalled();
	});

	it('ignores names that arrive after the tab was closed', async () => {
		let resolveDecks!: (v: string[]) => void;
		deckNames.mockReturnValue(
			new Promise<string[]>((resolve) => {
				resolveDecks = resolve;
			}),
		);
		modelNames.mockResolvedValue(['Basic']);
		const { plugin } = fakePlugin({
			ankiConnectUrl: 'http://localhost:8765',
		});
		const section = render(plugin);
		const before = settings.length;

		section.dispose();
		resolveDecks(['Late deck']);
		await flush();

		expect(settings).toHaveLength(before);
	});

	it('on success: shows Deck/Model pickers listing Anki’s names, plus the success toast', async () => {
		deckNames.mockResolvedValue(['Default', 'Japanese']);
		modelNames.mockResolvedValue(['Basic', 'Cloze']);
		const { button } = renderAndConnect();

		await button.triggerClick();

		expect(latest('Deck').dropdownComponents[0]?.optionOrder).toEqual([
			'',
			'Default',
			'Japanese',
		]);
		expect(latest('Model').dropdownComponents[0]?.optionOrder).toEqual([
			'',
			'Basic',
			'Cloze',
		]);
		expect(toastSuccess).toHaveBeenCalledWith('✅ Connected to Anki!');
		expect(button.text).toBe('🔗 Connect');
		expect(button.disabled).toBe(false);
	});

	it('on failure: keeps the pickers and shows the failure toast', async () => {
		deckNames.mockRejectedValue(new Error('offline'));
		modelNames.mockResolvedValue(['Basic']);
		const { button } = renderAndConnect();

		await button.triggerClick();

		expect(hasSetting('Deck')).toBe(true);
		expect(toastError).toHaveBeenCalledWith(
			'❌ Cannot connect to Anki. Please check URL and AnkiConnect.',
		);
		expect(button.text).toBe('🔗 Connect');
		expect(button.disabled).toBe(false);
	});

	it('pre-selects the active profile’s deck/model if still present', async () => {
		deckNames.mockResolvedValue(['Default', 'Japanese']);
		modelNames.mockResolvedValue(['Basic', 'Cloze']);
		const { button } = renderAndConnect({
			profiles: [{ ...profileA, deck: 'Japanese', model: 'Cloze' }],
		});

		await button.triggerClick();

		expect(latest('Deck').dropdownComponents[0]?.value).toBe('Japanese');
		expect(latest('Model').dropdownComponents[0]?.value).toBe('Cloze');
	});

	it('still shows a saved deck that is no longer in the fetched list', async () => {
		deckNames.mockResolvedValue(['Default']);
		modelNames.mockResolvedValue(['Basic']);
		const { button } = renderAndConnect({
			profiles: [{ ...profileA, deck: 'Deleted deck' }],
		});

		await button.triggerClick();

		expect(latest('Deck').dropdownComponents[0]?.value).toBe(
			'Deleted deck',
		);
		expect(
			latest('Deck').dropdownComponents[0]?.options['Deleted deck'],
		).toBe('Deleted deck');
	});

	it('persists a picked deck into the active profile', async () => {
		deckNames.mockResolvedValue(['Default', 'Japanese']);
		modelNames.mockResolvedValue(['Basic']);
		const { plugin, saveSettings, button } = renderAndConnect();
		await button.triggerClick();

		await latest('Deck').dropdownComponents[0]?.triggerChange('Japanese');

		expect(plugin.settings.profiles[0]?.deck).toBe('Japanese');
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it('persists a picked model into the active profile', async () => {
		deckNames.mockResolvedValue(['Default']);
		modelNames.mockResolvedValue(['Basic', 'Cloze']);
		const { plugin, saveSettings, button } = renderAndConnect();
		await button.triggerClick();

		await latest('Model').dropdownComponents[0]?.triggerChange('Cloze');

		expect(plugin.settings.profiles[0]?.model).toBe('Cloze');
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});
});

describe('renderConnectionSection — profiles', () => {
	const twoProfiles = () => ({
		profiles: [{ ...profileA }, { ...profileB }],
	});

	it('lists every profile and selects the active one', () => {
		const { plugin } = fakePlugin({
			...twoProfiles(),
			activeProfileId: 'b',
		});

		render(plugin);

		const dropdown = latest('Profile').dropdownComponents[0];
		expect(dropdown?.options).toEqual({ a: 'Japanese', b: 'Spanish' });
		expect(dropdown?.value).toBe('b');
		expect(latest('Profile name').textComponents[0]?.value).toBe('Spanish');
	});

	it('picking a profile calls plugin.setActiveProfile', async () => {
		const { plugin, setActiveProfile } = fakePlugin(twoProfiles());
		render(plugin);

		await latest('Profile').dropdownComponents[0]?.triggerChange('b');

		expect(setActiveProfile).toHaveBeenCalledWith('b');
	});

	it('Add creates an empty profile with a unique name and makes it active', async () => {
		const { plugin } = fakePlugin({
			profiles: [{ ...profileA, name: 'New profile' }],
		});
		render(plugin);

		await latest('Profile').buttonComponents[0]?.triggerClick();
		await flush();

		expect(plugin.settings.profiles).toHaveLength(2);
		const added = plugin.settings.profiles[1];
		expect(added).toMatchObject({
			name: 'New profile 2',
			deck: '',
			model: '',
			folder: '',
		});
		expect(plugin.settings.activeProfileId).toBe(added?.id);
	});

	it('Delete is disabled while only one profile exists', () => {
		const { plugin } = fakePlugin();

		render(plugin);

		expect(latest('Profile').buttonComponents[1]?.disabled).toBe(true);
	});

	it('Delete removes the active profile and activates the first remaining one', async () => {
		const { plugin } = fakePlugin({
			...twoProfiles(),
			activeProfileId: 'b',
		});
		render(plugin);

		await latest('Profile').buttonComponents[1]?.triggerClick();
		await flush();

		expect(plugin.settings.profiles.map((p) => p.id)).toEqual(['a']);
		expect(plugin.settings.activeProfileId).toBe('a');
	});

	it('renames the active profile', async () => {
		const { plugin, setActiveProfile } = fakePlugin();
		render(plugin);

		latest('Profile name').textComponents[0]?.fireDomChange('  Kanji ');
		await flush();

		expect(plugin.settings.profiles[0]?.name).toBe('Kanji');
		expect(setActiveProfile).toHaveBeenCalledWith('a');
	});

	it('rejects an empty name and restores the old one', () => {
		const { plugin, setActiveProfile } = fakePlugin();
		render(plugin);
		const text = latest('Profile name').textComponents[0];

		text?.fireDomChange('   ');

		expect(Notice).toHaveBeenCalledWith('❌ Profile name cannot be empty.');
		expect(plugin.settings.profiles[0]?.name).toBe('Japanese');
		expect(text?.value).toBe('Japanese');
		expect(setActiveProfile).not.toHaveBeenCalled();
	});

	it('rejects a name another profile already uses', () => {
		const { plugin } = fakePlugin(twoProfiles());
		render(plugin);

		latest('Profile name').textComponents[0]?.fireDomChange('Spanish');

		expect(Notice).toHaveBeenCalledWith(
			'❌ A profile with that name already exists. Please choose another.',
		);
		expect(plugin.settings.profiles[0]?.name).toBe('Japanese');
	});

	it('re-renders when the active profile changes elsewhere (e.g. the sidebar)', async () => {
		const { plugin } = fakePlugin(twoProfiles());
		render(plugin);

		await plugin.setActiveProfile('b');

		expect(latest('Profile').dropdownComponents[0]?.value).toBe('b');
		expect(latest('Profile name').textComponents[0]?.value).toBe('Spanish');
	});

	it('stops listening after dispose()', () => {
		const { plugin, handlers } = fakePlugin();
		const section = render(plugin);
		expect(handlers.size).toBe(1);

		section.dispose();

		expect(handlers.size).toBe(0);
	});
});

describe('renderConnectionSection — Save notes to folder', () => {
	it('renders immediately with the vault root option, no Connect needed', () => {
		const { plugin } = fakePlugin({}, [
			fakeFolder('Vocab'),
			fakeFolder('Anki Notes'),
		]);

		render(plugin);

		expect(latest('Save notes to').dropdownComponents[0]?.options).toEqual({
			'': '/ (vault root)',
			'Anki Notes': 'Anki Notes',
			Vocab: 'Vocab',
		});
	});

	it('pre-selects the active profile’s folder if it still exists', () => {
		const { plugin } = fakePlugin(
			{ profiles: [{ ...profileA, folder: 'Vocab' }] },
			[fakeFolder('Vocab')],
		);

		render(plugin);

		expect(latest('Save notes to').dropdownComponents[0]?.value).toBe(
			'Vocab',
		);
	});

	it('leaves the saved folder unselected if it no longer exists', () => {
		const { plugin } = fakePlugin(
			{ profiles: [{ ...profileA, folder: 'Deleted' }] },
			[fakeFolder('Vocab')],
		);

		render(plugin);

		expect(latest('Save notes to').dropdownComponents[0]?.value).toBe('');
	});

	it('persists the picked folder into the active profile', async () => {
		const { plugin, saveSettings } = fakePlugin({}, [fakeFolder('Vocab')]);

		render(plugin);
		await latest('Save notes to').dropdownComponents[0]?.triggerChange(
			'Vocab',
		);

		expect(plugin.settings.profiles[0]?.folder).toBe('Vocab');
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it('indents nested folders by depth and shows only each folder’s own name', () => {
		const INDENT = '\u00a0\u00a0'; // NBSP x2, matches folderTree.ts
		const japanese = fakeFolder('Japanese');
		const n2 = fakeFolder('Japanese/N2', japanese);
		const vocab = fakeFolder('Japanese/N2/Vocab', n2);
		const { plugin } = fakePlugin({}, [japanese, n2, vocab]);

		render(plugin);

		expect(latest('Save notes to').dropdownComponents[0]?.options).toEqual({
			'': '/ (vault root)',
			Japanese: 'Japanese',
			'Japanese/N2': `${INDENT}N2`,
			'Japanese/N2/Vocab': `${INDENT}${INDENT}Vocab`,
		});
	});

	it('does not let a sibling folder wedge between a parent and its own child (path-string sort bug)', () => {
		// "Japanese Advanced" (space, 0x20) sorts before "Japanese/N2" (slash, 0x2F)
		// under plain path-string comparison, even though Japanese/N2 is a child of the
		// unrelated "Japanese" folder. buildFolderTreeEntries() must keep children with
		// their parent.
		const japanese = fakeFolder('Japanese');
		const japaneseAdvanced = fakeFolder('Japanese Advanced');
		const n2 = fakeFolder('Japanese/N2', japanese);
		const { plugin } = fakePlugin({}, [japaneseAdvanced, japanese, n2]);

		render(plugin);

		expect(
			latest('Save notes to').dropdownComponents[0]?.optionOrder,
		).toEqual(['', 'Japanese', 'Japanese/N2', 'Japanese Advanced']);
	});
});

describe('VocabWeaveSettingTab.getSettingDefinitions', () => {
	function definitions(plugin = fakePlugin().plugin) {
		return new VocabWeaveSettingTab(
			{} as never,
			plugin,
		).getSettingDefinitions() as SettingDefinitionGroup[];
	}
	function item(name: string, plugin?: VocabWeavePlugin) {
		const found = definitions(plugin)
			.flatMap((g) => g.items ?? [])
			.find((i) => i.name === name);
		if (!found) throw new Error(`no "${name}" item`);
		return found;
	}

	it('groups the settings into Anki, AI, and Sync & media', () => {
		expect(
			definitions().map((g) => [
				g.type,
				g.heading,
				(g.items ?? []).map((i) => i.name),
			]),
		).toEqual([
			['group', 'Anki', ['Connection & profiles']],
			[
				'group',
				'AI',
				['Your language', 'AI text provider', 'AI image provider'],
			],
			['group', 'Sync & media', ['Auto sync on save', 'Media prefix']],
		]);
	});

	it('binds the simple settings to their keys in plugin.settings', () => {
		const controls = [
			'Your language',
			'Auto sync on save',
			'Media prefix',
		].map(
			(name) =>
				(
					item(name) as SettingDefinition & {
						control: { type: string; key: string };
					}
				).control,
		);
		expect(controls.map((c) => [c.type, c.key])).toEqual([
			['dropdown', 'nativeLanguage'],
			['toggle', 'autoSyncOnSave'],
			['text', 'mediaPrefix'],
		]);
	});

	it('offers every language, plus an unset choice', () => {
		const { control } = item('Your language') as SettingDefinition & {
			control: { options: Record<string, string> };
		};
		expect(Object.keys(control.options)).toEqual(['', ...LANGUAGES]);
	});

	it('rejects an empty media prefix or one with path characters', async () => {
		const { control } = item('Media prefix') as SettingDefinition & {
			control: SettingTextControl;
		};
		const validate = control.validate!;
		expect(await validate('_obsidian_')).toBeUndefined();
		expect(await validate('')).toBeTruthy();
		expect(await validate('a/b')).toBeTruthy();
	});

	it('opens the provider pages with matching titles', () => {
		for (const name of ['AI text provider', 'AI image provider']) {
			const page = (item(name) as SettingDefinitionPage).page!();
			expect(page).toBeInstanceOf(SectionPage);
			expect(page.title).toBe(name);
		}
	});

	it('renders the connection page and stops listening for profile changes on hide', () => {
		const { plugin, handlers } = fakePlugin();
		deckNames.mockResolvedValue([]);
		modelNames.mockResolvedValue([]);
		const page = (
			item('Connection & profiles', plugin) as SettingDefinitionPage
		).page!();

		page.display();
		expect(latest('AnkiConnect URL')).toBeDefined();
		expect(handlers.size).toBe(1);

		page.hide();
		expect(handlers.size).toBe(0);
	});
});
