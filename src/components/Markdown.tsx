import { MarkdownRenderer, TFile } from 'obsidian';
import ReactComponentsPlugin from 'src/main';

export const Markdown = ({ src, maxDepth = 10 }: { src: string; maxDepth: number }) => {
    const plugin = ReactComponentsPlugin.instance;
    const React = plugin.React;
    const { useContext, useRef, useEffect } = React;
    const ctx = useContext(plugin.ReactComponentContext);
    const containerRef = useRef<HTMLElement>();
    useEffect(() => {
        containerRef.current.innerHTML = '';
        MarkdownRenderer.renderMarkdown(
            src,
            containerRef.current,
            ctx.markdownPostProcessorContext.sourcePath,
            null
        );
        const patchEmbeds = (el: HTMLElement, filePath: string, depth: number) => {
            if (depth > maxDepth) return;
            [...el.findAll('.internal-embed')].forEach(async el => {
                const src = el.getAttribute('src');
                const target =
                    typeof src === 'string' && plugin.app.metadataCache.getFirstLinkpathDest(src, filePath);
                if (target instanceof TFile) {
                    el.innerText = '';
                    switch (target.extension) {
                        case 'md':
                            el.innerHTML = `<div class="markdown-embed"><div class="markdown-embed-title">${target.basename}</div><div class="markdown-embed-content node-insert-event markdown-embed-page"><div class="markdown-preview-view"></div></div><div class="markdown-embed-link" aria-label="Open link"><svg viewBox="0 0 100 100" class="link" width="20" height="20"><path fill="currentColor" stroke="currentColor" d="M74,8c-4.8,0-9.3,1.9-12.7,5.3l-10,10c-2.9,2.9-4.7,6.6-5.1,10.6C46,34.6,46,35.3,46,36c0,2.7,0.6,5.4,1.8,7.8l3.1-3.1 C50.3,39.2,50,37.6,50,36c0-3.7,1.5-7.3,4.1-9.9l10-10c2.6-2.6,6.2-4.1,9.9-4.1s7.3,1.5,9.9,4.1c2.6,2.6,4.1,6.2,4.1,9.9 s-1.5,7.3-4.1,9.9l-10,10C71.3,48.5,67.7,50,64,50c-1.6,0-3.2-0.3-4.7-0.8l-3.1,3.1c2.4,1.1,5,1.8,7.8,1.8c4.8,0,9.3-1.9,12.7-5.3 l10-10C90.1,35.3,92,30.8,92,26s-1.9-9.3-5.3-12.7C83.3,9.9,78.8,8,74,8L74,8z M62,36c-0.5,0-1,0.2-1.4,0.6l-24,24 c-0.5,0.5-0.7,1.2-0.6,1.9c0.2,0.7,0.7,1.2,1.4,1.4c0.7,0.2,1.4,0,1.9-0.6l24-24c0.6-0.6,0.8-1.5,0.4-2.2C63.5,36.4,62.8,36,62,36 z M36,46c-4.8,0-9.3,1.9-12.7,5.3l-10,10c-3.1,3.1-5,7.2-5.2,11.6c0,0.4,0,0.8,0,1.2c0,4.8,1.9,9.3,5.3,12.7 C16.7,90.1,21.2,92,26,92s9.3-1.9,12.7-5.3l10-10C52.1,73.3,54,68.8,54,64c0-2.7-0.6-5.4-1.8-7.8l-3.1,3.1 c0.5,1.5,0.8,3.1,0.8,4.7c0,3.7-1.5,7.3-4.1,9.9l-10,10C33.3,86.5,29.7,88,26,88s-7.3-1.5-9.9-4.1S12,77.7,12,74 c0-3.7,1.5-7.3,4.1-9.9l10-10c2.6-2.6,6.2-4.1,9.9-4.1c1.6,0,3.2,0.3,4.7,0.8l3.1-3.1C41.4,46.6,38.7,46,36,46L36,46z"></path></svg></div></div>`;
                            const previewEl = el.getElementsByClassName('markdown-preview-view')[0] as HTMLElement;
                            MarkdownRenderer.renderMarkdown(
                                await plugin.app.vault.cachedRead(target),
                                previewEl,
                                target.path,
                                null
                            );
                            await patchEmbeds(previewEl, target.path, depth + 1);
                            el.addClasses(['is-loaded']);
                            break;
                        default:
                            el.createEl('img', { attr: { src: plugin.app.vault.getResourcePath(target) } }, img => {
                                if (el.hasAttribute('width')) img.setAttribute('width', el.getAttribute('width'));
                                if (el.hasAttribute('alt')) img.setAttribute('alt', el.getAttribute('alt'));
                            });
                            el.addClasses(['image-embed', 'is-loaded']);
                            break;
                    }
                }
            });
        };
        patchEmbeds(containerRef.current, ctx.markdownPostProcessorContext.sourcePath, 1);
    }, [ctx, src]);
    return <span ref={containerRef}></span>;
};
