import { MarkdownPostProcessorContext, TFile } from 'obsidian';
import { GLOBAL_NAMESPACE } from 'src/constants';
import { getPropertyValue } from 'src/fileUtils';
import { generateReactComponentContext } from 'src/reactComponentContext';
import ReactComponentsPlugin from '../main';
import { CodeRenderer } from './CodeRenderer';

export const ObsidianContextProvider = ({ ctx, generateCode }: {ctx?: MarkdownPostProcessorContext, generateCode: (ctx: MarkdownPostProcessorContext)=>string}) => {
        const React = ReactComponentsPlugin.instance.React;
        const [context, setContext] = React.useState<MarkdownPostProcessorContext>(ctx);
        const divRef = React.useRef<HTMLDivElement>();

        ReactComponentsPlugin.instance.React.useEffect(() => {
            (async () => {
                for (let i = 0; i < 1000; i++) {
                    try {
                        const file = ((a = []) => {
                            ReactComponentsPlugin.instance.app.workspace.iterateAllLeaves(x => {
                                if ((x as any)?.containerEl.contains(divRef.current) && x?.view?.file) {
                                    a.push(x.view.file);
                                }
                            });
                            return a;
                        })()?.[0];
                        if (file) {
                            const context: MarkdownPostProcessorContext = {
                                docId: null,
                                sourcePath: file?.path || '',
                                frontmatter: null,
                                addChild: null,
                                getSectionInfo: null
                            };
                            return setContext(context);
                        }
                        await new Promise(r => setTimeout(r, 50));

                    } catch(e) {
                        console.log(e)
                    } 
                }
            })();
        }, []);
        if (!context) {
            return <span ref={divRef}>Loading context....</span>;
        } else {
            const code = generateCode(context);
            const namespace = getPropertyValue(
                    'react-components-namespace',
                    ReactComponentsPlugin.instance.app.vault.getAbstractFileByPath(context.sourcePath) as TFile
                ) ?? GLOBAL_NAMESPACE;
            const contextData = generateReactComponentContext(context);
            return <ReactComponentsPlugin.instance.ReactComponentContext.Provider value={contextData}>
            <CodeRenderer code={code} namespace={namespace} randomKey={Math.random()}/>
        </ReactComponentsPlugin.instance.ReactComponentContext.Provider>;
        }
    };
