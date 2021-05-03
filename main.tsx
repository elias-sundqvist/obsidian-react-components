import { App, MarkdownPostProcessorContext, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import Babel from '@babel/standalone';
import ReactPreset from '@babel/preset-react';

const DEFAULT_SETTINGS: ReactBlocksSettings = {
	template_folder: ""
};

interface ReactBlocksSettings {
	template_folder: string;
}

export default class ReactBlocksPlugin extends Plugin {
	settings: ReactBlocksSettings;
	codeBlocks: Map<string, string>
	components: { [key: string]: (any)=>JSX.Element; }

	async registerComponent(file: TFile){
		let content = await this.app.vault.read(file)
		content = `props=>{${content}}`
		let scope = {...this.components, React, ReactDOM, useState, useEffect}
		let transformedCode = Babel.transform(content, {presets: [ReactPreset]}).code
		let code = Object.keys(scope).sort().map(k=>`let ${k}=scope.${k};`).join("\n")+"\n"+transformedCode;
		if(!(this.codeBlocks.has(file.basename) && this.codeBlocks[file.basename]==code)) {
			this.codeBlocks[file.basename] = code
			this.app.workspace.trigger('react-components:component-updated')
		}
		let Component = eval(this.codeBlocks[file.basename])
		this.components[file.basename]=Component;
	}

	loadComponents() {
		if(this.settings.template_folder.trim()=="") {
			new Notice("Cannot Load react components unless directory is set")
		} else {
			try {
				let files = getTFilesFromFolder(this.app, this.settings.template_folder);
				for (let file of files) {
					this.registerComponent(file);
				}
			} catch(e){
				new Notice("React Component Folder Not Found!")
			}
		}
	}

	async attachComponent(source: string, el:HTMLElement, ctx:MarkdownPostProcessorContext) {
		let tryRender = () => {
			try {
				let scope = {...this.components, React, ReactDOM, useState, useEffect};
				let transformedCode = Babel.transform(source, {presets: [ReactPreset]}).code;
				let code = Object.keys(scope).map(k=>`let ${k}=scope.${k};`).join("\n")+"\n"+transformedCode;
				let componentLiteral = eval(code);
				ReactDOM.render(componentLiteral, el)
			} catch(e) {
				console.log(e)
				ReactDOM.render(<div style={{color: "red"}}>{e.toString()}</div>, el)
			}
		}
		tryRender()
		let evRef = this.app.workspace.on('react-components:component-updated', ()=>{if(el){tryRender()}else{this.app.workspace.offref(evRef)}})
	}

	async onload() {
		this.codeBlocks = new Map();
		this.components = {};
		await this.loadSettings();
		let registerIfCodeBlockFile = (file)=>{if(this.settings.template_folder!="" && file.parent.path.startsWith(this.settings.template_folder)){this.registerComponent(file)}}
		this.app.metadataCache.on('changed', registerIfCodeBlockFile)
		this.app.metadataCache.on('resolve', registerIfCodeBlockFile)
		this.app.workspace.on('layout-ready', ()=>this.loadComponents())
		this.registerMarkdownCodeBlockProcessor("jsx-", this.attachComponent.bind(this))
		this.registerMarkdownPostProcessor(async (el, ctx) => {
			let codeblocks = el.querySelectorAll("code");
			let toReplace = []
			for (let index = 0; index < codeblocks.length; index++) {
				let codeblock = codeblocks.item(index);

				let text = codeblock.innerText.trim();
				if (!text.startsWith("jsx-")) continue;

				let source = text.substring("jsx-".length).trim();
				toReplace.push({codeblock, source})
			}
			toReplace.forEach(({codeblock, source})=>{
				let container = document.createElement("span");
				codeblock.replaceWith(container)
				this.attachComponent(source, container, ctx)
			})
		});
		this.addSettingTab(new ReactBlocksSettingTab(this.app, this));
	}

	onunload() {
		console.log('unloading plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function getTFilesFromFolder(app: App, folder_str: string): Array<TFile> {
    folder_str = normalizePath(folder_str);

    let folder = app.vault.getAbstractFileByPath(folder_str);
    if (!folder) {
        throw new Error(`${folder_str} folder doesn't exist`);
    }
    if (!(folder instanceof TFolder)) {
        throw new Error(`${folder_str} is a file, not a folder`);
    }

    let files: Array<TFile> = [];
    Vault.recurseChildren(folder, (file: TAbstractFile) => {
        if (file instanceof TFile) {
            files.push(file);
        }
    });

    files.sort((a, b) => {
        return a.basename.localeCompare(b.basename);
    });

    return files;
}

class ReactBlocksSettingTab extends PluginSettingTab {
	plugin: ReactBlocksPlugin;

	constructor(app: App, plugin: ReactBlocksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Obsidian React Components Settings'});

		new Setting(containerEl)
			.setName("Components folder location")
			.setDesc("Files in this folder will be available as components/functions.")
			.addText(text => {
				text.setPlaceholder("Example: folder 1/folder 2")
					.setValue(this.plugin.settings.template_folder)
					.onChange((new_folder) => {
						this.plugin.settings.template_folder = new_folder;
						this.plugin.saveSettings();
					})
			});
	}
}
