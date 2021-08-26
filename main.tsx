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
import OfflineReact from 'react';
import OfflineReactDOM from 'react-dom';
import Babel from '@babel/standalone';
import isVarName from 'is-var-name';
import reactToWebComponent from './react-webcomponent';

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

const DEFAULT_SETTINGS: ReactComponentsSettings = {
    template_folder: '',
    auto_refresh: true
};

interface ReactComponentsSettings {
    template_folder: string;
    auto_refresh: boolean;
}

export default class ReactComponentsPlugin extends Plugin {
    settings: ReactComponentsSettings;
    codeBlocks: Map<string, () => string>;
    components: Record<string, (any) => JSX.Element> = {};
    webComponents: Record<string, string>;
    React: typeof OfflineReact;
    ReactDOM: typeof OfflineReactDOM;
    noteHeaderComponent: (any) => JSX.Element = () => {
        const React = this.React;
        return <></>;
    };

    ReactComponentContext: OfflineReact.Context<ReactComponentContextData>;
    Markdown = ({ src }: { src: string }) => {
        const React = this.React;
        const { useContext, useRef, useEffect } = React;
        const ctx = useContext(this.ReactComponentContext);
        const containerRef = useRef<HTMLElement>();
        useEffect(() => {
            containerRef.current.innerHTML = '';
            MarkdownRenderer.renderMarkdown(
                src,
                containerRef.current,
                ctx.markdownPostProcessorContext.sourcePath,
                null
            );
        }, [ctx, src]);
        return <span ref={containerRef}></span>;
    };

    ErrorComponent = ({ componentName, error }: { componentName: string; error: Error }) => {
        const React = this.React;
        return (
            <span style={{ color: 'red' }}>
                {`Error in component "${componentName}": ${error.toString()}`}
                <button onClick={() => console.error(error)}>Show In Console</button>
            </span>
        );
    };

    // eslint-disable-next-line react/display-name
    webComponentBase = tagName => props => {
        const React = this.React;
        const { useState, useEffect } = React;
        const setRefresh = useState<number>()[1];
        const [component, setComponent] = useState<string>();

        const Component = component ? this.components[component] : () => <h1>Nothing Here Yet</h1>;

        useEffect(() => {
            setComponent(this.webComponents[tagName]);
            this.app.workspace.on('react-components:component-updated', () => {
                setComponent(this.webComponents[tagName]);
                setRefresh(Math.random());
            });
        }, []);

        const context = this.generateReactComponentContext(null);
        return (
            <this.ReactComponentContext.Provider value={context}>
                <Component {...props} />
            </this.ReactComponentContext.Provider>
        );
    };

