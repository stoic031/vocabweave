import { Setting } from 'obsidian';
import type VocabWeavePlugin from '../main';
import type { VocabWeaveSettings } from '../settings';
import {
	renderEditor,
	type AnyProviderConfig,
	type ProviderKindSpec,
} from './providerEditor';

export interface ProviderSectionSpec<C extends AnyProviderConfig> {
	cssClass: string;
	activeDesc: string;
	kind: ProviderKindSpec<C>;
	defaultType: C['type'];
	// Where this kind's list and active id live in the settings object.
	read: (s: VocabWeaveSettings) => { list: C[]; activeId: string };
	write: (s: VocabWeaveSettings, list: C[], activeId: string) => void;
	// The fields every new config starts with, beyond the shared ones.
	extraDefaults?: Omit<C, keyof AnyProviderConfig | 'type'>;
}

// docs/design/06-settings.md §6.2 — global list of provider configs + the active one. The
// active dropdown is also the config being edited below it. Shared by Text and Image.
export function renderProviderSection<C extends AnyProviderConfig>(
	containerEl: HTMLElement,
	plugin: VocabWeavePlugin,
	spec: ProviderSectionSpec<C>,
): void {
	const el = containerEl.createDiv({ cls: spec.cssClass });
	const { settings } = plugin;
	const save = () => plugin.saveSettings();

	const render = () => {
		el.empty();
		const { list, activeId } = spec.read(settings);
		const active = list.find((p) => p.id === activeId);

		new Setting(el)
			.setName('Active provider')
			.setDesc(spec.activeDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'None');
				for (const p of list) dropdown.addOption(p.id, p.name);
				dropdown.setValue(active?.id ?? '').onChange(async (value) => {
					spec.write(settings, spec.read(settings).list, value);
					await save();
					render();
				});
			})
			.addButton((button) =>
				button.setButtonText('Add').onClick(async () => {
					const config = {
						id: crypto.randomUUID(),
						name: uniqueName(list, 'New provider'),
						type: spec.defaultType,
						baseUrl: spec.kind.presets[spec.defaultType]
							?.editableUrl
							? spec.kind.presets[spec.defaultType]?.baseUrl
							: '',
						apiKeySource: 'manual',
						apiKey: '',
						apiKeySecretId: '',
						model: '',
						...spec.extraDefaults,
					} as unknown as C;
					spec.write(settings, [...list, config], config.id);
					await save();
					render();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText('Delete')
					.setDestructive()
					.setDisabled(!active)
					.onClick(async () => {
						const { list: current, activeId: id } =
							spec.read(settings);
						spec.write(
							settings,
							current.filter((p) => p.id !== id),
							'',
						);
						await save();
						render();
					}),
			);

		if (active) renderEditor(el, plugin, spec.kind, active, save, render);
	};

	render();
}

function uniqueName(list: AnyProviderConfig[], base: string): string {
	let name = base;
	for (let n = 2; list.some((p) => p.name === name); n++)
		name = `${base} ${n}`;
	return name;
}
