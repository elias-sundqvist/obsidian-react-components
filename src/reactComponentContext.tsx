import { MarkdownPostProcessorContext } from 'obsidian';

export type ReactComponentContextData = {
    markdownPostProcessorContext: MarkdownPostProcessorContext;
};

export function generateReactComponentContext(ctx: MarkdownPostProcessorContext): ReactComponentContextData {
    return {
        markdownPostProcessorContext: ctx
    };
}
