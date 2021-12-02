import { PluginSettingTab, Setting } from "obsidian";
import ReactComponentsPlugin from "./main";

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
            .setName('Components folder location')
            .setDesc('Files in this folder will be available as components/functions.')
            .addText(text => {
                text.setPlaceholder('Example: folder 1/folder 2')
                    .setValue(this.plugin.settings.template_folder)
                    .onChange(new_folder => {
                        this.plugin.settings.template_folder = new_folder;
                        this.plugin.loadComponents();
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
    }
}