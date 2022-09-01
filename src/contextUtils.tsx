import { MarkdownPostProcessorContext } from 'obsidian';
import ReactComponentsPlugin from './main';

export function getDocumentAssociatedWithElement(el: HTMLElement) {
    try {
        const file = ((a = []) => {
            ReactComponentsPlugin.instance.app.workspace.iterateAllLeaves(x => {
                if ((x as any)?.containerEl.contains(el) && x?.view?.file) {
                    a.push(x.view.file);
                }
            });
            return a;
        })()?.[0];
        return file;
    } catch (e) {
        console.log(e);
    }
}

export function getMarkdownPostProcessorContextAssociatedWithElement(el: HTMLElement) {
    const file = getDocumentAssociatedWithElement(el);
    if (file) {
        const context: MarkdownPostProcessorContext = {
            docId: null,
            sourcePath: file?.path || '',
            frontmatter: null,
            addChild: null,
            getSectionInfo: null
        };
        return context;
    }
}
