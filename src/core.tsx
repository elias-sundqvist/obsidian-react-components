import { MarkdownPostProcessorContext, normalizePath, Notice, TFile } from 'obsidian';
import * as obsidian from 'obsidian';
import isVarName from 'is-var-name';
import { CodeBlockSymbol, GLOBAL_NAMESPACE, NamespaceNameSymbol } from './constants';
import { ErrorComponent } from './components/ErrorComponent';
import { ObsidianContextProvider } from './components/ObsidianContextProvider';
import ReactComponentsPlugin from './main';
import { awaitFilesLoaded, getPropertyValue } from './fileUtils';
import { Markdown } from './components/Markdown';
import Babel from '@babel/standalone';
import { getMatches } from './regex_utils';
import { getNoteHeaderComponent, setNoteHeaderComponent } from './header';

export type NamespaceObject = {
    [k: string]: NamespaceObject | ((any) => JSX.Element);
    [CodeBlockSymbol]?: Map<string, () => string> | null;
    [NamespaceNameSymbol]?: string;
};

export type ReactComponentContextData = {
    markdownPostProcessorContext: MarkdownPostProcessorContext;
};

export async function registerComponent(
    content: string,
    componentName: string,
    componentNamespace,
    suppressComponentRefresh
) {
    const code = () => wrapCode(content, componentNamespace);

    const codeString = code();
    const namespaceObject = getNamespaceObject(componentNamespace);
    const codeBlocks = namespaceObject[CodeBlockSymbol];
    if (!(codeBlocks.has(componentName) && codeBlocks.get(componentName)() == codeString)) {
        codeBlocks.set(componentName, code);
        await refreshComponentScope();
        if (ReactComponentsPlugin.instance.settings.auto_refresh && !suppressComponentRefresh) {
            requestComponentUpdate();
        }
    }
    try {
        namespaceObject[componentName] = await evalAdapter(
            transpileCode(namespaceObject[CodeBlockSymbol].get(componentName)()),
            componentNamespace
        );
    } catch (e) {
        namespaceObject[componentName] = () => ErrorComponent({ componentName, error: e });
    }
}

export async function refreshComponentScope() {
    const refreshNamespaceObject = async (namespaceObject: NamespaceObject) => {
        for (const name of Object.keys(namespaceObject)) {
            if (typeof name !== 'string') continue;
            const value = namespaceObject[name];
            if (typeof value === 'function') {
                const codef = namespaceObject[CodeBlockSymbol].get(name);
                try {
                    namespaceObject[name] = await evalAdapter(
                        transpileCode(codef()),
                        namespaceObject[NamespaceNameSymbol]
                    );
                } catch (e) {
                    namespaceObject[name] = () => ErrorComponent({ componentName: name, error: e });
                }
            } else {
                await refreshNamespaceObject(value);
            }
        }
    };
    await refreshNamespaceObject(ReactComponentsPlugin.instance.namespaceRoot);
}

