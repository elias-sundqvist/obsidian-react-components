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

const CodeBlockSymbol = Symbol();
const NamespaceNameSymbol = Symbol();

type NamespaceObject = {
    [k: string]: NamespaceObject | ((any) => JSX.Element);
    [CodeBlockSymbol]?: Map<string, () => string> | null;
    [NamespaceNameSymbol]?: string;
};

export default class ReactComponentsPlugin extends Plugin {
    settings: ReactComponentsSettings;
    namespaceRoot: NamespaceObject;
    webComponents: Record<string, string>;
    React: typeof OfflineReact;
    ReactDOM: typeof OfflineReactDOM;
    renderedHeaderMap: WeakMap<Element, MarkdownPostProcessorContext> = new WeakMap();

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
                <button
                    onClick={() =>
                        setTimeout(() => {
                            throw error;
                        }, 1)
                    }>
                    Show In Console
                </button>
            </span>
        );
    };

    // eslint-disable-next-line react/display-name
    webComponentBase = tagName => props => {
        const React = this.React;
        const { useState, useEffect } = React;
        const setRefresh = useState<number>()[1];
        const [component, setComponent] = useState<string>();
        const namespaceObject = this.getNamespaceObject('Global');
        const possibleComponent = namespaceObject[component];
        const Component = typeof possibleComponent == 'function' ? possibleComponent : () => <h1>Nothing Here Yet</h1>;

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

    getScope(namespace: string) {
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
        const addDynamicReferences = (namespaceObject: NamespaceObject) => {
            for (const componentName of Object.keys(namespaceObject)) {
                if (scope[componentName] || !isVarName(componentName)) continue;
                Object.defineProperty(scope, componentName, {
                    get: function () {
                        return namespaceObject[componentName];
                    },
                    enumerable: true
                });
            }
        };

        addDynamicReferences(this.getNamespaceObject(namespace));
        addDynamicReferences(this.getNamespaceObject('Global'));
        addDynamicReferences(this.namespaceRoot);

        return scope;
    }

    getNamespaceObject(namespace: string): NamespaceObject {
        let namespaceObject = this.namespaceRoot;
        namespace
            .trim()
            .split('.')
            .forEach(c => {
                let next = namespaceObject?.[c.trim()];
                if (typeof next == 'function') {
                    namespaceObject = null;
                } else if (next) {
                    namespaceObject = next;
                } else {
                    next = {} as NamespaceObject;
                    namespaceObject[c.trim()] = next;
                    namespaceObject = next;
                }
            });
        if (!namespaceObject[CodeBlockSymbol]) {
            namespaceObject[CodeBlockSymbol] = new Map();
            namespaceObject[NamespaceNameSymbol] = namespace;
        }
        return namespaceObject;
    }

    getScopeExpression(namespace: string) {
        const scope = this.getScope(namespace);
        return (
            Object.keys(scope)
                .sort()
                .map(k => `let ${k}=scope.${k};`)
                .join('\n') + '\n'
        );
    }

    getPropertyValue(propertyName: string, file: TFile) {
        const dataViewPropertyValue = (this.app as any)?.plugins?.plugins?.dataview?.api // eslint-disable-line
            ?.page(file.path)?.[propertyName];
        if (dataViewPropertyValue) {
            if (dataViewPropertyValue.path) {
                return this.app.metadataCache.getFirstLinkpathDest(dataViewPropertyValue.path, file.path).path;
            }
            const externalLinkMatch = /^\[.*\]\((.*)\)$/gm.exec(dataViewPropertyValue)?.[1];
            if (externalLinkMatch) {
                return externalLinkMatch;
            }
            return dataViewPropertyValue;
        } else {
            const cache = this.app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.[propertyName];
        }
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
    async evalAdapter(code: string, namespace: string) {
        const scope = this.getScope(namespace);
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

    wrapCode(content: string, namespace: string) {
        const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
        const imports = [];
        content = content.replaceAll(importsRegexp, match => {
            imports.push(match.trim());
            return '';
        });
        return `${imports.join('\n')}\nexport default scope=>props=>{\n${this.getScopeExpression(
            namespace
        )}\n${content}}`;
    }

    wrapInNoteCode(content: string, namespace: string) {
        const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
        const imports = [];
        content = content.replaceAll(importsRegexp, match => {
            imports.push(match.trim());
            return '';
        });
        return `${imports.join('\n')}\nexport default (scope, transpile)=>{\n${this.getScopeExpression(
            namespace
        )}\n return eval(transpile(JSON.parse(${JSON.stringify(JSON.stringify(content))})))}`;
    }

    removeFrontMatter(stringWithFrontMatter: string): string {
        return stringWithFrontMatter.replace(/^---$(.|\n)+?^---$\n/gm, '');
    }

    async registerComponents(file: TFile, suppressComponentRefresh = false) {
        if (file.extension != 'md') {
            new Notice(`"${file.basename}.${file.extension}" is not a markdown file`);
            return;
        }

        if (this.getPropertyValue('defines-react-components', file)) {
            await this.registerCodeBlockComponents(file, suppressComponentRefresh);
        } else if (file.path.startsWith(normalizePath(this.settings.template_folder))) {
            await this.registerFullFileComponent(file, suppressComponentRefresh);
        }
    }

    getMatches(regex: RegExp, str: string) {
        let m: RegExpExecArray;
        const res: RegExpExecArray[] = [];
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            res.push(m);
        }
        return res;
    }

    async registerCodeBlockComponents(file: TFile, suppressComponentRefresh = false) {
        const content = await this.app.vault.read(file);
        const nameSpace = this.getPropertyValue('react-components-namespace', file) || 'Global';

        const matches = this.getMatches(/^\s*?```jsx:component:(.*)\n((.|\n)*?)\n^\s*?```$/gm, content);
        for (const match of matches) {
            const [componentName] = match[1].split(':').map(x => x.trim());
            if (!isVarName(componentName)) continue;
            const componentCode = match[2];
            await this.registerComponent(componentCode, componentName, nameSpace, suppressComponentRefresh);
        }
    }

    async registerFullFileComponent(file: TFile, suppressComponentRefresh = false) {
        if (!isVarName(file.basename)) {
            new Notice(`"${file.basename}" is not a valid function name`);
            return;
        }

        let content = await this.app.vault.read(file);
        content = this.removeFrontMatter(content);

        const webComponentPropertyValue = this.getPropertyValue('web-component', file);

        if (webComponentPropertyValue) {
            const componentTag = webComponentPropertyValue.trim();
            const wasRegistered = !!this.webComponents[componentTag];
            this.webComponents[componentTag] = file.basename;
            if (!wasRegistered) {
                this.registerWebComponent(componentTag);
            }
        }
        const namespace = 'Global';

        await this.registerComponent(content, file.basename, namespace, suppressComponentRefresh);

        const namespaceObject = this.getNamespaceObject(namespace);

        const useAsNoteHeaderPropertyValue = this.getPropertyValue('use-as-note-header', file);
        if (useAsNoteHeaderPropertyValue) {
            const newNoteHeaderComponent = namespaceObject[file.basename];
            if (this.noteHeaderComponent != newNoteHeaderComponent && typeof newNoteHeaderComponent == 'function') {
                this.noteHeaderComponent = newNoteHeaderComponent;
                this.app.workspace.trigger('react-components:component-updated');
            }
        }
    }

    async registerComponent(content: string, componentName: string, componentNamespace, suppressComponentRefresh) {
        const code = () => this.wrapCode(content, componentNamespace);
        const codeString = code();
        const namespaceObject = this.getNamespaceObject(componentNamespace);
        const codeBlocks = namespaceObject[CodeBlockSymbol];
        if (!(codeBlocks.has(componentName) && codeBlocks.get(componentName)() == codeString)) {
            codeBlocks.set(componentName, code);
            await this.refreshComponentScope();
            if (this.settings.auto_refresh && !suppressComponentRefresh) {
                this.app.workspace.trigger('react-components:component-updated');
            }
        }
        try {
            namespaceObject[componentName] = await this.evalAdapter(
                this.transpileCode(namespaceObject[CodeBlockSymbol].get(componentName)()),
                componentNamespace
            );
        } catch (e) {
            namespaceObject[componentName] = () => this.ErrorComponent({ componentName, error: e });
        }
    }

    async refreshComponentScope() {
        const refreshNamespaceObject = async (namespaceObject: NamespaceObject) => {
            for (const name of Object.keys(namespaceObject)) {
                if (typeof name !== 'string') continue;
                const value = namespaceObject[name];
                if (typeof value === 'function') {
                    const codef = namespaceObject[CodeBlockSymbol].get(name);
                    try {
                        namespaceObject[name] = await this.evalAdapter(
                            this.transpileCode(codef()),
                            namespaceObject[NamespaceNameSymbol]
                        );
                    } catch (e) {
                        namespaceObject[name] = () => this.ErrorComponent({ componentName: name, error: e });
                    }
                } else {
                    refreshNamespaceObject(value);
                }
            }
        };
        refreshNamespaceObject(this.namespaceRoot);
    }

    async awaitFilesLoaded() {
        let len: number;
        do {
            len = this.app.vault.getAllLoadedFiles().length;
            await new Promise(r => setTimeout(r, 500));
        } while (len != this.app.vault.getAllLoadedFiles().length);
    }

    async loadComponents() {
        this.namespaceRoot = {};
        this.webComponents = {};
        try {
            await this.awaitFilesLoaded();
            for (const file of this.app.vault.getMarkdownFiles()) {
                await this.registerComponents(file, true);
            }
            await this.refreshComponentScope();
            this.app.workspace.trigger('react-components:component-updated');
        } catch (e) {}
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
                const namespace =
                    this.getPropertyValue(
                        'react-components-namespace',
                        this.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile
                    ) ?? 'Global';
                const context = this.generateReactComponentContext(ctx);
                const evaluated = await this.evalAdapter(
                    this.transpileCode(this.wrapInNoteCode(source, namespace)),
                    namespace
                );
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
        await tryRender.bind(this)();
        const evRef = this.app.workspace.on('react-components:component-updated', async () => {
            console.log('Reacted to event:', 'react-components:component-updated');
            if (el && document.contains(el)) {
                await tryRender.bind(this)();
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
                ((this.settings.template_folder != '' &&
                    file.parent.path.startsWith(normalizePath(this.settings.template_folder))) ||
                    this.getPropertyValue('defines-react-components', file))
            ) {
                this.registerComponents(file);
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
        this.registerEvent(this.app.vault.on('create', registerIfCodeBlockFile.bind(this)));
        this.registerEvent(this.app.vault.on('modify', registerIfCodeBlockFile.bind(this)));
        this.registerEvent(this.app.vault.on('rename', registerIfCodeBlockFile.bind(this)));
        this.registerEvent(this.app.metadataCache.on('changed', registerIfCodeBlockFile.bind(this)));
        this.registerEvent(this.app.metadataCache.on('resolve', registerIfCodeBlockFile.bind(this)));
        this.registerEvent(
            this.app.metadataCache.on('dataview:metadata-change', (...args) => {
                registerIfCodeBlockFile(args[1]);
            })
        );
        this.registerEvent(this.app.workspace.on('layout-ready', () => this.loadComponents()));
        this.addSettingTab(new ReactComponentsSettingTab(this));
        this.registerCodeProcessor();
        this.registerHeaderProcessor();
        this.refreshPanes();
    }

    registerHeaderProcessor() {
        this.registerMarkdownPostProcessor(async (_, ctx) => {
            if (!ctx.containerEl?.hasClass('markdown-preview-section')) {
                return;
            }
            const viewContainer = ctx.containerEl.parentElement;
            const existingHeader = viewContainer?.getElementsByClassName('reactHeaderComponent')?.[0];
            const previousContext = this.renderedHeaderMap.get(existingHeader);
            if (!previousContext || previousContext != ctx) {
                if (existingHeader) {
                    this.ReactDOM.unmountComponentAtNode(existingHeader);
                    existingHeader.remove();
                }
                const container = document.createElement('div');
                container.addClasses(['reactHeaderComponent', 'markdown-preview-sizer', 'markdown-preview-section']);
                this.renderedHeaderMap.set(container, ctx);
                viewContainer?.insertBefore(container, ctx.containerEl);
                this.attachComponent(
                    'const HeaderComponent = pluginInternalNoteHeaderComponent; <HeaderComponent/>',
                    container,
                    ctx
                );
            }
        });
    }

    registerCodeProcessor() {
        this.registerMarkdownPostProcessor(async (el, ctx) => {
            const codeblocks = el.querySelectorAll('code');
            const toReplace = [];
            for (let index = 0; index < codeblocks.length; index++) {
                const codeblock = codeblocks.item(index);
                if (codeblock.className == 'language-jsx:' || codeblock.className == 'language-jsx-') {
                    const source = codeblock.innerText;
                    toReplace.push({ codeblock: codeblock.parentNode, source });
                } else {
                    const text = codeblock.innerText.trim();
                    if (text.startsWith('jsx-') || text.startsWith('jsx:')) {
                        const source = text.substring('jsx-'.length).trim();
                        toReplace.push({ codeblock, source });
                    }
                }
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
