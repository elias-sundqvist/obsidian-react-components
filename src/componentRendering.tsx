import { MarkdownPostProcessorContext, TFile } from 'obsidian';
import OfflineReact from 'react';
import { wrapInNoteCode } from './codePostProcessing';
import { transpileCode } from './codeTranspliation';
import { ErrorComponent } from './components/ErrorComponent';
import { ObsidianContextProvider } from './components/ObsidianContextProvider';
import { RootComponent } from './components/RootComponent';
import { GLOBAL_NAMESPACE } from './constants';
import { getPropertyValue } from './fileUtils';
import { patchSanitization } from './htmlRendering';
import { getLivePostprocessor } from './livePreview';
import ReactComponentsPlugin from './main';

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

export async function setupComponentRendering() {
    const plugin = ReactComponentsPlugin.instance;
    plugin.reactRoot = document.createElement('div');
    const React = plugin.React;
    plugin.elementJsxElemMap = new WeakMap<HTMLElement, OfflineReact.FunctionComponentElement<any>>();
    plugin.elementJsxFuncMap = new WeakMap<HTMLElement, () => OfflineReact.FunctionComponentElement<any>>();

    plugin.ReactDOM.render(<RootComponent />, plugin.reactRoot);

    if (plugin.settings.patch_html_rendering) {
        patchSanitization();
    }
    try {
        if (plugin.settings.live_preview) {
            plugin.registerMarkdownCodeBlockProcessor('jsx', async (source, el, ctx) => {
                const closestLeaf = ctx.containerEl.closest('.workspace-leaf-content') as HTMLElement;
                if (closestLeaf && closestLeaf.dataset['mode'] === 'source' && !el.closest('.cm-line')) {
                    el.innerHTML = '';
                } else {
                    attachComponent(`<Markdown src={${JSON.stringify('```tsx\n' + source + '\n```')}}/>`, el, ctx);
                }
            });

            const ext = getLivePostprocessor();
            plugin.registerEditorExtension(ext);
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.log('obsidian-react-components: Could not enable live preview. See error below.');
        console.error(e);
    }
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
