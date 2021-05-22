import {
    MarkdownPostProcessorContext,
    MarkdownRenderer,
    normalizePath,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    TFolder,
    Vault
} from 'obsidian';
import * as obsidian from 'obsidian';
import React, { useEffect, useState, useCallback, useContext, useMemo, useReducer, useRef, createContext } from 'react';
import ReactDOM from 'react-dom';
import Babel from '@babel/standalone';
import ReactPreset from '@babel/preset-react';
import isVarName from 'is-var-name';

declare module 'obsidian' {
    interface Workspace {
        on(name: 'react-components:component-updated', callback: () => void): EventRef;
    }

    interface MarkdownPostProcessorContext {
        containerEl?: HTMLElement;
    }
}

type ReactComponentContextData = {
    markdownPostProcessorContext: MarkdownPostProcessorContext;
};

const ReactComponentContext = createContext<ReactComponentContextData>(null);
const Markdown = ({ src }: { src: string }) => {
    const ctx = useContext(ReactComponentContext);
    const containerRef = useRef<HTMLElement>();
    useEffect(() => {
        containerRef.current.innerHTML = '';
        MarkdownRenderer.renderMarkdown(src, containerRef.current, ctx.markdownPostProcessorContext.sourcePath, null);
    }, [ctx, src]);
    return <span ref={containerRef}></span>;
};

const DEFAULT_SETTINGS: ReactBlocksSettings = {
    template_folder: '',
    auto_refresh: true
};

interface ReactBlocksSettings {
    template_folder: string;
    auto_refresh: boolean;
}

const ErrorComponent = ({ componentName, error }: { componentName: string; error: Error }) => (
    <span style={{ color: 'red' }}>
        {`Error in component "${componentName}": ${error.toString()}`}
        <button onClick={() => console.error(error)}>Show In Console</button>
    </span>
);

export default class ReactBlocksPlugin extends Plugin {
    settings: ReactBlocksSettings;
    codeBlocks: Map<string, () => string>;
    components: Record<string, (any) => JSX.Element> = {};

    getScope() {
        const useIsPreview = () => {
            const ctx = useContext(ReactComponentContext);
            return (
                ctx.markdownPostProcessorContext.containerEl
                    .closest('.workspace-leaf-content')
                    .getAttribute('data-mode') === 'preview'
            );
        };

        const scope = {
            Markdown,
            ReactComponentContext,
            React,
            ReactDOM,
            useState,
            useEffect,
            useCallback,
            useContext,
            useMemo,
            useReducer,
            useRef,
            useIsPreview,
            obsidian
        };
        // Prevent stale component references
        const components = this.components;
        for (const componentName of Object.keys(components)) {
            Object.defineProperty(scope, componentName, {
                get: function () {
                    return components[componentName];
                },
                enumerable: true
            });
        }
        return scope;
    }

    getScopeExpression(scope = this.getScope()) {
        return (
            Object.keys(scope)
                .sort()
                .map(k => `let ${k}=scope.${k};`)
                .join('\n') + '\n'
        );
    }

    transpileCode(content: string) {
        return Babel.transform(content, { presets: [ReactPreset] }).code;
    }

    // evaluated code inherits the scope of the current function
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    evalAdapter(code: string, scope = this.getScope()) {
        const evaluated = eval(code);
        if (typeof evaluated == 'function') {
            return (...args) => {
                try {
                    return evaluated(...args);
                } catch (e) {
                    return e.toString();
                }
            };
        } else {
            return evaluated;
        }
    }

    async registerComponent(file: TFile) {
        if (file.extension != 'md') {
            new Notice(`"${file.basename}.${file.extension}" is not a markdown file`);
            return;
        }

        if (!isVarName(file.basename)) {
            new Notice(`"${file.basename}" is not a valid function name`);
            return;
        }

        const content = await this.app.vault.read(file);
        const code = () => `props=>{\n${this.getScopeExpression()}\n${content}}`;
        const codeString = code();
        if (!(this.codeBlocks.has(file.basename) && this.codeBlocks.get(file.basename)() == codeString)) {
            this.codeBlocks.set(file.basename, code);
            this.refreshComponentScope();
            if (this.settings.auto_refresh) {
                this.app.workspace.trigger('react-components:component-updated');
            }
        }
        try {
            this.components[file.basename] = this.evalAdapter(this.transpileCode(this.codeBlocks.get(file.basename)()));
        } catch (e) {
            this.components[file.basename] = () => ErrorComponent({ componentName: file.basename, error: e });
        }
    }