    getScope() {
        const React = this.React;
        const ReactDOM = this.ReactDOM;
        const { useState, useEffect, useContext, useCallback, useMemo, useReducer, useRef } = React;
        const useIsPreview = () => {
            const ctx = useContext(this.ReactComponentContext);
            return (
                ctx.markdownPostProcessorContext.containerEl
                    .closest('.workspace-leaf-content')
                    .getAttribute('data-mode') === 'preview'
            );
        };

        const scope = {
            Markdown: this.Markdown,
            ReactComponentContext: this.ReactComponentContext,
            pluginInternalNoteHeaderComponent: this.noteHeaderComponent,
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
        return Babel.transform(content, {
            presets: [
                Babel.availablePresets['react'],
                [
                    Babel.availablePresets['typescript'],
                    {
                        onlyRemoveTypeImports: true,
                        allExtensions: true,
                        isTSX: true
                    }
                ]
            ]
        }).code;
    }

    // evaluated code inherits the scope of the current function
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async evalAdapter(code: string, scope = this.getScope()) {
        const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;

        const evaluated = (await this.importFromUrl(encodedCode)).default(scope, this.transpileCode.bind(this));
        if (typeof evaluated == 'function') {
            return (...args) => {
                try {
                    return evaluated(...args);
                } catch (e) {
                    return this.ErrorComponent({ componentName: 'evaluated code', error: e });
                }
            };
        } else {
            return evaluated;
        }
    }

    registerWebComponent(componentTag: string) {
        try {
            customElements.define(
                componentTag,
                reactToWebComponent(this.webComponentBase(componentTag), this.React, this.ReactDOM)
            );
        } catch (e) {}
    }

    wrapCode(content: string) {
        const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
        const imports = [];
        content = content.replaceAll(importsRegexp, match => {
            imports.push(match.trim());
            return '';
        });
        return `${imports.join('\n')}\nexport default scope=>props=>{\n${this.getScopeExpression()}\n${content}}`;
    }

    wrapInNoteCode(content: string) {
        const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
        const imports = [];
        content = content.replaceAll(importsRegexp, match => {
            imports.push(match.trim());
            return '';
        });
        return `${imports.join(
            '\n'
        )}\nexport default (scope, transpile)=>{\n${this.getScopeExpression()}\n return eval(transpile(JSON.parse(${JSON.stringify(
            JSON.stringify(content)
        )})))}`;
    }

    removeFrontMatter(stringWithFrontMatter: string): string {
        return stringWithFrontMatter.replace(/^---$(.|\n)+?^---$\n/gm, '');
    }

    async registerComponent(file: TFile, suppressComponentRefresh = false) {
        if (file.extension != 'md') {
            new Notice(`"${file.basename}.${file.extension}" is not a markdown file`);
            return;
        }

        if (!isVarName(file.basename)) {
            new Notice(`"${file.basename}" is not a valid function name`);
            return;
        }

        let content = await this.app.vault.read(file);
        content = this.removeFrontMatter(content);
        const frontmatter = this.app.metadataCache.getFileCache(file).frontmatter;

        if (frontmatter?.['web-component']) {
            const componentTag = frontmatter['web-component'].trim();
            const wasRegistered = !!this.webComponents[componentTag];
            this.webComponents[componentTag] = file.basename;
            if (!wasRegistered) {
                this.registerWebComponent(componentTag);
            }
        }

        const code = () => this.wrapCode(content);
        const codeString = code();
        if (!(this.codeBlocks.has(file.basename) && this.codeBlocks.get(file.basename)() == codeString)) {
            this.codeBlocks.set(file.basename, code);
            await this.refreshComponentScope();
            if (this.settings.auto_refresh && !suppressComponentRefresh) {
                this.app.workspace.trigger('react-components:component-updated');
            }
        }
        try {
            this.components[file.basename] = await this.evalAdapter(
                this.transpileCode(this.codeBlocks.get(file.basename)())
            );
        } catch (e) {
            this.components[file.basename] = () => this.ErrorComponent({ componentName: file.basename, error: e });
        }
        if (frontmatter?.['use-as-note-header']) {
            if (this.noteHeaderComponent != this.components[file.basename]) {
                this.noteHeaderComponent = this.components[file.basename];
                this.app.workspace.trigger('react-components:component-updated');
            }
        }
    }

    async refreshComponentScope() {
        for (const [name, codef] of this.codeBlocks) {
            try {
                this.components[name] = await this.evalAdapter(this.transpileCode(codef()));
            } catch (e) {
                this.components[name] = () => this.ErrorComponent({ componentName: name, error: e });
            }
        }
    }

    async awaitFilesLoaded() {
        let len: number;
        do {
            len = this.app.vault.getAllLoadedFiles().length;
            await new Promise(r => setTimeout(r, 500));
        } while (len != this.app.vault.getAllLoadedFiles().length);
    }

    async loadComponents() {
        this.codeBlocks = new Map();
        this.components = {};
        this.webComponents = {};
        if (this.settings.template_folder.trim() == '') {
            new Notice('Cannot Load react components unless directory is set');
        } else {
            try {
                await this.awaitFilesLoaded();
                const files = this.getTFilesFromFolder(this.settings.template_folder);
                for (const file of files) {
                    await this.registerComponent(file, true);
                }
                await this.refreshComponentScope();
                this.app.workspace.trigger('react-components:component-updated');
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
        const tryRender = async () => {
            const React = this.React;
            try {
                const context = this.generateReactComponentContext(ctx);
                const evaluated = await this.evalAdapter(this.transpileCode(this.wrapInNoteCode(source)));
                this.ReactDOM.render(
                    <this.ReactComponentContext.Provider value={context}>
                        {evaluated}
                    </this.ReactComponentContext.Provider>,
                    el
                );
            } catch (e) {
                this.ReactDOM.render(<this.ErrorComponent componentName={source} error={e} />, el);
            }
        };
        await tryRender();
        const evRef = this.app.workspace.on('react-components:component-updated', async () => {
            if (el && document.contains(el)) {
                await tryRender();
            } else {
                this.app.workspace.offref(evRef);
            }
        });
    }

    importFromUrl(url: string): Promise<{ default }> {
        const importf = eval(`x=>import(x)`);
        return importf(url);
    }

    async onload() {
        try {
            this.React = (await this.importFromUrl('https://cdn.skypack.dev/react')).default;
            this.ReactDOM = (await this.importFromUrl('https://cdn.skypack.dev/react-dom')).default;
        } catch (e) {
            console.log('Failed to load online react package. Skypack react imports may not work.');
            this.React = OfflineReact;
            this.ReactDOM = OfflineReactDOM;
            console.log('Error:', e);
        }
        await this.loadSettings();
        this.ReactComponentContext = this.React.createContext<ReactComponentContextData>(null);
        await this.loadComponents();
        const registerIfCodeBlockFile = file => {
            if (
                file instanceof TFile &&
                this.settings.template_folder != '' &&
                file.parent.path.startsWith(this.settings.template_folder)
            ) {
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
        this.registerEvent(this.app.vault.on('create', registerIfCodeBlockFile));
        this.registerEvent(this.app.vault.on('modify', registerIfCodeBlockFile));
        this.registerEvent(this.app.vault.on('rename', registerIfCodeBlockFile));
        this.registerEvent(this.app.metadataCache.on('changed', registerIfCodeBlockFile));
        this.registerEvent(this.app.metadataCache.on('resolve', registerIfCodeBlockFile));
        this.registerEvent(this.app.workspace.on('layout-ready', () => this.loadComponents()));
        this.addSettingTab(new ReactComponentsSettingTab(this));
        this.registerCodeBlockProcessor();
        this.registerInlineCodeProcessor();
        this.registerHeaderProcessor();
        this.refreshPanes();
    }

    registerHeaderProcessor() {
        this.registerMarkdownPostProcessor(async (_, ctx) => {
            if (!ctx.containerEl?.hasClass('markdown-preview-section')) {
                return;
            }
            const container = document.createElement('div');
            container.addClass('reactHeaderComponent');
            const viewContainer = ctx.containerEl.parentElement;
            const existingHeaders = [...viewContainer?.getElementsByClassName('reactHeaderComponent')];
            existingHeaders.forEach(banner => {
                this.ReactDOM.unmountComponentAtNode(banner);
                banner.remove();
            });
            viewContainer?.insertBefore(container, ctx.containerEl);
            this.attachComponent(
                'const HeaderComponent = pluginInternalNoteHeaderComponent; <HeaderComponent/>',
                container,
                ctx
            );
        });
    }

    registerCodeBlockProcessor() {
        this.registerMarkdownCodeBlockProcessor('jsx-', this.attachComponent.bind(this));
    }

    registerInlineCodeProcessor() {
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
    }

    refreshPanes() {
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            if (leaf.getViewState().state.mode.includes('preview'))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (leaf.view as any).previewMode.rerender(true);
        });
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

class ReactComponentsSettingTab extends PluginSettingTab {
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
