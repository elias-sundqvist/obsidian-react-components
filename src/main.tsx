import { MarkdownPostProcessorContext, normalizePath, Plugin, TFile } from 'obsidian';
import OfflineReact from 'react';
import OfflineReactDOM from 'react-dom';
import { DEFAULT_SETTINGS, ReactComponentsSettings, ReactComponentsSettingTab } from './settings';
import { ParentAndChild } from './parentAndChild';
import { RootComponent } from './components/RootComponent';
import { registerCodeProcessor } from './preview';
import { registerHeaderProcessor } from './header';
import { refreshPanes } from './workspace_utils';
import { patchSanitization, unpatchSanitization } from './htmlRendering';
import {
    attachComponent,
    clearComponentNamespace,
    importFromUrl,
    loadComponents,
    NamespaceObject,
    ReactComponentContextData,
    registerComponents,
    requestComponentUpdate
} from './core';
import { getPropertyValue } from './fileUtils';
import { getLivePostprocessor } from './livePreview';

export default class ReactComponentsPlugin extends Plugin {
    static instance: ReactComponentsPlugin = null;
    settings: ReactComponentsSettings;
    namespaceRoot: NamespaceObject = {};
    React: typeof OfflineReact;
    ReactDOM: typeof OfflineReactDOM;
    renderedHeaderMap: WeakMap<Element, MarkdownPostProcessorContext> = new WeakMap();
    refreshTimeoutId?: NodeJS.Timeout;

    ReactComponentContext: OfflineReact.Context<ReactComponentContextData>;

    reactRoot: HTMLDivElement;
    addComponentToRender: (
        component: () => OfflineReact.FunctionComponentElement<any>,
        parentAndChild: ParentAndChild
    ) => void;
    cleanUpComponents: () => void;
    removeComponentAtElement: (el: Element) => void;
    updateAllComponents: () => void;
    elementJsxElemMap: WeakMap<HTMLElement, OfflineReact.FunctionComponentElement<any>>;
    elementJsxFuncMap: WeakMap<HTMLElement, () => OfflineReact.FunctionComponentElement<any>>;

    async onload() {
        ReactComponentsPlugin.instance = this;
        try {
            this.React = (await importFromUrl('https://cdn.skypack.dev/react')).default;
            this.ReactDOM = (await importFromUrl('https://cdn.skypack.dev/react-dom')).default;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log('Failed to load online react package. Skypack react imports may not work.');
            this.React = OfflineReact;
            this.ReactDOM = OfflineReactDOM;
            // eslint-disable-next-line no-console
            console.log('Error:', e);
        }

        this.reactRoot = document.createElement('div');
        const React = this.React;
        this.elementJsxElemMap = new WeakMap<HTMLElement, OfflineReact.FunctionComponentElement<any>>();
        this.elementJsxFuncMap = new WeakMap<HTMLElement, () => OfflineReact.FunctionComponentElement<any>>();

        this.ReactDOM.render(<RootComponent />, this.reactRoot);

        await this.loadSettings();
        if (this.settings.patch_html_rendering) {
            patchSanitization();
        }
        this.ReactComponentContext = this.React.createContext<ReactComponentContextData>(null);

        const registerIfCodeBlockFile = file => {
            if (
                file instanceof TFile &&
                ((this.settings.template_folder != '' &&
                    file.parent.path.startsWith(normalizePath(this.settings.template_folder))) ||
                    this.settings.all_files_define_components ||
                    getPropertyValue('defines-react-components', file))
            ) {
                registerComponents(file);
            }
        };

        this.registerEvent(this.app.vault.on('create', registerIfCodeBlockFile));
        this.registerEvent(this.app.vault.on('modify', registerIfCodeBlockFile));
        this.registerEvent(this.app.vault.on('rename', registerIfCodeBlockFile));
        this.registerEvent(this.app.metadataCache.on('changed', registerIfCodeBlockFile));
        this.registerEvent(this.app.metadataCache.on('resolve', registerIfCodeBlockFile));
        this.registerEvent(
            this.app.metadataCache.on('dataview:metadata-change', (...args) => {
                registerIfCodeBlockFile(args[1]);
            })
        );
        await loadComponents();

        this.addCommand({
            id: 'refresh-react-components',
            name: 'Refresh React Components',
            callback: async () => {
                clearComponentNamespace();
                await loadComponents();
                requestComponentUpdate();
            }
        });
        this.addCommand({
            id: 'cleanup-react-components',
            name: 'Clean Up React Components',
            callback: async () => {
                this.cleanUpComponents?.();
            }
        });
        this.addSettingTab(new ReactComponentsSettingTab(this));

        try {
            if (this.settings.live_preview) {
                this.registerMarkdownCodeBlockProcessor('jsx', async (source, el, ctx) => {
                    const closestLeaf = ctx.containerEl.closest('.workspace-leaf-content') as HTMLElement;
                    if (closestLeaf && closestLeaf.dataset['mode'] === 'source' && !el.closest('.cm-line')) {
                        el.innerHTML = '';
                    } else {
                        attachComponent(`<Markdown src={${JSON.stringify('```tsx\n' + source + '\n```')}}/>`, el, ctx);
                    }
                });

                const ext = getLivePostprocessor();
                this.registerEditorExtension(ext);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log('obsidian-react-components: Could not enable live preview. See error below.');
            console.error(e);
        }
        registerCodeProcessor();
        registerHeaderProcessor();
        this.app.workspace.onLayoutReady(async () => refreshPanes());
    }

    unload() {
        unpatchSanitization();
        if (this.reactRoot) {
            this.ReactDOM.unmountComponentAtNode(this.reactRoot);
        }
        ReactComponentsPlugin.instance = null;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
