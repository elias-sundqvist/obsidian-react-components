import { PluginSettingTab, Setting } from 'obsidian';
import { loadComponents } from './core';
import { patchSanitization, unpatchSanitization } from './htmlRendering';
import ReactComponentsPlugin from './main';

export const DEFAULT_SETTINGS: ReactComponentsSettings = {
    template_folder: '',
    auto_refresh: true,
    live_preview: true,
    patch_html_rendering: true,
    all_files_define_components: false
};

export interface ReactComponentsSettings {
    template_folder: string;
    patch_html_rendering: boolean;
    live_preview: boolean;
    auto_refresh: boolean;
    all_files_define_components: boolean;
}

export class ReactComponentsSettingTab extends PluginSettingTab {
    plugin: ReactComponentsPlugin;

    constructor(plugin: ReactComponentsPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'React Components Settings' });

        new Setting(containerEl)
            .setName('Live Preview Support')
            .setDesc('Experimental. Change requires restart to take effect.')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.live_preview).onChange(live_preview => {
                    this.plugin.settings.live_preview = live_preview;
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Replace HTML Rendering')
            .setDesc('Render inline html as jsx.')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.patch_html_rendering).onChange(patch_html_rendering => {
                    this.plugin.settings.patch_html_rendering = patch_html_rendering;
                    if (patch_html_rendering) {
                        patchSanitization();
                    } else {
                        unpatchSanitization();
                    }
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Components folder location')
            .setDesc('Files in this folder will be available as components/functions.')
            .addText(text => {
                text.setPlaceholder('Example: folder 1/folder 2')
                    .setValue(this.plugin.settings.template_folder)
                    .onChange(new_folder => {
                        this.plugin.settings.template_folder = new_folder;
                        loadComponents();
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Require ')
            .setDesc(
                'Useful to disable if reloading components is costly (like if they perform api calls or read a lot of files). To refresh the components manually, run the `Refresh React Components` command'
            )
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.auto_refresh).onChange(auto_refresh => {
                    this.plugin.settings.auto_refresh = auto_refresh;
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Automatically Refresh Components')
            .setDesc(
                'Useful to disable if reloading components is costly (like if they perform api calls or read a lot of files). To refresh the components manually, run the `Refresh React Components` command'
            )
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.auto_refresh).onChange(auto_refresh => {
                    this.plugin.settings.auto_refresh = auto_refresh;
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('All Files Define Components')
            .setDesc(
                'If true, the plugin checks for component definitions in all files in the vault. May decrease performance.'
            )
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.all_files_define_components)
                    .onChange(all_files_define_components => {
                        this.plugin.settings.all_files_define_components = all_files_define_components;
                        this.plugin.saveSettings();
                    });
            });
    }
}