    refreshComponentScope() {
        for (const [name, codef] of this.codeBlocks) {
            try {
                this.components[name] = this.evalAdapter(this.transpileCode(codef()));
            } catch (e) {
                this.components[name] = () => ErrorComponent({ componentName: name, error: e });
            }
        }
    }

    async loadComponents() {
        this.components = {};
        if (this.settings.template_folder.trim() == '') {
            new Notice('Cannot Load react components unless directory is set');
        } else {
            try {
                const files = this.getTFilesFromFolder(this.settings.template_folder);
                for (const file of files) {
                    await this.registerComponent(file);
                }
                this.refreshComponentScope();
                if (this.settings.auto_refresh) {
                    this.app.workspace.trigger('react-components:component-updated');
                }
            } catch (e) {
                new Notice('React Component Folder Not Found!');
            }
        }
    }

    generateReactComponentContext(ctx: MarkdownPostProcessorContext): ReactComponentContextData {
        return {
            markdownPostProcessorContext: ctx
        };
    }

    async attachComponent(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const tryRender = () => {
            try {
                const context = this.generateReactComponentContext(ctx);
                const expr = `${this.getScopeExpression()}\n${source}`;
                const evaluated = this.evalAdapter(this.transpileCode(expr));
                ReactDOM.render(
                    <ReactComponentContext.Provider value={context}>{evaluated}</ReactComponentContext.Provider>,
                    el
                );
            } catch (e) {
                ReactDOM.render(<ErrorComponent componentName={source} error={e} />, el);
            }
        };
        tryRender();
        const evRef = this.app.workspace.on('react-components:component-updated', () => {
            if (el && document.contains(el)) {
                tryRender();
            } else {
                this.app.workspace.offref(evRef);
            }
        });
    }

    async onload() {
        await this.loadSettings();
        await this.loadComponents();
        this.codeBlocks = new Map();
        const registerIfCodeBlockFile = file => {
            if (this.settings.template_folder != '' && file.parent.path.startsWith(this.settings.template_folder)) {
                this.registerComponent(file);
            }
        };
        this.addCommand({
            id: 'refresh-react-components',
            name: 'Refresh React Components',
            callback: async () => {
                await this.loadComponents();
                this.app.workspace.trigger('react-components:component-updated');
            }
        });
        this.registerEvent(this.app.metadataCache.on('changed', registerIfCodeBlockFile));
        this.registerEvent(this.app.metadataCache.on('resolve', registerIfCodeBlockFile));
        this.registerEvent(this.app.workspace.on('layout-ready', () => this.loadComponents()));
        this.registerMarkdownCodeBlockProcessor('jsx-', this.attachComponent.bind(this));
        this.registerMarkdownPostProcessor(async (el, ctx) => {
            const codeblocks = el.querySelectorAll('code');
            const toReplace = [];
            for (let index = 0; index < codeblocks.length; index++) {
                const codeblock = codeblocks.item(index);

                const text = codeblock.innerText.trim();
                if (!text.startsWith('jsx-')) continue;

                const source = text.substring('jsx-'.length).trim();
                toReplace.push({ codeblock, source });
            }
            toReplace.forEach(({ codeblock, source }) => {
                const container = document.createElement('span');
                codeblock.replaceWith(container);
                this.attachComponent(source, container, ctx);
            });
        });
        this.addSettingTab(new ReactBlocksSettingTab(this));
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

    getTFilesFromFolder(folder_str: string): Array<TFile> {
        folder_str = normalizePath(folder_str);

        const folder = this.app.vault.getAbstractFileByPath(folder_str);
        if (!folder) {
            throw new Error(`${folder_str} folder doesn't exist`);
        }
        if (!(folder instanceof TFolder)) {
            throw new Error(`${folder_str} is a file, not a folder`);
        }

        const files: Array<TFile> = [];
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
}

class ReactBlocksSettingTab extends PluginSettingTab {
    plugin: ReactBlocksPlugin;

    constructor(plugin: ReactBlocksPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Obsidian React Components Settings' });

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
