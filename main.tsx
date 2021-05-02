import { App, Modal, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
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

	async registerCodeBlock(file: TFile){
		let content = await this.app.vault.read(file)
		content = `props=>{${content}}`
		let R = React, RD = ReactDOM, US=useState, UE=useEffect;
		let transformedCode = Babel.transform(content, {presets: [ReactPreset]}).code
		if(!(this.codeBlocks.has(file.basename) && this.codeBlocks[file.basename]==transformedCode)) {
			this.codeBlocks[file.basename] = transformedCode
			this.app.workspace.trigger('react-blocks:block-updated')
		}
		((React, ReactDOM, useState, useEffect, components)=>{
		let Component = props=>{
			const [clCode, setClCode] = useState(this.codeBlocks[file.basename])
			const Cl = eval(clCode)
			return <Cl {...props}/>
		}
		this.components[file.basename]=Component;
		this.registerMarkdownCodeBlockProcessor(file.basename, (source, el, ctx)=>{
			let tryRender = () => {
				try {
					let Component = this.components[file.basename];
					ReactDOM.render(<Component source={source} el={el} ctx={ctx}/>, el)
				} catch(e) {
					ReactDOM.render(<div style={{color: "red"}}>{e.toString()}</div>, el)
				}
			}
			tryRender()
			let evRef = this.app.workspace.on('react-blocks:block-updated', ()=>{if(el){tryRender()}else{this.app.workspace.offref(evRef)}})
		})})(R, RD, US, UE, this.components)
	}

	loadCodeBlocks() {
		if(this.settings.template_folder.trim()=="") {
			new Notice("Cannot Load react components unless directory is set")
		} else {
			try {
				let files = getTFilesFromFolder(this.app, this.settings.template_folder);
				for (let file of files) {
					this.registerCodeBlock(file);
				}
			} catch(e){
				new Notice("React Component Folder Not Found!")
			}
		}
	}

	async onload() {
		this.codeBlocks = new Map();
		this.components = {};
		await this.loadSettings();
		let registerIfCodeBlockFile = (file)=>{if(this.settings.template_folder!="" && file.parent.path.startsWith(this.settings.template_folder)){this.registerCodeBlock(file)}}
		this.app.metadataCache.on('changed', registerIfCodeBlockFile)
		this.app.metadataCache.on('resolve', registerIfCodeBlockFile)
		this.app.workspace.on('layout-ready', ()=>this.loadCodeBlocks())
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

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		
		new Setting(containerEl)
			.setName("Components folder location")
			.setDesc("Files in this folder will be available as code blocks.")
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