export function transpileCode(content: string) {
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
export async function evalAdapter(code: string, namespace: string) {
    const scope = getScope(namespace);
    const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    let evaluated = null;
    try {
        evaluated = (await importFromUrl(encodedCode)).default(
            scope,
            transpileCode.bind(ReactComponentsPlugin.instance)
        );
    } catch (e) {
        return ErrorComponent({ componentName: 'evaluated code', error: e });
    }

    if (typeof evaluated == 'function') {
        return (...args) => {
            try {
                return evaluated(...args);
            } catch (e) {
                return ErrorComponent({ componentName: 'evaluated code', error: e });
            }
        };
    } else {
        return evaluated;
    }
}

export function wrapCode(content: string, namespace: string) {
    const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
    const imports = [];
    content = content.replaceAll(importsRegexp, match => {
        imports.push(match.trim());
        return '';
    });
    return `${imports.join('\n')}\nexport default scope=>props=>{\n${getScopeExpression(namespace)}\n${content}}`;
}

export function wrapInNoteCode(content: string, namespace: string) {
    const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
    const imports = [];
    content = content.replaceAll(importsRegexp, match => {
        imports.push(match.trim());
        return '';
    });
    return `${imports.join('\n')}\nexport default (scope, transpile)=>{\n${getScopeExpression(
        namespace
    )}\n return eval(transpile(JSON.parse(${JSON.stringify(JSON.stringify(content))})))}`;
}

export function removeFrontMatter(stringWithFrontMatter: string): string {
    return stringWithFrontMatter.replace(/^---$(.|\r?\n)+?^---$\r?\n/gm, '');
}

export async function registerComponents(file: TFile, suppressComponentRefresh = false) {
    if (file.extension != 'md') {
        new Notice(`"${file.basename}.${file.extension}" is not a markdown file`);
        return;
    }

    if (getPropertyValue('defines-react-components', file)) {
        await registerCodeBlockComponents(file, suppressComponentRefresh);
    } else if (file.path.startsWith(normalizePath(ReactComponentsPlugin.instance.settings.template_folder))) {
        await registerFullFileComponent(file, suppressComponentRefresh);
    }
}

export async function registerCodeBlockComponents(file: TFile, suppressComponentRefresh = false) {
    const content = await ReactComponentsPlugin.instance.app.vault.read(file);
    const nameSpace = getPropertyValue('react-components-namespace', file) || GLOBAL_NAMESPACE;

    const matches = getMatches(/^\s*?```jsx:component:(.*)\r?\n((.|\r?\n)*?)\r?\n^\s*?```$/gm, content);

    for (const match of matches) {
        const [componentName] = match[1].split(':').map(x => x.trim());
        if (!isVarName(componentName)) continue;
        const componentCode = match[2];
        await registerComponent(componentCode, componentName, nameSpace, suppressComponentRefresh);
    }
}

export async function registerFullFileComponent(file: TFile, suppressComponentRefresh = false) {
    if (!isVarName(file.basename)) {
        new Notice(`"${file.basename}" is not a valid function name`);
        return;
    }

    let content = await ReactComponentsPlugin.instance.app.vault.read(file);
    content = removeFrontMatter(content);

    const namespace = GLOBAL_NAMESPACE;

    await registerComponent(content, file.basename, namespace, suppressComponentRefresh);

    const namespaceObject = getNamespaceObject(namespace);

    const useAsNoteHeaderPropertyValue = getPropertyValue('use-as-note-header', file);
    if (useAsNoteHeaderPropertyValue) {
        const newNoteHeaderComponent = namespaceObject[file.basename];
        if (getNoteHeaderComponent() != newNoteHeaderComponent && typeof newNoteHeaderComponent == 'function') {
            setNoteHeaderComponent(newNoteHeaderComponent);
            requestComponentUpdate();
        }
    }
}

export async function attachComponent(source: string, el: HTMLElement, ctx?: MarkdownPostProcessorContext) {
    const React = ReactComponentsPlugin.instance.React;
    class ErrorBoundary extends React.Component<any, { hasError: boolean; error: Error }> {
        constructor(props) {
            super(props);
            this.state = { hasError: false, error: null };
        }

        static getDerivedStateFromError(error) {
            // Update state so the next render will show the fallback UI.
            return { hasError: true, error };
        }

        render() {
            if (this.state.hasError) {
                // You can render any custom fallback UI
                return <ErrorComponent componentName={source} error={this.state.error} />;
            }
            return this.props.children;
        }
    }
    const container = document.createElement('span');
    el.replaceChildren(container);
    ReactComponentsPlugin.instance.addComponentToRender(
        () => (
            <ErrorBoundary>
                <ObsidianContextProvider
                    ctx={ctx}
                    generateCode={ctx => {
                        const namespace =
                            getPropertyValue(
                                'react-components-namespace',
                                ReactComponentsPlugin.instance.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile
                            ) ?? GLOBAL_NAMESPACE;

                        return transpileCode(wrapInNoteCode(source, namespace));
                    }}
                />
            </ErrorBoundary>
        ),
        { parent: el, child: container }
    );
}

export function generateReactComponentContext(ctx: MarkdownPostProcessorContext): ReactComponentContextData {
    return {
        markdownPostProcessorContext: ctx
    };
}

export function importFromUrl(url: string): Promise<{ default }> {
    const importf = eval(`x=>import(x)`);
    return importf(url);
}

export function getScope(namespace: string) {
    const React = ReactComponentsPlugin.instance.React;
    const ReactDOM = ReactComponentsPlugin.instance.ReactDOM;
    const { useState, useEffect, useContext, useCallback, useMemo, useReducer, useRef } = React;
    const useIsPreview = () => {
        const ctx = useContext(ReactComponentsPlugin.instance.ReactComponentContext);
        return (
            ctx.markdownPostProcessorContext.containerEl
                .closest('.workspace-leaf-content')
                .getAttribute('data-mode') === 'preview'
        );
    };

    const scope = {
        Markdown: Markdown,
        ReactComponentContext: ReactComponentsPlugin.instance.ReactComponentContext,
        pluginInternalNoteHeaderComponent: getNoteHeaderComponent(),
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

    addDynamicReferences(getNamespaceObject(namespace));
    addDynamicReferences(getNamespaceObject(GLOBAL_NAMESPACE));
    addDynamicReferences(ReactComponentsPlugin.instance.namespaceRoot);

    return scope;
}

export function getNamespaceObject(namespace: string): NamespaceObject {
    let namespaceObject = ReactComponentsPlugin.instance.namespaceRoot;
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

export function getScopeExpression(namespace: string) {
    const scope = getScope(namespace);
    return (
        Object.keys(scope)
            .sort()
            .map(k => `let ${k}=scope.${k};`)
            .join('\n') + '\n'
    );
}

export async function loadComponents() {
    try {
        await awaitFilesLoaded();
        for (const file of ReactComponentsPlugin.instance.app.vault.getMarkdownFiles()) {
            await registerComponents(file, true);
        }
        await refreshComponentScope();
        await requestComponentUpdate();
    } catch (e) {}
}

export function clearComponentNamespace() {
    ReactComponentsPlugin.instance.namespaceRoot = {};
}

export async function requestComponentUpdate() {
    if (ReactComponentsPlugin.instance.refreshTimeoutId !== null) {
        clearTimeout(ReactComponentsPlugin.instance.refreshTimeoutId);
    }
    // Only rerender after no new request has been made for 2 seconds.
    ReactComponentsPlugin.instance.refreshTimeoutId = setTimeout(() => {
        console.log('updating all components');
        ReactComponentsPlugin.instance.updateAllComponents?.();
    }, 2000);
}
