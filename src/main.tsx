import { MarkdownPostProcessorContext, normalizePath, Plugin, TFile } from 'obsidian';
import OfflineReact from 'react';
import OfflineReactDOM from 'react-dom';
import { DEFAULT_SETTINGS, ReactComponentsSettings, ReactComponentsSettingTab } from './settings';
import { ParentAndChild } from './parentAndChild';
import { registerCodeProcessor } from './preview';
import { registerHeaderProcessor } from './header';
import { refreshPanes } from './workspace_utils';
import { unpatchSanitization } from './htmlRendering';
import { awaitFilesLoaded, getPropertyValue } from './fileUtils';
import { clearComponentNamespace, NamespaceObject } from './namespaces';
import { importFromUrl } from './urlImport';
import { registerComponents } from './componentRegistry';
import { requestComponentUpdate, setupComponentRendering, unloadComponentRendering } from './componentRendering';
import { refreshComponentScope } from './scope';
import { ReactComponentContextData } from './reactComponentContext';

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
    mutationObserver: MutationObserver;
    componentsWaitingToLoad: Map<string, string>; // dom ids for all containers to which react should render. 

    async setupReact() {
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
    }

    async loadComponents() {
        try {
            await awaitFilesLoaded();
            for (const file of ReactComponentsPlugin.instance.app.vault.getMarkdownFiles()) {
                await registerComponents(file, true);
            }
            await refreshComponentScope();
            await requestComponentUpdate();
        } catch (e) {}
    }

    async onload() {
        ReactComponentsPlugin.instance = this;
        await this.setupReact();
        await this.loadSettings();

        this.ReactComponentContext = this.React.createContext<ReactComponentContextData>(null);

        await setupComponentRendering();

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
        await this.loadComponents();

        this.addCommand({
            id: 'refresh-react-components',
            name: 'Refresh React Components',
            callback: async () => {
                clearComponentNamespace();
                await this.loadComponents();
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
        registerCodeProcessor();
        registerHeaderProcessor();
        this.app.workspace.onLayoutReady(async () => refreshPanes());
    }

    unload() {
        unpatchSanitization();
        unloadComponentRendering();
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
