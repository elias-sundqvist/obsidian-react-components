import { attachComponent } from './componentRendering';
import ReactComponentsPlugin from './main';

let noteHeaderComponent = any => {
    const React = ReactComponentsPlugin.instance.React;
    return <></>;
};

export const getNoteHeaderComponent = () => noteHeaderComponent;
export const setNoteHeaderComponent = newNoteHeaderComponent => {
    noteHeaderComponent = newNoteHeaderComponent;
};

export function registerHeaderProcessor() {
    const plugin = ReactComponentsPlugin.instance;
    plugin.registerMarkdownPostProcessor(async (_, ctx) => {
        if (!ctx.sourcePath || (!ctx.containerEl?.hasClass('markdown-preview-section'))) {
            return;
        }
        const viewContainer = ctx.containerEl.parentElement;
        const existingHeader = viewContainer?.getElementsByClassName('reactHeaderComponent')?.[0];
        const previousContext = plugin.renderedHeaderMap.get(existingHeader);
        if (!previousContext || previousContext != ctx) {
            if (existingHeader) {
                plugin.removeComponentAtElement(existingHeader);
                existingHeader.remove();
            }
            const container = document.createElement('div');
            container.addClasses(['reactHeaderComponent', 'markdown-preview-sizer', 'markdown-preview-section']);
            plugin.renderedHeaderMap.set(container, ctx);
            viewContainer?.insertBefore(container, ctx.containerEl);
            attachComponent(
                'const HeaderComponent = pluginInternalNoteHeaderComponent; <HeaderComponent/>',
                container,
                ctx
            );
        }
    });
}
