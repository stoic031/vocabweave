import { Setting } from 'obsidian';
import type VocabWeavePlugin from '../main';
import { IMAGE_PRESETS } from '../providers/presets';
import type { ImageProviderConfig } from '../settings';
import { renderProviderSection } from './providerSection';

// docs/design/06-settings.md §6.2 — Image providers. Same list/active/keychain/model-list
// behavior as Text, over the fixed image provider list.
export function renderImageProviderSection(
	containerEl: HTMLElement,
	plugin: VocabWeavePlugin,
): void {
	renderProviderSection<ImageProviderConfig>(containerEl, plugin, {
		cssClass: 'vocabweave-settings__image-provider',
		activeDesc:
			'Used to generate images for your cards. None means no image generation.',
		defaultType: 'pollinations',
		extraDefaults: { negativePrompt: '', workflow: '' },
		read: (s) => ({
			list: s.imageProviders,
			activeId: s.activeImageProviderId,
		}),
		write: (s, list, activeId) => {
			s.imageProviders = list;
			s.activeImageProviderId = activeId;
		},
		kind: {
			kind: 'image',
			presets: IMAGE_PRESETS,
			sends: 'prompts',
			extraRows: (el, config, save) => {
				new Setting(el)
					.setName('Negative prompt')
					.setDesc(
						'Things to keep out of the image. Used by providers that support it, such as Automatic1111. ComfyUI workflows have their own negative prompt node.',
					)
					.addTextArea((area) => {
						// A suggestion, not a saved default — SD-style models need text kept
						// out here, since the image prompt never names it.
						area.setPlaceholder(
							'Text, letters, watermark, signature, blurry, lowres, extra fingers',
						);
						area.setValue(config.negativePrompt);
						area.inputEl.addEventListener('change', () => {
							config.negativePrompt = area.getValue().trim();
							void save();
						});
					});
			},
		},
	});
}
