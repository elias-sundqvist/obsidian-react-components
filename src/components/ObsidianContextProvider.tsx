import { MarkdownPostProcessorContext, TFile } from 'obsidian';
import { GLOBAL_NAMESPACE } from 'src/constants';
import { getPropertyValue } from 'src/fileUtils';
import { generateReactComponentContext } from 'src/reactComponentContext';
import ReactComponentsPlugin from '../main';
import { CodeRenderer } from './CodeRenderer';

export const ObsidianContextProvider = ({
    ctx,
    generateCode
}: {
    ctx?: MarkdownPostProcessorContext;
    generateCode: (ctx: MarkdownPostProcessorContext) => string;
}) => {
    const React = ReactComponentsPlugin.instance.React;
    const code = generateCode(ctx);
    const namespace =
        getPropertyValue(
            'react-components-namespace',
            ReactComponentsPlugin.instance.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile
        ) ?? GLOBAL_NAMESPACE;
    const contextData = generateReactComponentContext(ctx);
    return (
        <ReactComponentsPlugin.instance.ReactComponentContext.Provider value={contextData}>
            <CodeRenderer code={code} namespace={namespace} randomKey={Math.random()} />
        </ReactComponentsPlugin.instance.ReactComponentContext.Provider>
    );
};
